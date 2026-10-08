// Agenda da loja (tela aberta): devolve as imagens do cliente com links temporários (10 min).
// Quem chama confirma o nome; a regra (projetista programado / assumir o projeto) fica no banco: agenda_publica_imagens.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const resp = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const b = await req.json().catch(() => ({}));
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data, error } = await sb.rpc("agenda_publica_imagens", { p_token: String(b.token || ""), p_id: String(b.id || ""), p_vendedor: b.vendedor || null, p_assumir: !!b.assumir });
    if (error) return resp({ erro: error.message }, 400);
    if (!data || data.confirmar) return resp(data || {});
    const arqs = (data.arquivos || []) as any[];
    const paths = arqs.filter(a => a.path).map(a => a.path);
    let urls: Record<string, string> = {};
    if (paths.length) {
      const { data: s } = await sb.storage.from("anexos").createSignedUrls(paths, 600);
      (s || []).forEach((x: any) => { if (x.path && x.signedUrl) urls[x.path] = x.signedUrl; });
    }
    return resp({ ...data, arquivos: arqs.map(a => ({ tipo: a.tipo, nome: a.nome, url: a.path ? urls[a.path] || "" : a.url || "" })).filter(a => a.url) });
  } catch (e: any) {
    return resp({ erro: String(e?.message || e) }, 500);
  }
});
