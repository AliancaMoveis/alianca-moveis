// Ativar notificações neste aparelho (app do celular)
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { ativarPush, desativarPush, estadoPush, testarPush, type EstadoPush } from "../lib/push";
import { simulacao } from "../lib/teste";

const OCULTO = "a360-notif-oculto";
export function useEstadoPush() {
  const [e, setE] = useState<EstadoPush | null>(null);
  const atualizar = () => estadoPush().then(setE).catch(() => setE("sem-suporte"));
  useEffect(() => { atualizar(); }, []);
  return { e, atualizar };
}

// cartão completo (aba Eu / Mais)
export function Notificacoes() {
  const { toast } = useApp() as any;
  const { e, atualizar } = useEstadoPush();
  const [ind, setInd] = useState(false);
  const sim = !!simulacao();
  if (e === null) return null;
  const faz = async (f: () => Promise<any>, ok: string) => { setInd(true); try { await f(); toast(ok); } catch (x: any) { toast(x.message || "Não foi possível"); } finally { setInd(false); atualizar(); } };
  return (
    <div className="mv-bloco" style={{ marginTop: 0, marginBottom: 12 }}>
      <div className="mv-bloco-t">🔔 Notificações neste celular</div>
      {e === "ligado" ? <>
        <div className="mv-ok">✓ Ativadas — você recebe os avisos mesmo com o app fechado</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm" disabled={ind} onClick={() => faz(testarPush, "Aviso de teste enviado — chega em instantes")}>Enviar um teste</button>
          <button className="btn ghost sm" disabled={ind} onClick={() => faz(desativarPush, "Notificações desativadas")}>Desativar</button>
        </div></>
        : e === "ios-instalar" ? <div className="mv-dica">No iPhone, as notificações só funcionam com o app instalado: toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b> e abra pelo ícone.</div>
        : e === "bloqueado" ? <div className="mv-dica">As notificações estão bloqueadas para este site. Libere nas configurações do celular (Notificações → ALIANÇA 360 / navegador) e volte aqui.</div>
        : e === "sem-suporte" ? <div className="mv-dica">Este navegador não recebe notificações. Use o Chrome (Android) ou o app instalado (iPhone).</div>
        : sim ? <div className="mv-dica">No modo de teste (entrando como outra pessoa) não é possível ativar. Volte para o seu usuário.</div>
        : <><div style={{ fontSize: 13, color: "var(--ink-soft)" }}>Receba um aviso quando chegar cliente novo, venda confirmada, pedido aprovado e mais.</div>
          <button className="mv-principal" disabled={ind} onClick={() => faz(async () => { await ativarPush(); await testarPush(); }, "Notificações ativadas")}>{ind ? "Ativando…" : "Ativar notificações"}</button></>}
    </div>
  );
}

// convite discreto no topo do app, até a pessoa ativar ou dispensar
export function ConviteNotif({ irEu }: { irEu: () => void }) {
  const { e } = useEstadoPush();
  const [fechado, setFechado] = useState(() => { try { return localStorage.getItem(OCULTO) === "1"; } catch { return false; } });
  if (fechado || simulacao() || !(e === "desligado" || e === "ios-instalar")) return null;
  return <div className="mv-convite" onClick={irEu}>🔔 <span><b>Ative as notificações</b> para receber os avisos no celular</span>
    <button onClick={ev => { ev.stopPropagation(); try { localStorage.setItem(OCULTO, "1"); } catch { /* */ } setFechado(true); }}>✕</button></div>;
}
