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
export async function ativarPush() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permissão negada. Libere as notificações do site nas configurações do celular.");
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_PUBLICA) });
  const j: any = sub.toJSON();
  const { error } = await sb.rpc("salvar_inscricao_push", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_agente: navigator.userAgent });
  if (error) throw new Error(error.message);
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
