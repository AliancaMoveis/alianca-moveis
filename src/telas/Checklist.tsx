// Setor Checklist — fila de clientes a agendar (importada da planilha do sistema interno), WhatsApp com mensagem pronta e controle do resultado.
// O agendamento oficial continua no sistema interno; aqui fica o controle de contato.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { dataPlanilha, datasPlanilha, lerXlsx } from "../lib/planilha";
import { fmtDate, fmtDateTime, hojeISO, parseData, primeiroNome, sanitizeWhats } from "../lib/regras";
import { Kpi } from "./Dashboard";
import { Modal } from "../comp/Modal";
import { SeloMedidas } from "./Medidas";

export const ETAPA_CK: Record<string, [string, string]> = {
  a_contatar: ["A contatar", "var(--primary)"], aguardando: ["Mensagem enviada · aguardando resposta", "var(--warn)"], outra_data: ["Aguardando · pediu outra data", "var(--st-respondida)"],
  em_obras: ["Aguardando · obra", "var(--st-tratativa)"], sem_resposta: ["Aguardando · sem resposta", "var(--danger)"], espera: ["Aguardando", "var(--st-tratativa)"],
  agendado: ["Agendado", "var(--st-concluida)"], realizado: ["Checklist realizado", "var(--st-concluida)"], desistiu: ["Encerrado sem checklist", "var(--ink-faint)"],
};
export const MOTIVOS_ESPERA: Record<string, string> = {
  obra: "🚧 Obra / reforma", outra_data: "🔄 Cliente pediu outra data", sem_resposta: "📵 Sem resposta", medida: "📐 Aguardando medida",
  viagem: "✈️ Cliente viajando", financeiro: "💰 Financeiro / pagamento", cliente_pediu: "🙋 Cliente pediu para aguardar", outro: "📝 Outro motivo",
};
export const CONF_CK: Record<string, [string, string]> = { "": ["⏳ Presença a confirmar", "var(--warn)"], enviada: ["📨 Aguardando confirmação de presença", "var(--st-respondida)"], confirmada: ["✅ Presença confirmada", "var(--st-concluida)"] };
export const ck = (c: any) => (c.tratativa && c.tratativa.checklist) || {};
export const etapaCk = (c: any) => ck(c).etapa || (c.status === "concluida" ? "realizado" : "a_contatar");
const hoje = () => hojeISO();
const diasDesde = (iso: any) => (iso ? Math.max(0, Math.floor((Date.now() - +parseData(iso)) / 864e5)) : 0);
const somaDias = (iso: string, n: number) => { const d = parseData(iso); d.setDate(d.getDate() + n); return isoDia(d); };
/** em que parte do checklist o cliente está: a agendar · aguardando (com motivo) · agendado · encerrado */
export function grupoCk(c: any) {
  if (c.status === "concluida") return "encerrado";
  const e = etapaCk(c), k = ck(c);
  if (e === "agendado") return "agendado";
  if (["outra_data", "em_obras", "sem_resposta", "espera"].includes(e) || (k.medidaId && !k.medidaOk)) return "aguardando";
  return "agendar";
}
/** motivo de estar aguardando, em texto */
export function motivoCk(c: any) {
  const e = etapaCk(c), k = ck(c);
  if (e === "espera") return (MOTIVOS_ESPERA[k.motivoEspera] || "Aguardando") + (k.motivoTexto ? " — " + k.motivoTexto : "");
  if (e === "em_obras") return MOTIVOS_ESPERA.obra;
  if (e === "outra_data") return MOTIVOS_ESPERA.outra_data + (k.proposta ? " (" + fmtDateTime(k.proposta) + ")" : "");
  if (e === "sem_resposta") return MOTIVOS_ESPERA.sem_resposta;
  if (k.medidaId && !k.medidaOk) return MOTIVOS_ESPERA.medida;
  return "";
}
const chaveMotivo = (c: any) => { const e = etapaCk(c), k = ck(c); return e === "espera" ? k.motivoEspera || "outro" : e === "em_obras" ? "obra" : e === "outra_data" ? "outra_data" : e === "sem_resposta" ? "sem_resposta" : "medida"; };
const diaAg = (c: any) => String(ck(c).agendadoPara || "").slice(0, 10);
export const aConfirmar = (c: any, dias: number) => grupoCk(c) === "agendado" && !ck(c).confirmacao && diaAg(c) >= hoje() && diaAg(c) <= somaDias(hoje(), dias);
// precisa de atenção hoje: nunca contatado ou mensagem sem resposta há 2+ dias
export function aFazerHoje(c: any) {
  if (grupoCk(c) !== "agendar") return false;
  const e = etapaCk(c), k = ck(c);
  if (e === "a_contatar") return true;
  if (k.retornarEm && String(k.retornarEm).slice(0, 10) <= hoje()) return true;
  return e === "aguardando" && diasDesde(k.ultimoContato) >= 2;
}
const retornoVencido = (c: any) => { const r = ck(c).retornarEm; return !!r && String(r).slice(0, 10) <= hoje(); };
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const dataLonga = (v: string) => { if (!v) return "(data)"; const d = parseData(v); return `${DIAS[d.getDay()]}, ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`; };
const nomeCli = (c: any) => primeiroNome(String(c.cliente || "").toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()));
export const fmtTel = (t: string) => { const d = String(t || "").replace(/\D/g, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d[2]}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : t; };

export const MODELOS: Record<string, string> = { primeiro: "Primeiro contato (com data)", cobranca: "Cliente não respondeu", retorno: "Retorno (obra / outra data)", confirmacao: "Confirmação de presença (agendado)" };
export function mensagemCk(tipo: string, c: any, data: string, remetente: string) {
  const n = nomeCli(c), quando = dataLonga(data);
  const ola = `Olá, ${n}! Tudo bem?\n\nAqui é ${remetente}, da Aliança Móveis.`;
  if (tipo === "cobranca") return `${ola} Estou passando para saber se você viu minha mensagem sobre a revisão final do seu projeto (checklist).\n\nAinda tenho disponível *${quando}*. Fica bom para você? Se preferir outro dia ou horário, é só me dizer.\n\nLembrando que o ambiente precisa estar pronto para a montagem, sem obra e com os acabamentos finalizados.`;
  if (tipo === "retorno") return `${ola} Conforme combinamos, estou retomando o contato sobre a revisão final do seu projeto (checklist).\n\nA obra do ambiente já foi finalizada? Se sim, tenho disponível *${quando}*. Fica bom para você?`;
  if (tipo === "confirmacao") return `${ola} Passando para confirmar a revisão final do seu projeto (checklist), agendada para *${quando}*.\n\nPor favor, responda esta mensagem confirmando a sua presença.\n\nLembrando que o ambiente precisa estar pronto para a montagem, sem obra e com os acabamentos finalizados.\n\nAté lá!`;
  return `${ola} Seu projeto de móveis planejados está na etapa de revisão final (checklist), que fazemos antes de enviar o pedido para a fábrica.\n\nTenho um horário disponível para *${quando}*. Podemos confirmar?\n\nAntes, preciso que você me confirme se o ambiente já está pronto para a montagem: sem obra ou reforma em andamento e com piso, pintura, gesso e elétrica finalizados.\n\nSe ainda estiver em obra, me diga a previsão de término que agendamos para depois. Assim garantimos que as medidas dos móveis fiquem certinhas.\n\nFico no aguardo!`;
}

const ABAS: Record<string, [string, string]> = {
  agendar: ["A agendar", "Clientes para chamar no WhatsApp e agendar. Quem não puder agora vai para “Aguardando”, com o motivo."],
  aguardando: ["Aguardando", "Clientes que ainda não podem agendar: obra, outra data, sem resposta, medida… Cada um com o motivo e a data de retorno."],
  agendados: ["Agendados", "Checklists com data marcada, por dia. Altere, desmarque ou marque como realizado."],
  confirmar: ["Confirmação de presença", "Agendados com data próxima: envie a confirmação pronta e marque quando o cliente confirmar."],
  agenda: ["Agenda do checklist", "A agenda do dia separada por projetista, no formato do sistema interno."],
};

export default function Checklist({ aba = "agendar" }: { aba?: string }) {
  const { R, st, toast, recarregar, setModal } = useApp() as any;
  const cfg = cfgAgenda(st), confDias = cfg.confirmarDias ?? 2;
  const PADRAO: Record<string, string> = { agendar: "hoje", aguardando: "todos", agendados: "proximos", confirmar: "a_confirmar" };
  const [f, setF] = useState(PADRAO[aba] || "todos"); const [q, setQ] = useState("");
  const [importando, setImportando] = useState(false);
  const arq = useRef<HTMLInputElement>(null);
  const [per, setPer] = useState("todos"); const [de, setDe] = useState(""); const [ate, setAte] = useState("");
  // confirmação de presença: filtro pela data do checklist (vale para as três etapas)
  const [diaF, setDiaF] = useState(""); const [diaX, setDiaX] = useState(hojeISO());
  const diaAlvo = diaF === "hoje" ? hojeISO() : diaF === "amanha" ? somaDias(hojeISO(), 1) : diaF === "data" ? diaX : "";
  // período pela data de inclusão (da planilha): todos · deste mês · meses anteriores · data determinada — vale para os números, os filtros e a lista
  const ini = hoje().slice(0, 7) + "-01";
  const noPer = (c: any) => {
    const d = String(c.dataVenda || "").slice(0, 10);
    if (per === "mes") return d >= ini;
    if (per === "anteriores") return !!d && d < ini;
    if (per === "data") return (!de || (!!d && d >= de)) && (!ate || (!!d && d <= ate));
    return true;
  };
  const todos = st.chamados.filter((c: any) => c.tipo === "checklist" && R.podeVer(c) && noPer(c));
  const mes = hoje().slice(0, 7);
  const G = (g: string) => (c: any) => grupoCk(c) === g;
  const FILTROS_ABA: Record<string, Record<string, [string, (c: any) => boolean]>> = {
    agendar: {
      hoje: ["Para fazer hoje", aFazerHoje],
      a_contatar: ["Ainda não contatados", c => G("agendar")(c) && etapaCk(c) === "a_contatar"],
      msg: ["Mensagem enviada · aguardando resposta", c => G("agendar")(c) && etapaCk(c) === "aguardando"],
      todos: ["Todos a agendar", G("agendar")],
    },
    aguardando: {
      todos: ["Todos aguardando", G("aguardando")],
      retornar: ["Retornar hoje / atrasados", c => G("aguardando")(c) && retornoVencido(c)],
      obra: ["🚧 Obra / reforma", c => G("aguardando")(c) && chaveMotivo(c) === "obra"],
      outra_data: ["🔄 Outra data", c => G("aguardando")(c) && chaveMotivo(c) === "outra_data"],
      sem_resposta: ["📵 Sem resposta", c => G("aguardando")(c) && chaveMotivo(c) === "sem_resposta"],
      medida: ["📐 Aguardando medida", c => G("aguardando")(c) && chaveMotivo(c) === "medida"],
      outros: ["Outros motivos", c => G("aguardando")(c) && !["obra", "outra_data", "sem_resposta", "medida"].includes(chaveMotivo(c))],
    },
    agendados: {
      proximos: ["Próximos", c => G("agendado")(c) && diaAg(c) >= hoje()],
      hoje: ["Hoje", c => G("agendado")(c) && diaAg(c) === hoje()],
      semana: ["Próximos 7 dias", c => G("agendado")(c) && diaAg(c) >= hoje() && diaAg(c) <= somaDias(hoje(), 7)],
      passados: ["Data passou · marcar realizado", c => G("agendado")(c) && diaAg(c) < hoje()],
      encerrados: ["Realizados / encerrados", G("encerrado")],
    },
    confirmar: {
      a_confirmar: [diaAlvo ? "A confirmar" : `A confirmar (próximos ${confDias} dias)`, c => diaAlvo ? G("agendado")(c) && !ck(c).confirmacao && diaAg(c) === diaAlvo : aConfirmar(c, confDias)],
      enviada: ["Aguardando confirmação de presença", c => G("agendado")(c) && ck(c).confirmacao === "enviada" && (diaAlvo ? diaAg(c) === diaAlvo : diaAg(c) >= hoje())],
      confirmada: ["Presença confirmada", c => G("agendado")(c) && ck(c).confirmacao === "confirmada" && (diaAlvo ? diaAg(c) === diaAlvo : diaAg(c) >= hoje())],
    },
  };
  const FILTROS = FILTROS_ABA[aba] || {};
  const cont: Record<string, number> = {}; Object.entries(FILTROS).forEach(([k, [, fn]]) => (cont[k] = todos.filter(fn).length));
  const busca = q.trim().toLowerCase(), dig = q.replace(/\D/g, "");
  let lista = FILTROS[f] ? todos.filter(FILTROS[f][1]) : [];
  if (busca) lista = lista.filter((c: any) => String(c.cliente).toLowerCase().includes(busca) || String(ck(c).projetista || "").toLowerCase().includes(busca) || (dig.length >= 3 && (String(c.pedido).includes(dig) || String(c.telefone).includes(dig))));
  const ordem = (c: any) => { const k = ck(c); return String(grupoCk(c) === "agendado" ? k.agendadoPara : k.retornarEm || c.dataVenda || c.criadoEm || ""); };
  lista = lista.slice().sort((a: any, b: any) => ordem(a).localeCompare(ordem(b)));
  const porDia = aba === "agendados" || aba === "confirmar";

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
        inclusao: dataPlanilha(l["Inclusão"]).slice(0, 10), ...((ds: string[]) => ({ agendadoPara: ds[0] || "", diasExtras: ds.slice(1).map(d => ({ data: d })) }))(datasPlanilha(l["Data do Agendamento"], hojeISO())),
        valor: l["Valor Negociado"], cupom: l["Valor dos Cupons"], minhaVisita: l["Cliente Minha Visita"], situacao: l["Situação"],
        descricao: (l["Descrição"] || "").replace(/Venda realizada e encaminhada para Checklist/gi, "").trim(),
      }));
      const comData = dados.filter(d => d.agendadoPara).length;
      if (modoImp.current === "agendados" && !comData) throw new Error("Nenhuma linha com “Data do Agendamento” — essa parece ser a planilha de clientes a agendar");
      if (modoImp.current === "agendar" && comData > dados.length / 2 && !confirm(`${comData} das ${dados.length} linhas já têm data de agendamento — parece a planilha de AGENDADOS. Importar mesmo assim? (os que têm data entram em Agendados)`)) return;
      if (modoImp.current === "agendar") {
        // planilha "a agendar" sincroniza a base: mostra a prévia e só aplica depois do OK
        const prev = await A.checklistSincronizar(dados, false);
        setModal(<ModalSincronizar dados={dados} prev={prev} />);
        return;
      }
      const r = await A.checklistImportar(dados);
      await recarregar();
      toast(`${r.novos} cliente(s) novo(s)${r.agendados ? " (" + r.agendados + " já agendados)" : ""} · ${r.ignorados} já estavam no sistema (ignorados)`);
    } catch (e: any) { toast(e.message || "Não foi possível importar"); }
    finally { setImportando(false); if (arq.current) arq.current.value = ""; }
  }
  const nG = (g: string) => todos.filter(G(g)).length;

  return (
    <section className="view active" id="view-checklist">
      {aba !== "agenda" && <><div className="view-head"><div><h2>{(ABAS[aba] || ABAS.agendar)[0]}</h2>
        <p>{(ABAS[aba] || ABAS.agendar)[1]}</p></div>
        <div><input ref={arq} type="file" accept=".xlsx" style={{ display: "none" }} onChange={e => importar(e.target.files?.[0])} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}><button className="btn ghost" onClick={() => setModal(<ModalHorarios />)}>⚙ Horários</button><button className="btn" onClick={() => setModal(<ModalIncluir />)}>＋ Incluir cliente</button>
          <button className="btn primary" disabled={importando} onClick={() => escolher("agendar")}>{importando ? "Importando…" : "📥 Importar a agendar"}</button>
          <button className="btn primary" disabled={importando} onClick={() => escolher("agendados")}>📅 Importar agendados</button></div></div></div>
      <div className="kpis" style={{ marginTop: 6 }}>
        <Kpi n={todos.filter(aFazerHoje).length} l="Para fazer hoje" cls={todos.some(aFazerHoje) ? "alert" : ""} />
        <Kpi n={nG("agendar")} l="A agendar" />
        <Kpi n={nG("aguardando")} l={"Aguardando" + (todos.some((c: any) => G("aguardando")(c) && retornoVencido(c)) ? " · " + todos.filter((c: any) => G("aguardando")(c) && retornoVencido(c)).length + " para retornar" : "")} />
        <Kpi n={todos.filter((c: any) => G("agendado")(c) && diaAg(c) >= hoje()).length} l="Agendados" />
        <Kpi n={todos.filter((c: any) => aConfirmar(c, confDias)).length} l="Presença a confirmar" cls={todos.some((c: any) => aConfirmar(c, confDias)) ? "alert" : ""} />
        <Kpi n={todos.filter((c: any) => etapaCk(c) === "realizado" && String(ck(c).realizadoEm || "").slice(0, 7) === mes).length} l="Realizados no mês" />
      </div></>}
      {aba === "agenda" ? <Calendario /> : <>
      <div className="card" style={{ padding: "12px 16px", margin: "14px 0" }}>
        <input className="busca" style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, font: "inherit", background: "var(--surface)", color: "var(--ink)" }}
          placeholder="Buscar por nome, nº da venda, telefone ou projetista" value={q} onChange={e => setQ(e.target.value)} />
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
          <div className="field" style={{ minWidth: 190 }}><label>Data de inclusão</label><select value={per} onChange={e => setPer(e.target.value)}>
            <option value="todos">Todos os períodos</option><option value="mes">Deste mês</option><option value="anteriores">Meses anteriores</option><option value="data">Data determinada…</option></select></div>
          {per === "data" && <div className="field" style={{ minWidth: 150 }}><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>}
          {per === "data" && <div className="field" style={{ minWidth: 150 }}><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>}
          {per !== "todos" && <button className="btn ghost sm" onClick={() => { setPer("todos"); setDe(""); setAte(""); }}>Limpar</button>}
        </div>
        <div className="chips" style={{ marginTop: 10 }}>{Object.entries(FILTROS).map(([k, [l]]) => <button key={k} className={"chip" + (f === k ? " on" : "")} onClick={() => setF(k)}>{l}<span className="n">{cont[k] || 0}</span></button>)}</div>
        {aba === "confirmar" && <div className="chips" style={{ marginTop: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12.5, color: "var(--ink-faint)", marginRight: 4 }}>📅 Data do checklist:</span>
          {([["", "Todas"], ["hoje", "Hoje"], ["amanha", "Amanhã"], ["data", "Escolher data"]] as [string, string][]).map(([v, l]) => <button key={v} className={"chip" + (diaF === v ? " on" : "")} onClick={() => setDiaF(v)}>{l}</button>)}
          {diaF === "data" && <input type="date" value={diaX} onChange={e => e.target.value && setDiaX(e.target.value)} style={{ width: "auto", padding: "4px 8px" }} />}
          {diaAlvo && <span className="hint">{new Date(parseData(diaAlvo)).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}</span>}
        </div>}
      </div>
      {porDia && lista.length ? Object.entries(lista.reduce((g: any, c: any) => { const d = diaAg(c) || "—"; (g[d] = g[d] || []).push(c); return g; }, {})).map(([d, cs]: any) =>
        <div key={d} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 16, margin: "6px 0 8px", color: d < hoje() ? "var(--danger)" : d === hoje() ? "var(--st-concluida)" : "var(--ink)" }}>
            {d === hoje() ? "HOJE · " : ""}{d !== "—" ? DIAS[parseData(d).getDay()] + ", " + fmtDate(d) : "Sem data"}{d !== "—" && d < hoje() && aba === "agendados" && f !== "encerrados" ? " — passou: marque como realizado ou reagende" : ""} <span style={{ fontWeight: 400, fontSize: 13, color: "var(--ink-faint)" }}>· {cs.length} cliente(s)</span></div>
          {cs.map((c: any) => <CartaoCk key={c.id} c={c} aba={aba} />)}
        </div>) :
      lista.length ? lista.map((c: any) => <CartaoCk key={c.id} c={c} aba={aba} />) : <div className="empty">{todos.length ? "Nenhum cliente neste filtro." : "Nenhum cliente ainda — importe a planilha do sistema interno."}</div>}
      {R.ehGestao() && lista.length > 1 && <div style={{ marginTop: 12 }}><button className="btn danger sm" onClick={() => setModal(<ConfirmaExcluir ids={lista.map((c: any) => c.id)} rotulo={`os ${lista.length} clientes deste filtro`} forte />)}>🗑 Excluir os {lista.length} clientes deste filtro</button></div>}
      </>}
    </section>
  );
}

function CartaoCk({ c, aba }: any) {
  const { abrirDetalhe, setModal, executar } = useApp() as any;
  const k = ck(c), e = etapaCk(c), g = grupoCk(c), [nome, cor0] = ETAPA_CK[e] || [e, "var(--line)"];
  const conf = CONF_CK[k.confirmacao || ""] || CONF_CK[""];
  const cor = g === "agendado" ? conf[1] : cor0;
  const atrasado = retornoVencido(c);
  const notas = (k.notas || []).length;
  return (
    <div className="card" style={{ padding: "12px 16px", marginBottom: 10, borderLeft: `5px solid ${cor}` }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        {g === "agendado" && k.agendadoPara && <DataGrande v={k.agendadoPara} />}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, fontSize: 15, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{c.cliente}
            <span style={{ fontWeight: 700, fontSize: 12.5, padding: "1px 8px", borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--line)" }}>Venda {c.pedido}</span>
            {g !== "agendado" && k.projetista && <span style={{ fontWeight: 700, fontSize: 12.5, padding: "1px 8px", borderRadius: 6, background: corProj(k.projetista), color: "#fff" }}>👤 {k.projetista}</span>}</div>
          <DadosCk c={c} />
          {g === "aguardando" && <div style={{ marginTop: 7, padding: "7px 10px", borderRadius: 8, background: "var(--st-tratativa-bg)", border: "1px solid var(--st-tratativa)", fontSize: 13.5 }}>
            <b>⏸ Motivo:</b> {motivoCk(c) || "—"}
            {k.retornarEm ? <span style={{ marginLeft: 10, ...(atrasado ? { color: "var(--danger)", fontWeight: 700 } : {}) }}>· retornar em {fmtDate(String(k.retornarEm).slice(0, 10))}{atrasado ? " (hoje/atrasado)" : ""}</span> : <span style={{ marginLeft: 10, color: "var(--ink-faint)" }}>· sem data de retorno</span>}
          </div>}
          <div style={{ fontSize: 12.5, marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {g !== "aguardando" && <span className="badge" style={{ background: cor0, color: "#fff" }}>{nome}</span>}
            {e === "aguardando" && <span>oferecido {fmtDateTime(k.proposta)} · {k.contatos || 1}º contato · há {diasDesde(k.ultimoContato)}d</span>}
            {g === "agendado" && Array.isArray(k.diasExtras) && k.diasExtras.length > 0 && <span className="pill" title={k.diasExtras.map((e: any) => fmtDateTime(e.data) + " · " + e.projetista).join("\n")}>📆 {k.diasExtras.length + 1} dias</span>}
            {g === "agendado" && <span className="pill" style={{ background: corProj(k.projetista), color: "#fff", fontWeight: 700 }}>{k.projetista ? "👤 " + k.projetista : "👤 sem projetista"}</span>}
            {g === "agendado" && <span className="pill" style={{ background: conf[1], color: "#fff", fontWeight: 700 }}>{conf[0]}</span>}
            {g === "agendado" && k.encaixe && <span className="pill" style={{ background: "var(--danger)", color: "#fff", fontWeight: 800 }} title={k.encaixeCom || ""}>⚠️ ENCAIXE · {k.encaixeCom || "mais de um cliente no horário"}</span>}
            {k.medidaId && g !== "aguardando" && <span className="pill">{k.medidaOk ? "📐 medidas conferidas" : "📐 aguardando Medidas"}</span>}
          </div>
          {c.motivo && c.motivo !== "Venda encaminhada para o checklist" && <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 4 }}>“{String(c.motivo).slice(0, 160)}”</div>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 420, justifyContent: "flex-end" }}>
          {g === "agendado" && !k.confirmacao && <button className="btn sm" style={{ background: "var(--wa)", color: "#fff", borderColor: "var(--wa)" }} onClick={() => setModal(<ModalWhats c={c} inicial="confirmacao" />)}>📨 Enviar confirmação</button>}
          {g === "agendado" && k.confirmacao !== "confirmada" && <button className="btn sm" style={{ background: "var(--ok, #0f8a5f)", color: "#fff", borderColor: "var(--ok, #0f8a5f)", fontWeight: 700 }} onClick={() => executar(() => A.checklistRegistrar(c.id, { acao: "presenca_confirmada" }), "Presença confirmada")}>✅ Confirmou presença</button>}
          {g === "agendado" && c.status !== "concluida" && <button className="btn sm" style={{ background: "var(--danger)", color: "#fff", borderColor: "var(--danger)" }} onClick={() => setModal(<ModalNaoPodeVir c={c} />)}>🚫 Não pode vir</button>}
          {c.status !== "concluida" && !(g === "agendado" && !k.confirmacao) && <button className="btn sm wa" style={{ background: "var(--wa)", color: "#fff", borderColor: "var(--wa)" }} onClick={() => setModal(<ModalWhats c={c} />)}>💬 WhatsApp</button>}
          {g === "agendar" && <button className="btn sm" onClick={() => setModal(<ModalResultado c={c} inicial="espera" />)}>⏸ Aguardando</button>}
          {g === "agendado" && aba !== "confirmar" && <button className="btn sm" onClick={() => setModal(<Modal titulo={"Alterar agenda · " + c.cliente + " · venda " + c.pedido} onFechar={() => setModal(null)}><EditorAgenda c={c} /></Modal>)}>✏️ Projetista / horário</button>}
          {g === "agendado" && aba !== "confirmar" && <button className="btn sm" onClick={() => setModal(<ModalResultado c={c} inicial="desmarcar" />)}>❌ Desmarcar</button>}
          <button className="btn sm" onClick={() => setModal(<ModalResultado c={c} />)}>{c.status === "concluida" ? "Reabrir" : g === "agendado" ? "Realizado / outros" : "Registrar resultado"}</button>
          <button className="btn ghost sm" onClick={() => setModal(<ModalNotas c={c} />)} title="Mensagens enviadas e anotações">📝{notas ? " " + notas : ""}</button>
          <button className="btn ghost sm" onClick={() => abrirDetalhe(c.id)}>Ficha</button>
          <button className="btn ghost sm" title="Excluir cliente do checklist" style={{ color: "var(--danger)" }} onClick={() => setModal(<ConfirmaExcluir ids={[c.id]} rotulo={c.cliente + " (venda " + c.pedido + ")"} />)}>🗑</button>
        </div>
      </div>
    </div>
  );
}

/** mensagens enviadas pelo 360 e anotações/mensagens coladas pela equipe */
export function NotasCk({ c }: any) {
  const notas = [...(ck(c).notas || [])].reverse();
  const [abrir, setAbrir] = useState<Record<number, boolean>>({});
  if (!notas.length) return <div className="hint">Nenhuma mensagem salva ainda.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {notas.map((n: any, i: number) => { const longo = String(n.texto || "").length > 280; return (
        <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "8px 11px", background: n.tipo === "whats" ? "var(--st-concluida-bg)" : "var(--surface-2)" }}>
          <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginBottom: 4 }}>{n.tipo === "whats" ? "💬 Enviado pelo 360" : "📝 Colado / anotado"} · {n.por || "—"} · {fmtDateTime(n.em)}</div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{longo && !abrir[i] ? String(n.texto).slice(0, 280) + "…" : n.texto}</div>
          {longo && <button className="btn ghost sm" style={{ marginTop: 4 }} onClick={() => setAbrir(x => ({ ...x, [i]: !x[i] }))}>{abrir[i] ? "ver menos" : "ver tudo"}</button>}
        </div>); })}
    </div>
  );
}
export function ModalNotas({ c }: any) {
  const { setModal, toast, recarregar, st } = useApp() as any;
  const atual = st.chamados.find((x: any) => x.id === c.id) || c;
  const [txt, setTxt] = useState(""); const [ind, setInd] = useState(false);
  const fechar = () => setModal(null);
  async function salvar() {
    if (!txt.trim()) { toast("Cole ou escreva a mensagem"); return; }
    setInd(true);
    try { await A.checklistRegistrar(c.id, { acao: "nota", texto: txt }); await recarregar(); setTxt(""); toast("Mensagem salva no cliente"); }
    catch (x: any) { toast(x.message); } finally { setInd(false); }
  }
  return (
    <Modal titulo={"Mensagens e anotações · " + c.cliente} onFechar={fechar}>
      <div className="field" style={{ marginBottom: 10 }}><label>Colar a mensagem enviada / conversa com o cliente, ou escrever uma anotação</label>
        <textarea rows={6} value={txt} onChange={e => setTxt(e.target.value)} placeholder="Cole aqui o que foi conversado no WhatsApp, o que o cliente respondeu ou qualquer informação importante" /></div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}><button className="btn primary" disabled={ind} onClick={salvar}>{ind ? "Salvando…" : "Salvar no cliente"}</button><button className="btn ghost" onClick={fechar}>Fechar</button></div>
      <NotasCk c={atual} />
    </Modal>
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
        {(st.medidasCruz || {})[c.pedido] && <SeloMedidas peq resultado={st.medidasCruz[c.pedido].resultado} />}
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

// ---------- sugestão de dias e horários livres ----------
export const AGENDA_PADRAO: any = { dias: [1, 2, 3, 4, 5], horarios: ["09:00", "11:00", "15:00", "17:00"], duracaoMin: 120, confirmarDias: 2, vagas: 1, seguraDias: 2, projetistas: ["Silvane", "Rafael", "Angela", "Gislaine", "Cleberson", "Juliana"] };
const CORES_PROJ = ["#2f6fd6", "#c2410c", "#0f8a5f", "#8b3fd1", "#b8860b", "#d6336c", "#0e7490", "#4d5b7c"];
export const cfgAgenda = (st: any) => ({ ...AGENDA_PADRAO, ...(st.config.checklistAgenda || {}) });
let _projs: string[] = AGENDA_PADRAO.projetistas;
export const corProj = (n?: string) => (n ? CORES_PROJ[Math.max(0, _projs.indexOf(n)) % CORES_PROJ.length] : "var(--ink-faint)");
const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** quem está ocupado: agendados (com ou sem projetista) + datas oferecidas que ainda esperam o cliente (reservam o projetista por alguns dias) */
type Ocup = { proj: string; ini: number; fim: number; cliente: string; aguardando: boolean };
/** duração do atendimento deste cliente (minutos) — a agenda oficial tem atendimentos de 1h a 10h */
export const durCk = (c: any, cfg?: any) => Number(ck(c).duracaoMin) || (cfg?.duracaoMin) || 120;
/** todos os dias de atendimento de um cliente agendado: o principal (extra = -1) + os dias adicionais */
export type Atend = { slot: string; dur: number; proj: string; extra: number; n: number; total: number };
export function atendimentos(c: any, cfg?: any): Atend[] {
  const k = ck(c); if (etapaCk(c) !== "agendado" || !k.agendadoPara) return [];
  const ex: any[] = Array.isArray(k.diasExtras) ? k.diasExtras : [];
  const l = [{ slot: String(k.agendadoPara).slice(0, 16), dur: durCk(c, cfg), proj: k.projetista || "", extra: -1 },
    ...ex.map((e, i) => ({ slot: String(e.data).slice(0, 16), dur: Number(e.duracaoMin) || durCk(c, cfg), proj: e.projetista || k.projetista || "", extra: i }))]
    .sort((a, b) => a.slot.localeCompare(b.slot));
  return l.map((x, i) => ({ ...x, n: i + 1, total: l.length }));
}
export function ocupacoes(st: any, excluirId?: string): Ocup[] {
  const cfg = cfgAgenda(st); _projs = cfg.projetistas;
  const out: Ocup[] = [];
  st.chamados.forEach((c: any) => {
    if (c.tipo !== "checklist" || c.status === "concluida" || c.id === excluirId) return;
    const k = ck(c), e = etapaCk(c);
    if (e === "agendado" && k.agendadoPara) atendimentos(c, cfg).forEach(a => { const ini = +parseData(a.slot); out.push({ proj: a.proj, ini, fim: ini + a.dur * 6e4, cliente: c.cliente, aguardando: false }); });
    else if (e === "aguardando" && k.proposta && diasDesde(k.ultimoContato) <= cfg.seguraDias) { const ini = +parseData(String(k.proposta).slice(0, 16)); out.push({ proj: k.propostaProjetista || "", ini, fim: ini + (cfg.duracaoMin || 120) * 6e4, cliente: c.cliente, aguardando: true }); }
  });
  return out;
}
/** projetistas livres num horário (atendimento de 2h; sobreposição conta como ocupado). Agendados sem projetista ocupam uma vaga qualquer. */
/** bloqueios (agenda fechada) que pegam o período [ini, fim) — do projetista ou de todos */
export function bloqueiosEm(st: any, proj: string, ini: number, fim: number) {
  return ((st.ckBloqueios || []) as any[]).filter(b => (!b.projetista || !proj || b.projetista === proj) && +parseData(b.inicio) < fim && ini < +parseData(b.fim));
}
export const rotuloBloq = (b: any) => "🚫 " + b.motivo + (b.obs ? " — " + b.obs : "") + (b.projetista ? "" : " (todos)");
export function livresNoHorario(st: any, slot: string, excluirId?: string, occ?: Ocup[]): { livres: string[]; ocupados: string[] } {
  const cfg = cfgAgenda(st), dur = (cfg.duracaoMin || 120) * 6e4, t = +parseData(slot.slice(0, 16));
  const no = (occ || ocupacoes(st, excluirId)).filter(o => o.ini < t + dur && t < o.fim);
  const ocupadosProj = new Set(no.filter(o => o.proj).map(o => o.proj));
  // projetistas só para emergência (ex.: gerente de loja) não entram nas sugestões — só são escolhidos à mão
  const emerg: string[] = cfg.emergencia || [];
  let livres = cfg.projetistas.filter((n: string) => !ocupadosProj.has(n) && !emerg.includes(n) && !bloqueiosEm(st, n, t, t + dur).length);
  const semProj = no.filter(o => !o.proj).length;
  if (semProj) livres = livres.slice(0, Math.max(0, livres.length - semProj));
  return { livres, ocupados: no.map(o => o.cliente + (o.proj ? " · " + o.proj : "") + (o.aguardando ? " (aguardando resposta)" : "")) };
}
export function sugestoes(st: any, excluirId?: string, n = 8, projetista?: string): { slot: string; livres: string[] }[] {
  const cfg = cfgAgenda(st), occ = ocupacoes(st, excluirId), out: { slot: string; livres: string[] }[] = [], agora = Date.now() + 2 * 36e5;
  for (let i = 0; i < 60 && out.length < n; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    if (!cfg.dias.includes(d.getDay())) continue;
    for (const h of [...cfg.horarios].sort()) {
      const slot = isoDia(d) + "T" + h;
      if (+parseData(slot) < agora) continue;
      const { livres } = livresNoHorario(st, slot, excluirId, occ);
      if (projetista ? livres.includes(projetista) : livres.length) out.push({ slot, livres });
      if (out.length >= n) break;
    }
  }
  return out;
}
/** clientes do mesmo projetista que batem com esse horário (agendados e datas oferecidas) */
export function conflitosProj(st: any, slot: string, proj: string, excluirId?: string, durMin?: number) {
  if (!proj || (slot || "").length < 16) return [] as Ocup[];
  const ex = excluirId ? st.chamados.find((x: any) => x.id === excluirId) : null;
  const dur = (durMin || (ex ? durCk(ex, cfgAgenda(st)) : cfgAgenda(st).duracaoMin || 120)) * 6e4, t = +parseData(slot.slice(0, 16));
  return ocupacoes(st, excluirId).filter(o => o.proj === proj && o.ini < t + dur && t < o.fim);
}
/** aviso de encaixe: mesmo projetista com outro cliente no horário — só passa com a confirmação marcada */
export function AvisoEncaixe({ slot, proj, excluirId, ok, setOk, durMin }: { slot: string; proj: string; excluirId?: string; ok: boolean; setOk: (v: boolean) => void; durMin?: number }) {
  const { st } = useApp() as any;
  const lst = conflitosProj(st, slot, proj, excluirId, durMin);
  const bl = proj && (slot || "").length >= 16 ? bloqueiosEm(st, proj, +parseData(slot.slice(0, 16)), +parseData(slot.slice(0, 16)) + (durMin || cfgAgenda(st).duracaoMin || 120) * 6e4) : [];
  if (bl.length) return <div className="full" style={{ gridColumn: "1 / -1", border: "2px solid var(--danger)", background: "var(--danger-bg)", borderRadius: 10, padding: "10px 12px", fontWeight: 700, color: "var(--danger)" }}>
    {proj} está com a agenda fechada nesse horário: {bl.map(rotuloBloq).join(" · ")}. Escolha outro dia/horário ou reabra a agenda (no calendário).</div>;
  if (!lst.length) return null;
  const ag = lst.filter(o => !o.aguardando);
  return (
    <div className="full" style={{ gridColumn: "1 / -1", border: "2px solid var(--danger)", background: "var(--danger-bg)", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontWeight: 800, color: "var(--danger)", fontSize: 14 }}>⚠️ ENCAIXE — {proj} já tem {lst.length === 1 ? "outro cliente" : lst.length + " clientes"} nesse horário</div>
      <ul style={{ margin: "6px 0", paddingLeft: 18, fontSize: 13 }}>{lst.map((o, i) => <li key={i}>{o.cliente} — {new Date(o.ini).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{o.aguardando ? " (data oferecida, aguardando resposta)" : " (agendado)"}</li>)}</ul>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
        <input type="checkbox" style={{ width: "auto" }} checked={ok} onChange={e => setOk(e.target.checked)} />
        Confirmo o encaixe: {proj} vai atender {lst.length + 1} clientes nesse horário{ag.length ? "" : " (o outro ainda não confirmou)"}</label>
    </div>
  );
}

const DURACOES = [60, 90, 120, 180, 240, 300, 360, 480, 600];
const fmtDur = (m: number) => (m % 60 ? (m / 60).toFixed(1).replace(".", ",") : String(m / 60)) + "h";
/** confirmação de qualquer mudança na agenda (arrastar, esticar ou editar na ficha) */
export function ModalMover({ c, data, proj, dur }: { c: any; data: string; proj: string; dur: number }) {
  const { setModal, toast, recarregar, st } = useApp() as any;
  const k = ck(c), cfg = cfgAgenda(st), durAnt = durCk(c, cfg);
  const [enc, setEnc] = useState(false); const [sal, setSal] = useState(false);
  const fechar = () => setModal(null);
  const ag = conflitosProj(st, data, proj, c.id, dur).filter(o => !o.aguardando);
  const fim = (slot: string, m: number) => new Date(+parseData(slot.slice(0, 16)) + m * 6e4).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const linha = (slot: string, p: string, m: number) => <><b>{dataLonga(slot)}</b> até {fim(slot, m)} ({fmtDur(m)}) · <b>{p || "sem projetista"}</b></>;
  async function ok() {
    if (ag.length && !enc) { toast("Marque “Confirmo o encaixe” ou escolha outro horário"); return; }
    setSal(true);
    try {
      await A.checklistRegistrar(c.id, { acao: "mover", data, projetista: proj, duracaoMin: dur, encaixe: enc });
      await recarregar(); fechar(); toast("Agenda alterada — altere também no sistema interno");
    } catch (x: any) { toast(x.message); setSal(false); }
  }
  const mudouData = data !== String(k.agendadoPara || "").slice(0, 16);
  return (
    <Modal titulo={"Confirmar alteração · " + c.cliente} onFechar={fechar}>
      <div style={{ fontSize: 14, lineHeight: 1.7 }}>
        <div><span style={{ color: "var(--ink-faint)" }}>Venda</span> <b>{c.pedido}</b></div>
        <div><span style={{ color: "var(--ink-faint)" }}>Antes:</span> {linha(String(k.agendadoPara || "").slice(0, 16), k.projetista, durAnt)}</div>
        <div><span style={{ color: "var(--ink-faint)" }}>Depois:</span> {linha(data, proj, dur)}</div>
        {mudouData && <div className="hint" style={{ fontSize: 12.5 }}>A data mudou: a confirmação de presença volta para “a confirmar”.</div>}
      </div>
      <div className="grid" style={{ marginTop: 10 }}><AvisoEncaixe slot={data} proj={proj} excluirId={c.id} ok={enc} setOk={setEnc} durMin={dur} /></div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn primary" disabled={sal} onClick={ok}>OK, alterar</button>
      </div>
    </Modal>
  );
}
/** edição rápida na ficha: projetista, dia/horário e duração */
export function EditorAgenda({ c }: any) {
  const { st, setModal, toast } = useApp() as any;
  const k = ck(c), cfg = cfgAgenda(st);
  const [proj, setProj] = useState<string>(k.projetista || "");
  const [data, setData] = useState<string>(String(k.agendadoPara || "").slice(0, 16));
  const [dur, setDur] = useState<number>(durCk(c, cfg));
  const opDur = Array.from(new Set([...DURACOES, dur])).sort((a, b) => a - b);
  const mudou = proj !== (k.projetista || "") || data !== String(k.agendadoPara || "").slice(0, 16) || dur !== durCk(c, cfg);
  return (
    <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface-2)" }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>✏️ Alterar agenda</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12 }}>Projetista<br /><select value={proj} onChange={e => setProj(e.target.value)} style={{ width: "auto" }}><option value="">Selecione…</option>{cfg.projetistas.map((n: string) => <option key={n} value={n}>{n}{(cfg.emergencia || []).includes(n) ? " (emergência)" : ""}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Dia e horário<br /><input type="datetime-local" step={1800} value={data} onChange={e => setData(e.target.value)} style={{ width: "auto" }} /></label>
        <label style={{ fontSize: 12 }}>Duração<br /><select value={dur} onChange={e => setDur(Number(e.target.value))} style={{ width: "auto" }}>{opDur.map(m => <option key={m} value={m}>{fmtDur(m)}</option>)}</select></label>
        <button className="btn primary sm" disabled={!mudou} onClick={() => { if (!proj || data.length < 16) { toast("Escolha projetista, dia e horário"); return; } setModal(<ModalMover c={c} data={data} proj={proj} dur={dur} />); }}>Salvar alteração</button>
      </div>
      <DiasExtras c={c} />
    </div>
  );
}
/** cliente agendado não pode vir: remarca já uma nova data ou volta para a lista de agendamento */
export function ModalNaoPodeVir({ c }: any) {
  const { st, setModal, toast, recarregar } = useApp() as any;
  const k = ck(c), cfg = cfgAgenda(st);
  const [modo, setModo] = useState<"nova" | "lista">("nova");
  const [motivo, setMotivo] = useState("");
  const [data, setData] = useState("");
  const [proj, setProj] = useState<string>(k.projetista || "");
  const [dur, setDur] = useState<number>(durCk(c, cfg));
  const [ret, setRet] = useState("");
  const [enc, setEnc] = useState(false); const [sal, setSal] = useState(false);
  const fechar = () => setModal(null);
  async function ok() {
    if (!motivo.trim()) { toast("Informe o motivo de o cliente não poder vir"); return; }
    if (modo === "nova") {
      if (data.length < 16 || !proj) { toast("Escolha a nova data, o horário e o projetista"); return; }
      if (conflitosProj(st, data, proj, c.id, dur).some(o => !o.aguardando) && !enc) { toast("Marque “Confirmo o encaixe” ou escolha outro horário"); return; }
    }
    setSal(true);
    try {
      if (modo === "nova") await A.checklistRegistrar(c.id, { acao: "mover", data, projetista: proj, duracaoMin: dur, encaixe: enc, naoPodeVir: true, obs: motivo.trim() });
      else await A.checklistRegistrar(c.id, { acao: "desmarcar", naoPodeVir: true, obs: motivo.trim(), retornarEm: ret });
      await recarregar(); fechar();
      toast(modo === "nova" ? "Nova data agendada — altere também no sistema interno" : "Cliente voltou para a lista de agendamento — desmarque também no sistema interno");
    } catch (x: any) { toast(x.message); setSal(false); }
  }
  const opc = (v: "nova" | "lista", t: string, d: string) => (
    <label style={{ flex: 1, minWidth: 200, display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", padding: "10px 12px", borderRadius: 10, border: `2px solid ${modo === v ? "var(--brand, #2f6fd6)" : "var(--line)"}`, background: modo === v ? "var(--surface-2)" : undefined }}>
      <input type="radio" style={{ width: "auto", marginTop: 3 }} checked={modo === v} onChange={() => setModo(v)} /><span><b>{t}</b><br /><span className="hint">{d}</span></span></label>);
  return (
    <Modal titulo={"Cliente não pode vir · " + c.cliente} onFechar={fechar}>
      <div style={{ fontSize: 13.5, marginBottom: 10 }}>Venda <b>{c.pedido}</b> · agendado para <b>{dataLonga(String(k.agendadoPara || "").slice(0, 16))}</b> com <b>{k.projetista || "—"}</b>{k.naoPodeVir ? <span className="pill" style={{ marginLeft: 8 }}>já remarcou {k.naoPodeVir}x por não poder vir</span> : null}</div>
      <div className="grid">
        <div className="field full"><label>Motivo <span className="req-star">*</span></label><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: cliente viajando, imprevisto no trabalho, obra atrasou…" /></div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "10px 0" }}>
        {opc("nova", "📅 Agendar nova data agora", "Já combinou outro dia com o cliente")}
        {opc("lista", "↩️ Voltar para a lista de agendamento", "Ainda não tem nova data — o cliente volta para “A agendar”")}
      </div>
      {modo === "nova" ? <div className="grid">
        <div className="field"><label>Nova data e horário <span className="req-star">*</span></label><input type="datetime-local" step={1800} value={data} onChange={e => setData(e.target.value)} /></div>
        <div className="field"><label>Projetista <span className="req-star">*</span></label><select value={proj} onChange={e => setProj(e.target.value)}><option value="">Selecione…</option>{cfg.projetistas.map((n: string) => <option key={n} value={n}>{n}{(cfg.emergencia || []).includes(n) ? " (emergência)" : ""}</option>)}</select></div>
        <div className="field"><label>Duração</label><select value={dur} onChange={e => setDur(Number(e.target.value))}>{Array.from(new Set([...DURACOES, dur])).sort((a, b) => a - b).map(m => <option key={m} value={m}>{fmtDur(m)}</option>)}</select></div>
        <Sugestoes valor={data} excluirId={c.id} onPick={(v, pj) => { setData(v); if (pj) setProj(pj); }} projetista={proj} />
        <AvisoEncaixe slot={data} proj={proj} excluirId={c.id} ok={enc} setOk={setEnc} durMin={dur} />
        {Array.isArray(k.diasExtras) && k.diasExtras.length > 0 && <div className="hint" style={{ gridColumn: "1 / -1" }}>Este cliente tem mais {k.diasExtras.length} dia(s) de atendimento — confira se eles também precisam mudar (na ficha, em “Mais dias de atendimento”).</div>}
      </div> : <div className="grid">
        <div className="field"><label>Retornar o contato em <span className="hint">(vazio = volta para “A agendar” hoje)</span></label><input type="date" min={hoje()} value={ret} onChange={e => setRet(e.target.value)} /></div>
        <div className="hint" style={{ gridColumn: "1 / -1" }}>O horário fica livre na agenda{Array.isArray(k.diasExtras) && k.diasExtras.length ? " (inclusive os dias adicionais)" : ""}. A confirmação de presença é zerada.</div>
      </div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn primary" disabled={sal} onClick={ok}>OK, confirmar</button>
      </div>
    </Modal>
  );
}
/** prévia da planilha "a agendar": novos, mantidos, que viram agendados e que serão excluídos */
function ModalSincronizar({ dados, prev }: { dados: any[]; prev: any }) {
  const { setModal, toast, recarregar } = useApp() as any;
  const [forcar, setForcar] = useState(false); const [sal, setSal] = useState(false); const [ver, setVer] = useState(false);
  const fechar = () => setModal(null);
  async function ok() {
    if (prev.alerta && !forcar) { toast("Marque a confirmação: é muita gente para excluir"); return; }
    setSal(true);
    try {
      const r = await A.checklistSincronizar(dados, true, forcar);
      await recarregar(); fechar();
      toast(`Base atualizada: ${r.novos} novo(s) · ${r.agendar} passaram para agendado · ${r.excluir} excluído(s)`);
    } catch (x: any) { toast(x.message); setSal(false); }
  }
  const L = ({ n, t, cor }: any) => <div style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", borderBottom: "1px solid var(--line-soft)" }}><b style={{ fontSize: 20, minWidth: 48, textAlign: "right", color: cor }}>{n}</b><span>{t}</span></div>;
  return (
    <Modal titulo="Atualizar base com a planilha “a agendar”" onFechar={fechar}>
      <L n={prev.novos} t="clientes novos vão entrar" cor="var(--st-concluida)" />
      <L n={prev.mantidos} t="já estão no 360 — ficam como estão (obras, anotações e contatos são mantidos)" />
      <L n={prev.agendar} t="não estão mais na planilha, mas já tinham data oferecida → passam para AGENDADO" cor="var(--st-respondida)" />
      <L n={prev.excluir} t="não estão mais na planilha e não foram agendados (venda cancelada / saiu do checklist) → serão EXCLUÍDOS" cor="var(--danger)" />
      {prev.comMedida > 0 && <L n={prev.comMedida} t="também saíram da planilha, mas têm medida em andamento — ficam até a medida ser concluída" />}
      {(prev.excluir > 0 || prev.agendar > 0) && <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setVer(v => !v)}>{ver ? "Esconder nomes" : "Ver nomes"}</button>}
      {ver && <div style={{ maxHeight: 220, overflow: "auto", fontSize: 12.5, marginTop: 6, padding: 8, background: "var(--surface-2)", borderRadius: 8 }}>
        {prev.listaAgendar.length > 0 && <><b>Passam para agendado:</b><ul style={{ margin: "4px 0 8px", paddingLeft: 18 }}>{prev.listaAgendar.map((x: string) => <li key={x}>{x}</li>)}</ul></>}
        {prev.listaExcluir.length > 0 && <><b style={{ color: "var(--danger)" }}>Serão excluídos:</b><ul style={{ margin: "4px 0", paddingLeft: 18 }}>{prev.listaExcluir.map((x: string) => <li key={x}>{x}</li>)}</ul></>}
      </div>}
      <div className="hint" style={{ marginTop: 8 }}>Clientes já agendados, realizados ou encerrados não são alterados.</div>
      {prev.alerta && <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, color: "var(--danger)", fontWeight: 700, fontSize: 13.5 }}><input type="checkbox" style={{ width: "auto" }} checked={forcar} onChange={e => setForcar(e.target.checked)} />Mais da metade dos clientes a agendar seria excluída. Confirmo que esta é a planilha certa.</label>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn primary" disabled={sal} onClick={ok}>OK, atualizar base</button>
      </div>
    </Modal>
  );
}
/** chips de agenda fechada num dia (semana / mês) */
function BloqDia({ dia }: { dia: string }) {
  const { st } = useApp() as any;
  const l = bloqueiosEm(st, "", +parseData(dia + "T00:00"), +parseData(dia + "T00:00") + 864e5);
  if (!l.length) return null;
  return <>{l.map((b: any) => <div key={b.id} title={rotuloBloq(b)} style={{ fontSize: 10.5, fontWeight: 700, color: "#7a1f1f", background: "rgba(200,60,60,.12)", borderRadius: 4, padding: "1px 4px", margin: "2px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🚫 {b.projetista || "Todos"} · {b.motivo}</div>)}</>;
}
const MOTIVOS_BLOQ = ["Feriado", "Folga", "Consulta", "Falta", "Férias", "Treinamento", "Outro"];
/** fechar a agenda: de um projetista ou de todos, dia(s) inteiro(s) ou um período */
function ModalBloqueio({ dia }: { dia: string }) {
  const { st, setModal, toast, recarregar } = useApp() as any;
  const cfg = cfgAgenda(st);
  const [proj, setProj] = useState(""); const [de, setDe] = useState(dia); const [ate, setAte] = useState(dia);
  const [inteiro, setInteiro] = useState(true); const [hi, setHi] = useState("09:00"); const [hf, setHf] = useState("13:00");
  const [motivo, setMotivo] = useState("Feriado"); const [obs, setObs] = useState(""); const [sal, setSal] = useState(false);
  const fechar = () => setModal(null);
  const ini = inteiro ? de + "T00:00" : de + "T" + hi, fim = inteiro ? somaDias(ate || de, 1) + "T00:00" : (ate || de) + "T" + hf;
  const afetados = st.chamados.filter((c: any) => c.tipo === "checklist" && c.status !== "concluida").flatMap((c: any) => atendimentos(c, cfg).map(a => ({ c, a })))
    .filter(({ a }: any) => (!proj || a.proj === proj) && +parseData(a.slot) < +parseData(fim) && +parseData(a.slot) + a.dur * 6e4 > +parseData(ini));
  async function ok() {
    if (!de || (!inteiro && (!hi || !hf))) { toast("Preencha as datas"); return; }
    if (+parseData(fim) <= +parseData(ini)) { toast("O fim precisa ser depois do início"); return; }
    setSal(true);
    try { await A.ckBloqueioSalvar({ projetista: proj, inicio: ini, fim, motivo, obs }); await recarregar(); fechar(); toast("Agenda fechada" + (afetados.length ? ` — ${afetados.length} agendamento(s) no período para remanejar` : "")); }
    catch (x: any) { toast(x.message); setSal(false); }
  }
  return (
    <Modal titulo="🚫 Fechar agenda" onFechar={fechar}>
      <div className="grid">
        <div className="field"><label>Projetista</label><select value={proj} onChange={e => setProj(e.target.value)}><option value="">Todos (ex.: feriado)</option>{cfg.projetistas.map((n: string) => <option key={n} value={n}>{n}</option>)}</select></div>
        <div className="field"><label>Motivo</label><select value={motivo} onChange={e => setMotivo(e.target.value)}>{MOTIVOS_BLOQ.map(m => <option key={m}>{m}</option>)}</select></div>
        <div className="field"><label>De</label><input type="date" value={de} onChange={e => { setDe(e.target.value); if (!ate || ate < e.target.value) setAte(e.target.value); }} /></div>
        <div className="field"><label>Até</label><input type="date" value={ate} min={de} onChange={e => setAte(e.target.value)} /></div>
        <label className="field full" style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" style={{ width: "auto" }} checked={inteiro} onChange={e => setInteiro(e.target.checked)} />Dia inteiro</label>
        {!inteiro && <><div className="field"><label>Das</label><input type="time" step={1800} value={hi} onChange={e => setHi(e.target.value)} /></div>
          <div className="field"><label>Até as</label><input type="time" step={1800} value={hf} onChange={e => setHf(e.target.value)} /></div></>}
        <div className="field full"><label>Observação</label><input value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: Nossa Senhora Aparecida, consulta médica…" /></div>
      </div>
      {afetados.length > 0 && <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, border: "1.5px solid var(--warn)", background: "var(--st-tratativa-bg)", fontSize: 13 }}>
        <b>⚠️ {afetados.length} agendamento(s) já marcado(s) nesse período</b> — continuam na agenda; remaneje cada um (arraste no calendário ou “Cliente não pode vir”):
        <ul style={{ margin: "4px 0 0", paddingLeft: 18, maxHeight: 140, overflow: "auto" }}>{afetados.map(({ c, a }: any) => <li key={c.id + a.slot}>{fmtDateTime(a.slot)} · {a.proj || "sem projetista"} · {c.cliente} (venda {c.pedido})</li>)}</ul></div>}
      <div className="hint" style={{ marginTop: 8 }}>Com a agenda fechada, o 360 não sugere nem deixa agendar nesse período.</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn primary" style={{ background: "var(--danger)", borderColor: "var(--danger)" }} disabled={sal} onClick={ok}>OK, fechar agenda</button>
      </div>
    </Modal>
  );
}
function ModalReabrir({ b }: { b: any }) {
  const { setModal, toast, recarregar } = useApp() as any;
  const [sal, setSal] = useState(false);
  const fechar = () => setModal(null);
  async function ok() { setSal(true); try { await A.ckBloqueioReabrir(b.id); await recarregar(); fechar(); toast("Agenda reaberta"); } catch (x: any) { toast(x.message); setSal(false); } }
  return (
    <Modal titulo="Agenda fechada" onFechar={fechar}>
      <div style={{ fontSize: 14, lineHeight: 1.8 }}>
        <div><b>{rotuloBloq(b)}</b></div>
        <div>Projetista: <b>{b.projetista || "todos"}</b></div>
        <div>De <b>{fmtDateTime(b.inicio)}</b> até <b>{fmtDateTime(b.fim)}</b></div>
        {b.criadoPor && <div className="hint">Fechada por {b.criadoPor}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button className="btn" onClick={fechar}>Fechar</button>
        <button className="btn primary" disabled={sal} onClick={ok}>Reabrir agenda</button>
      </div>
    </Modal>
  );
}
type DiaEx = { data: string; duracaoMin: number; projetista: string };
/** mais dias de atendimento para o mesmo cliente (checklist que não termina em um dia) */
function DiasExtras({ c }: any) {
  const { st, setModal, toast } = useApp() as any;
  const k = ck(c), cfg = cfgAgenda(st);
  const orig: DiaEx[] = (Array.isArray(k.diasExtras) ? k.diasExtras : []).map((e: any) => ({ data: String(e.data).slice(0, 16), duracaoMin: Number(e.duracaoMin) || durCk(c, cfg), projetista: e.projetista || k.projetista || "" }));
  const [l, setL] = useState<DiaEx[]>(orig);
  const mudou = JSON.stringify(l) !== JSON.stringify(orig);
  const set = (i: number, campo: keyof DiaEx, v: any) => setL(x => x.map((e, j) => j === i ? { ...e, [campo]: v } : e));
  function addDia() {
    const base = l.length ? l[l.length - 1].data : String(k.agendadoPara || "").slice(0, 16);
    const d = parseData(base.slice(0, 10)); do { d.setDate(d.getDate() + 1); } while (!cfg.dias.includes(d.getDay()) && d.getDay() !== 6);
    setL(x => [...x, { data: isoDia(d) + "T" + (base.slice(11, 16) || "09:00"), duracaoMin: durCk(c, cfg), projetista: k.projetista || "" }]);
  }
  return (
    <div style={{ marginTop: 12, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>📆 Mais dias de atendimento {l.length ? <span className="pill">{l.length + 1} dias no total</span> : <span className="hint" style={{ fontWeight: 400 }}>— para checklist que precisa de mais de um dia</span>}</div>
      {l.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 6 }}>
          <b style={{ fontSize: 12.5, minWidth: 48 }}>Dia {i + 2}</b>
          <input type="datetime-local" step={1800} value={e.data} onChange={ev => set(i, "data", ev.target.value)} style={{ width: "auto", padding: "5px 8px", fontSize: 13 }} />
          <select value={e.duracaoMin} onChange={ev => set(i, "duracaoMin", Number(ev.target.value))} style={{ width: "auto", padding: "5px 8px", fontSize: 13 }}>{Array.from(new Set([...DURACOES, e.duracaoMin])).sort((a, b) => a - b).map(m => <option key={m} value={m}>{fmtDur(m)}</option>)}</select>
          <select value={e.projetista} onChange={ev => set(i, "projetista", ev.target.value)} style={{ width: "auto", padding: "5px 8px", fontSize: 13 }}>{cfg.projetistas.map((n: string) => <option key={n} value={n}>{n}{(cfg.emergencia || []).includes(n) ? " (emergência)" : ""}</option>)}</select>
          <button className="btn ghost sm" style={{ color: "var(--danger)" }} title="Remover este dia" onClick={() => setL(x => x.filter((_, j) => j !== i))}>✕</button>
        </div>))}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn sm" onClick={addDia}>+ Adicionar dia</button>
        {mudou && <button className="btn primary sm" onClick={() => { if (l.some(e => e.data.length < 16)) { toast("Preencha dia e horário de cada dia"); return; } setModal(<ModalDias c={c} dias={l} />); }}>Salvar dias</button>}
      </div>
    </div>
  );
}
function ModalDias({ c, dias }: { c: any; dias: DiaEx[] }) {
  const { st, setModal, toast, recarregar } = useApp() as any;
  const k = ck(c), cfg = cfgAgenda(st);
  const [enc, setEnc] = useState(false); const [sal, setSal] = useState(false);
  const fechar = () => setModal(null);
  const conf = dias.map(e => conflitosProj(st, e.data, e.projetista, c.id, e.duracaoMin).filter(o => !o.aguardando));
  const algum = conf.some(x => x.length);
  const fim = (slot: string, m: number) => new Date(+parseData(slot.slice(0, 16)) + m * 6e4).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  async function ok() {
    if (algum && !enc) { toast("Marque “Confirmo o encaixe” ou escolha outro dia/horário"); return; }
    setSal(true);
    try { await A.checklistRegistrar(c.id, { acao: "dias", dias, encaixe: enc }); await recarregar(); fechar(); toast("Dias de atendimento salvos — lance também no sistema interno"); }
    catch (x: any) { toast(x.message); setSal(false); }
  }
  return (
    <Modal titulo={"Confirmar dias de atendimento · " + c.cliente} onFechar={fechar}>
      <div style={{ fontSize: 14, lineHeight: 1.8 }}>
        <div><span style={{ color: "var(--ink-faint)" }}>Venda</span> <b>{c.pedido}</b></div>
        <div>Dia 1: <b>{dataLonga(String(k.agendadoPara).slice(0, 16))}</b> até {fim(String(k.agendadoPara), durCk(c, cfg))} · {k.projetista}</div>
        {dias.map((e, i) => <div key={i} style={conf[i].length ? { color: "var(--danger)", fontWeight: 600 } : {}}>Dia {i + 2}: <b>{dataLonga(e.data)}</b> até {fim(e.data, e.duracaoMin)} · {e.projetista}{conf[i].length ? " — ⚠️ já tem " + conf[i].map(o => o.cliente).join(", ") : ""}</div>)}
        {!dias.length && <div className="hint">Os dias adicionais serão removidos — fica só o dia 1.</div>}
      </div>
      {algum && <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, fontWeight: 600, marginTop: 10, color: "var(--danger)" }}><input type="checkbox" style={{ width: "auto" }} checked={enc} onChange={e => setEnc(e.target.checked)} />Confirmo o encaixe nos dias marcados em vermelho</label>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn primary" disabled={sal} onClick={ok}>OK, salvar</button>
      </div>
    </Modal>
  );
}

/** chips com os próximos horários livres; ao clicar escolhe a data e um projetista livre (o cliente não vê o nome) */
export function Sugestoes({ valor, onPick, excluirId, projetista }: { valor: string; onPick: (v: string, proj: string) => void; excluirId?: string; projetista?: string }) {
  const { st } = useApp() as any;
  const [so, setSo] = useState(false);
  const lst = sugestoes(st, excluirId, 10, so ? projetista : undefined);
  const v16 = (valor || "").slice(0, 16);
  const atual = v16.length === 16 ? livresNoHorario(st, v16, excluirId) : null;
  const conflito = atual && projetista && !atual.livres.includes(projetista);
  return (
    <div className="field full">
      <label style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>Horários livres sugeridos
        {projetista && <span style={{ fontWeight: 400, display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={so} onChange={e => setSo(e.target.checked)} />só os de {projetista}</span>}</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {lst.length ? lst.map(({ slot, livres }) => { const d = parseData(slot); return (
          <button type="button" key={slot} className={"chip" + (v16 === slot ? " on" : "")} title={"Livres: " + livres.join(", ")}
            onClick={() => onPick(slot, projetista && livres.includes(projetista) ? projetista : livres[0])}>
            {DIAS[d.getDay()].slice(0, 3)} {d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · <b>{slot.slice(11, 16)}</b> <span className="n">{livres.length} livre{livres.length > 1 ? "s" : ""}</span></button>); })
          : <span className="hint">Nenhum horário livre nas próximas semanas — revise em ⚙ Horários.</span>}
      </div>
      {atual && <span className="hint" style={{ color: conflito || !atual.livres.length ? "var(--danger)" : "var(--ink-soft)" }}>
        {conflito ? `⚠️ ${projetista} já está ocupado nesse horário. ` : !atual.livres.length ? "⚠️ Nenhum projetista livre nesse horário. " : ""}
        {atual.livres.length ? "Livres nesse horário: " + atual.livres.join(", ") + "." : ""}{atual.ocupados.length ? " Ocupados: " + atual.ocupados.join("; ") + "." : ""}</span>}
    </div>
  );
}

// ---------- calendário: DIA por projetista (padrão do sistema interno), semana e mês ----------
const H_FIM = 19, F_ALMOCO = 0.35;
const almocoH = (h: number) => h >= 13 && h < 15;
function Calendario() {
  const [modo, setModo] = useState<string>("dia");
  return (
    <>
      <div className="subnav" style={{ margin: "4px 0 0" }}>
        <button className={modo === "dia" ? "on" : ""} onClick={() => setModo("dia")}>Dia · por projetista</button>
        <button className={modo === "semana" ? "on" : ""} onClick={() => setModo("semana")}>Semana</button>
        <button className={modo === "mes" ? "on" : ""} onClick={() => setModo("mes")}>Mês</button>
      </div>
      {modo === "dia" ? <CalendarioDia /> : <CalendarioSemanaMes modo={modo as any} onModo={setModo} />}
    </>
  );
}
function CalendarioDia() {
  const { st, R: Rg, abrirDetalhe } = useApp() as any;
  const cfg = cfgAgenda(st); _projs = cfg.projetistas;
  const [dia, setDia] = useState(hoje());
  const [ocultos, setOcultos] = useState<string[]>([]);
  const [ofer, setOfer] = useState(true);
  const dur = cfg.duracaoMin || 120;
  // a agenda do dia cabe inteira na tela: a altura de cada hora se ajusta ao espaço livre (almoço fica estreito)
  const gradeRef = useRef<HTMLDivElement>(null);
  const [PX_H, setPX] = useState(60);
  const { setModal } = useApp() as any;
  const pega = useRef(0);
  const [estica, setEstica] = useState<{ id: string; fim: number } | null>(null);
  const snap = (m: number) => Math.max(H_INI * 60, Math.min(H_FIM * 60, Math.round(m / 30) * 30));
  const hhmm = (m: number) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  function soltar(e: React.DragEvent, proj: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain"); const c = st.chamados.find((x: any) => x.id === id); if (!c || !proj) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const d0 = durCk(c, cfg);
    const ini = Math.max(H_INI * 60, Math.min(snap(minOf(e.clientY - r.top - pega.current)), H_FIM * 60 - d0));
    const slot = dia + "T" + hhmm(ini), k = ck(c);
    if (proj === (k.projetista || "") && slot === String(k.agendadoPara || "").slice(0, 16)) return;
    setModal(<ModalMover c={c} data={slot} proj={proj} dur={durCk(c, cfg)} />);
  }
  function esticar(e: React.MouseEvent, c: any, ini: number, fim0: number) {
    e.preventDefault(); e.stopPropagation();
    const y0 = e.clientY; let fim = fim0;
    const yFim = yOf(fim0);
    const mv = (ev: MouseEvent) => { fim = Math.max(ini + 30, snap(minOf(yFim + ev.clientY - y0))); setEstica({ id: c.id, fim }); };
    const up = () => {
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); setEstica(null);
      if (fim !== fim0) setModal(<ModalMover c={c} data={String(ck(c).agendadoPara).slice(0, 16)} proj={ck(c).projetista || ""} dur={fim - ini} />);
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  }
  const mover = (n: number) => { const d = parseData(dia); do { d.setDate(d.getDate() + n); } while (!cfg.dias.includes(d.getDay()) && Math.abs(+d - +parseData(dia)) < 8 * 864e5); setDia(isoDia(d)); };
  type Ev = { c: any; ini: number; fim: number; proj: string; tipo: "ag" | "of"; lane?: number; lanes?: number; extra?: number; n?: number; total?: number };
  const minDe = (slot: string) => { const d = parseData(slot); return d.getHours() * 60 + d.getMinutes(); };
  const evs: Ev[] = st.chamados.filter((c: any) => c.tipo === "checklist" && c.status !== "concluida" && Rg.podeVer(c)).flatMap((c: any) => {
    const k = ck(c), e = etapaCk(c);
    if (e === "agendado") return atendimentos(c, cfg).filter(a => a.slot.slice(0, 10) === dia).map(a => { const ini = minDe(a.slot); return { c, ini, fim: ini + a.dur, proj: a.proj, tipo: "ag", extra: a.extra, n: a.n, total: a.total } as Ev; });
    if (ofer && e === "aguardando" && k.proposta && String(k.proposta).slice(0, 10) === dia) { const ini = minDe(String(k.proposta).slice(0, 16)); return [{ c, ini, fim: ini + dur, proj: k.propostaProjetista || "", tipo: "of" } as Ev]; }
    return [];
  });
  const H_INI = Math.max(7, Math.min(9, ...evs.map(x => Math.floor(x.ini / 60))));
  const hAlt = (h: number) => almocoH(h) ? PX_H * F_ALMOCO : PX_H;
  const yOf = (m: number) => { let y = 0; for (let h = H_INI; h < H_FIM; h++) { const a = h * 60; if (m <= a) break; y += hAlt(h) * Math.min(1, (m - a) / 60); } return y; };
  const minOf = (y: number) => { for (let h = H_INI; h < H_FIM; h++) { const a = hAlt(h); if (y <= a) return h * 60 + Math.max(0, y) / a * 60; y -= a; } return H_FIM * 60; };
  const unidades = Array.from({ length: H_FIM - H_INI }, (_, i) => almocoH(H_INI + i) ? F_ALMOCO : 1).reduce((a, b) => a + b, 0);
  const ALTURA = yOf(H_FIM * 60);
  useEffect(() => {
    const medir = () => {
      const el = gradeRef.current; if (!el) return;
      let sc: HTMLElement | null = el.parentElement, off = 0;
      while (sc) { const o = getComputedStyle(sc).overflowY; if ((o === "auto" || o === "scroll") && sc.scrollHeight > sc.clientHeight) { off = sc.scrollTop; break; } sc = sc.parentElement; }
      const topo = el.getBoundingClientRect().top + off + (sc ? 0 : window.scrollY);
      const cab = (el.firstElementChild?.nextElementSibling as HTMLElement | null)?.offsetHeight || 30; // linha com os nomes dos projetistas
      setPX(Math.max(34, Math.min(120, Math.floor((window.innerHeight - topo - cab - 34) / unidades))));
    };
    const r = requestAnimationFrame(medir); const t = setTimeout(medir, 300);
    window.addEventListener("resize", medir); return () => { cancelAnimationFrame(r); clearTimeout(t); window.removeEventListener("resize", medir); };
  }, [unidades, ocultos.length]);
  const semProj = evs.some(x => !x.proj);
  const emergD: string[] = cfg.emergencia || [];
  const colunas = [...cfg.projetistas.filter((n: string) => !emergD.includes(n)), ...cfg.projetistas.filter((n: string) => emergD.includes(n)), ...(semProj ? [""] : [])].filter(n => !ocultos.includes(n));
  const porCol: Record<string, Ev[]> = {};
  colunas.forEach(n => {
    const l = evs.filter(x => x.proj === n).sort((a, b) => a.ini - b.ini);
    // encaixes: eventos que se sobrepõem dividem a coluna
    const fins: number[] = [];
    l.forEach(x => { let i = fins.findIndex(f => f <= x.ini); if (i < 0) { i = fins.length; fins.push(0); } fins[i] = x.fim; x.lane = i; });
    l.forEach(x => (x.lanes = Math.max(1, ...l.filter(y => y.ini < x.fim && x.ini < y.fim).map(y => (y.lane || 0) + 1))));
    porCol[n] = l;
  });
  const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  const horas = Array.from({ length: H_FIM - H_INI }, (_, i) => H_INI + i);
  const d = parseData(dia);
  const almoco = almocoH;
  return (
    <div className="card" style={{ padding: "8px 12px", margin: "6px 0" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
        <button className="btn sm" style={{ background: "var(--ink)", color: "var(--surface)" }} onClick={() => mover(-1)}>&lt;</button>
        <button className="btn sm" style={{ background: "var(--ink)", color: "var(--surface)" }} onClick={() => setDia(hoje())}>Hoje</button>
        <button className="btn sm" style={{ background: "var(--ink)", color: "var(--surface)" }} onClick={() => mover(1)}>&gt;</button>
        <input type="date" value={dia} onChange={e => e.target.value && setDia(e.target.value)} style={{ width: "auto", padding: "4px 8px", borderRadius: 8 }} />
        <span style={{ width: 8 }} />
        {cfg.projetistas.map((n: string) => { const off = ocultos.includes(n); return (
          <button key={n} title={(off ? "Mostrar " : "Esconder ") + n} onClick={() => setOcultos(o => off ? o.filter(x => x !== n) : [...o, n])}
            style={{ width: 26, height: 24, borderRadius: 5, border: "none", cursor: "pointer", fontWeight: 800, color: "#fff", background: corProj(n), opacity: off ? .3 : 1 }}>{n[0]}</button>); })}
        {ocultos.length > 0 && <button className="btn ghost sm" onClick={() => setOcultos([])}>todos</button>}
        <label title="Amarelo tracejado = data oferecida, aguardando resposta do cliente · borda vermelha = encaixe" style={{ fontSize: 12, display: "flex", gap: 5, alignItems: "center", marginLeft: 6 }}><input type="checkbox" style={{ width: "auto" }} checked={ofer} onChange={e => setOfer(e.target.checked)} /><i style={{ width: 12, height: 10, borderRadius: 3, background: "#ffe8a3", border: "1.5px dashed #b8860b", display: "inline-block" }} />aguardando resposta</label>
        <b style={{ fontSize: 16, marginLeft: "auto" }}>{d.toLocaleDateString("pt-BR")} - {DIAS[d.getDay()]}</b>
        <span className="pill">{evs.filter(x => x.tipo === "ag").length} agendado(s)</span>
        <button className="btn sm" style={{ background: "var(--danger)", color: "#fff", borderColor: "var(--danger)" }} onClick={() => setModal(<ModalBloqueio dia={dia} />)}>🚫 Fechar agenda</button>
        <span className="pill" style={{ cursor: "help" }} title="Clique no cliente para abrir a ficha. Arraste o cliente para outro horário ou outra coluna para trocar o projetista; puxe a borda de baixo para aumentar ou diminuir o tempo. Toda alteração pede confirmação. Faixa hachurada estreita = almoço (13h às 15h). Clique na letra do projetista para esconder ou mostrar a coluna.">ⓘ como usar</span>
      </div>
      {bloqueiosEm(st, "", +parseData(dia + "T00:00"), +parseData(dia + "T00:00") + 864e5).filter((b: any) => !b.projetista).map((b: any) =>
        <div key={"bt" + b.id} onClick={() => setModal(<ModalReabrir b={b} />)} style={{ cursor: "pointer", margin: "0 0 6px", padding: "6px 10px", borderRadius: 8, background: "var(--danger-bg)", border: "1.5px solid var(--danger)", color: "var(--danger)", fontWeight: 800, fontSize: 13 }}>
          {rotuloBloq(b)} — agenda fechada para todos {b.inicio.slice(11, 16) !== "00:00" || b.fim.slice(11, 16) !== "00:00" ? `(${b.inicio.slice(11, 16)} às ${b.fim.slice(11, 16)})` : ""} · clique para reabrir</div>)}
      <div style={{ overflowX: "auto" }}>
        <div ref={gradeRef} style={{ display: "grid", gridTemplateColumns: `40px repeat(${colunas.length}, minmax(150px, 1fr))`, minWidth: 40 + colunas.length * 150 }}>
          <div />
          {colunas.map(n => <div key={"h" + n} style={{ padding: "6px 8px", fontSize: 13, fontWeight: 700, borderBottom: `3px solid ${n ? corProj(n) : "var(--ink-faint)"}` }}>{n || "Sem projetista"}{emergD.includes(n) ? <span style={{ fontWeight: 400, fontSize: 11, color: "var(--ink-faint)" }}> · emergência</span> : null}</div>)}
          <div style={{ position: "relative", height: ALTURA }}>
            {horas.map(h => <div key={h} style={{ position: "absolute", top: yOf(h * 60), height: hAlt(h), width: "100%", fontSize: almoco(h) ? 10 : 12, color: "var(--ink-soft)", borderTop: "1px solid var(--line)", padding: "1px 4px", overflow: "hidden" }}>{String(h).padStart(2, "0")}</div>)}
          </div>
          {colunas.map(n => (
            <div key={"c" + n} onDragOver={e => { if (n) e.preventDefault(); }} onDrop={e => soltar(e, n)}
              style={{ position: "relative", height: ALTURA, borderLeft: "1px solid var(--line)", background: "var(--surface-2)" }}>
              {horas.map(h => <div key={h} style={{ position: "absolute", top: yOf(h * 60), height: hAlt(h), left: 0, right: 0, borderTop: "1px solid var(--line-soft)", background: almoco(h) ? "repeating-linear-gradient(45deg, transparent 0 6px, rgba(128,128,128,.08) 6px 12px)" : undefined }} />)}
              {n && bloqueiosEm(st, n, +parseData(dia + "T00:00"), +parseData(dia + "T00:00") + 864e5).map((b: any) => {
                const d0 = +parseData(dia + "T00:00"), bi = Math.max(H_INI * 60, (+parseData(b.inicio) - d0) / 6e4), bf = Math.min(H_FIM * 60, (+parseData(b.fim) - d0) / 6e4);
                if (bf <= bi) return null;
                return <div key={"b" + b.id} onClick={() => setModal(<ModalReabrir b={b} />)} title={rotuloBloq(b) + " — clique para reabrir"}
                  style={{ position: "absolute", top: yOf(bi), height: Math.max(20, yOf(bf) - yOf(bi)), left: 2, right: 2, borderRadius: 4, cursor: "pointer", zIndex: 1, padding: "4px 6px", fontSize: 11.5, fontWeight: 800, color: "#7a1f1f",
                    background: "repeating-linear-gradient(45deg, rgba(200,60,60,.16) 0 8px, rgba(200,60,60,.08) 8px 16px)", border: "1.5px solid rgba(200,60,60,.5)" }}>{rotuloBloq(b)}</div>;
              })}
              {(porCol[n] || []).map(x0 => { let x = x0;
                const k = ck(x.c), p = k.planilha || {}, cor = n ? corProj(n) : "#6b7280";
                if (estica && estica.id === x.c.id && (x.extra ?? -1) < 0) x = { ...x, fim: estica.fim };
                const top = yOf(Math.max(x.ini, H_INI * 60)), alt = Math.max(24, yOf(Math.min(x.fim, H_FIM * 60)) - top - 3);
                const compacto = alt < 84, mini = alt < 44;
                const w = 100 / (x.lanes || 1), conf = k.confirmacao;
                return (
                  <div key={x.c.id + ":" + (x.extra ?? -1)} onClick={() => abrirDetalhe(x.c.id)} title={x.c.cliente + (x.tipo === "ag" && (x.extra ?? -1) < 0 ? " — arraste para outro horário ou projetista" : (x.extra ?? -1) >= 0 ? " — dia adicional (altere na ficha do cliente)" : "")}
                    draggable={x.tipo === "ag" && (x.extra ?? -1) < 0} onDragStart={e => { e.dataTransfer.setData("text/plain", x.c.id); e.dataTransfer.effectAllowed = "move"; pega.current = e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top; }}
                    style={{ position: "absolute", zIndex: 2, top: top + 1, height: alt, left: `calc(${(x.lane || 0) * w}% + 3px)`, width: `calc(${w}% - 6px)`, overflow: "hidden", cursor: "pointer",
                      borderRadius: 4, padding: "4px 6px", fontSize: 11.5, lineHeight: 1.3, color: x.tipo === "ag" ? "#fff" : "#6b4a00",
                      background: x.tipo === "ag" ? cor : "#ffe8a3", border: x.tipo === "ag" ? (k.encaixe ? "2.5px solid var(--danger)" : "none") : `2px dashed ${cor}` }}>
                    <div style={{ fontWeight: 800, fontSize: compacto ? 11.5 : 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.tipo === "of" ? "⏳ " : k.encaixe ? "⚠️ " : ""}{hm(x.ini)} - {hm(x.fim)}{(x.total || 1) > 1 ? ` · dia ${x.n}/${x.total}` : ""}{x.tipo === "ag" && compacto ? (conf === "confirmada" ? " ✅" : conf === "enviada" ? " 📨" : " ⏳") : ""}</div>
                    <div style={{ fontWeight: 700, textTransform: "uppercase", color: x.tipo === "ag" ? "#ffe9a8" : "#3d2a00", whiteSpace: compacto ? "nowrap" : undefined, overflow: "hidden", textOverflow: "ellipsis", overflowWrap: "anywhere" }}>{x.c.cliente}</div>
                    {!mini && (compacto ? <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtTel(x.c.telefone) || "sem contato"} · {x.c.pedido}</div> : <>
                      <div>{fmtTel(x.c.telefone) || "sem contato"}</div>
                      <div>Venda {x.c.pedido}</div>
                      {x.tipo === "ag" ? <div><b>Presença:</b> {conf === "confirmada" ? "Confirmada ✅" : conf === "enviada" ? "Aguardando" : "A confirmar"}</div>
                        : <div style={{ fontWeight: 700 }}>Aguardando resposta</div>}</>)}
                    {x.tipo === "ag" && (x.extra ?? -1) < 0 && <div title="Arraste para aumentar ou diminuir o tempo" onClick={e => e.stopPropagation()} onMouseDown={e => esticar(e, x.c, x.ini, x.fim)}
                      style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 7, cursor: "ns-resize", background: "rgba(255,255,255,.35)" }} />}
                  </div>);
              })}
            </div>))}
        </div>
      </div>
    </div>
  );
}

// ---------- calendário (semana / mês) ----------
function CalendarioSemanaMes({ modo: modo0, onModo }: { modo: "semana" | "mes"; onModo: (m: string) => void }) {
  const { st, R: Rg, abrirDetalhe } = useApp() as any;
  const cfg = cfgAgenda(st); _projs = cfg.projetistas;
  const modo = modo0; const setModo = (m: any) => onModo(m);
  const [ref, setRef] = useState(hoje());
  const [fp, setFp] = useState("");
  const [ofer, setOfer] = useState(true);
  const evs = st.chamados.filter((c: any) => c.tipo === "checklist" && c.status !== "concluida" && Rg.podeVer(c)).map((c: any) => {
    const k = ck(c), e = etapaCk(c);
    if (e === "agendado" && k.agendadoPara) return atendimentos(c, cfg).map(a => ({ c, quando: a.slot, tipo: "ag", proj: a.proj, enc: !!k.encaixe && a.extra < 0, n: a.n, total: a.total }));
    if (ofer && e === "aguardando" && k.proposta) return [{ c, quando: String(k.proposta).slice(0, 16), tipo: "of", proj: k.propostaProjetista || "" }];
    return [];
  }).flat().filter((x: any) => !fp || x.proj === fp) as any[];
  const porDia: Record<string, any[]> = {};
  evs.forEach(x => (porDia[x.quando.slice(0, 10)] = porDia[x.quando.slice(0, 10)] || []).push(x));
  Object.values(porDia).forEach(l => l.sort((a, b) => a.quando.localeCompare(b.quando)));
  const r = parseData(ref);
  const mover = (n: number) => { const d = parseData(ref); if (modo === "semana") d.setDate(d.getDate() + 7 * n); else d.setMonth(d.getMonth() + n, 1); setRef(isoDia(d)); };
  const seg = new Date(r); seg.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  const diasSemana = Array.from({ length: 7 }, (_, i) => { const d = new Date(seg); d.setDate(seg.getDate() + i); return d; }).filter(d => cfg.dias.includes(d.getDay()) || (porDia[isoDia(d)] || []).length);
  const horas = Array.from(new Set([...cfg.horarios, ...diasSemana.flatMap(d => (porDia[isoDia(d)] || []).map((x: any) => x.quando.slice(11, 16)))])).sort();
  const Ev = ({ x, compacto }: any) => (
    <div onClick={() => abrirDetalhe(x.c.id)} title={x.c.cliente + " · venda " + x.c.pedido + (x.proj ? " · " + x.proj : "")}
      style={{ cursor: "pointer", borderRadius: 7, padding: compacto ? "2px 6px" : "5px 7px", marginBottom: 4, fontSize: compacto ? 11.5 : 12.5, lineHeight: 1.25,
        background: x.tipo === "ag" ? corProj(x.proj) : "#ffe8a3", color: x.tipo === "ag" ? "#fff" : "#6b4a00", border: x.tipo === "ag" ? "none" : "1.5px dashed " + (x.proj ? corProj(x.proj) : "var(--warn)"),
        outline: x.enc ? "2.5px solid var(--danger)" : undefined, outlineOffset: x.enc ? 1 : undefined,
        whiteSpace: compacto ? "nowrap" : undefined, overflow: "hidden", textOverflow: "ellipsis" }}>
      {x.enc && "⚠️ "}{compacto && <b>{x.quando.slice(11, 16)} </b>}{x.c.cliente}{(x.total || 1) > 1 && <b> · dia {x.n}/{x.total}</b>}{compacto && <span style={{ opacity: .85 }}> · {x.c.pedido}</span>}{!compacto && <div style={{ opacity: .9, fontSize: 11 }}>Venda {x.c.pedido} · {x.tipo === "ag" ? (x.proj || "sem projetista") : "oferecido" + (x.proj ? " · " + x.proj : "") + " · aguardando"}</div>}
    </div>);
  const titulo = modo === "semana" ? `Semana de ${seg.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : r.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const ini = new Date(r.getFullYear(), r.getMonth(), 1); const g0 = new Date(ini); g0.setDate(1 - ((ini.getDay() + 6) % 7));
  const celulas = Array.from({ length: 42 }, (_, i) => { const d = new Date(g0); d.setDate(g0.getDate() + i); return d; });
  const th: React.CSSProperties = { padding: "8px 6px", fontSize: 12.5, fontWeight: 700, borderBottom: "1px solid var(--line)", textAlign: "center", background: "var(--surface-2)" };
  return (
    <div className="card" style={{ padding: "12px 14px", margin: "14px 0" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <button className="btn sm" onClick={() => mover(-1)}>‹</button>
        <button className="btn sm" onClick={() => setRef(hoje())}>Hoje</button>
        <button className="btn sm" onClick={() => mover(1)}>›</button>
        <b style={{ fontSize: 16, marginLeft: 6, textTransform: "capitalize" }}>{titulo}</b>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={fp} onChange={e => setFp(e.target.value)} style={{ padding: "6px 8px", borderRadius: 8, width: "auto", maxWidth: 220 }}><option value="">Todos os projetistas</option>{cfg.projetistas.map((n: string) => <option key={n} value={n}>{n}{(cfg.emergencia || []).includes(n) ? " (emergência)" : ""}</option>)}</select>
          <label style={{ fontSize: 12.5, display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={ofer} onChange={e => setOfer(e.target.checked)} />mostrar datas oferecidas</label>
          <div className="subnav" style={{ margin: 0 }}><button className={modo === "semana" ? "on" : ""} onClick={() => setModo("semana")}>Semana</button><button className={modo === "mes" ? "on" : ""} onClick={() => setModo("mes")}>Mês</button></div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10, fontSize: 12 }}>
        {cfg.projetistas.map((n: string) => <span key={n} style={{ display: "flex", gap: 5, alignItems: "center" }}><i style={{ width: 11, height: 11, borderRadius: 3, background: corProj(n), display: "inline-block" }} />{n}</span>)}
        <span style={{ display: "flex", gap: 5, alignItems: "center" }}><i style={{ width: 11, height: 11, borderRadius: 3, background: "var(--ink-faint)", display: "inline-block" }} />sem projetista</span>
        <span style={{ display: "flex", gap: 5, alignItems: "center" }}><i style={{ width: 11, height: 11, borderRadius: 3, border: "1.5px dashed var(--warn)", display: "inline-block" }} />oferecido, aguardando o cliente</span>
      </div>
      {modo === "semana" ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 120 + diasSemana.length * 130 }}>
            <thead><tr><th style={{ ...th, width: 60 }}></th>{diasSemana.map(d => { const iso = isoDia(d); return <th key={iso} style={{ ...th, color: iso === hoje() ? "var(--st-concluida)" : undefined }}>{DIAS[d.getDay()].split("-")[0]}<div style={{ fontSize: 15 }}>{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</div><BloqDia dia={iso} /></th>; })}</tr></thead>
            <tbody>{horas.map(h => <tr key={h}>
              <td style={{ padding: "6px", fontWeight: 700, fontSize: 13, borderBottom: "1px solid var(--line-soft)", verticalAlign: "top", color: "var(--ink-soft)" }}>{h}</td>
              {diasSemana.map(d => { const iso = isoDia(d); const l = (porDia[iso] || []).filter((x: any) => x.quando.slice(11, 16) === h);
                return <td key={iso + h} style={{ padding: 4, borderBottom: "1px solid var(--line-soft)", borderLeft: "1px solid var(--line-soft)", verticalAlign: "top", height: 46, background: iso === hoje() ? "var(--st-concluida-bg)" : undefined }}>{l.map((x: any) => <Ev key={x.c.id} x={x} />)}</td>; })}
            </tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          {["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map(n => <div key={n} style={th}>{n}</div>)}
          {celulas.map(d => { const iso = isoDia(d), l = porDia[iso] || [], fora = d.getMonth() !== r.getMonth();
            return <div key={iso} onClick={() => { setRef(iso); setModo("semana"); }} style={{ minHeight: 92, padding: 5, borderTop: "1px solid var(--line-soft)", borderLeft: "1px solid var(--line-soft)", cursor: "pointer", opacity: fora ? .45 : 1, background: iso === hoje() ? "var(--st-concluida-bg)" : undefined }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 3, display: "flex", justifyContent: "space-between" }}><span>{d.getDate()}</span>{l.length > 0 && <span className="pill">{l.length}</span>}</div>
              <BloqDia dia={iso} />
              {l.slice(0, 4).map((x: any) => <Ev key={x.c.id} x={x} compacto />)}
              {l.length > 4 && <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>+{l.length - 4} — clique para ver</div>}
            </div>; })}
        </div>
      )}
      <div className="hint" style={{ marginTop: 8 }}>Clique no cliente para abrir a ficha. No mês, clique no dia para ver a semana.</div>
    </div>
  );
}

function ModalHorarios() {
  const { st, setModal, toast, recarregar } = useApp() as any;
  const cfg = { ...AGENDA_PADRAO, ...(st.config.checklistAgenda || {}) };
  const [dias, setDias] = useState<number[]>(cfg.dias); const [hs, setHs] = useState(cfg.horarios.join(", "));
  const [dur, setDur] = useState(String((cfg.duracaoMin || 120) / 60).replace(".", ",")); const [seg, setSeg] = useState(String(cfg.seguraDias)); const [confD, setConfD] = useState(String(cfg.confirmarDias ?? 2)); const [projs, setProjs] = useState((cfg.projetistas || []).join(", ")); const [emerg, setEmerg] = useState((cfg.emergencia || []).join(", "));
  const fechar = () => setModal(null);
  async function salvar() {
    const horarios = hs.split(/[,;\s]+/).map((x: string) => x.trim()).filter(Boolean).map((x: string) => x.length === 4 ? "0" + x : x);
    try { await A.salvarChecklistAgenda({ dias, horarios, vagas: 1, duracaoMin: Math.round(Number(dur.replace(",", ".")) * 60) || 120, seguraDias: Number(seg), confirmarDias: Number(confD), projetistas: projs.split(",").map((x: string) => x.trim()).filter(Boolean), emergencia: emerg.split(",").map((x: string) => x.trim()).filter(Boolean) }); await recarregar(); fechar(); toast("Horários do checklist salvos"); }
    catch (x: any) { toast(x.message); }
  }
  return (
    <Modal titulo="Horários do checklist" onFechar={fechar}>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 12px" }}>Usados para sugerir dias e horários livres. Cada horário tem uma vaga por projetista; a vaga fica ocupada quando o projetista tem cliente agendado ou um horário oferecido que o cliente ainda não respondeu.</p>
      <div className="field" style={{ marginBottom: 12 }}><label>Dias de atendimento</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{[1, 2, 3, 4, 5, 6, 0].map(d => <label key={d} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 14 }}><input type="checkbox" style={{ width: "auto" }} checked={dias.includes(d)} onChange={e => setDias(x => e.target.checked ? [...x, d] : x.filter(y => y !== d))} />{DIAS[d].split("-")[0]}</label>)}</div></div>
      <div className="grid">
        <div className="field full"><label>Horários (separados por vírgula)</label><input value={hs} onChange={e => setHs(e.target.value)} placeholder="09:00, 11:00, 15:00, 17:00" /></div>
        <div className="field full"><label>Projetistas do checklist (separados por vírgula)</label><input value={projs} onChange={e => setProjs(e.target.value)} placeholder="Silvane, Rafael, Angela" /></div>
        <div className="field full"><label>Só para emergência <span className="hint">(aparecem na agenda e podem ser escolhidos à mão, mas não entram nas sugestões de horário)</span></label><input value={emerg} onChange={e => setEmerg(e.target.value)} placeholder="Giovanni" /></div>
        <div className="field"><label>Duração de cada atendimento (horas)</label><input inputMode="decimal" value={dur} onChange={e => setDur(e.target.value)} /><span className="hint">Cada projetista atende um cliente por vez.</span></div>
        <div className="field"><label>Pedir confirmação de presença com (dias de antecedência)</label><input type="number" min={0} max={15} value={confD} onChange={e => setConfD(e.target.value)} /><span className="hint">Agendados com data nesse prazo aparecem em “Confirmação de presença”.</span></div>
        <div className="field"><label>Segurar a data oferecida por (dias)</label><input type="number" min={0} max={15} value={seg} onChange={e => setSeg(e.target.value)} /><span className="hint">Enquanto o cliente não responde, o horário oferecido não é sugerido para outro.</span></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}><button className="btn primary" onClick={salvar}>Salvar</button><button className="btn ghost" onClick={fechar}>Cancelar</button></div>
    </Modal>
  );
}

const proximoDiaUtil = () => { const d = new Date(); d.setDate(d.getDate() + 1); while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T10:00`; };

export function ModalWhats({ c, inicial }: any) {
  const { R, st, setModal, toast, recarregar } = useApp() as any;
  const k = ck(c), e = etapaCk(c);
  const projs: string[] = cfgAgenda(st).projetistas;
  const [tipo, setTipo] = useState(inicial || (e === "agendado" ? "confirmacao" : e === "aguardando" || e === "sem_resposta" ? "cobranca" : ["em_obras", "outra_data", "espera"].includes(e) ? "retorno" : "primeiro"));
  const primeira = e === "agendado" || k.proposta ? null : sugestoes(st, c.id, 1)[0];
  const [data, setData] = useState<string>(String((e === "agendado" ? k.agendadoPara : k.proposta) || (primeira && primeira.slot) || proximoDiaUtil()).slice(0, 16));
  const [proj, setProj] = useState<string>((e === "agendado" ? k.projetista : k.propostaProjetista) || (primeira && primeira.livres[0]) || "");
  const tels = [c.telefone, k.telefone2].filter((t: string) => t && t.replace(/\D/g, "").length >= 10);
  const [tel, setTel] = useState(tels[0] || "");
  const rem = primeiroNome(R.me()?.nome || "");
  const [txt, setTxt] = useState(""); const [editado, setEditado] = useState(false);
  const [encaixe, setEncaixe] = useState(false);
  const texto = editado ? txt : mensagemCk(tipo, c, data, rem);
  const comData = tipo === "primeiro" || tipo === "retorno";
  const fechar = () => setModal(null);
  async function enviar() {
    const n = sanitizeWhats(tel);
    if (!n) { toast("Cliente sem telefone válido"); return; }
    if (tipo !== "confirmacao" && !data) { toast("Escolha a data e o horário oferecidos"); return; }
    if (comData && !proj) { toast("Escolha o projetista que vai atender (o cliente não vê)"); return; }
    if (comData && conflitosProj(st, data, proj, c.id).length && !encaixe) { toast("Esse horário já tem cliente com " + proj + " — marque “Confirmo o encaixe” ou escolha outro horário/projetista"); return; }
    try {
      if (comData) await A.checklistRegistrar(c.id, { acao: "mensagem", data, projetista: proj, encaixe, texto });
      else if (tipo === "cobranca") await A.checklistRegistrar(c.id, { acao: "cobranca", texto });
      else if (tipo === "confirmacao" && e === "agendado") await A.checklistRegistrar(c.id, k.confirmacao === "confirmada" ? { acao: "nota", texto } : { acao: "confirmacao_enviada", texto });
    } catch (x: any) { toast(x.message); return; }
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(texto)}`, "_blank");
    await recarregar(); fechar(); toast(tipo === "confirmacao" ? (k.confirmacao === "confirmada" ? "WhatsApp aberto — mensagem salva no cliente" : "Confirmação enviada — cliente em “Aguardando confirmação de presença”") : "Contato registrado — quando o cliente responder, registre o resultado");
  }
  return (
    <Modal titulo={"WhatsApp · " + c.cliente} onFechar={fechar}>
      <div className="grid">
        <div className="field"><label>Mensagem</label><select value={tipo} onChange={ev => { setTipo(ev.target.value); setEditado(false); }}>{Object.entries(MODELOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label>Telefone</label>{tels.length > 1 ? <select value={tel} onChange={ev => setTel(ev.target.value)}>{tels.map((t: string) => <option key={t} value={t}>{t}</option>)}</select> : <input value={tel} onChange={ev => setTel(ev.target.value)} placeholder="DDD + número" />}</div>
        <div className="field"><label>{tipo === "confirmacao" ? "Data agendada" : "Data e horário oferecidos"} <span className="req-star">*</span></label><input type="datetime-local" value={data} disabled={tipo === "cobranca"} onChange={ev => { setData(ev.target.value); setEditado(false); }} /></div>
        {comData && <div className="field"><label>Projetista que vai atender <span className="req-star">*</span> <span className="hint">(não vai na mensagem)</span></label><select value={proj} onChange={ev => setProj(ev.target.value)}><option value="">Selecione…</option>{projs.map(n => <option key={n} value={n}>{n}</option>)}</select></div>}
        {comData && <AvisoEncaixe slot={data} proj={proj} excluirId={c.id} ok={encaixe} setOk={setEncaixe} />}
        {comData && <Sugestoes valor={data} excluirId={c.id} projetista={proj} onPick={(v, pj) => { setData(v); if (pj) setProj(pj); setEncaixe(false); setEditado(false); }} />}
        <div className="field full"><label>Texto (pode editar antes de enviar)</label><textarea rows={13} value={texto} onChange={ev => { setTxt(ev.target.value); setEditado(true); }} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn primary" onClick={enviar}>Abrir WhatsApp{tipo === "confirmacao" ? "" : " e registrar o contato"}</button>
        <button className="btn ghost" onClick={fechar}>Cancelar</button>
      </div>
      {comData && <div className="hint" style={{ marginTop: 10 }}>O horário fica reservado para {proj || "o projetista"} por {cfgAgenda(st).seguraDias} dia(s) enquanto o cliente não responde.</div>}
    </Modal>
  );
}

const ACOES: Record<string, string> = {
  agendado: "✅ Aceitou — checklist agendado", espera: "⏸ Colocar em aguardando (com motivo)", outra_data: "🔄 Pediu outra data", em_obras: "🚧 Ambiente em obra", sem_resposta: "📵 Não respondeu",
  medida: "📐 Precisa de medida (pedir ao setor de Medidas)", realizado: "☑️ Checklist realizado", desistiu: "⛔ Encerrar sem checklist",
};
const ACOES_AGENDADO: Record<string, string> = {
  realizado: "☑️ Checklist realizado", presenca_confirmada: "✅ Cliente confirmou presença", confirmacao_enviada: "📨 Confirmação já enviada (por fora do 360)", reagendar: "🔁 Alterar agendamento (nova data)", projetista: "👤 Informar / trocar o projetista", desmarcar: "❌ Desmarcar agendamento", desistiu: "⛔ Encerrar sem checklist",
};
export function ModalResultado({ c, inicial }: any) {
  const { setModal, toast, recarregar } = useApp() as any;
  const k = ck(c), fechado = c.status === "concluida", agendado = etapaCk(c) === "agendado";
  const [acao, setAcao] = useState(inicial || (fechado ? "reabrir" : agendado ? "realizado" : "agendado"));
  const [data, setData] = useState<string>(inicial === "reagendar" ? "" : String(k.proposta || k.agendadoPara || "").slice(0, 16));
  const [ret, setRet] = useState(""); const [pronto, setPronto] = useState(false); const [obs, setObs] = useState("");
  const { st } = useApp() as any; const projs: string[] = cfgAgenda(st).projetistas;
  const [proj, setProj] = useState<string>(k.projetista || k.propostaProjetista || "");
  const [encaixe, setEncaixe] = useState(false);
  const [motivo, setMotivo] = useState<string>(k.motivoEspera || "");
  const slotAlvo = acao === "projetista" ? String(k.agendadoPara || "") : data;
  const SelProj = ({ req }: any) => <div className="field"><label>Projetista {req && <span className="req-star">*</span>}</label><select value={proj} onChange={e => setProj(e.target.value)}><option value="">Selecione…</option>{projs.map(n => <option key={n} value={n}>{n}</option>)}</select></div>;
  const fechar = () => setModal(null);
  async function salvar() {
    try {
      if (acao === "medida") await A.checklistPedirMedida(c.id, obs);
      else {
        if (["agendado", "projetista"].includes(acao) && !proj) { toast("Escolha o projetista"); return; }
        if (["agendado", "reagendar", "projetista"].includes(acao) && conflitosProj(st, slotAlvo, proj, c.id).some(o => !o.aguardando) && !encaixe) { toast(proj + " já tem cliente agendado nesse horário — marque “Confirmo o encaixe” ou escolha outro horário/projetista"); return; }
        if (acao === "espera" && !motivo) { toast("Escolha o motivo"); return; }
        await A.checklistRegistrar(c.id, { acao, data, retornarEm: ret, ambiente: pronto ? "pronto" : "", obs, projetista: proj, encaixe, motivo });
      }
      await recarregar(); fechar(); toast(acao === "agendado" ? "Agendado — o cliente foi para 📅 Agendados" : acao === "reagendar" ? "Data alterada — altere também no sistema interno" : acao === "desmarcar" ? "Agendamento desmarcado — o cliente voltou para contato" : acao === "espera" ? "Cliente movido para ⏸ Aguardando" : acao === "presenca_confirmada" ? "Presença confirmada" : "Registrado");
    } catch (x: any) { toast(x.message); }
  }
  return (
    <Modal titulo={"Resultado do contato · " + c.cliente} onFechar={fechar}>
      {fechado ? <p style={{ fontSize: 13.5 }}>Este checklist está encerrado. Reabrir volta o cliente para “A contatar”.</p> :
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {Object.entries(agendado ? ACOES_AGENDADO : ACOES).filter(([v]) => v !== "medida" || !k.medidaId || k.medidaOk).map(([v, l]) => <label key={v} style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 14 }}><input type="radio" style={{ width: "auto" }} checked={acao === v} onChange={() => setAcao(v)} />{l}</label>)}
        </div>}
      <div className="grid">
        {agendado && k.agendadoPara && ["reagendar", "desmarcar"].includes(acao) && <div className="field full"><label>Agendamento atual</label><div style={{ fontWeight: 700, fontSize: 15 }}>📅 {dataLonga(String(k.agendadoPara))}</div></div>}
        {acao === "reagendar" && <>
          <div className="field"><label>Nova data e horário <span className="req-star">*</span></label><input type="datetime-local" value={data} onChange={e => setData(e.target.value)} /></div>
          <SelProj />
          <Sugestoes valor={data} excluirId={c.id} onPick={(v, pj) => { setData(v); if (pj) setProj(pj); }} projetista={proj} />
          <div className="hint" style={{ gridColumn: "1 / -1", fontSize: 12.5 }}>Depois de salvar, altere também no sistema interno. A confirmação de presença volta para “a confirmar”.</div>
        </>}
        {acao === "desmarcar" && <>
          <div className="field"><label>Retornar o contato em <span className="hint">(vazio = volta para “A contatar”)</span></label><input type="date" min={hoje()} value={ret} onChange={e => setRet(e.target.value)} /></div>
          <div className="hint" style={{ gridColumn: "1 / -1", fontSize: 12.5 }}>O horário fica livre para outro cliente. Desmarque também no sistema interno.</div>
        </>}
        {acao === "projetista" && <SelProj req />}
        {["agendado", "reagendar", "projetista"].includes(acao) && <AvisoEncaixe slot={slotAlvo} proj={proj} excluirId={c.id} ok={encaixe} setOk={setEncaixe} />}
        {acao === "agendado" && <>
          <div className="field"><label>Data e horário agendados <span className="req-star">*</span></label><input type="datetime-local" value={data} onChange={e => setData(e.target.value)} /></div>
          <SelProj req />
          <Sugestoes valor={data} excluirId={c.id} onPick={(v, pj) => { setData(v); if (pj) setProj(pj); }} projetista={proj} />
          <label className="field full" style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" style={{ width: "auto" }} checked={pronto} onChange={e => setPronto(e.target.checked)} /><span>Cliente confirmou que o <b>ambiente está pronto</b> para a montagem (sem obra, acabamentos feitos) <span className="req-star">*</span></span></label>
          <div className="hint" style={{ gridColumn: "1 / -1", fontSize: 12.5 }}>Ambiente ainda em obra não pode ser finalizado — nesse caso use “Ambiente em obra”. Depois de registrar aqui, lance o agendamento no sistema interno.</div>
        </>}
        {acao === "outra_data" && <>
          <div className="field"><label>Data e horário que o cliente pediu</label><input type="datetime-local" value={data} onChange={e => setData(e.target.value)} /></div>
          <Sugestoes valor={data} excluirId={c.id} onPick={v => setData(v)} />
          <div className="field"><label>Ou: retornar o contato em</label><input type="date" min={hoje()} value={ret} onChange={e => setRet(e.target.value)} /></div>
        </>}
        {acao === "espera" && <>
          <div className="field"><label>Motivo <span className="req-star">*</span></label><select value={motivo} onChange={e => setMotivo(e.target.value)}><option value="">Selecione…</option>{Object.entries(MOTIVOS_ESPERA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field"><label>Retornar o contato em <span className="hint">(opcional)</span></label><input type="date" min={hoje()} value={ret} onChange={e => setRet(e.target.value)} /></div>
        </>}
        {acao === "em_obras" && <div className="field"><label>Previsão de fim da obra — retornar em <span className="req-star">*</span></label><input type="date" min={hoje()} value={ret} onChange={e => setRet(e.target.value)} /></div>}
        {acao === "sem_resposta" && <div className="field"><label>Tentar de novo em <span className="hint">(vazio = 2 dias)</span></label><input type="date" min={hoje()} value={ret} onChange={e => setRet(e.target.value)} /></div>}
        <div className="field full"><label>{acao === "desmarcar" ? "Motivo" : acao === "espera" ? "Detalhe do motivo" : "Observação"} {(["desistiu", "desmarcar"].includes(acao) || (acao === "espera" && motivo === "outro")) && <span className="req-star">*</span>}</label><textarea value={obs} onChange={e => setObs(e.target.value)} placeholder={acao === "medida" ? "Ex.: cliente disse que mudou a parede da cozinha" : "O que o cliente disse"} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}><button className="btn primary" onClick={salvar}>{fechado ? "Reabrir" : "Salvar"}</button><button className="btn ghost" onClick={fechar}>Cancelar</button></div>
    </Modal>
  );
}
