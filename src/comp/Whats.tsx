// Botão do WhatsApp (verde escuro) — abre a conversa direto com o número
import { useEffect, useRef, useState } from "react";
import { linkWhats, telefonesDe } from "../lib/regras";

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
export const separarTelefones = telefonesDe;

// divide o que foi digitado/colado numa linha em vários números (separador / ; , " e " ou dois números completos)
function quebrar(v: string): string[] {
  const partes = String(v || "").split(/\s*[\/;,]\s*|\s+e\s+/);
  if (partes.length > 1) return partes.map(x => x.trim());
  const ts = telefonesDe(v);
  return ts.length > 1 ? ts : [v];
}
const listaDe = (v: string) => { const l = String(v || "").split(/\s*\/\s*/).flatMap(x => quebrar(x.trim())).filter(Boolean); return l.length ? l : [""]; };

/** Campo de telefones do cliente: um número por linha, cada um com o botão do WhatsApp; "+ Adicionar telefone" abre outra linha.
 *  Guarda tudo no mesmo campo, separado por " / " (o resto do sistema já separa por aí). */
export function CampoTelefones({ valor, onChange, nome = "telefone", movel = false, onAviso }: { valor: string; onChange: (v: string) => void; nome?: string; movel?: boolean; onAviso?: (m: string) => void }) {
  const [lista, setLista] = useState<string[]>(() => listaDe(valor));
  const ult = useRef(valor); const foco = useRef<number | null>(null); const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { if (valor !== ult.current) { ult.current = valor; setLista(listaDe(valor)); } }, [valor]);
  useEffect(() => { if (foco.current != null) { refs.current[foco.current]?.focus(); foco.current = null; } });
  const emitir = (l: string[]) => { setLista(l); const s = l.map(x => x.trim()).filter(Boolean).join(" / "); ult.current = s; onChange(s); };
  const mudar = (i: number, v: string) => {
    const q = quebrar(v); const l = [...lista];
    if (q.length > 1) {
      const novos = q.filter((x, k) => x || k === q.length - 1);
      l.splice(i, 1, ...novos); foco.current = i + novos.length - 1;
      onAviso && onAviso("Um telefone por linha — o outro número foi para uma linha nova");
    } else l[i] = v;
    emitir(l);
  };
  const tirar = (i: number) => { const l = lista.filter((_, k) => k !== i); emitir(l.length ? l : [""]); };
  const add = () => { if (lista[lista.length - 1].trim() === "") { foco.current = lista.length - 1; setLista([...lista]); return; } foco.current = lista.length; setLista([...lista, ""]); };
  const ok = (t: string) => { const d = t.replace(/\D/g, "").length; return d >= 10 && d <= 13; };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      {lista.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input ref={el => { refs.current[i] = el; }} name={i === 0 ? nome : nome + (i + 1)} type="tel" inputMode="tel" placeholder={i === 0 ? "(00) 00000-0000" : "Outro telefone"} value={t}
            onChange={e => mudar(i, e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          {ok(t) && <BotaoWhats tel={t} rotulo={movel ? "" : "WhatsApp"} />}
          {lista.length > 1 && <button type="button" className="btn ghost sm" title="Remover este telefone" onClick={() => tirar(i)} style={{ padding: "4px 8px" }}>✕</button>}
        </div>
      ))}
      <button type="button" className="btn ghost sm" onClick={add} style={{ alignSelf: "flex-start" }}>📞 + Adicionar telefone</button>
    </div>
  );
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
