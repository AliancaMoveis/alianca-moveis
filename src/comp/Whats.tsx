// Botão do WhatsApp (verde escuro) — abre a conversa direto com o número
import { linkWhats } from "../lib/regras";

export const VERDE_WHATS = "#075E54";
export function BotaoWhats({ tel, texto = "", rotulo = "WhatsApp", sm = true }: { tel: string; texto?: string; rotulo?: string; sm?: boolean }) {
  const href = linkWhats(tel, texto);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener" className={"btn" + (sm ? " sm" : "")} onClick={e => e.stopPropagation()}
      style={{ background: VERDE_WHATS, borderColor: VERDE_WHATS, color: "#fff", fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
      title={"Abrir conversa no WhatsApp · " + tel}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3z"/></svg>
      {rotulo}
    </a>
  );
}

/** Separa os telefones de um campo livre ("(41) 99999-9999 / 41 3333-4444") */
export function separarTelefones(t: string): string[] {
  const achados = String(t || "").match(/\(?\d{2}\)?[\s.-]*\d{4,5}[\s.-]?\d{4,5}/g) || [];
  const vistos = new Set<string>(); const out: string[] = [];
  for (const a of achados) { const d = a.replace(/\D/g, ""); if (d.length >= 10 && d.length <= 13 && !vistos.has(d)) { vistos.add(d); out.push(a.trim()); } }
  return out;
}
const ASSUNTO: Record<string, string> = {
  previsao_frete: "a previsão de entrega do seu pedido", entrega: "a entrega do seu pedido", prazo_fabrica: "o prazo de fábrica do seu pedido",
  horario_montagem: "o horário da montagem do seu pedido", montagem: "o agendamento da montagem do seu pedido", retorno_montador: "o retorno do montador para o seu pedido",
  assistencia: "a assistência do seu pedido", vistoria: "a vistoria do seu pedido", checklist: "o agendamento do checklist do seu projeto",
  medidas: "a medição dos ambientes do seu projeto", posvenda: "a sua solicitação de pós-venda", outros: "a sua solicitação",
  agendamento_entrega: "o agendamento da entrega do seu pedido", atualizacao_endereco: "a atualização do endereço do seu pedido", previsao_assistencia: "a previsão da assistência do seu pedido",
  garantia_expirada: "a sua solicitação de assistência", desmontagem_estofado: "a desmontagem do seu estofado", solicitacao_medida: "a medição dos ambientes do seu projeto", erro_venda: "a correção do seu pedido",
};
const primeiroNome = (n: string) => { const p = String(n || "").trim().split(/\s+/)[0] || ""; return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ""; };
/** Mensagem do WhatsApp coerente com o motivo da solicitação */
export function msgWhatsCliente(c: any, quem = ""): string {
  const nome = primeiroNome(c.cliente);
  const assunto = ASSUNTO[c.tipo] || "a sua solicitação";
  return "Olá" + (nome ? ", " + nome : "") + "! Aqui é " + (quem ? quem + ", " : "") + "da Aliança Móveis. Estou entrando em contato sobre " + assunto + (c.pedido ? " (venda " + c.pedido + ")" : "") + ".";
}
