// Checklist · CONTRATO com assinatura online (link + QR Code na tela do projetista)
// · criar  {id, html, aceites[]}   (projetista logado) → guarda o contrato (HTML com imagens embutidas) e devolve o link
// · status {id}                    (projetista logado) → situação do último contrato do checklist (+ link do assinado)
// · ver    {token}                 (cliente, sem login) → o contrato para ler e os itens para dar ciência
// · assinar {token, nome, aceites, assinatura, selfie}  (cliente) → guarda assinatura + selfie, monta o contrato assinado,
//            registra no checklist (conta como impressão + assinado) e manda para o ticket do Exact como "Outros"
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://alianca-api.ddnsking.com/api";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
async function sha256(txt: string) { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join(""); }
function dataUrlParaBytes(u: string): { bytes: Uint8Array; tipo: string } | null {
  const m = String(u || "").match(/^data:([\w/+.-]+);base64,(.+)$/); if (!m) return null;
  const bin = atob(m[2]); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return { bytes: b, tipo: m[1] };
}
const agoraBR = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const adm = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const b: any = await req.json().catch(() => ({}));
  try {
    // ---------- cliente (sem login) ----------
    if (b.acao === "ver" || b.acao === "assinar") {
      const token = String(b.token || "").replace(/[^a-f0-9]/gi, "");
      if (token.length < 20) return json({ erro: "Link inválido" }, 404);
      const { data: k } = await adm.from("ck_contratos").select("*").eq("token", token).maybeSingle();
      if (!k) return json({ erro: "Link inválido" }, 404);
      if (k.status === "assinado") return json({ assinado: true, nome: k.nome_assinante, em: k.assinado_em, cliente: k.cliente });
      if (k.status !== "pendente" || new Date(k.expira_em) < new Date()) return json({ erro: "Este link expirou. Peça um novo ao projetista da Aliança Móveis." }, 410);
      if (b.acao === "ver") {
        const { data: f, error } = await adm.storage.from("checklist").download(k.html_path);
        if (error || !f) return json({ erro: "Contrato não encontrado" }, 404);
        return json({ ok: true, cliente: k.cliente, venda: k.venda, aceites: k.aceites || [], html: await f.text(), hash: k.doc_hash });
      }
      // assinar
      const nome = String(b.nome || "").trim().slice(0, 120);
      const aceites: any[] = Array.isArray(b.aceites) ? b.aceites : [];
      if (nome.length < 5) return json({ erro: "Escreva seu nome completo" }, 400);
      if ((k.aceites || []).length && (aceites.length !== k.aceites.length || aceites.some(x => x !== true))) return json({ erro: "Marque todos os itens para assinar" }, 400);
      const ass = dataUrlParaBytes(b.assinatura), sel = dataUrlParaBytes(b.selfie);
      if (!ass || ass.bytes.length < 800) return json({ erro: "Faça a sua assinatura no quadro" }, 400);
      if (!sel || sel.bytes.length < 3000 || !/^image\//.test(sel.tipo)) return json({ erro: "Tire a selfie para confirmar a assinatura" }, 400);
      if (ass.bytes.length > 2e6 || sel.bytes.length > 6e6) return json({ erro: "Imagem grande demais" }, 400);
      const base = `${k.chamado_id}/contrato-${k.id}`;
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
      const ua = (req.headers.get("user-agent") || "").slice(0, 300);
      await adm.storage.from("checklist").upload(base + "-assinatura.png", ass.bytes, { contentType: "image/png", upsert: true });
      await adm.storage.from("checklist").upload(base + "-selfie.jpg", sel.bytes, { contentType: sel.tipo, upsert: true });
      // contrato assinado = o documento original + a página de assinatura (assinatura, selfie, data/hora, IP e o código do documento)
      const { data: f } = await adm.storage.from("checklist").download(k.html_path);
      const orig = f ? await f.text() : "";
      const quando = agoraBR();
      const pagina = `<div class="pg quebra" style="page-break-before:always;break-before:page;font:10pt Arial,sans-serif;color:#111">
<div style="border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-end"><b style="font-size:14pt">ALIANÇA MÓVEIS</b><b>CONTRATO ASSINADO ELETRONICAMENTE</b></div>
<p>O(a) cliente abaixo leu este documento, deu ciência em cada item e assinou eletronicamente, confirmando com uma foto (selfie) tirada no momento da assinatura.</p>
<table style="width:100%;border-collapse:collapse;font-size:9.5pt;margin:8px 0">
<tr><td style="border:1px solid #999;padding:5px;width:34%">Cliente / venda</td><td style="border:1px solid #999;padding:5px"><b>${esc(k.cliente || "")}</b> · venda ${esc(k.venda || "")}</td></tr>
<tr><td style="border:1px solid #999;padding:5px">Nome de quem assinou</td><td style="border:1px solid #999;padding:5px"><b>${esc(nome)}</b></td></tr>
<tr><td style="border:1px solid #999;padding:5px">Data e hora</td><td style="border:1px solid #999;padding:5px">${esc(quando)} (horário de Brasília)</td></tr>
<tr><td style="border:1px solid #999;padding:5px">IP · aparelho</td><td style="border:1px solid #999;padding:5px;font-size:8pt">${esc(ip || "—")} · ${esc(ua)}</td></tr>
<tr><td style="border:1px solid #999;padding:5px">Código do documento (SHA-256)</td><td style="border:1px solid #999;padding:5px;font-size:7.5pt;word-break:break-all">${esc(k.doc_hash || "")}</td></tr>
<tr><td style="border:1px solid #999;padding:5px">Projetista</td><td style="border:1px solid #999;padding:5px">${esc(k.criado_por_nome || "")}</td></tr></table>
<b>Itens com ciência do cliente</b><ul style="font-size:9pt;margin:4px 0 10px">${(k.aceites || []).map((a: string) => `<li>☑ ${esc(a)}</li>`).join("")}</ul>
<div style="display:flex;gap:18px;align-items:flex-end;margin-top:8px">
<div style="flex:1;text-align:center"><img src="${b.assinatura}" style="max-width:100%;max-height:110px;border-bottom:1px solid #111" alt=""><div style="font-size:9pt;margin-top:3px">Assinatura do cliente — ${esc(nome)}</div></div>
<div style="width:150px;text-align:center"><img src="${b.selfie}" style="width:150px;height:190px;object-fit:cover;border-radius:6px;border:1px solid #999" alt=""><div style="font-size:8pt;margin-top:3px">Selfie no momento da assinatura</div></div></div></div>`;
      const assinado = orig.includes("</body>") ? orig.replace("</body>", pagina + "</body>") : orig + pagina;
      const pathAss = base + "-ASSINADO.html";
      await adm.storage.from("checklist").upload(pathAss, new Blob([assinado], { type: "text/html" }), { contentType: "text/html; charset=utf-8", upsert: true });
      // cópia para o ticket do checklist no Exact ("Outros")
      let exactOk = false;
      try {
        const token = Deno.env.get("EXACT_TOKEN") || "";
        const { data: ch } = await adm.from("chamados").select("pedido").eq("id", k.chamado_id).maybeSingle();
        const { data: tk } = ch?.pedido ? await adm.from("exact_ticket").select("ticket_id").eq("sale_id", ch.pedido).maybeSingle() : { data: null } as any;
        if (token && tk?.ticket_id) {
          const fd = new FormData(); fd.append("file", new Blob([assinado], { type: "text/html" }), `Contrato_assinado_${k.venda || k.chamado_id}.html`);
          fd.append("referenceType", "OTHER"); fd.append("referenceId", "0"); fd.append("ticketId", String(tk.ticket_id));
          const r = await fetch(API + "/attachments", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
          exactOk = r.ok; if (!r.ok) await adm.from("exact_log").insert({ tipo: "contrato", chamado_id: k.chamado_id, ok: false, detalhe: "POST /attachments → " + r.status + " " + (await r.text()).slice(0, 300) });
        }
      } catch (x: any) { await adm.from("exact_log").insert({ tipo: "contrato", chamado_id: k.chamado_id, ok: false, detalhe: String(x?.message || x).slice(0, 300) }); }
      await adm.from("ck_contratos").update({ status: "assinado", nome_assinante: nome, assinatura_path: base + "-assinatura.png", selfie_path: base + "-selfie.jpg",
        assinado_em: new Date().toISOString(), ip, user_agent: ua, assinado_html_path: pathAss, exact: exactOk }).eq("id", k.id);
      const { error: e2 } = await adm.rpc("ck_contrato_registrar", { p_chamado: k.chamado_id, p: { id: k.id, nome, em: new Date().toISOString(), path: pathAss, exact: exactOk, geradoPor: k.criado_por_nome, hash: k.doc_hash } });
      if (e2) await adm.from("exact_log").insert({ tipo: "contrato", chamado_id: k.chamado_id, ok: false, detalhe: "registrar: " + e2.message });
      return json({ ok: true, assinado: true });
    }

    // ---------- projetista (logado) ----------
    const auth = req.headers.get("Authorization") || "";
    if (!/^Bearer\s+\S+/.test(auth)) return json({ erro: "Entre no 360 de novo" }, 401);
    const usu = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
    const { data: ctx, error: e1 } = await usu.rpc("ck_projetista_contexto", { p_id: String(b.id || "") });
    if (e1) return json({ erro: e1.message }, 403);
    if (b.acao === "criar") {
      const html = String(b.html || "");
      if (html.length < 500) return json({ erro: "Contrato vazio" }, 400);
      if (html.length > 40e6) return json({ erro: "Contrato grande demais (imagens). Escolha menos imagens." }, 400);
      const aceites = (Array.isArray(b.aceites) ? b.aceites : []).map((x: any) => String(x).slice(0, 400)).slice(0, 20);
      const hash = await sha256(html);
      await adm.from("ck_contratos").update({ status: "cancelado" }).eq("chamado_id", ctx.id).eq("status", "pendente");
      const { data: ch } = await adm.from("chamados").select("cliente,pedido").eq("id", ctx.id).maybeSingle();
      const { data: k, error } = await adm.from("ck_contratos").insert({ chamado_id: ctx.id, criado_por: ctx.usuario, criado_por_nome: ctx.nome, doc_hash: hash, aceites,
        cliente: ch?.cliente || "", venda: ch?.pedido || "" }).select("*").single();
      if (error) throw new Error(error.message);
      const path = `${ctx.id}/contrato-${k.id}.html`;
      const up = await adm.storage.from("checklist").upload(path, new Blob([html], { type: "text/html" }), { contentType: "text/html; charset=utf-8", upsert: true });
      if (up.error) throw new Error(up.error.message);
      await adm.from("ck_contratos").update({ html_path: path }).eq("id", k.id);
      await adm.from("historico").insert({ chamado_id: ctx.id, quem_id: ctx.usuario, quem_nome: ctx.nome, texto: "🔗 Contrato gerado para assinatura online (link válido por 3 dias)" });
      return json({ ok: true, token: k.token, expira: k.expira_em, hash });
    }
    if (b.acao === "status") {
      const { data: k } = await adm.from("ck_contratos").select("*").eq("chamado_id", ctx.id).neq("status", "cancelado").order("criado_em", { ascending: false }).limit(1).maybeSingle();
      if (!k) return json({ ok: true, contrato: null });
      let url = "", selfie = "";
      if (k.status === "assinado") {
        const a = await adm.storage.from("checklist").createSignedUrl(k.assinado_html_path, 3600); url = a.data?.signedUrl || "";
        const s = await adm.storage.from("checklist").createSignedUrl(k.selfie_path, 3600); selfie = s.data?.signedUrl || "";
      }
      return json({ ok: true, contrato: { token: k.token, status: new Date(k.expira_em) < new Date() && k.status === "pendente" ? "expirado" : k.status, criado: k.criado_em, expira: k.expira_em,
        nome: k.nome_assinante, assinado_em: k.assinado_em, exact: k.exact, url, selfie } });
    }
    if (b.acao === "cancelar") {
      await adm.from("ck_contratos").update({ status: "cancelado" }).eq("chamado_id", ctx.id).eq("status", "pendente");
      return json({ ok: true });
    }
    return json({ erro: "ação desconhecida" }, 400);
  } catch (e: any) {
    return json({ erro: String(e?.message || e) }, 500);
  }
});
