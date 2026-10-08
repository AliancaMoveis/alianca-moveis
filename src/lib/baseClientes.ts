// Base de clientes (Tático + Exact): cadastro único por CPF/CNPJ e histórico de vendas.
// O banco confere quem pode ler/editar (Gestão, call center, supervisão) e só a Gestão importa.
import { sb } from "./supabase";
import { lerXlsx } from "./planilha";

const MOCK = !!(import.meta as any).env?.VITE_MOCK;
async function rpc<T = any>(fn: string, args: Record<string, any> = {}): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message || "Não foi possível concluir a ação");
  return data as T;
}

export const soDig = (v: any) => String(v ?? "").replace(/\D/g, "");
export function fmtDoc(v: string) {
  const d = soDig(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v || "";
}
export function fmtTel(v: string) {
  const d = soDig(v);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return v || "";
}
/** confere os dígitos verificadores do CPF (11) ou CNPJ (14) */
export function docValido(v: string) {
  const d = soDig(v);
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return false;
    const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return false;
    const dv = (n: number) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * p[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
  }
  return false;
}
export const enderecoTxt = (c: any) => [[c.logradouro, c.numero].filter(Boolean).join(", "), c.complemento, c.bairro, [c.cidade, c.uf].filter(Boolean).join("/")].filter(Boolean).join(" - ");

// ---------- dados de exemplo (modo mock) ----------
const MOCK_CLI: any[] = [
  { id: "bc1", cpf_cnpj: "78778932807", nome: "MARIA EXEMPLO DA SILVA", telefone1: "41999990001", telefone2: "", logradouro: "RUA DAS FLORES", numero: "100", complemento: "CASA", bairro: "CENTRO", cidade: "CURITIBA", uf: "PR", cod_tatico: "1001", observacao: "", origem: "exemplo", editado_manual: [], atualizado_em: new Date().toISOString(), atualizado_por: "" },
  { id: "bc2", cpf_cnpj: "23097215140", nome: "JOÃO TESTE PEREIRA", telefone1: "41988880002", telefone2: "4133330002", logradouro: "AV. BRASIL", numero: "2000", complemento: "", bairro: "PORTÃO", cidade: "CURITIBA", uf: "PR", cod_tatico: "1002", observacao: "", origem: "exemplo", editado_manual: [], atualizado_em: new Date().toISOString(), atualizado_por: "" },
];
const MOCK_VEN: any[] = [
  { id: "v1", cliente_id: "bc1", num_venda: "1287169", data_venda: "2026-07-09T12:32:00Z", situacao: "Efetivada", vendedor: "VALDINETE CHAGAS", valor_total: 6776.9, desconto: 0, valor_recebido: 4130 },
  { id: "v2", cliente_id: "bc1", num_venda: "1301010", data_venda: "2026-09-02T15:00:00Z", situacao: "Efetivada", vendedor: "ROY", valor_total: 12500, desconto: 500, valor_recebido: 12000 },
  { id: "v3", cliente_id: "bc2", num_venda: "1305711", data_venda: "2026-09-13T11:20:00Z", situacao: "Efetivada", vendedor: "GIOVANNA", valor_total: 1617, desconto: 0, valor_recebido: 559 },
];

export const BC = {
  async buscar(q: string): Promise<any[]> {
    if (MOCK) { const d = soDig(q), t = q.trim().toLowerCase(); return MOCK_CLI.filter(c => (d.length >= 3 && (c.cpf_cnpj.startsWith(d) || c.telefone1.endsWith(d) || c.telefone2.endsWith(d))) || (!d && t.length >= 3 && c.nome.toLowerCase().includes(t)))
      .map(c => ({ ...c, compras: MOCK_VEN.filter(v => v.cliente_id === c.id).length, ultima: MOCK_VEN.filter(v => v.cliente_id === c.id).map(v => v.data_venda).sort().pop() || null })); }
    return (await rpc<any[]>("base_clientes_buscar", { p_q: q })) || [];
  },
  async ficha(id: string): Promise<{ cliente: any; vendas: any[] }> {
    if (MOCK) return { cliente: MOCK_CLI.find(c => c.id === id), vendas: MOCK_VEN.filter(v => v.cliente_id === id).sort((a, b) => String(b.data_venda).localeCompare(String(a.data_venda))) };
    const [c, v] = await Promise.all([
      sb.from("base_clientes").select("*").eq("id", id).maybeSingle(),
      sb.from("base_clientes_vendas").select("*").eq("cliente_id", id).order("data_venda", { ascending: false, nullsFirst: false }),
    ]);
    if (c.error) throw new Error(c.error.message); if (v.error) throw new Error(v.error.message);
    return { cliente: c.data, vendas: v.data || [] };
  },
  async salvar(p: any): Promise<string> {
    if (MOCK) { if (p.id) Object.assign(MOCK_CLI.find(c => c.id === p.id) || {}, p); else MOCK_CLI.push({ ...p, id: "bc" + (MOCK_CLI.length + 1), editado_manual: [] }); return p.id || "bc" + MOCK_CLI.length; }
    return rpc<string>("base_cliente_salvar", { p });
  },
  /** só o cadastro (sem vendedor e sem valores) + quantas compras e a data da última — usado ao abrir solicitação */
  async porDoc(doc: string): Promise<any | null> {
    if (MOCK) { const c = MOCK_CLI.find(x => x.cpf_cnpj === soDig(doc)); if (!c) return null; const vs = MOCK_VEN.filter(v => v.cliente_id === c.id);
      return { nome: c.nome, telefone1: c.telefone1, telefone2: c.telefone2, logradouro: c.logradouro, numero: c.numero, complemento: c.complemento, bairro: c.bairro, cidade: c.cidade, uf: c.uf, compras: vs.length, ultimaCompra: vs.map(v => v.data_venda).sort().pop() || null }; }
    return rpc("base_cliente_por_doc", { p_doc: doc });
  },
  async importar(clientes: any[], vendas: any[]): Promise<any> {
    if (MOCK) return { clientesNovos: clientes.length, clientesAtualizados: 0, invalidos: 0, vendas: vendas.length, vendasNovas: vendas.length, vendasSemCliente: 0 };
    return rpc("base_clientes_importar", { p_clientes: clientes, p_vendas: vendas });
  },
};

// ---------- leitura do arquivo de importação ----------
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
function pega(l: Record<string, string>, ...nomes: string[]) {
  const ks = Object.keys(l); for (const n of nomes) { const k = ks.find(x => norm(x) === norm(n)); if (k && l[k] !== "") return l[k]; } return "";
}
/** data de planilha (nº de série do Excel, "AAAA-MM-DD HH:MM" ou "DD/MM/AAAA HH:MM") → "AAAA-MM-DDTHH:MM" */
export function dataImport(v: string): string {
  const s = String(v || "").trim(); if (!s) return "";
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); const d = new Date(Math.round((n - 25569) * 864e5)); return d.toISOString().slice(0, 16); }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4] || "00"}:${m[5] || "00"}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})(?:\s+(\d{2}):(\d{2}))?/); if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2]}-${m[1]}T${m[4] || "00"}:${m[5] || "00"}`;
  return "";
}
const num = (v: string) => { const s = String(v || "").trim(); if (!s) return ""; if (/^-?\d+(\.\d+)?$/.test(s)) return s; const n = parseFloat(s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")); return isNaN(n) ? "" : String(n); };

function linhaCliente(l: Record<string, string>) {
  return { cpf_cnpj: pega(l, "CPF/CNPJ", "cpf_cnpj", "CPF", "CNPJ"), nome: pega(l, "Nome", "nome", "Cliente"), telefone1: pega(l, "Telefone 1", "telefone1", "Telefone"), telefone2: pega(l, "Telefone 2", "telefone2"),
    logradouro: pega(l, "Logradouro", "logradouro", "Rua", "Endereço"), numero: pega(l, "Número", "numero", "Nº"), complemento: pega(l, "Complemento", "complemento"), bairro: pega(l, "Bairro", "bairro"),
    cidade: pega(l, "Cidade", "cidade"), uf: pega(l, "UF", "uf", "Estado"), cod_tatico: pega(l, "Cód. Cliente Tático", "cod_cliente_tatico", "Código Cliente", "cod_tatico") };
}
function linhaVenda(l: Record<string, string>) {
  return { num_venda: pega(l, "Nº Venda", "num_venda", "Número da venda", "Venda", "ultimo_num_venda"), cpf_cnpj: pega(l, "CPF/CNPJ", "cpf_cnpj", "CPF"), data_venda: dataImport(pega(l, "Data Situação", "Data da venda", "data_venda", "Incluída em", "ultima_compra")),
    situacao: pega(l, "Situação Venda", "Situação", "situacao"), vendedor: pega(l, "Vendedor", "vendedor", "ultimo_vendedor"),
    valor_total: num(pega(l, "Valor Total", "valor_total", "valor_total_comprado")), desconto: num(pega(l, "Desconto", "desconto")), valor_recebido: num(pega(l, "Valor Recebido", "valor_recebido", "valor_recebido_total")),
    endereco: pega(l, "Endereço completo", "endereco_completo") };
}
function lerCsv(txt: string): Record<string, string>[] {
  const linhas: string[][] = []; let cel = "", lin: string[] = [], q = false;
  const sep = (txt.split("\n")[0].match(/;/g) || []).length > (txt.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cel += '"'; i++; } else q = false; } else cel += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { lin.push(cel); cel = ""; }
    else if (ch === "\n") { lin.push(cel.replace(/\r$/, "")); linhas.push(lin); lin = []; cel = ""; } else cel += ch;
  }
  if (cel || lin.length) { lin.push(cel); linhas.push(lin); }
  const cab = (linhas.shift() || []).map(h => h.replace(/^﻿/, "").trim());
  return linhas.filter(l => l.some(x => x.trim())).map(l => Object.fromEntries(cab.map((h, i) => [h, (l[i] ?? "").trim()])));
}
/** .xlsx com as abas "Base de Clientes" e "Vendas + CPF" (cruzamento Tático/Exact) ou .csv só de clientes */
export async function lerArquivoBase(arq: File): Promise<{ clientes: any[]; vendas: any[] }> {
  if (/\.csv$/i.test(arq.name)) {
    // csv: só o cadastro dos clientes (o histórico de vendas vem pela planilha .xlsx, aba "Vendas + CPF")
    return { clientes: lerCsv(await arq.text()).map(linhaCliente), vendas: [] };
  }
  let cl = await lerXlsx(arq, /base de clientes|clientes/i);
  const ve = await lerXlsx(arq, /vendas \+ cpf|^vendas$/i);
  if (!cl.length && !ve.length) cl = await lerXlsx(arq);
  const temCab = (l: any[], ...c: string[]) => l.length > 0 && c.some(x => Object.keys(l[0]).some(k => norm(k) === norm(x)));
  if (!temCab(cl, "CPF/CNPJ", "cpf_cnpj")) throw new Error("Não achei a coluna CPF/CNPJ na aba de clientes");
  return { clientes: cl.map(linhaCliente), vendas: temCab(ve, "Nº Venda", "num_venda") ? ve.map(linhaVenda) : [] };
}
