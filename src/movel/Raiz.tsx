// Decide entre o app de celular (consultor, vendedor, gestão) e a versão completa.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import Shell from "../telas/Shell";
import AppMovel, { perfilMovel } from "./AppMovel";
import { abrirAviso } from "../comp/Avisos";

const CHAVE = "a360-versao";
const ler = () => { try { return localStorage.getItem(CHAVE) || ""; } catch { return ""; } };
const gravar = (v: string) => { try { localStorage.setItem(CHAVE, v); } catch { /* sem armazenamento */ } };

export function usaCelular() {
  const q = () => window.matchMedia("(max-width: 820px)").matches || window.matchMedia("(display-mode: standalone)").matches && window.innerWidth < 1000;
  const [m, setM] = useState(q());
  useEffect(() => { const f = () => setM(q()); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  return m;
}

// abre a ficha quando o app é aberto por uma notificação (/?abrir=ID) ou quando a notificação é tocada com o app aberto
function useAbrirPorNotificacao() {
  const { abrirDetalhe, st } = useApp() as any;
  useEffect(() => {
    const abrir = (url: string) => { try {
      const q = new URL(url, location.origin).searchParams;
      const n = q.get("notif"), id = q.get("abrir");
      if (n) { setTimeout(() => abrirAviso(Number(n)), 300); return; } // mostra a notificação inteira (com botão para a ficha)
      if (id && st.chamados.some((c: any) => c.id === id)) abrirDetalhe(id);
    } catch { /* */ } };
    abrir(location.href);
    { const q = new URLSearchParams(location.search); if (q.get("abrir") || q.get("notif")) history.replaceState(null, "", location.pathname); }
    const f = (e: MessageEvent) => { if (e.data && e.data.tipo === "abrir") abrir(e.data.url); };
    navigator.serviceWorker?.addEventListener("message", f);
    return () => navigator.serviceWorker?.removeEventListener("message", f);
  }, []);
}

export default function Raiz() {
  const { R } = useApp() as any;
  useAbrirPorNotificacao();
  const cel = usaCelular();
  const [versao, setVersao] = useState(ler());
  const perfil = perfilMovel(R);
  const trocar = (v: string) => { gravar(v); setVersao(v); window.scrollTo(0, 0); };
  if (cel && perfil && versao !== "completa") return <AppMovel perfil={perfil} completa={() => trocar("completa")} />;
  return <>
    <Shell />
    {cel && perfil && versao === "completa" && <button className="mv-voltar-app" onClick={() => trocar("app")}>📱 Voltar ao app</button>}
  </>;
}
