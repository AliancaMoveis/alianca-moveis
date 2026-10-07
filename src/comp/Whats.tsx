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
