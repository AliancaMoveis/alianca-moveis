import { createClient } from "@supabase/supabase-js";

// Chave publicável: é segura para o navegador. Quem protege os dados é o RLS do banco.
const URL = import.meta.env.VITE_SUPABASE_URL || "https://byunwadtkvgwqnlxhpcn.supabase.co";
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_ONP-uDLUTJruInBWEfaabA_2kn_OQrc";

// computador dormindo / aba em segundo plano: o token pode vencer antes da renovação automática.
// Se o banco responder "JWT expired", renova a sessão e repete a mesma chamada uma vez (sem o usuário perder o que estava fazendo).
let renovando: Promise<string | null> | null = null;
async function renovar(): Promise<string | null> {
  // getSession já devolve o token renovado (e só renova se estiver vencido) — evita duas renovações ao mesmo tempo, que derrubariam a sessão
  if (!renovando) renovando = sb.auth.getSession().then(({ data }) => data.session?.access_token || null).catch(() => null).finally(() => { setTimeout(() => (renovando = null), 0); });
  return renovando;
}
async function fetchComRenovacao(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const r = await fetch(input, init);
  const url = String(input instanceof Request ? input.url : input);
  if (r.status === 401 && !url.includes("/auth/v1/")) {
    const txt = await r.clone().text().catch(() => "");
    if (/jwt expired|token is expired|invalid jwt/i.test(txt)) {
      const tok = await renovar();
      if (tok) { const h = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined)); h.set("Authorization", "Bearer " + tok); return fetch(input, { ...init, headers: h }); }
    }
  }
  return r;
}

export const sb = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "alianca360-sessao" },
  global: { fetch: fetchComRenovacao },
});
