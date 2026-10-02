// Setor Checklist — fila de clientes a agendar (importada da planilha do sistema interno), WhatsApp com mensagem pronta e controle do resultado.
// O agendamento oficial continua no sistema interno; aqui fica o controle de contato.
import { useRef, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { dataPlanilha, lerXlsx } from "../lib/planilha";
import { fmtDate, fmtDateTime, hojeISO, parseData, primeiroNome, sanitizeWhats } from "../lib/regras";
import { Kpi } from "./Dashboard";
import { Modal } from "../comp/Modal";

export const ETAPA_CK: Record<string, [string, string]> = {
  a_contatar: ["A contatar", "var(--primary)"], aguardando: ["Aguardando resposta", "var(--warn)"], outra_data: ["Pediu outra data", "var(--st-respondida)"],
  em_obras: ["Ambiente em obra", "var(--st-tratativa)"], sem_resposta: ["Sem resposta", "var(--danger)"], agendado: ["Agendado", "var(--st-concluida)"],
  realizado: ["Checklist realizado", "var(--st-concluida)"], desistiu: ["Encerrado sem checklist", "var(--ink-faint)"],
};
export const ck = (c: any) => (c.tratativa && c.tratativa.checklist) || {};
export const etapaCk = (c: any) => ck(c).etapa || (c.status === "concluida" ? "realizado" : "a_contatar");
const hoje = () => hojeISO();
const diasDesde = (iso: any) => (iso ? Math.max(0, Math.floor((Date.now() - +parseData(iso)) / 864e5)) : 0);
// precisa de atenção hoje: nunca contatado, retorno vencido/hoje ou mensagem sem resposta há 2+ dias
export function aFazerHoje(c: any) {
  const e = etapaCk(c), k = ck(c);
  if (c.status === "concluida" || e === "agendado") return false;
  if (e === "a_contatar") return true;
  if (k.retornarEm && String(k.retornarEm).slice(0, 10) <= hoje()) return true;
  return e === "aguardando" && diasDesde(k.ultimoContato) >= 2;
}
const semMedida = (c: any) => !ck(c).medidaOk && !((ck(c).planilha || {}).medidor);
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const dataLonga = (v: string) => { if (!v) return "(data)"; const d = parseData(v); return `${DIAS[d.getDay()]}, ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`; };
const nomeCli = (c: any) => primeiroNome(String(c.cliente || "").toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()));

export const MODELOS: Record<string, string> = { primeiro: "Primeiro contato (com data)", cobranca: "Cliente não respondeu", retorno: "Retorno (obra / outra data)", confirmacao: "Confirmar o agendamento" };
export function mensagemCk(tipo: string, c: any, data: string, remetente: string, medida: boolean) {
  const n = nomeCli(c), num = c.pedido || "—", quando = dataLonga(data);
  const amb = "✅ O ambiente já está pronto para a montagem? (sem obras em andamento, com piso, pintura, gesso, elétrica e demais acabamentos finalizados)\n🚧 Se ainda houver obra ou reforma, qual a previsão de término?\n\nCom o ambiente em obra não conseguimos finalizar o projeto, pois qualquer mudança no local altera as medidas dos móveis.";
  const med = medida ? "\n\n📐 Como ainda não temos a medição do seu ambiente, o nosso setor de Medidas também vai entrar em contato para agendar a conferência das medidas." : "";
  if (tipo === "cobranca") return `Olá, ${n}! Tudo bem? 😊\nAqui é ${remetente}, do setor de Checklist da Aliança Móveis.\n\nPassando para saber se você conseguiu ver minha mensagem sobre a revisão final do seu projeto (venda nº ${num}).\nAinda tenho disponível *${quando}*. Fica bom para você? Se preferir outro dia, é só me dizer.\n\n${amb}${med}`;
  if (tipo === "retorno") return `Olá, ${n}! Tudo bem? 😊\nAqui é ${remetente}, do setor de Checklist da Aliança Móveis.\n\nConforme combinamos, estou retomando o contato sobre a revisão final do seu projeto (venda nº ${num}).\nA obra/reforma do ambiente já foi finalizada? Se sim, tenho disponibilidade para *${quando}*. Fica bom para você?\n\n${amb}${med}`;
  if (tipo === "confirmacao") return `Olá, ${n}! 😊\nAqui é ${remetente}, do setor de Checklist da Aliança Móveis.\n\nConfirmando a revisão final do seu projeto (venda nº ${num}) para *${quando}*.\nLembrando que o ambiente precisa estar pronto para a montagem, sem obras e com os acabamentos finalizados.\n\nQualquer imprevisto, é só me avisar por aqui. Até lá!`;
  return `Olá, ${n}! Tudo bem? 😊\nAqui é ${remetente}, do setor de Checklist da Aliança Móveis.\n\nEstamos dando andamento ao seu projeto de móveis planejados (venda nº ${num}). O próximo passo é a *revisão final do projeto (checklist)*, antes de enviarmos para a fábrica.\n\nTenho disponibilidade para *${quando}*. Esse horário fica bom para você?\n\nPara confirmarmos, preciso saber:\n${amb}${med}\n\nFico no aguardo!`;
}

export default function Checklist() {
  const { R, st, toast, recarregar } = useApp() as any;
  const [f, setF] = useState("hoje"); const [q, setQ] = useState("");
  const [importando, setImportando] = useState(false);
  const arq = useRef<HTMLInputElement>(null);
  const todos = st.chamados.filter((c: any) => c.tipo === "checklist" && R.podeVer(c));
  const abertos = todos.filter((c: any) => c.status !== "concluida");
  const mes = hoje().slice(0, 7);
  const FILTROS: Record<string, [string, (c: any) => boolean]> = {
    hoje: ["Para fazer hoje", aFazerHoje],
    a_contatar: ["A contatar", c => etapaCk(c) === "a_contatar"],
    aguardando: ["Aguardando resposta", c => etapaCk(c) === "aguardando"],
    outra_data: ["Pediu outra data", c => etapaCk(c) === "outra_data"],
    em_obras: ["Em obra", c => etapaCk(c) === "em_obras"],
    sem_resposta: ["Sem resposta", c => etapaCk(c) === "sem_resposta"],
    agendado: ["Agendados", c => etapaCk(c) === "agendado" && c.status !== "concluida"],
    medida: ["Aguardando medida", c => !!ck(c).medidaId && !ck(c).medidaOk && c.status !== "concluida"],
    encerrados: ["Encerrados", c => c.status === "concluida"],
    todos: ["Todos", () => true],
  };
  const cont: Record<string, number> = {}; Object.entries(FILTROS).forEach(([k, [, fn]]) => (cont[k] = todos.filter(fn).length));
  const busca = q.trim().toLowerCase(), dig = q.replace(/\D/g, "");
  let lista = todos.filter(FILTROS[f][1]);
  if (busca) lista = lista.filter((c: any) => String(c.cliente).toLowerCase().includes(busca) || (dig.length >= 3 && (String(c.pedido).includes(dig) || String(c.telefone).includes(dig))));
  const ordem = (c: any) => { const k = ck(c); return String(etapaCk(c) === "agendado" ? k.agendadoPara : k.retornarEm || c.dataVenda || c.criadoEm || ""); };
  lista = lista.slice().sort((a: any, b: any) => ordem(a).localeCompare(ordem(b)));

  async function importar(file: File | undefined) {
    if (!file) return;
    setImportando(true);
    try {
      const linhas = await lerXlsx(file);
      if (!linhas.length) throw new Error("A planilha está vazia");
      if (!("Título" in linhas[0]) || !("Contato" in linhas[0])) throw new Error("Não reconheci a planilha: preciso das colunas “Título” (Venda nº) e “Contato”");
      const dados = linhas.map(l => ({
        numero: l["Título"], cliente: l["Contato"], telefone: l["Telefone 1"], telefone2: l["Telefone 2"], vendedor: l["Vendedor"], medidor: l["Medidor"],
        inclusao: dataPlanilha(l["Inclusão"]).slice(0, 10), agendadoPara: dataPlanilha(l["Data do Agendamento"]).length > 10 ? dataPlanilha(l["Data do Agendamento"]) : (dataPlanilha(l["Data do Agendamento"]) ? dataPlanilha(l["Data do Agendamento"]) + "T00:00" : ""),
        valor: l["Valor Negociado"], minhaVisita: l["Cliente Minha Visita"], situacao: l["Situação"],
        descricao: (l["Descrição"] || "").trim() === "Venda realizada e encaminhada para Checklist" ? "" : l["Descrição"],
      }));
      const r = await A.checklistImportar(dados);
      await recarregar();
      toast(`${r.novos} cliente(s) novo(s) na fila · ${r.ignorados} já estavam no sistema (ignorados)`);
      setF("a_contatar");
    } catch (e: any) { toast(e.message || "Não foi possível importar"); }
    finally { setImportando(false); if (arq.current) arq.current.value = ""; }
  }

  return (
    <section className="view active" id="view-checklist">
      <div className="view-head"><div><h2>Agendar checklist</h2>
        <p>Clientes com venda encaminhada para a revisão do projeto. Chame no WhatsApp com a mensagem pronta e registre o resultado. O agendamento continua sendo lançado no sistema interno.</p></div>
        <div><input ref={arq} type="file" accept=".xlsx" style={{ display: "none" }} onChange={e => importar(e.target.files?.[0])} />
          <button className="btn primary" disabled={importando} onClick={() => arq.current?.click()}>{importando ? "Importando…" : "📥 Importar planilha (.xlsx)"}</button></div></div>
      <div className="kpis" style={{ marginTop: 6 }}>
        <Kpi n={cont.hoje} l="Para fazer hoje" cls={cont.hoje ? "alert" : ""} />
        <Kpi n={cont.a_contatar} l="Ainda não contatados" />
        <Kpi n={cont.aguardando} l="Aguardando resposta" />
        <Kpi n={cont.em_obras + cont.outra_data} l="Em obra / outra data" />
        <Kpi n={cont.agendado} l="Agendados" />
        <Kpi n={todos.filter((c: any) => etapaCk(c) === "realizado" && String(ck(c).realizadoEm || "").slice(0, 7) === mes).length} l="Realizados no mês" />
      </div>
      <div className="card" style={{ padding: "12px 16px", margin: "14px 0" }}>
        <input className="busca" style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, font: "inherit", background: "var(--surface)", color: "var(--ink)" }}
          placeholder="Buscar por nome, nº da venda ou telefone" value={q} onChange={e => setQ(e.target.value)} />
        <div className="chips" style={{ marginTop: 10 }}>{Object.entries(FILTROS).map(([k, [l]]) => <button key={k} className={"chip" + (f === k ? " on" : "")} onClick={() => setF(k)}>{l}<span className="n">{cont[k] || 0}</span></button>)}</div>
      </div>
      {lista.length ? lista.map((c: any) => <CartaoCk key={c.id} c={c} />) : <div className="empty">{todos.length ? "Nenhum cliente neste filtro." : "Nenhum cliente ainda — importe a planilha do sistema interno."}</div>}
      {abertos.length > 0 && <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 10 }}>{abertos.length} checklist(s) em aberto no total.</div>}
    </section>
  );
}

function CartaoCk({ c }: any) {
  const { abrirDetalhe, setModal } = useApp() as any;
  const k = ck(c), p = k.planilha || {}, e = etapaCk(c), [nome, cor] = ETAPA_CK[e] || [e, "var(--line)"];
  const atrasado = k.retornarEm && String(k.retornarEm).slice(0, 10) < hoje() && c.status !== "concluida";
  return (
    <div className="card" style={{ padding: "12px 16px", marginBottom: 10, borderLeft: `5px solid ${cor}` }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{c.cliente} <span style={{ fontWeight: 400, color: "var(--ink-faint)", fontSize: 12.5 }}>· venda {c.pedido}</span></div>
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>
            {[p.vendedor && "vendedor " + p.vendedor, p.medidor ? "medidor " + p.medidor : "sem medidor na planilha", c.dataVenda && "desde " + fmtDate(c.dataVenda) + " (" + diasDesde(c.dataVenda) + "d)", c.telefone && c.telefone].filter(Boolean).join(" · ")}
          </div>
          <div style={{ fontSize: 12.5, marginTop: 5, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="badge" style={{ background: cor, color: "#fff" }}>{nome}</span>
            {e === "agendado" && k.agendadoPara && <b>📅 {fmtDateTime(k.agendadoPara)}</b>}
            {e === "aguardando" && <span>oferecido {fmtDateTime(k.proposta)} · {k.contatos || 1}º contato · há {diasDesde(k.ultimoContato)}d</span>}
            {k.retornarEm && ["outra_data", "em_obras", "sem_resposta"].includes(e) && <span style={atrasado ? { color: "var(--danger)", fontWeight: 600 } : undefined}>retornar em {fmtDate(String(k.retornarEm).slice(0, 10))}</span>}
            {k.medidaId && <span className="pill">{k.medidaOk ? "📐 medidas conferidas" : "📐 aguardando Medidas"}</span>}
          </div>
          {c.motivo && c.motivo !== "Venda encaminhada para o checklist" && <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 4 }}>“{String(c.motivo).slice(0, 160)}”</div>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {c.status !== "concluida" && <button className="btn sm wa" style={{ background: "var(--wa)", color: "#fff", borderColor: "var(--wa)" }} onClick={() => setModal(<ModalWhats c={c} />)}>💬 WhatsApp</button>}
          <button className="btn sm" onClick={() => setModal(<ModalResultado c={c} />)}>{c.status === "concluida" ? "Reabrir" : "Registrar resultado"}</button>
          <button className="btn ghost sm" onClick={() => abrirDetalhe(c.id)}>Ficha</button>
        </div>
      </div>
    </div>
  );
}

const proximoDiaUtil = () => { const d = new Date(); d.setDate(d.getDate() + 1); while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T10:00`; };

export function ModalWhats({ c }: any) {
  const { R, setModal, toast, recarregar } = useApp() as any;
  const k = ck(c), e = etapaCk(c);
  const [tipo, setTipo] = useState(e === "agendado" ? "confirmacao" : e === "aguardando" || e === "sem_resposta" ? "cobranca" : ["em_obras", "outra_data"].includes(e) ? "retorno" : "primeiro");
  const [data, setData] = useState<string>(String((e === "agendado" ? k.agendadoPara : k.proposta) || proximoDiaUtil()).slice(0, 16));
  const [med, setMed] = useState(semMedida(c) && !k.medidaId);
  const tels = [c.telefone, k.telefone2].filter((t: string) => t && t.replace(/\D/g, "").length >= 10);
  const [tel, setTel] = useState(tels[0] || "");
  const rem = primeiroNome(R.me()?.nome || "");
  const [txt, setTxt] = useState(""); const [editado, setEditado] = useState(false);
  const texto = editado ? txt : mensagemCk(tipo, c, data, rem, med);
  const fechar = () => setModal(null);
  async function enviar() {
    const n = sanitizeWhats(tel);
    if (!n) { toast("Cliente sem telefone válido"); return; }
    if (tipo !== "confirmacao" && !data) { toast("Escolha a data e o horário oferecidos"); return; }
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(texto)}`, "_blank");
    try {
      if (tipo === "primeiro" || tipo === "retorno") await A.checklistRegistrar(c.id, { acao: "mensagem", data, precisaMedida: med });
      else if (tipo === "cobranca") await A.checklistRegistrar(c.id, { acao: "cobranca" });
      await recarregar(); fechar(); toast(tipo === "confirmacao" ? "WhatsApp aberto" : "Contato registrado — quando o cliente responder, registre o resultado");
    } catch (x: any) { toast(x.message); }
  }
  return (
    <Modal titulo={"WhatsApp · " + c.cliente} onFechar={fechar}>
      <div className="grid">
        <div className="field"><label>Mensagem</label><select value={tipo} onChange={ev => { setTipo(ev.target.value); setEditado(false); }}>{Object.entries(MODELOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label>{tipo === "confirmacao" ? "Data agendada" : "Data e horário oferecidos"} <span className="req-star">*</span></label><input type="datetime-local" value={data} onChange={ev => { setData(ev.target.value); setEditado(false); }} /></div>
        <div className="field"><label>Telefone</label>{tels.length > 1 ? <select value={tel} onChange={ev => setTel(ev.target.value)}>{tels.map((t: string) => <option key={t} value={t}>{t}</option>)}</select> : <input value={tel} onChange={ev => setTel(ev.target.value)} placeholder="DDD + número" />}</div>
        {tipo !== "confirmacao" && <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" style={{ width: "auto" }} checked={med} onChange={ev => { setMed(ev.target.checked); setEditado(false); }} /><span>Ainda sem medição — avisar que o setor de Medidas vai ligar</span></label>}
        <div className="field full"><label>Texto (pode editar antes de enviar)</label><textarea rows={14} value={texto} onChange={ev => { setTxt(ev.target.value); setEditado(true); }} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn primary" onClick={enviar}>Abrir WhatsApp{tipo === "confirmacao" ? "" : " e registrar o contato"}</button>
        <button className="btn ghost" onClick={fechar}>Cancelar</button>
      </div>
      {med && !k.medidaId && <div className="hint" style={{ marginTop: 10 }}>Depois de enviar, use “Registrar resultado → Precisa de medida” para pedir a conferência ao setor de Medidas.</div>}
    </Modal>
  );
}

const ACOES: Record<string, string> = {
  agendado: "✅ Aceitou — checklist agendado", outra_data: "🔄 Pediu outra data", em_obras: "🚧 Ambiente em obra", sem_resposta: "📵 Não respondeu",
  medida: "📐 Precisa de medida (pedir ao setor de Medidas)", realizado: "☑️ Checklist realizado", desistiu: "⛔ Encerrar sem checklist",
};
export function ModalResultado({ c }: any) {
  const { setModal, toast, recarregar } = useApp() as any;
  const k = ck(c), fechado = c.status === "concluida";
  const [acao, setAcao] = useState(fechado ? "reabrir" : etapaCk(c) === "agendado" ? "realizado" : "agendado");
  const [data, setData] = useState<string>(String(k.proposta || k.agendadoPara || "").slice(0, 16));
  const [ret, setRet] = useState(""); const [pronto, setPronto] = useState(false); const [obs, setObs] = useState("");
  const fechar = () => setModal(null);
  async function salvar() {
    try {
      if (acao === "medida") await A.checklistPedirMedida(c.id, obs);
      else await A.checklistRegistrar(c.id, { acao, data, retornarEm: ret, ambiente: pronto ? "pronto" : "", obs });
      await recarregar(); fechar(); toast("Registrado");
    } catch (x: any) { toast(x.message); }
  }
  return (
    <Modal titulo={"Resultado do contato · " + c.cliente} onFechar={fechar}>
      {fechado ? <p style={{ fontSize: 13.5 }}>Este checklist está encerrado. Reabrir volta o cliente para “A contatar”.</p> :
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {Object.entries(ACOES).filter(([v]) => v !== "medida" || !k.medidaId || k.medidaOk).map(([v, l]) => <label key={v} style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 14 }}><input type="radio" style={{ width: "auto" }} checked={acao === v} onChange={() => setAcao(v)} />{l}</label>)}
        </div>}
      <div className="grid">
        {acao === "agendado" && <>
          <div className="field"><label>Data e horário agendados <span className="req-star">*</span></label><input type="datetime-local" value={data} onChange={e => setData(e.target.value)} /></div>
          <label className="field full" style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" style={{ width: "auto" }} checked={pronto} onChange={e => setPronto(e.target.checked)} /><span>Cliente confirmou que o <b>ambiente está pronto</b> para a montagem (sem obra, acabamentos feitos) <span className="req-star">*</span></span></label>
          <div className="hint full">Ambiente ainda em obra não pode ser finalizado — nesse caso use “Ambiente em obra”. Depois de registrar aqui, lance o agendamento no sistema interno.</div>
        </>}
        {acao === "outra_data" && <>
          <div className="field"><label>Data e horário que o cliente pediu</label><input type="datetime-local" value={data} onChange={e => setData(e.target.value)} /></div>
          <div className="field"><label>Ou: retornar o contato em</label><input type="date" min={hoje()} value={ret} onChange={e => setRet(e.target.value)} /></div>
        </>}
        {acao === "em_obras" && <div className="field"><label>Previsão de fim da obra — retornar em <span className="req-star">*</span></label><input type="date" min={hoje()} value={ret} onChange={e => setRet(e.target.value)} /></div>}
        {acao === "sem_resposta" && <div className="field"><label>Tentar de novo em <span className="hint">(vazio = 2 dias)</span></label><input type="date" min={hoje()} value={ret} onChange={e => setRet(e.target.value)} /></div>}
        <div className="field full"><label>Observação {acao === "desistiu" && <span className="req-star">*</span>}</label><textarea value={obs} onChange={e => setObs(e.target.value)} placeholder={acao === "medida" ? "Ex.: cliente disse que mudou a parede da cozinha" : "O que o cliente disse"} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}><button className="btn primary" onClick={salvar}>{fechado ? "Reabrir" : "Salvar"}</button><button className="btn ghost" onClick={fechar}>Cancelar</button></div>
    </Modal>
  );
}
