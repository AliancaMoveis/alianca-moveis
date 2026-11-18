// 💳 Crediário da loja — coeficientes e a conta ao contrário.
//
// A TABELA abaixo é a mesma do papel ("TABELA 01/07/2026"), copiada número a número.
// NÃO é uma fórmula: a taxa embutida cai conforme o plano aumenta (6,9% a.m. no 3x,
// 5,4% no 12x, 4,8% no 36x) e as colunas 60 e 100 não são múltiplo exato da coluna 30
// (quase ×1,045 e ×1,045², mas o arredondamento difere em metade das linhas — daria até
// R$ 6 de erro por parcela numa venda de R$ 20 mil). Por isso os números entram como estão.
//
// Quando sair tabela nova, troque os números e a data de VIGENCIA.
//
// COMO A CONTA É USADA AQUI (o contrário do normal):
// O uso comum é "tenho R$ X, quanto fica a parcela?" → parcela = X × coeficiente.
// Na negociação a pergunta é outra: o cliente tem que enxergar um parcelamento SEM JUROS,
// então quem se mexe é o preço. A loja fixa quanto precisa receber (o valor à vista que o
// gerente fechou) e o preço de etiqueta sobe até que, descontado o custo do parcelamento,
// sobre aquele líquido:
//
//     etiqueta = líquido × n × coeficiente(n, dias)      parcela = etiqueta ÷ n
//
// O que sobra entre a etiqueta e o valor cheio é o desconto que ainda cabe. Em plano longo
// não sobra nada — a etiqueta passa do valor cheio e o parcelamento só fecha cobrando mais.
// É isso que a tela mostra, para o gerente decidir o desconto sabendo o que recebe.

export const VIGENCIA = "01/07/2026";
/** primeiro vencimento, em dias */
export const PRIMEIRO: [number, string][] = [[30, "30 dias"], [60, "60 dias"], [100, "100 dias"]];

/** coeficiente por plano (nº de parcelas) → [30 dias, 60 dias, 100 dias] */
export const TABELA: Record<number, [number, number, number]> = {
  3: [0.3806, 0.3979, 0.4159], 4: [0.2917, 0.3049, 0.3188], 5: [0.2394, 0.2503, 0.2617],
  6: [0.2038, 0.2131, 0.2228], 7: [0.1784, 0.1866, 0.1951], 8: [0.1595, 0.1667, 0.1743],
  9: [0.1447, 0.1513, 0.1582], 10: [0.1330, 0.1390, 0.1453], 11: [0.1234, 0.1290, 0.1348],
  12: [0.1154, 0.1206, 0.1261], 13: [0.1087, 0.1136, 0.1187], 14: [0.1029, 0.1076, 0.1124],
  15: [0.0980, 0.1024, 0.1069], 16: [0.0936, 0.0978, 0.1022], 17: [0.0898, 0.0938, 0.0980],
  18: [0.0864, 0.0903, 0.0943], 19: [0.0834, 0.0871, 0.0910], 20: [0.0807, 0.0843, 0.0881],
  21: [0.0783, 0.0818, 0.0854], 22: [0.0761, 0.0795, 0.0830], 23: [0.0741, 0.0774, 0.0808],
  24: [0.0723, 0.0755, 0.0789], 25: [0.0707, 0.0738, 0.0770], 26: [0.0691, 0.0722, 0.0754],
  27: [0.0677, 0.0707, 0.0739], 28: [0.0665, 0.0694, 0.0725], 29: [0.0653, 0.0682, 0.0712],
  30: [0.0642, 0.0670, 0.0700], 31: [0.0631, 0.0659, 0.0688], 32: [0.0622, 0.0649, 0.0678],
  33: [0.0613, 0.0640, 0.0668], 34: [0.0605, 0.0632, 0.0659], 35: [0.0597, 0.0624, 0.0651],
  36: [0.0590, 0.0616, 0.0643],
};
export const PLANOS = Object.keys(TABELA).map(Number).sort((a, b) => a - b);

export const coeficiente = (plano: number, dias: number) => {
  const l = TABELA[plano]; if (!l) return 0;
  const i = PRIMEIRO.findIndex(([d]) => d === dias);
  return l[i < 0 ? 0 : i] || 0;
};

export type Plano = {
  plano: number;              // nº de parcelas
  coef: number;
  etiqueta: number;           // preço que o cliente vê (n × parcela), para a loja receber `liquido`
  parcela: number;
  desconto: number;           // quanto ainda cabe de desconto sobre o valor cheio (negativo = não cabe)
  descontoRS: number;
  cabe: boolean;              // a etiqueta cabe dentro do valor cheio?
};

/** para cada plano: o preço "sem juros" que preserva o líquido, e o desconto que ainda sobra */
export function planos(liquido: number, bruto: number, dias: number): Plano[] {
  return PLANOS.map(p => {
    const coef = coeficiente(p, dias);
    const etiqueta = Math.round(liquido * p * coef * 100) / 100;
    const descontoRS = Math.round((bruto - etiqueta) * 100) / 100;
    return { plano: p, coef, etiqueta, parcela: Math.round(etiqueta / p * 100) / 100,
      desconto: bruto ? descontoRS / bruto : 0, descontoRS, cabe: etiqueta <= bruto + 0.004 };
  });
}

/** o caminho normal, para conferência: quanto a loja recebe por uma parcela que já existe */
export const liquidoDe = (parcela: number, plano: number, dias: number) => {
  const c = coeficiente(plano, dias); return c ? Math.round(parcela / c * 100) / 100 : 0;
};
