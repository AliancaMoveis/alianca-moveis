// Planilha de tickets do Exact (medidas) → linha para importar
import { dataPlanilha } from "./planilha";
const tira = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const SIT_ETAPA: Record<string, string> = { pendentes: "pendente", pendente: "pendente", aguardandomedicao: "agendada", analise: "realizada", aprovados: "liberada", aprovado: "liberada" };
export function linhaMedida(l: Record<string, string>) {
  const t = l["Título"] || "", d = l["Descrição"] || "";
  const vm = t.match(/^\s*(\d{6,})/) || d.match(/venda\D{0,8}(1\d{6})/i) || (t + " " + d).match(/\b(1\d{6})\b/);
  const linhas = d.split(/\n/).map(x => x.trim()).filter(Boolean);
  const fimEnd = linhas.findIndex((x, i) => i > 0 && (/^\(?\d{2}\)?\s?9?[\d\s-]{8,}/.test(x) || /\?/.test(x) || /^data limite/i.test(x)));
  const endereco = linhas.slice(1, fimEnd > 0 ? fimEnd : 3).filter(x => !/simplificada|favor|vendedor/i.test(x)).join(", ");
  const sit = tira(l["Situação"] || "");
  return {
    venda: vm ? vm[1] : "", cliente: l["Contato"] || "", telefone: l["Telefone 1"] && l["Telefone 1"] !== "N/A" ? l["Telefone 1"] : (l["Telefone 2"] || "").replace("N/A", ""),
    situacao: l["Situação"] || "", etapa: SIT_ETAPA[sit] || "", medidor: (l["Medidor"] || "").trim(), endereco,
    qtdAmbientes: (d.match(/quantidade de ambientes[^:]*:\s*(\d+)/i) || [])[1] || "", ambientes: ((d.match(/quais ambientes\?:\s*([^\n]+)/i) || [])[1] || "").trim(),
    inclusao: dataPlanilha(l["Inclusão"] || "").slice(0, 10), envio: dataPlanilha(l["Data Envio Medição"] || ""), preenchimento: dataPlanilha(l["Data Preenchimento"] || ""),
    conclusao: dataPlanilha(l["Conclusão"] || ""), descricao: d.slice(0, 600),
  };
}
