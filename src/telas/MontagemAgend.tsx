// Montagem — acompanhamento dos agendamentos feitos no Exact (só a Gestão).
// O 360 não agenda montagem: aqui só entra o relatório exportado do Exact (CSV/Excel) para contar
// quantos agendamentos cada agendadora fez (pagamento por agendamento) e quantos cada montador recebeu no período.
// Não guardamos nome nem endereço do cliente: só o código da O.S., agendadora, montador, datas, status e valores.
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { sb } from "../lib/supabase";
import { MOCK } from "../lib/chat";
import { baixarXlsx, baixarXlsxAbas, type AbaXlsx } from "../lib/planilha";
import { Modal } from "../comp/Modal";
import { fmtMoeda } from "../lib/regras";
import { col, lerArquivo } from "./Medidas";
import { Kpi } from "./Dashboard";
import { ciclo } from "./MontagemMeus";

type Ag = { chave: string; os: string; lider: string; montador: string; status: string; indisponivel: boolean; data_inclusao: string; data_montagem: string; data_finalizacao: string | null; tipos: string; total: number; bruto?: any[] | null };

export const podeMontagemAgend = (R: any) => R.mySetores().includes("gestao") || R.mySetores().includes("financeiro");

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
    if (ex) { ex.total = Math.round((ex.total + tot) * 100) / 100; if (tipo && !ex.tipos.includes(tipo)) ex.tipos = ex.tipos ? ex.tipos + " + " + tipo : tipo; (ex.bruto = ex.bruto || []).push(l); continue; }
    m.set(chave, { chave, os, lider, montador: mont, status: col(l, "status", "Status").trim(), indisponivel: /^sim/i.test(col(l, "Cliente indisponível para montagem")),
      data_inclusao: iso(col(l, "Data Inclusao", "Data Inclusão")), data_montagem: dm, data_finalizacao: iso(col(l, "Data Finalizacao", "Data Finalização")) || null, tipos: tipo, total: tot, bruto: [l] });
  }
  return Array.from(m.values());
}

let mockDados: Ag[] = [];
let mockCfg: any = { agendadoras_pagas: ["francilene", "bruna.gisele", "Natallia", "Jaqueline de Jesus Jorge"], valor_agendamento: 2 };
async function lerCfg(): Promise<{ pagas: string[]; valor: number }> {
  if (MOCK) return { pagas: mockCfg.agendadoras_pagas, valor: mockCfg.valor_agendamento };
  const { data } = await sb.from("montagem_cfg").select("chave,valor");
  const m = Object.fromEntries(((data || []) as any[]).map(x => [x.chave, x.valor]));
  return { pagas: Array.isArray(m.agendadoras_pagas) ? m.agendadoras_pagas : [], valor: Number(m.valor_agendamento ?? 2) || 0 };
}
async function salvarCfg(chave: string, valor: any) {
  if (MOCK) { mockCfg[chave] = valor; return; }
  const { error } = await sb.rpc("montagem_cfg_salvar", { p_chave: chave, p_valor: valor }); if (error) throw new Error(error.message);
}
let mockFech: any[] = [];
async function fecharAg(p: any, ags: Ag[], pagas: string[], valor: number): Promise<number> {
  if (MOCK) { if (mockFech.some(f => f.referencia === p.referencia && f.ativo) && !p.substituir) throw new Error("Já existe um fechamento de " + p.referencia);
    mockFech.forEach(f => { if (f.referencia === p.referencia && f.ativo) f.ativo = false; });
    const it = ags.filter(a => ehPaga(a.lider, pagas) && !fora(a) && a.data_inclusao >= p.de && a.data_inclusao <= p.ate);
    const res = Object.values(it.reduce((m: any, a) => { const g = (m[a.lider] = m[a.lider] || { lider: a.lider, qtd: 0, montagem: 0, assistencia: 0, valor: 0 }); g.qtd++; if (ehAssist(a)) g.assistencia++; else g.montagem++; g.valor += valor; return m; }, {}));
    mockFech.push({ id: mockFech.length + 1, ...p, valor_unit: valor, qtd: it.length, total: it.length * valor, resumo: res, itens: it.map(a => ({ lider: a.lider, os: a.os, montador: a.montador, status: a.status, inc: a.data_inclusao, mont: a.data_montagem, fin: a.data_finalizacao, tipos: a.tipos, total: a.total, bruto: a.bruto })), criado_em: new Date().toISOString(), criado_por: "você", ativo: true }); return mockFech.length; }
  const { data, error } = await sb.rpc("montagem_ag_fechar", { p }); if (error) throw new Error(error.message); return data as number;
}
async function listaFechAg(): Promise<any[]> {
  if (MOCK) return mockFech.slice().reverse();
  const { data, error } = await sb.from("montagem_ag_fech").select("id,referencia,de,ate,valor_unit,qtd,total,resumo,obs,criado_em,criado_por,ativo,substituido_em").order("referencia", { ascending: false }).order("criado_em", { ascending: false });
  if (error) throw new Error(error.message); return data || [];
}
async function itensFechAg(id: number): Promise<any[]> {
  if (MOCK) return (mockFech.find(f => f.id === id) || {}).itens || [];
  const { data, error } = await sb.from("montagem_ag_fech").select("itens").eq("id", id).maybeSingle(); if (error) throw new Error(error.message); return (data as any)?.itens || [];
}
const ehPaga = (lider: string, pagas: string[]) => pagas.some(x => x.trim().toLowerCase() === (lider || "").trim().toLowerCase());
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (ref: string) => MESES[Number(ref.slice(5, 7)) - 1] + "/" + ref.slice(0, 4);
/** arquivo para o financeiro: aba "Resumo" (valores a pagar) + uma aba por agendadora com todas as informações das O.S. */
function arquivoAgendadoras(nome: string, titulo: string, resumo: { lider: string; qtd: number; montagem: number; assistencia: number; valor: number }[], valorUnit: number, itens: any[]) {
  const tot = resumo.reduce((s, r) => s + r.qtd, 0);
  const abas: AbaXlsx[] = [{ nome: "Resumo", cab: ["Agendadora", "Agendamentos", "Montagem", "Assistência", "Valor por agendamento", "A PAGAR", "Período"],
    linhas: [...resumo.map(r => [r.lider, r.qtd, r.montagem, r.assistencia, valorUnit, r2(r.qtd * valorUnit), titulo]), ["TOTAL", tot, resumo.reduce((s, r) => s + r.montagem, 0), resumo.reduce((s, r) => s + r.assistencia, 0), valorUnit, r2(tot * valorUnit), titulo]] }];
  resumo.forEach(r => {
    const meus = itens.filter(i => i.lider === r.lider);
    const brutos = meus.flatMap(i => (i.bruto && i.bruto.length ? i.bruto : [null]).map((b: any) => ({ i, b })));
    const chaves: string[] = Array.from(new Set(brutos.flatMap(x => x.b ? Object.keys(x.b) : [])));
    const cab = chaves.length ? chaves : ["Lider", "Montador", "os", "status", "Data Inclusao", "Data Montagem", "Data Finalizacao", "Tipo", "Total OS"];
    const linhas = brutos.map(({ i, b }) => b ? cab.map(k => b[k] ?? "") : cab.map(k => ({ "Lider": i.lider, "Montador": i.montador, "os": i.os, "status": i.status, "Data Inclusao": br(i.inc || i.data_inclusao), "Data Montagem": br(i.mont || i.data_montagem), "Data Finalizacao": br(i.fin || i.data_finalizacao), "Tipo": i.tipos, "Total OS": i.total } as any)[k] ?? ""));
    abas.push({ nome: r.lider + " (" + r.qtd + ")", cab, linhas });
  });
  return baixarXlsxAbas(nome, abas);
}
const r2 = (n: number) => Math.round(n * 100) / 100;
async function carregar(): Promise<Ag[]> {
  if (MOCK) return mockDados;
  const out: Ag[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from("montagem_agend").select("chave,os,lider,montador,status,indisponivel,data_inclusao,data_montagem,data_finalizacao,tipos,total,bruto").order("chave").range(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as Ag[]).map(a => ({ ...a, total: Number(a.total) || 0 })));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function enviar(ags: Ag[]): Promise<{ novos: number; atualizados: number; total: number }> {
  if (MOCK) { const k = new Set(mockDados.map(a => a.chave)); const novos = ags.filter(a => !k.has(a.chave)); mockDados = [...mockDados.filter(a => !ags.some(b => b.chave === a.chave)), ...ags]; return { novos: novos.length, atualizados: ags.length - novos.length, total: mockDados.length }; }
  let r = { novos: 0, atualizados: 0, total: 0 };
  for (let i = 0; i < ags.length; i += 300) {
    const p = ags.slice(i, i + 300).map(a => ({ chave: a.chave, os: a.os, lider: a.lider, montador: a.montador, status: a.status, indisp: a.indisponivel, inc: a.data_inclusao, mont: a.data_montagem, fin: a.data_finalizacao || "", tipos: a.tipos, total: a.total, bruto: a.bruto || null }));
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
  const [valor, setValor] = useState("2");
  const [pagas, setPagas] = useState<string[]>([]);
  const [tela, setTela] = useState<"periodo" | "hist">("periodo");
  const { setModal } = useApp() as any;
  useEffect(() => { lerCfg().then(c => { setPagas(c.pagas); setValor(String(c.valor).replace(".", ",")); }).catch(() => null); }, []);
  const [tipoM, setTipoM] = useState<"todos" | "mont" | "assist">("todos");
  const [aberto, setAberto] = useState("");
  const [enviando, setEnviando] = useState(""); const inp = useRef<HTMLInputElement>(null);
  const recarregar = () => carregar().then(setDados).catch(e => setErro(e.message));
  useEffect(() => { recarregar(); }, []);
  if (!podeMontagemAgend(R)) return <section className="view active"><div className="empty">Só a Gestão e o Financeiro veem esta tela.</div></section>;
  const soLeitura = !R.mySetores().includes("gestao"); // Financeiro: vê tudo e baixa relatórios, mas não importa, não muda valores e não fecha o mês
  const abasTela = <div className="subnav" style={{ margin: "0 0 14px" }}><button className={tela === "periodo" ? "on" : ""} onClick={() => setTela("periodo")}>📋 Agendamentos</button><button className={tela === "hist" ? "on" : ""} onClick={() => setTela("hist")}>📚 Histórico de pagamentos das agendadoras</button></div>;
  if (tela === "hist") return <section className="view active"><div className="view-head"><div><h2>🔧 Montagem · Histórico das agendadoras</h2><p>Cada fechamento guarda os valores pagos e todas as O.S. de cada agendadora daquele mês. Se o mês for fechado de novo, o anterior fica como “substituído” — nada se perde.</p></div></div>{abasTela}<HistoricoAg /></section>;

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
  const gAg = agrupar(lAg.filter(a => ehPaga(a.lider, pagas)), a => a.lider, dAg), gMo = agrupar(lMo, a => a.montador, dMo);
  const naoPagas = Array.from(new Set(lAg.filter(a => !ehPaga(a.lider, pagas)).map(a => a.lider)));
  const todasLideres = Array.from(new Set([...(dados || []).map(a => a.lider), ...pagas])).sort((a, b) => a.localeCompare(b));
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
      <div className="view-head"><div><h2>🔧 Montagem · Agendamentos</h2><p>Acompanhamento dos agendamentos feitos no Exact — Gestão e Financeiro. Envie o relatório exportado e filtre o período: quantos cada agendadora fez (para o pagamento) e quantos cada montador recebeu.</p></div></div>
      {abasTela}
      <div className="card ma-topo">
        <div className="ma-envio" style={soLeitura ? { display: "none" } : undefined}>
          <input ref={inp} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); }} />
          <button className="btn primary" disabled={!!enviando} onClick={() => inp.current?.click()}>{enviando || "📤 Enviar relatório do Exact (CSV ou Excel)"}</button>
          <span className="hint">{dados ? dados.length + " agendamentos guardados" + (ultimaData ? " · último agendado em " + br(ultimaData) : "") + ". Pode enviar o mesmo período de novo: não duplica, só atualiza o status." : erro || "Carregando…"}</span>
        </div>
        <div className="ma-filtros">
          <div className="field"><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
          <div className="field"><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
          <div className="chips" style={{ margin: 0 }}>
            <button className="chip" onClick={() => { const c = ciclo(h); periodo(c.de, c.ate); }}>Ciclo 26 a 25</button>
            <button className="chip" onClick={() => { const c = ciclo(h, -1); periodo(c.de, c.ate); }}>Ciclo anterior</button>
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
          {aba === "agend" && soLeitura && <span className="pill">R$ {valor} por agendamento</span>}
          {aba === "agend" && !soLeitura && <label className="ma-valor">R$ por agendamento <input value={valor} onChange={e => setValor(e.target.value)} onBlur={() => salvarCfg("valor_agendamento", num(valor)).then(() => toast("Valor por agendamento salvo"), (e: any) => toast(e.message))} inputMode="decimal" /></label>}
          {aba === "agend" ? <>
            {!soLeitura && <button className="btn sm" onClick={() => setModal(<ModalPagas todas={todasLideres} pagas={pagas} salvar={async (l: string[]) => { await salvarCfg("agendadoras_pagas", l); setPagas(l); }} />)}>⚙ Quem recebe</button>}
            <button className="btn primary sm" disabled={!g.length} onClick={() => arquivoAgendadoras("pagamento_agendadoras_" + de + "_a_" + ate + ".xlsx", br(de) + " a " + br(ate), gAg.map(x => ({ lider: x.nome, qtd: x.n, montagem: x.mont, assistencia: x.assist, valor: x.n * vU })), vU, lAg.filter(a => ehPaga(a.lider, pagas) && !fora(a)))}>⬇ Relatório para o financeiro</button>
            {!soLeitura && <button className="btn sm" style={{ borderColor: "var(--st-concluida)", color: "var(--st-concluida)", fontWeight: 700 }} disabled={!g.length} onClick={() => setModal(<ModalFecharAg de={de} ate={ate} qtd={tot} valor={vU} fechar={(p: any) => fecharAg(p, dados || [], pagas, vU)} pronto={() => setTela("hist")} />)}>🔒 Fechar pagamento do mês</button>}
          </> : <button className="btn sm" onClick={exportar} disabled={!g.length}>⬇ Excel</button>}
        </div>
        {!g.length ? <div className="empty" style={{ padding: 24 }}>{dados && dados.length ? "Nenhum agendamento neste período." : "Envie o relatório do Exact para começar."}</div> :
          <table className="ma-tab"><thead><tr><th>{aba === "agend" ? "Agendadora" : "Montador"}</th><th className="n">Agend.</th><th></th><th className="n">Montagem</th><th className="n">Assist.</th><th className="n">{aba === "agend" ? "A pagar" : "Total O.S."}</th></tr></thead>
            <tbody>{g.map(x => <FragLinha key={x.nome} x={x} mx={mx} aba={aba} vU={vU} aberto={aberto === x.nome} abrir={() => setAberto(aberto === x.nome ? "" : x.nome)} />)}</tbody>
            <tfoot><tr><td>Total</td><td className="n">{tot}</td><td></td><td className="n">{g.reduce((s, x) => s + x.mont, 0)}</td><td className="n">{g.reduce((s, x) => s + x.assist, 0)}</td><td className="n">{aba === "agend" ? fmtMoeda(tot * vU) : fmtMoeda(g.reduce((s, x) => s + x.total, 0))}</td></tr></tfoot>
          </table>}
      </div>
      {aba === "agend" && naoPagas.length > 0 && <p className="hint" style={{ marginTop: 10 }}>Não entram no pagamento (não estão em “Quem recebe”): {naoPagas.join(", ")}.</p>}
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

function ModalPagas({ todas, pagas, salvar }: { todas: string[]; pagas: string[]; salvar: (l: string[]) => Promise<void> }) {
  const { setModal, toast, st } = useApp() as any;
  const [sel, setSel] = useState<string[]>(pagas);
  const tem = (n: string) => ehPaga(n, sel);
  // vínculo usuária do 360 ↔ nome no Exact (para os "Agendamentos pessoais" de cada uma)
  const users = ((st.usuarios || []) as any[]).filter(u => u.ativo !== false && (u.setores || []).includes("montagem"));
  const [vin, setVin] = useState<Record<string, string>>({}); const [vin0, setVin0] = useState<Record<string, string>>({});
  useEffect(() => { if (MOCK || !users.length) return; sb.from("usuarios").select("id,nome_exact").in("id", users.map(u => u.id)).then(({ data }) => {
    const m = Object.fromEntries(((data || []) as any[]).map(x => [x.id, x.nome_exact || ""])); setVin(m); setVin0(m); }); }, []);
  const ir = async () => {
    try {
      await salvar(sel);
      for (const u of users) if ((vin[u.id] || "") !== (vin0[u.id] || "") && !MOCK) { const { error } = await sb.rpc("usuario_nome_exact", { p_usuario: u.id, p_nome: vin[u.id] || null }); if (error) throw new Error(error.message); }
      toast("Salvo"); setModal(null);
    } catch (e: any) { toast(e.message); }
  };
  return <Modal titulo="⚙ Quem recebe por agendamento" onFechar={() => setModal(null)}>
    <p style={{ marginTop: 0 }}>Só as marcadas aparecem em Agendadoras, no relatório e no fechamento. As demais não contam.</p>
    <div style={{ display: "grid", gap: 6 }}>{todas.map(n => <label key={n} style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={tem(n)} onChange={() => setSel(tem(n) ? sel.filter(x => x.toLowerCase() !== n.toLowerCase()) : [...sel, n])} /> {n}</label>)}</div>
    {users.length > 0 && <><h4 style={{ margin: "16px 0 6px" }}>Usuárias da montagem no 360 ↔ nome no Exact</h4>
      <p className="hint" style={{ margin: "0 0 8px" }}>Com o vínculo, cada uma vê os próprios números em Montagem → 📅 Agendamentos pessoais (ciclo 26 a 25).</p>
      <div style={{ display: "grid", gap: 6 }}>{users.map(u => <div key={u.id} style={{ display: "flex", gap: 8, alignItems: "center" }}><b style={{ minWidth: 110 }}>{u.nome}</b>
        <select value={vin[u.id] || ""} onChange={e => setVin({ ...vin, [u.id]: e.target.value })} style={{ flex: 1 }}><option value="">— sem vínculo —</option>{todas.map(n => <option key={n} value={n}>{n}</option>)}</select></div>)}</div></>}
    <div style={{ display: "flex", gap: 8, marginTop: 14 }}><button className="btn primary" onClick={ir}>Salvar</button><button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button></div>
  </Modal>;
}

function ModalFecharAg({ de, ate, qtd, valor, fechar, pronto }: any) {
  const { setModal, toast } = useApp() as any;
  const [ref, setRef] = useState(ate.slice(0, 7)); const [obs, setObs] = useState(""); const [ind, setInd] = useState(false);
  const ir = async (substituir: boolean): Promise<void> => {
    setInd(true);
    try { await fechar({ referencia: ref, de, ate, obs, substituir }); toast("Pagamento das agendadoras de " + nomeMes(ref) + " guardado no histórico"); setModal(null); pronto(); }
    catch (e: any) { if (/já existe/i.test(e.message) && !substituir) { if (confirm("Já existe um fechamento de " + nomeMes(ref) + ".\n\nSubstituir? O anterior NÃO é apagado: fica no histórico como “substituído”.")) { setInd(false); return ir(true); } } else toast(e.message); }
    finally { setInd(false); }
  };
  return <Modal titulo="🔒 Fechar pagamento das agendadoras" onFechar={() => setModal(null)}>
    <p style={{ marginTop: 0 }}>Guarda os valores e todas as O.S. de cada agendadora no histórico (backup), para consultar e baixar de novo quando precisar.</p>
    <div className="field"><label>Mês de referência</label><input type="month" value={ref} onChange={e => setRef(e.target.value)} /></div>
    <div className="resp-box" style={{ margin: "10px 0" }}>Agendados de {br(de)} a {br(ate)} · <b>{qtd} agendamentos · {fmtMoeda(qtd * valor)}</b> ({fmtMoeda(valor)} cada)</div>
    <div className="field"><label>Observação (opcional)</label><input value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: enviado ao financeiro em 05/11" /></div>
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button className="btn primary" disabled={ind || !ref} onClick={() => ir(false)}>{ind ? "Guardando…" : "Fechar e guardar"}</button><button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button></div>
  </Modal>;
}

function HistoricoAg() {
  const { toast } = useApp() as any;
  const [l, setL] = useState<any[] | null>(null); const [erro, setErro] = useState(""); const [ab, setAb] = useState<number | null>(null);
  useEffect(() => { listaFechAg().then(setL).catch(e => setErro(e.message)); }, []);
  if (erro) return <div className="empty">{erro}</div>;
  if (!l) return <div className="empty">Carregando…</div>;
  if (!l.length) return <div className="empty" style={{ padding: 24 }}>Nenhum pagamento fechado ainda. Em “Agendadoras”, filtre o mês e clique em “🔒 Fechar pagamento do mês”.</div>;
  const f = l.find(x => x.id === ab);
  const per = (x: any) => br(x.de) + " a " + br(x.ate);
  const baixar = async (x: any) => { try { const it = await itensFechAg(x.id); await arquivoAgendadoras("pagamento_agendadoras_" + x.referencia + (x.ativo ? "" : "_substituido_" + x.id) + ".xlsx", per(x), x.resumo || [], Number(x.valor_unit), it); } catch (e: any) { toast(e.message); } };
  return <>
    <div className="card" style={{ padding: 0 }}>
      <table className="ma-tab"><thead><tr><th>Mês</th><th>Agendados de</th><th className="n">Agendamentos</th><th className="n">R$ cada</th><th className="n">Total pago</th><th>Fechado por</th><th></th></tr></thead>
        <tbody>{l.map(x => <tr key={x.id} className={"ma-lin" + (ab === x.id ? " on" : "")} style={x.ativo ? undefined : { opacity: .55 }} onClick={() => setAb(ab === x.id ? null : x.id)}>
          <td><b>{nomeMes(x.referencia)}</b>{!x.ativo && <span className="pill" style={{ marginLeft: 6 }}>substituído</span>}</td><td>{per(x)}</td><td className="n">{x.qtd}</td><td className="n">{fmtMoeda(Number(x.valor_unit))}</td><td className="n"><b>{fmtMoeda(Number(x.total))}</b></td>
          <td><small>{x.criado_por || ""} · {new Date(x.criado_em).toLocaleString("pt-BR").slice(0, 16)}{x.obs ? " · " + x.obs : ""}</small></td><td><button className="btn sm" onClick={e => { e.stopPropagation(); baixar(x); }}>⬇ Arquivo</button></td></tr>)}</tbody></table>
    </div>
    {f && <div className="card" style={{ padding: 0, marginTop: 14 }}>
      <div className="ma-cab"><b>{nomeMes(f.referencia)}{f.ativo ? "" : " (substituído)"} · {per(f)}</b><button className="btn primary sm" onClick={() => baixar(f)}>⬇ Relatório (resumo + O.S. de cada uma)</button></div>
      <table className="ma-tab"><thead><tr><th>Agendadora</th><th className="n">Agendamentos</th><th className="n">Montagem</th><th className="n">Assistência</th><th className="n">A pagar</th></tr></thead>
        <tbody>{(f.resumo || []).map((r: any) => <tr key={r.lider}><td><b>{r.lider}</b></td><td className="n">{r.qtd}</td><td className="n">{r.montagem}</td><td className="n">{r.assistencia}</td><td className="n"><b>{fmtMoeda(Number(r.valor))}</b></td></tr>)}</tbody>
        <tfoot><tr><td>Total</td><td className="n">{f.qtd}</td><td></td><td></td><td className="n">{fmtMoeda(Number(f.total))}</td></tr></tfoot></table>
    </div>}
  </>;
}
