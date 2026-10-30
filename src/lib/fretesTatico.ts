// Fretes · romaneios importados do Tático → as meninas lançam km e valores olhando o papel → relatório para o financeiro.
// (Só o Bruno por enquanto — RLS nas tabelas frete_freteiros / frete_tat_rom / frete_descontos / frete_fechamento.)
import { sb } from "./supabase";
import { MOCK } from "./chat";

export type Freteiro = { id: number; apelido: string; nome_tatico: string; cod_transp: string; favorecido: string; agencia: string; conta: string; valor_km: number; ativo: boolean; ordem: number };
export type ItemRom = { venda: string; cliente: string; cidade: string; bairro: string; nf: string; data: string; assist: string; transf: string; km: number | null; valor: number | null; tipo?: string };
export type RomTat = { id: number; mes: string; romaneio: string; cod_transp: string; transportadora: string; freteiro_id: number | null; data: string | null; itens: ItemRom[];
  modo: "linhas" | "total"; km: number | null; valor_entregas: number | null; valor_km: number; total_papel: number | null; obs: string; conferido: boolean };
export type Desconto = { id: number; mes: string; freteiro_id: number; descricao: string; parcela: string; valor: number };

// ---------- leitura do CSV do Tático (Windows-1252, ";" e aspas) ----------
function linhasCsv(txt: string): string[][] {
  const out: string[][] = []; let lin: string[] = [], cel = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cel += '"'; i++; } else q = false; } else cel += ch; continue; }
    if (ch === '"') q = true; else if (ch === ";") { lin.push(cel); cel = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && txt[i + 1] === "\n") i++; lin.push(cel); out.push(lin); lin = []; cel = ""; }
    else cel += ch;
  }
  if (cel || lin.length) { lin.push(cel); out.push(lin); }
  return out;
}
const sem = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const dataIso = (s: string) => { const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };
const tc = (s: string) => String(s || "").trim().replace(/\s+/g, " ");

export type RomLido = { romaneio: string; cod_transp: string; transportadora: string; data: string; itens: ItemRom[] };
export function lerCsvTatico(buf: ArrayBuffer): RomLido[] {
  let txt = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (txt.includes("�")) txt = new TextDecoder("windows-1252").decode(buf);
  const rows = linhasCsv(txt).filter(r => r.some(c => c.trim()));
  const iCab = rows.findIndex(r => r.some(c => sem(c) === "romaneio"));
  if (iCab < 0) throw new Error("Não achei a coluna Romaneio — é o relatório de fretes do Tático?");
  const cab = rows[iCab].map(sem);
  const col = (...nomes: string[]) => cab.findIndex(c => nomes.some(n => c.startsWith(n)));
  const c = { cod: col("codtransp"), tr: col("transportadora"), data: col("data"), rom: col("romaneio"), dest: col("destinatario"), venda: col("venda"), cid: col("cidade"), bai: col("bairro"), nf: col("nronf", "nf"), ass: col("idassist"), trf: col("idtransf") };
  const g = new Map<string, RomLido>();
  for (const r of rows.slice(iCab + 1)) {
    const rom = tc(r[c.rom]); if (!rom || !/^\d+$/.test(rom)) continue;
    const it: ItemRom = { venda: tc(r[c.venda]), cliente: tc(r[c.dest]), cidade: tc(r[c.cid]).replace(/\s*-\s*PR$/i, ""), bairro: tc(r[c.bai]), nf: tc(r[c.nf]), data: dataIso(r[c.data]),
      assist: c.ass >= 0 ? tc(r[c.ass]) : "", transf: c.trf >= 0 ? tc(r[c.trf]) : "", km: null, valor: null };
    let x = g.get(rom);
    if (!x) { x = { romaneio: rom, cod_transp: tc(r[c.cod]), transportadora: tc(r[c.tr]), data: "", itens: [] }; g.set(rom, x); }
    x.itens.push(it);
  }
  for (const x of g.values()) {
    // data do romaneio = a mais frequente nas linhas (algumas vêm de outro dia)
    const cont = new Map<string, number>(); x.itens.forEach(i => i.data && cont.set(i.data, (cont.get(i.data) || 0) + 1));
    x.data = Array.from(cont.entries()).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] || "";
  }
  return Array.from(g.values()).sort((a, b) => a.romaneio.localeCompare(b.romaneio));
}
export const casarFreteiro = (fr: Freteiro[], cod: string, nome: string) =>
  fr.find(f => f.cod_transp && f.cod_transp === cod) || fr.find(f => sem(f.nome_tatico) && sem(f.nome_tatico) === sem(nome)) || null;

// ---------- contas ----------
export function contaRom(r: RomTat) {
  const km = r.modo === "linhas" ? r.itens.reduce((s, i) => s + (Number(i.km) || 0), 0) : Number(r.km) || 0;
  const ent = r.modo === "linhas" ? r.itens.reduce((s, i) => s + (Number(i.valor) || 0), 0) : Number(r.valor_entregas) || 0;
  const vKm = km * (Number(r.valor_km) || 0);
  const total = ent + vKm;
  const lancado = r.modo === "linhas" ? r.itens.some(i => i.valor != null || i.km != null) : r.km != null || r.valor_entregas != null;
  const semValor = r.modo === "linhas" ? r.itens.filter(i => i.valor == null).length : 0;
  return { km, ent, vKm, total, lancado, semValor, difPapel: r.total_papel != null ? Math.round((Number(r.total_papel) - total) * 100) / 100 : null };
}
/** avisos para a conferência */
export function avisosRom(r: RomTat, todos: RomTat[]): string[] {
  const a: string[] = []; const v = new Map<string, number>(); const nfs = new Map<string, Set<string>>();
  for (const i of r.itens) if (i.venda) v.set(i.venda + "|" + sem(i.cliente), (v.get(i.venda + "|" + sem(i.cliente)) || 0) + 1);
  const dupl = Array.from(v.entries()).filter(([, n]) => n > 1).map(([k]) => r.itens.find(i => i.venda + "|" + sem(i.cliente) === k)!.cliente.split(" ")[0]);
  if (dupl.length) a.push("Mesmo cliente com 2 notas: " + dupl.join(", "));
  for (const x of todos) for (const i of x.itens) if (i.nf) { const s = nfs.get(i.nf) || new Set(); s.add(sem(i.cliente)); nfs.set(i.nf, s); }
  const nfRep = r.itens.filter(i => i.nf && (nfs.get(i.nf)?.size || 0) > 1).map(i => i.nf);
  if (nfRep.length) a.push("NF em mais de um cliente: " + Array.from(new Set(nfRep)).join(", "));
  if (r.itens.some(i => i.assist)) a.push("Assistência");
  if (r.itens.some(i => i.transf)) a.push("Transferência p/ loja");
  if (r.itens.some(i => i.data && r.data && i.data !== r.data)) a.push("Linhas com outra data");
  if (r.itens.length === 1 && !ehManual(r)) a.push("Romaneio de 1 entrega");
  return a;
}

// ---------- simulação local ----------
let mf: Freteiro[] = [
  ["BRUNO", "BRUNO VINICIUS FARIAS", "207866", "BRUNO VINICIUS FARIAS", "0993", "01-014741-9"], ["CARLOS ADEMIR", "CARLOS ADEMIR DA SILVA", "", "CARLOS ADEMIR DA SILVA", "0993", "01-005349-3"],
  ["EDUARDO", "EDUARDO T. CASSILHAS", "", "EDUARDO T. CASSILHAS", "0950", "01-017332-1"], ["ELISEU", "ELISEU SPOGNOLLO", "", "ELISEU SPOGNOLLO", "0950", "01-017223-4"],
  ["FARIAS", "ADOLAR FARIAS JUNIOR", "", "ADOLAR FARIAS JUNIOR", "0968", "13003668-8"], ["JOSÉ ELIAS", "JOSE ELIAS DA SILVA", "", "JOSE ELIAS DA SILVA", "3945", "2004367-5"],
  ["MAURO", "MAURO LUIZ CASSILHAS", "", "MAURO LUIZ CASSILHAS", "2190", "01-026409-6"], ["VALDIR", "JOSE VALDIR DE SOUZA", "", "JOSE VALDIR DE SOUZA", "0810", "01-029467-0"],
  ["WEVERTON", "WEVERTON", "", "JULIANE CRISTINA DOS SANTOS", "0814", "13001958-6"]].map((x, i) => ({ id: i + 1, apelido: x[0], nome_tatico: x[1], cod_transp: x[2], favorecido: x[3], agencia: x[4], conta: x[5], valor_km: 3, ativo: true, ordem: i + 1 }));
let mr: RomTat[] = []; let md: Desconto[] = []; let mfe: Record<string, string> = {};
const num = (x: any) => x == null ? null : Number(x);

export async function carregar(mes: string) {
  if (MOCK) return { fr: mf.map(x => ({ ...x })), rom: mr.filter(r => r.mes === mes).map(r => ({ ...r, itens: r.itens.map(i => ({ ...i })) })), desc: md.filter(d => d.mes === mes), pagto: mfe[mes] || "" };
  const [a, b, c, d] = await Promise.all([
    sb.from("frete_freteiros").select("*").order("ordem").order("apelido"),
    sb.from("frete_tat_rom").select("*").eq("mes", mes).order("data").order("romaneio"),
    sb.from("frete_descontos").select("*").eq("mes", mes).order("id"),
    sb.from("frete_fechamento").select("*").eq("mes", mes).maybeSingle(),
  ]);
  for (const x of [a, b, c, d]) if (x.error) throw new Error(x.error.message);
  return {
    fr: (a.data || []).map((x: any) => ({ ...x, valor_km: Number(x.valor_km) })) as Freteiro[],
    rom: (b.data || []).map((x: any) => ({ ...x, km: num(x.km), valor_entregas: num(x.valor_entregas), valor_km: Number(x.valor_km), total_papel: num(x.total_papel) })) as RomTat[],
    desc: (c.data || []).map((x: any) => ({ ...x, valor: Number(x.valor) })) as Desconto[],
    pagto: (d.data as any)?.data_pagamento || "",
  };
}
/** grava os romaneios lidos; os que já existem só atualizam a lista de clientes (km e valores digitados ficam) */
export async function importar(lidos: RomLido[], fr: Freteiro[], uid: string): Promise<{ novos: number; atual: number; semFreteiro: string[] }> {
  let novos = 0, atual = 0; const semF = new Set<string>();
  const exist = MOCK ? mr : (((await sb.from("frete_tat_rom").select("id,romaneio,itens").in("romaneio", lidos.map(l => l.romaneio))).data) || []) as any[];
  for (const l of lidos) {
    const f = casarFreteiro(fr, l.cod_transp, l.transportadora); if (!f) semF.add(l.transportadora);
    const ex = exist.find((e: any) => e.romaneio === l.romaneio);
    const base = { mes: l.data.slice(0, 7), cod_transp: l.cod_transp, transportadora: l.transportadora, data: l.data || null, freteiro_id: f?.id ?? null };
    if (ex) {
      // mantém o que já foi digitado em cada linha (casando por NF + cliente)
      const velhos: ItemRom[] = ex.itens || [];
      const itens = l.itens.map(i => { const o = velhos.find(v => v.nf === i.nf && sem(v.cliente) === sem(i.cliente)); return o ? { ...i, km: o.km, valor: o.valor } : i; });
      if (MOCK) mr = mr.map(r => r.id === ex.id ? { ...r, ...base, itens } : r);
      else { const r = await sb.from("frete_tat_rom").update({ ...base, itens, atualizado_em: new Date().toISOString(), atualizado_por: uid }).eq("id", ex.id); if (r.error) throw new Error(r.error.message); }
      atual++;
    } else {
      const novo = { ...base, romaneio: l.romaneio, itens: l.itens, modo: "linhas", valor_km: f?.valor_km ?? 3, atualizado_por: uid };
      if (MOCK) mr.push({ id: Date.now() + novos, km: null, valor_entregas: null, total_papel: null, obs: "", conferido: false, ...novo } as any);
      else { const r = await sb.from("frete_tat_rom").insert(novo); if (r.error) throw new Error(r.error.message); }
      novos++;
    }
  }
  return { novos, atual, semFreteiro: Array.from(semF) };
}
export async function salvarRom(id: number, p: Partial<RomTat>, uid: string) {
  if (MOCK) { mr = mr.map(r => r.id === id ? { ...r, ...p } : r); return; }
  const r = await sb.from("frete_tat_rom").update({ ...p, atualizado_em: new Date().toISOString(), atualizado_por: uid }).eq("id", id); if (r.error) throw new Error(r.error.message);
}
export async function apagarRom(id: number) {
  if (MOCK) { mr = mr.filter(r => r.id !== id); return; }
  const r = await sb.from("frete_tat_rom").delete().eq("id", id); if (r.error) throw new Error(r.error.message);
}
export async function salvarFreteiro(f: Partial<Freteiro>) {
  if (MOCK) { if (f.id) mf = mf.map(x => x.id === f.id ? { ...x, ...f } : x); else mf.push({ id: Date.now(), apelido: "", nome_tatico: "", cod_transp: "", favorecido: "", agencia: "", conta: "", valor_km: 3, ativo: true, ordem: 99, ...f } as Freteiro); return; }
  const { id, ...p } = f;
  const r = id ? await sb.from("frete_freteiros").update(p).eq("id", id) : await sb.from("frete_freteiros").insert(p); if (r.error) throw new Error(r.error.message);
}
export async function criarDesconto(d: Omit<Desconto, "id">) {
  if (MOCK) { md.push({ ...d, id: Date.now() }); return; }
  const r = await sb.from("frete_descontos").insert(d); if (r.error) throw new Error(r.error.message);
}
export async function apagarDesconto(id: number) {
  if (MOCK) { md = md.filter(d => d.id !== id); return; }
  const r = await sb.from("frete_descontos").delete().eq("id", id); if (r.error) throw new Error(r.error.message);
}
/** parcelas "2/5" que continuam no mês seguinte (3/5) — copia para o mês informado as que ainda não foram copiadas */
export async function trazerParcelas(mesAnt: string, mes: string): Promise<number> {
  const ant = MOCK ? md.filter(d => d.mes === mesAnt) : (((await sb.from("frete_descontos").select("*").eq("mes", mesAnt)).data) || []) as Desconto[];
  const ja = MOCK ? md.filter(d => d.mes === mes) : (((await sb.from("frete_descontos").select("*").eq("mes", mes)).data) || []) as Desconto[];
  let n = 0;
  for (const d of ant) {
    const m = String(d.parcela).match(/^(\d+)\s*\/\s*(\d+)$/); if (!m || +m[1] >= +m[2]) continue;
    const parcela = (+m[1] + 1) + "/" + m[2];
    if (ja.some(x => x.freteiro_id === d.freteiro_id && x.descricao === d.descricao && x.parcela === parcela)) continue;
    await criarDesconto({ mes, freteiro_id: d.freteiro_id, descricao: d.descricao, parcela, valor: Number(d.valor) }); n++;
  }
  return n;
}
export async function salvarPagto(mes: string, data: string) {
  if (MOCK) { mfe[mes] = data; return; }
  const r = await sb.from("frete_fechamento").upsert({ mes, data_pagamento: data || null, atualizado_em: new Date().toISOString() }); if (r.error) throw new Error(r.error.message);
}

// ---------- romaneio manual (não vem no relatório do Tático) ----------
export const TIPOS_MANUAL = ["Entrega", "Recolha", "Retorno"];
export const ehManual = (r: { cod_transp: string }) => r.cod_transp === "MANUAL";
export const numRom = (r: RomTat) => ehManual(r) ? r.romaneio.replace(/^M/, "") + " (manual)" : r.romaneio;
export async function criarManual(fr: Freteiro, numero: string, data: string, linhas: { tipo: string; cliente: string; km: number | null; valor: number | null }[], uid: string) {
  const romaneio = "M" + numero.trim();
  const itens: ItemRom[] = linhas.map(l => ({ venda: "", cliente: l.cliente, cidade: "", bairro: "", nf: "", data, assist: "", transf: "", km: l.km, valor: l.valor, tipo: l.tipo }));
  const novo = { mes: data.slice(0, 7), romaneio, cod_transp: "MANUAL", transportadora: "Romaneio manual", freteiro_id: fr.id, data, itens, modo: "linhas", valor_km: fr.valor_km ?? 3, atualizado_por: uid };
  if (MOCK) { if (mr.some(r => r.romaneio === romaneio)) throw new Error("O romaneio manual " + numero + " já foi lançado."); mr.push({ id: Date.now(), km: null, valor_entregas: null, total_papel: null, obs: "", conferido: false, ...novo } as any); return; }
  const r = await sb.from("frete_tat_rom").insert(novo);
  if (r.error) throw new Error(/duplicate|unique/i.test(r.error.message) ? "O romaneio manual " + numero + " já foi lançado." : r.error.message);
}
