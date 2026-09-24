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

export default function Raiz() {
  const { R } = useApp() as any;
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
