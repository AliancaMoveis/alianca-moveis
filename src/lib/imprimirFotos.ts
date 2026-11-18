// Impressão das fotos e desenhos de uma medida, direto da tela.
// Quem vai medir imprime para levar no bolso, e quem confere imprime para anexar no processo.
// Antes só dava para baixar uma por uma e montar o arquivo à mão.

export type FotoImp = { url: string; nome?: string };

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/**
 * Abre a janela de impressão com as fotos, uma por folha (A4), com cabeçalho e o nome do arquivo.
 * Só manda imprimir depois que TODAS as imagens carregaram: imprimir antes sai com folha em branco.
 * Devolve false quando o navegador bloqueou a janela, para a tela avisar.
 */
export function imprimirFotos(fotos: FotoImp[], titulo: string, sub = "", textos: [string, string][] = []): boolean {
  const l = fotos.filter(f => f.url);
  if (!l.length && !textos.length) return true;
  const w = window.open("", "_blank");
  if (!w) return false;
  const paginas = l.map((f, i) => `<figure><img src="${esc(f.url)}" alt="" onload="pronto()" onerror="pronto()">
<figcaption>${esc(f.nome || "foto " + (i + 1))} · ${i + 1} de ${l.length}</figcaption></figure>`).join("");
  const txt = textos.filter(([, v]) => String(v || "").trim()).map(([k, v]) => `<div class="tx"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join("");
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
@page{size:A4;margin:10mm}
*{box-sizing:border-box}body{margin:0;font:10pt/1.35 Arial,Helvetica,sans-serif;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:5px;margin-bottom:8px}
header b{font-size:13pt;letter-spacing:.4px}header span{font-size:9pt;color:#444}
.tx{display:flex;gap:8px;font-size:9.5pt;padding:3px 0;border-bottom:1px dotted #bbb}.tx b{min-width:32mm;flex:none}
figure{margin:0;break-before:page;break-inside:avoid;text-align:center;page-break-before:always}
figure:first-of-type{break-before:auto;page-break-before:auto}
figure img{max-width:100%;max-height:245mm;object-fit:contain}
figcaption{font-size:8.5pt;color:#555;margin-top:3mm}
.aguarde{font:12pt Arial;padding:20mm;text-align:center;color:#555}
@media print{.aguarde{display:none}}
</style></head><body>
<header><b>ALIANÇA MÓVEIS</b><span>${esc(titulo)}${sub ? " · " + esc(sub) : ""}</span></header>
${txt}
<div class="aguarde">Preparando ${l.length} imagem(ns) para impressão…</div>
${paginas}
<script>
var faltam = ${l.length}, jaFoi = false;
function imprimir(){ if (jaFoi) return; jaFoi = true; setTimeout(function(){ window.focus(); window.print(); }, 150); }
function pronto(){ if (--faltam <= 0) imprimir(); }
if (faltam === 0) imprimir();
setTimeout(imprimir, 8000); // rede lenta: imprime o que carregou em vez de travar a tela
</script></body></html>`);
  w.document.close();
  return true;
}
