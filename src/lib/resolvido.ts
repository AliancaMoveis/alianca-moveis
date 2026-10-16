// "Já resolvido por outro caminho": o pedido do call center para o checklist (ou para medir) continua aberto,
// mas o cliente já foi agendado em outro atendimento do mesmo pedido/telefone. Mostra direto na lista, sem abrir a ficha.
import { fmtDateTime } from "./regras";

const k8 = (s: string) => String(s || "").split(/[\/,;]| e |\s{2,}/).map(t => t.replace(/\D/g, "")).filter(d => d.length >= 8).map(d => d.slice(-8));
const ckDe = (c: any) => (c.tratativa || {}).checklist || {};
const etapaCk = (c: any) => ckDe(c).etapa || (c.status === "concluida" ? "realizado" : "a_contatar");
const mesmo = (a: any, b: any) => (a.pedido && b.pedido && String(a.pedido).trim() === String(b.pedido).trim()) || k8(a.telefone).some(t => k8(b.telefone).includes(t));

export function jaResolvido(R: any, st: any, c: any): { txt: string; id: string } | null {
  if (!c || c.status === "concluida") return null;
  if (c.tipo === "checklist") {
    if (["agendado", "realizado"].includes(etapaCk(c))) return null;
    const outros = st.chamados.filter((x: any) => x.tipo === "checklist" && x.id !== c.id && mesmo(c, x) && ["agendado", "realizado"].includes(etapaCk(x)));
    const ag = outros.find((x: any) => etapaCk(x) === "agendado" && ckDe(x).agendadoPara) || outros[0];
    if (!ag) return null;
    return etapaCk(ag) === "realizado"
      ? { txt: "✅ Checklist já realizado" + (ckDe(ag).realizadoEm ? " em " + fmtDateTime(ckDe(ag).realizadoEm).slice(0, 5) : "") + " (" + ag.id + ")", id: ag.id }
      : { txt: "✅ Já agendado no checklist para " + fmtDateTime(ckDe(ag).agendadoPara) + " (" + ag.id + ")", id: ag.id };
  }
  if (c.tipo === "solicitacao_medida") {
    const m = st.chamados.find((x: any) => x.tipo === "medidas" && mesmo(c, x) && ["agendada", "realizada", "validar", "liberada", "em_obra"].includes(R.etapaMedida(x)) && x.status !== "cancelada");
    if (!m) return null;
    const e = R.etapaMedida(m);
    return { txt: e === "agendada" ? "✅ Medida já agendada" + (m.medidorId ? " com " + R.nomeUser(m.medidorId) : "") + " (" + m.id + ")" : e === "liberada" || e === "em_obra" ? "✅ Medida já aprovada (" + m.id + ")" : "✅ Medida já feita, em análise (" + m.id + ")", id: m.id };
  }
  return null;
}
