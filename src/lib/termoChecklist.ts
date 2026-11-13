// Checklist · gera o TERMO DE CIÊNCIA (material + responsabilidades) a partir da listagem do Promob e dos ambientes do checklist.
// Sem valores: só material, espessura, cor, módulos e medidas.
import type { Listagem, LinhaListagem } from "./listagemPromob";

export type Mat = "MDP" | "MDF" | null;
export type AmbTermo = {
  nome: string;
  caixa: { mat: Mat; esp: number | null };
  porta: { mat: Mat; esp: number | null; vidro: boolean; naoSeAplica?: boolean };
  cor: string;               // texto livre (ex.: "Caixas Legno Crema · portas Jade") ou códigos da listagem
  itens: LinhaListagem[];    // módulos / peças deste ambiente (vindos da listagem)
  conferir: string[];        // o que o 360 não conseguiu tirar da listagem
};
export type DadosTermo = {
  venda: string; cupom?: string; cliente: string; endereco: string; vendedor: string; projetista: string; data: string;
  ambientes: AmbTermo[]; naoInclusos: string[]; obs: string; ferragens: string[]; arquivoListagem?: string;
};

/** Monta o material de um ambiente a partir das linhas da listagem que pertencem a ele. */
export function ambienteDaListagem(nome: string, itens: LinhaListagem[], geral?: Listagem): AmbTermo {
  const chapa = itens.filter(l => l.tipo === "painel" || l.tipo === "modulo");
  const portas = itens.filter(l => l.tipo === "porta");
  const um = <T,>(xs: (T | null)[]) => { const u = [...new Set(xs.filter((x): x is T => x != null))]; return u.length === 1 ? u[0] : null; };
  const matGeral = geral?.resumo.materiais.length === 1 ? geral.resumo.materiais[0] : null;
  const caixaMat = um(chapa.map(l => l.material)) ?? matGeral;
  const caixaEsp = um(chapa.filter(l => l.tipo === "painel").map(l => l.espessura)) ?? (geral?.resumo.espessuras.length === 1 ? geral.resumo.espessuras[0] : null);
  const portaMat = um(portas.map(l => l.material));
  const portaEsp = um(portas.map(l => l.espessura));
  const vidro = itens.some(l => /vidro|reflecta|espelho/i.test(l.descricao));
  const cores = [...new Set(itens.filter(l => l.cor && l.tipo !== "consumivel").map(l => `cód. ${l.cor}`))];
  const conferir: string[] = [];
  if (!caixaMat) conferir.push("material das caixas");
  if (!caixaEsp) conferir.push("espessura das caixas");
  if (!portaMat) conferir.push("material das portas");
  if (!portaEsp) conferir.push("espessura das portas");
  if (cores.length) conferir.push("nome das cores");
  return { nome, caixa: { mat: caixaMat, esp: caixaEsp }, porta: { mat: portaMat, esp: portaEsp, vidro, naoSeAplica: !portas.length && !itens.some(l => l.tipo === "modulo") }, cor: cores.join(" · "), itens, conferir };
}

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const bx = (on: boolean, t: string) => `<span class="o"><span class="bx${on ? " x" : ""}"></span>${t}</span>`;
function cel(mat: Mat, esp: number | null, comVidro: boolean, vidro = false, na = false) {
  const ops: [string, boolean][] = [["MDP", mat === "MDP"], ["MDF", mat === "MDF"]];
  if (comVidro) ops.push(["Vidro", vidro]);
  return `<div class="g"><span class="lb">Mat.</span>${ops.map(([t, on]) => bx(on, t)).join("")}</div>`
    + `<div class="g"><span class="lb">Esp. mm</span>${bx(esp === 15, "15")}${bx(esp === 18, "18")}${esp && esp !== 15 && esp !== 18 ? bx(true, String(esp)) : ""}</div>`
    + (na ? `<div class="na">não se aplica</div>` : "");
}

const CSS = `@page{size:A4;margin:10mm 12mm}
*{box-sizing:border-box}body{margin:0;font:9.4pt/1.32 Arial,Helvetica,sans-serif;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{width:186mm;margin:0 auto}.quebra{break-before:page}
.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:5px;margin-bottom:7px}
.hd .l b{font-size:14pt;letter-spacing:.5px}.hd .l div{font-size:8.5pt;color:#444}.hd .r{text-align:right;font-size:8.5pt}.hd .r b{font-size:11pt}
.dados{display:grid;grid-template-columns:2.2fr 1fr 1fr;gap:2px 12px;font-size:9pt;border:1px solid #999;padding:5px 8px;margin-bottom:6px}.dados span{color:#555}
h3{font-size:9.6pt;margin:8px 0 4px;text-transform:uppercase;letter-spacing:.4px;background:#eee;padding:3px 6px}h3 i{font-weight:400;font-style:normal;text-transform:none;letter-spacing:0}
table{width:100%;border-collapse:collapse;font-size:8.6pt;table-layout:fixed}th,td{border:1px solid #888;padding:3px 5px;vertical-align:middle}th{background:#f3f3f3;text-align:left;font-size:8pt}
.amb{font-weight:700}.fill{color:#1f3a7a;font-style:italic}.conf{color:#8a5d00;font-size:7.5pt;font-style:normal}
.bx{display:inline-block;width:9px;height:9px;border:1.3px solid #111;flex:none}.bx.x{background:#111}
.g{display:grid;grid-template-columns:14mm 12.5mm 12.5mm 12mm;align-items:center;line-height:1.45}.g .lb{font-size:7pt;color:#666;text-transform:uppercase}
.o{white-space:nowrap;display:flex;align-items:center;gap:3px}.na{font-size:7pt;color:#666}
.dec{font-size:8.9pt}.dec div{display:flex;gap:7px;padding:2.5px 0;border-bottom:1px dotted #bbb}.dec div .bx{margin-top:2px}
.obs{border:1px solid #888;min-height:11mm;padding:4px 6px;font-size:8.6pt}
.ass{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px;font-size:8.6pt;text-align:center}.ass div{border-top:1px solid #111;padding-top:3px}
.rub{font-size:7.5pt;color:#555}.foot{margin-top:8px;font-size:7pt;color:#666;display:flex;justify-content:space-between}
.it td{font-size:8.2pt;padding:2px 5px}.it .n{width:9mm;text-align:right;color:#666}.it .q{width:16mm}.it .m{width:34mm}.it .c{width:18mm}`;

/** HTML completo (A4) do termo — página 1: termo para assinar · página 2: itens do projeto por ambiente (sem valores). */
export function termoHtml(d: DadosTermo): string {
  const linhas = d.ambientes.map((a, i) => `<tr><td class="amb">${i + 1} · ${esc(a.nome)}</td><td>${cel(a.caixa.mat, a.caixa.esp, false)}</td>`
    + `<td>${cel(a.porta.mat, a.porta.esp, true, a.porta.vidro, a.porta.naoSeAplica)}</td>`
    + `<td class="fill">${esc(a.cor) || "&nbsp;"}${a.conferir.length ? `<div class="conf">conferir: ${esc(a.conferir.join(", "))}</div>` : ""}</td><td></td></tr>`).join("");
  const itens = d.ambientes.map((a, i) => {
    // peças iguais (mesma descrição, medida e cor) viram uma linha só, com a quantidade somada
    const grupos = new Map<string, { l: LinhaListagem; n: number; itens: number[] }>();
    for (const l of a.itens.filter(l => l.tipo !== "consumivel")) {
      const k = `${l.descricao}|${l.medidas}|${l.cor}|${/M2/i.test(l.qtd) ? "" : l.qtd}`;
      const g = grupos.get(k); if (g) { g.n++; g.itens.push(l.item); } else grupos.set(k, { l, n: 1, itens: [l.item] });
    }
    const vis = [...grupos.values()].map(g => ({ ...g.l, item: g.itens[0], qtd: g.n > 1 ? `${g.n} peças` : /M2/i.test(g.l.qtd) ? "1 peça" : g.l.qtd }));
    if (!vis.length) return "";
    return `<h3>${i + 1} · ${esc(a.nome)} <i>(${vis.length} itens)</i></h3><table class="it"><tr><th class="n">Item</th><th class="q">Qtd</th><th>Descrição</th><th class="m">Medidas (L × A × P)</th><th class="c">Cor</th></tr>`
      + vis.map(l => `<tr><td class="n">${l.item}</td><td>${esc(l.qtd)}</td><td>${esc(l.descricao)}</td><td>${esc(l.medidas)}</td><td>${l.cor ? "cód. " + esc(l.cor) : ""}</td></tr>`).join("") + `</table>`;
  }).join("");
  const cab = (titulo: string) => `<div class="hd"><div class="l"><b>ALIANÇA MÓVEIS</b><div>Checklist do projeto · documento para assinatura do cliente</div></div>
<div class="r"><b>${titulo}</b><br>Venda <b>${esc(d.venda)}</b>${d.cupom ? " · Cupom " + esc(d.cupom) : ""}</div></div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Termo de ciência · ${esc(d.cliente)} · ${esc(d.venda)}</title><style>${CSS}</style></head><body>
<div class="pg">${cab("TERMO DE CIÊNCIA DO MATERIAL")}
<div class="dados"><div><span>Cliente:</span> <b>${esc(d.cliente.toUpperCase())}</b></div><div><span>Data:</span> <b>${esc(d.data)}</b></div><div><span>Vendedor(a):</span> ${esc(d.vendedor)}</div>
<div><span>Endereço:</span> ${esc(d.endereco)}</div><div><span>Projetista:</span> ${esc(d.projetista)}</div><div><span>Ambientes:</span> ${d.ambientes.length}</div></div>
<h3>1 · Material por ambiente <i>(preenchido no checklist · o cliente confere e rubrica cada linha)</i></h3>
<table><colgroup><col style="width:30mm"><col style="width:40mm"><col style="width:53mm"><col><col style="width:15mm"></colgroup>
<tr><th>Ambiente</th><th>Caixas / corpo</th><th>Portas / frentes</th><th>Cor / padrão</th><th>Rubrica</th></tr>${linhas}</table>
<h3>2 · Declarações do cliente <i>(assinalar cada item)</i></h3><div class="dec">
<div><span class="bx"></span><span>Vi pessoalmente as amostras de cores e padrões escolhidos para cada ambiente acima e estou de acordo.</span></div>
<div><span class="bx"></span><span>Conferi que o material de cada parte do móvel (<b>MDP</b> ou <b>MDF</b>) e a espessura marcados acima são os que constam na minha compra e no projeto final.</span></div>
<div><span class="bx"></span><span>Fui informado(a) pelo(a) projetista das diferenças entre MDP e MDF. A troca de material depois desta assinatura depende de novo orçamento e pode alterar o prazo.</span></div>
<div><span class="bx"></span><span>Estou ciente de que pode haver pequena variação de tom e textura entre a amostra, a imagem do projeto (tela / 3D) e o lote de fabricação.</span></div>
<div><span class="bx"></span><span>Estou ciente de que nem o MDP nem o MDF são à prova d'água: contato contínuo com água, umidade ou vazamentos pode danificar o móvel e não é coberto pela garantia.</span></div>
<div><span class="bx"></span><span>Não estão inclusos: <b>${esc(d.naoInclusos.join(", "))}</b> <span class="rub">(riscar o que estiver incluso)</span>.</span></div></div>
<h3>3 · Antes da montagem — responsabilidade do cliente <i>(assinalar cada item)</i></h3><div class="dec">
<div><span class="bx"></span><span>Devo informar e disponibilizar a <b>planta (ou a indicação nas paredes) da tubulação de água, esgoto e gás e da fiação elétrica</b>, para o montador saber onde pode furar. Sem essa informação, danos em canos e fios durante a montagem são de minha responsabilidade.</span></div>
<div><span class="bx"></span><span>Os <b>pontos de água, esgoto, gás, luz e tomadas</b> precisam estar prontos nos locais indicados no projeto. Instalar, mudar ou ligar esses pontos <b>não é responsabilidade da loja</b> (nem do montador).</span></div>
<div><span class="bx"></span><span>O ambiente precisa estar <b>livre dos móveis antigos</b> (inclusive granito/pedra apoiados neles), com as paredes desobstruídas, para a montagem dos móveis novos. A retirada dos móveis antigos é por minha conta.</span></div></div>
<h3>4 · Observações do checklist</h3><div class="obs fill">${esc([d.ferragens.length ? "Ferragens: " + d.ferragens.join(" · ") : "", d.obs].filter(Boolean).join(" — "))}</div>
<div class="ass"><div>Assinatura do cliente<br><span class="rub">${esc(d.cliente.toUpperCase())}</span></div><div>Projetista do checklist<br><span class="rub">${esc(d.projetista)} · ${esc(d.data)}</span></div></div>
<div class="foot"><span>Gerado pelo ALIANÇA 360 · venda ${esc(d.venda)}</span><span>Rubricar as linhas da tabela</span></div></div>
${itens ? `<div class="pg quebra">${cab("ITENS DO PROJETO POR AMBIENTE")}
<div class="dados"><div><span>Cliente:</span> <b>${esc(d.cliente.toUpperCase())}</b></div><div><span>Data:</span> <b>${esc(d.data)}</b></div><div><span>Fonte:</span> listagem do Promob${d.arquivoListagem ? " (" + esc(d.arquivoListagem) + ")" : ""}</div></div>
<div class="rub" style="margin-bottom:4px">Conferência dos módulos e peças com o cliente. Parafusos, pregos, fitas de borda e suportes não aparecem. Sem valores.</div>${itens}
<div class="ass"><div>Rubrica do cliente</div><div>Projetista do checklist</div></div></div>` : ""}
</body></html>`;
}
