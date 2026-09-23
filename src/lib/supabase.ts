import { createClient } from "@supabase/supabase-js";

// Chave publicável: é segura para o navegador. Quem protege os dados é o RLS do banco.
const URL = import.meta.env.VITE_SUPABASE_URL || "https://byunwadtkvgwqnlxhpcn.supabase.co";
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_ONP-uDLUTJruInBWEfaabA_2kn_OQrc";

export const sb = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "alianca360-sessao" },
});
