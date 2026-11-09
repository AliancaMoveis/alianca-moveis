// Montagem — controle das montagens efetivadas e pagamento dos montadores (só a Gestão).
// Entra o relatório do Exact (Montador, os, status, Data Montagem, Data Finalizacao, Total Produtos, Total Adicionais, Total OS).
// "AGUARDANDO APROVAÇÃO DE PAGAMENTO" conta, mas fica como aguardando; "PAGAMENTO EFETUADO" = aprovado para pagamento.
// O relatório para o financeiro leva o total de cada montador com a conta cadastrada (Cadastros → Montadores → Contas).
// Não guardamos nome nem endereço do cliente: só o código da O.S.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { sb } from "../lib/supabase";
import { MOCK } from "../lib/chat";
import { baixarXlsx } from "../lib/planilha";
import { fmtMoeda, linkWhats } from "../lib/regras";
import { pdfFinanceiro } from "../lib/pdfFinanceiro";
import { col, lerArquivo } from "./Medidas";
import { Kpi } from "./Dashboard";
import { podeMontagemAgend } from "./MontagemAgend";
import { Modal } from "../comp/Modal";
import { pagaDia10 } from "../lib/montagemDia10";

type Ef = { chave: string; os: string; montador: string; status: string; data_montagem: string; data_finalizacao: string | null; produtos: number; adicionais: number; total: number; origem?: string; descricao?: string | null; criado_por?: string | null; tipo?: string | null; aprovado_em?: string | null; aprovado_por?: string | null };
// ordem avulsa: serviço dentro da loja, frete ou outro pagamento manual — entra no total do montador
export const TIPOS_AV: Record<string, string> = { servico_loja: "🏬 Serviço na loja", frete: "🚚 Frete", frete_assistencia: "🛠 Frete de assistência", outro: "📝 Outro" };
const rotAv = (e: Ef) => (TIPOS_AV[e.tipo || "outro"] || "Avulsa").replace(/^\S+ /, "") + (e.descricao ? ": " + e.descricao : "");

const iso = (s: string) => { const m = String(s || "").match(/(\d{2})[-\/](\d{2})[-\/](\d{4})/); return m ? m[3] + "-" + m[2] + "-" + m[1] : ""; };
const num = (s: string) => { const t = String(s || "0").trim(); const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "")); return isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const somaDias = (s: string, n: number) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const br = (s: string | null) => s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "";
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
// aprovado: "PAGAMENTO EFETUADO" no Exact ou aprovado aqui no 360 (a aprovação do 360 não se perde ao subir o relatório de novo)
const aprovado = (e: Ef) => /pagamento efetuado/i.test(e.status) || (!!e.aprovado_em && /aguardando aprova/i.test(e.status));
const aguardando = (e: Ef) => /aguardando aprova/i.test(e.status) && !e.aprovado_em;
const conta = (e: Ef) => aprovado(e) || aguardando(e);

function converter(linhas: any[]): Ef[] {
  const m = new Map<string, Ef>();
  for (const l of linhas) {
    const osFull = col(l, "os", "O.S."); const mont = col(l, "Montador").trim();
    if (!osFull || !mont) continue;
    const os = osFull.split("|")[0].trim(); const dm = iso(col(l, "Data Montagem"));
    const chave = [os, mont, dm].join("¦");
    const e: Ef = { chave, os, montador: mont, status: col(l, "status", "Status").trim(), data_montagem: dm, data_finalizacao: iso(col(l, "Data Finalizacao", "Data Finalização")) || null,
      produtos: num(col(l, "Total Produtos")), adicionais: num(col(l, "Total Adicionais")), total: num(col(l, "Total OS")) };
    const ex = m.get(chave);
    if (ex) { ex.produtos = r2(ex.produtos + e.produtos); ex.adicionais = r2(ex.adicionais + e.adicionais); ex.total = r2(ex.total + e.total); } else m.set(chave, e);
  }
  return Array.from(m.values());
}

let mockEf: Ef[] = []; const mockVinc: Record<string, string | null> = {};
// O.S. já pagas: as que estão como "aprovado" num fechamento ativo (chave → referência do fechamento)
const chOrd = (os: string, mont: string, total: number) => os + "|" + String(mont || "").slice(0, 10) + "|" + (Math.round((Number(total) || 0) * 100) / 100).toFixed(2);
async function carregarPagas(): Promise<{ por: Map<string, string>; desde: string }> {
  if (MOCK) return { por: new Map(), desde: "" };
  const { data: fs, error } = await sb.from("montagem_fechamentos").select("id,referencia,de").eq("ativo", true); if (error) throw new Error(error.message);
  const ref: Record<number, string> = {}; (fs || []).forEach((f: any) => (ref[f.id] = f.referencia));
  const por = new Map<string, string>(); const ids = (fs || []).map((f: any) => f.id);
  for (let i = 0; i < ids.length; i += 4) {
    const { data, error: e2 } = await sb.from("montagem_fech_itens").select("fechamento_id,ordens").in("fechamento_id", ids.slice(i, i + 4)); if (e2) throw new Error(e2.message);
    (data || []).forEach((it: any) => (it.ordens || []).forEach((o: any) => { if (!/efetuado/i.test(o.status || "")) return; const r = ref[it.fechamento_id];
      por.set(o.chave || chOrd(o.os, o.mont, o.total), r); if (o.chave) por.set(chOrd(o.os, o.mont, o.total), r); }));
  }
  return { por, desde: (fs || []).map((f: any) => String(f.de)).sort()[0] || "" };
}
// descontos do montador no pagamento (compras na loja etc.) — por referência da quinzena
type Desc = { id: number; referencia: string; montador_id: string; descricao: string; parcela: string; valor: number };
let mockDesc: Desc[] = [];
async function listaDesc(ref: string): Promise<Desc[]> {
  if (MOCK) return mockDesc.filter(d => d.referencia === ref);
  const { data, error } = await sb.from("montagem_descontos").select("*").eq("referencia", ref).order("id"); if (error) throw new Error(error.message);
  return (data || []).map((d: any) => ({ ...d, valor: Number(d.valor) }));
}
async function criarDesc(d: Omit<Desc, "id">, quem: string) {
  if (MOCK) { mockDesc.push({ ...d, id: Date.now() }); return; }
  const { error } = await sb.from("montagem_descontos").insert({ ...d, criado_por: quem }); if (error) throw new Error(error.message);
}
async function apagarDesc(id: number) {
  if (MOCK) { mockDesc = mockDesc.filter(d => d.id !== id); return; }
  const { error } = await sb.from("montagem_descontos").delete().eq("id", id); if (error) throw new Error(error.message);
}
// parcela "2/5" continua no mês seguinte, na mesma quinzena (1ª → 1ª, 2ª → 2ª) como "3/5"
const refMesAnt = (ref: string) => { const [y, m, q] = ref.split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return d.toISOString().slice(0, 7) + "-" + q; };
async function trazerParcelasMont(ref: string, quem: string): Promise<number> {
  const ant = await listaDesc(refMesAnt(ref)), ja = await listaDesc(ref); let n = 0;
  for (const d of ant) { const m = String(d.parcela).match(/^(\d+)\s*\/\s*(\d+)$/); if (!m || +m[1] >= +m[2]) continue; const parcela = (+m[1] + 1) + "/" + m[2];
    if (ja.some(x => x.montador_id === d.montador_id && x.descricao === d.descricao && x.parcela === parcela)) continue;
    await criarDesc({ referencia: ref, montador_id: d.montador_id, descricao: d.descricao, parcela, valor: d.valor }, quem); n++; }
  return n;
}
/** maior pagamento recente de cada montador (últimos 6 fechamentos ativos); quem recebe só no dia 10 compara com a soma de duas quinzenas seguidas */
async function historicoMontadores(): Promise<Record<string, number>> {
  if (MOCK) return {};
  const { data: fs, error } = await sb.from("montagem_fechamentos").select("id,referencia").eq("ativo", true).order("referencia", { ascending: false }).limit(7); if (error) throw new Error(error.message);
  const ids = (fs || []).map((f: any) => f.id); if (!ids.length) return {};
  const refDe: Record<number, string> = {}; (fs || []).forEach((f: any) => (refDe[f.id] = f.referencia));
  const { data, error: e2 } = await sb.from("montagem_fech_itens").select("fechamento_id,montador_id,nome_exact,total").in("fechamento_id", ids); if (e2) throw new Error(e2.message);
  const por: Record<string, Record<string, number>> = {};
  (data || []).forEach((x: any) => { const k = x.montador_id || "nome:" + x.nome_exact; (por[k] = por[k] || {})[refDe[x.fechamento_id]] = (por[k][refDe[x.fechamento_id]] || 0) + Number(x.total || 0); });
  const out: Record<string, number> = {};
  Object.entries(por).forEach(([k, m]) => { let mx = 0; Object.entries(m).forEach(([ref, v]) => { mx = Math.max(mx, v);
    if (ref.endsWith("-1")) { const [y, mm] = ref.split("-").map(Number); const d = new Date(Date.UTC(y, mm - 2, 1)); const ant = d.toISOString().slice(0, 7) + "-2"; mx = Math.max(mx, v + (m[ant] || 0)); } }); out[k] = mx; });
  return out;
}
async function carregar(): Promise<{ ef: Ef[]; vinc: Record<string, string | null> }> {
  if (MOCK) return { ef: mockEf, vinc: { ...mockVinc } };
  const ef: Ef[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from("montagem_efet").select("chave,os,montador,status,data_montagem,data_finalizacao,produtos,adicionais,total,origem,descricao,criado_por,tipo,aprovado_em,aprovado_por").is("excluido_em", null).order("chave").range(i, i + 999);
    if (error) throw new Error(error.message);
    ef.push(...((data || []) as any[]).map(a => ({ ...a, produtos: Number(a.produtos) || 0, adicionais: Number(a.adicionais) || 0, total: Number(a.total) || 0 })));
    if (!data || data.length < 1000) break;
  }
  const { data: v } = await sb.from("montagem_vinculo").select("nome_exact,montador_id");
  return { ef, vinc: Object.fromEntries(((v || []) as any[]).map(x => [x.nome_exact, x.montador_id])) };
}
async function enviar(ef: Ef[]) {
  if (MOCK) { const k = new Set(mockEf.map(a => a.chave)); const n = ef.filter(a => !k.has(a.chave)).length; mockEf = [...mockEf.filter(a => !ef.some(b => b.chave === a.chave)), ...ef]; return { novos: n, atualizados: ef.length - n, total: mockEf.length }; }
  let r = { novos: 0, atualizados: 0, total: 0 };
  for (let i = 0; i < ef.length; i += 500) {
    const p = ef.slice(i, i + 500).map(a => ({ chave: a.chave, os: a.os, montador: a.montador, status: a.status, mont: a.data_montagem, fin: a.data_finalizacao || "", prod: a.produtos, adic: a.adicionais, total: a.total }));
    const { data, error } = await sb.rpc("montagem_efet_importar", { p });
    if (error) throw new Error(error.message);
    r = { novos: r.novos + (data as any).novos, atualizados: r.atualizados + (data as any).atualizados, total: (data as any).total };
  }
  return r;
}
async function salvarAvulsa(p: any): Promise<string> {
  if (MOCK) { const ch = p.chave || "AVULSA¦" + Math.random().toString(36).slice(2); const prod = Number(p.prod) || 0, adic = Number(p.adic) || 0;
    mockEf = [...mockEf.filter(a => a.chave !== ch), { chave: ch, os: "Ordem avulsa", montador: p.montador, status: p.status === "aprovado" ? "PAGAMENTO EFETUADO" : "AGUARDANDO APROVAÇÃO DE PAGAMENTO", data_montagem: p.de, data_finalizacao: p.ate, produtos: prod, adicionais: adic, total: prod + adic, origem: "avulsa", descricao: p.descricao, tipo: p.tipo, criado_por: "você" }]; return ch; }
  const { data, error } = await sb.rpc("montagem_avulsa_salvar", { p }); if (error) throw new Error(error.message); return data as string;
}
async function aprovarOS(chaves: string[], desfazer = false): Promise<number> {
  if (MOCK) { let n = 0; mockEf = mockEf.map(a => chaves.includes(a.chave) && (desfazer ? !!a.aprovado_em : !aprovado(a)) ? (n++, { ...a, aprovado_em: desfazer ? null : new Date().toISOString(), aprovado_por: desfazer ? null : "você" }) : a); return n; }
  const { data, error } = await sb.rpc("montagem_aprovar", { p_chaves: chaves, p_desfazer: desfazer }); if (error) throw new Error(error.message); return data as number;
}
async function excluirAvulsa(ch: string) {
  if (MOCK) { mockEf = mockEf.filter(a => a.chave !== ch); return; }
  const { error } = await sb.rpc("montagem_avulsa_excluir", { p_chave: ch }); if (error) throw new Error(error.message);
}
let mockFech: any[] = []; let mockItens: any[] = [];
async function fechar(p: any): Promise<number> {
  if (MOCK) { if (mockFech.some(f => f.referencia === p.referencia && f.ativo) && !p.substituir) throw new Error("Já existe um fechamento de " + p.referencia + " — confirme para substituir (o anterior fica guardado no histórico)");
    mockFech.forEach(f => { if (f.referencia === p.referencia && f.ativo) { f.ativo = false; f.substituido_em = new Date().toISOString(); } });
    const id = mockFech.length + 1; const it = (p._itens || []).map((x: any) => ({ ...x, fechamento_id: id }));
    mockItens.push(...it); mockFech.push({ id, referencia: p.referencia, de: p.de, ate: p.ate, pelo: p.pelo, filtro: p.filtro, obs: p.obs, total: it.reduce((s: number, x: any) => s + x.total, 0), aprovado: it.reduce((s: number, x: any) => s + x.aprovado, 0), aguardando: it.reduce((s: number, x: any) => s + x.aguardando, 0), n_montadores: it.length, n_os: it.reduce((s: number, x: any) => s + x.montagens, 0), criado_em: new Date().toISOString(), criado_por: "você", ativo: true }); return id; }
  const { _itens, ...q } = p; const { data, error } = await sb.rpc("montagem_fechar", { p: q }); if (error) throw new Error(error.message); return data as number;
}
async function listaFech(): Promise<any[]> {
  if (MOCK) return mockFech.slice().reverse();
  const { data, error } = await sb.from("montagem_fechamentos").select("*").order("referencia", { ascending: false }).order("criado_em", { ascending: false }); if (error) throw new Error(error.message); return data || [];
}
async function itensFech(id: number): Promise<any[]> {
  if (MOCK) return mockItens.filter(x => x.fechamento_id === id);
  const { data, error } = await sb.from("montagem_fech_itens").select("*").eq("fechamento_id", id).order("total", { ascending: false }); if (error) throw new Error(error.message); return data || [];
}
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
// pagamento quinzenal dos montadores: 1ª quinzena = 10 a 24 do mês · 2ª quinzena = 25 do mês a 9 do mês seguinte
const isoU = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
export function quinzenaDe(iso: string): { de: string; ate: string; ref: string } {
  const [y, m, d] = iso.split("-").map(Number);
  if (d >= 10 && d <= 24) return { de: isoU(y, m - 1, 10), ate: isoU(y, m - 1, 24), ref: isoU(y, m - 1, 1).slice(0, 7) + "-1" };
  const base = d >= 25 ? new Date(Date.UTC(y, m - 1, 1)) : new Date(Date.UTC(y, m - 2, 1)); // a 2ª quinzena leva o nome do mês em que começa
  const by = base.getUTCFullYear(), bm = base.getUTCMonth();
  return { de: isoU(by, bm, 25), ate: isoU(by, bm + 1, 9), ref: isoU(by, bm, 1).slice(0, 7) + "-2" };
}
export const quinzenaAntes = (q: { de: string }) => quinzenaDe(somaDias(q.de, -1));
const nomeMes = (ref: string) => {
  const mes = MESES[Number(ref.slice(5, 7)) - 1] + "/" + ref.slice(0, 4);
  if (!/-[12]$/.test(ref)) return mes;
  const q = quinzenaDe(ref.slice(0, 7) + (ref.endsWith("-1") ? "-10" : "-25"));
  return (ref.endsWith("-1") ? "1ª" : "2ª") + " quinzena de " + MES3[Number(ref.slice(5, 7)) - 1] + "/" + ref.slice(2, 4) + " (" + br(q.de).slice(0, 5) + " a " + br(q.ate).slice(0, 5) + ")";
};
const CAB_FIN = ["Montador", "Nome no Exact", "Titular da conta", "CPF/CNPJ", "Banco", "Agência", "Conta", "Tipo de conta", "PIX (tipo)", "PIX (chave)", "Montagens", "Total produtos", "Adicionais", "TOTAL A PAGAR", "Aprovado p/ pagamento", "Aguardando aprovação", "Período", "Obs."];
// nota fiscal do montador por período: pedido pelo WhatsApp (Gestão/Financeiro) e "nota recebida" (Financeiro)
type Nf = { chave: string; de: string; ate: string; valor: number; solicitada_em: string | null; solicitada_por: string | null; recebida_em: string | null; recebida_por: string | null };
let mockNf: Nf[] = [];
async function listaNf(): Promise<Nf[]> {
  if (MOCK) return mockNf;
  const { data, error } = await sb.from("montagem_nf").select("chave,de,ate,valor,solicitada_em,solicitada_por,recebida_em,recebida_por"); if (error) throw new Error(error.message); return (data || []) as Nf[];
}
async function nfAcao(acao: "pedir" | "recebida" | "desfazer", p: { chave: string; id: string | null; nome: string; de: string; ate: string; valor: number }) {
  if (MOCK) { const i = mockNf.findIndex(x => x.chave === p.chave && x.de === p.de && x.ate === p.ate); const a: Nf = i >= 0 ? mockNf[i] : { chave: p.chave, de: p.de, ate: p.ate, valor: p.valor, solicitada_em: null, solicitada_por: null, recebida_em: null, recebida_por: null };
    if (acao === "pedir") { a.solicitada_em = new Date().toISOString(); a.solicitada_por = "você"; } else if (acao === "recebida") { a.recebida_em = new Date().toISOString(); a.recebida_por = "você"; } else { a.recebida_em = null; a.recebida_por = null; }
    if (i < 0) mockNf.push(a); return; }
  const base = { p_chave: p.chave, p_montador_id: p.id, p_montador: p.nome, p_de: p.de, p_ate: p.ate, p_valor: p.valor };
  const { error } = acao === "pedir" ? await sb.rpc("montagem_nf_solicitar", base) : await sb.rpc("montagem_nf_recebida", { ...base, p_desfazer: acao === "desfazer" });
  if (error) throw new Error(error.message);
}
async function vincular(nome: string, id: string | null) {
  if (MOCK) { mockVinc[nome] = id; return; }
  const { error } = await sb.rpc("montagem_vincular", { p_nome: nome, p_montador: id }); if (error) throw new Error(error.message);
}

type G = { nome: string; cad: any | null; n: number; prod: number; adic: number; total: number; aprov: number; aprovN: number; agu: number; aguN: number; itens: Ef[] };

export default function MontagemPagamento() {
  const { R, st, toast } = useApp() as any;
  const [dados, setDados] = useState<{ ef: Ef[]; vinc: Record<string, string | null> } | null>(null); const [erro, setErro] = useState("");
  const h = hoje();
  // quinzenas: "futura" = a que está correndo (contém hoje) · "atual" = a anterior, que vamos pagar agora · "passada" = a de antes
  // ex.: em 29/10 → futura 25/10–09/11 · atual (a pagar) 10/10–24/10 · passada 25/09–09/10
  const qPagar = quinzenaAntes(quinzenaDe(h));
  const [de, setDe] = useState(() => qPagar.de); const [ate, setAte] = useState(() => qPagar.ate);
  const [pelo, setPelo] = useState<"fin" | "mont">("fin");
  const [fs, setFs] = useState<"todos" | "aprov" | "agu">("todos");
  const [q, setQ] = useState(""); const [aberto, setAberto] = useState("");
  const [enviando, setEnviando] = useState(""); const inp = useRef<HTMLInputElement>(null);
  const [tela, setTela] = useState<"periodo" | "hist">("periodo");
  const [ord, setOrd] = useState<{ k: string; desc: boolean }>({ k: "nome", desc: false });
  const [sel, setSel] = useState<Set<string>>(new Set()); const [aprovando, setAprovando] = useState(false);
  const { setModal } = useApp() as any;
  const [pagas, setPagas] = useState<{ por: Map<string, string>; desde: string } | null>(null);
  const [incluirPend, setIncluirPend] = useState(true);
  const [descs, setDescs] = useState<Desc[]>([]);
  const recarregar = () => { carregarPagas().then(setPagas).catch(() => setPagas({ por: new Map(), desde: "" })); return carregar().then(setDados).catch(e => setErro(e.message)); };
  const [nfs, setNfs] = useState<Nf[]>([]);
  const recNf = () => listaNf().then(setNfs).catch(() => setNfs([]));
  useEffect(() => { recarregar(); recNf(); }, []);

  const cadastro = (st.montadores || []).filter((m: any) => m.ativo !== false);
  const porNorm = useMemo(() => { const m: Record<string, any> = {}; cadastro.forEach((x: any) => { m[norm(x.nome)] = x; }); return m; }, [st.montadores]);
  const cadDe = (nome: string) => {
    const v = dados?.vinc[nome];
    if (v !== undefined) return v ? (st.montadores || []).find((m: any) => m.id === v) || null : null;
    return porNorm[norm(nome)] || null;
  };

  const gest = podeMontagemAgend(R), fin = R.mySetores().includes("financeiro");
  const refQ0 = (() => { const q = quinzenaDe(de); return q.de === de && q.ate === ate ? q.ref : ""; })();
  useEffect(() => { if (refQ0) listaDesc(refQ0).then(setDescs).catch(() => setDescs([])); else setDescs([]); }, [refQ0]);
  if (!gest && !fin) return <section className="view active"><div className="empty">Só a Gestão e o Financeiro veem esta tela.</div></section>;
  const abas = <div className="subnav" style={{ margin: "0 0 14px" }}><button className={tela === "periodo" ? "on" : ""} onClick={() => setTela("periodo")}>📋 Montagens e pagamento</button><button className={tela === "hist" ? "on" : ""} onClick={() => setTela("hist")}>📚 Histórico de pagamentos (fechamentos)</button></div>;
  if (tela === "hist") return <section className="view active"><div className="view-head"><div><h2>💰 Montagem · Histórico de pagamentos</h2><p>Cada fechamento guarda o que foi gerado para o financeiro naquele mês (valores, contas e as O.S.). Se um mês for fechado de novo, o anterior fica guardado como “substituído” — nada se perde.</p></div></div>{abas}<Historico podeEnviar={gest} /></section>;

  const subir = async (f: File) => {
    setEnviando("Lendo " + f.name + "…");
    try {
      const ef = converter(await lerArquivo(f));
      if (!ef.length) { toast("Não encontrei montagens neste arquivo (precisa das colunas Montador, os, status, Data Montagem, Total OS)"); return; }
      setEnviando("Enviando " + ef.length + " montagens…");
      const r = await enviar(ef);
      toast(r.novos + " novas · " + r.atualizados + " atualizadas · " + r.total + " no total");
      const ds = ef.map(a => a.data_finalizacao || a.data_montagem).filter(Boolean).sort() as string[];
      if (ds.length) { setDe(ds[0]); setAte(ds[ds.length - 1]); }
      await recarregar();
    } catch (e: any) { toast(e.message || "Não foi possível enviar"); }
    finally { setEnviando(""); if (inp.current) inp.current.value = ""; }
  };

  const dataDe = (e: Ef) => (pelo === "fin" ? e.data_finalizacao || e.data_montagem : e.data_montagem) || "";
  // quem recebe só no dia 10: na 1ª quinzena (paga dia 10) entra também a quinzena retrasada (25 a 09); na 2ª (paga dia 25) não entra
  const qzP = quinzenaDe(de), ehQzP = qzP.de === de && qzP.ate === ate;
  const q1P = ehQzP && qzP.ref.endsWith("-1"), q2P = ehQzP && qzP.ref.endsWith("-2"), deRetrasada = q1P ? quinzenaAntes(qzP).de : de;
  const noPeriodo = (e: Ef) => { const d = dataDe(e); if ((q1P || q2P) && pagaDia10(cadDe(e.montador)?.conta)) return q2P ? false : d >= deRetrasada && d <= ate; return d >= de && d <= ate; };
  const fora10 = q2P ? Array.from(new Set((dados?.ef || []).filter(e => conta(e) && pagaDia10(cadDe(e.montador)?.conta) && dataDe(e) >= de && dataDe(e) <= ate).map(e => cadDe(e.montador)?.nome || e.montador))) : [];
  // já paga em OUTRO fechamento (o da própria quinzena pode ser refeito) — nunca entra de novo
  const refAtual = ehQzP ? qzP.ref : "";
  const recDesc = () => refAtual ? listaDesc(refAtual).then(setDescs).catch(() => setDescs([])) : setDescs([]);
  const descDe = (g: G) => g.cad ? descs.filter(d => d.montador_id === g.cad.id) : [];
  const totDesc = (g: G) => r2(descDe(g).reduce((s, d) => s + d.valor, 0));
  // quem recebe só no dia 10 não recebe no pagamento do dia 25: o que ficou num fechamento de 2ª quinzena não conta como pago
  const pagaEm = (e: Ef) => { const r = pagas?.por.get(e.chave) || pagas?.por.get(chOrd(e.os, e.data_montagem, e.total)); if (!r || r === refAtual) return ""; if (q1P && r === quinzenaAntes(qzP).ref && pagaDia10(cadDe(e.montador)?.conta)) return ""; return r; };
  // ↑ só a RETRASADA (2ª quinzena imediatamente anterior) volta para quem recebe no dia 10; quinzenas mais antigas já foram pagas
  // pendentes de quinzenas anteriores: fechadas fora do prazo ou aprovadas depois — ainda não pagas em nenhum fechamento
  const limitePend = somaDias(de, -60);
  const pendente = (e: Ef) => { const d = dataDe(e); if (!pagas?.desde || d >= de || d < pagas.desde || d < limitePend) return false; if (q2P && pagaDia10(cadDe(e.montador)?.conta)) return false; return !noPeriodo(e) && !pagaEm(e); };
  const com10 = q1P ? Array.from(new Set((dados?.ef || []).filter(e => conta(e) && pagaDia10(cadDe(e.montador)?.conta) && dataDe(e) >= deRetrasada && dataDe(e) < de && !pagaEm(e)).map(e => cadDe(e.montador)?.nome || e.montador))) : [];
  // quem recebe só no dia 10 e já teve a retrasada paga em outro fechamento (não paga de novo)
  const dia10Pago = q1P ? Array.from(new Set((dados?.ef || []).filter(e => conta(e) && pagaDia10(cadDe(e.montador)?.conta) && dataDe(e) >= deRetrasada && dataDe(e) < de && pagaEm(e)).map(e => (cadDe(e.montador)?.nome || e.montador) + " (já pago no fechamento " + nomeMes(pagaEm(e)) + ")"))) : [];
  const pendTodas = (dados?.ef || []).filter(e => conta(e) && pendente(e));
  const pendCh = new Set(pendTodas.map(e => e.chave));
  const lista = (dados?.ef || []).filter(e => conta(e) && (fs === "todos" || (fs === "aprov" ? aprovado(e) : aguardando(e)))).filter(e => (noPeriodo(e) && !pagaEm(e)) || (incluirPend && pendCh.has(e.chave)));
  const jaPagasNoPer = (dados?.ef || []).filter(e => conta(e) && noPeriodo(e) && pagaEm(e));
  const outros = (dados?.ef || []).filter(e => !conta(e)).filter(e => { const d = dataDe(e); return d >= de && d <= ate; }).length;
  // agrupa pelo cadastro do montador: a ordem avulsa (lançada com o nome do cadastro) cai na mesma linha das O.S. do Exact
  const grupos: G[] = Object.values(lista.reduce((m: Record<string, G>, e) => {
    const cad = cadDe(e.montador), k = cad ? "id:" + cad.id : e.montador;
    const g = (m[k] = m[k] || { nome: e.montador, cad, n: 0, prod: 0, adic: 0, total: 0, aprov: 0, aprovN: 0, agu: 0, aguN: 0, itens: [] });
    if (e.origem !== "avulsa" && g.itens.every(x => x.origem === "avulsa")) g.nome = e.montador; // nome do Exact (para o vínculo)
    g.n++; g.prod += e.produtos; g.adic += e.adicionais; g.total += e.total; g.itens.push(e);
    if (aprovado(e)) { g.aprov += e.total; g.aprovN++; } else { g.agu += e.total; g.aguN++; }
    return m;
  }, {})).sort((a, b) => b.total - a.total);
  // padrão: ordem alfabética; clicar no cabeçalho ordena pela coluna (1º clique: maior primeiro · 2º: menor primeiro)
  const nomeG = (g: G) => g.cad?.nome || g.nome;
  const valOrd: Record<string, (g: G) => number> = { n: g => g.n, prod: g => g.prod, adic: g => g.adic, total: g => g.total, aprov: g => g.aprov, agu: g => g.agu };
  const cmp = (a: G, b: G) => ord.k === "nome" ? (ord.desc ? -1 : 1) * nomeG(a).localeCompare(nomeG(b), "pt-BR") : (ord.desc ? -1 : 1) * (valOrd[ord.k](a) - valOrd[ord.k](b)) || nomeG(a).localeCompare(nomeG(b), "pt-BR");
  const vis = grupos.filter(g => !q.trim() || norm(g.nome + " " + (g.cad?.nome || "")).includes(norm(q))).sort(cmp);
  const Th = ({ k, l, n }: { k: string; l: string; n?: boolean }) => <th className={(n ? "n " : "") + "ma-ord" + (ord.k === k ? " on" : "")} title="Clique para ordenar"
    onClick={() => setOrd(ord.k === k ? { k, desc: !ord.desc } : { k, desc: k !== "nome" })}>{l}{ord.k === k ? (ord.desc ? " ▼" : " ▲") : ""}</th>;
  const soma = (f: (g: G) => number) => r2(grupos.reduce((s, g) => s + f(g), 0));
  const temConta = (g: G) => !!(g.cad && g.cad.conta && (g.cad.conta.conta || g.cad.conta.pixChave));
  const semConta = grupos.filter(g => !temConta(g));
  // aprovar no 360: só o que está aguardando aprovação no período
  const aguTodas = lista.filter(e => aguardando(e));
  const selItens = aguTodas.filter(e => sel.has(e.chave));
  const alternar = (chaves: string[], on: boolean) => setSel(x => { const n = new Set(x); chaves.forEach(c => on ? n.add(c) : n.delete(c)); return n; });
  const aprovarSel = async () => {
    const tot = r2(selItens.reduce((s, e) => s + e.total, 0));
    if (!confirm("Aprovar para pagamento " + selItens.length + " O.S. (" + fmtMoeda(tot) + ")?\n\nElas passam para ✅ Aprovado. Depois é só fechar o pagamento da quinzena.")) return;
    setAprovando(true);
    try { const n = await aprovarOS(selItens.map(e => e.chave)); toast(n + " O.S. aprovada(s) para pagamento"); setSel(new Set()); await recarregar(); }
    catch (e: any) { toast(e.message); } finally { setAprovando(false); }
  };
  const periodo = (a: string, b: string) => { setDe(a); setAte(b); };
  const mesPassado = () => { const d = new Date(h.slice(0, 8) + "01T12:00:00Z"); d.setUTCDate(0); const fim = d.toISOString().slice(0, 10); periodo(fim.slice(0, 8) + "01", fim); };
  const per = br(de) + " a " + br(ate);
  const stTxt = fs === "aprov" ? "só aprovados para pagamento" : fs === "agu" ? "só aguardando aprovação" : "aprovados + aguardando aprovação";

  const relFinanceiro = () => {
    const qz = quinzenaDe(de), ehQ = qz.de === de && qz.ate === ate;
    const linhas = grupos.slice().sort((a, b) => nomeG(a).localeCompare(nomeG(b), "pt-BR")).map(g => { const k = g.cad?.conta || {}; return { montador: g.cad?.nome || g.nome, titular: k.titular, doc: k.docTitular, banco: k.banco, agencia: k.agencia, conta: k.conta, tipoConta: k.tipoConta, pixTipo: k.pixTipo, pixChave: k.pixChave, total: r2(g.total - totDesc(g)) }; });
    pdfFinanceiro("pagamento_montadores_" + de + "_a_" + ate + ".pdf", ehQ ? nomeMes(qz.ref) : "Período personalizado", per + " · " + stTxt, linhas).catch(e => toast("Não foi possível gerar o PDF: " + e.message));
  };
  const relDetalhado = () => {
    const cab = ["Montador", "O.S.", "Status", "Data montagem", "Data finalização", "Total produtos", "Adicionais", "Total O.S."];
    const linhas = grupos.slice().sort(cmp).flatMap(g => g.itens.slice().sort((a, b) => dataDe(a).localeCompare(dataDe(b))).map(e => [g.cad?.nome || g.nome, e.origem === "avulsa" ? "Avulsa · " + rotAv(e) : e.os, aprovado(e) ? "Aprovado p/ pagamento" : "Aguardando aprovação", br(e.data_montagem), br(e.data_finalizacao), e.produtos, e.adicionais, e.total]));
    baixarXlsx("montagens_detalhadas_" + de + "_a_" + ate + ".xlsx", cab, linhas, "Montagens");
  };

  return (
    <section className="view active">
      <div className="view-head"><div><h2>💰 Montagem · Pagamento dos montadores</h2><p>Montagens efetivadas do Exact por montador: total dos produtos, adicionais e total a pagar. “Aguardando aprovação de pagamento” conta, mas fica separado do “Pagamento efetuado” (aprovado). Gere o relatório com a conta de cada montador para o financeiro.</p></div></div>
      {abas}
      <div className="card ma-topo">
        <div className="ma-envio">
          <input ref={inp} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); }} />
          {gest && <button className="btn primary" disabled={!!enviando} onClick={() => inp.current?.click()}>{enviando || "📤 Enviar relatório de montagens efetivadas (CSV ou Excel)"}</button>}
          <span className="hint">{dados ? dados.ef.length + " montagens guardadas. Pode enviar o mesmo período de novo: não duplica, só atualiza status e valores." : erro || "Carregando…"}</span>
        </div>
        <div className="ma-filtros">
          <div className="field"><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
          <div className="field"><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
          <div className="field"><label>Pela data de</label><select value={pelo} onChange={e => setPelo(e.target.value as any)}><option value="fin">Finalização</option><option value="mont">Montagem</option></select></div>
          <div className="chips" style={{ margin: 0 }}>
            {(() => { const qf = quinzenaDe(h), qa = quinzenaAntes(qf), qp = quinzenaAntes(qa); const lista = [qf]; for (let k = 0; k < 11; k++) lista.push(quinzenaAntes(lista[lista.length - 1]));
              const atual = lista.find(q => q.de === de && q.ate === ate);
              return <>
                {([[qp, "Quinzena passada"], [qa, "Quinzena atual · a pagar"], [qf, "Quinzena futura · em andamento"]] as [any, string][]).map(([q, l]) =>
                  <button key={l} className={"chip" + (de === q.de && ate === q.ate ? " on" : "")} onClick={() => periodo(q.de, q.ate)} title={nomeMes(q.ref)}>{l} ({br(q.de).slice(0, 5)} a {br(q.ate).slice(0, 5)})</button>)}
                <select className="ma-quinz" value={atual ? atual.ref : ""} onChange={e => { const q = lista.find(x => x.ref === e.target.value); if (q) periodo(q.de, q.ate); }}>
                  <option value="">📅 Escolher quinzena…</option>{lista.map(q => <option key={q.ref} value={q.ref}>{nomeMes(q.ref)}</option>)}</select>
              </>; })()}
            <button className="chip" onClick={() => periodo(h.slice(0, 8) + "01", h)}>Este mês</button>
            <button className="chip" onClick={mesPassado}>Mês passado</button>
            <button className="chip" onClick={() => periodo(somaDias(h, -6), h)}>Últimos 7 dias</button>
            <button className="chip" onClick={() => periodo(somaDias(h, -14), h)}>Últimos 15 dias</button>
            <button className="chip" onClick={() => { const ds = (dados?.ef || []).map(dataDe).filter(Boolean).sort(); if (ds.length) periodo(ds[0], ds[ds.length - 1]); }}>Tudo</button>
          </div>
        </div>
      </div>

      <div className="subnav" style={{ margin: "14px 0 10px" }}>
        {([["todos", "Aprovados + aguardando"], ["aprov", "✅ Aprovados p/ pagamento"], ["agu", "⏳ Aguardando aprovação"]] as [any, string][]).map(([k, l]) => <button key={k} className={fs === k ? "on" : ""} onClick={() => setFs(k)}>{l}</button>)}
      </div>

      <div className="kpis">
        <Kpi n={soma(g => g.n)} l={"Montagens efetivadas (" + stTxt + ")"} />
        <Kpi n={fmtMoeda(soma(g => g.prod))} l="Total dos produtos (serviço)" fs={20} />
        <Kpi n={fmtMoeda(soma(g => g.adic))} l="Adicionais" fs={20} />
        <Kpi n={fmtMoeda(soma(g => g.total))} l={"Total das montagens · " + grupos.length + " montadores"} fs={20} />
        {soma(totDesc) > 0 && <Kpi n={fmtMoeda(soma(totDesc))} l={"➖ Descontos (" + descs.length + ")"} fs={20} />}
        {soma(totDesc) > 0 && <Kpi n={fmtMoeda(r2(soma(g => g.total) - soma(totDesc)))} l="💰 Líquido a pagar" fs={20} />}
        <Kpi n={fmtMoeda(r2(lista.filter(e => e.origem === "avulsa").reduce((s, e) => s + e.total, 0)))} l={"Ordens avulsas (" + lista.filter(e => e.origem === "avulsa").length + ") · já no total"} fs={20} />
        <Kpi n={fmtMoeda(soma(g => g.aprov))} l={"✅ Aprovado p/ pagamento (" + soma(g => g.aprovN) + ")"} fs={20} />
        <Kpi n={fmtMoeda(soma(g => g.agu))} l={"⏳ Aguardando aprovação (" + soma(g => g.aguN) + ")"} fs={20} cls={soma(g => g.agu) ? "alert" : ""} />
      </div>
      {gest && ehQzP && <div className="card" style={{ marginTop: 12, padding: "10px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", borderLeft: "4px solid var(--st-concluida)" }}>
        <span style={{ flex: 1, minWidth: 220 }}><b>Pagamento de {nomeMes(qzP.ref)}</b> · confira, aprove o que faltar e feche. Depois, no 📚 Histórico, envie para o financeiro.</span>
        {gest && <button className="btn primary" style={{ background: "var(--st-concluida)", borderColor: "var(--st-concluida)", fontWeight: 800, fontSize: 15, padding: "10px 18px" }} disabled={!grupos.length} onClick={() => setModal(<ModalFechar de={de} ate={ate} pelo={pelo} fs={fs} grupos={grupos} totDescontos={r2(grupos.reduce((s, g) => s + totDesc(g), 0))} mapa={Object.fromEntries(grupos.flatMap(g => Array.from(new Set([g.nome, ...g.itens.map(e => e.montador)])).map(n => [n, g.cad?.id || ""])))} pronto={() => setTela("hist")} />)}>🔒 Fechar pagamento da quinzena</button>}
      </div>}
      {pendTodas.length > 0 && <div className="card" style={{ marginTop: 12, padding: "10px 14px", background: "var(--tn-blue)" }}>
        📥 <b>{pendTodas.length} O.S. de quinzenas anteriores ainda não pagas · {fmtMoeda(r2(pendTodas.reduce((s, e) => s + e.total, 0)))}</b>
        <span> — ✅ {pendTodas.filter(aprovado).length} aprovada(s) ({fmtMoeda(r2(pendTodas.filter(aprovado).reduce((s, e) => s + e.total, 0)))}) · ⏳ {pendTodas.filter(aguardando).length} aguardando aprovação ({fmtMoeda(r2(pendTodas.filter(aguardando).reduce((s, e) => s + e.total, 0)))})</span>
        <div className="hint" style={{ marginTop: 4 }}>O montador fechou fora do prazo ou a aprovação veio depois. {incluirPend ? "Estão somadas neste pagamento (marcadas com 📥 na lista do montador). As que estão aguardando, aprove aqui para entrarem no fechamento." : "Não estão somadas neste pagamento."}</div>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", marginTop: 6, fontWeight: 600 }}><input type="checkbox" checked={incluirPend} onChange={e => setIncluirPend(e.target.checked)} /> Incluir neste pagamento</label>
      </div>}
      {jaPagasNoPer.length > 0 && <div className="hint" style={{ marginTop: 6 }}>{jaPagasNoPer.length} O.S. deste período já foram pagas em outro fechamento e não entram de novo ({fmtMoeda(r2(jaPagasNoPer.reduce((s, e) => s + e.total, 0)))}).</div>}
      {ehQzP && soma(g => g.aguN) > 0 && <div className="hint" style={{ marginTop: 6, color: "var(--tn-amber-i)" }}>⏳ Ao fechar com “só aprovados”, {soma(g => g.aguN)} O.S. aguardando aprovação ({fmtMoeda(soma(g => g.agu))}) ficam pendentes e aparecem no próximo pagamento quando forem aprovadas.</div>}
      {com10.length > 0 && <div className="ro-note" style={{ marginTop: 12 }}>📅 <b>Recebe só no dia 10:</b> {com10.join(", ")} — neste pagamento entram também as montagens da quinzena retrasada ({br(deRetrasada)} a {br(somaDias(de, -1))}).</div>}
      {dia10Pago.length > 0 && <div className="ro-note" style={{ marginTop: 12 }}>📅 <b>Recebe só no dia 10 — retrasada já paga:</b> {dia10Pago.join(", ")}. Por isso entra só a quinzena passada.</div>}
      {fora10.length > 0 && <div className="ro-note" style={{ marginTop: 12 }}>📅 <b>Fora deste pagamento (recebe só no dia 10):</b> {fora10.join(", ")} — as montagens desta quinzena entram no pagamento do dia 10.</div>}
      {semConta.length > 0 && <div className="alerta" style={{ marginTop: 12 }}>⚠️ <b>{semConta.length} montador(es) sem conta cadastrada ou sem vínculo com o cadastro:</b> {semConta.map(g => g.nome).join(", ")}. Vincule na tabela abaixo ou cadastre em <b>Cadastros → Montadores → 🔒 Contas para pagamento</b>.</div>}
      {outros > 0 && <div className="hint" style={{ marginTop: 6 }}>{outros} O.S. no período com outro status (ex.: aguardando montagem, cancelado) não entram no pagamento.</div>}

      <div className="card" style={{ padding: 0, marginTop: 14, overflowX: "auto" }}>
        <div className="ma-cab">
          <b>Por montador · {per} · pela data de {pelo === "fin" ? "finalização" : "montagem"}</b>
          <input type="search" placeholder="🔎 Buscar montador" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 220 }} />
          <button className="btn primary sm" onClick={relFinanceiro} disabled={!grupos.length}>⬇ Relatório para o financeiro (PDF)</button>
          <button className="btn sm" onClick={relDetalhado} disabled={!grupos.length}>⬇ Detalhado por O.S.</button>
          {gest && <button className="btn sm" onClick={() => setModal(<ModalAvulsa cadastro={cadastro} pronto={recarregar} de={de} ate={ate} />)}>＋ Ordem avulsa</button>}
          {(gest || fin) && refAtual && <button className="btn sm" title={"Parcelas de descontos (ex.: 2/5) do mesmo pagamento do mês anterior"} onClick={async () => { try { const n = await trazerParcelasMont(refAtual, R.nomeUser?.(R.currentUserId) || ""); toast(n ? n + " parcela(s) de desconto trazida(s)" : "Nenhuma parcela de desconto para trazer"); recDesc(); } catch (e: any) { toast(e.message); } }}>↪ Trazer parcelas de desconto</button>}
          {gest && aguTodas.length > 0 && <button className="btn sm" onClick={() => setSel(sel.size === aguTodas.length ? new Set() : new Set(aguTodas.map(e => e.chave)))}>{sel.size === aguTodas.length ? "Limpar seleção" : "☑ Selecionar todas aguardando (" + aguTodas.length + ")"}</button>}
          {gest && <button className="btn sm" style={{ borderColor: "var(--st-concluida)", color: "var(--st-concluida)", fontWeight: 700 }} disabled={!grupos.length} onClick={() => setModal(<ModalFechar de={de} ate={ate} pelo={pelo} fs={fs} grupos={grupos} totDescontos={r2(grupos.reduce((s, g) => s + totDesc(g), 0))} mapa={Object.fromEntries(grupos.flatMap(g => Array.from(new Set([g.nome, ...g.itens.map(e => e.montador)])).map(n => [n, g.cad?.id || ""])))} pronto={() => setTela("hist")} />)}>🔒 Fechar pagamento da quinzena</button>}
        </div>
        {selItens.length > 0 && <div className="ma-aprovar">
          <span><b>{selItens.length} O.S. selecionada(s)</b> · {fmtMoeda(r2(selItens.reduce((s, e) => s + e.total, 0)))} · {new Set(selItens.map(e => e.montador)).size} montador(es)</span>
          <button className="btn primary" disabled={aprovando} onClick={aprovarSel}>{aprovando ? "Aprovando…" : "✅ Aprovar para pagamento"}</button>
          <button className="btn ghost sm" onClick={() => setSel(new Set())}>Limpar</button></div>}
        {!vis.length ? <div className="empty" style={{ padding: 24 }}>{dados && dados.ef.length ? "Nenhuma montagem efetivada neste período." : "Envie o relatório do Exact para começar."}</div> :
          <table className="ma-tab"><thead><tr><th style={{ width: 28 }}></th><Th k="nome" l="Montador" /><Th k="n" l="Montagens" n /><Th k="prod" l="Produtos" n /><Th k="adic" l="Adicionais" n /><Th k="total" l="Total a pagar" n /><Th k="aprov" l="✅ Aprovado" n /><Th k="agu" l="⏳ Aguardando" n /><th>Conta para pagamento</th><th>Nota fiscal</th></tr></thead>
            <tbody>{vis.map(g => <Linha key={g.nome} g={g} recarregar={recarregar} sel={sel} alternar={alternar} aberto={aberto === g.nome} abrir={() => setAberto(aberto === g.nome ? "" : g.nome)} cadastro={cadastro} temConta={temConta(g)}
              gest={gest} nf={nfs.find(x => x.chave === chaveNf(g) && x.de === de && x.ate === ate) || null} de={de} ate={ate} recNf={recNf}
              descs={descDe(g)} refQ={refAtual} recDesc={recDesc} podeDesc={gest || fin} quem={R.nomeUser?.(R.currentUserId) || ""}
              vincular={async (id: string | null) => { try { await vincular(g.nome, id); await recarregar(); toast("Vínculo salvo"); } catch (e: any) { toast(e.message); } }} dataDe={dataDe} />)}</tbody>
            <tfoot><tr><td></td><td>Total</td><td className="n">{soma(g => g.n)}</td><td className="n">{fmtMoeda(soma(g => g.prod))}</td><td className="n">{fmtMoeda(soma(g => g.adic))}</td><td className="n">{fmtMoeda(soma(g => g.total))}</td><td className="n">{fmtMoeda(soma(g => g.aprov))}</td><td className="n">{fmtMoeda(soma(g => g.agu))}</td><td></td></tr></tfoot>
          </table>}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>Total a pagar = total dos produtos + adicionais (o “Total OS” do Exact). Toque num montador para ver as O.S. A conta vem do cadastro de montadores; o nome do Exact (ex.: “enilson.rodrigues”) é ligado sozinho ao cadastro quando o nome bate — se não bater, escolha na coluna “Conta”.</p>
    </section>
  );
}

const chaveNf = (g: G) => g.cad ? "id:" + g.cad.id : "nome:" + g.nome;
function msgNf(nome: string, de: string, ate: string, valor: number) {
  const qz = quinzenaDe(de), ehQ = qz.de === de && qz.ate === ate;
  const prim = String(nome || "").replace(/\s*\(.*\)\s*/g, " ").replace(/[._]/g, " ").trim().split(/\s+/)[0] || "";
  const pn = prim ? prim.charAt(0).toUpperCase() + prim.slice(1).toLowerCase() : "";
  return `Olá${pn ? ", " + pn : ""}! Tudo bem?\n\nO fechamento da ${ehQ ? nomeMes(qz.ref) : "período de " + br(de) + " a " + br(ate)} está pronto e precisamos da *nota fiscal* para enviar ao financeiro.\n*Valor total da nota: ${fmtMoeda(valor)}*\n\nPor favor, emita a nota com o valor total e envie para o e-mail contasapagar@aliancamoveis.com.br\n\nObrigada!`;
}
function Linha({ g, aberto, abrir, cadastro, temConta, vincular, dataDe, recarregar, sel, alternar, gest, nf, de, ate, recNf, descs = [], refQ = "", recDesc, podeDesc, quem }: any) {
  const tDesc = r2(descs.reduce((s: number, d: Desc) => s + d.valor, 0));
  const [nd, setNd] = useState({ descricao: "", parcela: "", valor: "" });
  const addDesc = async () => { const v = Number(String(nd.valor).replace(/\./g, "").replace(",", ".")); if (!g.cad) { toast("Vincule o montador ao cadastro antes"); return; } if (!(v > 0)) { toast("Informe o valor do desconto"); return; } if (!nd.descricao.trim()) { toast("Descreva o desconto"); return; }
    try { await criarDesc({ referencia: refQ, montador_id: g.cad.id, descricao: nd.descricao.trim(), parcela: nd.parcela.trim(), valor: r2(v) }, quem); setNd({ descricao: "", parcela: "", valor: "" }); recDesc(); toast("Desconto lançado"); } catch (e: any) { toast(e.message); } };
  const agu: Ef[] = g.itens.filter((e: Ef) => aguardando(e));
  const nSel = agu.filter(e => sel.has(e.chave)).length;
  const desfazerAprov = async (e: Ef) => { if (!confirm("Desfazer a aprovação no 360 da " + (e.origem === "avulsa" ? "ordem avulsa" : e.os) + "? Ela volta para ⏳ Aguardando.")) return; try { await aprovarOS([e.chave], true); toast("Aprovação desfeita"); await recarregar(); } catch (x: any) { toast(x.message); } };
  const k = g.cad?.conta;
  const [trocar, setTrocar] = useState(false);
  const { toast, setModal } = useApp() as any;
  const nomeAv = g.cad?.nome || g.nome;
  const excluirAv = async (e: Ef) => { if (!confirm("Excluir a ordem avulsa “" + rotAv(e) + "” de " + fmtMoeda(e.total) + "? Ela sai do pagamento (fica registrada no histórico do banco).")) return; try { await excluirAvulsa(e.chave); toast("Ordem avulsa excluída"); await recarregar(); } catch (x: any) { toast(x.message); } };
  const editar = (e: Ef) => setModal(<ModalAvulsa cadastro={cadastro} pronto={recarregar} inicial={{ chave: e.chave, montador: e.montador, tipo: e.tipo || "outro", descricao: e.descricao || "", de: e.data_montagem, ate: e.data_finalizacao || e.data_montagem, prod: String(e.produtos).replace(".", ","), adic: e.adicionais ? String(e.adicionais).replace(".", ",") : "", status: aprovado(e) ? "aprovado" : "aguardando" }} />);
  return <>
    <tr className={"ma-lin" + (aberto ? " on" : "")} onClick={abrir}>
      <td onClick={e => e.stopPropagation()}>{gest && agu.length > 0 && <input type="checkbox" title={"Selecionar as " + agu.length + " O.S. aguardando deste montador"} checked={nSel === agu.length} ref={el => { if (el) el.indeterminate = nSel > 0 && nSel < agu.length; }} onChange={e => alternar(agu.map(x => x.chave), e.target.checked)} />}</td>
      <td><b>{g.cad?.nome || g.nome}</b>{g.cad && g.cad.nome !== g.nome ? <small className="hint"> · Exact: {g.nome}</small> : null}</td>
      <td className="n">{g.n}</td><td className="n">{fmtMoeda(g.prod)}</td><td className="n">{fmtMoeda(g.adic)}</td>
      <td className="n"><b>{fmtMoeda(g.total)}</b>{tDesc > 0 && <div style={{ fontSize: 12 }}><span style={{ color: "var(--danger)" }}>➖ {fmtMoeda(tDesc)}</span><br /><b>= {fmtMoeda(r2(g.total - tDesc))}</b></div>}</td>
      <td className="n">{g.aprovN ? fmtMoeda(g.aprov) : "—"}</td>
      <td className="n">{g.aguN ? fmtMoeda(g.agu) : "—"}</td>
      <td onClick={e => e.stopPropagation()} style={{ minWidth: 220 }}>
        {gest && (!g.cad || trocar) ? <select defaultValue={g.cad?.id || ""} onChange={e => { vincular(e.target.value || null); setTrocar(false); }} style={{ fontSize: 12.5 }}>
          <option value="">{g.cad ? "— sem vínculo —" : "⚠️ Vincular ao cadastro…"}</option>
          {cadastro.map((m: any) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>
          : temConta ? <span className="ma-conta" title={[k.titular, k.docTitular].filter(Boolean).join(" · ")}>✔ {k.banco ? k.banco + " · ag " + (k.agencia || "—") + " · cc " + (k.conta || "—") : "PIX " + (k.pixChave || "")} <a href="#" onClick={e => { e.preventDefault(); setTrocar(true); }}>trocar</a></span>
          : <span style={{ color: "var(--warn)", fontWeight: 700, fontSize: 12.5 }}>⚠️ {g.cad.nome}: sem conta cadastrada <a href="#" onClick={e => { e.preventDefault(); setTrocar(true); }}>trocar</a></span>}
      </td>
      <td onClick={e => e.stopPropagation()} style={{ minWidth: 150, fontSize: 12.5 }}>{nf?.recebida_em ? <span style={{ color: "var(--st-concluida)", fontWeight: 700 }}>✅ Nota recebida</span> : nf?.solicitada_em ? <span style={{ color: "#8a5a00" }}>📨 NF solicitada</span> : <span className="hint">pedido da nota: depois do fechamento enviado ao financeiro</span>}</td>
    </tr>
    {aberto && <tr className="ma-dias"><td colSpan={10}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "2px 0 8px" }}>
        {gest && <button className="btn sm primary" onClick={() => setModal(<ModalAvulsa cadastro={cadastro} pronto={recarregar} de={dataDe(g.itens[0]) || hoje()} ate={hoje()} inicial={{ montador: nomeAv }} />)}>＋ Incluir ordem avulsa</button>}
        <span className="hint">Serviço dentro da loja, frete ou outro pagamento manual — entra no total deste montador.</span>
      </div>
      {refQ && podeDesc && <div className="resp-box" style={{ margin: "0 0 10px", padding: "8px 12px" }}>
        <b>➖ Descontos neste pagamento</b> <span className="hint">(compras na loja, adiantamentos… — saem do valor a pagar · parcela no formato 2/5)</span>
        {descs.map((d: Desc) => <div key={d.id} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}><span>{d.parcela && <span className="hint">{d.parcela} </span>}{d.descricao}</span><b style={{ color: "var(--danger)" }}>– {fmtMoeda(d.valor)}</b>
          <button className="btn ghost sm" style={{ padding: "0 6px" }} onClick={async () => { if (!confirm("Apagar este desconto?")) return; try { await apagarDesc(d.id); recDesc(); } catch (e: any) { toast(e.message); } }}>✕</button></div>)}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end", marginTop: 6 }}>
          <div className="field" style={{ margin: 0, flex: 1, minWidth: 160 }}><label>Descrição</label><input value={nd.descricao} onChange={e => setNd({ ...nd, descricao: e.target.value })} placeholder="ex.: compra na loja (pedido 123)" /></div>
          <div className="field" style={{ margin: 0, width: 70 }}><label>Parcela</label><input value={nd.parcela} onChange={e => setNd({ ...nd, parcela: e.target.value })} placeholder="1/3" /></div>
          <div className="field" style={{ margin: 0, width: 110 }}><label>Valor</label><input inputMode="decimal" value={nd.valor} onChange={e => setNd({ ...nd, valor: e.target.value })} placeholder="250,00" /></div>
          <button className="btn sm primary" onClick={addDesc}>＋ Desconto</button>
          {tDesc > 0 && <span style={{ marginLeft: "auto" }}>Líquido: <b>{fmtMoeda(r2(g.total - tDesc))}</b></span>}
        </div>
      </div>}
      <table className="ma-os"><thead><tr><th style={{ width: 26 }}>{agu.length > 0 && <input type="checkbox" title="Selecionar todas aguardando" checked={nSel === agu.length} onChange={e => alternar(agu.map(x => x.chave), e.target.checked)} />}</th><th>O.S.</th><th>Montagem</th><th>Finalização</th><th>Status</th><th className="n">Produtos</th><th className="n">Adicionais</th><th className="n">Total</th></tr></thead>
        <tbody>{g.itens.slice().sort((a: any, b: any) => dataDe(a).localeCompare(dataDe(b))).map((e: any) => <tr key={e.chave} className={sel.has(e.chave) ? "ma-sel" : ""}><td>{aguardando(e) && <input type="checkbox" checked={sel.has(e.chave)} onChange={x => alternar([e.chave], x.target.checked)} />}</td><td>{e.origem === "avulsa" ? <><span className="pill" style={{ background: "var(--primary)", color: "#fff", fontSize: 10.5 }}>AVULSA</span> {rotAv(e)}{e.data_finalizacao && e.data_finalizacao !== e.data_montagem ? <small className="hint"> · período {br(e.data_montagem)} a {br(e.data_finalizacao)}</small> : null} <a href="#" onClick={x => { x.preventDefault(); editar(e); }}>editar</a> · <a href="#" style={{ color: "var(--danger)" }} onClick={x => { x.preventDefault(); excluirAv(e); }}>excluir</a></> : e.os}</td><td>{br(e.data_montagem)}{dataDe(e) < de && <span title="De quinzena anterior, ainda não paga" style={{ color: "var(--tn-blue-i)" }}> 📥</span>}</td><td>{br(e.data_finalizacao)}</td>
          <td>{aprovado(e) ? <><span className="vinda ok">✅ Aprovado{e.aprovado_em && !/pagamento efetuado/i.test(e.status) ? " (360)" : ""}</span>{e.aprovado_em && !/pagamento efetuado/i.test(e.status) ? <small className="hint" title={"por " + (e.aprovado_por || "") + " em " + new Date(e.aprovado_em).toLocaleString("pt-BR").slice(0, 16)}> <a href="#" onClick={x => { x.preventDefault(); desfazerAprov(e); }}>desfazer</a></small> : null}</> : <span className="vinda pend">⏳ Aguardando</span>}</td><td className="n">{fmtMoeda(e.produtos)}</td><td className="n">{e.adicionais ? fmtMoeda(e.adicionais) : "—"}</td><td className="n"><b>{fmtMoeda(e.total)}</b></td></tr>)}</tbody></table>
    </td></tr>}
  </>;
}

// ---------- fechar o pagamento do mês: guarda uma foto do que foi gerado para o financeiro ----------
function ModalFechar({ de, ate, pelo, fs, grupos, mapa, pronto, totDescontos = 0 }: any) {
  const { setModal, toast } = useApp() as any;
  // 🛡 trava de segurança: compara cada montador com o histórico dele antes de fechar
  const [hist, setHist] = useState<Record<string, number> | null>(null); const [ciente, setCiente] = useState(false);
  useEffect(() => { historicoMontadores().then(setHist).catch(() => setHist({})); }, []);
  const alertas = !hist ? [] : grupos.flatMap((g: any) => {
    const nome = g.cad?.nome || g.nome; const base = hist[g.cad?.id || "nome:" + g.nome] || 0; const out: string[] = [];
    const lim = Math.max(base * 1.6, base + 3000);
    if (base > 0 && g.total > lim) out.push(nome + ": " + fmtMoeda(g.total) + " — muito acima do maior pagamento recente dele (" + fmtMoeda(base) + ")");
    const velhas = g.itens.filter((e: any) => String(e.data_finalizacao || e.data_montagem || "") < somaDias(de, -45));
    if (velhas.length) out.push(nome + ": " + velhas.length + " O.S. com mais de 45 dias antes do período (" + fmtMoeda(r2(velhas.reduce((s2: number, e: any) => s2 + e.total, 0))) + ")");
    return out;
  });
  // período igual a uma quinzena → referência da quinzena; senão, o mês
  const qz = quinzenaDe(de), ehQ = qz.de === de && qz.ate === ate;
  const [ref, setRef] = useState(ehQ ? qz.ref : ate.slice(0, 7)); const [obs, setObs] = useState(""); const [ind, setInd] = useState(false);
  const opRef = (() => { const l = [quinzenaDe(hoje())]; for (let k = 0; k < 7; k++) l.push(quinzenaAntes(l[l.length - 1])); const r = l.map(q => q.ref); if (!r.includes(ref)) r.unshift(ref); return r; })();
  const tot = grupos.reduce((s: number, g: any) => s + g.total, 0), n = grupos.reduce((s: number, g: any) => s + g.n, 0);
  const _itens = grupos.map((g: any) => { const k = g.cad?.conta || {}; return { montador: g.cad?.nome || g.nome, nome_exact: g.nome, montador_id: g.cad?.id || null, titular: k.titular, doc: k.docTitular, banco: k.banco, agencia: k.agencia, conta: k.conta, tipo_conta: k.tipoConta, pix_tipo: k.pixTipo, pix_chave: k.pixChave, montagens: g.n, produtos: r2(g.prod), adicionais: r2(g.adic), total: r2(g.total), aprovado: r2(g.aprov), aguardando: r2(g.agu), ordens: g.itens.map((e: any) => ({ chave: e.chave, os: e.os, desc: e.descricao, origem: e.origem, tipo: e.tipo, status: e.status, mont: e.data_montagem, fin: e.data_finalizacao, prod: e.produtos, adic: e.adicionais, total: e.total })) }; });
  const ir = async (substituir: boolean) => {
    setInd(true);
    try { await fechar({ referencia: ref, de, ate, pelo, filtro: fs, obs, mapa, substituir, _itens, chaves: grupos.flatMap((g: any) => g.itens.map((e: any) => e.chave)) }); toast("Pagamento de " + nomeMes(ref) + " fechado e guardado no histórico"); setModal(null); pronto(); }
    catch (e: any) { if (/já existe/i.test(e.message) && !substituir) { if (confirm("Já existe um fechamento de " + nomeMes(ref) + ".\n\nSubstituir? O fechamento anterior NÃO é apagado: fica guardado no histórico como “substituído”.")) { setInd(false); return ir(true); } } else toast(e.message); }
    finally { setInd(false); }
  };
  return <Modal titulo="🔒 Fechar pagamento" onFechar={() => setModal(null)}>
    <p style={{ marginTop: 0 }}>Guarda uma foto deste relatório (valores por montador, contas e as O.S.) no histórico, para consultar depois.</p>
    <div className="field"><label>Referência do pagamento</label><select value={ref} onChange={e => setRef(e.target.value)}>{opRef.map(r => <option key={r} value={r}>{nomeMes(r)}</option>)}</select>
      {!ehQ && <span className="hint">O período escolhido não é uma quinzena exata ({br(de)} a {br(ate)}). Confira a referência.</span>}</div>
    <div className="resp-box" style={{ margin: "10px 0" }}>Período {br(de)} a {br(ate)} · pela data de {pelo === "fin" ? "finalização" : "montagem"} · {fs === "aprov" ? "só aprovados" : fs === "agu" ? "só aguardando" : "aprovados + aguardando"}<br /><b>{grupos.length} montadores · {n} O.S. · {fmtMoeda(tot)}</b>{totDescontos > 0 && <><br />➖ Descontos: {fmtMoeda(totDescontos)} · <b>A pagar: {fmtMoeda(r2(tot - totDescontos))}</b></>}</div>
    <div className="field"><label>Observação (opcional)</label><input value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: enviado ao financeiro em 05/11" /></div>
    {!hist ? <div className="hint">🛡 Conferindo os valores com o histórico…</div> : alertas.length ? <div className="alerta" style={{ marginTop: 8 }}>
      <b>🛡 Trava de segurança — valores fora do normal:</b>
      <ul style={{ margin: "6px 0 6px 18px", padding: 0 }}>{alertas.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 700 }}><input type="checkbox" checked={ciente} onChange={e => setCiente(e.target.checked)} /> Conferi e esses valores estão certos</label>
    </div> : <div className="hint" style={{ color: "var(--st-concluida)" }}>🛡 Valores conferidos com o histórico de cada montador — nada fora do normal.</div>}
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button className="btn primary" disabled={ind || !ref || !hist || (alertas.length > 0 && !ciente)} onClick={() => ir(false)}>{ind ? "Guardando…" : "Fechar e guardar"}</button><button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button></div>
  </Modal>;
}

export function Historico({ soEnviados = false, podeEnviar = false }: { soEnviados?: boolean; podeEnviar?: boolean }) {
  const { toast } = useApp() as any;
  const [l0, setL] = useState<any[] | null>(null);
  const l = l0 && soEnviados ? l0.filter(x => x.ativo && x.enviado_fin_em) : l0; const [erro, setErro] = useState(""); const [ab, setAb] = useState<number | null>(null); const [itens, setItens] = useState<any[]>([]);
  const recL = () => listaFech().then(setL).catch(e => setErro(e.message));
  const { st } = useApp() as any;
  const [nfs, setNfs] = useState<Nf[]>([]); const recNf = () => listaNf().then(setNfs).catch(() => setNfs([]));
  useEffect(() => { recNf(); }, []);
  const gDe = (x: any) => { const cad = (st.montadores || []).find((m: any) => m.id === x.montador_id) || null; return { cad, nome: x.nome_exact || x.montador } as any; };
  useEffect(() => { recL(); }, []);
  const enviarFin = async (x: any) => {
    if (!confirm("Enviar o pagamento " + nomeMes(x.referencia) + " (" + fmtMoeda(Number(x.total)) + ") para o financeiro? A Salete e a Patrícia passam a ver e são avisadas.")) return;
    const { error } = await sb.rpc("montagem_enviar_fin", { p_id: x.id }); if (error) { toast?.(error.message); return; } toast?.("Enviado para o financeiro ✅"); recL(); };
  useEffect(() => { if (ab) itensFech(ab).then(l => setItens(l.slice().sort((a: any, b: any) => String(a.montador || "").localeCompare(String(b.montador || ""), "pt-BR")))).catch(() => setItens([])); }, [ab]);
  if (erro) return <div className="empty">{erro}</div>;
  if (!l) return <div className="empty">Carregando…</div>;
  if (!l.length && soEnviados) return <div className="empty" style={{ padding: 24 }}>Nenhum pagamento de montagem enviado para o financeiro ainda.</div>;
  if (!l.length) return <div className="empty" style={{ padding: 24 }}>Nenhum pagamento fechado ainda. Na aba “Montagens e pagamento”, filtre a quinzena e clique em “🔒 Fechar pagamento da quinzena”.</div>;
  const f = l.find(x => x.id === ab);
  const per = (x: any) => br(x.de) + " a " + br(x.ate);
  const baixarFin = () => { if (!f) return;
    pdfFinanceiro("pagamento_montadores_" + f.referencia + (f.ativo ? "" : "_substituido_" + f.id) + ".pdf", nomeMes(f.referencia), per(f),
      itens.map(x => ({ montador: x.montador, titular: x.titular, doc: x.doc, banco: x.banco, agencia: x.agencia, conta: x.conta, tipoConta: x.tipo_conta, pixTipo: x.pix_tipo, pixChave: x.pix_chave, total: Number(x.a_pagar ?? x.total) })),
      f.ativo ? "" : "FECHAMENTO SUBSTITUÍDO — não usar para pagamento").catch(e => alert("Não foi possível gerar o PDF: " + e.message)); };
  const baixarFinXls = () => { if (!f) return; const linhas = itens.map(x => [x.montador, x.nome_exact, x.titular || "", x.doc || "", x.banco || "", x.agencia || "", x.conta || "", x.tipo_conta || "", x.pix_tipo || "", x.pix_chave || "", x.montagens, Number(x.produtos), Number(x.adicionais), Number(x.total), Number(x.aprovado), Number(x.aguardando), per(f), (x.conta || x.pix_chave) ? "" : "SEM CONTA CADASTRADA"]);
    linhas.push(["TOTAL", "", "", "", "", "", "", "", "", "", f.n_os, "", "", Number(f.total), Number(f.aprovado), Number(f.aguardando), per(f), f.ativo ? "" : "FECHAMENTO SUBSTITUÍDO"]);
    baixarXlsx("pagamento_montadores_" + f.referencia + (f.ativo ? "" : "_substituido_" + f.id) + ".xlsx", CAB_FIN, linhas, "Pagamento " + f.referencia); };
  const baixarDet = () => { if (!f) return; const linhas = itens.flatMap(x => (x.ordens || []).map((o: any) => [x.montador, o.origem === "avulsa" ? "Avulsa · " + (TIPOS_AV[o.tipo || "outro"] || "").replace(/^\S+ /, "") + (o.desc ? ": " + o.desc : "") : o.os, /efetuado/i.test(o.status) ? "Aprovado p/ pagamento" : "Aguardando aprovação", br(o.mont), br(o.fin), Number(o.prod), Number(o.adic), Number(o.total)]));
    baixarXlsx("montagens_" + f.referencia + ".xlsx", ["Montador", "O.S.", "Status", "Data montagem", "Data finalização", "Total produtos", "Adicionais", "Total O.S."], linhas, "Montagens " + f.referencia); };
  // dia do pagamento: 1ª quinzena (10 a 24) → dia 10 do mês seguinte · 2ª (25 a 09) → dia 25 do mês seguinte
  const pagaEm = (ref: string) => { const m = ref.match(/^(\d{4})-(\d{2})-([12])$/); if (!m) return ""; const d = new Date(Date.UTC(+m[1], +m[2], 1)); return (m[3] === "1" ? "10" : "25") + "/" + String(d.getUTCMonth() + 1).padStart(2, "0") + "/" + d.getUTCFullYear(); };
  const detalhe = f && <div style={{ overflowX: "auto", background: "var(--surface)", border: "2px solid var(--primary)", borderRadius: 10, margin: "4px 0 10px" }}>
      <div className="ma-cab"><b>{pagaEm(f.referencia) ? "Pagamento de " + pagaEm(f.referencia) + " · " : ""}{nomeMes(f.referencia)}{f.ativo ? "" : " (substituído)"} · {per(f)}</b><button className="btn primary sm" onClick={baixarFin}>⬇ Relatório para o financeiro (PDF)</button><button className="btn sm" onClick={baixarDet}>⬇ Detalhado por O.S.</button></div>
      <table className="ma-tab"><thead><tr><th>Montador</th><th>Conta</th><th className="n">Montagens</th><th className="n">Produtos</th><th className="n">Adicionais</th><th className="n">Total</th><th className="n">Descontos</th><th className="n">A pagar</th><th>Nota fiscal</th></tr></thead>
        <tbody>{itens.map(x => <tr key={x.id || x.nome_exact}><td><b>{x.montador}</b></td><td><small>{x.conta || x.pix_chave ? [x.banco, x.agencia && "ag " + x.agencia, x.conta && "cc " + x.conta, x.pix_chave && "PIX " + x.pix_chave].filter(Boolean).join(" · ") : <span style={{ color: "var(--warn)" }}>sem conta</span>}</small></td><td className="n">{x.montagens}</td><td className="n">{fmtMoeda(Number(x.produtos))}</td><td className="n">{fmtMoeda(Number(x.adicionais))}</td><td className="n">{fmtMoeda(Number(x.total))}</td><td className="n" title={(x.descontos_det || []).map((d: any) => (d.parcela ? d.parcela + " " : "") + d.descricao + ": " + fmtMoeda(Number(d.valor))).join("\n")}>{Number(x.descontos) ? <span style={{ color: "var(--danger)" }}>– {fmtMoeda(Number(x.descontos))}</span> : "—"}</td><td className="n"><b>{fmtMoeda(Number(x.a_pagar ?? x.total))}</b></td>
          <td style={{ minWidth: 170 }}>{f.ativo && f.enviado_fin_em ? (() => { const g = gDe(x); return <NfCelula g={g} nf={nfs.find(n => n.chave === chaveNf(g) && n.de === String(f.de).slice(0, 10) && n.ate === String(f.ate).slice(0, 10)) || null} de={String(f.de).slice(0, 10)} ate={String(f.ate).slice(0, 10)} recNf={recNf} valor={Number(x.a_pagar ?? x.total)} />; })() : <span className="hint">{f.ativo ? "libera depois de enviar ao financeiro" : "fechamento substituído"}</span>}</td></tr>)}
          {!itens.length && <tr><td colSpan={9} className="hint" style={{ padding: 12 }}>Carregando…</td></tr>}</tbody></table>
    </div>;
  return <>
    <div className="card" style={{ padding: 0, overflowX: "auto" }}>
      <table className="ma-tab"><thead><tr><th>Pagamento em</th><th>Referência</th><th>Período</th><th className="n">Montadores</th><th className="n">O.S.</th><th className="n">A pagar</th><th className="n">✅ Aprovado</th><th className="n">⏳ Aguardando</th><th>Fechado por · envio</th><th></th></tr></thead>
        <tbody>{l.map(x => <Fragment key={x.id}><tr className={"ma-lin" + (ab === x.id ? " on" : "")} style={x.ativo ? undefined : { opacity: .55 }} onClick={() => { setItens([]); setAb(ab === x.id ? null : x.id); }}>
          <td><b>{pagaEm(x.referencia) || "—"}</b></td><td>{nomeMes(x.referencia)}{!x.ativo && <span className="pill" style={{ marginLeft: 6 }}>substituído</span>}</td><td>{per(x)}</td><td className="n">{x.n_montadores}</td><td className="n">{x.n_os}</td><td className="n"><b>{fmtMoeda(Number(x.a_pagar ?? x.total))}</b>{Number(x.descontos) ? <div className="hint">desc. {fmtMoeda(Number(x.descontos))}</div> : null}</td><td className="n">{fmtMoeda(Number(x.aprovado))}</td><td className="n">{fmtMoeda(Number(x.aguardando))}</td>
          <td><small>{x.criado_por || ""} · {new Date(x.criado_em).toLocaleString("pt-BR").slice(0, 16)}{x.obs ? " · " + x.obs : ""}{x.substituido_em ? " · substituído em " + new Date(x.substituido_em).toLocaleDateString("pt-BR") : ""}</small>
            {x.ativo && (x.enviado_fin_em ? <div style={{ color: "var(--tn-green-i)", fontSize: 12 }}>📨 enviado ao financeiro {new Date(x.enviado_fin_em).toLocaleDateString("pt-BR")}{x.enviado_fin_por ? " · " + x.enviado_fin_por : ""}</div>
              : podeEnviar ? <button className="btn primary sm" style={{ marginTop: 4 }} onClick={e => { e.stopPropagation(); enviarFin(x); }}>📨 Enviar para o financeiro</button> : null)}</td><td className="g">{ab === x.id ? "fechar ▴" : "ver ›"}</td></tr>
          {ab === x.id && <tr><td colSpan={10} style={{ padding: "0 8px" }}>{detalhe}</td></tr>}</Fragment>)}</tbody></table>
    </div>
  </>;
}

// ordem avulsa para qualquer montador do cadastro (mesmo sem O.S. do Exact no período): tipo, período, valor
function ModalAvulsa({ cadastro, pronto, de, ate, inicial }: any) {
  const { setModal, toast } = useApp() as any;
  const [f, setF] = useState<any>({ chave: "", montador: "", tipo: "servico_loja", descricao: "", de: de || hoje(), ate: ate || hoje(), prod: "", adic: "", status: "aprovado", ...(inicial || {}) });
  const [sal, setSal] = useState(false);
  const opc = cadastro.some((m: any) => m.nome === f.montador) || !f.montador ? cadastro : [{ id: "x", nome: f.montador }, ...cadastro];
  const ir = async () => {
    if (!f.montador) { toast("Selecione o montador"); return; }
    if (!(num(f.prod) + num(f.adic) > 0)) { toast("Informe o valor"); return; }
    if (f.tipo === "outro" && !f.descricao.trim()) { toast("Descreva o serviço"); return; }
    setSal(true);
    try { await salvarAvulsa({ ...f, prod: num(f.prod), adic: num(f.adic) }); toast("Ordem avulsa salva — já está no total do montador"); setModal(null); await pronto(); }
    catch (e: any) { toast(e.message); setSal(false); }
  };
  return <Modal titulo={f.chave ? "Editar ordem avulsa" : "＋ Ordem avulsa para o montador"} onFechar={() => setModal(null)}>
    <div className="field"><label>Montador *</label><select value={f.montador} onChange={e => setF({ ...f, montador: e.target.value })}><option value="">Selecione…</option>{opc.map((m: any) => <option key={m.id} value={m.nome}>{m.nome}</option>)}</select></div>
    <div className="field"><label>Tipo *</label><div className="chips" style={{ margin: 0 }}>{Object.entries(TIPOS_AV).map(([k, l]) => <button key={k} type="button" className={"chip" + (f.tipo === k ? " on" : "")} onClick={() => setF({ ...f, tipo: k })}>{l}</button>)}</div></div>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <div className="field"><label>Período: de *</label><input type="date" value={f.de} onChange={e => setF({ ...f, de: e.target.value, ate: f.ate < e.target.value ? e.target.value : f.ate })} /></div>
      <div className="field"><label>até *</label><input type="date" value={f.ate} min={f.de} onChange={e => setF({ ...f, ate: e.target.value })} /></div>
      <div className="field" style={{ maxWidth: 150 }}><label>Valor (R$) *</label><input inputMode="decimal" value={f.prod} onChange={e => setF({ ...f, prod: e.target.value })} placeholder="0,00" /></div>
    </div>
    <div className="field"><label>Descrição {f.tipo === "outro" ? "*" : "(opcional)"}</label><input value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} placeholder={f.tipo === "frete" ? "Ex.: fretes da quinzena, entrega em Joinville" : f.tipo === "frete_assistencia" ? "Ex.: frete da assistência do cliente X" : f.tipo === "servico_loja" ? "Ex.: montagem do mostruário, ajuste no showroom" : "Descreva o serviço"} /></div>
    <div className="field"><label>Status</label><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="aprovado">✅ Aprovado p/ pagamento</option><option value="aguardando">⏳ Aguardando aprovação</option></select></div>
    <p className="hint" style={{ margin: "6px 0 0" }}>Entra no relatório de pagamento do montador, somada ao total. No filtro do relatório conta pela data final do período.</p>
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button className="btn primary" disabled={sal} onClick={ir}>{sal ? "Salvando…" : "Salvar"}</button><button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button></div>
  </Modal>;
}

function NfCelula({ g, nf, de, ate, recNf, valor }: any) {
  const { toast } = useApp() as any;
  const nome = g.cad?.nome || g.nome, tel = g.cad?.telefone || "";
  const v = r2(valor ?? g.total);
  const p = { chave: chaveNf(g), id: g.cad?.id || null, nome, de, ate, valor: v };
  const href = tel ? linkWhats(tel, msgNf(nome, de, ate, v)) : "";
  const quando = (s: string | null) => s ? new Date(s).toLocaleString("pt-BR").slice(0, 5) : "";
  const ac = async (a: "pedir" | "recebida" | "desfazer") => { try { await nfAcao(a, p); await recNf(); if (a !== "pedir") toast(a === "recebida" ? "Nota recebida ✅" : "Recebimento desfeito"); } catch (e: any) { toast(e.message); } };
  return <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
    {href ? <a className="btn sm" href={href} target="_blank" rel="noopener" onClick={() => ac("pedir")} title={"WhatsApp " + tel}
        style={{ background: "#25a244", borderColor: "#25a244", color: "#fff", fontWeight: 700, textDecoration: "none", alignSelf: "flex-start" }}>📲 {nf?.solicitada_em ? "Pedir NF de novo" : "Pedir nota fiscal"}</a>
      : <span className="hint">sem WhatsApp no cadastro</span>}
    {nf?.solicitada_em && <span style={{ color: "#8a5a00" }}>📨 NF solicitada {quando(nf.solicitada_em)}{nf.solicitada_por ? " · " + nf.solicitada_por : ""}{Number(nf.valor) !== v ? " (valor era " + fmtMoeda(Number(nf.valor)) + ")" : ""}</span>}
    {nf?.recebida_em ? <span style={{ color: "var(--st-concluida)", fontWeight: 700 }}>✅ Nota recebida {quando(nf.recebida_em)}{nf.recebida_por ? " · " + nf.recebida_por : ""} <a href="#" style={{ fontWeight: 400 }} onClick={e => { e.preventDefault(); if (confirm("Desfazer o recebimento da nota de " + nome + "?")) ac("desfazer"); }}>desfazer</a></span>
      : <button className="btn sm" style={{ alignSelf: "flex-start", borderColor: "var(--st-concluida)", color: "var(--st-concluida)", fontWeight: 700 }} onClick={() => ac("recebida")}>✅ Nota recebida</button>}
  </div>;
}
