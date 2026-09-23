import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { carregarEstado, type Estado } from "./lib/dados";
import { criarRegras, type Regras } from "./lib/regras";
import { sb } from "./lib/supabase";

type Ctx = {
  st: Estado;
  R: Regras;
  recarregar: () => Promise<void>;
  toast: (m: string) => void;
  executar: (fn: () => Promise<any>, ok?: string) => Promise<boolean>;
  view: string;
  irPara: (v: string, preset?: any) => void;
  preset: any;
  detalheId: string | null;
  abrirDetalhe: (id: string, foco?: string) => void;
  fecharDetalhe: () => void;
  focoDetalhe: string | null;
  openImg: (lista: string[] | string, i?: number) => void;
  abrirGaleria: (id: string, editavel: boolean) => void;
  modal: React.ReactNode;
  setModal: (n: React.ReactNode) => void;
};
const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

export function AppProvider({ uid, inicial, children, overlays }: { uid: string; inicial: Estado; children: React.ReactNode; overlays: (ctx: any) => React.ReactNode }) {
  const [st, setSt] = useState<Estado>(inicial);
  const [msg, setMsg] = useState(""); const [toastOn, setToastOn] = useState(false);
  const tRef = useRef<any>();
  const [view, setView] = useState("dashboard");
  const [preset, setPreset] = useState<any>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [focoDetalhe, setFoco] = useState<string | null>(null);
  const [lb, setLb] = useState<{ lista: string[]; i: number } | null>(null);
  const [gal, setGal] = useState<{ id: string; editavel: boolean } | null>(null);
  const [modal, setModal] = useState<React.ReactNode>(null);
  const [, setTick] = useState(0);

  const R = useMemo(() => criarRegras(st, uid), [st, uid]);
  const toast = useCallback((m: string) => { setMsg(m); setToastOn(true); clearTimeout(tRef.current); tRef.current = setTimeout(() => setToastOn(false), 2200); }, []);
  const carregando = useRef(false);
  const recarregar = useCallback(async () => {
    if (carregando.current) return;
    carregando.current = true;
    try { setSt(await carregarEstado()); } catch (e: any) { console.error(e); } finally { carregando.current = false; }
  }, []);
  const executar = useCallback(async (fn: () => Promise<any>, ok?: string) => {
    try { await fn(); await recarregar(); if (ok) toast(ok); return true; }
    catch (e: any) { toast(e?.message || "Não foi possível concluir"); await recarregar(); return false; }
  }, [recarregar, toast]);

  // tempo real: toda ação grava no histórico; ao chegar um evento, recarrega. + atualização periódica (prazos mudam com o tempo)
  useEffect(() => {
    let t: any;
    const ch = sb.channel("historico-ao-vivo")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "historico" }, () => { clearTimeout(t); t = setTimeout(recarregar, 700); })
      .subscribe();
    const iv = setInterval(() => { recarregar(); setTick(x => x + 1); }, 30000);
    return () => { sb.removeChannel(ch); clearInterval(iv); clearTimeout(t); };
  }, [recarregar]);

  const ctx: Ctx = {
    st, R, recarregar, toast, executar, view,
    irPara: (v, p) => { setPreset(p || null); setView(v); window.scrollTo({ top: 0, behavior: "smooth" }); },
    preset,
    detalheId, focoDetalhe,
    abrirDetalhe: (id, foco) => { setFoco(foco || null); setDetalheId(id); document.body.style.overflow = "hidden"; },
    fecharDetalhe: () => { setDetalheId(null); setFoco(null); document.body.style.overflow = ""; },
    openImg: (l, i) => setLb({ lista: Array.isArray(l) ? l : [l], i: i || 0 }),
    abrirGaleria: (id, editavel) => setGal({ id, editavel }),
    modal, setModal,
  };
  return (
    <C.Provider value={ctx}>
      {children}
      {overlays({ lb, setLb, gal, setGal })}
      <div className={"toast" + (toastOn ? " on" : "")} id="toast">{msg}</div>
    </C.Provider>
  );
}
