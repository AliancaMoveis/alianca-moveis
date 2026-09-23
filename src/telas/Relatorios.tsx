import { useState } from "react";
import { useApp } from "../estado";
import { estaAtrasado } from "../lib/regras";
import { BarRow, Kpi } from "./Dashboard";

const Nada = ({ t }: { t: string }) => <div style={{ color: "var(--ink-faint)", fontSize: 13 }}>{t}</div>;
function Barras({ rows, cor, sufixo = "" }: { rows: [string, number][]; cor?: string; sufixo?: string }) {
  const mx = Math.max(1, ...rows.map(r => r[1]));
  return rows.length ? <>{rows.map(([nm, n]) => <BarRow key={nm} nm={nm} pct={n / mx * 100} v={n + sufixo} cor={cor} />)}</> : <Nada t="Sem dados no período." />;
}

export default function Relatorios() {
  const { R, st } = useApp();
  const [f, setF] = useState({ de: "", ate: "", se: "", tp: "" });
  const s = (k: string) => (e: any) => setF(x => ({ ...x, [k]: e.target.value }));
  let arr = st.chamados.filter(R.podeVer);
  if (f.de) arr = arr.filter(c => new Date(c.criadoEm) >= new Date(f.de + "T00:00:00"));
  if (f.ate) arr = arr.filter(c => new Date(c.criadoEm) <= new Date(f.ate + "T23:59:59"));
  if (f.se) arr = arr.filter(c => c.setorDestino === f.se);
  if (f.tp) arr = arr.filter(c => c.tipo === f.tp);
  const tempoResp = (c: any) => (!c.resposta || !c.resposta.quando) ? null : (+new Date(c.resposta.quando) - +new Date(c.criadoEm)) / 3600000;
  const total = arr.length, conc = arr.filter(c => c.status === "concluida").length, at = arr.filter(estaAtrasado).length;
  const tempos = arr.map(tempoResp).filter(v => v != null) as number[];
  const tmed = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;
  const porSetor: Record<string, number> = {}; arr.forEach(c => (porSetor[c.setorDestino] = (porSetor[c.setorDestino] || 0) + 1));
  const tps: Record<string, number[]> = {}; arr.forEach(c => { const t = tempoResp(c); if (t != null) (tps[c.setorDestino] = tps[c.setorDestino] || []).push(t); });
  const rowsTempo = R.setoresVisiveis().map(x => { const l = tps[x.id] || []; const m = l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0; return [x.nome, Math.round(m * 10) / 10] as [string, number]; }).filter(r => r[1] > 0);
  const porAt: Record<string, any> = {}; arr.forEach(c => { const k = c.solicitanteId; porAt[k] = porAt[k] || { abertos: 0, resolvidos: 0 }; porAt[k].abertos++; if (c.status === "concluida") porAt[k].resolvidos++; });
  const rowsAt = Object.entries(porAt).map(([uid, v]: any) => [R.nomeUser(uid), v.abertos, v.resolvidos] as [string, number, number]).sort((a, b) => b[1] - a[1]);
  const rowsResol = R.setoresVisiveis().map(x => { const d = arr.filter(c => c.setorDestino === x.id); if (!d.length) return null; return [x.nome, Math.round(d.filter(c => c.status === "concluida").length / d.length * 100)] as [string, number]; }).filter(Boolean) as [string, number][];
  const comFab = arr.filter(c => c.fabrica);
  const porFab: Record<string, number> = {}; comFab.forEach(c => (porFab[c.fabrica] = (porFab[c.fabrica] || 0) + 1));
  const rowsFabVol = Object.entries(porFab).map(([fid, n]) => [R.nomeFab(fid), n] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const fabAtr: Record<string, number> = {}; comFab.forEach(c => { if (estaAtrasado(c)) fabAtr[c.fabrica] = (fabAtr[c.fabrica] || 0) + 1; });
  const rowsFabAtr = Object.entries(fabAtr).map(([fid, n]) => [R.nomeFab(fid), n] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const fabGrp: Record<string, any[]> = {}; comFab.forEach(c => (fabGrp[c.fabrica] = fabGrp[c.fabrica] || []).push(c));
  const rowsFabResol = Object.entries(fabGrp).map(([fid, l]) => { const dentro = l.filter(c => c.resposta && new Date(c.resposta.quando) <= new Date(c.slaResposta)).length; return [R.nomeFab(fid), Math.round(dentro / l.length * 100)] as [string, number]; }).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const pctRows = (rows: [string, number][]) => rows.length ? rows.map(([nm, p]) => <BarRow key={nm} nm={nm} pct={p} v={p + "%"} cor="var(--st-concluida)" />) : <Nada t="Sem dados no período." />;
  return (
    <section className="view active" id="view-relatorios">
      <div className="view-head"><div><h2>Relatórios</h2><p id="relSub">Acompanhamento completo, em tempo real, por período e setor.</p></div></div>
      <div className="card" style={{ padding: "18px 20px", marginBottom: 16 }}><div className="grid">
        <div className="field"><label>De</label><input type="date" value={f.de} onChange={s("de")} /></div>
        <div className="field"><label>Até</label><input type="date" value={f.ate} onChange={s("ate")} /></div>
        <div className="field"><label>Setor</label><select value={f.se} onChange={s("se")}><option value="">Todos os setores</option>{R.setoresVisiveis().map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></div>
        <div className="field"><label>Motivo</label><select value={f.tp} onChange={s("tp")}><option value="">Todos os motivos</option>{Object.entries(R.TIPOS).map(([k, t]: any) => <option key={k} value={k}>{t.nome}</option>)}</select></div>
      </div><div style={{ marginTop: 14, display: "flex", gap: 10 }}><button className="btn ghost sm" onClick={() => setF({ de: "", ate: "", se: "", tp: "" })}>Limpar filtros</button><span className="live" style={{ marginLeft: 0 }}><i></i>atualiza ao vivo</span></div></div>
      <div className="kpis" id="relKpis"><Kpi n={total} l="Solicitações no período" /><Kpi n={conc} l="Concluídas" /><Kpi n={at} l="Atrasadas agora" cls={at ? "alert" : ""} /><Kpi n={tmed != null ? tmed.toFixed(1) + "h" : "—"} l="Tempo médio de resposta" /></div>
      <div className="panel-grid">
        <div className="panel"><h3>Volume por setor</h3><div><Barras rows={R.setoresVisiveis().map(x => [x.nome, porSetor[x.id] || 0] as [string, number])} /></div></div>
        <div className="panel"><h3>Tempo médio de resposta por setor</h3><div>{rowsTempo.length ? <Barras rows={rowsTempo} sufixo="h" /> : <Nada t="Ainda sem respostas registradas." />}</div></div>
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Por atendente <span className="pill" style={{ marginLeft: 8 }}>abertos / resolvidos</span></h3><div>{rowsAt.length ? rowsAt.map(([nm, ab, rv]) => <BarRow key={nm} nm={nm} pct={ab / Math.max(1, ...rowsAt.map(r => r[1])) * 100} v={ab} extra={<span className="v" style={{ color: "var(--st-concluida)" }}>{rv}</span>} />) : <Nada t="Sem dados no período." />}</div></div>
        <div className="panel"><h3>Resolutividade <span className="hint" style={{ marginLeft: 6 }}>% concluído sem reabrir</span></h3><div>{pctRows(rowsResol)}</div></div>
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Fábricas — mais solicitações</h3><div><Barras rows={rowsFabVol} /></div></div>
        <div className="panel"><h3>Fábricas — mais atraso</h3><div>{rowsFabAtr.length ? <Barras rows={rowsFabAtr} cor="var(--danger)" /> : <Nada t="Nenhuma fábrica atrasada no período." />}</div></div>
      </div>
      <div className="panel" style={{ marginBottom: 16 }}><h3>Fábricas — melhor resolutiva <span className="hint" style={{ marginLeft: 6 }}>% respondido dentro do prazo</span></h3><div>{pctRows(rowsFabResol)}</div></div>
    </section>
  );
}
