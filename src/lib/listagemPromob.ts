// Checklist · leitura da LISTAGEM do Promob (orçamento) que o projetista anexa ao finalizar.
// Regra: NADA de valor sai daqui — preço, condições de pagamento, descontos e total são descartados na leitura.
// Só fica o que serve para o checklist: cliente, projeto, módulos/peças com medidas, material, espessura, cores e ferragens.

export type ItemPdf = { str: string; x: number; y: number };

export type Tipo = "modulo" | "porta" | "painel" | "fundo" | "ferragem" | "consumivel";
export type LinhaListagem = {
  item: number; qtd: string; ref: string; descricao: string; medidas: string;
  linha: string;            // "Linha Modulada" / "Linha Planejada"
  tipo: Tipo;
  material: "MDP" | "MDF" | null;
  espessura: number | null; // mm
  cor: string | null;       // código da cor no fim da referência (ex.: "277")
  acabamento: string | null; // sigla antes da cor (ex.: "CCBP", "FBBP", "LCRE")
};
export type Listagem = {
  cliente: string; celular: string; email: string; projeto: string; data: string;
  linhas: LinhaListagem[];
  resumo: {
    materiais: ("MDP" | "MDF")[]; espessuras: number[]; fundo: number[];
    cores: { codigo: string; acabamento: string; onde: string[]; qtd: number }[];
    ferragens: string[];
    modulos: number; pecas: number; ignorados: number;
  };
  avisos: string[];
};

const RE_QTD = /^\d+(?:[.,]\d+)?\s*(UN|M2|ML|M|PC|CJ|KG)$/i;
const RE_MED = /^\d+(?:[.,]\d+)?\s*x\s*\d+(?:[.,]\d+)?\s*x\s*\d+(?:[.,]\d+)?$/i;
const RE_PRECO = /^(R\$\s*)?\d{1,3}(\.\d{3})*,\d{2}$/;

/** Classifica a peça pela descrição. */
function classificar(desc: string, linha: string, qtd: string): Tipo {
  const d = desc.toLowerCase();
  if (/parafuso|prego|fita de borda|sapata|suporte|cantoneira|cavilha|bucha|cola/.test(d)) return "consumivel";
  if (/dobradi|pist[aã]o|corredi|puxador|perfil|amortecedor|trilho|articulador|lixeira|aramado|cabideiro|led|ilumina/.test(d)) return "ferragem";
  if (/^fundo\b/.test(d.trim())) return "fundo";
  if (/porta|frente|gaveta/.test(d) && !/arm[aá]rio|balc[aã]o|paneleiro|torre|m[oó]dulo/.test(d)) return "porta";
  if (/linha modulada/i.test(linha) && /UN/i.test(qtd)) return "modulo";
  return "painel";
}

/** Converte os pedaços de texto do PDF (pdf.js) em listagem — sem nenhum valor. */
export function lerListagem(pags: ItemPdf[][]): Listagem {
  const avisos: string[] = [];
  let cliente = "", celular = "", email = "", projeto = "", data = "";
  const out: LinhaListagem[] = [];
  let linhaAtual = "";
  let semTexto = true;

  for (const itens of pags) {
    const vis = itens.filter(i => i.str.trim());
    if (vis.length) semTexto = false;
    // agrupa por linha (mesmo y, tolerância 3)
    const rows: { y: number; its: ItemPdf[] }[] = [];
    for (const it of [...vis].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const r = rows.find(r => Math.abs(r.y - it.y) <= 3);
      if (r) r.its.push(it); else rows.push({ y: it.y, its: [it] });
    }
    rows.forEach(r => r.its.sort((a, b) => a.x - b.x));
    const txt = (r: { its: ItemPdf[] }) => r.its.map(i => i.str.trim()).join(" ").replace(/\s+/g, " ").trim();

    const pendentes: { y: number; x: number; s: string }[] = []; // pedaços de descrição em 2 linhas
    const daPagina: (LinhaListagem & { _y: number; _xd: number })[] = [];
    for (const r of rows) {
      const t = txt(r);
      let m: RegExpMatchArray | null;
      if ((m = t.match(/Data:\s*(\d{2}\/\d{2}\/\d{4})/))) data ||= m[1];
      if ((m = t.match(/^Nome:\s*(.+?)\s+CPF:/))) cliente ||= m[1].trim();
      if ((m = t.match(/Celular:\s*([\d\s()+-]{8,})/))) celular ||= m[1].replace(/\D/g, "");
      if ((m = t.match(/E\s*-\s*mail:\s*(\S+@\S+)/))) email ||= m[1];
      if ((m = t.match(/^Projeto\s*-\s*(.+)$/))) projeto ||= m[1].trim();
      if ((m = t.match(/^-\s*(Linha .+)$/))) { linhaAtual = m[1].trim(); continue; }
      if (/^(Condições de Pagamento|Entradas Diferenciadas|Total Final)/i.test(t)) break; // daqui pra baixo é só valor

      const its = r.its.map(i => ({ ...i, s: i.str.trim() }));
      const iQtd = its.findIndex(i => RE_QTD.test(i.s));
      const iMed = its.findIndex(i => RE_MED.test(i.s));
      const num = its[0] && /^\d+$/.test(its[0].s) ? Number(its[0].s) : NaN;
      if (iQtd > 0 && iMed > iQtd && !isNaN(num)) {
        const ref = its[iQtd + 1]?.s || "";
        const desc = its.slice(iQtd + 2, iMed).map(i => i.s).join(" ");
        const medidas = its[iMed].s.replace(/\s*x\s*/gi, " × ");
        daPagina.push({ item: num, qtd: its[iQtd].s.replace(/\s+/, " "), ref, descricao: desc, medidas, linha: linhaAtual,
          tipo: "painel", material: null, espessura: null, cor: null, acabamento: null, _y: r.y, _xd: its[iQtd + 2]?.x ?? its[iQtd + 1].x + 90 });
      } else if (!RE_PRECO.test(t) && its.every(i => !RE_PRECO.test(i.s)) && its.length && its[0].x > 150 && its[0].x < 420 && !/Promob|Nome:|Endereço|Telefone|Referencia|Descri|Dimens|Pre[cç]o|Final|Item|Rep|Qtd/.test(t)) {
        pendentes.push({ y: r.y, x: its[0].x, s: t });
      }
    }
    // descrição quebrada em duas linhas: junta na linha da peça mais próxima (acima = início, abaixo = fim)
    for (const p of pendentes) {
      let alvo: any = null, dist = 99;
      for (const l of daPagina) { const d = Math.abs(l._y - p.y); if (d < dist && d <= 12) { dist = d; alvo = l; } }
      if (alvo) alvo.descricao = p.y > alvo._y ? `${p.s} ${alvo.descricao}`.trim() : `${alvo.descricao} ${p.s}`.trim();
    }
    for (const l of daPagina) { const { _y, _xd, ...rest } = l; out.push(rest); }
  }

  for (const l of out) {
    const d = l.descricao;
    l.tipo = classificar(d, l.linha, l.qtd);
    l.material = /\bMDF\b/i.test(d) || /MDF/i.test(l.ref) ? "MDF" : /\bMDP\b/i.test(d) ? "MDP" : null;
    const e = d.match(/(\d{1,2})\s*mm\b(?!\s*-)/i);
    l.espessura = e && ["painel", "porta", "fundo", "modulo"].includes(l.tipo) ? Number(e[1]) : null;
    const c = l.ref.match(/([A-Z]{2,6})\/(\d{2,4})\s*$/i);
    if (c) { l.cor = c[2]; l.acabamento = c[1].toUpperCase(); }
  }
  // espessura de peça sem "mm" na descrição: usa a 3ª medida quando é chapa (M2)
  for (const l of out) if (l.espessura == null && /M2/i.test(l.qtd) && l.tipo !== "consumivel") {
    const t = Number(l.medidas.split("×").pop()?.trim().replace(",", ".")); if (t > 0 && t <= 40) l.espessura = t;
  }

  const pecasChapa = out.filter(l => ["painel", "porta", "modulo"].includes(l.tipo));
  const materiais = [...new Set(pecasChapa.map(l => l.material).filter(Boolean))] as ("MDP" | "MDF")[];
  const espessuras = [...new Set(out.filter(l => ["painel", "porta"].includes(l.tipo)).map(l => l.espessura).filter((x): x is number => !!x))].sort((a, b) => a - b);
  const fundo = [...new Set(out.filter(l => l.tipo === "fundo").map(l => l.espessura).filter((x): x is number => !!x))];
  const mapaCor = new Map<string, { codigo: string; acabamento: string; onde: Set<string>; qtd: number }>();
  for (const l of out) if (l.cor && l.tipo !== "consumivel") {
    const k = l.cor;
    const o = mapaCor.get(k) || { codigo: l.cor, acabamento: "", onde: new Set<string>(), qtd: 0 };
    if (l.acabamento && !o.acabamento.split(", ").includes(l.acabamento)) o.acabamento = [o.acabamento, l.acabamento].filter(Boolean).join(", ");
    o.onde.add(l.tipo === "modulo" ? "módulos" : l.tipo === "porta" ? "portas" : l.tipo === "fundo" ? "fundo" : l.tipo === "ferragem" ? "ferragens" : "painéis / caixas");
    o.qtd++; mapaCor.set(k, o);
  }
  const ferragens = [...new Set(out.filter(l => l.tipo === "ferragem").map(l => `${l.descricao} (${l.qtd})`))];

  if (semTexto) avisos.push("O PDF não tem texto (foi impresso como imagem). Exporte de novo pelo Promob ou use “Microsoft Print to PDF” direto da tela de orçamento.");
  else if (!out.length) avisos.push("Não encontrei a tabela de itens — confira se é a listagem/orçamento do Promob.");
  if (out.length && !materiais.length) avisos.push("A listagem não diz se é MDP ou MDF — marque à mão.");
  if (materiais.length > 1) avisos.push("A listagem tem MDP e MDF — confira em cada ambiente.");
  if (mapaCor.size) avisos.push("As cores vêm só como código (ex.: /277). Confirme o nome da cor com o cliente.");
  const nums = out.map(l => l.item); const faltam = nums.length ? Array.from({ length: Math.max(...nums) }, (_, i) => i + 1).filter(n => !nums.includes(n)) : [];
  if (faltam.length) avisos.push(`Itens não lidos: ${faltam.join(", ")} — confira no arquivo.`);

  return {
    cliente, celular, email, projeto, data, linhas: out,
    resumo: { materiais, espessuras, fundo, cores: [...mapaCor.values()].map(c => ({ ...c, onde: [...c.onde] })), ferragens,
      modulos: out.filter(l => l.tipo === "modulo").length, pecas: out.filter(l => ["painel", "porta", "fundo"].includes(l.tipo)).length,
      ignorados: out.filter(l => l.tipo === "consumivel").length },
    avisos,
  };
}

/** Lê o arquivo PDF (no navegador) e devolve a listagem pronta para o checklist. */
export async function lerListagemArquivo(buf: ArrayBuffer): Promise<Listagem> {
  const pdfjs: any = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url" as any)).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pags: ItemPdf[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pags.push(tc.items.map((i: any) => ({ str: i.str, x: i.transform[4], y: i.transform[5] })));
  }
  return lerListagem(pags);
}
