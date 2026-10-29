// RH · Folha ponto — PDF no navegador e guarda no banco. Só o Bruno e a Patrícia (RH) — RLS _eh_rh() confere o mesmo no banco.
import { sb } from "./supabase";
import type { Cartao, DiaPonto, Item } from "./pontoParse";
export { parseCartao, minutos, hm, type Item, type Cartao, type DiaPonto } from "./pontoParse";

export const PODE_RH = ["00000000-0000-4000-a000-000000000007", "7443a59e-91ae-4428-baa4-aa159f0bdf0b"];
export const podeRh = (uid: string) => PODE_RH.includes(uid);

/** Lê o PDF no navegador (pdf.js) e devolve os pedaços de texto por página. */
export async function pdfParaItens(buf: ArrayBuffer): Promise<Item[][]> {
  const pdfjs: any = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url" as any)).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pags: Item[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pags.push(tc.items.map((i: any) => ({ str: i.str, x: i.transform[4], y: i.transform[5] })));
  }
  return pags;
}

// ---------- banco ----------
export type CartaoDb = { id: number; cpf: string; nome: string; departamento: string; funcao: string; admissao: string | null; periodo_de: string; periodo_ate: string; emitido_em: string; tot_ex50: number; tot_ex100: number; tot_faltas: number; arquivo: string; criado_em: string };
export async function listarCartoes(): Promise<{ cartoes: CartaoDb[]; dias: (DiaPonto & { cartao_id: number })[] }> {
  const a = await sb.from("rh_ponto_cartoes").select("*").order("nome");
  if (a.error) throw new Error(a.error.message);
  const dias: any[] = [];
  for (let i = 0; ; i += 1000) {
    const b = await sb.from("rh_ponto_dias").select("cartao_id,data,rotulo,batidas,trabalhado,ex50,ex100,faltas,folga,feriado").order("data").range(i, i + 999);
    if (b.error) throw new Error(b.error.message);
    dias.push(...(b.data || [])); if (!b.data || b.data.length < 1000) break;
  }
  return { cartoes: (a.data || []) as any, dias };
}
export async function guardarCartao(c: Cartao, arquivo: string, uid: string): Promise<"novo" | "atualizado"> {
  const ex = await sb.from("rh_ponto_cartoes").select("id").eq("cpf", c.cpf).eq("periodo_de", c.periodo_de).eq("periodo_ate", c.periodo_ate).maybeSingle();
  if (ex.error) throw new Error(ex.error.message);
  const base = { cpf: c.cpf, nome: c.nome, departamento: c.departamento, funcao: c.funcao, admissao: c.admissao, periodo_de: c.periodo_de, periodo_ate: c.periodo_ate, emitido_em: c.emitido_em, tot_ex50: c.tot_ex50, tot_ex100: c.tot_ex100, tot_faltas: c.tot_faltas, arquivo, criado_por: uid };
  let id = (ex.data as any)?.id as number | undefined;
  if (id) { const u = await sb.from("rh_ponto_cartoes").update(base).eq("id", id); if (u.error) throw new Error(u.error.message); const d = await sb.from("rh_ponto_dias").delete().eq("cartao_id", id); if (d.error) throw new Error(d.error.message); }
  else { const n = await sb.from("rh_ponto_cartoes").insert(base).select("id").single(); if (n.error) throw new Error(n.error.message); id = (n.data as any).id; }
  const linhas = c.dias.map(d => ({ cartao_id: id, data: d.data, rotulo: d.rotulo, batidas: d.batidas, trabalhado: d.trabalhado, ex50: d.ex50, ex100: d.ex100, faltas: d.faltas, folga: d.folga, feriado: d.feriado }));
  for (let i = 0; i < linhas.length; i += 500) { const r = await sb.from("rh_ponto_dias").insert(linhas.slice(i, i + 500)); if (r.error) throw new Error(r.error.message); }
  return ex.data ? "atualizado" : "novo";
}
export async function apagarCartao(id: number) { const r = await sb.from("rh_ponto_cartoes").delete().eq("id", id); if (r.error) throw new Error(r.error.message); }
