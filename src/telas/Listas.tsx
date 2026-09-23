import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { LIMITE_INATIVIDADE_H, ORDEM, STATUS, STATUS_CLIENTE } from "../lib/regras";
import { Ticket, Vazio } from "../comp/Ticket";

const Busca = ({ id, ph, v, set }: any) => (
  <div className="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
    <input id={id} placeholder={ph} value={v} onChange={e => set(e.target.value)} /></div>
);

// busca por qualquer dado que o cliente informa ao telefone
const texto = (c: any) => [c.id, c.cliente, c.clienteDoc, c.telefone, c.pedido, c.pedidoFabrica, c.produto, c.venda && c.venda.numero].filter(Boolean).join(" ").toLowerCase();
const bate = (c: any, q: string) => { const t = q.trim().toLowerCase(); if (!t) return true; const dig = t.replace(/\D/g, ""); return texto(c).includes(t) || (dig.length >= 4 && texto(c).replace(/\D/g, "").includes(dig)); };

// ---------- Fila (call center) ----------
// Os filtros de prioridade são exclusivos: cada chamado aparece em só uma faixa (crítico, atrasado, urgente).
export function Fila() {
  const { R, st, preset } = useApp();
  const [filtro, setFiltro] = useState("abertos");
  const [fTipo, setFTipo] = useState("");
  const [fSetor, setFSetor] = useState(preset?.setor || "");
  const [q, setQ] = useState("");
  useEffect(() => { if (preset?.setor) { setFSetor(preset.setor); setFiltro("abertos"); setFTipo(""); } }, [preset]);
  const vt = R.verTudo();
  const ccTudo = !vt && R.ehCallcenter();
  const [escopo, setEscopo] = useState<"minha" | "todos">("minha");
  const verSetor = vt || (ccTudo && escopo === "todos");
  // base = o que está no escopo + filtros de motivo/setor/busca; os números dos botões saem daqui (batem com a lista)
  const base = st.chamados.filter(c => !R.domMarketing(c) && R.podeVer(c) && (!ccTudo || escopo === "todos" || R.naMinhaFila(c))
    && (!fTipo || c.tipo === fTipo) && (!verSetor || !fSetor || c.setorDestino === fSetor) && bate(c, q));
  const FILTROS: Record<string, (c: any) => boolean> = {
    abertos: c => c.status !== "concluida",
    criticos: c => R.prioridade(c) === "critico",
    atrasados: c => R.prioridade(c) === "atrasado",
    urgentes: c => R.prioridade(c) === "urgente",
    aberta: c => c.status === "aberta", tratativa: c => c.status === "tratativa", respondida: c => c.status === "respondida", concluida: c => c.status === "concluida",
    todos: () => true,
  };
  const chips = [["abertos", "Em aberto"], ["criticos", "Críticos (+24h)"], ["atrasados", "Atrasados"], ["urgentes", "Urgentes no prazo"], ["aberta", "Abertas"], ["tratativa", "Em tratativa"], ["respondida", "Respondidas"], ["concluida", "Concluídas"], ["todos", "Todos"]];
  const cont: Record<string, number> = {}; chips.forEach(([k]) => (cont[k] = base.filter(FILTROS[k]).length));
  const arr = R.ordenar(base.filter(FILTROS[filtro] || FILTROS.todos));
  return (
    <section className="view active" id="view-fila">
      <div className="view-head"><div>
        <h2 id="filaTitulo">{vt ? "Acompanhamento Call center" : ccTudo && escopo === "todos" ? "Todo o call center" : "Minha fila — " + (R.mySetores().map(R.setorNome).join(", ") || "—")}</h2>
        <p id="filaSub">{ccTudo && escopo === "todos" ? "Todas as solicitações de pós-venda da loja. Você pode anotar um novo contato do cliente e marcar urgente; quem trata é o setor de destino." : vt ? "Solicitações de pós-venda: entrega, fábrica, montagem, assistência, checklist e medidas. Marketing tem aba própria." : "Sua fila de trabalho: o que chegou para o seu setor e o que você abriu. Ordenada por prioridade — críticos, atrasados e urgentes no topo."}</p>
      </div></div>
      {ccTudo && <div className="subnav" style={{ marginBottom: 12 }}>
        <button className={escopo === "minha" ? "on" : ""} onClick={() => setEscopo("minha")}>Minha fila</button>
        <button className={escopo === "todos" ? "on" : ""} onClick={() => setEscopo("todos")}>Todo o call center</button>
      </div>}
      <div className="toolbar">
        <Busca id="busca" ph="Buscar cliente, CPF, telefone, pedido, nº do chamado" v={q} set={setQ} />
        <select id="fTipo" value={fTipo} onChange={e => setFTipo(e.target.value)}>
          <option value="">Todos os motivos</option>
          {Object.entries(R.TIPOS).filter(([, t]: any) => !t.presale).map(([k, t]: any) => <option key={k} value={k}>{t.nome}</option>)}
        </select>
        {verSetor && <select id="fSetor" value={fSetor} onChange={e => setFSetor(e.target.value)}>
          <option value="">Todos os setores</option>
          {R.setoresVisiveis().filter(x => !R.ehSetorMarketing(x.id)).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>}
      </div>
      <div className="chips" id="filtros">{chips.map(([k, l]) => <button key={k} className={"chip" + (filtro === k ? " on" : "")} onClick={() => setFiltro(k)}>{l}<span className="n">{cont[k] || 0}</span></button>)}</div>
      <div className="legenda"><span><i style={{ background: "var(--st-aberta)" }}></i>Dentro do prazo</span><span><i style={{ background: "var(--warn)" }}></i>Perto de vencer (24h)</span><span><i style={{ background: "var(--danger)" }}></i>Atrasado ou urgente</span><span><i style={{ background: "var(--critico)" }}></i>Crítico (+24h sem resposta)</span><span><i style={{ background: "var(--st-respondida)" }}></i>Respondido — avisar cliente</span></div>
      <div className="list" id="listaFila">{arr.length ? arr.map(c => <Ticket key={c.id} c={c} />) : <Vazio big="Nenhum chamado aqui">Nada pendente para este filtro.</Vazio>}</div>
    </section>
  );
}

// ---------- Acompanhamento Marketing ----------
// No marketing não há prazo de resposta: a prioridade é o cliente parado há mais de 24h sem atualização.
export function AcompMkt() {
  const { R, st, preset } = useApp();
  const [filtro, setFiltro] = useState("andamento");
  const [fTipo, setFTipo] = useState(""); const [fSetor, setFSetor] = useState(preset?.setor || ""); const [q, setQ] = useState("");
  useEffect(() => { if (preset?.setor) { setFSetor(preset.setor); setFiltro("andamento"); } }, [preset]);
  const soMeu = !(R.ehGestao() || R.temMarketing());
  const base = st.chamados.filter(c => R.domMarketing(c) && R.podeVer(c) && (!fTipo || c.tipo === fTipo) && (!fSetor || c.setorDestino === fSetor) && bate(c, q));
  const FILTROS: Record<string, (c: any) => boolean> = { andamento: c => R.emAberto(c), criticos: c => R.prioridade(c) === "critico", todos: () => true };
  Object.keys(STATUS_CLIENTE).forEach(k => (FILTROS[k] = c => R.statusClienteDe(c) === k));
  const chips = [["andamento", "Em andamento"], ["criticos", "Críticos — sem atualização"]].concat(Object.keys(STATUS_CLIENTE).map(k => [k, STATUS_CLIENTE[k]])).concat([["todos", "Todos"]]);
  const cont: Record<string, number> = {}; chips.forEach(([k]) => (cont[k] = base.filter(FILTROS[k]).length));
  const arr = R.ordenar(base.filter(FILTROS[filtro] || FILTROS.todos));
  return (
    <section className="view active" id="view-acompmkt">
      <div className="view-head"><div><h2>{soMeu ? "Minha fila" : "Acompanhamento Marketing"}</h2>
        <p>{soMeu ? "Seus clientes do marketing — os parados há mais tempo aparecem primeiro." : "Clientes do marketing — visitas de consultores externos e agendamentos diretos na loja. Os parados há mais tempo aparecem primeiro."}</p></div></div>
      <div className="toolbar">
        <Busca id="mkBusca" ph="Buscar cliente, telefone, ambiente, nº da venda" v={q} set={setQ} />
        <select id="mkTipo" value={fTipo} onChange={e => setFTipo(e.target.value)}><option value="">Todos os motivos</option>{Object.entries(R.TIPOS).filter(([, t]: any) => t.presale).map(([k, t]: any) => <option key={k} value={k}>{t.nome}</option>)}</select>
        <select id="mkSetor" value={fSetor} onChange={e => setFSetor(e.target.value)}><option value="">Todas as etapas</option>{R.setoresVisiveis().filter(x => R.ehSetorMarketing(x.id)).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
      </div>
      <div className="chips" id="mkFiltros">{chips.filter(([k]) => ["andamento", "criticos", "todos", filtro].includes(k) || cont[k]).map(([k, l]) => <button key={k} className={"chip" + (filtro === k ? " on" : "")} onClick={() => setFiltro(k)}>{l}<span className="n">{cont[k] || 0}</span></button>)}</div>
      <div className="legenda"><span><i style={{ background: "var(--st-aberta)" }}></i>Em andamento</span><span><i style={{ background: "var(--critico)" }}></i>Crítico — mais de {LIMITE_INATIVIDADE_H}h sem atualização</span><span><i style={{ background: "var(--st-concluida)" }}></i>Encerrado (vendido, cancelado ou não compareceu)</span></div>
      <div className="list" id="listaMkt">{arr.length ? arr.map(c => <Ticket key={c.id} c={c} />) : <Vazio big="Nenhum cliente aqui">Nada pendente para este filtro.</Vazio>}</div>
    </section>
  );
}

// ---------- Direcionar consultor ----------
export function Direcionamento() {
  const { R } = useApp();
  const arr = R.ordenar(R.pendentesDirecionamento().slice());
  return (
    <section className="view active" id="view-direcionamento">
      <div className="view-head"><div><h2>Direcionar consultor</h2><p>Clientes que solicitaram visita e ainda não foram direcionados a um consultor. Clique para atribuir.</p></div></div>
      <div className="list" id="listaDirecionamento">{arr.length ? arr.map(c => <Ticket key={c.id} c={c} />) : <Vazio big="Nada pendente">Todos os clientes de visita já foram direcionados a um consultor.</Vazio>}</div>
    </section>
  );
}

// ---------- Consulta ----------
export function Consulta() {
  const { R, st } = useApp();
  const [f, setF] = useState({ at: "", tp: "", st: "", se: "", de: "", ate: "", tx: "" });
  const s = (k: string) => (e: any) => setF(x => ({ ...x, [k]: e.target.value }));
  let arr = st.chamados.filter(R.podeVer);
  if (f.at) arr = arr.filter(c => c.solicitanteId === f.at);
  if (f.tp) arr = arr.filter(c => c.tipo === f.tp);
  if (["critico", "atrasado", "urgente"].includes(f.st)) arr = arr.filter(c => R.prioridade(c) === f.st); else if (f.st) arr = arr.filter(c => c.status === f.st);
  if (f.se) arr = arr.filter(c => c.setorDestino === f.se);
  if (f.de) arr = arr.filter(c => new Date(c.criadoEm) >= new Date(f.de + "T00:00:00"));
  if (f.ate) arr = arr.filter(c => new Date(c.criadoEm) <= new Date(f.ate + "T23:59:59"));
  if (f.tx) arr = arr.filter(c => bate(c, f.tx));
  arr.sort((a, b) => +new Date(b.criadoEm) - +new Date(a.criadoEm));
  return (
    <section className="view active" id="view-consulta">
      <div className="view-head"><div><h2>Consulta</h2><p>Busca e histórico — por período, atendente, motivo e status. Para revisar o que já aconteceu, não para tratar agora.</p></div></div>
      <div className="card" style={{ padding: "18px 20px", marginBottom: 16 }}><div className="grid">
        <div className="field"><label>Atendente</label><select value={f.at} onChange={s("at")}><option value="">Todos os atendentes</option>{st.usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
        <div className="field"><label>Motivo</label><select value={f.tp} onChange={s("tp")}><option value="">Todos os motivos</option>{Object.entries(R.TIPOS).map(([k, t]: any) => <option key={k} value={k}>{t.nome}</option>)}</select></div>
        <div className="field"><label>Status</label><select value={f.st} onChange={s("st")}><option value="">Todos os status</option><option value="critico">Crítico (+24h)</option><option value="atrasado">Atrasado</option><option value="urgente">Urgente no prazo</option>{ORDEM.map(x => <option key={x} value={x}>{STATUS[x].label}</option>)}</select></div>
        <div className="field"><label>Setor</label><select value={f.se} onChange={s("se")}><option value="">Todos os setores</option>{R.setoresVisiveis().map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></div>
        <div className="field"><label>De</label><input type="date" value={f.de} onChange={s("de")} /></div>
        <div className="field"><label>Até</label><input type="date" value={f.ate} onChange={s("ate")} /></div>
        <div className="field full"><label>Texto</label><input placeholder="Cliente, CPF/CNPJ, telefone, pedido, nº do chamado…" value={f.tx} onChange={s("tx")} /></div>
      </div><div style={{ marginTop: 14 }}><button className="btn ghost sm" onClick={() => setF({ at: "", tp: "", st: "", se: "", de: "", ate: "", tx: "" })}>Limpar filtros</button></div></div>
      <div className="list" id="listaConsulta">{arr.length ? arr.map(c => <Ticket key={c.id} c={c} resposta />) : <Vazio big="Nada encontrado">Ajuste os filtros.</Vazio>}</div>
    </section>
  );
}
