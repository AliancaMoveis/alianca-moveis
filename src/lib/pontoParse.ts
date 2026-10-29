// RH · Folha ponto — leitor puro dos cartões ponto do Secullum (PDF com texto). Sem dependências.

export type Item = { str: string; x: number; y: number };
export type DiaPonto = { data: string; rotulo: string; batidas: string[]; trabalhado: number; ex50: number; ex100: number; faltas: number; folga: boolean; feriado: boolean };
export type Cartao = {
  cpf: string; nome: string; departamento: string; funcao: string; admissao: string | null;
  periodo_de: string; periodo_ate: string; emitido_em: string;
  tot_ex50: number; tot_ex100: number; tot_faltas: number; dias: DiaPonto[];
};

const iso = (br: string) => { const m = br.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + "-" + m[2] + "-" + m[1] : ""; };
export const minutos = (hhmm: string) => { const m = hhmm.match(/(\d{1,3}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : 0; };
export const hm = (min: number) => { const n = Math.round(Math.abs(min)); return (min < 0 ? "-" : "") + Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0"); };

/** agrupa os pedaços de texto do PDF em linhas (mesma altura), da primeira para a última */
function linhas(itens: Item[]): Item[][] {
  const ls: { y: number; it: Item[] }[] = [];
  for (const i of itens) {
    if (!i.str.trim()) continue;
    const l = ls.find(l => Math.abs(l.y - i.y) < 3);
    if (l) l.it.push(i); else ls.push({ y: i.y, it: [i] });
  }
  ls.sort((a, b) => b.y - a.y);
  return ls.map(l => l.it.sort((a, b) => a.x - b.x));
}
const texto = (l: Item[]) => l.map(i => i.str).join(" ").replace(/\s+/g, " ").trim();

/** Lê um cartão ponto do Secullum a partir dos pedaços de texto de cada página. */
export function parseCartao(paginas: Item[][], arquivo = ""): Cartao {
  const c: Cartao = { cpf: "", nome: "", departamento: "", funcao: "", admissao: null, periodo_de: "", periodo_ate: "", emitido_em: "", tot_ex50: 0, tot_ex100: 0, tot_faltas: 0, dias: [] };
  for (const pg of paginas) {
    const ls = linhas(pg);
    // posições das colunas EX50% / EX100% / FALTAS (linha de cabeçalho da tabela)
    let xEx50 = 0, xEx100 = 0, xFaltas = 0, xDeptо = 0, xFuncao = 0;
    for (const l of ls) {
      for (const i of l) {
        const s = i.str.trim();
        if (s === "EX50%") xEx50 = i.x; if (s === "EX100%") xEx100 = i.x; if (s === "FALTAS") xFaltas = i.x;
        if (s.startsWith("DEPARTAMENTO")) xDeptо = i.x; if (s.startsWith("FUNÇÃO") || s.startsWith("FUNCAO")) xFuncao = i.x;
      }
    }
    for (let li = 0; li < ls.length; li++) {
      const l = ls[li], t = texto(l);
      const per = t.match(/Período:\s*(\d{2}\/\d{2}\/\d{4})\s*até\s*(\d{2}\/\d{2}\/\d{4})/);
      if (per) { c.periodo_de = iso(per[1]); c.periodo_ate = iso(per[2]); continue; }
      const em = t.match(/Emitido em\s+(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})/); if (em) c.emitido_em = em[1];
      if (/^NOME:$/.test(t) && ls[li + 1]) { if (!c.nome) c.nome = texto(ls[li + 1]); continue; }
      if (t.startsWith("ADMISSÃO:") && ls[li + 1]) {
        const v = texto(ls[li + 1]); const cpf = v.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/); const adm = v.match(/\d{2}\/\d{2}\/\d{4}/);
        if (cpf && !c.cpf) c.cpf = cpf[0]; if (adm && !c.admissao) c.admissao = iso(adm[0]);
        continue;
      }
      if (t.startsWith("CNPJ:") && ls[li + 1] && xDeptо && xFuncao) {
        for (const i of ls[li + 1]) {
          const s = i.str.trim(); if (!s) continue;
          if (i.x >= xFuncao - 4) c.funcao = (c.funcao + " " + s).trim();
          else if (i.x >= xDeptо - 4) c.departamento = (c.departamento + " " + s).trim();
        }
        continue;
      }
      // linha de dia: começa com dd/mm/aaaa
      const d0 = l[0] && l[0].str.trim().match(/^(\d{2}\/\d{2}\/\d{4})(?:\s*-\s*(\S+))?/);
      if (d0) {
        const dia: DiaPonto = { data: iso(d0[1]), rotulo: d0[2] || "", batidas: [], trabalhado: 0, ex50: 0, ex100: 0, faltas: 0, folga: false, feriado: false };
        for (let k = 0; k < l.length; k++) {
          const s = l[k].str.trim(); if (!s) continue;
          if (k === 0 && s.startsWith(d0[1])) { const resto = s.slice(10).replace(/[-\s]+/g, ""); if (!dia.rotulo && resto) dia.rotulo = resto; continue; }
          if (!dia.rotulo && /^-?\s*[A-Za-zÀ-ú]{3}$/.test(s.replace("-", "").trim()) && l[k].x < (xEx50 || 1e9) * 0.35) { dia.rotulo = s.replace("-", "").trim(); continue; }
          if (/folga/i.test(s)) { dia.folga = true; continue; }
          const hh = s.match(/\d{1,3}:\d{2}/); if (!hh) continue;
          const v = minutos(hh[0]); const x = l[k].x;
          if (xFaltas && x >= xFaltas - 6) dia.faltas += v;
          else if (xEx100 && x >= xEx100 - 6) dia.ex100 += v;
          else if (xEx50 && x >= xEx50 - 6) dia.ex50 += v;
          else dia.batidas.push(hh[0]);
        }
        dia.feriado = /^fer/i.test(dia.rotulo);
        for (let p = 0; p + 1 < dia.batidas.length; p += 2) dia.trabalhado += minutos(dia.batidas[p + 1]) - minutos(dia.batidas[p]);
        if (dia.data) c.dias.push(dia);
        continue;
      }
      if (/^TOTAIS/i.test(t)) {
        for (const i of l) {
          const hh = i.str.trim().match(/\d{1,3}:\d{2}/); if (!hh) continue;
          const v = minutos(hh[0]); const x = i.x;
          if (xFaltas && x >= xFaltas - 6) c.tot_faltas += v;
          else if (xEx100 && x >= xEx100 - 6) c.tot_ex100 += v;
          else if (xEx50 && x >= xEx50 - 6) c.tot_ex50 += v;
        }
      }
    }
  }
  // o mesmo dia pode aparecer duas vezes (quebra de página): junta
  // fora do período do cartão (ex.: a data de admissão no cabeçalho) não é dia de ponto
  if (c.periodo_de && c.periodo_ate) c.dias = c.dias.filter(d => d.data >= c.periodo_de && d.data <= c.periodo_ate);
  const vist = new Map<string, DiaPonto>();
  for (const d of c.dias) { const e = vist.get(d.data); if (!e) vist.set(d.data, d); else if (d.batidas.length > e.batidas.length) vist.set(d.data, d); }
  c.dias = Array.from(vist.values()).sort((a, b) => a.data.localeCompare(b.data));
  if (!c.nome) throw new Error((arquivo ? arquivo + ": " : "") + "não encontrei o nome do funcionário — é o PDF do cartão ponto do Secullum?");
  if (!c.dias.length) throw new Error((arquivo ? arquivo + ": " : "") + "não encontrei os dias — o PDF pode estar escaneado (imagem), aí não dá para ler automaticamente.");
  return c;
}

