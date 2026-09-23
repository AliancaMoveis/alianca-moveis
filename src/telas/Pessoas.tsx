import { useState } from "react";
import { useApp } from "../estado";
import { STATUS_CLIENTE, VENDA_STATUS, corDoSetor, fmtDate, fmtMoeda, inicial, parseMoeda, vendaContaComissao, vendaContaVolume } from "../lib/regras";
import { ScBadge, Ticket } from "../comp/Ticket";
import { Kpi } from "./Dashboard";

export function Pessoas({ qual }: { qual: "vendedores" | "consultores" }) {
  const { R, st } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  const ehVend = qual === "vendedores";
  const setor = ehVend ? "atendente_cliente" : "consultor_externo";
  const sufixo = ehVend ? "" : "2";
  const pessoas = st.usuarios.filter(u => (u.setores || []).includes(setor) && (u.ativo || R.statsPessoa(u.id, ehVend).meus.length));
  const dados = pessoas.map(u => ({ u, ...R.statsPessoa(u.id, ehVend) })).sort((a, b) => b.total - a.total);
  const maxT = Math.max(1, ...dados.map(d => d.total));
  const d = sel ? dados.find(x => x.u.id === sel) : null;
  const arr = d ? R.ordenar(d.meus.slice()) : [];
  return (
    <section className="view active" id={"view-" + qual}>
      <div className="view-head"><div><h2 id={"pesTitulo" + sufixo}>{ehVend ? "Vendedores" : "Consultores externos"}</h2><p id={"pesSub" + sufixo}>{(ehVend ? "Carteira de cada projetista da loja." : "Carteira de cada consultor externo.") + " Clique num card para ver os clientes."}</p></div></div>
      <div className="pess" id={"pesCards" + sufixo}>
        {dados.length ? dados.map(dd => {
          const cor = corDoSetor(setor);
          return (
            <div key={dd.u.id} className={"pcard" + (sel === dd.u.id ? " sel" : "")} onClick={() => setSel(s => s === dd.u.id ? null : dd.u.id)}>
              <div className="t"><div className="av2" style={{ background: cor }}>{inicial(dd.u.nome.split("— ")[1] || dd.u.nome)}</div><div><div className="nm">{dd.u.nome}</div><div className="sb">{ehVend ? "Projetista (loja)" : "Consultor externo"}</div></div></div>
              <div className="num"><div>Ativos<b>{dd.ativos}</b></div><div>Vendas<b>{dd.vendas}</b></div><div>Vendido<b style={{ fontSize: 14 }}>{fmtMoeda(dd.total)}</b></div><div>Conversão<b>{dd.conv}%</b></div></div>
              <div className="bar"><i style={{ width: dd.total / maxT * 100 + "%", background: cor }}></i></div>
            </div>
          );
        }) : <div className="empty">Ninguém cadastrado neste papel.</div>}
      </div>
      <div id={"pesDetalhe" + sufixo}>
        {d && <div className="ap-sec"><h3>Clientes de {d.u.nome} <span className="badge b-tratativa">{arr.length}</span></h3>
          <div className="list">{arr.length ? arr.map(c => <Ticket key={c.id} c={c} />) : <div className="empty">Nenhum cliente.</div>}</div></div>}
      </div>
    </section>
  );
}

export function Carteira() {
  const { R } = useApp();
  const ehVend = R.mySetores().includes("atendente_cliente");
  const d = R.statsPessoa(R.currentUserId, ehVend);
  const arr = R.ordenar(d.meus.slice());
  return (
    <section className="view active" id="view-carteira">
      <div className="view-head"><div><h2 id="carTitulo">Minha carteira</h2><p id="carSub">{ehVend ? "Seus clientes na loja e seus resultados." : "Seus clientes de visita e seus resultados."}</p></div></div>
      <div className="kpis" id="carKpis"><Kpi n={d.ativos} l="Clientes ativos" /><Kpi n={d.vendas} l="Vendas" /><Kpi n={fmtMoeda(d.total)} l="Vendido" fs={22} /><Kpi n={d.conv + "%"} l="Conversão" /></div>
      <div className="list" id="carLista">{arr.length ? arr.map(c => <Ticket key={c.id} c={c} />) : <div className="empty"><div className="big">Nenhum cliente</div>Você ainda não tem clientes atribuídos.</div>}</div>
    </section>
  );
}

export function Clientes() {
  const { R, st, abrirDetalhe } = useApp();
  const [filtro, setFiltro] = useState("todos");
  const [q, setQ] = useState(""); const [de, setDe] = useState(""); const [ate, setAte] = useState("");
  const base = st.chamados.filter(c => R.domMarketing(c) && R.podeVer(c));
  const cont: Record<string, number> = { todos: base.length };
  Object.keys(STATUS_CLIENTE).forEach(k => (cont[k] = base.filter(c => R.statusClienteDe(c) === k).length));
  const chips = [["todos", "Todos"]].concat(Object.keys(STATUS_CLIENTE).map(k => [k, STATUS_CLIENTE[k]]));
  const vendidos = base.filter(c => vendaContaVolume(c.venda));
  const aprov = vendidos.filter(c => vendaContaComissao(c.venda));
  const totalVendido = aprov.reduce((s, c) => s + parseMoeda(c.venda.valor), 0);
  const vejaVal = R.ehGestao() || R.temMarketing() || R.ehConsultorExterno();
  let arr = base.slice();
  if (filtro !== "todos") arr = arr.filter(c => R.statusClienteDe(c) === filtro);
  if (de) arr = arr.filter(c => new Date(c.criadoEm) >= new Date(de + "T00:00:00"));
  if (ate) arr = arr.filter(c => new Date(c.criadoEm) <= new Date(ate + "T23:59:59"));
  if (q) arr = arr.filter(c => ((c.cliente || "") + " " + (c.telefone || "") + " " + ((c.venda && c.venda.numero) || "")).toLowerCase().includes(q.toLowerCase()));
  arr.sort((a, b) => +new Date(b.criadoEm) - +new Date(a.criadoEm));
  return (
    <section className="view active" id="view-clientes">
      <div className="view-head"><div><h2>Clientes</h2><p id="cliSub">Acompanhamento de todos os seus clientes, inclusive os que já saíram da fila.</p></div></div>
      <div className="toolbar">
        <div className="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg><input id="cliBusca" placeholder="Buscar cliente, telefone ou nº da venda" value={q} onChange={e => setQ(e.target.value)} /></div>
        <input type="date" style={{ maxWidth: 160 }} title="De" value={de} onChange={e => setDe(e.target.value)} />
        <input type="date" style={{ maxWidth: 160 }} title="Até" value={ate} onChange={e => setAte(e.target.value)} />
      </div>
      <div className="chips" id="cliFiltros">{chips.map(([k, l]) => <button key={k} className={"chip" + (filtro === k ? " on" : "")} onClick={() => setFiltro(k)}>{l}<span className="n">{cont[k] || 0}</span></button>)}</div>
      <div className="kpis" id="cliKpis">
        <Kpi n={base.length} l="Clientes" />
        <Kpi n={base.filter(c => ["aguardando_consultor", "direcionado_consultor", "visita_realizada", "agendado_loja", "com_vendedor"].includes(R.statusClienteDe(c))).length} l="Em andamento" />
        <Kpi n={vendidos.length} l="Vendidos" cor="var(--st-concluida)" />
        {vejaVal && <Kpi n={fmtMoeda(totalVendido)} l="Total vendido" />}
      </div>
      <div className="list" id="listaClientes">
        {arr.length ? arr.map(c => {
          const v = c.venda;
          const cons = c.consultorId ? R.nomeUser(c.consultorId) : null, aten = c.atendenteId ? R.nomeUser(c.atendenteId) : null;
          const meta = [c.produto || "", c.solicitante ? "cadastrado por " + c.solicitante : "", cons ? "consultor " + cons : "", aten ? "atendente " + aten : ""].filter(Boolean).join(" · ");
          const corS = v ? (v.status === "efetivada" ? "var(--st-concluida)" : v.status === "promissoria" ? "var(--st-tratativa)" : v.status === "cancelada" ? "var(--danger)" : "var(--warn)") : "";
          return (
            <div className="cli-row" key={c.id} onClick={() => abrirDetalhe(c.id)}>
              <div><div className="nome">{c.cliente}</div><div className="meta">{meta}</div></div>
              <div className="dir"><ScBadge c={c} />
                {c.transferencia && c.transferencia.status === "pendente" && <span className="pill" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>transferência pendente</span>}
                {v && <div className="venda">Venda <b>{v.numero}</b>{R.podeVerValor(c) && v.valor ? " · R$ " + v.valor : ""}<br />{v.dataVenda ? fmtDate(v.dataVenda) : ""}{v.vendedor ? " · " + v.vendedor : ""} <span className="pill" style={{ color: corS, borderColor: corS }}>{VENDA_STATUS[v.status] || v.status}</span></div>}
              </div>
            </div>
          );
        }) : <div className="empty"><div className="big">Nenhum cliente</div>Ajuste os filtros acima.</div>}
      </div>
    </section>
  );
}
