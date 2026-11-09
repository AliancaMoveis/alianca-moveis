// 📊 Painel controle geral — a visão do dono: só os números do negócio, sem nada por pessoa. Cada cartão leva à tela de detalhe.
// Bruno e Washington (acesso extra "painel_geral"). Valor investido em anúncios fica escondido (olho) até ele tocar.
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../estado";
import { sb } from "../lib/supabase";
import { MOCK } from "../lib/chat";
import { feriasEm, fmtMoeda, parseMoeda, hojeISO, isoLocal, pagamentosVenda, parseData, vendaContaVolume, vendasDoPeriodo } from "../lib/regras";
import { calcGeral } from "../lib/geral";
import { cicloDe, cicloDoMes, ultimoFechado } from "../lib/ciclo";
import { contaRom, ehAssist, type RomTat, type Freteiro } from "../lib/fretesTatico";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const addD = (iso: string, n: number) => { const d = parseData(iso + "T12:00"); d.setDate(d.getDate() + n); return isoLocal(d); };
const fimMes = (ym: string) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0); return ym + "-" + String(d.getDate()).padStart(2, "0"); };
const ymDe = (iso: string) => iso.slice(0, 7);
const ymProx = (ym: string) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const ymAnt = (ym: string) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 2, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const nomeYm = (ym: string) => MESES[+ym.slice(5, 7) - 1];
const n0 = (v: number) => Math.round(v || 0).toLocaleString("pt-BR");
const din = (v: number | null | undefined) => v == null || !isFinite(v) ? "—" : fmtMoeda(v);
const dinK = (v: number) => v >= 1e6 ? "R$ " + (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " mi" : fmtMoeda(v);

type Per = "hoje" | "semana" | "mes" | "mesant" | "per";
function periodo(p: Per, pDe: string, pAte: string) {
  const h = hojeISO(); const ym = ymDe(h);
  if (p === "hoje") return { de: h, ate: h, pde: addD(h, -1), pate: addD(h, -1), nome: "hoje", cmp: "vs ontem" };
  if (p === "semana") { const d = parseData(h + "T12:00"); const ini = addD(h, -((d.getDay() + 6) % 7)); const n = Math.round((+parseData(h + "T12:00") - +parseData(ini + "T12:00")) / 864e5); return { de: ini, ate: h, pde: addD(ini, -7), pate: addD(ini, -7 + n), nome: "esta semana", cmp: "vs semana anterior" }; }
  if (p === "mes") { const a = ymAnt(ym); const dia = Math.min(+h.slice(8, 10), +fimMes(a).slice(8, 10)); return { de: ym + "-01", ate: h, pde: a + "-01", pate: a + "-" + String(dia).padStart(2, "0"), nome: nomeYm(ym) + " até hoje", cmp: "vs mesmo período de " + nomeYm(a) }; }
  if (p === "mesant") { const a = ymAnt(ym), b = ymAnt(a); return { de: a + "-01", ate: fimMes(a), pde: b + "-01", pate: fimMes(b), nome: nomeYm(a), cmp: "vs " + nomeYm(b) }; }
  const de = pDe <= pAte ? pDe : pAte, ate = pDe <= pAte ? pAte : pDe; const n = Math.round((+parseData(ate + "T12:00") - +parseData(de + "T12:00")) / 864e5) + 1;
  return { de, ate, pde: addD(de, -n), pate: addD(de, -1), nome: de.slice(8, 10) + "/" + de.slice(5, 7) + " a " + ate.slice(8, 10) + "/" + ate.slice(5, 7), cmp: "vs " + n + " dias anteriores" };
}

// ---------- dados que não ficam no estado (anúncios, montagem, frete, satisfação) ----------
type Extra = { fech10?: any; fech25?: any; freteEnv?: number | null; anuncios: any[]; mont: any; mont0: any; montQ1: any; montQ2: any; montQ0: any; montQ3: any; freteOf: number | null; fretesAnt: RomTat[]; fretesAtual: RomTat[]; freteiros: Freteiro[]; descAnt: number; aval: any[] };
async function anunciosPer(de: string, ate: string) {
  if (MOCK) return [];
  const out: any[] = [];
  for (let p = 0; p < 20; p++) { const { data, error } = await sb.from("anuncios_dia").select("plataforma,dia,gasto,conversas,conversoes").gte("dia", de).lte("dia", ate).range(p * 1000, p * 1000 + 999); if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) break; }
  return out;
}
const montRes = async (de: string, ate: string) => { if (MOCK) return null; const { data, error } = await sb.rpc("montagem_resumo", { p_de: de, p_ate: ate }); if (error) return null; return data; };
const fretesMes = async (ym: string): Promise<RomTat[]> => { if (MOCK) return []; const { data } = await sb.from("frete_tat_rom").select("id,mes,freteiro_id,itens,modo,km,valor_entregas,valor_km,conferido,romaneio,cod_transp,data").eq("mes", ym); return ((data || []) as any[]).map(x => ({ ...x, km: x.km == null ? null : +x.km, valor_entregas: x.valor_entregas == null ? null : +x.valor_entregas, valor_km: +x.valor_km })); };

export default function PainelGeral({ movel }: { movel?: boolean }) {
  const { R, st, irPara } = useApp() as any;
  const [per, setPer] = useState<Per>("mes");
  const h = hojeISO();
  const [pDe, setPDe] = useState(h.slice(0, 8) + "01"); const [pAte, setPAte] = useState(h);
  const P = periodo(per, pDe, pAte);
  const [ver, setVer] = useState(false); // valor investido: sempre começa escondido
  const [x, setX] = useState<Extra | null>(null);
  // mês de referência = mês do período escolhido (Mês anterior → outubro; Mês atual → novembro)
  const ym = ymDe(P.ate), ymA = ymAnt(ym), ymHoje = ymDe(h), atual = ym === ymHoje;
  useEffect(() => {
    setX(null);
    Promise.all([
      anunciosPer(P.pde, P.ate).catch(() => []), montRes(P.de, P.ate), montRes(P.pde, P.pate),
      // quinzenas da montagem: 1ª = 10 a 24 (paga dia 10 do mês seguinte) · 2ª = 25 a 9 do mês seguinte (paga dia 25)
      montRes(ymA + "-25", ym + "-09"), montRes(ym + "-10", ym + "-24"), montRes(ymA + "-10", ymA + "-24"), montRes(ym + "-25", ymProx(ym) + "-09"),
      fretesMes(ymA), fretesMes(ym),
      MOCK ? Promise.resolve({ data: [] }) : sb.from("frete_freteiros").select("*"),
      MOCK ? Promise.resolve({ data: [] }) : sb.from("frete_descontos").select("valor").eq("mes", ym),
      MOCK ? Promise.resolve({ data: [] }) : sb.from("frete_fechamento").select("total_oficial").eq("mes", ym),
      // valores oficiais: o que foi FECHADO/ENVIADO ao financeiro (montagem do dia 10 e 25; frete do mês)
      MOCK ? Promise.resolve({ data: [] }) : sb.from("montagem_fechamentos").select("referencia,total,a_pagar,n_os,enviado_fin_em").eq("ativo", true).in("referencia", [ymA + "-1", ymA + "-2"]),
      MOCK ? Promise.resolve({ data: [] }) : sb.from("frete_envios_fin").select("total").eq("ativo", true).eq("mes", ym),
      MOCK ? Promise.resolve({ data: [] }) : sb.from("avaliacoes").select("nps,respondido_em").gte("respondido_em", P.de).lte("respondido_em", P.ate + "T23:59:59"),
    ]).then(([an, m, m0, q1, q2, q0, q3, fa, fat, fr, ds, fo, fm, fe, av]: any) => setX({ fech10: (fm.data || []).find((f: any) => f.referencia === ymA + "-1") || null, fech25: (fm.data || []).find((f: any) => f.referencia === ymA + "-2") || null,
      freteEnv: (fe.data || [])[0] && (fe.data[0].total != null) ? Number(fe.data[0].total) : null, anuncios: an, mont: m, mont0: m0, montQ1: q1, montQ2: q2, montQ0: q0, montQ3: q3, freteOf: ((fo.data || [])[0] || {}).total_oficial != null ? Number(fo.data[0].total_oficial) : null, fretesAnt: fa, fretesAtual: fat, freteiros: (fr.data || []) as Freteiro[], descAnt: ((ds.data || []) as any[]).reduce((s, d) => s + Number(d.valor || 0), 0), aval: (av.data || []) as any[] }))
      .catch(() => setX({ anuncios: [], mont: null, mont0: null, montQ1: null, montQ2: null, montQ0: null, montQ3: null, freteOf: null, fretesAnt: [], fretesAtual: [], freteiros: [], descAnt: 0, aval: [] }));
  }, [P.de, P.ate, P.pde, P.pate]);

  const c = useMemo(() => {
    const todos = st.chamados as any[];
    const dentro = (d: any, de = P.de, ate = P.ate) => { const s = String(d || "").slice(0, 10); return !!s && s >= de && s <= ate; };
    // ---- vendas (todas as origens) ----
    const comVenda = todos.filter(c => c.venda);
    const V = vendasDoPeriodo(comVenda, P.de, P.ate), VA = vendasDoPeriodo(comVenda, P.pde, P.pate);
    // total vendido = valor CHEIO de cada venda fechada no período (mesma conta do Dashboard da Gestão: inclui a parte em promissória)
    const cheioDe: Record<string, number> = {}; comVenda.forEach((c: any) => { cheioDe[c.id] = c.venda.valorNum != null ? Number(c.venda.valorNum) || 0 : parseMoeda(c.venda.valor); });
    const val = (c: any) => cheioDe[c.id] || 0;
    const tot = V.reduce((s: number, c: any) => s + val(c), 0), totA = VA.reduce((s: number, c: any) => s + val(c), 0);
    // vendas por dia: período atual × mesmo dia do período anterior
    const porDia = (de: string, ate: string) => { const m: Record<string, number> = {}; comVenda.forEach((c: any) => vendaContaVolume(c.venda) && pagamentosVenda(c.venda).forEach(p => { if (dentro(p.data, de, ate)) m[p.data] = (m[p.data] || 0) + p.valor; })); return m; };
    const dA = porDia(P.de, P.ate), dB = porDia(P.pde, P.pate);
    const nd = Math.round((+parseData(P.ate + "T12:00") - +parseData(P.de + "T12:00")) / 864e5) + 1;
    const serie = Array.from({ length: Math.min(nd, 62) }, (_, i) => ({ d: addD(P.de, i), a: dA[addD(P.de, i)] || 0, b: dB[addD(P.pde, i)] || 0 }));
    // ---- loja ----
    const mk = todos.filter((c: any) => R.domMarketing(c) || R.ehPorta(c));
    const lojaHoje = mk.filter((c: any) => String(c.dataLoja || "").slice(0, 10) === h);
    const fim = (c: any) => !!c.venda || ["orcamento", "sem_resposta", "reprovado", "nao_vai_comprar", "nao_compareceu", "venda_cancelada", "atendido"].includes(R.statusClienteDe(c));
    const emAtd = lojaHoje.filter((c: any) => R.atendendoAgora(c));
    const agora = new Date();
    const esperando = lojaHoje.filter((c: any) => !fim(c) && !(c.tratativa && c.tratativa.emAtendimento) && parseData(c.dataLoja) <= agora && !R.ehPorta(c));
    const chegaram = lojaHoje.filter((c: any) => (c.tratativa && c.tratativa.emAtendimento) || R.compareceu(c));
    const faltaram = lojaHoje.filter((c: any) => R.statusClienteDe(c) === "nao_compareceu");
    const vend = R.vendAgenda(); // na loja hoje = sem férias e sem folga no dia
    const vendFerias = vend.filter((u: any) => !!feriasEm(u, h)), vendFolga = vend.filter((u: any) => !feriasEm(u, h) && R.folgaDia(u.id, h));
    const vendHoje = vend.filter((u: any) => !feriasEm(u, h) && !R.folgaDia(u.id, h));
    const atendendo = new Set(emAtd.map((c: any) => c.atendenteId).filter(Boolean));
    const atdPer = mk.filter((c: any) => dentro(c.dataLoja) && ((c.tratativa && c.tratativa.emAtendimento) || R.compareceu(c)));
    const atdVenda = atdPer.filter((c: any) => c.venda && vendaContaVolume(c.venda));
    const durs = atdPer.map((c: any) => { const t = c.tratativa || {}; const ini = t.emAtendimento, f = t.atendimentoFim || t.finalizadoEm; return ini && f ? (+new Date(f) - +new Date(ini)) / 60000 : null; }).filter((v: any) => v != null && v > 0 && v < 600) as number[];
    const durMed = durs.length ? durs.reduce((s, v) => s + v, 0) / durs.length : null;
    const porta = todos.filter((c: any) => R.ehPorta(c) && dentro(c.dataLoja || c.criadoEm)), portaV = porta.filter((c: any) => c.venda && vendaContaVolume(c.venda));
    // ---- gerais (call center, agendamentos, externos, checklist) ----
    const G = calcGeral(R, st, P.de, P.ate);
    const card = (k: string) => G.cartoes.find((x: any) => x.k === k) as any;
    const linha = (k: string, l: string) => { const cc = card(k); const r = cc && cc.linhas.find((x: any) => String(x[0]).startsWith(l)); return r ? r[1] : 0; };
    const mkd = todos.filter((c: any) => R.domMarketing(c));
    const agend = mkd.filter((c: any) => dentro(c.criadoEm) && R.ehDireto(c));
    const vieram = mkd.filter((c: any) => R.ehDireto(c) && c.dataLoja && dentro(c.dataLoja) && R.compareceu(c));
    const vMkt = V.filter((c: any) => R.domMarketing(c) && R.ehDireto(c));
    const vExt = V.filter((c: any) => R.domMarketing(c) && !R.ehDireto(c) && c.consultorId);
    const extHoje = mkd.filter((c: any) => !R.ehDireto(c) && c.consultorId && String(c.dataVisita || "").slice(0, 10) === h);
    const consHoje = new Set(extHoje.map((c: any) => c.consultorId));
    const medidas = todos.filter((c: any) => c.tipo === "medidas" && c.tratativa && c.tratativa.medida && dentro(c.tratativa.medida.realizadaEm)).length;
    const medHoje = todos.filter((c: any) => c.tipo === "medidas" && String(c.dataMedida || "").slice(0, 10) === h).length;
    const pvAbertas = todos.filter((c: any) => c.posvenda && c.status !== "concluida").length;
    // ---- comissões dos externos no ciclo atual ----
    // consultores externos e medidores: o ciclo FECHADO (29 a 28) é o que se paga agora — mesma conta do Financeiro
    const campo = (st.usuarios as any[]).filter((u: any) => u.somenteAtribuidos && ((u.setores || []).includes("consultor_externo") || (u.setores || []).includes("medidas")));
    const pagCampo = (de: string, ate: string) => campo.reduce((t: any, u: any) => { try { const e = R.extratoConsultor(u.id, de, ate);
      t.com += e.comissao || 0; t.vis += e.pagamentoVisitas || 0; t.med += e.pagamentoMedidas || 0; t.aux += e.auxilio || 0; t.reemb += e.totalReembolsos || 0; t.total += e.total || 0; } catch { /* sem extrato */ } return t; },
      { com: 0, vis: 0, med: 0, aux: 0, reemb: 0, total: 0 });
    // ciclo do mês de referência (outubro = 29/09 a 28/10); no mês atual, até hoje
    const [cde, cate0] = cicloDoMes(ymDe(P.ate)); const cate = h < cate0 ? h : cate0; const campoF = pagCampo(cde, cate0); // ciclo inteiro: o auxílio fixo (dia 15) já entra na previsão
    const campoA = campoF, ade = cde;
    const comissoes = campoF.total;
    return { V, VA, tot, totA, serie, lojaHoje, emAtd, esperando, chegaram, faltaram, vend, vendHoje, vendFerias, vendFolga, atendendo, atdPer, atdVenda, durMed, porta, portaV, G, card, linha, agend, vieram, vMkt, vExt, extHoje, consHoje, medidas, medHoje, pvAbertas, comissoes, cde, cate, campoF, campoA, ade };
  }, [st, P.de, P.ate, P.pde, P.pate, R, h]);

  // ---- anúncios ----
  const an = (x?.anuncios || []);
  const anP = an.filter(a => a.dia >= P.de && a.dia <= P.ate), anA = an.filter(a => a.dia >= P.pde && a.dia <= P.pate);
  const sumA = (l: any[], plat?: string) => l.filter(a => !plat || a.plataforma === plat).reduce((s, a) => ({ g: s.g + (+a.gasto || 0), c: s.c + (+a.conversas || 0) + (+a.conversoes || 0) }), { g: 0, c: 0 });
  const aT = sumA(anP), aA = sumA(anA), aMeta = sumA(anP, "meta"), aGoo = sumA(anP, "google");
  // ---- frete ----
  const fr = x?.freteiros || []; const doFin = (r: RomTat) => !ehAssist(fr.find(f => f.id === r.freteiro_id));
  const freteAnt = (x?.fretesAnt || []).filter(doFin).reduce((s, r) => s + contaRom(r).total, 0);
  // frete do mês de referência: total do relatório oficial (quando lançado) ou o que já foi digitado nos romaneios
  const freteLanc = (x?.fretesAtual || []).filter(doFin).reduce((s, r) => s + contaRom(r).total, 0) - (x?.descAnt || 0);
  const freteOficial = x?.freteEnv != null ? x.freteEnv : x?.freteOf;
  const freteMes = freteOficial != null ? freteOficial : freteLanc;
  const fAtual = (x?.fretesAtual || []).filter(doFin); const freteAtual = fAtual.reduce((s, r) => s + contaRom(r).total, 0); const fAberto = fAtual.filter(r => !r.conferido).length;
  const freteAssist = [...(x?.fretesAtual || [])].filter(r => !doFin(r)).reduce((s, r) => s + contaRom(r).total, 0);
  // ---- montagem ----
  const nn = (v: any) => Number(v) || 0;
  const m = x?.mont, m0 = x?.mont0, q1 = x?.montQ1, q2 = x?.montQ2;
  // q0 = paga dia 10 (10–24 do mês anterior) · q1 = paga dia 25 (25 do mês anterior a 9 deste) · q2/q3 = quinzenas que correm neste mês
  const q0 = x?.montQ0, q3 = x?.montQ3;
  // montagem paga no mês = o FECHAMENTO enviado ao financeiro (a pagar, com descontos); sem fechamento, a previsão pelas O.S.
  const f10 = x?.fech10, f25 = x?.fech25;
  const v10 = f10 ? nn(f10.a_pagar ?? f10.total) : nn(q0?.ef_total), v25 = f25 ? nn(f25.a_pagar ?? f25.total) : nn(q1?.ef_total);
  const n10 = f10 ? nn(f10.n_os) : nn(q0?.ef_qtd), n25 = f25 ? nn(f25.n_os) : nn(q1?.ef_qtd);
  const stF = (f: any, pago: boolean) => f ? (f.enviado_fin_em ? "· enviado ao financeiro" : "· fechado, não enviado") : pago ? "· sem fechamento (pelas O.S.)" : "(previsto)";
  // montagem paga no mês: dia 10 (quinzena 16–fim do mês anterior) e dia 25 (quinzena 01–15 do mês)
  const pago10 = !atual || +h.slice(8, 10) >= 10, pago25 = !atual || +h.slice(8, 10) >= 25;
  const aval = (x?.aval || []).filter((a: any) => a.nps != null); const npsMed = aval.length ? aval.reduce((s: number, a: any) => s + Number(a.nps), 0) / aval.length : null;

  const Var = ({ a, b, inv, money }: { a: number; b: number; inv?: boolean; money?: boolean }) => {
    if (!b) return <span className="pg-d neu">sem base para comparar</span>;
    const p = Math.round((a - b) / b * 100); const bom = inv ? p <= 0 : p >= 0;
    return <span className={"pg-d " + (p === 0 ? "neu" : bom ? "up" : "down")}>{p > 0 ? "▲" : p < 0 ? "▼" : "="} {Math.abs(p)}% {P.cmp}{money ? " (" + dinK(b) + ")" : ""}</span>;
  };
  const Card = ({ t, v, d, ir, big, hl, children }: any) => <div className={"pg-card" + (big ? " big" : "") + (hl ? " hl" : "")} onClick={ir ? () => irPara(ir) : undefined} style={ir ? { cursor: "pointer" } : undefined}>
    {ir && <span className="pg-go">→</span>}<div className="pg-t">{t}</div><div className="pg-v">{v}</div>{d}{children}</div>;
  const Sec = ({ ic, t, s }: any) => <div className="pg-sec"><h2>{ic} {t}</h2>{s && <span>{s}</span>}</div>;
  const mx = Math.max(1, ...c.serie.map(s => Math.max(s.a, s.b)));
  const W = 620, Hh = 150, bw = Math.max(3, Math.min(16, Math.floor(W / Math.max(1, c.serie.length)) - 4));
  const funil = [["Contatos (anúncios)", aT.c], ["Agendados", c.agend.length], ["Vieram à loja", c.vieram.length], ["Compraram", c.vMkt.length]] as [string, number][];

  return (
    <section className={movel ? "" : "view active"}>
      <style>{CSS}</style>
      <div className="pg">
        <div className="pg-top">
          <div><h1>📊 Painel controle geral</h1><div className="pg-sub">Período: <b>{P.nome}</b> · {P.cmp} · clique num número para ver o detalhe</div></div>
          <div className="pg-seg">{([["hoje", "Hoje"], ["semana", "Semana"], ["mes", "Mês atual"], ["mesant", "Mês anterior"], ["per", "📅 Período"]] as [Per, string][]).map(([k, l]) => <b key={k} className={per === k ? "on" : ""} onClick={() => setPer(k)}>{l}</b>)}</div>
        </div>
        {per === "per" && <div style={{ display: "flex", gap: 8, marginBottom: 10 }}><input type="date" value={pDe} onChange={e => setPDe(e.target.value)} /><input type="date" value={pAte} onChange={e => setPAte(e.target.value)} /></div>}

        <Sec ic="💰" t="Vendas" s={P.nome} />
        <div className="pg-grid">
          <Card big hl t="Total vendido no período" v={fmtMoeda(c.tot)} d={<><Var a={c.tot} b={c.totA} money /><span className="pg-d neu">valor cheio das vendas fechadas no período</span></>} ir="financeiro" />
          <Card t="Vendas efetivadas" v={n0(c.V.length)} d={<Var a={c.V.length} b={c.VA.length} />} ir="financeiro" />
          <Card t="Ticket médio" v={din(c.V.length ? c.tot / c.V.length : null)} d={<Var a={c.V.length ? c.tot / c.V.length : 0} b={c.VA.length ? c.totA / c.VA.length : 0} />} />
        </div>
        <div className="pg-row2">
          <div className="pg-panel"><h3>📈 Vendas por dia <small>— barras: {P.nome} · linha: período anterior</small></h3>
            <svg viewBox={`0 0 ${W} ${Hh + 18}`} width="100%" role="img" aria-label="Vendas por dia">
              {c.serie.map((s, i) => { const xx = 6 + i * (W - 12) / c.serie.length; const hh = s.a / mx * (Hh - 10); const dom = parseData(s.d + "T12:00").getDay() === 0;
                return <g key={s.d}><rect x={xx} y={Hh - hh} width={bw} height={Math.max(hh, 0)} rx="2" fill={dom ? "#93b4f7" : "#2563eb"}><title>{s.d.slice(8, 10) + "/" + s.d.slice(5, 7) + ": " + fmtMoeda(s.a) + " (antes " + fmtMoeda(s.b) + ")"}</title></rect>
                  {(i === 0 || i === c.serie.length - 1 || i % 7 === 0) && <text x={xx} y={Hh + 14} fontSize="10" fill="var(--ink-faint)">{s.d.slice(8, 10)}</text>}</g>; })}
              <polyline fill="none" stroke="#f59e0b" strokeWidth="2" points={c.serie.map((s, i) => (6 + i * (W - 12) / c.serie.length + bw / 2) + "," + (Hh - s.b / mx * (Hh - 10))).join(" ")} />
              <line x1="0" y1={Hh} x2={W} y2={Hh} stroke="var(--line)" />
            </svg></div>
          <div className="pg-panel"><h3>💸 Custos de {nomeYm(ym)} <small>{atual ? "previsto até agora" : "valores do mês"}</small></h3>
            <table className="pg-tab"><tbody>
              <tr><td colSpan={2} style={{ fontWeight: 700 }}>Consultores externos e medidores <small>(ciclo {c.cde.slice(8, 10)}/{c.cde.slice(5, 7)}–{c.cate.slice(8, 10)}/{c.cate.slice(5, 7)}{atual ? ", até hoje" : ""})</small></td></tr>
              <tr><td style={{ paddingLeft: 14 }}>Comissão das vendas</td><td>{fmtMoeda(c.campoF.com)}</td></tr>
              <tr><td style={{ paddingLeft: 14 }}>Visitas</td><td>{fmtMoeda(c.campoF.vis)}</td></tr>
              <tr><td style={{ paddingLeft: 14 }}>Medidas</td><td>{fmtMoeda(c.campoF.med)}</td></tr>
              <tr><td style={{ paddingLeft: 14 }}>Auxílio fixo</td><td>{fmtMoeda(c.campoF.aux)}</td></tr>
              <tr><td style={{ paddingLeft: 14 }}>Reembolsos</td><td>{fmtMoeda(c.campoF.reemb)}</td></tr>
              <tr><td style={{ paddingLeft: 14 }}><b>Subtotal consultores e medidores</b></td><td><b>{fmtMoeda(c.campoF.total)}</b></td></tr>
              <tr><td>Frete de {nomeYm(ym)} <small>({x?.freteEnv != null ? "enviado ao financeiro" : x?.freteOf != null ? "relatório oficial" : atual ? "previsto · lançado até agora" : "lançado nos romaneios"})</small></td><td>{fmtMoeda(freteMes)}</td></tr>
              <tr><td colSpan={2} style={{ fontWeight: 700 }}>Montagem paga em {nomeYm(ym)}</td></tr>
              <tr><td style={{ paddingLeft: 14 }}>Dia 10 · quinzena 10/{ymA.slice(5, 7)} a 24/{ymA.slice(5, 7)} <small>{stF(f10, pago10)}</small></td><td>{fmtMoeda(v10)}</td></tr>
              <tr><td style={{ paddingLeft: 14 }}>Dia 25 · quinzena 25/{ymA.slice(5, 7)} a 09/{ym.slice(5, 7)} <small>{stF(f25, pago25)}</small></td><td>{fmtMoeda(v25)}</td></tr>
              <tr><td><b>Total {atual ? "previsto" : "do mês"}</b></td><td><b>{fmtMoeda(c.campoF.total + freteMes + v10 + v25)}</b></td></tr>
            </tbody></table>
            {freteOficial != null && freteLanc > 0 && Math.abs(freteLanc - freteOficial) > 1 && <div className="pg-d neu" style={{ marginTop: 8 }}>Frete digitado nos romaneios até agora: {fmtMoeda(freteLanc)}</div>}</div>
        </div>

        <Sec ic="🏬" t="Atendimento da loja" s="agora e no período" />
        <div className="pg-grid">
          <Card hl t={<><i className="pg-live" />Clientes sendo atendidos agora</>} v={n0(c.emAtd.length)} d={<span className="pg-d neu">{c.esperando.length} esperando · {c.atendendo.size} vendedor(es) atendendo</span>} ir="presenca" />
          <Card t="Vendedores na loja hoje" v={<>{c.vendHoje.length} <small>/ {c.vend.length}</small></>} d={<span className="pg-d neu">{c.atendendo.size} atendendo · {Math.max(0, c.vendHoje.length - c.atendendo.size)} livres · {c.vendFolga.length} de folga{c.vendFerias.length ? " · " + c.vendFerias.length + " de férias" : ""}</span>} ir="agenda_vendedores" />
          <Card t="Agendados hoje na loja" v={n0(c.lojaHoje.filter((x: any) => !R.ehPorta(x)).length)} d={<span className="pg-d neu">{c.chegaram.length} chegaram · {c.faltaram.length} faltaram</span>} ir="agenda" />
          <Card t="Atendimentos no período" v={n0(c.atdPer.length)} d={<span className="pg-d neu">{c.atdVenda.length} viraram venda ({c.atdPer.length ? Math.round(c.atdVenda.length / c.atdPer.length * 100) : 0}%)</span>} />
          {c.durMed != null && <Card t="Tempo médio de atendimento" v={Math.floor(c.durMed / 60) + "h " + String(Math.round(c.durMed % 60)).padStart(2, "0")} />}
          <Card t="Clientes porta (sem agendar)" v={n0(c.porta.length)} d={<span className="pg-d neu">{c.portaV.length} compraram ({c.porta.length ? Math.round(c.portaV.length / c.porta.length * 100) : 0}%)</span>} ir="presenca" />
        </div>

        <Sec ic="📣" t="Marketing e anúncios" />
        <div className="pg-grid">
          <Card big hl t="Contatos gerados" v={n0(aT.c)} d={<Var a={aT.c} b={aA.c} />} ir="anuncios">
            <div className="pg-bar"><span style={{ width: (aT.c ? aMeta.c / aT.c * 100 : 0) + "%", background: "#1877f2" }} /><span style={{ width: (aT.c ? aGoo.c / aT.c * 100 : 0) + "%", background: "#ea4335" }} /></div>
            <div className="pg-split"><i style={{ color: "#1877f2" }}>Meta {n0(aMeta.c)}</i><i style={{ color: "#ea4335" }}>Google {n0(aGoo.c)}</i></div>
          </Card>
          <div className={"pg-card" + (ver ? "" : " oculto")}>
            <div className="pg-t" style={{ display: "flex", alignItems: "center", gap: 8 }}>Valor investido
              <button type="button" className="pg-olho" onClick={() => setVer(v => !v)} title={ver ? "Esconder" : "Mostrar o valor"} aria-label="Mostrar ou esconder o valor investido">
                {ver ? <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  : <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>}
              </button></div>
            <div className="pg-v">{ver ? fmtMoeda(aT.g) : "R$ ••••••"}</div>
            <div className="pg-d neu">{ver ? "Meta " + fmtMoeda(aMeta.g) + " · Google " + fmtMoeda(aGoo.g) : "toque no olho para ver"}</div>
          </div>
          <Card t="Custo por contato" v={ver ? din(aT.c ? aT.g / aT.c : null) : "R$ ••••"} d={ver ? <Var a={aT.c ? aT.g / aT.c : 0} b={aA.c ? aA.g / aA.c : 0} inv /> : <span className="pg-d neu">escondido com o valor investido</span>} />
          <Card t="Custo por venda do marketing" v={ver ? din(c.vMkt.length ? aT.g / c.vMkt.length : null) : "R$ ••••"} d={<span className="pg-d neu">{c.vMkt.length} vendas do marketing</span>} />
        </div>

        <Sec ic="🔻" t="Funil" s="de contato até venda (marketing)" />
        <div className="pg-funil">{funil.map(([l, v], i) => <div key={l} className="pg-fs"><div className="pg-t">{l}</div><div className="pg-v">{n0(v)}</div>
          <div className="pg-p">{i === 0 ? "100%" : (funil[i - 1][1] ? Math.round(v / funil[i - 1][1] * 100) : 0) + "% do passo anterior"}</div><div className="pg-bg" style={{ width: (funil[0][1] ? Math.min(100, v / funil[0][1] * 100) : 0) + "%" }} /></div>)}</div>

        <Sec ic="🧭" t="Consultores externos" />
        <div className="pg-grid">
          <Card big hl t={"Visitas realizadas" + (c.G.visitas.oficial ? " · nº oficial do ciclo" : "")} v={n0(c.G.visitas.total)} ir="ce_painel">
            <div className="pg-split"><i>🧭 Consultores <b>{n0(c.G.visitas.consultores)}</b></i><i>📐 Medidas (Gilberto, César) <b>{n0(c.G.visitas.medidas)}</b></i></div>
          </Card>
          <Card t="Visitas hoje" v={n0(c.extHoje.length)} d={<span className="pg-d neu">{c.consHoje.size} consultores em campo</span>} ir="ce_agenda" />
        </div>

        <Sec ic="📐" t="Operação e produção" s="no período · hoje" />
        <div className="pg-grid">
          <Card t="Checklists realizados" v={n0(c.linha("ck", "Realizados"))} d={<span className="pg-d neu">{c.card("ck")?.n || 0} agendados no período</span>} ir="ck_agenda" />
          <Card t="Medidas realizadas" v={n0(c.G.visitas.oficial ? c.G.visitas.medidas : c.medidas)} d={<span className="pg-d neu">{c.G.visitas.oficial ? "nº oficial do ciclo · " : ""}hoje: {c.medHoje} agendadas</span>} />
          <Card t="Agendamentos de montagem gerados" v={m ? n0(nn(m.ag_total)) : "—"} d={m && m0 ? <Var a={nn(m.ag_total)} b={nn(m0.ag_total)} /> : null} />
          <Card t="Montagens feitas" v={m ? n0(nn(m.ef_qtd)) : "—"} d={m && m0 ? <Var a={nn(m.ef_qtd)} b={nn(m0.ef_qtd)} /> : null} />
          <Card t="Pós-venda / assistências abertas" v={n0(c.pvAbertas)} ir="pv_clientes" />
        </div>

        <Sec ic="🚚🔧" t="Custo de entregar e montar" />
        <div className="pg-grid">
          <Card big hl t={"Montagem paga em " + nomeYm(ym)} v={fmtMoeda(v10 + v25)} d={<span className="pg-d neu">{n0(n10 + n25)} montagens</span>} ir="montagem_pag">
            <div className="pg-split"><i style={{ background: pago10 ? "var(--st-concluida-bg)" : "var(--warn-bg)", color: pago10 ? "var(--st-concluida)" : "var(--warn)" }}>{pago10 ? "✓" : "⏳"} Dia 10 · quinzena 10/{ymA.slice(5, 7)} a 24/{ymA.slice(5, 7)} · <b>{pago10 ? "paga" : "prevista"}</b> {fmtMoeda(nn(q0?.ef_total))}</i>
              <i style={{ background: pago25 ? "var(--st-concluida-bg)" : "var(--warn-bg)", color: pago25 ? "var(--st-concluida)" : "var(--warn)" }}>{pago25 ? "✓" : "⏳"} Dia 25 · quinzena 25/{ymA.slice(5, 7)} a 09/{ym.slice(5, 7)} · <b>{pago25 ? "paga" : "prevista"}</b> {fmtMoeda(nn(q1?.ef_total))}</i></div>
          </Card>
          <Card hl t={"Frete de " + nomeYm(ym) + (x?.freteEnv != null ? " (enviado ao financeiro)" : x?.freteOf != null ? " (relatório oficial)" : atual ? " (previsto)" : "")} v={fmtMoeda(freteMes)} d={<span className="pg-d neu">{freteOficial != null ? "digitado nos romaneios: " + fmtMoeda(freteLanc) : "lançado nos romaneios"}</span>} ir="fretes_fech" />
          <Card t={"Romaneios de " + nomeYm(ym)} v={n0(fAtual.length)} d={<span className="pg-d neu">{fAberto} a conferir{freteAssist ? " · + " + fmtMoeda(freteAssist) + " de frete pago na montagem" : ""}</span>} ir="fretes_fech" />
          {m && <Card t="Custo médio por montagem" v={din(nn(m.ef_qtd) ? nn(m.ef_total) / nn(m.ef_qtd) : null)} d={<span className="pg-d neu">no período escolhido</span>} />}
          {c.tot > 0 && m && <Card t="Montagem + frete sobre o vendido" v={(((nn(m.ef_total) + freteAtual) / c.tot) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%"} d={<span className="pg-d neu">montagem do período + frete do mês</span>} />}
        </div>

        <Sec ic="📞" t="Call center e qualidade" />
        <div className="pg-grid">
          <Card t="Atendimentos registrados" v={n0(c.card("cc")?.n || 0)} d={<span className="pg-d neu">{c.linha("cc", "Finalizados")} finalizados · {c.linha("cc", "No prazo")} no prazo</span>} ir="fila" />
          <Card t="Em aberto agora" v={(c.card("cc")?.pend || "").split(" em aberto")[0]} d={<span className={"pg-d " + (c.card("cc")?.alerta ? "down" : "neu")}>{(c.card("cc")?.pend || "").split(" · ")[1] || ""}</span>} ir="fila" />
          <Card t="Satisfação dos clientes" v={npsMed == null ? "—" : <>{npsMed.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} <small>/ 10</small></>} d={<span className="pg-d neu">{aval.length} respostas no período</span>} ir="qualidade" />
        </div>

        {c.G.alertas.length > 0 && <><Sec ic="⚠" t="Precisa de atenção" />
          <div className="pg-panel">{c.G.alertas.map((a: any) => <div key={a.l} className={"pg-alert " + (a.cls === "crit" ? "r" : "y")}>{a.ic} <b>{a.n}</b> {a.l}</div>)}</div></>}
        {!x && <div className="pg-sub" style={{ marginTop: 10 }}>Carregando anúncios, montagem e frete…</div>}
        <div style={{ height: 24 }} />
      </div>
    </section>
  );
}

const CSS = `
.pg{--pg-line:var(--line);--pg-pri:var(--primary);color:var(--ink);max-width:1280px;margin:0 auto}
.pg-top{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:12px}
.pg h1{font-size:22px;margin:0}.pg-sub{color:var(--ink-soft);font-size:13px}
.pg-seg{display:flex;background:var(--surface);border:1px solid var(--pg-line);border-radius:10px;overflow:hidden;flex-wrap:wrap}
.pg-seg b{padding:8px 12px;font-size:13px;font-weight:500;color:var(--ink-soft);cursor:pointer}.pg-seg b.on{background:var(--pg-pri);color:var(--primary-ink)}
.pg-sec{margin:18px 0 8px;display:flex;align-items:baseline;gap:8px}.pg-sec h2{font-size:15px;margin:0;text-transform:uppercase;letter-spacing:.04em;color:var(--pg-pri)}.pg-sec span{font-size:12px;color:var(--ink-faint)}
.pg-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}
.pg-card{background:var(--surface);border:1px solid var(--pg-line);border-radius:12px;padding:14px;position:relative}
.pg-card:hover{box-shadow:0 4px 14px rgba(20,40,80,.08)}.pg-card.big{grid-column:span 2}.pg-card.hl{border-left:4px solid var(--pg-pri)}
.pg-t{font-size:12.5px;color:var(--ink-soft)}.pg-v{font-size:28px;font-weight:700;margin:4px 0 2px;letter-spacing:-.02em}.pg-v small{font-size:15px;font-weight:600;color:var(--ink-soft)}
.pg-d{font-size:12px;display:block}.pg-d.up{color:var(--st-concluida)}.pg-d.down{color:var(--danger)}.pg-d.neu{color:var(--ink-faint)}
.pg-go{position:absolute;top:12px;right:12px;font-size:12px;color:var(--ink-faint)}
.pg-split{display:flex;gap:8px;margin-top:8px;font-size:12.5px;flex-wrap:wrap}.pg-split i{font-style:normal;padding:3px 9px;border-radius:20px;background:var(--surface-2)}
.pg-bar{height:8px;border-radius:6px;background:var(--surface-2);display:flex;overflow:hidden;margin-top:8px}.pg-bar span{display:block;height:100%}
.pg-live{display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:6px;box-shadow:0 0 0 3px rgba(34,197,94,.2)}
.pg-funil{display:flex;gap:6px;flex-wrap:wrap}.pg-fs{flex:1;min-width:130px;background:var(--surface);border:1px solid var(--pg-line);border-radius:12px;padding:12px;text-align:center;position:relative;overflow:hidden}
.pg-fs .pg-v{font-size:24px}.pg-p{font-size:12px;color:var(--pg-pri);font-weight:600;margin-top:4px}.pg-bg{position:absolute;left:0;bottom:0;height:4px;background:var(--pg-pri)}
.pg-row2{display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-top:10px}.pg-panel{background:var(--surface);border:1px solid var(--pg-line);border-radius:12px;padding:14px}
.pg-panel h3{margin:0 0 8px;font-size:14px}.pg-panel h3 small{font-weight:400;color:var(--ink-faint);font-size:12px}
.pg-tab{width:100%;border-collapse:collapse;font-size:13px}.pg-tab td{padding:6px 4px;border-bottom:1px solid var(--pg-line)}.pg-tab td:last-child{text-align:right;font-weight:600;white-space:nowrap}.pg-tab small{color:var(--ink-faint)}
.pg-olho{border:1px solid var(--pg-line);background:var(--surface-2);color:var(--pg-pri);border-radius:8px;padding:3px 6px;cursor:pointer;display:inline-flex}
.pg-card.oculto .pg-v{color:var(--ink-faint);letter-spacing:.12em}
.pg-alert{padding:8px 10px;border-radius:8px;font-size:13px;margin-bottom:6px}.pg-alert.r{background:var(--danger-bg);color:var(--danger)}.pg-alert.y{background:var(--warn-bg);color:var(--warn)}
@media(max-width:760px){.pg-card.big{grid-column:span 1}.pg-row2{grid-template-columns:1fr}.pg-v{font-size:24px}}
`;
