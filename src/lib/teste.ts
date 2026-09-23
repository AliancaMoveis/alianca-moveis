// Modo de teste: a Gestão entra como outro usuário (sessão real, com as permissões dele) e volta depois.
import { sb } from "./supabase";
import { A } from "./acoes";

const KEY = "alianca360-gestor";
type Salvo = { refresh_token: string; nome: string; comoNome: string };

export function simulacao(): Salvo | null {
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}

export async function voltarGestao() {
  const s = simulacao();
  try { localStorage.removeItem(KEY); } catch { /* */ }
  if (!s) return;
  const { error } = await sb.auth.refreshSession({ refresh_token: s.refresh_token });
  if (error) { await sb.auth.signOut(); throw new Error("Não foi possível voltar para a Gestão. Entre de novo com seu e-mail e senha."); }
}

export async function entrarComo(id: string, nomeAlvo: string, meuNome: string) {
  const antes = simulacao();
  if (antes) { await voltarGestao(); meuNome = antes.nome; }
  const { data } = await sb.auth.getSession();
  const refresh = data.session?.refresh_token;
  if (!refresh) throw new Error("Sessão expirada");
  const r = await A.adminUsuarios({ acao: "entrar_como", id });
  try { localStorage.setItem(KEY, JSON.stringify({ refresh_token: refresh, nome: meuNome, comoNome: nomeAlvo })); } catch { /* */ }
  const { error } = await sb.auth.verifyOtp({ type: "magiclink", token_hash: r.token_hash });
  if (error) { try { localStorage.removeItem(KEY); } catch { /* */ } throw new Error(error.message); }
}

export async function sair() {
  try { localStorage.removeItem(KEY); } catch { /* */ }
  await sb.auth.signOut();
}
