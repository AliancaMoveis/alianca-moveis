// Teto do projeto final de uma venda do Exact.
//
// A venda pode ter duas coisas misturadas: os CUPONS DE PLANEJADO (#Cupom1, #Cupom2…), que são o
// móvel projetado, e produtos de LINHA PRONTA (cabeceira, mesa de cabeceira…), que são comprados
// prontos e não passam pelo projeto. O teto do projeto final — e, com ele, a base da recuperação —
// é só a soma dos cupons de planejado. O "valor total bruto" da venda inclui a linha pronta e por
// isso é maior: na venda 1311299, bruto R$ 104.657,68 e teto R$ 102.526,80 (R$ 2.130,88 de linha
// pronta). Usar o bruto inflava a diferença e pagava comissão a mais ao projetista.
//
// Quando a venda não tem nenhum cupom de planejado (venda só de linha pronta, ou nome fora do
// padrão), o teto é o próprio bruto — é o que havia antes e continua certo nesse caso.

/** o produto é um cupom de planejado? (no Exact eles vêm como "#Cupom1", "#Cupom2"…) */
export const ehCupomPlanejado = (nome: string) => /^#?\s*cupom/i.test(String(nome || ""));

export type TetoVenda = { teto: number | null; nCupom: number; nPronta: number; bruto: number | null };

/** `dados` é o objeto que a função checklist-arquivos devolve: { venda, produtos, cliente } */
export function tetoVenda(dados: any): TetoVenda {
  const v = dados?.venda || {};
  const ps: any[] = Array.isArray(dados?.produtos) ? dados.produtos : [];
  const bruto = v.bruto == null ? null : Number(v.bruto);
  const cupons = ps.filter(p => ehCupomPlanejado(p?.nome));
  const nCupom = cupons.length;
  const teto = nCupom ? Math.round(cupons.reduce((t, p) => t + (Number(p.total) || 0), 0) * 100) / 100 : bruto;
  return { teto, nCupom, nPronta: ps.length - nCupom, bruto };
}
