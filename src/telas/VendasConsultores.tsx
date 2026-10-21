// 💰 Vendas dos consultores: só as vendas, de forma clara — por período, por consultor e a lista venda a venda.
// Base: os nºs de venda lançados nos clientes do 360 (consultores e/ou marketing). Aprovadas = efetivadas pela Gestão.
import { useMemo, useState } from "react";
import { useApp } from "../estado";
import { Kpi } from "./Dashboard";
import { baixarXlsx } from "../lib/planilha";
import { fmtDate, fmtMoeda, hojeISO, isoLocal, numerosVenda, parseData } from "../lib/regras";

type Per = "hoje" | "7d" | "mes" | "mesp" | "ano" | "outro";
const PER: [Per, string][] = [["hoje", "Hoje"], ["7d", "Últimos 7 dias"], ["mes", "Este mês"], ["mesp", "Mês passado"], ["ano", "Este ano"], ["outro", "Escolher datas"]];
const somaDias = (iso: string, n: number) => { const d = parseData(iso + "T12:00"); d.setDate(d.getDate() + n); return isoLocal(d); };
function faixa(p: Per, de: string, ate: string): [string, string] {
  const h = hojeISO(), [y, m] = h.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (p === "hoje") return [h, h];
  if (p === "7d") return [somaDias(h, -6), h];
  if (p === "mes") return [`${y}-${pad(m)}-01`, h];
  if (p === "mesp") { const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; return [`${py}-${pad(pm)}-01`, somaDias(`${y}-${pad(m)}-01`, -1)]; }
  if (p === "ano") return [`${y}-01-01`, h];
  return [de || h, ate || h];
}

type Linha = { c: any; i: any; dia: string; valor: number; cons: string; consId: string; ok: boolean; direto: boolean };

export default function VendasConsultores() {
  const { R, st, abrirDetalhe } = useApp() as any;
  const [per, setPer] = useState<Per>("mes");
  const [de, setDe] = useState(""); const [ate, setAte] = useState("");
  const [orig, setOrig] = useState<"cons" | "mkt" | "tudo">("cons");
  const [sit, setSit] = useState<"ok" | "pend" | "todas">("ok");
  const [sel, setSel] = useState(""); const [q, setQ] = useState("");
  const [ini, fim] = faixa(per, de, ate);

  // todas as vendas (nº a nº) dos clientes do 360, sem canceladas
  const todas: Linha[] = useMemo(() => (st.chamados || []).filter((c: any) => R.domMarketing(c) && c.venda).flatMap((c: any) => {
    const direto = R.ehDireto(c); const consId = direto ? c.solicitanteId : c.consultorId;
    return numerosVenda(c.venda).map((i: any) => ({ c, i, dia: String(i.dataVenda || i.registradoEm || c.venda.dataVendaReal || c.venda.dataVenda || "").slice(0, 10),
      valor: Number(i.valor) || 0, consId: consId || "", cons: consId ? R.nomeUser(consId) : "— sem " + (direto ? "responsável" : "consultor"), ok: i.status !== "registrada", direto }));
  }), [st.chamados]);

  const base = todas.filter(l => (orig === "tudo" || (orig === "mkt" ? l.direto : !l.direto)) && l.dia >= ini && l.dia <= fim);
  const doSit = base.filter(l => sit === "todas" || (sit === "ok" ? l.ok : !l.ok));
  const pend = base.filter(l => !l.ok);
  const tot = doSit.reduce((s, l) => s + l.valor, 0);
  const clientes = new Set(doSit.map(l => l.c.id)).size;

  const porCons = useMemo(() => {
    const m: Record<string, { k: string; nome: string; n: number; cli: Set<string>; v: number; pend: number }> = {};
    doSit.forEach(l => { const k = l.consId || l.cons; m[k] = m[k] || { k, nome: l.cons, n: 0, cli: new Set(), v: 0, pend: 0 }; m[k].n++; m[k].cli.add(l.c.id); m[k].v += l.valor; if (!l.ok) m[k].pend++; });
    return Object.values(m).sort((a, b) => b.v - a.v || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [doSit.length, tot, sit, orig, ini, fim]);
  const max = Math.max(1, ...porCons.map(x => x.v));

  const tira = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const lista = doSit.filter(l => (!sel || (l.consId || l.cons) === sel) && (!q.trim() || tira([l.c.cliente, l.i.numero, l.cons, R.nomeUser(l.c.atendenteId)].join(" ")).includes(tira(q.trim()))))
    .sort((a, b) => b.dia.localeCompare(a.dia) || String(a.c.cliente).localeCompare(String(b.c.cliente), "pt-BR"));
  const pagador = (l: Linha) => (((l.c.tratativa || {}).pagadores || {})[String(l.i.numero)] || {}).nome || "";
  const rotOrig = orig === "mkt" ? "Responsável" : "Consultor";

  const exportar = () => baixarXlsx("vendas-" + orig + "-" + ini + "-a-" + fim, ["Data", "Nº venda", "Cliente 360", "Cliente comprador", rotOrig, "Vendedor", "Valor", "Situação"],
    lista.map(l => [l.dia ? fmtDate(l.dia) : "", l.i.numero, l.c.cliente, pagador(l), l.cons, l.c.atendenteId ? R.nomeUser(l.c.atendenteId) : "", l.valor, l.ok ? "Aprovada" : "Aguardando Gestão"]), "Vendas");

  const escolhido = porCons.find(x => x.k === sel);
  return <section className="view active">
    <div className="view-head"><div><h2>💰 Vendas dos consultores</h2>
      <p>Só as vendas: quantas, quanto e de quem, no período que você escolher. <b>Aprovadas</b> = já validadas pela Gestão. Clique num consultor para ver as vendas dele.</p></div></div>

    <div className="vc-filtros">
      <div className="chips" style={{ margin: 0 }}>{PER.map(([k, l]) => <button key={k} className={"chip" + (per === k ? " on" : "")} onClick={() => setPer(k)}>{l}</button>)}</div>
      {per === "outro" && <span className="vc-datas"><input type="date" value={de} onChange={e => setDe(e.target.value)} /> até <input type="date" value={ate} onChange={e => setAte(e.target.value)} /></span>}
      <span className="hint">{fmtDate(ini)} a {fmtDate(fim)}</span>
    </div>
    <div className="vc-filtros">
      <div className="subnav" style={{ margin: 0 }}>
        <button className={orig === "cons" ? "on" : ""} onClick={() => { setOrig("cons"); setSel(""); }}>🧭 Consultores</button>
        <button className={orig === "mkt" ? "on" : ""} onClick={() => { setOrig("mkt"); setSel(""); }}>🏬 Marketing</button>
        <button className={orig === "tudo" ? "on" : ""} onClick={() => { setOrig("tudo"); setSel(""); }}>Tudo</button>
      </div>
      <div className="chips" style={{ margin: 0 }}>
        {([["ok", "✔ Aprovadas"], ["pend", "⏳ Aguardando Gestão"], ["todas", "Todas"]] as const).map(([k, l]) => <button key={k} className={"chip" + (sit === k ? " on" : "")} onClick={() => setSit(k)}>{l}</button>)}
      </div>
    </div>

    <div className="kpis" style={{ margin: "10px 0" }}>
      <Kpi n={doSit.length} l={sit === "pend" ? "Vendas aguardando" : "Vendas" + (sit === "ok" ? " aprovadas" : "")} cor="var(--primary)" />
      <Kpi n={fmtMoeda(tot)} l="Valor vendido" cor="var(--st-concluida)" />
      <Kpi n={doSit.length ? fmtMoeda(tot / clientes) : "—"} l="Ticket médio (por cliente)" />
      <Kpi n={clientes} l="Clientes que compraram" />
      {sit === "ok" && <Kpi n={pend.length} l={"Aguardando Gestão · " + fmtMoeda(pend.reduce((s, l) => s + l.valor, 0))} cor="var(--warn)" />}
    </div>

    <div className="vc-grid">
      <div className="card vc-rank">
        <div className="vc-tit">Por {rotOrig.toLowerCase()} <small>{porCons.length}</small></div>
        <div className="vc-cab"><span>{rotOrig}</span><span>Vendas</span><span>Valor</span></div>
        {!porCons.length && <div className="hint" style={{ padding: 12 }}>Nenhuma venda no período.</div>}
        {porCons.map(x => <button key={x.k} type="button" className={"vc-it" + (sel === x.k ? " on" : "")} onClick={() => setSel(sel === x.k ? "" : x.k)}>
          <span className="vc-nome"><b>{x.nome}</b><small>{x.cli.size} cliente{x.cli.size === 1 ? "" : "s"} · ticket {fmtMoeda(x.v / Math.max(1, x.cli.size))}{x.pend && sit !== "pend" ? " · " + x.pend + " aguardando" : ""}</small>
            <i className="vc-barra"><i style={{ width: (x.v / max * 100) + "%" }} /></i></span>
          <b className="vc-n">{x.n}</b><b className="vc-v">{fmtMoeda(x.v)}<small>{tot ? Math.round(x.v / tot * 100) + "%" : ""}</small></b></button>)}
      </div>

      <div className="card vc-lista">
        <div className="vc-tit">{escolhido ? <>Vendas de <b>{escolhido.nome}</b> <button className="btn ghost sm" onClick={() => setSel("")}>✕ ver todos</button></> : "Todas as vendas"} <small>{lista.length} · {fmtMoeda(lista.reduce((s, l) => s + l.valor, 0))}</small>
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}><input type="search" placeholder="🔎 cliente, nº, vendedor" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 220 }} /><button className="btn sm" onClick={exportar}>⬇ Excel</button></span></div>
        <div style={{ overflow: "auto", maxHeight: "65vh" }}>
          <table className="vc-tab"><thead><tr><th>Data</th><th>Nº venda</th><th>Cliente</th><th>{rotOrig}</th><th>Vendedor</th><th style={{ textAlign: "right" }}>Valor</th><th>Situação</th></tr></thead>
            <tbody>{lista.slice(0, 600).map(l => <tr key={l.c.id + l.i.numero} className="clic" onClick={() => abrirDetalhe(l.c.id)}>
              <td>{l.dia ? fmtDate(l.dia) : "—"}</td><td><b>{l.i.numero}</b>{l.i.tipo === "promissoria" ? <small className="hint"> promissória</small> : null}</td>
              <td><b>{l.c.cliente}</b>{pagador(l) ? <div className="hint">🧾 comprador: {pagador(l)}</div> : null}</td>
              <td><b>{l.cons}</b></td><td>{l.c.atendenteId ? R.nomeUser(l.c.atendenteId) : "—"}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}><b>{fmtMoeda(l.valor)}</b></td>
              <td>{l.ok ? <span className="pill" style={{ background: "var(--st-concluida)", color: "#fff" }}>✔ aprovada</span> : <span className="pill" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>⏳ aguardando</span>}</td></tr>)}</tbody></table>
          {!lista.length && <div className="empty" style={{ padding: 24 }}>Nenhuma venda aqui.</div>}
          {lista.length > 600 && <div className="hint">Mostrando 600 de {lista.length}. Use o Excel para ver tudo.</div>}
        </div>
      </div>
    </div>
  </section>;
}
