// Checklist · cópia do contrato ASSINADO
// Duas portas para o mesmo arquivo que a função "contrato" já guarda no bucket checklist:
//  · {token}      → o CLIENTE, sem login, baixa o contrato que ele acabou de assinar (ou reabre o link depois).
//                   Serve tanto para o link da conferência quanto para o 2º link, o do titular da compra.
//  · {id, path}   → o PROJETISTA logado abre qualquer contrato assinado da ficha (os antigos também)
// O path só é liberado se estiver registrado em termo.assinados daquele checklist — ninguém abre arquivo de outro.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const DIAS = 30 * 86400;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const adm = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const b: any = await req.json().catch(() => ({}));
  try {
    // ---------- cliente: pelo token do link que ele assinou ----------
    if (b.token) {
      const token = String(b.token).replace(/[^a-f0-9]/gi, "");
      if (token.length < 20) return json({ erro: "Link inválido" }, 404);
      // vale o link de quem conferiu e também o 2º link, do titular da compra — os dois baixam o mesmo contrato
      const { data: k } = await adm.from("ck_contratos").select("assinado_html_path,status,nome_assinante,assinado_em,cliente,venda")
        .or(`token.eq.${token},titular_token.eq.${token}`).maybeSingle();
      if (!k || !k.assinado_html_path) return json({ erro: "Contrato ainda não assinado" }, 404);
      const su = await adm.storage.from("checklist").createSignedUrl(k.assinado_html_path, DIAS);
      if (!su.data?.signedUrl) return json({ erro: "Contrato não encontrado" }, 404);
      return json({ ok: true, url: su.data.signedUrl, nome: k.nome_assinante, em: k.assinado_em, cliente: k.cliente, venda: k.venda });
    }

    // ---------- projetista logado: qualquer assinado da ficha ----------
    const auth = req.headers.get("Authorization") || "";
    if (!/^Bearer\s+\S+/.test(auth)) return json({ erro: "Entre no 360 de novo" }, 401);
    const usu = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
    const { data: ctx, error: e1 } = await usu.rpc("ck_projetista_contexto", { p_id: String(b.id || "") });
    if (e1) return json({ erro: e1.message }, 403);
    const path = String(b.path || "");
    if (!path) return json({ erro: "falta o arquivo" }, 400);
    // o arquivo precisa estar registrado nos assinados deste checklist
    const { data: ch } = await adm.from("chamados").select("tratativa").eq("id", ctx.id).maybeSingle();
    const assinados: any[] = ch?.tratativa?.checklist?.termo?.assinados || [];
    if (!assinados.some(a => String(a?.path || "") === path)) return json({ erro: "Este arquivo não é deste checklist" }, 403);
    const su = await adm.storage.from("checklist").createSignedUrl(path, 3600);
    if (!su.data?.signedUrl) return json({ erro: "Arquivo não encontrado" }, 404);
    return json({ ok: true, url: su.data.signedUrl });
  } catch (e: any) {
    return json({ erro: String(e?.message || e) }, 500);
  }
});
