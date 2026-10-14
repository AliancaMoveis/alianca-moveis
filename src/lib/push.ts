// Notificações no celular (Web Push): ativar/desativar neste aparelho.
import { sb } from "./supabase";

export const VAPID_PUBLICA = "BGWzgDVIJQz_tgsR-aOW7VJBMU-EJkTsGz7wZ1zm6kUfJVVq5niZ7knTV8_ke2_QIuupVjBPq5NhAypjy_FiLzo";
const b64 = (s: string) => { const p = "=".repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, c => c.charCodeAt(0)); };
export const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const instalado = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;

export type EstadoPush = "sem-suporte" | "ios-instalar" | "bloqueado" | "desligado" | "ligado";
export async function estadoPush(): Promise<EstadoPush> {
  if (ehIOS() && !instalado()) return "ios-instalar";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "sem-suporte";
  if (Notification.permission === "denied") return "bloqueado";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub && Notification.permission === "granted" ? "ligado" : "desligado";
}
/** navegador do Android que não é o Chrome (Samsung, Xiaomi, Opera, navegador de dentro do WhatsApp/Instagram…) */
export const navegadorAlternativo = () => { const u = navigator.userAgent; return /android/i.test(u) && (/SamsungBrowser|MiuiBrowser|XiaoMi|OPR\/|Opera|EdgA|Firefox|HuaweiBrowser|UCBrowser|FBAN|FBAV|Instagram|; wv\)/i.test(u)); };
const comPrazo = <T,>(p: Promise<T>, ms: number, msg: string) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
async function registrarErro(etapa: string, e: any) { try { await sb.rpc("registrar_erro_push", { p_etapa: etapa, p_erro: (e && (e.name ? e.name + ": " : "") + (e.message || String(e))) || "?", p_agente: navigator.userAgent }); } catch { /* */ } }

export async function ativarPush() {
  let etapa = "permissao";
  try {
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm === "denied") throw new Error("As notificações estão bloqueadas para este site. Libere em Configurações do celular → Apps → Chrome (ou ALIANÇA 360) → Notificações, e tente de novo.");
    if (perm !== "granted") throw new Error("Você fechou a pergunta sem permitir. Toque em “Ativar notificações” de novo e escolha “Permitir”.");
    etapa = "service-worker";
    if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register("/sw.js");
    const reg = await comPrazo(navigator.serviceWorker.ready, 15000, "O aplicativo ainda está carregando. Feche e abra de novo e tente outra vez.");
    etapa = "inscricao";
    let sub = await reg.pushManager.getSubscription();
    const chave = b64(VAPID_PUBLICA);
    try {
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
    } catch (e1: any) {
      // inscrição antiga/presa: limpa e tenta de novo uma vez
      await registrarErro("inscricao-1", e1);
      const velha = await reg.pushManager.getSubscription(); if (velha) await velha.unsubscribe().catch(() => null);
      try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave }); }
      catch (e2: any) {
        if (navegadorAlternativo()) throw new Error("Este navegador não ativa as notificações. Abra alianca360.vercel.app pelo Google Chrome e ative por lá.");
        if (e2 && (e2.name === "AbortError" || /push service/i.test(e2.message || ""))) throw new Error("O celular recusou a inscrição. Atualize o Google Chrome e o Google Play Services (Play Store) e tente de novo. Se usar economia de bateria, desligue para o Chrome.");
        throw e2;
      }
    }
    etapa = "salvar";
    const j: any = sub.toJSON();
    const { error } = await sb.rpc("salvar_inscricao_push", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_agente: navigator.userAgent });
    if (error) throw new Error(error.message);
  } catch (e: any) {
    await registrarErro(etapa, e);
    throw e;
  }
}
export async function desativarPush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await sb.rpc("remover_inscricao_push", { p_endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => null);
}
export async function testarPush() {
  const { error } = await sb.rpc("testar_push");
  if (error) throw new Error(error.message);
}
