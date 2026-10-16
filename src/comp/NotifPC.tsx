// Faixa no topo do computador: todo mundo precisa ativar as notificações deste computador
// (mensagens do chat, direcionamentos, clientes novos). Some só quando estiver ativado — "depois" esconde até a próxima vez que abrir o 360.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { ativarPush, estadoPush, testarPush, type EstadoPush } from "../lib/push";
import { simulacao } from "../lib/teste";

const ADIADO = "a360-notifpc-depois";
export function NotifPC() {
  const { toast } = useApp() as any;
  const [e, setE] = useState<EstadoPush | null>(null);
  const [ind, setInd] = useState(false); const [erro, setErro] = useState("");
  const [depois, setDepois] = useState(() => { try { return sessionStorage.getItem(ADIADO) === "1"; } catch { return false; } });
  const atualizar = () => estadoPush().then(setE).catch(() => setE("sem-suporte"));
  useEffect(() => { atualizar(); const f = () => document.visibilityState === "visible" && atualizar(); document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f); }, []);
  if (!e || e === "ligado" || e === "ios-instalar" || depois || simulacao()) return null;
  const ativar = async () => {
    setInd(true); setErro("");
    try { await ativarPush(); await testarPush().catch(() => null); toast("Notificações ativadas neste computador — chega um aviso de teste"); }
    catch (x: any) { setErro(/bloquead/i.test(x.message || "") ? "" : x.message || "Não foi possível ativar"); }
    finally { setInd(false); atualizar(); }
  };
  const adiar = () => { try { sessionStorage.setItem(ADIADO, "1"); } catch { /* */ } setDepois(true); };
  return (
    <div className="notifpc">
      <span className="notifpc-ic">🔔</span>
      {e === "bloqueado" ? <span><b>As notificações deste computador estão bloqueadas.</b> Clique no <b>cadeado 🔒</b> ao lado do endereço (alianca360.vercel.app) → <b>Notificações → Permitir</b> e recarregue a página.</span>
        : e === "sem-suporte" ? <span><b>Este navegador não recebe notificações.</b> Use o <b>Google Chrome</b> ou o <b>Microsoft Edge</b> para receber as mensagens e direcionamentos.</span>
        : <span><b>Ative as notificações deste computador</b> para ser avisado quando chegar mensagem no chat ou um direcionamento — mesmo com o 360 minimizado.{erro && <em> ⚠️ {erro}</em>}</span>}
      {e === "desligado" && <button className="btn primary sm" disabled={ind} onClick={ativar}>{ind ? "Ativando…" : "Ativar agora"}</button>}
      {e === "bloqueado" && <button className="btn sm" onClick={() => location.reload()}>Já liberei</button>}
      <button className="btn ghost sm" onClick={adiar} title="Esconde até a próxima vez que abrir o 360">Depois</button>
    </div>
  );
}
