// 📣 Anúncios: investimento e resultado das campanhas (Meta e Google, via Reportei) cruzados com o 360.
// Os números vêm da tabela anuncios_dia, que uma tarefa agendada atualiza a partir do Reportei.
// Só Gestão e proprietário leem (RLS _ve_anuncios).
import { useEffect, useMemo, useState } from "react";
import { sb } from "../lib/supabase";
import { MOCK } from "../lib/chat";
import { useApp } from "../estado";
import { fmtDate, fmtMoeda, hojeISO, isoLocal, pagamentosVenda, vendaContaVolume } from "../lib/regras";

// períodos: hoje, 7 dias, semana atual (segunda até hoje), 15 dias, 30 dias, mês atual, mês anterior e personalizado
export type Per = "hoje" | "7" | "semana" | "15" | "30" | "mes" | "ant" | "pers";
export const PERIODOS: [Per, string][] = [["hoje", "Hoje"], ["7", "7 dias"], ["semana", "Semana atual"], ["15", "15 dias"], ["30", "30 dias"], ["mes", "Mês atual"], ["ant", "Mês anterior"], ["pers", "📅 Personalizado"]];
export function periodoDe(per: Per, pDe: string, pAte: string) {
  const hj = new Date(); const hoje = isoLocal(hj); const menos = (n: number) => isoLocal(new Date(hj.getFullYear(), hj.getMonth(), hj.getDate() - n));
  if (per === "hoje") return { de: hoje, ate: hoje };
  if (per === "7") return { de: menos(6), ate: hoje };
  if (per === "15") return { de: menos(14), ate: hoje };
  if (per === "30") return { de: menos(29), ate: hoje };
  if (per === "semana") return { de: menos((hj.getDay() + 6) % 7), ate: hoje };
  if (per === "ant") return { de: isoLocal(new Date(hj.getFullYear(), hj.getMonth() - 1, 1)), ate: isoLocal(new Date(hj.getFullYear(), hj.getMonth(), 0)) };
  if (per === "pers") return pDe <= pAte ? { de: pDe, ate: pAte } : { de: pAte, ate: pDe };
  return { de: hoje.slice(0, 8) + "01", ate: hoje };
}
type Linha = { plataforma: "meta" | "google"; dia: string; campanha: string; tipo: string; gasto: number; impressoes: number; alcance: number; cliques: number; conversas: number; conversoes: number };
const PLAT: Record<string, { nome: string; cor: string; ic: string }> = { meta: { nome: "Meta (Instagram/Facebook)", cor: "#4a6cf7", ic: "Ⓜ" }, google: { nome: "Google Ads", cor: "#e3a008", ic: "Ⓖ" } };

function mock(de: string, ate: string): { linhas: Linha[]; sync: any } {
  const out: Linha[] = []; const d = new Date(de + "T12:00"); const f = new Date(ate + "T12:00"); let i = 0;
  const camps: [Linha["plataforma"], string, number][] = [["meta", "PUBLICO APROVADO ABERTO", 1800], ["meta", "PUBLICO BAIRROS RICOS", 950], ["meta", "CAMPANHA DE OFERTAS", 300], ["google", "10104 - Móveis Projetados", 3700], ["google", "PMAX-VISITA NO LOCAL", 600]];
  while (d <= f) { const dia = isoLocal(d); camps.forEach(([p, c, g], k) => { const x = g * (0.8 + ((i * 7 + k * 3) % 5) / 10);
    out.push({ plataforma: p, dia, campanha: c, tipo: p === "meta" ? (c.includes("OFERTAS") ? "Reach" : "Messaging Conversation Started 7d") : "Search", gasto: x, impressoes: Math.round(x * 60), alcance: Math.round(x * 20), cliques: Math.round(x / 1.6), conversas: p === "meta" && !c.includes("OFERTAS") ? Math.round(x / 37) : 0, conversoes: p === "google" ? Math.round(x / 60) : 0 }); });
    d.setDate(d.getDate() + 1); i++; }
  return { linhas: out, sync: { ultimo: new Date().toISOString(), ate: hojeISO() } };
}
async function carregar(de: string, ate: string): Promise<{ linhas: Linha[]; sync: any }> {
  if (MOCK) return mock(de, ate);
  const linhas: Linha[] = [];
  for (let p = 0; p < 20; p++) {
    const { data, error } = await sb.from("anuncios_dia").select("plataforma,dia,campanha,tipo,gasto,impressoes,alcance,cliques,conversas,conversoes").gte("dia", de).lte("dia", ate).order("dia").range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(error.message);
    (data || []).forEach((r: any) => linhas.push({ ...r, gasto: +r.gasto || 0, impressoes: +r.impressoes || 0, alcance: +r.alcance || 0, cliques: +r.cliques || 0, conversas: +r.conversas || 0, conversoes: +r.conversoes || 0 }));
    if (!data || data.length < 1000) break;
  }
  const { data: s } = await sb.from("anuncios_sync").select("*").maybeSingle();
  return { linhas, sync: s };
}

const n0 = (v: number) => Math.round(v).toLocaleString("pt-BR");
const din = (v: number | null) => (v == null || !isFinite(v) ? "—" : fmtMoeda(v));
const pctTxt = (v: number | null) => (v == null || !isFinite(v) ? "—" : (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%");
const div = (a: number, b: number) => (b ? a / b : null);

function Var({ a, b, inverso, fmt }: { a: number | null; b: number | null; inverso?: boolean; fmt: (v: number) => string }) {
  if (a == null || b == null || !b || !isFinite(a) || !isFinite(b)) return <span className="pb-comp neutro">sem base anterior</span>;
  const d = Math.round(((a - b) / b) * 100); const bom = inverso ? d <= 0 : d >= 0;
  return <span className={"pb-comp " + (d === 0 ? "neutro" : bom ? "bom" : "ruim")}>{d > 0 ? "▲" : d < 0 ? "▼" : "="} {Math.abs(d)}% <small>(antes {fmt(b)})</small></span>;
}
const Grande = ({ v, l, a, b, inverso, fmt, cor }: any) => <div className="pb-big"><b style={cor ? { color: cor } : undefined}>{v}</b><span>{l}</span>{a !== undefined && <Var a={a} b={b} inverso={inverso} fmt={fmt} />}</div>;

function somar(ls: Linha[]) {
  const t = { gasto: 0, impressoes: 0, cliques: 0, conversas: 0, conversoes: 0 };
  ls.forEach(l => { t.gasto += l.gasto; t.impressoes += l.impressoes; t.cliques += l.cliques; t.conversas += l.conversas; t.conversoes += l.conversoes; });
  return { ...t, contatos: t.conversas + t.conversoes };
}

export default function Anuncios({ de: de0, ate: ate0, movel }: { de?: string; ate?: string; movel?: boolean }) {
  const { st, R } = useApp() as any;
  // no celular (ou fora do painel) o período é escolhido aqui
  const hoje = hojeISO();
  const [per, setPer] = useState<Per>("mes");
  const [pDe, setPDe] = useState(hoje.slice(0, 8) + "01"); const [pAte, setPAte] = useState(hoje);
  const { de: perDe, ate: perAte } = periodoDe(per, pDe, pAte);
  const de = de0 || perDe, ate = ate0 || perAte;
  const d0 = new Date(de + "T00:00:00"), d1 = new Date(ate + "T23:59:59");
  const dias = Math.max(1, Math.round((+d1 - +d0) / 86400000)); // nº de dias do período (inclusivo)
  const dePrev = isoLocal(new Date(+d0 - dias * 86400000)), atePrev = isoLocal(new Date(+d0 - 86400000));
  const [dados, setDados] = useState<{ linhas: Linha[]; sync: any } | null | undefined>(undefined); const [erro, setErro] = useState("");
  const [plat, setPlat] = useState<"todas" | "meta" | "google">("todas");
  useEffect(() => { setDados(undefined); carregar(dePrev, ate).then(setDados).catch(e => { setErro(e.message); setDados(null); }); }, [dePrev, ate]);

  // ---------- 360: clientes do marketing no mesmo período ----------
  const no = (v: any, a: string, b: string) => { if (!v) return false; const s = String(v).slice(0, 10); return s >= a && s <= b; };
  const funil = (a: string, b: string) => {
    const mk = st.chamados.filter((c: any) => R.domMarketing(c));
    const cad = mk.filter((c: any) => no(c.criadoEm, a, b));
    const loja = mk.filter((c: any) => no(c.dataLoja, a, b));
    const vend = mk.filter((c: any) => vendaContaVolume(c.venda) && pagamentosVenda(c.venda).some((p: any) => no(p.data, a, b)));
    const fat = vend.reduce((s: number, c: any) => s + (Number(c.venda && c.venda.valorNum) || 0), 0);
    return { cad: cad.length, loja: loja.length, vend: vend.length, fat };
  };
  const F1 = useMemo(() => funil(de, ate), [st.chamados, de, ate]);
  const F0 = useMemo(() => funil(dePrev, atePrev), [st.chamados, dePrev, atePrev]);

  if (dados === undefined) return <div className="dn-vazio">Carregando os anúncios…</div>;
  if (!dados) return <div className="dn-vazio">Não consegui ler os anúncios: {erro}</div>;
  const filtra = (ls: Linha[]) => plat === "todas" ? ls : ls.filter(l => l.plataforma === plat);
  const atual = filtra(dados.linhas.filter(l => l.dia >= de && l.dia <= ate));
  const ant = filtra(dados.linhas.filter(l => l.dia >= dePrev && l.dia <= atePrev));
  const T1 = somar(atual), T0 = somar(ant);
  const porPlat = (["meta", "google"] as const).map(p => ({ p, a: somar(atual.filter(l => l.plataforma === p)), b: somar(ant.filter(l => l.plataforma === p)) })).filter(x => x.a.gasto || x.b.gasto);
  // campanhas
  const camp: Record<string, Linha & { dias: number }> = {};
  atual.forEach(l => { const k = l.plataforma + "|" + l.campanha; const c = camp[k] = camp[k] || { ...l, gasto: 0, impressoes: 0, alcance: 0, cliques: 0, conversas: 0, conversoes: 0, dias: 0 };
    c.gasto += l.gasto; c.impressoes += l.impressoes; c.cliques += l.cliques; c.conversas += l.conversas; c.conversoes += l.conversoes; c.dias++; c.tipo = l.tipo; });
  const camps = Object.values(camp).sort((a, b) => b.gasto - a.gasto);
  // por dia
  const porDia: Record<string, { meta: number; google: number }> = {};
  for (let d = new Date(de + "T12:00"); d <= new Date(ate + "T12:00"); d.setDate(d.getDate() + 1)) porDia[isoLocal(d)] = { meta: 0, google: 0 };
  atual.forEach(l => { if (porDia[l.dia]) porDia[l.dia][l.plataforma] += l.gasto; });
  const diasArr = Object.entries(porDia); const mxDia = Math.max(1, ...diasArr.map(([, v]) => v.meta + v.google));
  const semDados = diasArr.filter(([d, v]) => !v.meta && !v.google && d <= (dados.sync?.ate || hoje)).length;
  const gastoTotal1 = somar(dados.linhas.filter(l => l.dia >= de && l.dia <= ate)).gasto, gastoTotal0 = somar(dados.linhas.filter(l => l.dia >= dePrev && l.dia <= atePrev)).gasto;
  const resultado = (c: any) => c.plataforma === "meta" ? (c.conversas ? n0(c.conversas) + " conversas" : "alcance") : n0(c.conversoes) + " conversões";
  const custoRes = (c: any) => { const r = c.plataforma === "meta" ? c.conversas : c.conversoes; return r ? din(c.gasto / r) : "—"; };

  return <div className={"an" + (movel ? " an-movel" : "")}>
    {!de0 && <div className="an-per">{PERIODOS.map(([k, l]) => <button key={k} className={"chip" + (per === k ? " on" : "")} onClick={() => setPer(k)}>{l}</button>)}
      {per === "pers" && <span className="an-pers"><input type="date" value={pDe} max={pAte} onChange={e => setPDe(e.target.value || pDe)} /> até <input type="date" value={pAte} min={pDe} max={hoje} onChange={e => setPAte(e.target.value || pAte)} /></span>}</div>}
    <div className="an-per">{([["todas", "Todas as plataformas"], ["meta", "Ⓜ Meta"], ["google", "Ⓖ Google"]] as const).map(([k, l]) => <button key={k} className={"chip" + (plat === k ? " on" : "")} onClick={() => setPlat(k)}>{l}</button>)}</div>
    <div className="pb-per">Comparando {fmtDate(de)}–{fmtDate(ate)} com {fmtDate(dePrev)}–{fmtDate(atePrev)}</div>

    <div className="pb-bigs">
      <Grande v={din(T1.gasto)} l="Investido em anúncios" a={T1.gasto} b={T0.gasto} inverso fmt={din} />
      <Grande v={n0(T1.contatos)} l={`Contatos gerados · ${n0(T1.conversas)} conversas (Meta) + ${n0(T1.conversoes)} conversões (Google)`} a={T1.contatos} b={T0.contatos} fmt={n0} cor="var(--st-concluida)" />
      <Grande v={din(div(T1.gasto, T1.contatos))} l="Custo por contato" a={div(T1.gasto, T1.contatos)} b={div(T0.gasto, T0.contatos)} inverso fmt={din} />
      <Grande v={pctTxt(div(T1.cliques, T1.impressoes))} l={`CTR · ${n0(T1.cliques)} cliques em ${n0(T1.impressoes)} impressões`} a={div(T1.cliques, T1.impressoes)} b={div(T0.cliques, T0.impressoes)} fmt={(v: number) => pctTxt(v)} />
    </div>

    <h3 className="an-h">No 360: o que os anúncios viraram <small>(clientes do marketing, todas as plataformas)</small></h3>
    <div className="pb-bigs">
      <Grande v={n0(F1.cad)} l={`Clientes cadastrados · ${din(div(gastoTotal1, F1.cad))} por cliente`} a={F1.cad} b={F0.cad} fmt={n0} />
      <Grande v={n0(F1.loja)} l={`Agendados na loja · ${din(div(gastoTotal1, F1.loja))} por agendamento`} a={F1.loja} b={F0.loja} fmt={n0} />
      <Grande v={n0(F1.vend)} l={`Vendas · ${din(div(gastoTotal1, F1.vend))} de anúncio por venda`} a={F1.vend} b={F0.vend} fmt={n0} cor="var(--st-concluida)" />
      <Grande v={F1.fat && gastoTotal1 ? (F1.fat / gastoTotal1).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "x" : "—"} l={`Retorno: ${din(F1.fat)} vendidos ÷ ${din(gastoTotal1)} investidos`} a={gastoTotal1 ? F1.fat / gastoTotal1 : null} b={gastoTotal0 ? F0.fat / gastoTotal0 : null} fmt={(v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "x"} />
    </div>

    <div className="panel-grid">
      {porPlat.map(({ p, a, b }) => <div key={p} className="panel an-plat">
        <h3><span style={{ color: PLAT[p].cor }}>{PLAT[p].ic}</span> {PLAT[p].nome}</h3>
        <div className="an-linhas">
          <div><span>Investido</span><b>{din(a.gasto)}</b><Var a={a.gasto} b={b.gasto} inverso fmt={din} /></div>
          <div><span>Impressões</span><b>{n0(a.impressoes)}</b><Var a={a.impressoes} b={b.impressoes} fmt={n0} /></div>
          <div><span>Cliques</span><b>{n0(a.cliques)}</b><Var a={a.cliques} b={b.cliques} fmt={n0} /></div>
          <div><span>CTR</span><b>{pctTxt(div(a.cliques, a.impressoes))}</b></div>
          <div><span>Custo por clique</span><b>{din(div(a.gasto, a.cliques))}</b><Var a={div(a.gasto, a.cliques)} b={div(b.gasto, b.cliques)} inverso fmt={din} /></div>
          <div><span>{p === "meta" ? "Conversas no WhatsApp/Direct" : "Conversões"}</span><b>{n0(p === "meta" ? a.conversas : a.conversoes)}</b><Var a={p === "meta" ? a.conversas : a.conversoes} b={p === "meta" ? b.conversas : b.conversoes} fmt={n0} /></div>
          <div><span>{p === "meta" ? "Custo por conversa" : "Custo por conversão"}</span><b>{din(div(a.gasto, p === "meta" ? a.conversas : a.conversoes))}</b><Var a={div(a.gasto, p === "meta" ? a.conversas : a.conversoes)} b={div(b.gasto, p === "meta" ? b.conversas : b.conversoes)} inverso fmt={din} /></div>
        </div>
      </div>)}
    </div>

    <div className="panel">
      <h3>Investimento por dia <small className="an-leg">{(["meta", "google"] as const).map(p => <span key={p}><i style={{ background: PLAT[p].cor }} />{p === "meta" ? "Meta" : "Google"}</span>)}</small></h3>
      <div className="an-dias">{diasArr.map(([d, v]) => <div key={d} className="an-dia" title={`${fmtDate(d)} · Meta ${din(v.meta)} · Google ${din(v.google)}`}>
        <div className="an-col"><i style={{ height: (v.google / mxDia * 100) + "%", background: PLAT.google.cor }} /><i style={{ height: (v.meta / mxDia * 100) + "%", background: PLAT.meta.cor }} /></div>
        <span>{d.slice(8, 10)}</span></div>)}</div>
      {semDados > 0 && <div className="pb-per">{semDados} dia(s) do período sem dados no Reportei.</div>}
    </div>

    <div className="panel">
      <h3>Campanhas no período</h3>
      {camps.length ? <div className="an-tab-wrap"><table className="an-tab"><thead><tr><th>Campanha</th><th>Investido</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>Resultado</th><th>Custo/result.</th></tr></thead>
        <tbody>{camps.map(c => <tr key={c.plataforma + c.campanha}><td><b style={{ color: PLAT[c.plataforma].cor }}>{PLAT[c.plataforma].ic}</b> {c.campanha}</td><td>{din(c.gasto)}</td><td>{n0(c.impressoes)}</td><td>{n0(c.cliques)}</td><td>{pctTxt(div(c.cliques, c.impressoes))}</td><td>{resultado(c)}</td><td>{custoRes(c)}</td></tr>)}</tbody></table></div>
        : <div className="dn-vazio">Sem anúncios no período.</div>}
    </div>
    <div className="pb-per">Fonte: Reportei (Meta Ads e Google Ads){dados.sync?.ate ? " · dados até " + fmtDate(dados.sync.ate) : ""}{dados.sync?.ultimo ? " · atualizado em " + new Date(dados.sync.ultimo).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}. Os números do dia de hoje entram na próxima atualização.</div>
  </div>;
}
