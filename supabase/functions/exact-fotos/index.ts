// 360 → Exact · fotos da medida
// As medidas passam a ser feitas e aprovadas no 360; o Exact recebe a cópia das fotos.
// Não existe rota de escrita para o cartão de Medição, mas existe para ANEXO DE TICKET (POST /attachments),
// e o ticket do checklist da venda a gente já conhece (exact_ticket). As fotos sobem nele com
// referenceType = MEASURING, que é o mesmo tipo que o Exact devolve ao ler os anexos do checklist.
// Contrato confirmado na sondagem: referenceType, referenceId e ticketId obrigatórios, mais o arquivo (multipart).
//
// Corpo: { id: "<chamado da medida>", teste?: true }  · cabeçalho x-exact-segredo (exact_config.segredo)
//   teste = true manda só a primeira foto e devolve a resposta crua do Exact.
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://alianca-api.ddnsking.com/api";
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });
const mimeDe = (n: string) => /\.png$/i.test(n) ? "image/png" : /\.webp$/i.test(n) ? "image/webp" : /\.pdf$/i.test(n) ? "application/pdf" : "image/jpeg";

async function subirAnexo(token: string, ticketId: number, nome: string, bytes: Uint8Array, tipo = "MEASURING") {
  const nomeOk = /\.\w{2,4}$/.test(nome) ? nome : nome + ".jpg";
  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type: mimeDe(nomeOk) }), nomeOk);
  fd.append("referenceType", tipo);
  fd.append("referenceId", "0");
  fd.append("ticketId", String(ticketId));
  fd.append("mimeType", mimeDe(nomeOk));
  fd.append("name", nomeOk);
  const r = await fetch(API + "/attachments", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
  const txt = await r.text();
  if (!r.ok) throw new Error(`POST /attachments → ${r.status} ${txt.slice(0, 300)}`);
  try { return JSON.parse(txt); } catch { return txt; }
}

Deno.serve(async (req: Request) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await sb.from("exact_config").select("segredo").eq("id", 1).maybeSingle();
  if (!cfg || !cfg.segredo || req.headers.get("x-exact-segredo") !== cfg.segredo) return json({ erro: "não autorizado" }, 401);
  const token = Deno.env.get("EXACT_TOKEN");
  if (!token) return json({ erro: "EXACT_TOKEN não configurado" }, 500);
  const b = await req.json().catch(() => ({}));
  if (!b.id) return json({ erro: "falta o id da medida" }, 400);
  try {
    const { data: plano, error } = await sb.rpc("medida_fotos_exact", { p_id: b.id });
    if (error) throw new Error(error.message);
    if (!plano?.ticketId) return json({ ok: false, erro: "esta venda não tem ticket de checklist no Exact", venda: plano?.venda ?? null });
    const pendentes: any[] = plano.fotos || [];
    if (!pendentes.length) return json({ ok: true, nada: "sem foto nova para enviar", ticketId: plano.ticketId });
    const lista = b.teste ? pendentes.slice(0, 1) : pendentes;
    const enviadas: string[] = []; const erros: string[] = []; const respostas: any[] = [];
    for (const f of lista) {
      try {
        const { data: sg, error: es } = await sb.storage.from("anexos").createSignedUrl(f.path, 300);
        if (es || !sg?.signedUrl) throw new Error("storage: " + (es?.message || "sem url"));
        const img = await fetch(sg.signedUrl);
        if (!img.ok) throw new Error("storage " + img.status);
        const bytes = new Uint8Array(await img.arrayBuffer());
        respostas.push(await subirAnexo(token, Number(plano.ticketId), f.nome, bytes));
        enviadas.push(String(f.id));
      } catch (x: any) { erros.push(f.nome + ": " + String(x?.message || x).slice(0, 250)); }
    }
    await sb.rpc("medida_fotos_exact_ok", { p_id: b.id, p: { enviadas, erro: erros.join(" · ") } });
    return json({ ok: erros.length === 0, cliente: plano.cliente, venda: plano.venda, ticketId: plano.ticketId,
      enviadas: enviadas.length, pendentes: pendentes.length, erros, ...(b.teste ? { resposta: respostas[0] ?? null } : {}) });
  } catch (e: any) {
    await sb.from("exact_log").insert({ tipo: "fotos", chamado_id: b.id ?? null, ok: false, detalhe: String(e?.message || e).slice(0, 2000) });
    return json({ erro: String(e?.message || e) }, 500);
  }
});
