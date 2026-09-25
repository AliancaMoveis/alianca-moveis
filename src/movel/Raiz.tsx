// Decide entre o app de celular (consultor, vendedor, gestão) e a versão completa.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import Shell from "../telas/Shell";
import AppMovel, { perfilMovel } from "./AppMovel";

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
    const abrir = (url: string) => { try { const id = new URL(url, location.origin).searchParams.get("abrir"); if (id && st.chamados.some((c: any) => c.id === id)) abrirDetalhe(id); } catch { /* */ } };
    abrir(location.href);
    if (new URLSearchParams(location.search).get("abrir")) history.replaceState(null, "", location.pathname);
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
