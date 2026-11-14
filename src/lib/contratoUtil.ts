// Contrato com assinatura online: QR Code, imagens embutidas (comprimidas) e PDF de imagens virando figuras.
import qrcode from "./qrcode";

/** QR Code em SVG (data URL) — pronto para <img src> */
export function qrDataUrl(texto: string, tam = 260): string {
  const q: any = (qrcode as any)(0, "M"); q.addData(texto, "Byte"); q.make();
  const n = q.getModuleCount(), m = 4, cel = tam / (n + m * 2);
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${((c + m) * cel).toFixed(2)} ${((r + m) * cel).toFixed(2)}h${cel.toFixed(2)}v${cel.toFixed(2)}h-${cel.toFixed(2)}z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  return "data:image/svg+xml;base64," + btoa(svg);
}

const carregarImg = (src: string) => new Promise<HTMLImageElement>((ok, er) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => er(new Error("imagem não abriu")); i.src = src; });

/** imagem (Blob) → JPEG comprimido em data URL (lado maior até `max` px) */
export async function blobParaJpeg(b: Blob, max = 1600, q = 0.82): Promise<string> {
  const u = URL.createObjectURL(b);
  try {
    const img = await carregarImg(u);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    const g = cv.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", q);
  } finally { URL.revokeObjectURL(u); }
}

/** PDF de imagens do projeto → uma imagem JPEG por página (até `maxPags`) */
export async function pdfParaImagens(b: Blob, maxPags = 12, largura = 1600): Promise<string[]> {
  const pdfjs: any = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url" as any)).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await b.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, maxPags); p++) {
    const pg = await doc.getPage(p);
    const v0 = pg.getViewport({ scale: 1 });
    const vp = pg.getViewport({ scale: Math.min(3, largura / Math.max(v0.width, v0.height)) });
    const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const g = cv.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: g, viewport: vp }).promise;
    out.push(cv.toDataURL("image/jpeg", 0.8));
  }
  return out;
}

/** endereço da função "contrato" (chamada sem login pelo cliente) */
export async function contratoApi(corpo: any, token?: string): Promise<any> {
  const { sb } = await import("./supabase");
  const base = (sb as any).supabaseUrl || "";
  const r = await fetch(base + "/functions/v1/contrato", { method: "POST", body: JSON.stringify(corpo),
    headers: { "Content-Type": "application/json", apikey: (sb as any).supabaseKey || "", ...(token ? { Authorization: "Bearer " + token } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.erro) throw new Error(j.erro || "Não foi possível falar com o servidor (" + r.status + ")");
  return j;
}

/** itens que o cliente precisa marcar antes de assinar */
export function aceitesDoContrato(ambientes: string[]): string[] {
  return [
    ...ambientes.slice(0, 16).map((n, i) => `Ambiente ${i + 1} · ${n}: conferi as imagens do projeto, o material, a espessura e a cor, e estou de acordo.`),
    "Li e estou ciente do termo de ciência do material (MDP / MDF, espessuras, variação de tom e cuidados com água e umidade).",
    "Estou ciente dos itens que NÃO estão inclusos e das observações deste checklist.",
    "Li e estou de acordo com as condições gerais do checklist e com as minhas responsabilidades (planta de tubulação e fiação, pontos de água e luz, ambiente livre de móveis antigos).",
  ].slice(0, 20);
}
