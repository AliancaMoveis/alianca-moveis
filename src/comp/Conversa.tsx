// Conversa com o cliente dentro do 360, para a equipe parar de abrir a Kommo a cada resposta.
//
// Usa o mesmo visual do Assistente (classes .as-*): abre pela lateral, com o nome do cliente
// em cima, o histórico como bate-papo e a caixa de escrever embaixo.
//
// A regra que manda aqui é a janela de 24h da Meta, contada a partir da ÚLTIMA mensagem DO
// CLIENTE. Dentro dela o WhatsApp entrega texto livre; fora dela, não entrega nada que não
// seja modelo aprovado. Por isso, com a janela fechada a caixa de texto nem aparece: a pessoa
// não escreve, não clica, não fica achando que o sistema engoliu a mensagem.
import { useEffect, useRef, useState } from "react";
import { A } from "../lib/acoes";
import { useApp } from "../estado";

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};
/** quanto falta para a janela fechar, em palavras que servem para decidir ("faltam 3h") */
function restante(fechaEm: string | null): string {
  if (!fechaEm) return "";
  const ms = +new Date(fechaEm) - Date.now();
  if (ms <= 0) return "";
  const h = Math.floor(ms / 3600e3), m = Math.round((ms % 3600e3) / 60e3);
  return h >= 1 ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`;
}

export function Conversa({ c, onFechar, onModelo }: { c: any; onFechar: () => void; onModelo?: () => void }) {
  const { R, toast, recarregar } = useApp() as any;
  const [v, setV] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  const carregar = async () => {
    try { setV(await A.ckConversa(c.id)); setErro(""); }
    catch (e: any) { setErro(e.message || "Não consegui carregar a conversa"); }
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [c.id]);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [v]);

  async function enviar() {
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    try {
      await A.kommoMensagem({
        chamado: c.id, cliente: c.cliente, telefone: c.telefone, pedido: c.pedido || null,
        texto: t, por: R.me()?.nome || "", assunto: "conversa",
      });
      setTexto("");
      await carregar();
      recarregar?.();
    } catch (e: any) { toast(e.message || "Não consegui enviar"); }
    finally { setEnviando(false); }
  }

  const aberta = !!v?.janela?.aberta;
  const falta = restante(v?.janela?.fechaEm || null);

  return (
    <div className="as-painel" role="dialog" aria-label={"Conversa com " + c.cliente}>
      <div className="as-topo">
        <div className="as-av">💬</div>
        <div className="as-tt">
          <b style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.cliente}</b>
          <span>{c.pedido ? "Venda " + c.pedido + " · " : ""}{c.telefone || "sem telefone"}</span>
        </div>
        <button className="as-ic" onClick={onFechar} title="Fechar">✕</button>
      </div>

      {/* a janela é a primeira coisa que a pessoa precisa ver: decide o que ela pode fazer */}
      <div style={{
        padding: "7px 12px", fontSize: 12.5, lineHeight: 1.35,
        background: aberta ? "#E8F5EE" : "#FDEEE9", color: aberta ? "#17543F" : "#8A2E13",
        borderBottom: "1px solid #E4E2DB", fontWeight: 600,
      }}>
        {!v ? "Carregando…" : aberta
          ? `🟢 Janela aberta${falta ? " · fecha em " + falta : ""} — dá para escrever o que quiser`
          : "🔴 Janela fechada — o WhatsApp só entrega modelo aprovado"}
      </div>

      <div className="as-msgs">
        {erro && <div className="as-txt" style={{ color: "#8A2E13" }}>{erro}</div>}
        {v && !v.mensagens.length && <div className="as-txt">Nenhuma mensagem registrada com este cliente ainda.</div>}
        {v?.mensagens?.map((m: any, i: number) => (
          <div key={i} className={m.de === "cliente" ? "as-txt" : "as-u"}>
            {m.texto}
            <div style={{ fontSize: 10.5, opacity: .65, marginTop: 4 }}>
              {hhmm(m.em)}{m.de === "loja" && m.por ? " · " + m.por : ""}
            </div>
          </div>
        ))}
        {v?.parcial && !!v.mensagens.length && (
          <div style={{ fontSize: 11, color: "#5F6670", textAlign: "center", padding: "2px 10px" }}>
            Aqui aparece o que passou pelo 360. Mensagem digitada à mão dentro da Kommo não entra nesta lista.
          </div>
        )}
        <div ref={fim} />
      </div>

      {aberta ? (
        <div style={{ borderTop: "1px solid #E4E2DB", background: "#fff", padding: 10, display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2}
            placeholder="Escreva para o cliente…" disabled={enviando}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); } }}
            style={{ flex: 1, resize: "none", border: "1px solid #D5D2C9", borderRadius: 12, padding: "8px 10px", font: "14px Inter,system-ui,sans-serif" }} />
          <button className="btn primary" disabled={enviando || !texto.trim()} onClick={enviar}>
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </div>
      ) : (
        <div style={{ borderTop: "1px solid #E4E2DB", background: "#fff", padding: 10, fontSize: 12.5, color: "#5F6670" }}>
          {v?.janela?.ultimaDoCliente
            ? `O cliente não escreve desde ${hhmm(v.janela.ultimaDoCliente)}.`
            : "Este cliente ainda não respondeu nenhuma mensagem."}
          {onModelo
            ? <> Para falar com ele agora, use um modelo aprovado:
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  <button className="btn sm" onClick={() => { onFechar(); onModelo(); }}>📅 Enviar nova data</button>
                </div>
              </>
            : " Para falar com ele agora, use um modelo aprovado pelo botão de enviar data, no cartão do cliente."}
        </div>
      )}
    </div>
  );
}

/**
 * A janela de 24h calculada direto do cartão, sem ir ao servidor: o banco grava
 * `respostaCliente.em` a cada resposta do cliente, qualquer que seja o tipo. É isso que
 * permite acender o botão nos 142 cartões da lista sem 142 consultas.
 * (Uma exceção conhecida: quando a resposta libera os documentos, o webhook entrega e sai
 * antes de passar por aqui, então o cartão pode mostrar a luz laranja por engano até a
 * próxima mensagem. O painel, esse, sempre mostra o estado certo, porque pergunta ao banco.)
 */
export function janelaCk(c: any): { aberta: boolean; fechaEm: string | null } {
  const em = c?.tratativa?.checklist?.respostaCliente?.em;
  if (!em) return { aberta: false, fechaEm: null };
  const fecha = new Date(+new Date(em) + 24 * 3600e3);
  return { aberta: +fecha > Date.now(), fechaEm: fecha.toISOString() };
}

/** Botão que abre a conversa. Substitui o "Abrir conversa na Kommo": mesmo lugar, mesmo gesto,
 *  só que sem jogar a pessoa para fora do sistema.
 *  A borda acesa diz, antes de clicar, se dá para escrever: verde a janela está aberta,
 *  laranja está fechada e só sai modelo aprovado. */
export function BotaoConversa({ c, rotulo = "💬 Conversa com o cliente", onModelo }:
  { c: any; rotulo?: string; onModelo?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const j = janelaCk(c);
  const falta = restante(j.fechaEm);
  return <>
    <button className="btn sm" onClick={ev => { ev.stopPropagation(); setAberto(true); }}
      title={j.aberta
        ? `Janela de 24h aberta${falta ? " · fecha em " + falta : ""} — dá para escrever o que quiser`
        : "Janela de 24h fechada — só sai modelo aprovado"}
      style={j.aberta
        ? { borderColor: "#1AA06D", boxShadow: "0 0 0 2px rgba(26,160,109,.28), 0 0 9px 1px rgba(26,160,109,.45)" }
        : { borderColor: "#E07A1F", boxShadow: "0 0 0 2px rgba(224,122,31,.25), 0 0 9px 1px rgba(224,122,31,.40)" }}>
      {rotulo}
    </button>
    {aberto && <Conversa c={c} onFechar={() => setAberto(false)} onModelo={onModelo} />}
  </>;
}
