// Fechamento mensal de consultores e medidores.
// Até a Gestão confirmar, tudo é PREVISÃO. O que for confirmado é pago no mês seguinte.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { sb } from "../lib/supabase";
import { fmtDate, fmtMoeda, hojeISO } from "../lib/regras";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const mesPt = (iso: string) => { const [y, m] = String(iso).split("-").map(Number); return MESES[(m || 1) - 1] + "/" + y; };
const proxMes = (iso: string) => { const [y, m] = iso.split("-").map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`; };
const TIPO: Record<string, string> = { visita: "Visita", medida: "Medida", comissao: "Comissão", reembolso: "Reembolso" };

async function previa(ate?: string) {
  const { data, error } = await sb.rpc("previa_fechamento_campo", ate ? { p_ate: ate } : {});
  if (error) throw error;
  return (data || []).map((r: any) => ({ ...r, valor: Number(r.valor), base: Number(r.base) }));
}
async function fechamentos(uid?: string) {
  let q = sb.from("campo_fechamentos").select("*").order("fechado_em", { ascending: false }).limit(uid ? 12 : 300);
  if (uid) q = q.eq("usuario_id", uid);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((f: any) => ({ ...f, total: Number(f.total) }));
}
async function itensDe(fid: string) {
  const { data } = await sb.from("campo_fechamento_itens").select("*").eq("fechamento_id", fid).order("dia");
  return (data || []).map((i: any) => ({ ...i, valor: Number(i.valor) }));
}

function Itens({ l }: { l: any[] }) {
  return <div className="fc-itens">{l.map((i: any, k: number) => <div key={k} className={"fc-it" + (i.valor < 0 ? " neg" : "")}><span>{i.dia ? fmtDate(i.dia) : "—"}</span><span className="d">{i.descricao || TIPO[i.tipo]}</span><b>{fmtMoeda(i.valor)}</b></div>)}</div>;
}

// ---------- Gestão ----------
export function FechamentoGestao() {
  const { R, executar: ex, toast } = useApp() as any;
  const hoje = hojeISO();
  const [ate, setAte] = useState(hoje);
  const [rows, setRows] = useState<any[] | null>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState("");
  const [loteAb, setLoteAb] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => { let vivo = true; setRows(null); setErro("");
    Promise.all([previa(ate), fechamentos()]).then(([p, h]) => { if (vivo) { setRows(p); setHist(h); } }).catch(e => vivo && setErro(String(e?.message || e)));
    return () => { vivo = false; }; }, [ate, tick]);
  const porPessoa: Record<string, { nome: string; itens: any[]; total: number }> = {};
  (rows || []).forEach((r: any) => { const p = (porPessoa[r.usuario_id] = porPessoa[r.usuario_id] || { nome: r.nome, itens: [], total: 0 }); p.itens.push(r); p.total += r.valor; });
  const pessoas = Object.entries(porPessoa).sort((a, b) => b[1].total - a[1].total);
  const total = pessoas.reduce((s, [, p]) => s + p.total, 0);
  const lotes: Record<string, any> = {};
  hist.forEach((f: any) => { const l = (lotes[f.lote] = lotes[f.lote] || { lote: f.lote, quando: f.fechado_em, ate: f.ate, pagarEm: f.pagar_em, por: f.fechado_por, pessoas: [], total: 0 }); l.pessoas.push(f); l.total += f.total; });
  const listaLotes = Object.values(lotes).sort((a: any, b: any) => String(b.quando).localeCompare(String(a.quando)));
  const pagar = proxMes(ate);
  const confirmar = () => {
    if (!pessoas.length) { toast("Nada pendente para confirmar"); return; }
    if (!confirm(`Confirmar o fechamento até ${fmtDate(ate)}?\n\n${pessoas.length} pessoa(s) · ${fmtMoeda(total)}\nSerá pago em ${mesPt(pagar)}.\n\nConfira antes com o Financeiro as vendas canceladas.`)) return;
    ex(async () => { const { error } = await sb.rpc("fechar_mes_campo", { p_ate: ate }); if (error) throw error; }, "Fechamento confirmado — cada um foi avisado").then(() => setTick(t => t + 1));
  };
  const desfazer = (lote: string) => {
    if (!confirm("Desfazer este fechamento? Os valores voltam a ser previsão.")) return;
    ex(async () => { const { error } = await sb.rpc("desfazer_fechamento_campo", { p_lote: lote }); if (error) throw error; }, "Fechamento desfeito").then(() => setTick(t => t + 1));
  };
  return (
    <div className="panel fc" style={{ marginBottom: 16 }}>
      <h3>🔒 Fechamento do mês — consultores e medidores</h3>
      <div className="sub" style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10 }}>Tudo abaixo ainda é <b>previsão</b>. Confira com o Financeiro (vendas canceladas → marque “Cancelada” na venda) e confirme, normalmente no penúltimo ou último dia do mês. O que for confirmado é pago no <b>mês seguinte</b>. Venda cancelada depois de confirmada vira <b>estorno</b> no próximo fechamento.</div>
      <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginBottom: 12 }}>
        <div className="field" style={{ margin: 0 }}><label>Confirmar tudo gerado até</label><input type="date" value={ate} max={hoje} onChange={e => setAte(e.target.value || hoje)} /></div>
        <div className="kpi" style={{ minWidth: 150, padding: "8px 12px" }}><div className="n" style={{ fontSize: 20 }}>{fmtMoeda(total)}</div><div className="l">a confirmar · {pessoas.length} pessoa(s)</div></div>
        <button className="btn primary" onClick={confirmar} disabled={!pessoas.length}>Confirmar fechamento — pagar em {mesPt(pagar)}</button>
      </div>
      {erro ? <div className="empty">Não foi possível carregar o fechamento ({erro}).</div> : rows === null ? <div className="empty">Carregando…</div> : !pessoas.length ? <div className="empty">Nada pendente até {fmtDate(ate)}.</div> :
        <table className="dl-tab"><thead><tr><th>Pessoa</th><th>Itens</th><th>Visitas/medidas</th><th>Comissão</th><th>Reembolsos</th><th>Total</th></tr></thead><tbody>
          {pessoas.map(([uid, p]) => { const s = (t: string) => p.itens.filter((i: any) => t.split(",").includes(i.tipo)).reduce((x: number, i: any) => x + i.valor, 0); return [
            <tr key={uid} onClick={() => setAberto(aberto === uid ? "" : uid)} style={{ cursor: "pointer" }}><td><b>{p.nome}</b> <span className="hint">{aberto === uid ? "▾" : "▸"}</span></td><td>{p.itens.length}</td><td>{fmtMoeda(s("visita,medida"))}</td><td>{fmtMoeda(s("comissao"))}</td><td>{fmtMoeda(s("reembolso"))}</td><td style={{ fontWeight: 800 }}>{fmtMoeda(p.total)}</td></tr>,
            aberto === uid && <tr key={uid + "i"}><td colSpan={6}><Itens l={p.itens} /></td></tr>]; })}
        </tbody></table>}
      {listaLotes.length > 0 && <>
        <div className="sec-label" style={{ marginTop: 16 }}>Fechamentos confirmados</div>
        {listaLotes.map((l: any, i: number) => <div key={l.lote} className="fc-lote">
          <div className="fc-lote-c" onClick={() => setLoteAb(loteAb === l.lote ? "" : l.lote)}><b>Até {fmtDate(l.ate)}</b> · pagar em <b>{mesPt(l.pagarEm)}</b> · {l.pessoas.length} pessoa(s) · <b>{fmtMoeda(l.total)}</b> <span className="hint">confirmado em {new Date(l.quando).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{l.por ? " por " + R.nomeUser(l.por) : ""}</span>
            {i === 0 && <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={e => { e.stopPropagation(); desfazer(l.lote); }}>Desfazer</button>}</div>
          {loteAb === l.lote && <div className="fc-itens">{l.pessoas.sort((a: any, b: any) => b.total - a.total).map((f: any) => <div key={f.id} className="fc-it"><span></span><span className="d">{R.nomeUser(f.usuario_id)}</span><b>{fmtMoeda(f.total)}</b></div>)}</div>}
        </div>)}
      </>}
    </div>
  );
}

// ---------- a própria pessoa (ou a Gestão olhando o extrato de alguém) ----------
export function FechamentoMeu({ uid, movel }: { uid: string; movel?: boolean }) {
  const [pend, setPend] = useState<any[] | null>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [ab, setAb] = useState(""); const [itens, setItens] = useState<any[]>([]); const [verPend, setVerPend] = useState(false);
  useEffect(() => { let vivo = true;
    Promise.all([previa(), fechamentos(uid)]).then(([p, h]) => { if (vivo) { setPend(p.filter((r: any) => r.usuario_id === uid)); setHist(h); } }).catch(() => vivo && setPend([]));
    return () => { vivo = false; }; }, [uid]);
  const abrir = async (id: string) => { if (ab === id) { setAb(""); return; } setAb(id); setItens(await itensDe(id)); };
  const totPend = (pend || []).reduce((s, r) => s + r.valor, 0);
  const proxPag = proxMes(hojeISO());
  return (
    <div className={movel ? "mv-bloco" : "panel"} style={movel ? undefined : { marginBottom: 16 }}>
      <div className={movel ? "mv-bloco-t" : ""}>{movel ? "Pagamento" : <h3>Pagamento — previsão e confirmado</h3>}</div>
      <div className="fc-cards">
        <div className="fc-card prev" onClick={() => setVerPend(v => !v)}><span>Previsão · aguardando a Gestão</span><b>{pend === null ? "…" : fmtMoeda(totPend)}</b><small>se confirmado até o fim do mês, pago em {mesPt(proxPag)} {pend && pend.length ? (verPend ? "▾" : "▸") : ""}</small></div>
        {hist[0] && <div className="fc-card ok" onClick={() => abrir(hist[0].id)}><span>✅ Confirmado · pagamento em {mesPt(hist[0].pagar_em)}</span><b>{fmtMoeda(hist[0].total)}</b><small>fechamento até {fmtDate(hist[0].ate)} {ab === hist[0].id ? "▾" : "▸"}</small></div>}
      </div>
      {verPend && pend && pend.length > 0 && <Itens l={pend} />}
      {ab && <Itens l={itens} />}
      {hist.length > 1 && <div className="fc-hist">{hist.slice(1).map((f: any) => <button key={f.id} className={"fc-h" + (ab === f.id ? " on" : "")} onClick={() => abrir(f.id)}>{mesPt(f.pagar_em)}: <b>{fmtMoeda(f.total)}</b></button>)}</div>}
    </div>
  );
}
