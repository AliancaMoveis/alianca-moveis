// Direcionar consultor: avisa quando ele já tem cliente perto do horário (dentro de 60 minutos) e sugere outro consultor livre.
// Pode direcionar mesmo assim — é só uma confirmação. (As regiões dos consultores entram depois na sugestão.)
import { fmtDateTime } from "./regras";

const ms = (v: any) => { const s = String(v || "").replace(" ", "T").slice(0, 16); const d = s.length >= 16 ? new Date(s) : null; return d && !isNaN(+d) ? +d : NaN; };
const FECHADO = ["visita_cancelada", "loja_cancelada", "reprovado", "nao_vai_comprar", "vendido", "vendido_revisao"];

/** agenda fechada pelo consultor (viagem, consulta…) que pega este horário */
export function bloqueioDe(R: any, uid: string, quando: any): any | null {
  const s = String(quando || "").replace(" ", "T"); if (!uid || s.length < 10) return null;
  const d = s.slice(0, 10), h = s.slice(11, 16) || "12:00";
  return (R.state.consBloqueios || []).find((b: any) => b.tipo !== "evento" && b.usuarioId === uid && d >= b.de && d <= b.ate &&
    (b.periodo === "dia" || (b.periodo === "manha" && h < "12:00") || (b.periodo === "tarde" && h >= "12:00") || (b.periodo === "horario" && h >= b.ini && h < b.fim))) || null;
}
export const textoBloqueio = (b: any) => b ? "🔒 agenda fechada: " + b.motivo + (b.obs ? " (" + b.obs + ")" : "") + (b.periodo === "manha" ? " · manhã" : b.periodo === "tarde" ? " · tarde" : b.periodo === "horario" ? " · " + b.ini + "–" + b.fim : "") : "";
/** clientes do consultor com visita a menos de 60 min do horário */
export function conflitosConsultor(R: any, uid: string, quando: any, excetoId?: string): any[] {
  const t = ms(quando); if (!uid || isNaN(t)) return [];
  return (R.state.chamados || []).filter((x: any) => x.consultorId === uid && x.id !== excetoId && x.dataVisita && !(x.tratativa && x.tratativa.realizada)
    && !FECHADO.includes(R.statusClienteDe(x)) && Math.abs(ms(x.dataVisita) - t) < 60 * 60000)
    .sort((a: any, b: any) => ms(a.dataVisita) - ms(b.dataVisita));
}
/** consultor sugerido: sem cliente nos 60 min e com menos visitas no dia */
export function sugestaoConsultor(R: any, quando: any, excetoUid?: string, excetoId?: string): any | null {
  const t = ms(quando); if (isNaN(t)) return null;
  const dia = String(quando).slice(0, 10);
  const noDia = (uid: string) => (R.state.chamados || []).filter((x: any) => x.consultorId === uid && String(x.dataVisita || "").slice(0, 10) === dia && !(x.tratativa && x.tratativa.realizada)).length;
  return R.consultores().filter((u: any) => u.id !== excetoUid && !bloqueioDe(R, u.id, quando) && !conflitosConsultor(R, u.id, quando, excetoId).length)
    .sort((a: any, b: any) => noDia(a.id) - noDia(b.id) || a.nome.localeCompare(b.nome))[0] || null;
}
export function textoConflito(R: any, uid: string, quando: any, excetoId?: string): string {
  const b = bloqueioDe(R, uid, quando); if (b) return R.nomeUser(uid) + " está com a " + textoBloqueio(b) + " nesse dia/horário — não dá para direcionar.";
  const cf = conflitosConsultor(R, uid, quando, excetoId); if (!cf.length) return "";
  return R.nomeUser(uid) + " já tem " + cf.length + " cliente(s) dentro de 60 min deste horário: " + cf.map((x: any) => x.cliente + " às " + fmtDateTime(x.dataVisita).slice(-5)).join(", ") + ".";
}
/** confirmação na hora de direcionar; true = pode seguir */
export function confirmarConsultor(R: any, uid: string, quando: any, excetoId?: string): boolean {
  const b = bloqueioDe(R, uid, quando);
  if (b) { const sug = sugestaoConsultor(R, quando, uid, excetoId); alert("🔒 " + R.nomeUser(uid) + " fechou a agenda nesse horário: " + b.motivo + (b.obs ? " (" + b.obs + ")" : "") + "." + (sug ? "\n\nSugestão: " + sug.nome + " está livre." : "")); return false; }
  const txt = textoConflito(R, uid, quando, excetoId); if (!txt) return true;
  const sug = sugestaoConsultor(R, quando, uid, excetoId);
  return confirm("⚠️ " + txt + "\n\n" + (sug ? "Sugestão: " + sug.nome + " está livre nesse horário.\n\n" : "Nenhum outro consultor está livre nesse horário.\n\n") + "Direcionar para " + R.nomeUser(uid) + " mesmo assim?");
}
/** marcação curta na lista de consultores */
export const marcaConsultor = (R: any, uid: string, quando: any, excetoId?: string) => !quando ? "" : bloqueioDe(R, uid, quando) ? " · 🔒 agenda fechada" : conflitosConsultor(R, uid, quando, excetoId).length ? " · ⚠️ já tem cliente no horário" : "";
