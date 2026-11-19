// Reenvia ao Exact os arquivos que ficaram para trás quando ele esteve fora do ar.
//
// Por que existe: quando o Exact não responde, o 360 guarda o arquivo normalmente no
// bucket "checklist" e marca a falha no exact_log — mas não existe fila de reenvio, então
// o arquivo fica só no 360 (em 19/11/2026 foram 4). Esta função fecha esse buraco.
//
// Autorização: x-exact-segredo, o mesmo segredo da função "exact" (exact_config.segredo).
//
// Corpo:
//   { pendentes: true, limite?: 50 }   → varre os contratos assinados com exact=false
//   { itens: [{ chamado, path }] }     → reenvia exatamente esses arquivos
//   { simular: true }                  → só diz o que faria, sem mandar nada
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://alianca-api.ddnsking.com/api";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-exact-segredo", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/** nome que o Exact vai mostrar: tira o uuid que o 360 põe na frente do arquivo */
const nomeLimpo = (path: string) => String(path.split("/").pop() || "arquivo").replace(/^[0-9a-f-]{36}-/, "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await sb.from("exact_config").select("segredo").eq("id", 1).maybeSingle();
  if (!cfg?.segredo || req.headers.get("x-exact-segredo") !== cfg.segredo) return json({ erro: "não autorizado" }, 401);
  const token = Deno.env.get("EXACT_TOKEN");
  if (!token) return json({ erro: "EXACT_TOKEN não configurado" }, 500);

  const b = await req.json().catch(() => ({}));
  const simular = b.simular === true;

  try {
    // ---------- o que reenviar ----------
    let itens: { chamado: string; path: string; assinado: boolean }[] = [];
    if (Array.isArray(b.itens) && b.itens.length) {
      itens = b.itens.map((x: any) => ({ chamado: String(x.chamado || ""), path: String(x.path || ""), assinado: x.assinado !== false }))
        .filter((x: any) => x.chamado && x.path);
    } else if (b.pendentes) {
      // contratos assinados que o 360 guardou mas o Exact nunca recebeu
      const { data: cs, error } = await sb.rpc("ck_assinados_pendentes", { p_limite: Math.min(Number(b.limite) || 50, 200) });
      if (error) throw new Error(error.message);
      itens = (cs || []).map((x: any) => ({ chamado: x.chamado_id, path: x.path, assinado: true }));
    } else return json({ erro: "diga 'pendentes: true' ou mande 'itens'" }, 400);

    if (!itens.length) return json({ ok: true, total: 0, feitos: [], falhas: [], nota: "nada pendente" });

    // ---------- ticket de cada chamado ----------
    const ids = [...new Set(itens.map(i => i.chamado))];
    const { data: chs } = await sb.from("chamados").select("id,pedido").in("id", ids);
    const pedidoDe = new Map((chs || []).map((c: any) => [c.id, String(c.pedido || "")]));
    const peds = [...new Set([...pedidoDe.values()].filter(Boolean))];
    const { data: ts } = await sb.from("exact_ticket").select("sale_id,ticket_id").in("sale_id", peds);
    const ticketDe = new Map((ts || []).map((t: any) => [String(t.sale_id), t.ticket_id]));

    const feitos: any[] = []; const falhas: any[] = [];
    for (const it of itens) {
      const pedido = pedidoDe.get(it.chamado) || "";
      const ticket = ticketDe.get(pedido);
      if (!ticket) { falhas.push({ ...it, erro: "venda sem ticket de checklist no Exact" }); continue; }
      if (simular) { feitos.push({ ...it, ticket, nome: nomeLimpo(it.path), simulado: true }); continue; }
      try {
        const { data: blob, error: ed } = await sb.storage.from("checklist").download(it.path);
        if (ed || !blob) throw new Error("arquivo não está no 360 (" + (ed?.message || "sem conteúdo") + ")");
        const nome = nomeLimpo(it.path);
        const fd = new FormData();
        fd.append("file", blob, nome);
        fd.append("referenceType", "OTHER");
        fd.append("referenceId", "0");
        fd.append("ticketId", String(ticket));
        const r = await fetch(API + "/attachments", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
        const txt = await r.text();
        if (!r.ok) throw new Error(`Exact ${r.status} ${txt.slice(0, 200)}`);
        if (it.assinado) await sb.rpc("ck_assinado_exact_ok", { p_chamado: it.chamado, p_path: it.path });
        await sb.from("exact_log").insert({ tipo: "reenvio", chamado_id: it.chamado, ok: true, detalhe: { path: it.path, nome, ticket } });
        feitos.push({ ...it, ticket, nome });
      } catch (x: any) {
        const erro = String(x?.message || x).slice(0, 400);
        await sb.from("exact_log").insert({ tipo: "reenvio", chamado_id: it.chamado, ok: false, detalhe: { path: it.path, erro } });
        falhas.push({ ...it, erro });
      }
    }
    return json({ ok: true, total: itens.length, enviados: feitos.length, feitos, falhas });
  } catch (e: any) {
    return json({ erro: String(e?.message || e) }, 500);
  }
});
