import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { ORDEM, STATUS, STATUS_CLIENTE, estaAtrasado } from "../lib/regras";
import { Ticket, Vazio } from "../comp/Ticket";

const Busca = ({ id, ph, v, set }: any) => (
  <div className="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
    <input id={id} placeholder={ph} value={v} onChange={e => set(e.target.value)} /></div>
);

// ---------- Fila (call center) ----------
export function Fila() {
  const { R, st, preset } = useApp();
  const [filtro, setFiltro] = useState("todos");
  const [fTipo, setFTipo] = useState("");
  const [fSetor, setFSetor] = useState(preset?.setor || "");
  const [q, setQ] = useState("");
  useEffect(() => { if (preset?.setor) { setFSetor(preset.setor); setFiltro("todos"); setFTipo(""); } }, [preset]);
  const vt = R.verTudo();
  const base = st.chamados.filter(c => !R.domMarketing(c) && R.podeVer(c));
  const cont: Record<string, number> = { todos: base.length, urgentes: base.filter(c => c.urgente && c.status !== "concluida").length, atrasados: base.filter(estaAtrasado).length };
  ORDEM.forEach(s => (cont[s] = base.filter(c => c.status === s).length));
  const chips = [["todos", "Todos"], ["urgentes", "Urgentes"], ["atrasados", "Atrasados"], ["aberta", "Abertas"], ["tratativa", "Em tratativa"], ["respondida", "Respondidas"], ["concluida", "Concluídas"]];
  let arr = base.slice();
  if (filtro === "atrasados") arr = arr.filter(estaAtrasado); else if (filtro === "urgentes") arr = arr.filter(c => c.urgente && c.status !== "concluida"); else if (filtro !== "todos") arr = arr.filter(c => c.status === filtro);
  if (fTipo) arr = arr.filter(c => c.tipo === fTipo);
  if (vt && fSetor) arr = arr.filter(c => c.setorDestino === fSetor);
  if (q) arr = arr.filter(c => (c.cliente + " " + c.pedido + " " + c.produto).toLowerCase().includes(q.toLowerCase()));
  arr = R.ordenar(arr);
  return (
    <section className="view active" id="view-fila">
      <div className="view-head"><div>
        <h2 id="filaTitulo">{vt ? "Acompanhamento Call center" : "Minha fila — " + (R.mySetores().map(R.setorNome).join(", ") || "—")}</h2>
        <p id="filaSub">{vt ? "Solicitações de pós-venda: entrega, fábrica, montagem, assistência, checklist e medidas. Marketing tem aba própria." : "Sua fila de trabalho de hoje. Ordenada por prioridade — urgentes e atrasados no topo."}</p>
      </div></div>
      <div className="toolbar">
        <Busca id="busca" ph="Buscar cliente, pedido, produto" v={q} set={setQ} />
        <select id="fTipo" value={fTipo} onChange={e => setFTipo(e.target.value)}>
          <option value="">Todos os motivos</option>
          {Object.entries(R.TIPOS).filter(([, t]: any) => !t.presale).map(([k, t]: any) => <option key={k} value={k}>{t.nome}</option>)}
        </select>
        {vt && <select id="fSetor" value={fSetor} onChange={e => setFSetor(e.target.value)}>
          <option value="">Todos os setores</option>
          {R.setoresVisiveis().filter(x => !R.ehSetorMarketing(x.id)).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>}
      </div>
      <div className="chips" id="filtros">{chips.map(([k, l]) => <button key={k} className={"chip" + (filtro === k ? " on" : "")} onClick={() => setFiltro(k)}>{l}<span className="n">{cont[k] || 0}</span></button>)}</div>
      <div className="legenda"><span><i style={{ background: "var(--st-aberta)" }}></i>Dentro do prazo</span><span><i style={{ background: "var(--warn)" }}></i>Perto de vencer (24h)</span><span><i style={{ background: "var(--danger)" }}></i>Atrasado</span><span><i style={{ background: "var(--critico)" }}></i>Crítico (+24h sem resposta)</span></div>
      <div className="list" id="listaFila">{arr.length ? arr.map(c => <Ticket key={c.id} c={c} />) : <Vazio big="Nenhum chamado aqui">Nada pendente para este filtro.</Vazio>}</div>
    </section>
  );
}

// ---------- Acompanhamento Marketing ----------
export function AcompMkt() {
  const { R, st, preset } = useApp();
  const [filtro, setFiltro] = useState("todos");
  const [fTipo, setFTipo] = useState(""); const [fSetor, setFSetor] = useState(preset?.setor || ""); const [q, setQ] = useState("");
  useEffect(() => { if (preset?.setor) setFSetor(preset.setor); }, [preset]);
  const soMeu = !(R.ehGestao() || R.temMarketing());
  const base = st.chamados.filter(c => R.domMarketing(c) && R.podeVer(c));
  const cont: Record<string, number> = { todos: base.length, atrasados: base.filter(estaAtrasado).length };
  Object.keys(STATUS_CLIENTE).forEach(k => (cont[k] = base.filter(c => R.statusClienteDe(c) === k).length));
  const chips = [["todos", "Todos"], ["atrasados", "Atrasados"]].concat(Object.keys(STATUS_CLIENTE).map(k => [k, STATUS_CLIENTE[k]]));
  let arr = base.slice();
  if (filtro === "atrasados") arr = arr.filter(estaAtrasado); else if (filtro !== "todos") arr = arr.filter(c => R.statusClienteDe(c) === filtro);
  if (fTipo) arr = arr.filter(c => c.tipo === fTipo);
  if (fSetor) arr = arr.filter(c => c.setorDestino === fSetor);
  if (q) arr = arr.filter(c => ((c.cliente || "") + " " + (c.telefone || "") + " " + (c.produto || "") + " " + ((c.venda && c.venda.numero) || "")).toLowerCase().includes(q.toLowerCase()));
  arr = R.ordenar(arr);
  return (
    <section className="view active" id="view-acompmkt">
      <div className="view-head"><div><h2>{soMeu ? "Minha fila" : "Acompanhamento Marketing"}</h2>
        <p>{soMeu ? "Seus clientes do marketing — ordenados por prioridade." : "Clientes do marketing — visitas de consultores externos e agendamentos diretos na loja. Ordenado por prioridade."}</p></div></div>
      <div className="toolbar">
        <Busca id="mkBusca" ph="Buscar cliente, telefone, ambiente" v={q} set={setQ} />
        <select id="mkTipo" value={fTipo} onChange={e => setFTipo(e.target.value)}><option value="">Todos os motivos</option>{Object.entries(R.TIPOS).filter(([, t]: any) => t.presale).map(([k, t]: any) => <option key={k} value={k}>{t.nome}</option>)}</select>
        <select id="mkSetor" value={fSetor} onChange={e => setFSetor(e.target.value)}><option value="">Todas as etapas</option>{R.setoresVisiveis().filter(x => R.ehSetorMarketing(x.id)).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
      </div>
      <div className="chips" id="mkFiltros">{chips.filter(([k]) => k === "todos" || cont[k]).map(([k, l]) => <button key={k} className={"chip" + (filtro === k ? " on" : "")} onClick={() => setFiltro(k)}>{l}<span className="n">{cont[k] || 0}</span></button>)}</div>
      <div className="legenda"><span><i style={{ background: "var(--st-aberta)" }}></i>Dentro do prazo</span><span><i style={{ background: "var(--warn)" }}></i>Perto de vencer (24h)</span><span><i style={{ background: "var(--danger)" }}></i>Atrasado</span><span><i style={{ background: "var(--critico)" }}></i>Crítico (+24h)</span></div>
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
  if (f.st === "atrasado") arr = arr.filter(estaAtrasado); else if (f.st === "urgente") arr = arr.filter(c => c.urgente && c.status !== "concluida"); else if (f.st) arr = arr.filter(c => c.status === f.st);
  if (f.se) arr = arr.filter(c => c.setorDestino === f.se);
  if (f.de) arr = arr.filter(c => new Date(c.criadoEm) >= new Date(f.de + "T00:00:00"));
  if (f.ate) arr = arr.filter(c => new Date(c.criadoEm) <= new Date(f.ate + "T23:59:59"));
  if (f.tx) arr = arr.filter(c => (c.cliente + " " + c.pedido + " " + c.produto + " " + c.clienteDoc).toLowerCase().includes(f.tx.toLowerCase()));
  arr.sort((a, b) => +new Date(b.criadoEm) - +new Date(a.criadoEm));
  return (
    <section className="view active" id="view-consulta">
      <div className="view-head"><div><h2>Consulta</h2><p>Busca e histórico — por período, atendente, motivo e status. Para revisar o que já aconteceu, não para tratar agora.</p></div></div>
      <div className="card" style={{ padding: "18px 20px", marginBottom: 16 }}><div className="grid">
        <div className="field"><label>Atendente</label><select value={f.at} onChange={s("at")}><option value="">Todos os atendentes</option>{st.usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
        <div className="field"><label>Motivo</label><select value={f.tp} onChange={s("tp")}><option value="">Todos os motivos</option>{Object.entries(R.TIPOS).map(([k, t]: any) => <option key={k} value={k}>{t.nome}</option>)}</select></div>
        <div className="field"><label>Status</label><select value={f.st} onChange={s("st")}><option value="">Todos os status</option><option value="atrasado">Atrasado</option><option value="urgente">Urgente</option>{ORDEM.map(x => <option key={x} value={x}>{STATUS[x].label}</option>)}</select></div>
        <div className="field"><label>Setor</label><select value={f.se} onChange={s("se")}><option value="">Todos os setores</option>{R.setoresVisiveis().map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></div>
        <div className="field"><label>De</label><input type="date" value={f.de} onChange={s("de")} /></div>
        <div className="field"><label>Até</label><input type="date" value={f.ate} onChange={s("ate")} /></div>
        <div className="field full"><label>Texto</label><input placeholder="Cliente, pedido, produto, CPF/CNPJ…" value={f.tx} onChange={s("tx")} /></div>
      </div><div style={{ marginTop: 14 }}><button className="btn ghost sm" onClick={() => setF({ at: "", tp: "", st: "", se: "", de: "", ate: "", tx: "" })}>Limpar filtros</button></div></div>
      <div className="list" id="listaConsulta">{arr.length ? arr.map(c => <Ticket key={c.id} c={c} resposta />) : <Vazio big="Nada encontrado">Ajuste os filtros.</Vazio>}</div>
    </section>
  );
}
