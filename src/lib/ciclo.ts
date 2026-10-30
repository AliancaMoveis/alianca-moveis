// Ciclo de pagamento dos consultores externos: do dia 29 de um mês ao dia 28 do mês seguinte.
// O ciclo leva o nome do mês em que FECHA (ex.: "ciclo de outubro/2026" = 29/09 a 28/10).
export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** [início, fim] do ciclo que fecha no dia 28 do mês "aaaa-mm" (começa no dia seguinte ao 28 do mês anterior) */
export function cicloDoMes(ym: string): [string, string] {
  const [y, m] = ym.split("-").map(Number);
  const fim = new Date(Date.UTC(y, m - 1, 28));
  const ini = new Date(Date.UTC(y, m - 2, 28)); ini.setUTCDate(ini.getUTCDate() + 1);
  return [iso(ini), iso(fim)];
}
/** mês (aaaa-mm) do ciclo que contém a data */
export const cicloDe = (data: string) => { const [y, m, d] = data.slice(0, 10).split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, 1)); if (d > 28) dt.setUTCMonth(dt.getUTCMonth() + 1); return iso(dt).slice(0, 7); };
/** mês do último ciclo já FECHADO na data */
export const ultimoFechado = (hoje: string) => somaMes(cicloDe(hoje), -1);
export const somaMes = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); return iso(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7); };
export const nomeCiclo = (ym: string) => MESES[Number(ym.slice(5, 7)) - 1] + "/" + ym.slice(0, 4);
export const brCurto = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);
export const diasAte = (de: string, ate: string) => Math.round((Date.parse(ate + "T12:00:00Z") - Date.parse(de + "T12:00:00Z")) / 86400000);
