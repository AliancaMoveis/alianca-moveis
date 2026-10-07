import { useState } from "react";
import { useApp } from "../estado";
import { DIAS_SEMANA, TURNOS, STATUS_CLIENTE, VENDA_STATUS, corDoSetor, fmtDate, fmtMoeda, inicial, numsVenda, parseMoeda, temCancelamento, temPendenteGestao, valorPendente, vendaContaComissao, vendaContaVolume } from "../lib/regras";
import { ScBadge, Ticket } from "../comp/Ticket";
import { Kpi } from "./Dashboard";
import { A } from "../lib/acoes";

export function Pessoas({ qual }: { qual: "vendedores" | "consultores" }) {
  const { R, st } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  const ehVend = qual === "vendedores";
  const setor = ehVend ? "atendente_cliente" : "consultor_externo";
  const sufixo = ehVend ? "" : "2";
  const [tipoV, setTipoV] = useState<"todos" | "proj" | "so">("todos");
  const pessoas = st.usuarios.filter(u => (u.setores || []).includes(setor) && (u.ativo || R.statsPessoa(u.id, ehVend).meus.length))
    .filter(u => !ehVend || tipoV === "todos" || (tipoV === "proj" ? u.fazProjeto !== false : u.fazProjeto === false));
  const dados = pessoas.map(u => ({ u, ...R.statsPessoa(u.id, ehVend) })).sort((a, b) => b.total - a.total);
  const maxT = Math.max(1, ...dados.map(d => d.total));
  const d = sel ? dados.find(x => x.u.id === sel) : null;
  const arr = d ? R.ordenar(d.meus.slice()) : [];
  return (
    <section className="view active" id={"view-" + qual}>
      <div className="view-head"><div><h2 id={"pesTitulo" + sufixo}>{ehVend ? "Vendedores" : "Consultores externos"}</h2><p id={"pesSub" + sufixo}>{(ehVend ? "Carteira de cada vendedor da loja." : "Carteira de cada consultor externo.") + " Clique num card para ver os clientes."}</p></div></div>
      {ehVend && <div className="subnav" style={{ marginBottom: 12 }}>{([["todos", "Todos"], ["proj", "📐 Projetistas"], ["so", "Só vendedores"]] as const).map(([k, l]) => <button key={k} className={tipoV === k ? "on" : ""} onClick={() => setTipoV(k)}>{l}</button>)}</div>}
      <div className="pess" id={"pesCards" + sufixo}>
        {dados.length ? dados.map(dd => {
          const cor = corDoSetor(setor);
          return (
            <div key={dd.u.id} className={"pcard" + (sel === dd.u.id ? " sel" : "")} onClick={() => setSel(s => s === dd.u.id ? null : dd.u.id)}>
              <div className="t"><div className="av2" style={{ background: cor }}>{inicial(dd.u.nome.split("— ")[1] || dd.u.nome)}</div><div><div className="nm">{dd.u.nome}</div><div className="sb">{ehVend ? <>{dd.u.fazProjeto !== false ? <b style={{ color: "var(--primary)" }}>📐 Projetista</b> : "Só vendedor"}{dd.u.folga !== null && dd.u.folga !== undefined ? " · folga " + DIAS_SEMANA[dd.u.folga] : ""}{dd.u.turno && TURNOS[dd.u.turno] ? " · " + (dd.u.turno === "manha" ? "entra 9:00" : "entra 10:40") : ""}</> : "Consultor externo"}</div></div></div>
              <div className="num"><div>Ativos<b>{dd.ativos}</b></div><div>Vendas<b>{dd.vendas}</b></div><div>Vendido<b style={{ fontSize: 14 }}>{fmtMoeda(dd.total)}</b></div><div>Conversão<b>{dd.conv}%</b></div></div>
              <div className="bar"><i style={{ width: dd.total / maxT * 100 + "%", background: cor }}></i></div>
            </div>
          );
        }) : <div className="empty">Ninguém cadastrado neste papel.</div>}
      </div>
      <div id={"pesDetalhe" + sufixo}>
        {d && ehVend && <EscalaVendedor u={d.u} />}
        {d && <div className="ap-sec"><h3>Clientes de {d.u.nome} <span className="badge b-tratativa">{arr.length}</span></h3>
          <div className="list">{arr.length ? arr.map(c => <Ticket key={c.id} c={c} />) : <div className="empty">Nenhum cliente.</div>}</div></div>}
      </div>
    </section>
  );
}

// Meus clientes (consultor / vendedor): a fila (em andamento) e a carteira (todos) numa tela só, com busca e filtros
function EscalaVendedor({ u }: { u: any }) {
  const { R, executar } = useApp() as any;
  const pode = R.ehGestao() || R.mySetores().some((x: string) => ["marketing_supervisao", "suporte_consultores"].includes(x));
  const [fp, setFp] = useState(u.fazProjeto !== false); const [fo, setFo] = useState(u.folga === null || u.folga === undefined ? "" : String(u.folga)); const [tu, setTu] = useState(u.turno || "");
  const tx = TURNOS[u.turno || ""];
  if (!pode) return <div className="card" style={{ padding: "12px 16px", marginBottom: 14, fontSize: 13 }}><b>{u.nome}</b> · {u.fazProjeto !== false ? "📐 Projetista" : "Só vendedor"} · {u.folga !== null && u.folga !== undefined ? "folga " + DIAS_SEMANA[u.folga] : "folga não informada"} · {tx ? tx.rot : "horário não informado"}</div>;
  return (
    <div className="card" key={u.id} style={{ padding: "14px 18px", marginBottom: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Escala de {u.nome}</div>
      <div className="grid">
        <div className="field"><label>Tipo</label><select value={fp ? "1" : "0"} onChange={e => setFp(e.target.value === "1")}><option value="1">📐 Projetista (faz projeto)</option><option value="0">Só vendedor (não faz projeto)</option></select></div>
        <div className="field"><label>Folga</label><select value={fo} onChange={e => setFo(e.target.value)}><option value="">Não informada</option>{DIAS_SEMANA.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div>
        <div className="field"><label>Horário</label><select value={tu} onChange={e => setTu(e.target.value)}><option value="">Não informado</option>{Object.entries(TURNOS).map(([k, t]) => <option key={k} value={k}>{t.rot}</option>)}</select></div>
      </div>
      <div style={{ marginTop: 10 }}><button className="btn primary sm" onClick={() => executar(() => A.vendedorEscala(u.id, fp, fo === "" ? null : Number(fo), tu), "Escala salva")}>Salvar escala</button></div>
    </div>
  );
}

export function Carteira() {
  const { R } = useApp();
  const ehVend = R.mySetores().includes("atendente_cliente");
  const d = R.statsPessoa(R.currentUserId, ehVend);
  const [f, setF] = useState("andamento"); const [stF, setStF] = useState(""); const [q, setQ] = useState(""); const [de, setDe] = useState(""); const [ate, setAte] = useState("");
  const sc = (c: any) => R.statusClienteDe(c);
  const FILTROS: Record<string, [string, (c: any) => boolean]> = {
    andamento: ["Em andamento", c => R.emAberto(c)],
    criticos: ["Críticos — sem atualização", c => R.prioridade(c) === "critico"],
    ...(ehVend ? { semparecer: ["Sem parecer", (c: any) => R.semParecer(c)] } : { semanexo: ["⚠️ Sem anexo", (c: any) => R.semAnexo(c)] }),
    aconfirmar: ["Venda a confirmar", c => !!c.venda && temPendenteGestao(c.venda)],
    vendidos: ["Vendidos", c => vendaContaVolume(c.venda)],
    promissoria: ["Com promissória", c => !!c.venda && c.venda.status !== "cancelada" && valorPendente(c.venda) > 0],
    cancelados: ["❌ Cancelamentos", c => temCancelamento(c)],
    naocomprou: ["Não comprou", c => ["atendido", "reprovado", "nao_compareceu", "ausente_endereco"].includes(sc(c)) && !c.venda],
    todos: ["Todos", () => true],
  };
  const noPer = (c: any) => { const x = String(c.dataLoja || c.dataVisita || c.criadoEm || "").slice(0, 10); return (!de || x >= de) && (!ate || x <= ate); };
  const t = q.trim().toLowerCase(), dg = t.replace(/\D/g, "");
  const bate = (c: any) => !t || (c.cliente + " " + (c.produto || "") + " " + (c.endereco || "") + " " + c.id + " " + numsVenda(c)).toLowerCase().includes(t) || (dg.length >= 3 && String(c.telefone || "").replace(/\D/g, "").includes(dg));
  const base = d.meus.filter((c: any) => bate(c) && noPer(c) && (!stF || sc(c) === stF));
  const cont: Record<string, number> = {}; Object.keys(FILTROS).forEach(k => (cont[k] = base.filter(FILTROS[k][1]).length));
  const lista = base.filter((FILTROS[f] || FILTROS.todos)[1]);
  const arr = f === "andamento" || f === "criticos" ? R.ordenar(lista.slice()) : lista.slice().sort((a: any, b: any) => String(b.dataLoja || b.criadoEm).localeCompare(String(a.dataLoja || a.criadoEm)));
  const stsUsados = Array.from(new Set(d.meus.map(sc))) as string[];
  return (
    <section className="view active" id="view-carteira">
      <div className="view-head"><div><h2 id="carTitulo">Meus clientes</h2><p id="carSub">{ehVend ? "Seus clientes na loja" : "Seus clientes de visita"} — “Em andamento” é a sua fila (os parados há mais tempo primeiro); use os filtros para consultar vendidos, promissórias, cancelamentos e o histórico.</p></div></div>
      <div className="kpis" id="carKpis"><Kpi n={d.ativos} l="Clientes ativos" /><Kpi n={d.vendas} l="Vendas" /><Kpi n={fmtMoeda(d.total)} l="Vendido" fs={22} /><Kpi n={d.conv + "%"} l="Conversão" /></div>
      <div className="toolbar">
        <div className="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg><input placeholder="Buscar cliente, telefone, ambiente, endereço ou nº da venda" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select value={stF} onChange={e => setStF(e.target.value)} style={{ maxWidth: 230 }}><option value="">Todos os status</option>{stsUsados.filter(k => STATUS_CLIENTE[k]).map(k => <option key={k} value={k}>{STATUS_CLIENTE[k]}</option>)}</select>
        <input type="date" style={{ maxWidth: 160 }} title="De (data na loja / visita)" value={de} onChange={e => setDe(e.target.value)} />
        <input type="date" style={{ maxWidth: 160 }} title="Até" value={ate} onChange={e => setAte(e.target.value)} />
        {(q || stF || de || ate) && <button className="btn ghost sm" onClick={() => { setQ(""); setStF(""); setDe(""); setAte(""); }}>Limpar</button>}
      </div>
      <div className="chips">{Object.entries(FILTROS).filter(([k]) => ["andamento", "cancelados", "todos", f].includes(k) || cont[k]).map(([k, [l]]) => <button key={k} className={"chip" + (f === k ? " on" : "")} onClick={() => setF(k)}>{l}<span className="n">{cont[k] || 0}</span></button>)}</div>
      <div className="list" id="carLista">{arr.length ? arr.map((c: any) => <Ticket key={c.id} c={c} />) : <div className="empty"><div className="big">Nenhum cliente</div>{d.meus.length ? "Nada neste filtro." : "Você ainda não tem clientes atribuídos."}</div>}</div>
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
  cont.cancelamentos = base.filter(temCancelamento).length;
  const chips = [["todos", "Todos"], ["cancelamentos", "❌ Cancelamentos"]].concat(Object.keys(STATUS_CLIENTE).map(k => [k, STATUS_CLIENTE[k]]));
  const vendidos = base.filter(c => vendaContaVolume(c.venda));
  const aprov = vendidos.filter(c => vendaContaComissao(c.venda));
  const totalVendido = vendidos.reduce((s, c) => s + parseMoeda(c.venda.valor), 0); void aprov;
  const vejaVal = R.ehGestao() || R.temMarketing() || R.ehConsultorExterno();
  let arr = base.slice();
  if (filtro === "cancelamentos") arr = arr.filter(temCancelamento); else if (filtro !== "todos") arr = arr.filter(c => R.statusClienteDe(c) === filtro);
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
          const meta = [c.produto || "", c.solicitante ? "cadastrado por " + c.solicitante : "", cons ? "consultor " + cons : "", aten ? "vendedor " + aten : ""].filter(Boolean).join(" · ");
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
