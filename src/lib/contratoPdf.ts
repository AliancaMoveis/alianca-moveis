// PDF de verdade do contrato do checklist e do detalhamento das imagens.
//
// Por que o contrato é rasterizado página a página, em vez de desenhado de novo em jsPDF:
// o que vale juridicamente é o documento que o cliente assinou. O HTML assinado já vem com
// a assinatura, a selfie e o hash; redesenhar o layout criaria um segundo documento parecido,
// mas não idêntico. Então cada folha `.pg` (A4 no CSS do contrato) vira uma página do PDF.
//
// O detalhamento das imagens é o contrário: não existe como HTML assinado, é um documento
// novo e simples, então sai desenhado direto — fica leve e com a imagem nítida.

export type ImgAmb = { ambiente: string; nome: string; src: string };

const A4 = { w: 210, h: 297 };
/** as mesmas margens do @page do contrato (10mm 12mm): é para dentro delas que a folha vai */
const MARGEM = { x: 12, y: 10 };

/** mede uma imagem (data URL) sem depender de rede */
function medir(src: string): Promise<{ w: number; h: number }> {
  return new Promise(ok => {
    const i = new Image();
    i.onload = () => ok({ w: i.naturalWidth || 1, h: i.naturalHeight || 1 });
    i.onerror = () => ok({ w: 1, h: 1 });
    i.src = src;
  });
}

/**
 * Contrato assinado em PDF, fiel ao documento que o cliente assinou.
 * Recebe o HTML do contrato (o mesmo guardado no storage) e devolve o arquivo.
 */
export async function pdfDoContrato(html: string, aoAndar?: (feitas: number, total: number) => void): Promise<Blob> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);

  // O contrato assinado é um documento HTML COMPLETO, com o <style> dele e regras que valem
  // para o documento inteiro (a começar por `body{font:9.6pt/1.35 Arial}`, que define o tamanho
  // de tudo). Antes o código arrancava o <body> e enfiava o miolo dentro da tela do 360: ali o
  // CSS do contrato e o do aplicativo se misturavam, a folha era diagramada com uma largura e
  // fotografada com outra, e o texto saía cortado no meio da palavra na direita (venda 1318542).
  // Agora o documento é aberto num quadro próprio, isolado, exatamente como foi assinado.
  const quadro = document.createElement("iframe");
  quadro.setAttribute("aria-hidden", "true");
  quadro.setAttribute("tabindex", "-1");
  // 794px = 210mm a 96dpi: a folha A4 inteira, para a .pg (186mm) caber com folga e nao ser espremida
  quadro.style.cssText = "position:fixed;left:0;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;z-index:-1";
  document.body.appendChild(quadro);

  try {
    const d = quadro.contentDocument!;
    d.open(); d.write(html); d.close();
    await new Promise(r => { if (d.readyState === "complete") r(null); else quadro.onload = () => r(null); });

    // aguarda as imagens embutidas desenharem, senão a folha sai em branco
    const imgs = Array.from(d.querySelectorAll("img"));
    await Promise.all(imgs.map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = () => r(null); })));
    await new Promise(r => setTimeout(r, 150));

    const folhas = Array.from(d.querySelectorAll<HTMLElement>(".pg"));
    const alvos = folhas.length ? folhas : [d.body];
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

    for (let i = 0; i < alvos.length; i++) {
      aoAndar?.(i, alvos.length);
      // largura/altura explícitas: sem isso o html2canvas usa a janela do 360, que não é a
      // janela onde a folha está desenhada, e corta a direita
      const cv = await html2canvas(alvos[i], {
        scale: 2, backgroundColor: "#fff", useCORS: true, logging: false,
        width: alvos[i].scrollWidth, height: alvos[i].scrollHeight,
        windowWidth: quadro.clientWidth, windowHeight: Math.max(quadro.clientHeight, alvos[i].scrollHeight),
        scrollX: 0, scrollY: 0,
      });
      const img = cv.toDataURL("image/jpeg", 0.86);
      if (i) doc.addPage();
      // A folha `.pg` tem 186mm — a A4 menos as margens do @page (10mm 12mm). Antes isso era
      // esticado para os 210mm da folha inteira a partir do x=0: o conteúdo encostava nas duas
      // bordas e o lado direito saía cortado na tela e na impressão. E a altura usava Math.min,
      // que espremia a página quando ela passava de 297mm, em vez de reduzir junto com a largura.
      // Agora a imagem é encaixada DENTRO das margens, com a mesma escala nos dois eixos.
      const maxL = A4.w - MARGEM.x * 2, maxA = A4.h - MARGEM.y * 2;
      const esc = Math.min(maxL / cv.width, maxA / cv.height);
      const larg = cv.width * esc, alt = cv.height * esc;
      doc.addImage(img, "JPEG", (A4.w - larg) / 2, (A4.h - alt) / 2, larg, alt, undefined, "FAST");
    }
    aoAndar?.(alvos.length, alvos.length);
    return doc.output("blob");
  } finally { quadro.remove(); }
}

/**
 * Detalhamento das imagens do projeto: uma capa e uma imagem por página, com o ambiente.
 * Sem valores, sem listagem de peças e sem dado interno — é o que vai para o cliente.
 */
export async function pdfDasImagens(p: { cliente: string; venda: string; data: string; imagens: ImgAmb[] }): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const M = 14;

  // capa
  doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text("Detalhamento das imagens do projeto", M, 36, { maxWidth: A4.w - M * 2 });
  doc.setFont("helvetica", "normal"); doc.setFontSize(12);
  doc.setTextColor(60);
  doc.text("Aliança Móveis", M, 48);
  doc.setFontSize(11); doc.setTextColor(20);
  doc.text(String(p.cliente || ""), M, 62, { maxWidth: A4.w - M * 2 });
  doc.setTextColor(90); doc.setFontSize(10.5);
  doc.text("Venda " + String(p.venda || "—") + (p.data ? "  ·  " + p.data : ""), M, 69);
  doc.setFontSize(10);
  doc.text("Estas são as imagens do projeto final conferidas com você no checklist.", M, 86, { maxWidth: A4.w - M * 2 });
  doc.text("O documento traz apenas as imagens dos ambientes, sem valores.", M, 92, { maxWidth: A4.w - M * 2 });
  doc.setDrawColor(200); doc.line(M, 100, A4.w - M, 100);

  let ambAnterior = "";
  for (const im of p.imagens) {
    doc.addPage();
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(20);
    doc.text(String(im.ambiente || "Projeto").toUpperCase(), M, 20, { maxWidth: A4.w - M * 2 });
    if (im.nome && im.nome !== im.ambiente) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120);
      doc.text(String(im.nome), M, 26, { maxWidth: A4.w - M * 2 });
    }
    const topo = 32, baixo = 16;
    const cx = A4.w - M * 2, cy = A4.h - topo - baixo;
    const { w, h } = await medir(im.src);
    const esc = Math.min(cx / w, cy / h);
    const lw = w * esc, lh = h * esc;
    try { doc.addImage(im.src, 0 + M + (cx - lw) / 2, topo + (cy - lh) / 2, lw, lh, undefined, "FAST"); }
    catch { doc.setTextColor(150); doc.setFontSize(10); doc.text("(imagem não pôde ser incluída)", M, topo + 10); }
    ambAnterior = im.ambiente;
  }
  void ambAnterior;

  // rodapé em todas as páginas
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(140);
    doc.text("Aliança Móveis · " + String(p.cliente || "") + " · venda " + String(p.venda || "—"), M, A4.h - 8, { maxWidth: A4.w - M * 2 - 20 });
    doc.text(i + "/" + n, A4.w - M, A4.h - 8, { align: "right" });
  }
  return doc.output("blob");
}

/**
 * Lê as imagens do projeto direto do contrato assinado.
 * É de propósito: garante que o detalhamento leva exatamente as imagens que o cliente viu
 * e aprovou, e não uma segunda cópia que pode ter mudado no checklist depois.
 */
export function imagensDoContrato(html: string): ImgAmb[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: ImgAmb[] = [];
  for (const pg of Array.from(doc.querySelectorAll(".pg"))) {
    const t = (pg.querySelector("h2")?.textContent || "").trim();
    const m = t.match(/AMBIENTE\s+\d+\s+DE\s+\d+\s*:\s*(.+)$/i);
    if (!m) continue;
    const amb = m[1].trim();
    for (const f of Array.from(pg.querySelectorAll(".imgs figure"))) {
      const src = f.querySelector("img")?.getAttribute("src") || "";
      if (!src.startsWith("data:")) continue;
      out.push({ ambiente: amb, nome: (f.querySelector("figcaption")?.textContent || "").trim(), src });
    }
  }
  return out;
}

/** nome de arquivo limpo, que é o que o cliente vê no WhatsApp */
export const nomePdf = (prefixo: string, cliente: string, venda: string) =>
  (prefixo + "_" + String(cliente || "").trim().split(/\s+/)[0] + "_" + String(venda || "")).replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_") + ".pdf";
