// Cor do cliente conforme o status real — a mesma nos cartões do celular e na agenda dos consultores.
import { hojeISO } from "./regras";
import { vindaConfirmada } from "../comp/Situacao";

export const RESGATAR = ["visita_cancelada", "loja_cancelada", "nao_compareceu", "sem_resposta", "reprovado", "ausente_endereco"];
export type CorCli = { k: "canc" | "conf" | "loja" | "real" | "ctt" | "dir"; cor: string; fundo: string; txt: string };
export const CORES_CLI: Record<CorCli["k"], { cor: string; fundo: string; txt: string }> = {
  canc: { cor: "#c0392b", fundo: "#fdecea", txt: "🔄 Resgatar" },
  conf: { cor: "#0f8a5f", fundo: "#e3f6ee", txt: "✅ Confirmado" },
  loja: { cor: "#1f6fd6", fundo: "#e6efff", txt: "🏬 Agendado loja" },
  real: { cor: "#0e9488", fundo: "#e0f5f3", txt: "✓ Visita feita" },
  ctt: { cor: "#c99400", fundo: "#fff5d6", txt: "📞 Em contato" },
  dir: { cor: "#64748b", fundo: "#eef1f5", txt: "🧭 Direcionado · sem contato" },
};
/** eu = quem está vendo (vendedor usa "Já estou em contato"); sem eu, vale o contato do consultor */
export function corCliente(R: any, c: any, eu?: string): CorCli {
  const sc = R.statusClienteDe(c); const t = c.tratativa || {};
  const futuraLoja = !!c.dataLoja && String(c.dataLoja).slice(0, 10) >= hojeISO() && !c.venda && !["loja_cancelada", "nao_compareceu", "reprovado", "visita_cancelada", "atendido"].includes(sc);
  const ctt = eu && c.atendenteId === eu ? !!t.emContato : !!t.contatoIniciado;
  const k: CorCli["k"] = RESGATAR.includes(sc) && !c.venda ? "canc" : futuraLoja && vindaConfirmada(c) ? "conf" : futuraLoja ? "loja" : t.realizada ? "real" : ctt ? "ctt" : "dir";
  return { k, ...CORES_CLI[k] };
}
