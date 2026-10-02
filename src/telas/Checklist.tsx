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
const semMedida = (c: any) => !ck(c).medidaOk && !((ck(c).planilha || {}).medidor) && !((ck(c).planilha || {}).minhaVisita);
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
  const { R, st, toast, recarregar, setModal } = useApp() as any;
  const [f, setF] = useState("hoje"); const [q, setQ] = useState("");
  const [importando, setImportando] = useState(false);
  const arq = useRef<HTMLInputElement>(null);
  const [de, setDe] = useState(""); const [ate, setAte] = useState("");
  // filtro pela data de inclusão (da planilha) — vale para os números, os filtros e a lista
  const todos = st.chamados.filter((c: any) => c.tipo === "checklist" && R.podeVer(c)
    && (!de || (c.dataVenda && String(c.dataVenda).slice(0, 10) >= de)) && (!ate || (c.dataVenda && String(c.dataVenda).slice(0, 10) <= ate)));
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

  const modoImp = useRef<"agendar" | "agendados">("agendar");
  const escolher = (m: "agendar" | "agendados") => { modoImp.current = m; arq.current?.click(); };
  async function importar(file: File | undefined) {
    if (!file) return;
    setImportando(true);
    try {
      const linhas = await lerXlsx(file);
      if (!linhas.length) throw new Error("A planilha está vazia");
      if (!("Título" in linhas[0]) || !("Contato" in linhas[0])) throw new Error("Não reconheci a planilha: preciso das colunas “Título” (Venda nº) e “Contato”");
      const dados = linhas.map(l => ({
        numero: l["Título"], cliente: l["Contato"], telefone: l["Telefone 1"], telefone2: l["Telefone 2"], vendedor: l["Vendedor"], medidor: l["Medidor"],
        inclusao: dataPlanilha(l["Inclusão"]).slice(0, 10), agendadoPara: ((x: string) => x.length > 10 ? x : x ? x + "T00:00" : "")(dataPlanilha(l["Data do Agendamento"])),
        valor: l["Valor Negociado"], cupom: l["Valor dos Cupons"], minhaVisita: l["Cliente Minha Visita"], situacao: l["Situação"],
        descricao: (l["Descrição"] || "").replace(/Venda realizada e encaminhada para Checklist/gi, "").trim(),
      }));
      const comData = dados.filter(d => d.agendadoPara).length;
      if (modoImp.current === "agendados" && !comData) throw new Error("Nenhuma linha com “Data do Agendamento” — essa parece ser a planilha de clientes a agendar");
      if (modoImp.current === "agendar" && comData > dados.length / 2 && !confirm(`${comData} das ${dados.length} linhas já têm data de agendamento — parece a planilha de AGENDADOS. Importar mesmo assim? (os que têm data entram em Agendados)`)) return;
      const r = await A.checklistImportar(dados);
      await recarregar();
      toast(`${r.novos} cliente(s) novo(s)${r.agendados ? " (" + r.agendados + " já agendados)" : ""} · ${r.ignorados} já estavam no sistema (ignorados)`);
      setF(modoImp.current === "agendados" ? "agendado" : "a_contatar");
    } catch (e: any) { toast(e.message || "Não foi possível importar"); }
    finally { setImportando(false); if (arq.current) arq.current.value = ""; }
  }

  return (
    <section className="view active" id="view-checklist">
      <div className="view-head"><div><h2>Agendar checklist</h2>
        <p>Clientes com venda encaminhada para a revisão do projeto. Chame no WhatsApp com a mensagem pronta e registre o resultado. O agendamento continua sendo lançado no sistema interno.</p></div>
        <div><input ref={arq} type="file" accept=".xlsx" style={{ display: "none" }} onChange={e => importar(e.target.files?.[0])} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="btn" onClick={() => setModal(<ModalIncluir />)}>＋ Incluir cliente</button>
          <button className="btn primary" disabled={importando} onClick={() => escolher("agendar")}>{importando ? "Importando…" : "📥 Importar a agendar"}</button>
          <button className="btn primary" disabled={importando} onClick={() => escolher("agendados")}>📅 Importar agendados (aguardando checklist)</button></div></div></div>
      <div className="kpis" style={{ marginTop: 6 }}>
        <Kpi n={cont.hoje} l="Para fazer hoje" cls={cont.hoje ? "alert" : ""} />
        <Kpi n={cont.a_contatar} l="Ainda não contatados" />
        <Kpi n={cont.aguardando} l="Aguardando resposta" />
        <Kpi n={cont.em_obras + cont.outra_data} l="Em obra / outra data" />
        <Kpi n={cont.agendado} l="Agendados" />
        <Kpi n={todos.filter((c: any) => etapaCk(c) === "realizado" && String(ck(c).realizadoEm || "").slice(0, 7) === mes).length} l="Realizados no mês" />
      </div>
      <div className="subnav" style={{ marginTop: 14 }}>
        <button className={f !== "agendado" ? "on" : ""} onClick={() => setF("hoje")}>📋 A agendar</button>
        <button className={f === "agendado" ? "on" : ""} onClick={() => setF("agendado")}>📅 Agendados ({cont.agendado})</button>
      </div>
      <div className="card" style={{ padding: "12px 16px", margin: "14px 0" }}>
        <input className="busca" style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, font: "inherit", background: "var(--surface)", color: "var(--ink)" }}
          placeholder="Buscar por nome, nº da venda ou telefone" value={q} onChange={e => setQ(e.target.value)} />
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
          <div className="field" style={{ minWidth: 150 }}><label>Inclusão de</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
          <div className="field" style={{ minWidth: 150 }}><label>até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
          {(de || ate) && <button className="btn ghost sm" onClick={() => { setDe(""); setAte(""); }}>Limpar datas</button>}
        </div>
        <div className="chips" style={{ marginTop: 10 }}>{Object.entries(FILTROS).map(([k, [l]]) => <button key={k} className={"chip" + (f === k ? " on" : "")} onClick={() => setF(k)}>{l}<span className="n">{cont[k] || 0}</span></button>)}</div>
      </div>
      {f === "agendado" && lista.length > 0 && <div className="hint" style={{ marginBottom: 8 }}>Agenda do checklist — clientes que aceitaram a data (ambiente pronto). Envie a confirmação no WhatsApp e, depois da revisão, marque “Checklist realizado”.</div>}
      {f === "agendado" && lista.length ? Object.entries(lista.reduce((g: any, c: any) => { const d = String(ck(c).agendadoPara || "").slice(0, 10); (g[d] = g[d] || []).push(c); return g; }, {})).map(([d, cs]: any) =>
        <div key={d} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 16, margin: "6px 0 8px", color: d < hoje() ? "var(--danger)" : d === hoje() ? "var(--st-concluida)" : "var(--ink)" }}>
            {d === hoje() ? "HOJE · " : ""}{d ? DIAS[parseData(d).getDay()] + ", " + fmtDate(d) : "Sem data"}{d && d < hoje() ? " — passou: marque como realizado ou reagende" : ""} <span style={{ fontWeight: 400, fontSize: 13, color: "var(--ink-faint)" }}>· {cs.length} cliente(s)</span></div>
          {cs.map((c: any) => <CartaoCk key={c.id} c={c} />)}
        </div>) :
      lista.length ? lista.map((c: any) => <CartaoCk key={c.id} c={c} />) : <div className="empty">{todos.length ? "Nenhum cliente neste filtro." : "Nenhum cliente ainda — importe a planilha do sistema interno."}</div>}
      {R.ehGestao() && lista.length > 1 && <div style={{ marginTop: 12 }}><button className="btn danger sm" onClick={() => setModal(<ConfirmaExcluir ids={lista.map((c: any) => c.id)} rotulo={`os ${lista.length} clientes deste filtro`} forte />)}>🗑 Excluir os {lista.length} clientes deste filtro</button></div>}
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
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        {e === "agendado" && k.agendadoPara && <DataGrande v={k.agendadoPara} />}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{c.cliente} <span style={{ fontWeight: 400, color: "var(--ink-faint)", fontSize: 12.5 }}>· venda {c.pedido}</span></div>
          <DadosCk c={c} />
          <div style={{ fontSize: 12.5, marginTop: 5, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="badge" style={{ background: cor, color: "#fff" }}>{nome}</span>
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
          <button className="btn ghost sm" title="Excluir cliente do checklist" style={{ color: "var(--danger)" }} onClick={() => setModal(<ConfirmaExcluir ids={[c.id]} rotulo={c.cliente + " (venda " + c.pedido + ")"} />)}>🗑</button>
        </div>
      </div>
    </div>
  );
}

// data e hora do checklist em destaque
function DataGrande({ v }: { v: string }) {
  const d = parseData(v), dia = String(v).slice(0, 10), passou = dia < hoje(), ehHoje = dia === hoje();
  const cor = passou ? "var(--danger)" : ehHoje ? "var(--st-concluida)" : "var(--primary)";
  return (
    <div style={{ minWidth: 96, textAlign: "center", borderRadius: 12, padding: "8px 10px", background: cor, color: "#fff", lineHeight: 1.15 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>{ehHoje ? "HOJE" : DIAS[d.getDay()].split("-")[0]}</div>
      <div style={{ fontSize: 26, fontWeight: 800 }}>{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
    </div>
  );
}

// dados do cliente vindos da planilha (ou da inclusão manual)
function DadosCk({ c }: any) {
  const { R, st } = useApp() as any;
  const k = ck(c), p = k.planilha || {};
  const venda = c.vinculadoA ? st.chamados.find((x: any) => x.id === c.vinculadoA) : null;
  const consultor = venda && venda.consultorId ? R.nomeUser(venda.consultorId) : "";
  const tels = [c.telefone, k.telefone2].filter(Boolean);
  const it = (l: string, v: any) => v ? <span><span style={{ color: "var(--ink-faint)" }}>{l}</span> {v}</span> : null;
  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 3, display: "flex", gap: "3px 14px", flexWrap: "wrap" }}>
        {it("Inclusão", c.dataVenda ? fmtDate(c.dataVenda) + " (" + diasDesde(c.dataVenda) + "d)" : "")}
        {it("Status", p.situacao)}
        {it("Vendedor", p.vendedor)}
        {it("Medidor", p.medidor || (p.minhaVisita ? "" : "—"))}
        {it("Cupom", p.cupom)}
        {it("Negociado", p.valor)}
        {it("Tel.", tels.join(" / "))}
      </div>
      {p.minhaVisita && <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 8, background: "var(--st-respondida-bg)", color: "var(--st-respondida)", fontSize: 12.5, fontWeight: 600 }}>
        🏠 Cliente Minha Visita: {p.minhaVisita}{consultor ? " · consultor " + consultor : ""} — o consultor já esteve no local (medidas feitas na visita).
        {String(p.minhaVisita).trim().toLowerCase() !== String(c.cliente).trim().toLowerCase() && " Atenção: nome do orçamento diferente do cliente pagador."}
      </div>}
    </>
  );
}

function ModalIncluir() {
  const { setModal, toast, recarregar } = useApp() as any;
  const [v, setV] = useState<any>({ numero: "", cliente: "", telefone: "", telefone2: "", inclusao: hoje(), situacao: "", vendedor: "", medidor: "", cupom: "", valor: "", minhaVisita: "", descricao: "" });
  const s = (k: string) => (e: any) => setV((x: any) => ({ ...x, [k]: e.target.value }));
  const fechar = () => setModal(null);
  async function salvar() {
    if (!v.numero.replace(/\D/g, "")) { toast("Informe o nº da venda"); return; }
    if (!v.cliente.trim()) { toast("Informe o nome do cliente"); return; }
    if ((v.telefone || v.telefone2).replace(/\D/g, "").length < 10) { toast("Informe o telefone com DDD"); return; }
    try {
      const r = await A.checklistImportar([{ ...v, manual: true }]);
      if (!r.novos) { toast("Já existe um cliente com a venda " + v.numero + " no checklist — nada foi alterado"); return; }
      await recarregar(); fechar(); toast("Cliente incluído no checklist");
    } catch (x: any) { toast(x.message); }
  }
  const F = ({ k, l, req, tipo, full }: any) => <div className={"field" + (full ? " full" : "")}><label>{l}{req && <span className="req-star"> *</span>}</label><input type={tipo || "text"} value={v[k]} onChange={s(k)} /></div>;
  return (
    <Modal titulo="Incluir cliente no checklist" onFechar={fechar}>
      <div className="grid">
        {F({ k: "cliente", l: "Nome do cliente (pagador)", req: true })}{F({ k: "numero", l: "Nº da venda", req: true })}
        {F({ k: "telefone", l: "Telefone 1", req: true })}{F({ k: "telefone2", l: "Telefone 2" })}
        {F({ k: "inclusao", l: "Data de inclusão", tipo: "date" })}{F({ k: "situacao", l: "Status" })}
        {F({ k: "vendedor", l: "Vendedor" })}{F({ k: "medidor", l: "Medidor (se tiver)" })}
        {F({ k: "cupom", l: "Valor do cupom" })}{F({ k: "valor", l: "Valor negociado" })}
        {F({ k: "minhaVisita", l: "Cliente Minha Visita (nome do orçamento)", full: true })}
        <div className="field full"><label>Observação</label><textarea value={v.descricao} onChange={s("descricao")} /></div>
      </div>
      <div className="hint" style={{ marginTop: 8 }}>Se o nº da venda já estiver no checklist, o cliente existente é mantido e nada é alterado.</div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}><button className="btn primary" onClick={salvar}>Incluir</button><button className="btn ghost" onClick={fechar}>Cancelar</button></div>
    </Modal>
  );
}

export function ConfirmaExcluir({ ids, rotulo, forte }: { ids: string[]; rotulo: string; forte?: boolean }) {
  const { setModal, toast, recarregar, fecharDetalhe } = useApp() as any;
  const [txt, setTxt] = useState(""); const [ind, setInd] = useState(false);
  const fechar = () => setModal(null);
  async function excluir() {
    setInd(true);
    try { const n = await A.checklistExcluir(ids); await recarregar(); fechar(); if (fecharDetalhe) fecharDetalhe(); toast(n + " cliente(s) excluído(s) do checklist"); }
    catch (x: any) { toast(x.message); setInd(false); }
  }
  return (
    <Modal titulo="Tem certeza?" onFechar={fechar}>
      <p style={{ fontSize: 14.5, margin: "0 0 10px" }}>Excluir <b>{rotulo}</b> do checklist?</p>
      <p style={{ fontSize: 13, color: "var(--danger)", margin: "0 0 14px" }}>O cliente e todo o histórico de contato dele no checklist serão apagados. Essa ação não pode ser desfeita.</p>
      {forte && <div className="field" style={{ marginBottom: 14 }}><label>Para confirmar, digite EXCLUIR</label><input value={txt} onChange={e => setTxt(e.target.value)} /></div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn danger" style={{ background: "var(--danger)", color: "#fff", borderColor: "var(--danger)" }} disabled={ind || (forte && txt.trim().toUpperCase() !== "EXCLUIR")} onClick={excluir}>{ind ? "Excluindo…" : "Sim, excluir"}</button>
        <button className="btn ghost" onClick={fechar}>Não, voltar</button>
      </div>
    </Modal>
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
      await recarregar(); fechar(); toast(acao === "agendado" ? "Agendado — o cliente foi para 📅 Agendados" : "Registrado");
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
