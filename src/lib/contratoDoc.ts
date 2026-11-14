// Contrato do checklist (assinatura online) — modelo único usado no celular do cliente, na impressão e no contrato assinado.
// Segue o papel da loja: 1) Termo de ciência do material (por ambiente) · 2) Geral (29 itens "Sim") · 3) Imagens do projeto · 4) Assinatura.
// Arquivo sem dependências: é copiado também para a função "contrato" do Supabase (supabase/functions/contrato/doc.ts).

export type MatT = "MDP" | "MDF" | "NAO" | null;
export type LinhaTermo = { mat: MatT; cor: string };
export type Amort = "com" | "sem" | "nao" | null;
export type TermoAmb = { estrutura: LinhaTermo; portas: LinhaTermo; envoltorio: LinhaTermo; paineis: LinhaTermo; corredicas: Amort; dobradicas: Amort };
export type ImgContrato = { nome: string; src: string };
export type AmbContrato = {
  nome: string; termo: TermoAmb;
  ficha?: [string, boolean | null][]; fichaObs?: string;
  itens?: { qtd: string; descricao: string; medidas: string }[];
  imagens: ImgContrato[];
};
export type ContratoDados = {
  venda: string; cliente: string; endereco: string; vendedor: string; projetista: string; data: string;
  ambientes: AmbContrato[]; naoInclusos: string[]; obs: string; ferragens: string[];
};
export type RespostaContrato = { nome: string; cpf: string; termos: TermoAmb[]; materiaisOk: boolean[]; geral: boolean[]; imagensOk: boolean[] };
export type AssinaturaContrato = { nome: string; cpf: string; quando: string; ip: string; ua: string; hash: string; assinatura: string; selfie: string; projetista?: string };

export const LINHAS_TERMO: [keyof TermoAmb, string][] = [["estrutura", "Estrutura"], ["portas", "Portas"], ["envoltorio", "Envoltório"], ["paineis", "Painéis"]];
export const AMORT: [keyof TermoAmb, string][] = [["corredicas", "Corrediças"], ["dobradicas", "Dobradiças"]];
export const MAT_ROT: Record<string, string> = { MDP: "MDP", MDF: "MDF", NAO: "Não contém" };
export const AMORT_ROT: Record<string, string> = { com: "Com amortecedor", sem: "Sem amortecedor", nao: "Não contém" };

export const INFO_TECNICAS = [
  "MDP (Painel de Partículas de Média Densidade): material composto por partículas de madeira prensadas, com ótima resistência e excelente acabamento.",
  "MDF (Fibra de Média Densidade): material homogêneo feito de fibras de madeira prensadas, com ótima resistência e excelente acabamento.",
  "Ambos os materiais são amplamente utilizados na indústria moveleira e possuem qualidade e durabilidade comprovadas.",
];

/** "Geral" — os 29 itens do termo da loja (cada um com "Sim") */
export const CONDICOES_CONTRATO = [
  "O cliente está ciente de que a Aliança não fará nenhum tipo de instalações ou alterações elétricas, hidráulicas ou de gás.",
  "O cliente está ciente que deverá fornecer planta elétrica, hidráulica e de gás para que o montador possa furar as paredes, diminuindo o risco de um incidente.",
  "O cliente está ciente de que caso não possua projetos elétricos, hidráulicos e de gás, será responsável por quaisquer danos causados durante a montagem nos mesmos.",
  "O cliente está ciente de que vazamentos hidráulicos de qualquer tipo que possam danificar o móvel são de inteira responsabilidade do mesmo e que a garantia não se aplica neste caso.",
  "O cliente está ciente de que, caso more em condomínio, deverá fornecer os horários permitidos para a entrega do móvel, bem como os horários permitidos para a equipe de instalação permanecer no local onde o móvel será aplicado.",
  "O cliente está ciente de que, devido à grande quantidade de peças e à grande complexidade da montagem do móvel projetado, existe o risco de peças serem danificadas no ato da montagem ou até mesmo durante o transporte. Sendo assim, estas serão listadas no término da montagem e imediatamente pedidas para a fábrica, onde poderá haver um prazo de entrega de até 45 dias a contar do dia do término da montagem.",
  "O cliente está ciente de que as paredes têm que estar absolutamente desobstruídas e prontas para receberem os móveis.",
  "O cliente está ciente de que caso haja um móvel instalado no mesmo local do móvel planejado adquirido, o antigo móvel deverá ser retirado pelo cliente e o ambiente deverá estar totalmente liberado (incluindo o granito, mesmo que este esteja sendo sustentado pelo antigo móvel).",
  "O cliente está ciente de que os rodapés/sancas terão de ser retirados por ele, previamente, e não pelo instalador, para a instalação do móvel.",
  "O cliente está ciente de que paredes irregulares com diferenças de ângulo e irregularidades no acabamento poderão afetar a instalação dos móveis e impedir uma regulagem totalmente afinada, já que o móvel vem com recorte absolutamente reto.",
  "O cliente está ciente de que a montagem não será concluída no mesmo dia e que possivelmente o montador terá que interromper no final do dia e iniciar nos dias seguintes.",
  "O cliente está ciente de que, eventualmente, terão de ser realizados alguns recortes de móvel pelo montador durante a montagem e que deverá reservar um local para que isso seja feito.",
  "O cliente está ciente de que os recortes e a montagem podem produzir uma grande quantidade de sujeira e resíduos que serão removidos pelo montador, porém não na sua totalidade, podendo então permanecer restos, e que essa limpeza será de responsabilidade do cliente.",
  "O cliente está ciente de que em casos de recorte há a necessidade de se recolocar as fitas de borda, porém não com a mesma técnica utilizada na indústria, e sim será realizada de forma manual pelo montador, podendo então apresentar pequenas variações de acabamento se comparadas àquelas que são originais de fábrica, e que essas diferenças não serão possíveis de ser resolvidas.",
  "O cliente está ciente de que os montadores e seus ajudantes terão que obrigatoriamente trabalhar munidos de EPIs, incluindo o uso de botas.",
  "O cliente está ciente de que somente maiores de 18 anos poderão receber os montadores.",
  "O cliente está ciente de que ao término da montagem terá que assinar um termo de conclusão de serviço e que nele deverá constar todas as reclamações sobre o móvel e a montagem.",
  "O cliente está ciente de que o montador não fará a instalação de quaisquer eletrodomésticos no móvel.",
  "O cliente está ciente de que não poderão ser instalados módulos suspensos em paredes de drywall.",
  "O cliente está ciente da necessidade de se aumentar vistas, caso as janelas possuam cortinas/persianas, para que as portas não batam nas mesmas.",
  "Em casos onde o móvel será recortado para se adaptar à sanca, o cliente tem ciência de que em casos onde as sancas possuem um desenho curvado, o recorte não será no mesmo formato da sanca, e sim reto.",
  "Em casos onde o sóculo tem profundidade superior à profundidade do móvel, o cliente foi informado de que haverá uma distância entre a parede e o módulo.",
  "O cliente está ciente de que deverá respeitar as normas técnicas contidas no manual de instrução dos seus eletrodomésticos. Ex.: distância mínima entre a parede do forno e a lateral do móvel, a fim de evitar danos causados no móvel devido ao superaquecimento.",
  "Se houver instalações elétricas no móvel, o cliente está ciente de que a loja não faz este tipo de instalação e somente poderá deixar as furações e caminhos internos no móvel necessários para que um profissional não vinculado à loja possa fazer a instalação futura.",
  "O cliente está ciente de que, apesar da loja apresentar diversos projetos desde a sua primeira visita, o projeto que será enviado para a fábrica e consequentemente confeccionado, entregue e montado é o projeto validado durante o checklist. Desta forma, tudo aquilo que foi proposto pelo vendedor deixa de ter validade no ato da assinatura e conclusão do checklist (projeto final).",
  "O cliente informou se quer fazer algum tipo de iluminação futura no móvel (após instalado pela Aliança), para que assim o projetista pudesse informar o formato/planejamento ideal do móvel.",
  "O cliente está ciente de que a loja não vende e nem bonifica nenhum tipo de granito/mármore/quartzo, porém poderá dar indicações.",
  "Em casos onde o móvel irá sobrepor registros, tomadas, interruptores etc., o cliente foi informado de que o recorte será realizado de forma manual pelo próprio montador, com serra copo e furadeira.",
  "No caso de móveis com cantos retos, o cliente está ciente de que o móvel não poderá ir até o final da parede, devido a possíveis diferenças de angulação que o imóvel pode apresentar, deixando assim um vão livre (sem utilidade), o qual não ficará visível, mas sim irá garantir que não haja margem de erro no móvel.",
];

export const termoVazio = (): TermoAmb => ({ estrutura: { mat: null, cor: "" }, portas: { mat: null, cor: "" }, envoltorio: { mat: null, cor: "" }, paineis: { mat: null, cor: "" }, corredicas: null, dobradicas: null });

/** o que ainda falta preencher no termo de um ambiente */
export function faltaNoTermo(t: TermoAmb): string[] {
  const f: string[] = [];
  for (const [k, rot] of LINHAS_TERMO) { const l = t[k] as LinhaTermo; if (!l?.mat) f.push(rot); else if (l.mat !== "NAO" && !String(l.cor || "").trim()) f.push("cor de " + rot.toLowerCase()); }
  for (const [k, rot] of AMORT) if (!t[k]) f.push(rot);
  return f;
}
/** o que o cliente mudou em relação ao que veio do sistema */
export function diferencasTermo(orig: TermoAmb, fim: TermoAmb): string[] {
  const out: string[] = [];
  for (const [k, rot] of LINHAS_TERMO) {
    const a = orig[k] as LinhaTermo, b = fim[k] as LinhaTermo;
    if ((a?.mat || null) !== (b?.mat || null)) out.push(`${rot}: ${MAT_ROT[a?.mat || ""] || "em branco"} → ${MAT_ROT[b?.mat || ""] || "em branco"}`);
    if (String(a?.cor || "").trim() !== String(b?.cor || "").trim() && b?.mat !== "NAO") out.push(`Cor de ${rot.toLowerCase()}: ${String(a?.cor || "").trim() || "em branco"} → ${String(b?.cor || "").trim() || "em branco"}`);
  }
  for (const [k, rot] of AMORT) if ((orig[k] || null) !== (fim[k] || null)) out.push(`${rot}: ${AMORT_ROT[String(orig[k] || "")] || "em branco"} → ${AMORT_ROT[String(fim[k] || "")] || "em branco"}`);
  return out;
}

export function cpfValido(c: string): boolean {
  const d = String(c || "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
export const fmtCpf = (c: string) => { const d = String(c || "").replace(/\D/g, "").slice(0, 11); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d; };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const CSS = `@page{size:A4;margin:10mm 12mm}*{box-sizing:border-box}
body{margin:0;font:9.6pt/1.35 Arial,Helvetica,sans-serif;color:#111;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{width:186mm;margin:0 auto 8mm}.quebra{break-before:page}
.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:5px;margin-bottom:8px}
.hd .l{display:flex;align-items:center;gap:8px}.hd .l img{height:12mm}.hd .l b{font-size:12pt;letter-spacing:.5px}
.marca{position:fixed;top:50%;left:50%;width:130mm;transform:translate(-50%,-50%);opacity:.06;z-index:-1;pointer-events:none}
.logo{display:block;margin:0 auto;height:17mm}.hd .l div{font-size:8.5pt;color:#444}.hd .r{text-align:right;font-size:8.5pt}.hd .r b{font-size:11pt}
h2{font-size:13pt;text-align:center;margin:2.5mm 0 3mm;letter-spacing:.3px}
h3{font-size:9.8pt;margin:9px 0 4px;text-transform:uppercase;letter-spacing:.4px;background:#eee;padding:3px 6px}h3 i{font-weight:400;font-style:normal;text-transform:none;letter-spacing:0}
.dados{display:grid;grid-template-columns:1.6fr 1fr;gap:3px 14px;font-size:10pt;border:1px solid #999;padding:6px 9px;margin-bottom:8px}.dados span{color:#555}
table{width:100%;border-collapse:collapse;font-size:9.4pt}th,td{border:1px solid #999;padding:3px 6px;vertical-align:middle;text-align:left}th{background:#f3f3f3;font-size:8.6pt}
.bx{display:inline-block;width:10px;height:10px;border:1.3px solid #111;margin-right:3px;vertical-align:-1px}.bx.x{background:#111}
.op{white-space:nowrap;margin-right:9px}.cor{color:#1f3a7a;font-style:italic}.alt{color:#9b1c1c;font-size:8pt;display:block}
.info{font-size:9pt}.info p{margin:3px 0}
.g{font-size:9pt}.g .it{padding:5px 0 4px;border-bottom:1px solid #bbb;break-inside:avoid}.g .it b{font-weight:700}.g .sim{margin-top:2px;font-size:8.8pt}
.imgs{display:grid;grid-template-columns:1fr;gap:4mm;margin:2mm 0 3mm}.imgs figure{margin:0;border:1px solid #bbb;padding:2mm;text-align:center;break-inside:avoid}
.imgs img{max-width:100%;max-height:112mm;object-fit:contain}.imgs figcaption{font-size:7.5pt;color:#666;margin-top:1mm}
.ok{border:1px solid #2f7a3f;background:#eef7f0;color:#1d4d28;padding:3px 8px;font-size:8.6pt;margin:3px 0 6px}
.ass{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:16mm;font-size:9pt;text-align:center}.ass div{border-top:1px solid #111;padding-top:3px}
.rub{font-size:8pt;color:#555}.foot{margin-top:6px;font-size:7.5pt;color:#666;display:flex;justify-content:space-between}
.it2 td{font-size:8.6pt;padding:2px 5px}`;

const bx = (on: boolean) => `<span class="bx${on ? " x" : ""}"></span>`;
function celMat(l: LinhaTermo, orig?: LinhaTermo) {
  const ops = (["MDP", "MDF", "NAO"] as const).map(m => `<span class="op">${bx(l?.mat === m)}${MAT_ROT[m]}</span>`).join("");
  const mudou = orig && ((orig.mat || null) !== (l?.mat || null) || (String(orig.cor || "").trim() !== String(l?.cor || "").trim() && l?.mat !== "NAO"));
  return `<td>${ops}${mudou ? `<span class="alt">alterado pelo cliente na assinatura (era: ${esc(MAT_ROT[orig!.mat || ""] || "em branco")}${orig!.cor ? " · " + esc(orig!.cor) : ""})</span>` : ""}</td><td class="cor">${l?.mat === "NAO" ? "—" : esc(l?.cor || "") || "&nbsp;"}</td>`;
}
function celAmort(v: Amort, orig?: Amort) {
  const mudou = orig !== undefined && (orig || null) !== (v || null);
  return `<td colspan="2">${(["com", "sem", "nao"] as const).map(m => `<span class="op">${bx(v === m)}${AMORT_ROT[m]}</span>`).join("")}${mudou ? `<span class="alt">alterado pelo cliente na assinatura (era: ${esc(AMORT_ROT[String(orig || "")] || "em branco")})</span>` : ""}</td>`;
}

/** HTML A4 do contrato. Sem `r`: versão para ler/imprimir antes (termo como veio do sistema, caixas em branco).
 *  Com `r` e `a`: contrato assinado (respostas do cliente, alterações marcadas e a página de assinatura com selfie). */
/** logo da Aliança (marca do contrato); o servidor troca pelo arquivo embutido para o contrato assinado não depender do site */
export const LOGO_URL = "https://alianca360.vercel.app/logo.png";

export function contratoHtml(d: ContratoDados, r?: RespostaContrato | null, a?: AssinaturaContrato | null, logo: string = LOGO_URL): string {
  const LOGO = esc(logo);
  const assinado = !!(r && a);
  const nome = a?.nome || r?.nome || "";
  const cpf = a?.cpf || r?.cpf || "";
  const cab = (t: string) => `<div class="hd"><div class="l"><img src="${LOGO}" alt="Aliança"><div><b>ALIANÇA MÓVEIS</b><div>Checklist do projeto final · ${esc(d.cliente.toUpperCase())}</div></div></div><div class="r"><b>${t}</b><br>Venda <b>${esc(d.venda)}</b></div></div>`;
  const rodape = `<div class="foot"><span>ALIANÇA 360 · venda ${esc(d.venda)}${assinado ? " · documento " + esc(a!.hash.slice(0, 16)) : ""}</span><span>${assinado ? "Assinado eletronicamente — ver última página" : "Rubrica: ________"}</span></div>`;

  // 1) termo de ciência do material
  const termos = d.ambientes.map((amb, i) => {
    const t = r?.termos?.[i] || amb.termo; const o = r ? amb.termo : undefined;
    return `<table style="margin-bottom:6px"><tr><th colspan="3" style="font-size:9.6pt;background:#e8ecf3">Ambiente ${i + 1}: ${esc(amb.nome)}</th></tr>
<tr><th style="width:26mm"></th><th>Material</th><th style="width:52mm">Cor</th></tr>
${LINHAS_TERMO.map(([k, rot]) => `<tr><td><b>${rot}</b></td>${celMat(t[k] as LinhaTermo, o ? (o[k] as LinhaTermo) : undefined)}</tr>`).join("")}
${AMORT.map(([k, rot]) => `<tr><td><b>${rot}</b></td>${celAmort(t[k] as Amort, o ? (o[k] as Amort) : undefined)}</tr>`).join("")}
${amb.fichaObs ? `<tr><td><b>Observações</b></td><td colspan="2" class="cor">${esc(amb.fichaObs)}</td></tr>` : ""}
</table>${assinado ? `<div class="ok">☑ Materiais do ambiente ${i + 1} conferidos e confirmados pelo cliente.</div>` : ""}`;
  }).join("");
  const pTermo = `<div class="pg">${cab("TERMO DE CIÊNCIA DO MATERIAL")}${d.ambientes.length <= 1 ? `<img class="logo" src="${LOGO}" alt="Aliança">` : ""}<h2>TERMO DE CIÊNCIA DO MATERIAL UTILIZADO</h2>
<div class="dados"><div><span>Cliente:</span> <b>${esc(d.cliente)}</b></div><div><span>Número da venda:</span> <b>${esc(d.venda)}</b></div>
<div><span>CPF:</span> <b>${esc(fmtCpf(cpf)) || "____________________"}</b></div><div><span>Data:</span> <b>${esc(d.data)}</b></div>
<div style="grid-column:1/-1"><span>Endereço:</span> ${esc(d.endereco)}</div>
<div style="grid-column:1/-1"><span>Ambiente(s):</span> <b>${d.ambientes.length} ambiente${d.ambientes.length === 1 ? "" : "s"}</b> — ${d.ambientes.map((a, i) => `<b>${i + 1} · ${esc(a.nome)}</b>`).join(", ")}</div></div>
<p>Eu, <b>${esc(nome) || "_______________________________________"}</b>, declaro que fui devidamente informado(a) e estou ciente de que os móveis projetados adquiridos junto à <b>Aliança Móveis</b> foram especificados e aprovados com base no(s) material(is) sinalizados abaixo:</p>
${termos}
<h3>Informações técnicas</h3><div class="info">${INFO_TECNICAS.map(x => `<p>• ${esc(x)}</p>`).join("")}</div>
${d.naoInclusos.length || d.obs || d.ferragens.length ? `<h3>Observações do checklist</h3><div class="info">${d.naoInclusos.length ? `<p><b>Não estão inclusos:</b> ${esc(d.naoInclusos.join(", "))}.</p>` : ""}${d.ferragens.length ? `<p><b>Ferragens:</b> ${esc(d.ferragens.join(" · "))}</p>` : ""}${d.obs ? `<p>${esc(d.obs)}</p>` : ""}</div>` : ""}
${assinado ? "" : `<div class="ass"><div>Assinatura do cliente</div><div>Data: ____/____/______</div></div>`}${rodape}</div>`;

  // 2) geral
  const pGeral = `<div class="pg quebra">${cab("GERAL")}<h2>GERAL</h2><div class="g">
${CONDICOES_CONTRATO.map((t, i) => `<div class="it"><b>${i + 1} - </b>${esc(t)}<div class="sim">${bx(!!(r && r.geral?.[i]))}Sim</div></div>`).join("")}</div>${rodape}</div>`;

  // 3) projeto de cada ambiente: imagens + checklist do projetista + o que foi comprado
  const pAmb = d.ambientes.map((amb, i) => {
    const fic = amb.ficha || [];
    return `<div class="pg quebra">${cab("PROJETO · AMBIENTE " + (i + 1))}<h2>AMBIENTE ${i + 1} DE ${d.ambientes.length}: ${esc(amb.nome.toUpperCase())}</h2>
${amb.imagens.length ? `<div class="imgs">${amb.imagens.map(x => `<figure><img src="${esc(x.src)}" alt=""><figcaption>${esc(x.nome)}</figcaption></figure>`).join("")}</div>` : `<p class="rub">Sem imagens anexadas para este ambiente.</p>`}
${fic.length ? `<h3>Checklist do ambiente <i>(conferido pelo projetista com o cliente)</i></h3><table>${fic.map(([k, v]) => `<tr><td>${esc(k)}</td><td style="width:22mm">${bx(v === true)}Sim</td><td style="width:22mm">${bx(v === false)}Não</td></tr>`).join("")}</table>` : ""}
${amb.fichaObs ? `<h3>Observações do ambiente</h3><p class="cor">${esc(amb.fichaObs)}</p>` : ""}
${amb.itens?.length ? `<h3>Resumo do que foi comprado <i>(sem valores)</i></h3><table class="it2"><tr><th style="width:18mm">Qtd</th><th>Descrição</th><th style="width:38mm">Medidas (L × A × P)</th></tr>${amb.itens.map(x => `<tr><td>${esc(x.qtd)}</td><td>${esc(x.descricao)}</td><td>${esc(x.medidas)}</td></tr>`).join("")}</table>` : ""}
${assinado ? `<div class="ok">☑ O cliente visualizou as imagens do projeto deste ambiente e está de acordo.</div>` : ""}${rodape}</div>`;
  }).join("");

  // 4) assinatura eletrônica
  let pAss = "";
  if (assinado) {
    const alts = d.ambientes.flatMap((amb, i) => diferencasTermo(amb.termo, r!.termos[i]).map(x => `Ambiente ${i + 1} · ${amb.nome} — ${x}`));
    pAss = `<div class="pg quebra">${cab("ASSINATURA ELETRÔNICA")}<h2>CONTRATO ASSINADO ELETRONICAMENTE</h2>
<p>O(a) cliente abaixo leu este documento, conferiu e confirmou os materiais de cada ambiente, marcou "Sim" em cada item do termo geral, visualizou as imagens do projeto e assinou eletronicamente, confirmando com uma foto (selfie) tirada no momento da assinatura.</p>
<table><tr><td style="width:34%">Cliente / venda</td><td><b>${esc(d.cliente)}</b> · venda ${esc(d.venda)}</td></tr>
<tr><td>Nome de quem assinou</td><td><b>${esc(a!.nome)}</b></td></tr><tr><td>CPF</td><td><b>${esc(fmtCpf(a!.cpf))}</b></td></tr>
<tr><td>Data e hora</td><td>${esc(a!.quando)} (horário de Brasília)</td></tr>
<tr><td>IP · aparelho</td><td style="font-size:8pt">${esc(a!.ip || "—")} · ${esc(a!.ua)}</td></tr>
<tr><td>Código do documento (SHA-256)</td><td style="font-size:7.5pt;word-break:break-all">${esc(a!.hash)}</td></tr>
<tr><td>Projetista</td><td>${esc(a!.projetista || d.projetista)}</td></tr></table>
<h3>O que o cliente confirmou</h3><div class="info">
<p>☑ Termo de ciência do material — ${d.ambientes.length} ambiente${d.ambientes.length === 1 ? "" : "s"} conferido${d.ambientes.length === 1 ? "" : "s"}</p>
<p>☑ Geral — ${CONDICOES_CONTRATO.length} itens marcados "Sim"</p>
<p>☑ Imagens do projeto — visualizadas e de acordo em todos os ambientes</p></div>
${alts.length ? `<h3>Alterações feitas pelo cliente no termo do material</h3><div class="info">${alts.map(x => `<p>• ${esc(x)}</p>`).join("")}</div>` : `<p class="rub">O cliente confirmou o termo do material como veio do sistema, sem alterações.</p>`}
<div style="display:flex;gap:18px;align-items:flex-end;margin-top:10px">
<div style="flex:1;text-align:center"><img src="${esc(a!.assinatura)}" style="max-width:100%;max-height:120px;border-bottom:1px solid #111" alt=""><div style="font-size:9pt;margin-top:3px">Assinatura do cliente — ${esc(a!.nome)}</div></div>
<div style="width:150px;text-align:center"><img src="${esc(a!.selfie)}" style="width:150px;height:190px;object-fit:cover;border-radius:6px;border:1px solid #999" alt=""><div style="font-size:8pt;margin-top:3px">Selfie no momento da assinatura</div></div></div>
<div class="foot"><span>ALIANÇA 360 · venda ${esc(d.venda)}</span><span>Assinatura eletrônica com selfie</span></div></div>`;
  }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contrato_${esc(d.cliente.split(" ")[0])}_${esc(d.venda)}</title><style>${CSS}</style></head><body><img class="marca" src="${LOGO}" alt="">
${pTermo}${pGeral}${pAmb}${pAss}</body></html>`;
}

