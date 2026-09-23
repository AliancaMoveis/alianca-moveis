// ALIANÇA 360 — criação de usuários e redefinição de senha (só Gestão).
// Precisa da service role (disponível só no servidor), por isso roda como Edge Function.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// assinatura HMAC (com a service role) do "passe de volta" do modo de teste
async function assinar(msg: string, chave: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(chave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => (c === "+" ? "-" : c === "/" ? "_" : ""));
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const body = await req.json();

    // modo de teste: voltar para a Gestão (quem chama está logado como outro usuário, mas tem o passe assinado)
    if (body.acao === "voltar") {
      const [gid, exp, sig] = String(body.passe ?? "").split(".");
      if (!gid || !exp || !sig || Number(exp) < Date.now() || sig !== await assinar(gid + "." + exp, service)) return json({ erro: "Passe de volta inválido ou vencido. Entre de novo com seu e-mail e senha." }, 403);
      const { data: cfgV } = await admin.from("config").select("modo_teste").eq("id", 1).single();
      if (!cfgV?.modo_teste) return json({ erro: "O modo de teste está desligado. Entre de novo com seu e-mail e senha." }, 403);
      const { data: g } = await admin.from("usuarios").select("email, ativo").eq("id", gid).single();
      const { data: sg } = await admin.from("usuario_setores").select("setor_id").eq("usuario_id", gid).eq("setor_id", "gestao");
      if (!g || !g.ativo || !g.email || !sg?.length) return json({ erro: "Usuário de Gestão inválido" }, 403);
      const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: g.email });
      if (error || !link?.properties?.hashed_token) return json({ erro: error?.message ?? "Não foi possível voltar" }, 400);
      return json({ token_hash: link.properties.hashed_token });
    }

    // quem chamou precisa ser Gestão (checado no banco com o token dele)
    const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: ehGestao, error: eG } = await comoUsuario.rpc("eh_gestao");
    if (eG || ehGestao !== true) return json({ erro: "Acesso restrito à Administração" }, 403);

    if (body.acao === "criar") {
      const nome = String(body.nome ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      const senha = String(body.senha ?? "");
      const setores: string[] = Array.isArray(body.setores) ? body.setores : [];
      if (!nome) return json({ erro: "Informe o nome" }, 400);
      if (!email.includes("@")) return json({ erro: "Informe um e-mail válido" }, 400);
      if (senha.length < 8) return json({ erro: "A senha inicial precisa ter pelo menos 8 caracteres" }, 400);
      if (!setores.length) return json({ erro: "Marque ao menos um setor" }, 400);

      const { data: criado, error: eC } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
      if (eC || !criado.user) return json({ erro: eC?.message?.includes("already") ? "Já existe um usuário com este e-mail" : (eC?.message ?? "Erro ao criar") }, 400);
      const id = criado.user.id;
      const { error: eU } = await admin.from("usuarios").insert({ id, nome, email, somente_atribuidos: !!body.somenteAtribuidos });
      if (eU) { await admin.auth.admin.deleteUser(id); return json({ erro: eU.message }, 400); }
      const { error: eS } = await admin.from("usuario_setores").insert(setores.map((s, i) => ({ usuario_id: id, setor_id: s, ordem: i + 1 })));
      if (eS) { await admin.auth.admin.deleteUser(id); return json({ erro: eS.message }, 400); }
      return json({ id });
    }

    if (body.acao === "senha") {
      const senha = String(body.senha ?? "");
      if (senha.length < 8) return json({ erro: "A senha precisa ter pelo menos 8 caracteres" }, 400);
      const { error } = await admin.auth.admin.updateUserById(String(body.id), { password: senha });
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }

    if (body.acao === "email") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!email.includes("@")) return json({ erro: "Informe um e-mail válido" }, 400);
      const { error } = await admin.auth.admin.updateUserById(String(body.id), { email, email_confirm: true });
      if (error) return json({ erro: error.message }, 400);
      await admin.from("usuarios").update({ email }).eq("id", String(body.id));
      return json({ ok: true });
    }

    // modo de teste: a Gestão entra como outro usuário para validar permissões
    if (body.acao === "entrar_como") {
      const { data: cfg } = await admin.from("config").select("modo_teste").eq("id", 1).single();
      if (!cfg?.modo_teste) return json({ erro: "O modo de teste está desligado (Administração → Comissões e testes)" }, 403);
      const { data: alvo } = await admin.from("usuarios").select("email, ativo, nome").eq("id", String(body.id)).single();
      if (!alvo || !alvo.ativo || !alvo.email) return json({ erro: "Usuário inválido" }, 400);
      const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: alvo.email });
      if (error || !link?.properties?.hashed_token) return json({ erro: error?.message ?? "Não foi possível entrar como este usuário" }, 400);
      const { data: quem } = await comoUsuario.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
      if (!quem?.user) return json({ erro: "Sessão inválida" }, 401);
      const exp = String(Date.now() + 12 * 3600 * 1000);
      const passe = quem.user.id + "." + exp + "." + await assinar(quem.user.id + "." + exp, service);
      console.log("entrar_como", alvo.nome);
      return json({ token_hash: link.properties.hashed_token, email: alvo.email, passe });
    }

    return json({ erro: "Ação inválida" }, 400);
  } catch (e) {
    return json({ erro: String(e) }, 500);
  }
});
