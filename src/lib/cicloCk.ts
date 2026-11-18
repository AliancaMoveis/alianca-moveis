// Ciclo de pagamento do pessoal do checklist: fecha todo dia 25.
// O ciclo "de novembro" vai de 26/10 até 25/11 — é o que eles chamam de "o mês deles".
// (O ciclo dos consultores externos é outro, 29 → 28, e fica em regras.ts.)

const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const d2 = (n: number) => String(n).padStart(2, "0");

/** o ciclo (aaaa-mm) em que uma data cai: do dia 26 em diante já conta para o ciclo do mês seguinte */
export function cicloDe(iso: string): string {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!y || !m) return "";
  return Number(d) >= 26 ? (m === 12 ? `${y + 1}-01` : `${y}-${d2(m + 1)}`) : `${y}-${d2(m)}`;
}

/** começo, fim e nome de um ciclo */
export function ciclo(ym: string): { de: string; ate: string; nome: string; curto: string } {
  const [y, m] = String(ym || "").split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  const de = `${py}-${d2(pm)}-26`, ate = `${y}-${d2(m)}-25`;
  return { de, ate, nome: MES[m - 1] + " de " + y, curto: `26/${d2(pm)} a 25/${d2(m)}` };
}

/** anda n ciclos a partir de um (negativo volta) */
export function moverCiclo(ym: string, n: number): string {
  const [y, m] = String(ym || "").split("-").map(Number);
  const t = (y * 12 + (m - 1)) + n;
  return `${Math.floor(t / 12)}-${d2((t % 12) + 1)}`;
}
