// Área do projetista do checklist · arquivos (chamada pelo navegador, com o login da pessoa)
// · arquivos {id}            → arquivos da venda (Exact /attachments-legacy/:saleId + anexos do ticket), fotos da medição (ticket MEASURING / fieldReport),
//                               anexos das medidas do 360 e o que o checklist subiu (bucket "checklist") — com links temporários
// · baixar {id, anexo}       → conteúdo de um arquivo da venda (Exact /attachment/download-legacy/:id), só se for daquela venda
// · subir (multipart: id, finalidade, file) → guarda no bucket "checklist" e tenta mandar para o ticket do Exact como "Outros"
// A permissão é conferida no banco (ck_projetista_contexto): só o projetista do cliente, o setor Checklist ou a Gestão.
// Não mexe na função "exact" (sincronização da agenda). Usa o mesmo segredo EXACT_TOKEN.
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://alianca-api.ddnsking.com/api";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const lista = (d: any): any[] => Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(d?.items) ? d.items : Array.isArray(d?.attachments) ? d.attachments : [];

async function exact(token: string, metodo: string, rota: string, corpo?: BodyInit, ct?: string) {
  const r = await fetch(API + rota, { method: metodo, headers: { Authorization: "Bearer " + token, ...(ct ? { "Content-Type": ct } : {}) }, body: corpo });
  const txt = await r.text();
  let d: any = null; try { d = JSON.parse(txt); } catch { d = txt; }
  if (!r.ok) throw new Error(`${metodo} ${rota} → ${r.status} ${typeof d === "string" ? d.slice(0, 200) : JSON.stringify(d).slice(0, 200)}`);
  return d && typeof d === "object" && !Array.isArray(d) && "data" in d ? d.data : d;
}

const ext = (n: string) => (String(n || "").toLowerCase().match(/\.([a-z0-9]{2,6})(?:\?|$)/) || [])[1] || "";
function tipoDe(nome: string, mime?: string) {
  const e = ext(nome), m = String(mime || "").toLowerCase();
  if (/^image\//.test(m) || ["jpg", "jpeg", "png", "webp", "gif", "heic", "bmp"].includes(e)) return "img";
  if (m.includes("pdf") || e === "pdf") return "pdf";
  if (e === "promob" || e === "promobplus") return "promob";
  return "outro";
}
/** arquivo do Exact em formato único (os nomes dos campos variam entre rotas) */
function norm(a: any, fonte: string) {
  const nome = String(a.originalFileName || a.originalName || a.fileName || a.filename || a.name || a.nome || a.key || ("arquivo " + (a.id ?? ""))).split("/").pop() || "arquivo";
  const url = a.url || a.location || a.publicUrl || a.link || a.path || "";
  return { fonte, id: String(a.id ?? a.attachmentId ?? ""), nome, tipo: tipoDe(nome || url, a.mimeType || a.contentType || a.mimetype),
    categoria: String(a.referenceType || a.attachmentType || a.category || "").toUpperCase(), tamanho: Number(a.size || a.fileSize || 0) || null,
    em: a.createdAt || a.created_at || a.uploadedAt || null, url: /^https?:\/\//.test(url) ? url : "" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const adm = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const auth = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/.test(auth)) return json({ erro: "Entre no 360 de novo" }, 401);
  const usu = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
  const token = Deno.env.get("EXACT_TOKEN") || "";
  let b: any = {}; let file: File | null = null;
  const multipart = (req.headers.get("content-type") || "").includes("multipart/form-data");
  try {
    if (multipart) { const f = await req.formData(); b = { acao: "subir", id: f.get("id"), finalidade: f.get("finalidade") }; const x = f.get("file"); file = x instanceof File ? x : null; }
    else b = await req.json().catch(() => ({}));
    const { data: ctx, error: e1 } = await usu.rpc("ck_projetista_contexto", { p_id: String(b.id || "") });
    if (e1) return json({ erro: e1.message }, 403);
    const pedido = String(ctx.pedido || ""), ticket = ctx.ticketId;

    // ---------- arquivos da venda + medição ----------
    if (b.acao === "arquivos") {
      const avisos: string[] = []; const venda: any[] = []; const medicao: any[] = []; const outrosTicket: any[] = [];
      if (!token) avisos.push("EXACT_TOKEN não configurado — sem os arquivos do Exact");
      if (token && pedido) {
        try { lista(await exact(token, "GET", `/attachments-legacy/${pedido}`)).forEach(a => venda.push(norm(a, "legacy"))); }
        catch (x: any) { avisos.push("Arquivos da venda (Exact): " + String(x.message || x).slice(0, 160)); }
      }
      if (token && ticket) {
        try {
          const t = await exact(token, "GET", `/ticket/checklist/${ticket}`);
          // fieldReport vem como lista (medição, montagem…); as fotos ficam em attachments de cada um
          const fr = [t?.fieldReport, t?.fieldReports].flat(2).filter((r: any) => r && typeof r === "object");
          const vistos = new Set<string>();
          fr.filter((r: any) => !r.type || r.type === "MEASURING").forEach((r: any) => (Array.isArray(r.attachments) ? r.attachments : []).forEach((a: any) => {
            const n = { ...norm(a, "ticket"), categoria: "MEASURING" }; if (n.url && !vistos.has(n.id)) { vistos.add(n.id); medicao.push(n); } }));
          lista(t?.attachments).forEach(a => {
            if (vistos.has(String(a.id))) return;
            const n = norm(a, "ticket");
            if (!n.url) return;
            if (n.categoria === "MEASURING") medicao.push(n); else if (n.categoria === "FINAL_PROJECT" || n.categoria === "INITIAL_PROJECT") venda.push(n); else outrosTicket.push(n);
          });
        } catch (x: any) { avisos.push("Ticket do checklist (Exact): " + String(x.message || x).slice(0, 160)); }
      } else if (token) avisos.push("Venda sem ticket de checklist no Exact (ainda não sincronizada)");
      // medidas do 360 (fotos/planta anexadas no chamado de medidas da venda)
      const ids: string[] = Array.isArray(ctx.medidas) ? ctx.medidas : [];
      let m360: any[] = [];
      if (ids.length) {
        const { data: an } = await adm.from("anexos").select("id,chamado_id,tipo,nome,url,storage_path,criado_em").in("chamado_id", ids).order("criado_em");
        const paths = (an || []).filter((a: any) => a.storage_path).map((a: any) => a.storage_path);
        const urls: Record<string, string> = {};
        if (paths.length) { const { data: s } = await adm.storage.from("anexos").createSignedUrls(paths, 3600); (s || []).forEach((x: any) => { if (x.path && x.signedUrl) urls[x.path] = x.signedUrl; }); }
        m360 = (an || []).map((a: any) => ({ fonte: "360", id: a.id, nome: a.nome || "arquivo", tipo: a.tipo === "img" ? "img" : a.tipo === "pdf" ? "pdf" : "outro", em: a.criado_em, url: a.storage_path ? urls[a.storage_path] || "" : a.url || "" })).filter((a: any) => a.url);
      }
      // o que o checklist subiu (bucket "checklist")
      const { data: ls } = await adm.storage.from("checklist").list(String(ctx.id), { limit: 200, sortBy: { column: "created_at", order: "asc" } });
      const ck: any[] = [];
      if (ls && ls.length) {
        const objs = ls.filter((o: any) => o.name && o.id);
        const ps = objs.map((o: any) => `${ctx.id}/${o.name}`);
        const { data: s } = await adm.storage.from("checklist").createSignedUrls(ps, 3600);
        (s || []).forEach((x: any, i: number) => { const nome = String(ps[i].split("/").pop()).replace(/^[0-9a-f-]{36}-/, ""); ck.push({ fonte: "checklist", id: ps[i], path: ps[i], nome, tipo: tipoDe(nome), url: x.signedUrl || "", em: (objs[i] as any).created_at || null }); });
      }
      return json({ ok: true, venda, medicao, m360, ck, outrosTicket, avisos, ticketId: ticket || null });
    }

    // ---------- baixar um arquivo da venda (Exact legacy) ----------
    if (b.acao === "baixar") {
      if (!token) return json({ erro: "EXACT_TOKEN não configurado" }, 500);
      const id = String(b.anexo || "");
      const da = lista(await exact(token, "GET", `/attachments-legacy/${pedido}`)).map(a => norm(a, "legacy"));
      if (!id || !da.some(a => a.id === id)) return json({ erro: "Arquivo não é desta venda" }, 403);
      const r = await fetch(API + `/attachment/download-legacy/${id}`, { headers: { Authorization: "Bearer " + token } });
      if (!r.ok) return json({ erro: "Exact: " + r.status }, 502);
      const ct = r.headers.get("content-type") || "application/octet-stream";
      if (ct.includes("json")) { // o Exact devolve {type:"Buffer", data:[bytes]} (às vezes dentro de {data:…}) ou só o link
        const d: any = await r.json().catch(() => ({}));
        const buf = d?.type === "Buffer" ? d : d?.data?.type === "Buffer" ? d.data : null;
        if (buf && Array.isArray(buf.data)) {
          const nome = da.find(a => a.id === id)?.nome || "";
          const e = ext(nome);
          const mime = e === "pdf" ? "application/pdf" : ["jpg", "jpeg"].includes(e) ? "image/jpeg" : e === "png" ? "image/png" : e === "webp" ? "image/webp" : "application/octet-stream";
          return new Response(new Uint8Array(buf.data), { headers: { ...CORS, "Content-Type": mime, "Content-Disposition": `inline; filename="${encodeURIComponent(nome)}"` } });
        }
        const u = d?.url || d?.data?.url || d?.data;
        if (typeof u === "string" && /^https?:\/\//.test(u)) { const f = await fetch(u); return new Response(f.body, { headers: { ...CORS, "Content-Type": f.headers.get("content-type") || "application/octet-stream" } }); }
        return json({ erro: "Exact não devolveu o arquivo" }, 502);
      }
      return new Response(r.body, { headers: { ...CORS, "Content-Type": ct } });
    }

    // ---------- subir arquivo do checklist (digitalizado assinado, imagens, listagem, .promob) ----------
    if (b.acao === "subir") {
      if (!file) return json({ erro: "Escolha o arquivo" }, 400);
      if (file.size > 50 * 1024 * 1024) return json({ erro: "Arquivo maior que 50 MB" }, 400);
      const fin = String(b.finalidade || "arquivo");
      const limpo = file.name.replace(/[^\w.\-]+/g, "_").slice(-120) || "arquivo";
      const path = `${ctx.id}/${crypto.randomUUID()}-${limpo}`;
      const { error: eu } = await adm.storage.from("checklist").upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (eu) return json({ erro: "Não foi possível guardar o arquivo (" + eu.message + ")" }, 500);
      // listagem do Promob e .promob não vão para o cliente nem para o Exact; o resto vai para o ticket como "Outros"
      let exactOk = false, exactErro = "";
      const vaiExact = fin === "assinado" || fin === "arquivo" || fin === "imagem";
      if (vaiExact && token && ticket) {
        try {
          const fd = new FormData(); fd.append("file", file, file.name); fd.append("referenceType", "OTHER"); fd.append("referenceId", "0"); fd.append("ticketId", String(ticket));
          await exact(token, "POST", "/attachments", fd);
          exactOk = true;
        } catch (x: any) { exactErro = String(x.message || x).slice(0, 300); }
      } else if (vaiExact) exactErro = !token ? "EXACT_TOKEN não configurado" : "venda sem ticket no Exact";
      if (exactErro) await adm.from("exact_log").insert({ tipo: "ck_subir", chamado_id: ctx.id, ok: false, detalhe: exactErro });
      const { data: s } = await adm.storage.from("checklist").createSignedUrl(path, 3600);
      return json({ ok: true, path, nome: file.name, tipo: tipoDe(file.name, file.type), url: s?.signedUrl || "", exact: exactOk, exactErro });
    }
    return json({ erro: "ação desconhecida" }, 400);
  } catch (e: any) {
    return json({ erro: String(e?.message || e) }, 500);
  }
});
