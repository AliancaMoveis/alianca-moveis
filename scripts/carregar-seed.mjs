// Carrega os dados de exemplo (chamados + anexos) logado como Gestão, usando só a chave publicável.
// Uso: SEED_EMAIL=... SEED_SENHA=... node scripts/carregar-seed.mjs
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const URL = "https://byunwadtkvgwqnlxhpcn.supabase.co";
const KEY = "sb_publishable_ONP-uDLUTJruInBWEfaabA_2kn_OQrc";
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const { error: eLogin } = await sb.auth.signInWithPassword({ email: process.env.SEED_EMAIL, password: process.env.SEED_SENHA });
if (eLogin) throw eLogin;

const chamados = JSON.parse(fs.readFileSync("supabase/seed/chamados-seed.json", "utf8"));
const { data: n, error } = await sb.rpc("seed_carregar", { p: chamados });
if (error) throw error;
console.log("chamados carregados:", n);

const anexos = JSON.parse(fs.readFileSync("supabase/seed/anexos-seed.json", "utf8"));
for (const a of anexos) {
  const b64 = a.url.split(",")[1];
  const bytes = Buffer.from(b64, "base64");
  const path = `${a.chamado}/${crypto.randomUUID()}-${a.nome}`;
  const up = await sb.storage.from("anexos").upload(path, bytes, { contentType: "image/svg+xml" });
  if (up.error) throw up.error;
  const r = await sb.rpc("adicionar_anexos", { p_id: a.chamado, p_itens: [{ tipo: "img", nome: a.nome, storage_path: path }], p_registrar: false });
  if (r.error) throw r.error;
  console.log("anexo", a.chamado, a.nome);
}
