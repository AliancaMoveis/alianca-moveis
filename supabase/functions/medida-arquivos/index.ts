// Medidas · imagens do projeto da venda para quem vai medir (só imagens — sem orçamento, valores ou outros documentos)
// · imagens {id}          → lista as imagens da venda (Exact /attachments-legacy/:venda + anexos de projeto do ticket do checklist)
// · baixar {id, anexo}    → conteúdo de uma imagem da venda (Exact /attachment/download-legacy/:id), só se for imagem daquela venda
// · anteriores {id}       → fotos da medição no Exact (cartão de medição) e fotos da visita do consultor antes da venda (360)
// A permissão é conferida no banco (medida_contexto): o medidor da medida, a Supervisão de Medidas ou a Gestão.
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://alianca-api.ddnsking.com/api";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const lista = (d: any): any[] => Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(d?.items) ? d.items : Array.isArray(d?.attachments) ? d.attachments : [];
const ext = (n: string) => (String(n || "").toLowerCase().match(/\.([a-z0-9]{2,6})(?:\?|$)/) || [])[1] || "";
const ehImagem = (nome: string, mime?: string) => /^image\//.test(String(mime || "").toLowerCase()) || ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(ext(nome));
const mimeDe = (nome: string) => { const e = ext(nome); return e === "png" ? "image/png" : e === "webp" ? "image/webp" : e === "gif" ? "image/gif" : "image/jpeg"; };
function norm(a: any, fonte: string) {
  const nome = String(a.originalFileName || a.originalName || a.fileName || a.filename || a.name || ("arquivo " + (a.id ?? ""))).split("/").pop() || "arquivo";
  const url = a.url || a.location || a.publicUrl || a.link || "";
  return { fonte, id: String(a.id ?? ""), nome, img: ehImagem(nome, a.mimeType || a.contentType), categoria: String(a.referenceType || "").toUpperCase(),
    em: a.createdAt || null, url: /^https?:\/\//.test(url) ? url : "" };
}
async function exact(token: string, rota: string) {
  const r = await fetch(API + rota, { headers: { Authorization: "Bearer " + token } });
  const txt = await r.text(); let d: any = null; try { d = JSON.parse(txt); } catch { d = txt; }
  if (!r.ok) throw new Error(`GET ${rota} → ${r.status}`);
  return d && typeof d === "object" && !Array.isArray(d) && "data" in d ? d.data : d;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/.test(auth)) return json({ erro: "Entre no 360 de novo" }, 401);
  const usu = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
  const token = Deno.env.get("EXACT_TOKEN") || "";
  const b: any = await req.json().catch(() => ({}));
  try {
    const { data: ctx, error: e1 } = await usu.rpc("medida_contexto", { p_id: String(b.id || "") });
    if (e1) return json({ erro: e1.message }, 403);
    const pedido = String(ctx.pedido || "").trim();
    if (b.acao === "anteriores") {
      const adm = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
      const exactFotos: any[] = []; let exactNotas = ""; const visita: any[] = []; const avisos: string[] = [];
      if (token && ctx.exactId) {
        try {
          const t = await exact(token, `/ticket/measuring/${ctx.exactId}`);
          exactNotas = String(t?.notes || "");
          lista(t?.attachments).map((a: any) => norm(a, "exact")).filter((a: any) => a.url).forEach((a: any) => exactFotos.push({ nome: a.nome, url: a.url, img: a.img, em: a.em }));
        } catch (x: any) { avisos.push("Medição no Exact: " + String(x.message || x).slice(0, 120)); }
      }
      const tel = String(ctx.telefone || "").replace(/\D/g, "").slice(-8);
      if (tel.length === 8) {
        const { data: vs } = await adm.from("chamados").select("id,cliente,telefone,data_visita,consultor_id,tratativa").eq("tipo", "visita_consultor").ilike("telefone", "%" + tel.slice(-4) + "%").limit(30);
        const minhas = (vs || []).filter((v: any) => String(v.telefone || "").replace(/\D/g, "").slice(-8) === tel).slice(0, 3);
        for (const v of minhas) {
          const { data: an } = await adm.from("anexos").select("nome,tipo,url,storage_path,criado_em").eq("chamado_id", v.id).order("criado_em");
          const ps = (an || []).filter((a: any) => a.storage_path).map((a: any) => a.storage_path);
          const urls: Record<string, string> = {};
          if (ps.length) { const { data: sgn } = await adm.storage.from("anexos").createSignedUrls(ps, 3600); (sgn || []).forEach((x: any) => { if (x.path && x.signedUrl) urls[x.path] = x.signedUrl; }); }
          visita.push({ id: v.id, cliente: v.cliente, data: v.data_visita, medidas: v.tratativa?.medidas || "", obs: v.tratativa?.obs || "",
            fotos: (an || []).map((a: any) => ({ nome: a.nome || "foto", img: a.tipo === "img", url: a.storage_path ? urls[a.storage_path] || "" : a.url || "", em: a.criado_em })).filter((a: any) => a.url) });
        }
      }
      return json({ ok: true, exact: { fotos: exactFotos, notas: exactNotas }, visita, avisos });
    }
    if (!token) return json({ erro: "EXACT_TOKEN não configurado" }, 500);
    if (!pedido) return json({ ok: true, imagens: [], aviso: "Medida sem número de venda" });
    const legacy = async () => lista(await exact(token, `/attachments-legacy/${pedido}`)).map(a => norm(a, "legacy"));

    if (b.acao === "imagens") {
      const imgs: any[] = []; const avisos: string[] = [];
      try { (await legacy()).filter(a => a.img).forEach(a => imgs.push({ fonte: "legacy", id: a.id, nome: a.nome, em: a.em, url: "" })); }
      catch (x: any) { avisos.push("Arquivos da venda (Exact): " + String(x.message || x).slice(0, 120)); }
      if (ctx.ticketId) {
        try {
          const t = await exact(token, `/ticket/checklist/${ctx.ticketId}`);
          lista(t?.attachments).map((a: any) => norm(a, "ticket"))
            .filter((a: any) => a.img && a.url && ["FINAL_PROJECT", "INITIAL_PROJECT", "PROJECT"].includes(a.categoria))
            .forEach((a: any) => imgs.push({ fonte: "ticket", id: a.id, nome: a.nome, em: a.em, url: a.url }));
        } catch { /* segue só com os arquivos da venda */ }
      }
      return json({ ok: true, imagens: imgs, avisos });
    }

    if (b.acao === "baixar") {
      const id = String(b.anexo || "");
      const a = (await legacy()).find(x => x.id === id);
      if (!a || !a.img) return json({ erro: "Imagem não é desta venda" }, 403);
      const r = await fetch(API + `/attachment/download-legacy/${id}`, { headers: { Authorization: "Bearer " + token } });
      if (!r.ok) return json({ erro: "Exact: " + r.status }, 502);
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("json")) { // o Exact devolve {type:"Buffer", data:[bytes]} (às vezes dentro de {data:…}) ou só o link
        const d: any = await r.json().catch(() => ({}));
        const buf = d?.type === "Buffer" ? d : d?.data?.type === "Buffer" ? d.data : null;
        if (buf && Array.isArray(buf.data)) return new Response(new Uint8Array(buf.data), { headers: { ...CORS, "Content-Type": mimeDe(a.nome) } });
        const u = d?.url || d?.data?.url || d?.data;
        if (typeof u === "string" && /^https?:\/\//.test(u)) { const f = await fetch(u); return new Response(f.body, { headers: { ...CORS, "Content-Type": f.headers.get("content-type") || mimeDe(a.nome) } }); }
        return json({ erro: "Exact não devolveu a imagem" }, 502);
      }
      return new Response(r.body, { headers: { ...CORS, "Content-Type": ct || mimeDe(a.nome) } });
    }
    return json({ erro: "ação desconhecida" }, 400);
  } catch (e: any) {
    return json({ erro: String(e?.message || e) }, 500);
  }
});
