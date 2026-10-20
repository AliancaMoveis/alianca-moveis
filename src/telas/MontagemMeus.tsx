// 📅 Agendamentos pessoais — cada agendadora da montagem vê quantos agendamentos fez no Exact (pela data de inclusão),
// sempre no ciclo do dia 26 do mês anterior ao dia 25 do mês. O vínculo usuária ↔ nome no Exact é feito pela Gestão.
// Vem do relatório do Exact que a Gestão envia em Montagem → Agendamentos (Exact). Sem dados de cliente: só a O.S.
import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";
import { MOCK } from "../lib/chat";
import { Kpi } from "./Dashboard";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const br = (s: string) => s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "";
/** ciclo 26 → 25 que contém o dia (desloc = ciclos para trás/frente) */
export function ciclo(hoje: string, desloc = 0): { de: string; ate: string } {
  const [y, m, d] = hoje.split("-").map(Number);
  const fimMes = (d >= 26 ? m + 1 : m) + desloc; // mês (1-12, pode transbordar) em que o ciclo termina no dia 25
  const ate = new Date(Date.UTC(y, fimMes - 1, 25)), de = new Date(Date.UTC(y, fimMes - 2, 26));
  return { de: iso(de), ate: iso(ate) };
}
const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const FORA = /^(CANCELADO|REJEITADO)$/i;
const ehAssist = (a: any) => /assist/i.test(a.montador) || /assist/i.test(a.os) || /^S\.A/i.test(a.os);

async function buscar(de: string, ate: string): Promise<any> {
  if (MOCK) return { vinculado: true, lider: "francilene", atualizado: new Date().toISOString(), itens: [
    { os: "O.S. 752671", montador: "Diego Martins", status: "AGUARDANDO MONTAGEM", inc: de, mont: ate, tipos: "Linha Pronta" },
    { os: "O.S. 752702", montador: "João Montador", status: "PAGAMENTO EFETUADO", inc: de, mont: de, tipos: "Planejada" },
    { os: "S.A 1200", montador: "Assistência", status: "CANCELADO", inc: ate, mont: ate, tipos: "" }] };
  const { data, error } = await sb.rpc("montagem_meus_agend", { p_de: de, p_ate: ate });
  if (error) throw new Error(error.message); return data;
}

export default function MontagemMeus() {
  const [desloc, setDesloc] = useState(0);
  const { de, ate } = ciclo(hojeISO(), desloc);
  const [r, setR] = useState<any>(null); const [erro, setErro] = useState(""); const [ver, setVer] = useState(false);
  useEffect(() => { setR(null); setErro(""); buscar(de, ate).then(setR).catch(e => setErro(e.message)); }, [de, ate]);
  const itens: any[] = r?.itens || [];
  const val = itens.filter(a => !FORA.test(String(a.status || "").trim())), canc = itens.length - val.length;
  const assist = val.filter(ehAssist).length;
  const porDia = (Object.entries(val.reduce((m: Record<string, number>, a) => { m[a.inc] = (m[a.inc] || 0) + 1; return m; }, {})) as [string, number][]).sort((a, b) => a[0].localeCompare(b[0]));
  const mx = Math.max(1, ...porDia.map(x => x[1]));
  return <section className="view active">
    <div className="view-head"><div><h2>📅 Agendamentos pessoais</h2><p>Os agendamentos de montagem que você fez no Exact, contados pela data em que foram incluídos. O período é sempre do dia 26 do mês anterior ao dia 25.</p></div></div>
    <div className="mm-per">
      <button className="btn ghost sm" onClick={() => setDesloc(desloc - 1)} aria-label="Período anterior">‹ Anterior</button>
      <b>{br(de)} a {br(ate)}</b>
      <button className="btn ghost sm" disabled={desloc >= 0} onClick={() => setDesloc(desloc + 1)} aria-label="Próximo período">Próximo ›</button>
      {desloc !== 0 && <button className="btn sm" onClick={() => setDesloc(0)}>Período atual</button>}
    </div>
    {erro ? <div className="empty">{erro}</div> : !r ? <div className="empty">Carregando…</div> : !r.vinculado ? <div className="empty" style={{ padding: 24 }}>Seu usuário ainda não está ligado ao seu nome no Exact. Peça à Gestão para fazer o vínculo (Montagem → Agendamentos (Exact) → ⚙ Quem recebe).</div> : <>
      <div className="kpis">
        <Kpi n={val.length} l="Agendamentos no período" />
        <Kpi n={val.length - assist} l="Montagem" />
        <Kpi n={assist} l="Assistência" />
        <Kpi n={canc} l="Cancelados / rejeitados (não contam)" />
      </div>
      <p className="hint" style={{ margin: "8px 0 0" }}>Nome no Exact: <b>{r.lider}</b>{r.atualizado ? " · relatório do Exact atualizado em " + new Date(r.atualizado).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}. Os números mudam quando a Gestão envia um relatório novo.</p>
      {porDia.length > 0 && <div className="card" style={{ marginTop: 14 }}><h3 style={{ marginTop: 0 }}>Por dia</h3>
        <div className="mm-dias">{porDia.map(([d, n]) => <div key={d}><span>{br(d).slice(0, 5)}</span><i style={{ width: (n / mx * 100) + "%" }} /><b>{n}</b></div>)}</div></div>}
      <div className="card" style={{ marginTop: 14, padding: 0, overflowX: "auto" }}>
        <div className="ma-cab"><b>O.S. agendadas ({itens.length})</b><button className="btn sm" onClick={() => setVer(!ver)}>{ver ? "Esconder" : "Ver a lista"}</button></div>
        {ver && <table className="ma-tab"><thead><tr><th>Incluída em</th><th>O.S.</th><th>Montador</th><th>Data da montagem</th><th>Status</th></tr></thead>
          <tbody>{itens.map((a, i) => <tr key={i} style={FORA.test(String(a.status || "").trim()) ? { opacity: .5 } : undefined}><td>{br(a.inc)}</td><td>{a.os}{a.tipos ? <small className="hint"> · {a.tipos}</small> : null}</td><td>{a.montador}</td><td>{br(a.mont)}</td><td>{a.status}</td></tr>)}</tbody></table>}
      </div>
    </>}
  </section>;
}
