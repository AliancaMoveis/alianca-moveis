// Relatório: clientes com VISITA REALIZADA registrada (com ou sem loja agendada) — base do pagamento das visitas.
import { useState } from "react";
import { useApp } from "../estado";
import { STATUS_CLIENTE, fmtDateTime, hojeISO } from "../lib/regras";
import { baixarXlsx } from "../lib/planilha";
import { Kpi } from "./Dashboard";

export default function VisitasRealizadas() {
  const { R, st, abrirDetalhe } = useApp() as any;
  const h = hojeISO();
  const [de, setDe] = useState(h.slice(0, 8) + "01"); const [ate, setAte] = useState(h);
  const [cons, setCons] = useState(""); const [loja, setLoja] = useState<"" | "com" | "sem">("");
  const geral = R.ehGestao() || R.mySetores().some((x: string) => ["marketing_supervisao", "suporte_consultores"].includes(x));
  const quando = (c: any) => String((c.tratativa || {}).visitaRealizadaEm || c.dataVisita || "").slice(0, 10);
  const todas = st.chamados.filter((c: any) => R.domMarketing(c) && c.consultorId && (c.tratativa || {}).realizada && (geral || c.consultorId === R.currentUserId));
  const lista = todas.filter((c: any) => { const d = quando(c); return d >= de && d <= ate && (!cons || c.consultorId === cons) && (!loja || (loja === "com" ? !!c.dataLoja : !c.dataLoja)); })
    .sort((a: any, b: any) => quando(b).localeCompare(quando(a)));
  const porCons: Record<string, number> = {}; lista.forEach((c: any) => (porCons[c.consultorId] = (porCons[c.consultorId] || 0) + 1));
  const exportar = () => baixarXlsx("visitas_realizadas_" + de + "_a_" + ate + ".xlsx", ["ALM", "Cliente", "Consultor", "Data da visita", "Registrada em", "Registrada por", "Loja agendada", "Status atual", "Obs."],
    lista.map((c: any) => { const t = c.tratativa || {}; return [c.id, c.cliente, R.nomeUser(c.consultorId), c.dataVisita ? fmtDateTime(c.dataVisita) : "", t.visitaRealizadaEm ? fmtDateTime(t.visitaRealizadaEm) : "(antes do registro)", t.visitaRealizadaPor || "", c.dataLoja ? fmtDateTime(c.dataLoja) : "não", STATUS_CLIENTE[R.statusClienteDe(c)] || "", t.visitaRealizadaObs || ""]; }), "Visitas realizadas");
  return <section className="view active">
    <div className="view-head"><div><h2>✅ Visitas realizadas</h2><p>Clientes com a visita do consultor registrada como realizada — com ou sem vinda à loja agendada. Período pela data em que a visita foi registrada.</p></div></div>
    <div className="card" style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
      <div className="field" style={{ margin: 0 }}><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
      <div className="field" style={{ margin: 0 }}><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
      {geral && <div className="field" style={{ margin: 0, minWidth: 200 }}><label>Consultor</label><select value={cons} onChange={e => setCons(e.target.value)}><option value="">Todos</option>{R.consultores().map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>}
      <div className="field" style={{ margin: 0 }}><label>Loja</label><select value={loja} onChange={e => setLoja(e.target.value as any)}><option value="">Com ou sem loja</option><option value="com">Com loja agendada</option><option value="sem">Sem loja agendada</option></select></div>
      <button className="btn sm" style={{ marginLeft: "auto" }} onClick={exportar} disabled={!lista.length}>⬇ Excel</button>
    </div>
    <div className="kpis">
      <Kpi n={lista.length} l="Visitas realizadas no período" />
      <Kpi n={lista.filter((c: any) => c.dataLoja).length} l="Com vinda à loja agendada" />
      <Kpi n={lista.filter((c: any) => !c.dataLoja).length} l="Sem loja agendada" />
      {geral && <Kpi n={Object.keys(porCons).length} l="Consultores" />}
    </div>
    {geral && Object.keys(porCons).length > 0 && <div className="chips" style={{ margin: "10px 0" }}>{Object.entries(porCons).sort((a, b) => b[1] - a[1]).map(([u, n]) => <button key={u} className={"chip" + (cons === u ? " on" : "")} onClick={() => setCons(cons === u ? "" : u)}>{R.nomeUser(u)} · {n}</button>)}</div>}
    <div className="card" style={{ padding: 0, overflowX: "auto" }}>
      {!lista.length ? <div className="empty" style={{ padding: 22 }}>Nenhuma visita realizada no período.</div> :
        <table className="ma-tab"><thead><tr><th>Cliente</th><th>Consultor</th><th>Visita</th><th>Registrada</th><th>Loja</th><th>Status</th></tr></thead>
          <tbody>{lista.slice(0, 500).map((c: any) => { const t = c.tratativa || {}; return <tr key={c.id} className="ma-lin" onClick={() => abrirDetalhe(c.id)}>
            <td><b>{c.cliente}</b> <span className="hint">{c.id}</span></td><td>{R.nomeUser(c.consultorId)}</td><td>{c.dataVisita ? fmtDateTime(c.dataVisita) : "—"}</td>
            <td>{t.visitaRealizadaEm ? fmtDateTime(t.visitaRealizadaEm) : <span className="hint">antes do registro</span>}{t.visitaRealizadaPor ? <div className="hint">{t.visitaRealizadaPor}</div> : null}</td>
            <td>{c.dataLoja ? fmtDateTime(c.dataLoja) : <span className="hint">não agendada</span>}</td><td>{STATUS_CLIENTE[R.statusClienteDe(c)] || ""}</td></tr>; })}</tbody></table>}
    </div>
  </section>;
}
