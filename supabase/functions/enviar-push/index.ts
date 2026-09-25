// Entrega as notificações pendentes (tabela notificacoes) via Web Push.
// Chamada pelo banco (pg_net) com o cabeçalho x-push-segredo. As chaves ficam em push_config (só o servidor lê).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await sb.from("push_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg || !cfg.segredo || req.headers.get("x-push-segredo") !== cfg.segredo) return new Response("não autorizado", { status: 401 });
  webpush.setVapidDetails(cfg.assunto, cfg.vapid_publica, cfg.vapid_privada);
  const body = await req.json().catch(() => ({}));
  let q = sb.from("notificacoes").select("*").is("enviado_em", null).lt("tentativas", 3).order("id").limit(200);
  if (Array.isArray(body.ids) && body.ids.length) q = q.in("id", body.ids);
  const { data: ns, error } = await q;
  if (error) return new Response(error.message, { status: 500 });
  let enviados = 0;
  for (const n of ns || []) {
    const { data: subs } = await sb.from("push_inscricoes").select("*").eq("usuario_id", n.usuario_id);
    const payload = JSON.stringify({ titulo: n.titulo, corpo: n.corpo, url: "/?notif=" + n.id + (n.chamado_id ? "&abrir=" + encodeURIComponent(n.chamado_id) : ""), tag: n.chave || "n" + n.id });
    let ok = 0; const erros: string[] = [];
    for (const s of subs || []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: "high" });
        ok++; await sb.from("push_inscricoes").update({ ultimo_ok: new Date().toISOString() }).eq("id", s.id);
      } catch (e: any) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) await sb.from("push_inscricoes").delete().eq("id", s.id);
        else erros.push(String(e?.statusCode || "") + " " + String(e?.body || e?.message || e).slice(0, 120));
      }
    }
    const semAparelho = !(subs || []).length;
    const falhou = !ok && erros.length;
    await sb.from("notificacoes").update({
      enviado_em: falhou ? null : new Date().toISOString(), tentativas: n.tentativas + 1,
      erro: semAparelho ? "sem aparelho" : erros.length ? erros.join(" | ") : null,
    }).eq("id", n.id);
    if (ok) enviados++;
  }
  return new Response(JSON.stringify({ processadas: (ns || []).length, enviados }), { headers: { "Content-Type": "application/json" } });
});
