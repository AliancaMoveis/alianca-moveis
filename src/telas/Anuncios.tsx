// 📣 Anúncios: investimento e resultado das campanhas (Meta e Google, via Reportei) cruzados com o 360.
// Os números vêm da tabela anuncios_dia, que uma tarefa agendada atualiza a partir do Reportei.
// Só Gestão e proprietário leem (RLS _ve_anuncios).
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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
export const INICIO_360 = "2026-10-15"; // primeiro dia com todos os cadastros do marketing feitos no 360
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

export default function Anuncios({ de: de0, ate: ate0, movel, resumo }: { de?: string; ate?: string; movel?: boolean; resumo?: boolean }) {
  const { st, R, irPara } = useApp() as any;
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
  // todo cliente cadastrado pelas meninas no 360 vem de anúncio. Os cadastros pelo 360 começaram em 15/10/2026:
  // antes disso os números do 360 não batem com o investimento. Planilhas importadas não contam.
  const importado = (c: any) => /^Importa/i.test(c.solicitante || "") || !!(c.tratativa && (c.tratativa.agendLojaImportado || c.tratativa.importadoVisita || c.tratativa.visitaImportada));
  const funil = (a0: string, b: string) => {
    const a = a0 < INICIO_360 ? INICIO_360 : a0;
    if (a > b) return { cad: 0, loja: 0, vend: 0, fat: 0 };
    const mk = st.chamados.filter((c: any) => R.domMarketing(c) && !importado(c) && String(c.criadoEm).slice(0, 10) >= INICIO_360);
    const cad = mk.filter((c: any) => no(c.criadoEm, a, b));
    const loja = mk.filter((c: any) => no(c.dataLoja, a, b));
    const vend = mk.filter((c: any) => vendaContaVolume(c.venda) && pagamentosVenda(c.venda).some((p: any) => no(p.data, a, b)));
    const fat = vend.reduce((s: number, c: any) => s + (Number(c.venda && c.venda.valorNum) || 0), 0);
    return { cad: cad.length, loja: loja.length, vend: vend.length, fat };
  };
  const F1 = useMemo(() => funil(de, ate), [st.chamados, de, ate]);
  const mk360 = useMemo(() => st.chamados.filter((c: any) => R.domMarketing(c) && !importado(c) && String(c.criadoEm).slice(0, 10) >= INICIO_360), [st.chamados]);
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
  const cl = (x: string) => (x < INICIO_360 ? INICIO_360 : x);
  const gastoTotal1 = somar(dados.linhas.filter(l => l.dia >= cl(de) && l.dia <= ate)).gasto, gastoTotal0 = somar(dados.linhas.filter(l => l.dia >= cl(dePrev) && l.dia <= atePrev)).gasto;
  const cortado = de < INICIO_360;
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

    <h3 className="an-h">No 360: o que os anúncios viraram <small>(todo cliente cadastrado pelo marketing vem de anúncio · Meta e Google juntos)</small></h3>
    {cortado && <div className="an-aviso">📌 Os cadastros pelo 360 começaram em <b>15/10</b>. Este bloco conta de {ate < INICIO_360 ? "15/10 (sem dados no período escolhido)" : <><b>{fmtDate(cl(de))}</b> a <b>{fmtDate(ate)}</b></>} — o investimento usado no custo por cliente é o desse mesmo intervalo.</div>}
    <div className="pb-bigs">
      <Grande v={n0(F1.cad)} l={`Clientes cadastrados · ${din(div(gastoTotal1, F1.cad))} por cliente`} a={F1.cad} b={F0.cad} fmt={n0} />
      <Grande v={n0(F1.loja)} l={`Agendados na loja · ${din(div(gastoTotal1, F1.loja))} por agendamento`} a={F1.loja} b={F0.loja} fmt={n0} />
      <Grande v={n0(F1.vend)} l={`Vendas · ${din(div(gastoTotal1, F1.vend))} de anúncio por venda`} a={F1.vend} b={F0.vend} fmt={n0} cor="var(--st-concluida)" />
      <Grande v={F1.fat && gastoTotal1 ? (F1.fat / gastoTotal1).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "x" : "—"} l={`Retorno: ${din(F1.fat)} vendidos ÷ ${din(gastoTotal1)} investidos`} a={gastoTotal1 ? F1.fat / gastoTotal1 : null} b={gastoTotal0 ? F0.fat / gastoTotal0 : null} fmt={(v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "x"} />
    </div>

    {resumo ? <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "-4px 0 16px" }}>
      {porPlat.map(({ p, a }) => <span key={p} className="pill" style={{ borderColor: PLAT[p].cor, color: PLAT[p].cor }}>{PLAT[p].ic} {p === "meta" ? "Meta" : "Google"}: {din(a.gasto)} · {n0(p === "meta" ? a.conversas : a.conversoes)} {p === "meta" ? "conversas" : "conversões"}</span>)}
      <button className="btn sm primary" onClick={() => irPara("anuncios")}>Ver anúncios completos →</button>
      <span className="pb-per" style={{ margin: 0 }}>Reportei{dados.sync?.ate ? " · dados até " + fmtDate(dados.sync.ate) : ""}</span></div> : <>
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

    <DiaSemana linhas={dados.linhas} mk={mk360} de={de} de360={cl(de)} ate={ate} />
    <Horario mk={mk360} de={cl(de)} ate={ate} />
    <OrigemClientes mk={mk360} de={cl(de)} ate={ate} contatos={somar(dados.linhas.filter(l => l.dia >= de && l.dia <= ate)).contatos} deAn={de} />

    <div className="panel">
      <h3>Campanhas no período</h3>
      {camps.length ? <div className="an-tab-wrap"><table className="an-tab"><thead><tr><th>Campanha</th><th>Investido</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>Resultado</th><th>Custo/result.</th></tr></thead>
        <tbody>{camps.map(c => <tr key={c.plataforma + c.campanha}><td><b style={{ color: PLAT[c.plataforma].cor }}>{PLAT[c.plataforma].ic}</b> {c.campanha}</td><td>{din(c.gasto)}</td><td>{n0(c.impressoes)}</td><td>{n0(c.cliques)}</td><td>{pctTxt(div(c.cliques, c.impressoes))}</td><td>{resultado(c)}</td><td>{custoRes(c)}</td></tr>)}</tbody></table></div>
        : <div className="dn-vazio">Sem anúncios no período.</div>}
    </div>
    </>}
    {!resumo && <div className="pb-per">Fonte: Reportei (Meta Ads e Google Ads){dados.sync?.ate ? " · dados até " + fmtDate(dados.sync.ate) : ""}{dados.sync?.ultimo ? " · atualizado em " + new Date(dados.sync.ultimo).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}. Os números do dia de hoje entram na próxima atualização.</div>}
  </div>;
}

// ---------- 📅 melhor dia da semana: o que se avalia é GERAR CONVERSA (contatos e custo por contato, do Reportei) ----------
// cadastros e agendamentos do 360 entram como apoio (pelo dia em que o lead chegou); valor de venda não entra
const DIAS_SEM = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const diaLocal = (v: any) => { const d = new Date(String(v).length <= 10 ? v + "T12:00" : v); return isNaN(+d) ? null : d; };
function DiaSemana({ linhas, mk, de, ate, de360 }: { linhas: Linha[]; mk: any[]; de: string; ate: string; de360: string }) {
  if (de > ate) return null;
  const L = Array.from({ length: 7 }, () => ({ dias: 0, gasto: 0, contatos: 0, meta: 0, google: 0, cad: 0, loja: 0, vend: 0 }));
  for (let d = new Date(de + "T12:00"); d <= new Date(ate + "T12:00"); d.setDate(d.getDate() + 1)) L[d.getDay()].dias++;
  linhas.filter(l => l.dia >= de && l.dia <= ate).forEach(l => { const d = diaLocal(l.dia); if (!d) return; const x = L[d.getDay()]; x.gasto += l.gasto; x.contatos += l.conversas + l.conversoes; x[l.plataforma] += l.conversas + l.conversoes; });
  mk.forEach((c: any) => { const d = diaLocal(c.criadoEm); if (!d) return; const iso = isoLocal(d); if (iso < de360 || iso > ate) return;
    const x = L[d.getDay()]; x.cad++; if (c.dataLoja) x.loja++; if (vendaContaVolume(c.venda)) x.vend++; });
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  const tot = L.reduce((t, x) => ({ gasto: t.gasto + x.gasto, contatos: t.contatos + x.contatos, cad: t.cad + x.cad, loja: t.loja + x.loja, vend: t.vend + x.vend }), { gasto: 0, contatos: 0, cad: 0, loja: 0, vend: 0 });
  const cpc = (i: number) => div(L[i].gasto, L[i].contatos); const porDia = (i: number) => L[i].dias ? L[i].contatos / L[i].dias : 0;
  const comCont = ordem.filter(i => L[i].contatos > 0);
  const barato = comCont.length ? comCont.reduce((a, b) => ((cpc(b) as number) < (cpc(a) as number) ? b : a)) : -1;
  const caro = comCont.length ? comCont.reduce((a, b) => ((cpc(b) as number) > (cpc(a) as number) ? b : a)) : -1;
  const volume = comCont.length ? comCont.reduce((a, b) => (porDia(b) > porDia(a) ? b : a)) : -1;
  const mxD = Math.max(1, ...ordem.map(porDia)); const cs = comCont.map(i => cpc(i) as number); const mxC = Math.max(1, ...cs);
  return <div className="panel">
    <h3>📅 Melhor dia da semana <small>(de {fmtDate(de)} a {fmtDate(ate)} · contatos gerados pelos anúncios e custo por contato)</small></h3>
    {barato >= 0 && <div className="an-aviso" style={{ marginBottom: 8 }}>🏆 Contato mais barato: <b>{DIAS_SEM[barato]}</b> ({din(cpc(barato))}) · mais contatos por dia: <b>{DIAS_SEM[volume]}</b> ({n0(porDia(volume))}/dia){caro >= 0 && caro !== barato ? <> · contato mais caro: <b>{DIAS_SEM[caro]}</b> ({din(cpc(caro))})</> : null}</div>}
    <div className="an-semgraf">{ordem.map(i => { const x = L[i]; const c = cpc(i);
      return <div key={i} className={"an-semcol" + (i === barato ? " top" : "")} title={DIAS_SEM[i] + ": " + n0(porDia(i)) + " contatos por dia · " + din(c) + " por contato"}>
        <div className="an-sembar"><i className="c" style={{ height: (porDia(i) / mxD * 100) + "%" }} /><i className="k" style={{ height: ((c || 0) / mxC * 100) + "%" }} /></div>
        <b>{DIAS_SEM[i].slice(0, 3)}</b><small>{n0(porDia(i))} contatos/dia</small><small>{c == null ? "—" : din(c) + "/contato"}</small></div>; })}
      <div className="an-semleg"><span><i className="c" /> contatos por dia</span><span><i className="k" /> custo por contato</span></div></div>
    <div className="an-tab-wrap"><table className="an-tab"><thead><tr><th>Dia</th><th>Investido</th><th>Contatos</th><th>Contatos/dia</th><th>Custo/contato</th><th>Ⓜ Meta</th><th>Ⓖ Google</th><th>Cadastros no 360</th><th>Agendaram loja</th><th>Compraram</th></tr></thead>
      <tbody>{ordem.map(i => { const x = L[i]; return <tr key={i} style={i === barato ? { background: "var(--tn-green)" } : undefined}>
        <td><b>{DIAS_SEM[i]}</b> <small className="hint">({x.dias}×)</small></td><td>{din(x.gasto)}</td><td><b>{n0(x.contatos)}</b></td><td>{n0(porDia(i))}</td><td><b>{din(cpc(i))}</b></td>
        <td>{n0(x.meta)}</td><td>{n0(x.google)}</td><td>{n0(x.cad)}</td><td>{n0(x.loja)} <small className="hint">{pctTxt(div(x.loja, x.cad))}</small></td><td>{n0(x.vend)}</td></tr>; })}</tbody>
      <tfoot><tr><td>Total</td><td>{din(tot.gasto)}</td><td>{n0(tot.contatos)}</td><td></td><td>{din(div(tot.gasto, tot.contatos))}</td><td></td><td></td><td>{n0(tot.cad)}</td><td>{n0(tot.loja)}</td><td>{n0(tot.vend)}</td></tr></tfoot></table></div>
    <div className="pb-per">Contatos = conversas (Meta) + conversões (Google), pelo Reportei. Cadastros, agendamentos e compras são do 360 (a partir de {fmtDate(de360)}), contados pelo dia em que o lead chegou — domingo quase não tem cadastro porque as meninas cadastram na segunda.</div>
  </div>;
}

// ---------- 📍 de onde vêm os clientes: cidade e bairro (pela base de clientes: nº da venda ou telefone) ----------
function OrigemClientes({ mk, de, ate, contatos, deAn }: { mk: any[]; de: string; ate: string; contatos: number; deAn: string }) {
  const [quem, setQuem] = useState<"vend" | "cad">("cad"); const [nivel, setNivel] = useState<"cidade" | "bairro">("cidade"); const [cidSel, setCidSel] = useState("CURITIBA"); const [todas, setTodas] = useState(false);
  const lista = useMemo(() => de > ate ? [] : mk.filter((c: any) => { const d = diaLocal(c.criadoEm); if (!d) return false; const iso = isoLocal(d); return iso >= de && iso <= ate && (quem === "cad" || vendaContaVolume(c.venda)); }), [mk, de, ate, quem]);
  const [loc, setLoc] = useState<Record<string, { cidade: string; bairro: string }> | null>(null);
  useEffect(() => { let vivo = true; setLoc(null);
    if (MOCK) { const cs = ["CURITIBA", "CURITIBA", "CURITIBA", "SÃO JOSÉ DOS PINHAIS", "COLOMBO", "ARAUCÁRIA", "PINHAIS", "FAZENDA RIO GRANDE", "CAMPO LARGO", "ALMIRANTE TAMANDARÉ"], bs = ["PORTÃO", "CIC", "BOQUEIRÃO", "SÍTIO CERCADO", "CENTRO", "ÁGUA VERDE"];
      const m: Record<string, any> = {}; lista.forEach((c: any, i: number) => (m[c.id] = { cidade: cs[i % cs.length], bairro: bs[i % bs.length] })); setLoc(m); return; }
    (async () => { const m: Record<string, any> = {};
      for (let i = 0; i < lista.length; i += 800) {
        const { data } = await sb.rpc("anuncios_origem_clientes", { p: lista.slice(i, i + 800).map((c: any) => ({ k: c.id, venda: c.venda?.numero || "", tel: c.telefone || "", end: c.endereco || "" })) });
        (data || []).forEach((r: any) => (m[r.k] = { cidade: r.cidade || "", bairro: r.bairro || "" }));
      }
      if (vivo) setLoc(m); })().catch(() => vivo && setLoc({}));
    return () => { vivo = false; }; }, [lista]);
  if (de > ate) return null;
  const grupos: Record<string, { n: number; fat: number }> = {}; let sem = 0;
  // por bairro: um município de cada vez, para a soma dos bairros bater com o total da cidade
  const porCid: Record<string, number> = {};
  lista.forEach((c: any) => { const l = loc?.[c.id]; if (l && l.cidade) porCid[l.cidade] = (porCid[l.cidade] || 0) + 1; });
  const cidades = Object.entries(porCid).sort((a, b) => b[1] - a[1]);
  const cid = porCid[cidSel] ? cidSel : (cidades[0]?.[0] || "");
  lista.forEach((c: any) => { const l = loc?.[c.id]; if (!l || !l.cidade) { sem++; return; } if (nivel === "bairro" && l.cidade !== cid) return; const k = nivel === "cidade" ? l.cidade : (l.bairro || "(bairro não identificado)");
    const g = (grupos[k] = grupos[k] || { n: 0, fat: 0 }); g.n++; if (vendaContaVolume(c.venda)) g.fat++; });
  const rank = Object.entries(grupos).sort((a, b) => b[1].n - a[1].n || b[1].fat - a[1].fat); const mx = Math.max(1, ...rank.map(([, g]) => g.n));
  const achados = lista.length - sem; const base = nivel === "bairro" ? (porCid[cid] || 0) : achados;
  const lim = todas ? rank.length : nivel === "cidade" ? 15 : 30; const resto = rank.slice(lim).reduce((t, [, g]) => ({ n: t.n + g.n, fat: t.fat + g.fat }), { n: 0, fat: 0 });
  return <div className="panel">
    <h3>📍 De onde vêm os leads <small>(clientes do marketing que chegaram de {fmtDate(de)} a {fmtDate(ate)} · cidade e bairro pelo endereço do cadastro ou pela base de clientes)</small></h3>
    <div className="an-funil-o">
      <div><b>{n0(contatos)}</b><span>contatos dos anúncios<br /><small>{fmtDate(deAn)} a {fmtDate(ate)} · Reportei</small></span></div><i>→</i>
      <div><b>{n0(mk.filter((c: any) => { const d = diaLocal(c.criadoEm); const iso = d ? isoLocal(d) : ""; return iso >= de && iso <= ate; }).length)}</b><span>cadastrados no 360<br /><small>{fmtDate(de)} a {fmtDate(ate)}{deAn < de ? " · o 360 começou em 15/10" : ""}</small></span></div><i>→</i>
      <div><b>{loc === null ? "…" : n0(Object.keys(loc).length)}</b><span>com cidade conhecida<br /><small>pelo endereço do cadastro ou pela base</small></span></div>
    </div>
    <div className="hint" style={{ marginBottom: 8 }}>O ranking soma só os que têm cidade conhecida — por isso não bate com o total de contatos. Nem todo contato vira cadastro; a cidade vem do endereço digitado no cadastro (visitas dos consultores) ou, sem endereço (agendamento na loja), da base de clientes.</div>
    <div className="an-per" style={{ marginBottom: 8 }}>
      {([["cad", "Todos os leads (cadastros)"], ["vend", "Só os que compraram"]] as const).map(([k, l]) => <button key={k} className={"chip" + (quem === k ? " on" : "")} onClick={() => setQuem(k)}>{l}</button>)}
      <span style={{ width: 10 }} />{([["cidade", "Por cidade"], ["bairro", "Por bairro"]] as const).map(([k, l]) => <button key={k} className={"chip" + (nivel === k ? " on" : "")} onClick={() => { setNivel(k); setTodas(false); }}>{l}</button>)}
      {nivel === "bairro" && cidades.length > 0 && <select value={cid} onChange={e => { setCidSel(e.target.value); setTodas(false); }} style={{ marginLeft: 6 }}>{cidades.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}</select>}
    </div>
    {loc === null ? <div className="dn-vazio">Cruzando com a base de clientes…</div> : !rank.length ? <div className="dn-vazio">Nenhum cliente do período encontrado na base de clientes.</div> : <>
      {nivel === "cidade" && <MapaCidades rank={rank} />}
      <div className="an-tab-wrap"><table className="an-tab"><thead><tr><th>#</th><th>{nivel === "cidade" ? "Cidade" : "Bairro de " + cid}</th><th>{quem === "cad" ? "Leads" : "Clientes"}</th><th>% do total</th>{quem === "cad" && <th>Compraram</th>}<th></th></tr></thead>
        <tbody>{rank.slice(0, lim).map(([k, g], i) => <tr key={k}><td>{i + 1}</td><td><b>{k}</b></td><td>{n0(g.n)}</td><td>{pctTxt(g.n / base)}</td>{quem === "cad" && <td>{n0(g.fat)}</td>}
          <td style={{ minWidth: 120 }}><div style={{ height: 8, borderRadius: 4, background: "var(--surface-2)" }}><div style={{ height: 8, borderRadius: 4, width: (g.n / mx * 100) + "%", background: "var(--primary)" }} /></div></td></tr>)}
          {resto.n > 0 && <tr><td></td><td><button className="btn ghost sm" onClick={() => setTodas(true)}>+ {rank.length - lim} {nivel === "cidade" ? "cidades" : "bairros"} (ver todos)</button></td><td>{n0(resto.n)}</td><td>{pctTxt(resto.n / base)}</td>{quem === "cad" && <td>{n0(resto.fat)}</td>}<td></td></tr>}</tbody>
          <tfoot><tr><td></td><td>Total {nivel === "cidade" ? "com cidade conhecida" : "de " + cid}</td><td>{n0(base)}</td><td>100%</td>{quem === "cad" && <td>{n0(rank.reduce((t, [, g]) => t + g.fat, 0))}</td>}<td></td></tr></tfoot></table></div>
      <div className="pb-per">{n0(achados)} de {n0(lista.length)} leads com cidade conhecida (endereço do cadastro, nº da venda ou telefone na base){sem ? " · " + n0(sem) + " sem endereço na base" : ""}.</div>
    </>}
  </div>;
}

// ---------- ⏰ melhor horário: quando os leads chegam (hora do cadastro no 360) e quantos viram venda ----------
function Horario({ mk, de, ate }: { mk: any[]; de: string; ate: string }) {
  if (de > ate) return null;
  const H = Array.from({ length: 24 }, () => ({ cad: 0, vend: 0 }));
  mk.forEach((c: any) => { const d = diaLocal(c.criadoEm); if (!d) return; const iso = isoLocal(d); if (iso < de || iso > ate) return; const x = H[d.getHours()]; x.cad++; if (vendaContaVolume(c.venda)) x.vend++; });
  const horas = H.map((x, h) => ({ h, ...x })).filter(x => x.cad > 0); if (!horas.length) return null;
  const ini = Math.min(...horas.map(x => x.h)), fim = Math.max(...horas.map(x => x.h)); const faixa = H.slice(ini, fim + 1).map((x, k) => ({ h: ini + k, ...x }));
  const mx = Math.max(1, ...faixa.map(x => x.cad)); const tot = faixa.reduce((t, x) => ({ cad: t.cad + x.cad, vend: t.vend + x.vend }), { cad: 0, vend: 0 });
  const relevantes = faixa.filter(x => x.cad >= Math.max(5, tot.cad * 0.02));
  const pico = faixa.reduce((a, b) => (b.cad > a.cad ? b : a));
  const melhorConv = relevantes.length ? relevantes.reduce((a, b) => (b.vend / b.cad > a.vend / a.cad ? b : a)) : null;
  return <div className="panel">
    <h3>⏰ Melhor horário <small>(hora em que o cliente foi cadastrado no 360 — o horário do contato · o Reportei só traz o investimento por dia)</small></h3>
    <div className="an-aviso" style={{ marginBottom: 8 }}>📈 Pico de leads: <b>{pico.h}h–{pico.h + 1}h</b> ({n0(pico.cad)} cadastros){melhorConv ? <> · melhor conversão em venda: <b>{melhorConv.h}h–{melhorConv.h + 1}h</b> ({pctTxt(melhorConv.vend / melhorConv.cad)})</> : null}</div>
    <div className="an-horas">{faixa.map(x => <div key={x.h} className={"an-hora" + (melhorConv && x.h === melhorConv.h ? " top" : "")} title={x.h + "h: " + n0(x.cad) + " cadastros · " + n0(x.vend) + " vendas (" + (pctTxt(div(x.vend, x.cad))) + ")"}>
      <div className="an-hbar"><i className="c" style={{ height: (x.cad / mx * 100) + "%" }} /><i className="v" style={{ height: (x.vend / mx * 100) + "%" }} /></div>
      <span>{x.h}h</span><small>{x.cad ? pctTxt(x.vend / x.cad) : ""}</small></div>)}</div>
    <div className="an-semleg"><span><i className="c" /> cadastros</span><span><i className="v" /> viraram venda</span><span className="hint">embaixo: % que comprou</span></div>
  </div>;
}

// ---------- 🗺️ mapa das cidades (Curitiba e região): bolha do tamanho do nº de clientes ----------
const COORD: Record<string, [number, number]> = {
  "CURITIBA": [-25.43, -49.27], "SAO JOSE DOS PINHAIS": [-25.53, -49.21], "COLOMBO": [-25.29, -49.22], "FAZENDA RIO GRANDE": [-25.66, -49.31], "ARAUCARIA": [-25.59, -49.40],
  "ALMIRANTE TAMANDARE": [-25.32, -49.31], "PINHAIS": [-25.44, -49.19], "CAMPO LARGO": [-25.46, -49.53], "PIRAQUARA": [-25.44, -49.06], "CAMPINA GRANDE DO SUL": [-25.30, -49.05],
  "QUATRO BARRAS": [-25.37, -49.08], "RIO BRANCO DO SUL": [-25.19, -49.31], "CAMPO MAGRO": [-25.37, -49.45], "MANDIRITUBA": [-25.78, -49.33], "CONTENDA": [-25.68, -49.53],
  "BALSA NOVA": [-25.58, -49.63], "ITAPERUCU": [-25.22, -49.35], "BOCAIUVA DO SUL": [-25.21, -49.11], "LAPA": [-25.77, -49.72], "QUITANDINHA": [-25.87, -49.50],
  "TIJUCAS DO SUL": [-25.93, -49.20], "AGUDOS DO SUL": [-25.99, -49.33], "RIO NEGRO": [-26.10, -49.80], "PARANAGUA": [-25.52, -48.51], "MATINHOS": [-25.82, -48.54],
  "GUARATUBA": [-25.88, -48.57], "PONTAL DO PARANA": [-25.67, -48.51], "ANTONINA": [-25.43, -48.71], "MORRETES": [-25.47, -48.83], "PONTA GROSSA": [-25.09, -50.16],
};
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
function MapaCidades({ rank }: { rank: [string, { n: number; fat: number }][] }) {
  const ref = useRef<HTMLDivElement>(null);
  const pts = rank.map(([k, g]) => ({ k, g, c: COORD[semAcento(k)] })).filter(p => p.c);
  const chave = pts.map(p => p.k + p.g.n).join("|");
  useEffect(() => {
    if (!ref.current || !pts.length) return;
    const escuro = document.documentElement.dataset.theme === "dark" || (document.documentElement.dataset.theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const mapa = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true });
    // OpenStreetMap (sem chave); no modo escuro o fundo é escurecido por filtro
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap", className: escuro ? "an-tiles-escuro" : "" }).addTo(mapa);
    const mx = Math.max(...pts.map(p => p.g.n));
    pts.slice().sort((a, b) => b.g.n - a.g.n).forEach((p, i) => {
      const m = L.circleMarker(p.c, { radius: 7 + Math.sqrt(p.g.n / mx) * 30, color: "#284b8f", weight: 2, fillColor: "#3b6fd8", fillOpacity: 0.35 }).addTo(mapa);
      m.bindTooltip(`<b>${p.k}</b><br>${p.g.n} lead(s)${p.g.fat ? " · " + p.g.fat + " compraram" : ""}`, { permanent: i < 3, direction: "top", className: "an-map-tip" });
    });
    mapa.fitBounds(L.latLngBounds(pts.map(p => p.c)).pad(0.15));
    return () => { mapa.remove(); };
  }, [chave]);
  if (!pts.length) return null;
  const fora = rank.length - pts.length;
  return <div className="an-mapa">
    <div ref={ref} style={{ height: 380, borderRadius: 10 }} />
    <div className="pb-per">Bolha = nº de leads de cada cidade (Curitiba e região){fora ? " · " + fora + " cidade(s) fora do mapa, veja na tabela" : ""}.</div>
  </div>;
}
