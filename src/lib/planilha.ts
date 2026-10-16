// Leitura de planilha .xlsx no navegador (sem biblioteca extra: o .xlsx é um zip de XML)
import JSZip from "jszip";

const colNum = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const texto = (el: Element | null) => (el ? Array.from(el.getElementsByTagName("t")).map(t => t.textContent || "").join("") : "");

/** Primeira aba da planilha como lista de objetos { cabeçalho: valor } (tudo em texto). */
export async function lerXlsx(arq: File, aba?: string | RegExp): Promise<Record<string, string>[]> {
  const zip = await JSZip.loadAsync(arq);
  const xml = async (p: string) => { const f = zip.file(p); return f ? new DOMParser().parseFromString(await f.async("string"), "application/xml") : null; };
  const ss = await xml("xl/sharedStrings.xml");
  const comp = ss ? Array.from(ss.getElementsByTagName("si")).map(si => texto(si)) : [];
  // primeira aba: workbook → rels → arquivo
  let caminho = "xl/worksheets/sheet1.xml";
  const wb = await xml("xl/workbook.xml"), rels = await xml("xl/_rels/workbook.xml.rels");
  const abas = wb ? Array.from(wb.getElementsByTagName("sheet")) : [];
  const s1 = aba ? abas.find(x => { const n = x.getAttribute("name") || ""; return typeof aba === "string" ? n.trim().toLowerCase() === aba.toLowerCase() : aba.test(n); }) : abas[0];
  if (aba && !s1) return [];
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
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,?\s*(\d{1,2}):(\d{2}))?/);
  if (!m) return "";
  const ano = m[3].length === 2 ? "20" + m[3] : m[3];
  const d = `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return m[4] ? `${d}T${m[4].padStart(2, "0")}:${m[5]}` : d;
}

/** "11/09/26, 15:00, 20/10/26, 09:00" → todas as datas ("AAAA-MM-DDTHH:MM"), em ordem.
 *  Várias datas = atendimento em dias distintos (todas valem, inclusive as que já passaram). Dois horários no mesmo dia = o primeiro. */
export function datasPlanilha(v: string, _hojeIso?: string): string[] {
  const s = (v || "").trim(); if (!s) return [];
  const out: string[] = [];
  const re = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,?\s*(\d{1,2}):(\d{2}))?/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const ano = m[3].length === 2 ? "20" + m[3] : m[3];
    out.push(`${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${m[4] ? m[4].padStart(2, "0") + ":" + m[5] : "00:00"}`);
  }
  if (!out.length) { const d = dataPlanilha(s); return d ? [d.length > 10 ? d : d + "T00:00"] : []; }
  const ord = Array.from(new Set(out)).sort();
  return ord.filter((d, i) => !ord.slice(0, i).some(x => x.slice(0, 10) === d.slice(0, 10)));
}

/** Datas + coluna "Agenda" (projetista que atende). Vários nomes ("Cleberson, Rafael") = um por data, na ordem;
 *  se houver menos nomes que datas, as datas que sobram ficam com o último nome. Volta em ordem de data, um por dia. */
export function agendaPlanilha(datas: string, agenda: string): { data: string; projetista: string }[] {
  const s = (datas || "").trim(); if (!s) return [];
  const brutas: string[] = [];
  const re = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,?\s*(\d{1,2}):(\d{2}))?/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) brutas.push(m[0]);
  const lista = brutas.length ? brutas.map(b => datasPlanilha(b)[0]).filter(Boolean) : datasPlanilha(s);
  const nomes = String(agenda || "").split(/[,;/]+/).map(x => x.trim()).filter(Boolean);
  const pares = lista.map((d, i) => ({ data: d, projetista: nomes[i] ?? nomes[nomes.length - 1] ?? "" })).sort((a, b) => a.data.localeCompare(b.data));
  return pares.filter((p, i) => !pares.slice(0, i).some(x => x.data.slice(0, 10) === p.data.slice(0, 10)));
}

/** Gera e baixa um .xlsx simples (1 aba, texto e números), sem biblioteca extra */
export async function baixarXlsx(nome: string, cab: string[], linhas: (string | number | null | undefined)[][], aba = "Planilha") {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const letra = (i: number) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const cel = (v: any, r: number, c: number) => {
    const ref = letra(c) + r;
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${r === 1 ? ' s="1"' : ""}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
  };
  const rows = [cab, ...linhas].map((l, i) => `<row r="${i + 1}">${l.map((v, j) => cel(v, i + 1, j)).join("")}</row>`).join("");
  const largura = cab.map((h, j) => Math.min(60, Math.max(10, h.length + 2, ...linhas.slice(0, 300).map(l => String(l[j] ?? "").length + 2))));
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(aba.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${largura.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${rows}</sheetData><autoFilter ref="A1:${letra(cab.length - 1)}${linhas.length + 1}"/></worksheet>`);
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = nome.endsWith(".xlsx") ? nome : nome + ".xlsx"; el.click(); setTimeout(() => URL.revokeObjectURL(el.href), 3000);
}
