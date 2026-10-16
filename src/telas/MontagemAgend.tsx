// Montagem — acompanhamento dos agendamentos feitos no Exact (só a Gestão).
// O 360 não agenda montagem: aqui só entra o relatório exportado do Exact (CSV/Excel) para contar
// quantos agendamentos cada agendadora fez (pagamento por agendamento) e quantos cada montador recebeu no período.
// Não guardamos nome nem endereço do cliente: só o código da O.S., agendadora, montador, datas, status e valores.
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { sb } from "../lib/supabase";
import { MOCK } from "../lib/chat";
import { baixarXlsx } from "../lib/planilha";
import { fmtMoeda } from "../lib/regras";
import { col, lerArquivo } from "./Medidas";
import { Kpi } from "./Dashboard";

type Ag = { chave: string; os: string; lider: string; montador: string; status: string; indisponivel: boolean; data_inclusao: string; data_montagem: string; data_finalizacao: string | null; tipos: string; total: number };

export const podeMontagemAgend = (R: any) => R.mySetores().includes("gestao");

const iso = (s: string) => { const m = String(s || "").match(/(\d{2})[-\/](\d{2})[-\/](\d{4})/); return m ? m[3] + "-" + m[2] + "-" + m[1] : ""; };
const num = (s: string) => { const n = Number(String(s || "0").replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return isFinite(n) ? n : 0; };
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const somaDias = (s: string, n: number) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const br = (s: string) => s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "";
const ehAssist = (a: Ag) => /assist/i.test(a.montador) || /assist/i.test(a.os) || /^S\.A/i.test(a.os);
const FORA = ["CANCELADO", "REJEITADO"];
const fora = (a: Ag) => FORA.includes(String(a.status || "").toUpperCase());

/** linhas do Exact → agendamentos (a mesma O.S. vem em 2 linhas quando tem Linha Pronta + Planejada: vira 1 agendamento) */
function converter(linhas: any[]): Ag[] {
  const m = new Map<string, Ag>();
  for (const l of linhas) {
    const osFull = col(l, "os", "O.S."); const lider = col(l, "Lider", "Líder").trim(); const mont = col(l, "Montador").trim();
    if (!osFull || !lider) continue;
    const os = osFull.split("|")[0].trim();
    const dm = iso(col(l, "Data Montagem"));
    const chave = [os, mont, dm, lider].join("¦");
    const tipo = col(l, "Tipo").trim(); const tot = num(col(l, "Total OS"));
    const ex = m.get(chave);
    if (ex) { ex.total = Math.round((ex.total + tot) * 100) / 100; if (tipo && !ex.tipos.includes(tipo)) ex.tipos = ex.tipos ? ex.tipos + " + " + tipo : tipo; continue; }
    m.set(chave, { chave, os, lider, montador: mont, status: col(l, "status", "Status").trim(), indisponivel: /^sim/i.test(col(l, "Cliente indisponível para montagem")),
      data_inclusao: iso(col(l, "Data Inclusao", "Data Inclusão")), data_montagem: dm, data_finalizacao: iso(col(l, "Data Finalizacao", "Data Finalização")) || null, tipos: tipo, total: tot });
  }
  return Array.from(m.values());
}

let mockDados: Ag[] = [];
async function carregar(): Promise<Ag[]> {
  if (MOCK) return mockDados;
  const out: Ag[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from("montagem_agend").select("chave,os,lider,montador,status,indisponivel,data_inclusao,data_montagem,data_finalizacao,tipos,total").order("chave").range(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as Ag[]).map(a => ({ ...a, total: Number(a.total) || 0 })));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function enviar(ags: Ag[]): Promise<{ novos: number; atualizados: number; total: number }> {
  if (MOCK) { const k = new Set(mockDados.map(a => a.chave)); const novos = ags.filter(a => !k.has(a.chave)); mockDados = [...mockDados.filter(a => !ags.some(b => b.chave === a.chave)), ...ags]; return { novos: novos.length, atualizados: ags.length - novos.length, total: mockDados.length }; }
  let r = { novos: 0, atualizados: 0, total: 0 };
  for (let i = 0; i < ags.length; i += 500) {
    const p = ags.slice(i, i + 500).map(a => ({ chave: a.chave, os: a.os, lider: a.lider, montador: a.montador, status: a.status, indisp: a.indisponivel, inc: a.data_inclusao, mont: a.data_montagem, fin: a.data_finalizacao || "", tipos: a.tipos, total: a.total }));
    const { data, error } = await sb.rpc("montagem_importar", { p });
    if (error) throw new Error(error.message);
    r = { novos: r.novos + (data as any).novos, atualizados: r.atualizados + (data as any).atualizados, total: (data as any).total };
  }
  return r;
}

type Grupo = { nome: string; n: number; mont: number; assist: number; fora: number; total: number; dias: Record<string, number> };
function agrupar(lista: Ag[], chave: (a: Ag) => string, dia: (a: Ag) => string): Grupo[] {
  const m: Record<string, Grupo> = {};
  lista.forEach(a => {
    const k = chave(a) || "(sem nome)"; const g = (m[k] = m[k] || { nome: k, n: 0, mont: 0, assist: 0, fora: 0, total: 0, dias: {} });
    if (fora(a)) { g.fora++; return; }
    g.n++; if (ehAssist(a)) g.assist++; else g.mont++; g.total += a.total || 0;
    const d = dia(a); if (d) g.dias[d] = (g.dias[d] || 0) + 1;
  });
  return Object.values(m).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome));
}

export default function MontagemAgend() {
  const { R, toast } = useApp() as any;
  const [dados, setDados] = useState<Ag[] | null>(null); const [erro, setErro] = useState("");
  const [aba, setAba] = useState<"agend" | "mont">("agend");
  const h = hoje();
  const [de, setDe] = useState(h.slice(0, 8) + "01"); const [ate, setAte] = useState(h);
  const [valor, setValor] = useState(() => { try { return localStorage.getItem("a360-mont-valor") || "2"; } catch { return "2"; } });
  const [tipoM, setTipoM] = useState<"todos" | "mont" | "assist">("todos");
  const [aberto, setAberto] = useState("");
  const [enviando, setEnviando] = useState(""); const inp = useRef<HTMLInputElement>(null);
  const recarregar = () => carregar().then(setDados).catch(e => setErro(e.message));
  useEffect(() => { recarregar(); }, []);
  if (!podeMontagemAgend(R)) return <section className="view active"><div className="empty">Só a Gestão vê esta tela.</div></section>;

  const subir = async (f: File) => {
    setEnviando("Lendo " + f.name + "…");
    try {
      const ags = converter(await lerArquivo(f));
      if (!ags.length) { toast("Não encontrei agendamentos neste arquivo (precisa das colunas Lider, Montador, os, Data Montagem)"); return; }
      setEnviando("Enviando " + ags.length + " agendamentos…");
      const r = await enviar(ags);
      toast(r.novos + " novos · " + r.atualizados + " atualizados · " + r.total + " no total");
      const ds = ags.map(a => a.data_inclusao).filter(Boolean).sort();
      if (ds.length) { setDe(ds[0]); setAte(ds[ds.length - 1]); }
      await recarregar();
    } catch (e: any) { toast(e.message || "Não foi possível enviar"); }
    finally { setEnviando(""); if (inp.current) inp.current.value = ""; }
  };

  const vU = num(valor);
  const base = (dados || []).filter(a => tipoM === "todos" || (tipoM === "assist" ? ehAssist(a) : !ehAssist(a)));
  const dAg = (a: Ag) => a.data_inclusao, dMo = (a: Ag) => a.data_montagem;
  const noPer = (d: string) => !!d && d >= de && d <= ate;
  const lAg = base.filter(a => noPer(dAg(a))), lMo = base.filter(a => noPer(dMo(a)));
  const gAg = agrupar(lAg, a => a.lider, dAg), gMo = agrupar(lMo, a => a.montador, dMo);
  const g = aba === "agend" ? gAg : gMo;
  const tot = g.reduce((s, x) => s + x.n, 0), totFora = g.reduce((s, x) => s + x.fora, 0);
  const mx = Math.max(1, ...g.map(x => x.n));
  const ultimaData = (dados || []).reduce((m, a) => (a.data_inclusao > m ? a.data_inclusao : m), "");
  const periodo = (a: string, b: string) => { setDe(a); setAte(b); };
  const mesPassado = () => { const d = new Date(h.slice(0, 8) + "01T12:00:00Z"); d.setUTCDate(0); const fim = d.toISOString().slice(0, 10); periodo(fim.slice(0, 8) + "01", fim); };
  const exportar = () => {
    const cab = aba === "agend" ? ["Agendadora", "Agendamentos", "Montagem", "Assistência", "Valor por agendamento", "A pagar", "Cancelados/rejeitados (não contam)"] : ["Montador", "Agendamentos", "Montagem", "Assistência", "Total das O.S.", "Cancelados/rejeitados"];
    const linhas = g.map(x => aba === "agend" ? [x.nome, x.n, x.mont, x.assist, vU, x.n * vU, x.fora] : [x.nome, x.n, x.mont, x.assist, Math.round(x.total * 100) / 100, x.fora]);
    linhas.push(aba === "agend" ? ["TOTAL", tot, g.reduce((s, x) => s + x.mont, 0), g.reduce((s, x) => s + x.assist, 0), vU, tot * vU, totFora] : ["TOTAL", tot, g.reduce((s, x) => s + x.mont, 0), g.reduce((s, x) => s + x.assist, 0), Math.round(g.reduce((s, x) => s + x.total, 0) * 100) / 100, totFora]);
    baixarXlsx((aba === "agend" ? "agendadoras" : "montadores") + "_" + de + "_a_" + ate + ".xlsx", cab, linhas, aba === "agend" ? "Agendadoras" : "Montadores");
  };

  return (
    <section className="view active">
      <div className="view-head"><div><h2>🔧 Montagem · Agendamentos</h2><p>Acompanhamento dos agendamentos feitos no Exact — só para a Gestão. Envie o relatório exportado e filtre o período: quantos cada agendadora fez (para o pagamento) e quantos cada montador recebeu.</p></div></div>
      <div className="card ma-topo">
        <div className="ma-envio">
          <input ref={inp} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); }} />
          <button className="btn primary" disabled={!!enviando} onClick={() => inp.current?.click()}>{enviando || "📤 Enviar relatório do Exact (CSV ou Excel)"}</button>
          <span className="hint">{dados ? dados.length + " agendamentos guardados" + (ultimaData ? " · último agendado em " + br(ultimaData) : "") + ". Pode enviar o mesmo período de novo: não duplica, só atualiza o status." : erro || "Carregando…"}</span>
        </div>
        <div className="ma-filtros">
          <div className="field"><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
          <div className="field"><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
          <div className="chips" style={{ margin: 0 }}>
            <button className="chip" onClick={() => periodo(h.slice(0, 8) + "01", h)}>Este mês</button>
            <button className="chip" onClick={mesPassado}>Mês passado</button>
            <button className="chip" onClick={() => periodo(somaDias(h, -6), h)}>Últimos 7 dias</button>
            <button className="chip" onClick={() => periodo(h, h)}>Hoje</button>
            <button className="chip" onClick={() => { const ds = (dados || []).map(a => a.data_inclusao).filter(Boolean).sort(); if (ds.length) periodo(ds[0], h); }}>Tudo</button>
          </div>
        </div>
      </div>

      <div className="subnav" style={{ margin: "14px 0 10px" }}>
        <button className={aba === "agend" ? "on" : ""} onClick={() => { setAba("agend"); setAberto(""); }}>👩‍💼 Agendadoras</button>
        <button className={aba === "mont" ? "on" : ""} onClick={() => { setAba("mont"); setAberto(""); }}>🔧 Montadores</button>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>{([["todos", "Tudo"], ["mont", "Só montagem"], ["assist", "Só assistência"]] as [any, string][]).map(([k, l]) => <button key={k} className={tipoM === k ? "on" : ""} onClick={() => setTipoM(k)}>{l}</button>)}</span>
      </div>

      <div className="kpis">
        <Kpi n={tot} l={aba === "agend" ? "Agendamentos feitos no período (pela data em que foi agendado)" : "Montagens no período (pela data da montagem)"} />
        {aba === "agend" ? <>
          <Kpi n={fmtMoeda(tot * vU)} l={"A pagar às agendadoras (" + fmtMoeda(vU) + " por agendamento)"} fs={20} />
          <Kpi n={gAg.length} l="Agendadoras no período" />
        </> : <>
          <Kpi n={gMo.length} l="Montadores com agendamento" />
          <Kpi n={fmtMoeda(g.reduce((s, x) => s + x.total, 0))} l="Total das O.S. (valor do Exact)" fs={20} />
        </>}
        {totFora > 0 && <Kpi n={totFora} l="Cancelados / rejeitados (não contam)" />}
      </div>

      <div className="card" style={{ padding: 0, marginTop: 14, overflowX: "auto" }}>
        <div className="ma-cab">
          <b>{aba === "agend" ? "Agendamentos por agendadora" : "Agendamentos por montador"} · {br(de)} a {br(ate)}</b>
          {aba === "agend" && <label className="ma-valor">R$ por agendamento <input value={valor} onChange={e => { setValor(e.target.value); try { localStorage.setItem("a360-mont-valor", e.target.value); } catch { /* */ } }} inputMode="decimal" /></label>}
          <button className="btn sm" onClick={exportar} disabled={!g.length}>⬇ Excel</button>
        </div>
        {!g.length ? <div className="empty" style={{ padding: 24 }}>{dados && dados.length ? "Nenhum agendamento neste período." : "Envie o relatório do Exact para começar."}</div> :
          <table className="ma-tab"><thead><tr><th>{aba === "agend" ? "Agendadora" : "Montador"}</th><th className="n">Agend.</th><th></th><th className="n">Montagem</th><th className="n">Assist.</th><th className="n">{aba === "agend" ? "A pagar" : "Total O.S."}</th></tr></thead>
            <tbody>{g.map(x => <FragLinha key={x.nome} x={x} mx={mx} aba={aba} vU={vU} aberto={aberto === x.nome} abrir={() => setAberto(aberto === x.nome ? "" : x.nome)} />)}</tbody>
            <tfoot><tr><td>Total</td><td className="n">{tot}</td><td></td><td className="n">{g.reduce((s, x) => s + x.mont, 0)}</td><td className="n">{g.reduce((s, x) => s + x.assist, 0)}</td><td className="n">{aba === "agend" ? fmtMoeda(tot * vU) : fmtMoeda(g.reduce((s, x) => s + x.total, 0))}</td></tr></tfoot>
          </table>}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>Cada agendamento conta uma vez (a mesma O.S. com Linha Pronta e Planejada no mesmo dia e montador é um agendamento só). Cancelados e rejeitados não contam. Toque numa linha para ver por dia.</p>
    </section>
  );
}

function FragLinha({ x, mx, aba, vU, aberto, abrir }: { x: Grupo; mx: number; aba: string; vU: number; aberto: boolean; abrir: () => void }) {
  const dias = useMemo(() => Object.entries(x.dias).sort((a, b) => a[0].localeCompare(b[0])), [x]);
  return <>
    <tr className={"ma-lin" + (aberto ? " on" : "")} onClick={abrir}>
      <td><b>{x.nome}</b>{x.fora ? <small className="hint"> · {x.fora} cancel./rejeit.</small> : null}</td>
      <td className="n"><b>{x.n}</b></td>
      <td style={{ width: "30%" }}><div className="ma-barra"><i style={{ width: (x.n / mx * 100) + "%" }} /></div></td>
      <td className="n">{x.mont}</td><td className="n">{x.assist}</td>
      <td className="n">{aba === "agend" ? fmtMoeda(x.n * vU) : fmtMoeda(x.total)}</td>
    </tr>
    {aberto && <tr className="ma-dias"><td colSpan={6}>{dias.map(([d, n]) => <span key={d}><small>{br(d).slice(0, 5)}</small><b>{n}</b></span>)}</td></tr>}
  </>;
}
