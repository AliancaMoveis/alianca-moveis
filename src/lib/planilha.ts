// Leitura de planilha .xlsx no navegador (sem biblioteca extra: o .xlsx é um zip de XML)
import JSZip from "jszip";

const colNum = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const texto = (el: Element | null) => (el ? Array.from(el.getElementsByTagName("t")).map(t => t.textContent || "").join("") : "");

/** Primeira aba da planilha como lista de objetos { cabeçalho: valor } (tudo em texto). */
export async function lerXlsx(arq: File): Promise<Record<string, string>[]> {
  const zip = await JSZip.loadAsync(arq);
  const xml = async (p: string) => { const f = zip.file(p); return f ? new DOMParser().parseFromString(await f.async("string"), "application/xml") : null; };
  const ss = await xml("xl/sharedStrings.xml");
  const comp = ss ? Array.from(ss.getElementsByTagName("si")).map(si => texto(si)) : [];
  // primeira aba: workbook → rels → arquivo
  let caminho = "xl/worksheets/sheet1.xml";
  const wb = await xml("xl/workbook.xml"), rels = await xml("xl/_rels/workbook.xml.rels");
  const s1 = wb?.getElementsByTagName("sheet")[0];
  const rid = s1?.getAttribute("r:id") || s1?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  if (rid && rels) {
    const r = Array.from(rels.getElementsByTagName("Relationship")).find(x => x.getAttribute("Id") === rid);
    const alvo = r?.getAttribute("Target"); if (alvo) caminho = alvo.startsWith("/") ? alvo.slice(1) : "xl/" + alvo.replace(/^\.\//, "");
  }
  const sh = await xml(caminho);
  if (!sh) throw new Error("Não encontrei a aba da planilha");
  const linhas: string[][] = [];
  for (const row of Array.from(sh.getElementsByTagName("row"))) {
    const l: string[] = [];
    for (const c of Array.from(row.getElementsByTagName("c"))) {
      const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      const val = t === "s" ? (v === "" ? "" : comp[Number(v)] ?? "") : t === "inlineStr" ? texto(c.getElementsByTagName("is")[0]) : v;
      l[colNum(c.getAttribute("r") || "A")] = (val || "").trim();
    }
    linhas.push(Array.from(l, x => x ?? ""));
  }
  const cab = (linhas.shift() || []).map(h => h.trim());
  return linhas.filter(l => l.some(x => x)).map(l => Object.fromEntries(cab.map((h, i) => [h, l[i] ?? ""])));
}

/** "25/05/24", "25/05/2024", "25/05/24 14:30" ou nº de série do Excel → "AAAA-MM-DD" (+ "THH:MM" se houver hora) */
export function dataPlanilha(v: string): string {
  const s = (v || "").trim(); if (!s) return "";
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s); if (n < 20000 || n > 80000) return "";
    const d = new Date(Math.round((n - 25569) * 864e5)); const iso = d.toISOString();
    return n % 1 ? iso.slice(0, 16) : iso.slice(0, 10);
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return "";
  const ano = m[3].length === 2 ? "20" + m[3] : m[3];
  const d = `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return m[4] ? `${d}T${m[4].padStart(2, "0")}:${m[5]}` : d;
}
