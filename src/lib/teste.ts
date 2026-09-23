// Modo de teste: a Gestão entra como outro usuário (sessão real, com as permissões dele) e volta depois.
import { sb } from "./supabase";
import { A } from "./acoes";

const KEY = "alianca360-gestor";
type Salvo = { passe: string; nome: string; comoNome: string };

export function simulacao(): Salvo | null {
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}

export async function voltarGestao() {
  const s = simulacao();
  try { localStorage.removeItem(KEY); } catch { /* */ }
  if (!s) return;
  const falhou = async () => {
    // se a sessão atual já é da Gestão (marcação antiga esquecida no navegador), só segue
    const { data: jaGestao } = await sb.rpc("eh_gestao");
    if (jaGestao === true) return;
    await sb.auth.signOut({ scope: "local" });
    throw new Error("Não foi possível voltar para a Gestão. Entre de novo com seu e-mail e senha.");
  };
  if (!s.passe) return falhou();
  let r: any;
  try { r = await A.adminUsuarios({ acao: "voltar", passe: s.passe }); } catch { return falhou(); }
  const { error } = await sb.auth.verifyOtp({ type: "magiclink", token_hash: r.token_hash });
  if (error) return falhou();
}

export async function entrarComo(id: string, nomeAlvo: string, meuNome: string) {
  const antes = simulacao();
  if (antes) { await voltarGestao(); meuNome = antes.nome; }
  const r = await A.adminUsuarios({ acao: "entrar_como", id });
  try { localStorage.setItem(KEY, JSON.stringify({ passe: r.passe, nome: meuNome, comoNome: nomeAlvo })); } catch { /* */ }
  const { error } = await sb.auth.verifyOtp({ type: "magiclink", token_hash: r.token_hash });
  if (error) { try { localStorage.removeItem(KEY); } catch { /* */ } throw new Error(error.message); }
}

export async function sair() {
  try { localStorage.removeItem(KEY); } catch { /* */ }
  await sb.auth.signOut();
}
