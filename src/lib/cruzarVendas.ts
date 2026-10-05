// Encontrar vendas: cruza o relatório de vendas do Exact com os clientes do Minha Visita (customers).
// 1º pelo telefone (8 últimos dígitos); 2º pelo endereço (rua + número + cidade), comparando o complemento (bloco/apto/casa).
export type Linha = Record<string, string>;
export type End = { rua: string[]; num: string; cidade: string[]; comp: string; compNums: number[] };
export type Achado = { mv: Linha; como: "telefone" | "venda" | "end_ok" | "end_sem" | "end_dif"; end: End | null; mesmoNome: boolean };
export type ResVenda = { ex: Linha; end: End | null; achados: Achado[]; melhor: Achado | null };

const T = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/'/g, "").replace(/\s+/g, " ").trim();
const TIPOS = new Set(["R", "RUA", "AV", "AVENIDA", "ESTR", "ESTRADA", "ROD", "RODOVIA", "AL", "ALAMEDA", "TV", "TRAV", "TRAVESSA", "PRACA", "PC", "LINHA", "VIELA", "BECO", "LARGO", "VIA", "CONTORNO"]);
const STOP = new Set(["DA", "DE", "DO", "DAS", "DOS", "E", "D"]);
function tokens(s: string, tirarTipo = true) {
  let t: string[] = T(s).match(/[A-Z0-9]+/g) || [];
  if (tirarTipo) while (t.length && TIPOS.has(t[0])) t = t.slice(1);
  return t.filter(x => !STOP.has(x) && !/^BR\d*$/.test(x) && !/^\d+$/.test(x));
}
const numsComp = (s: string) => Array.from(new Set((T(s).match(/\d+/g) || []).map(Number))).sort((a, b) => a - b);
const fazEnd = (rua: string, num: string, cidade: string, comp: string): End => ({ rua: tokens(rua), num: String(Number(num)), cidade: tokens(cidade, false), comp: comp.trim(), compNums: numsComp(comp) });

/** Minha Visita: formato do Google ("R. Roma, 329 - ap 2 - Bairro, Cidade - PR, CEP, Brasil") ou texto livre ("Rua X 75 BL 32 ap 104 Bonfim") */
export function endMv(s: string): End | null {
  s = (s || "").trim(); if (!s) return null;
  let m = s.match(/^(.*?),\s*(\d+)[A-Za-z]?\b(.*)$/);
  if (m) {
    const rua = m[1].split(" - ").pop() || "", rest = m[3];
    const c = rest.match(/,\s*([^,]+?)\s*-\s*[A-Z]{2},/) || rest.match(/,\s*([^,]+?),\s*[A-Z]{2},/) || rest.match(/-\s*([^,-]+?)\s*-\s*[A-Z]{2}(,|$)/);
    const cab = c ? rest.slice(0, c.index) : rest;
    const partes = cab.split(" - ").map(x => x.trim()).filter(Boolean);
    return fazEnd(rua, m[2], c ? c[1] : "", partes.length > 1 ? partes.slice(0, -1).join(" ") : "");
  }
  m = s.match(/^(.*?[A-Za-zÀ-ú.])\s*,?\s+(\d+)[A-Za-z]?\b(.*)$/);
  if (m) return fazEnd(m[1].split(" - ").pop() || "", m[2], "", m[3]);
  return null;
}
/** Exact: "RUA X, 630 - BL 8 APTO 844, BAIRRO - CIDADE" */
export function endEx(s: string): End | null {
  const m = (s || "").trim().match(/^(.*?),\s*(\d+)?[^\s,-]*\s*-\s*(.*),\s*([^,]*?)\s*-\s*([^-]*)$/);
  if (!m || !m[2]) return null;
  return fazEnd(m[1], m[2], m[5], m[3]);
}
const tm = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));
function parecido(A: string[], B: string[], min = 0.6) {
  if (!A.length || !B.length) return false;
  const k = A.filter(a => B.some(b => tm(a, b))).length;
  return A.some(a => a.length >= 4 && B.some(b => tm(a, b))) && k / Math.min(A.length, B.length) >= min;
}
const subconj = (a: number[], b: number[]) => a.every(x => b.includes(x));
/** complemento: confere (mesmos nºs de bloco/apto/casa), diferente, ou sem como comparar */
function comparaComp(a: End, b: End): "end_ok" | "end_sem" | "end_dif" {
  if (!a.compNums.length || !b.compNums.length) return "end_sem";
  return subconj(a.compNums, b.compNums) || subconj(b.compNums, a.compNums) ? "end_ok" : "end_dif";
}
const ORDEM = { telefone: 0, venda: 1, end_ok: 2, end_sem: 3, end_dif: 4 } as const;

const so = (s: string) => (s || "").replace(/\D/g, "");
const chave = (s: string) => { const d = so(s); return d.length >= 8 ? d.slice(-8) : ""; };

/** de que tipo é a planilha, pelo cabeçalho */
export function tipoPlanilha(l: Linha[]): "exact" | "mv" | "" {
  const h = Object.keys(l[0] || {}).map(x => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (h.some(x => ["clientetel1", "situacaovenda", "idpessoacli", "valortotarecebido"].includes(x))) return "exact";
  if (h.some(x => ["celular", "contatode", "ultimocheck"].includes(x))) return "mv";
  return "";
}

export function cruzarVendas(mv: Linha[], ex: Linha[], col: (l: Linha, ...n: string[]) => string): ResVenda[] {
  const porTel: Record<string, Linha[]> = {}, porVenda: Record<string, Linha[]> = {}, porNum: Record<string, { mv: Linha; end: End }[]> = {};
  const endDe = new Map<Linha, End | null>();
  // o mesmo cliente pode vir em mais de uma planilha exportada
  const unicos = new Set<string>();
  mv = mv.filter(c => { const k = [col(c, "Nome"), col(c, "Celular"), col(c, "Endereco", "Endereço")].join("|"); if (unicos.has(k)) return false; unicos.add(k); return true; });
  mv.forEach(c => {
    const k = chave(col(c, "Celular", "Telefone", "Whatsapp")); if (k) (porTel[k] = porTel[k] || []).push(c);
    (col(c, "Nome").match(/\b1\d{6}\b/g) || []).forEach(v => (porVenda[v] = porVenda[v] || []).push(c));
    const e = endMv(col(c, "Endereco", "Endereço")); endDe.set(c, e);
    if (e) (porNum[e.num] = porNum[e.num] || []).push({ mv: c, end: e });
  });
  const vistos = new Set<string>();
  return ex.filter(v => { const id = col(v, "ID", "Venda", "Número"); if (!id) return true; if (vistos.has(id)) return false; vistos.add(id); return true; }).map(v => {
    const achados: Achado[] = [];
    [col(v, "ClienteTel1", "Telefone 1", "Telefone"), col(v, "ClienteTel2", "Telefone 2")].forEach(t => (porTel[chave(t)] || []).forEach(c => { if (!achados.some(a => a.mv === c)) achados.push({ mv: c, como: "telefone", end: endDe.get(c) || null, mesmoNome: false }); }));
    (porVenda[so(col(v, "ID", "Venda", "Número"))] || []).forEach(c => { if (!achados.some(a => a.mv === c)) achados.push({ mv: c, como: "venda", end: endDe.get(c) || null, mesmoNome: false }); });
    const e = endEx(col(v, "Orçamento", "Endereço", "Endereco"));
    if (e) (porNum[e.num] || []).forEach(({ mv: c, end: f }) => {
      if (achados.some(a => a.mv === c)) return;
      if (!parecido(e.rua, f.rua)) return;
      if (e.cidade.length && f.cidade.length && !parecido(e.cidade, f.cidade, 0.5) && !(e.cidade.length === 1 && f.cidade.some(x => tm(x, e.cidade[0])))) return;
      achados.push({ mv: c, como: comparaComp(e, f), end: f, mesmoNome: false });
    });
    const nomeV = tokens(col(v, "Cliente", "Nome"), false);
    achados.forEach(a => { a.mesmoNome = parecido(nomeV, tokens(col(a.mv, "Nome"), false), 0.5); });
    const dt = (c: Linha) => { const m = col(c, "Data de atualização").match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}:\d{2})?/); return m ? m[3] + m[2] + m[1] + (m[4] || "") : ""; };
    achados.sort((a, b) => ORDEM[a.como] - ORDEM[b.como] || Number(b.mesmoNome) - Number(a.mesmoNome) || dt(b.mv).localeCompare(dt(a.mv)));
    return { ex: v, end: e, achados, melhor: achados[0] || null };
  });
}
