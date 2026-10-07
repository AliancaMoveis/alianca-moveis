// Números do call center por atendente (usados no dashboard do computador e no app)
const FIM_TXT = (t: string) => t.startsWith("Status → Concluída") || t.startsWith("✓ Atendimento finalizado");
export const concluidoEm = (c: any): string | null => { const h = (c.historico || []).filter((x: any) => FIM_TXT(String(x.texto))); return h.length ? h[h.length - 1].quando : null; };
const dentro = (v: any, de: string, ate: string) => { if (!v) return false; const d = new Date(v); return d >= new Date(de + "T00:00:00") && d <= new Date(ate + "T23:59:59"); };
/** horas entre abrir e finalizar */
export const horasAtend = (c: any): number | null => { const f = concluidoEm(c); if (!f) return null; const h = (+new Date(f) - +new Date(c.criadoEm)) / 3600000; return h >= 0 ? h : null; };
export const mediaHoras = (l: any[]): number | null => { const hs = l.map(horasAtend).filter((x): x is number => x != null); return hs.length ? hs.reduce((s, x) => s + x, 0) / hs.length : null; };
/** "12 min", "3,5 h", "2,1 dias" */
export const fmtTempo = (h: number | null): string => h == null ? "—" : h < 1 ? Math.max(1, Math.round(h * 60)) + " min" : h < 48 ? (Math.round(h * 10) / 10).toString().replace(".", ",") + " h" : (Math.round(h / 24 * 10) / 10).toString().replace(".", ",") + " dias";

/** por atendente do call center: abertos por ela no período, finalizados, em aberto, na ligação e tempo médio até finalizar */
export function porAtendente(R: any, cc: any[], de: string, ate: string) {
  const atendentes = R.state.usuarios.filter((u: any) => u.ativo && (u.setores || []).includes("callcenter"));
  return atendentes.map((u: any) => {
    const reg = cc.filter((c: any) => c.solicitanteId === u.id && dentro(c.criadoEm, de, ate));
    const fin = cc.filter((c: any) => c.solicitanteId === u.id && c.status === "concluida" && dentro(concluidoEm(c), de, ate));
    const lig = fin.filter((c: any) => { const h = horasAtend(c); return h != null && h < 0.25; });
    const aberto = cc.filter((c: any) => c.solicitanteId === u.id && c.status !== "concluida");
    const fora = aberto.filter((c: any) => ["critico", "atrasado"].includes(R.prioridade(c)));
    return { u, reg, fin, lig, aberto, fora, tm: mediaHoras(fin) };
  }).filter((x: any) => x.reg.length || x.fin.length || x.aberto.length).sort((a: any, b: any) => b.reg.length - a.reg.length);
}
