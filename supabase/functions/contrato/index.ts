// Checklist · CONTRATO com assinatura online (link + QR Code na tela do projetista)
// · criar  {id, dados}  (projetista logado) → guarda os dados do contrato (termo, geral, imagens embutidas) e devolve o link
// · status {id}         (projetista logado) → situação do último contrato do checklist (+ link do assinado)
// · cancelar {id}       (projetista logado)
// · ver    {token}      (cliente, sem login) → os dados para o cliente conferir, dar ciência e assinar
// · assinar {token, resposta, assinatura, selfie} (cliente) → confere tudo, monta o contrato assinado (doc.ts), registra no checklist
//            (conta como impressão + assinado) e manda a cópia para o ticket do Exact como "Outros"
// · teste / teste_ver (só com o segredo da integração) → contrato fictício "TESTE-CONTRATO"
// doc.ts é cópia de src/lib/contratoDoc.ts (mesmo modelo do celular e da impressão).
import { createClient } from "npm:@supabase/supabase-js@2";
import { contratoHtml, CONDICOES_CONTRATO, cpfValido, diferencasTermo, faltaNoTermo, LOGO_URL, type ContratoDados, type RespostaContrato } from "./doc.ts";

const API = "https://alianca-api.ddnsking.com/api";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
async function sha256(txt: string) { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join(""); }
function dataUrlParaBytes(u: string): { bytes: Uint8Array; tipo: string } | null {
  const m = String(u || "").match(/^data:([\w/+.-]+);base64,(.+)$/); if (!m) return null;
  const bin = atob(m[2]); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return { bytes: b, tipo: m[1] };
}
const agoraBR = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const TESTE = "TESTE-CONTRATO";
/** logo embutido no contrato assinado (o arquivo fica completo mesmo se o site mudar) */
let logoCache = "";
async function logoEmbutido() {
  if (logoCache) return logoCache;
  try {
    const r = await fetch(LOGO_URL);
    if (r.ok) { const b = new Uint8Array(await r.arrayBuffer()); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); logoCache = "data:image/png;base64," + btoa(s); }
  } catch { /* usa o link */ }
  return logoCache || LOGO_URL;
}

/** confere o formato dos dados que o projetista mandou */
function dadosOk(d: any): string {
  if (!d || typeof d !== "object") return "Contrato vazio";
  if (!Array.isArray(d.ambientes) || !d.ambientes.length) return "Contrato sem ambientes";
  if (d.ambientes.length > 30) return "Ambientes demais";
  for (const a of d.ambientes) if (!a || !a.nome || !a.termo || !Array.isArray(a.imagens)) return "Ambiente incompleto no contrato";
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const adm = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const b: any = await req.json().catch(() => ({}));
  const guardar = async (k: any, dados: ContratoDados) => {
    const txt = JSON.stringify(dados);
    const path = `${k.chamado_id}/contrato-${k.id}.json`;
    const up = await adm.storage.from("checklist").upload(path, new Blob([txt], { type: "application/json" }), { contentType: "application/json", upsert: true });
    if (up.error) throw new Error(up.error.message);
    await adm.from("ck_contratos").update({ html_path: path, doc_hash: await sha256(txt) }).eq("id", k.id);
  };
  try {
    // ---------- cliente (sem login) ----------
    if (b.acao === "ver" || b.acao === "assinar") {
      const token = String(b.token || "").replace(/[^a-f0-9]/gi, "");
      if (token.length < 20) return json({ erro: "Link inválido" }, 404);
      const { data: k } = await adm.from("ck_contratos").select("*").eq("token", token).maybeSingle();
      if (!k) return json({ erro: "Link inválido" }, 404);
      if (k.status === "assinado") return json({ assinado: true, nome: k.nome_assinante, em: k.assinado_em, cliente: k.cliente });
      if (k.status !== "pendente" || new Date(k.expira_em) < new Date()) return json({ erro: "Este link expirou. Peça um novo ao projetista da Aliança Móveis." }, 410);
      if (!String(k.html_path || "").endsWith(".json")) return json({ erro: "Este link é de uma versão antiga do contrato. Peça um novo ao projetista." }, 410);
      const { data: f, error } = await adm.storage.from("checklist").download(k.html_path);
      if (error || !f) return json({ erro: "Contrato não encontrado" }, 404);
      const dados: ContratoDados = JSON.parse(await f.text());
      if (b.acao === "ver") return json({ ok: true, dados, hash: k.doc_hash });

      // assinar — confere tudo de novo no servidor
      const r: RespostaContrato = b.resposta || {};
      const nome = String(r.nome || "").trim().slice(0, 120), cpf = String(r.cpf || "").replace(/\D/g, "");
      const n = dados.ambientes.length;
      if (nome.length < 5) return json({ erro: "Escreva seu nome completo" }, 400);
      if (!cpfValido(cpf)) return json({ erro: "CPF inválido" }, 400);
      if (!Array.isArray(r.termos) || r.termos.length !== n) return json({ erro: "Confira o termo do material de todos os ambientes" }, 400);
      for (let i = 0; i < n; i++) { const f = faltaNoTermo(r.termos[i]); if (f.length) return json({ erro: `Ambiente ${dados.ambientes[i].nome}: falta ${f.join(", ")}` }, 400); }
      if (!Array.isArray(r.materiaisOk) || r.materiaisOk.length !== n || r.materiaisOk.some(x => x !== true)) return json({ erro: "Confirme os materiais de cada ambiente" }, 400);
      if (!Array.isArray(r.geral) || r.geral.length !== CONDICOES_CONTRATO.length || r.geral.some(x => x !== true)) return json({ erro: "Marque “Sim” em todos os itens do termo geral" }, 400);
      if (!Array.isArray(r.imagensOk) || r.imagensOk.length !== n || r.imagensOk.some(x => x !== true)) return json({ erro: "Confirme as imagens do projeto de cada ambiente" }, 400);
      const ass = dataUrlParaBytes(b.assinatura), sel = dataUrlParaBytes(b.selfie);
      if (!ass || ass.bytes.length < 800) return json({ erro: "Faça a sua assinatura no quadro" }, 400);
      if (!sel || sel.bytes.length < 3000 || !/^image\//.test(sel.tipo)) return json({ erro: "Tire a selfie para confirmar a assinatura" }, 400);
      if (ass.bytes.length > 2e6 || sel.bytes.length > 6e6) return json({ erro: "Imagem grande demais" }, 400);
      const base = `${k.chamado_id}/contrato-${k.id}`;
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
      const ua = (req.headers.get("user-agent") || "").slice(0, 300);
      await adm.storage.from("checklist").upload(base + "-assinatura.png", ass.bytes, { contentType: "image/png", upsert: true });
      await adm.storage.from("checklist").upload(base + "-selfie.jpg", sel.bytes, { contentType: sel.tipo, upsert: true });
      const resp: RespostaContrato = { nome, cpf, termos: r.termos, materiaisOk: r.materiaisOk, geral: r.geral, imagensOk: r.imagensOk };
      const assinado = contratoHtml(dados, resp, { nome, cpf, quando: agoraBR(), ip, ua, hash: k.doc_hash || "", assinatura: b.assinatura, selfie: b.selfie, projetista: k.criado_por_nome || dados.projetista }, await logoEmbutido());
      const pathAss = base + (k.reutilizavel ? "-ASSINADO-" + Date.now() : "-ASSINADO") + ".html";
      await adm.storage.from("checklist").upload(pathAss, new Blob([assinado], { type: "text/html" }), { contentType: "text/html; charset=utf-8", upsert: true });
      const alteracoes = dados.ambientes.flatMap((a, i) => diferencasTermo(a.termo, r.termos[i]).map(x => a.nome + " — " + x));
      // link de TESTE reutilizável: guarda a assinatura, devolve o contrato assinado para ver na hora e continua aberto para o próximo
      if (k.reutilizavel) {
        await adm.from("ck_contratos").update({ nome_assinante: nome, cpf, assinado_em: new Date().toISOString(), ip, user_agent: ua, assinado_html_path: pathAss, resposta: { ...resp, alteracoes } }).eq("id", k.id);
        const su = await adm.storage.from("checklist").createSignedUrl(pathAss, 7 * 86400);
        return json({ ok: true, assinado: true, teste: true, url: su.data?.signedUrl || "" });
      }
      // cópia para o ticket do checklist no Exact ("Outros")
      let exactOk = false;
      if (k.chamado_id !== TESTE) try {
        const token = Deno.env.get("EXACT_TOKEN") || "";
        const { data: ch } = await adm.from("chamados").select("pedido").eq("id", k.chamado_id).maybeSingle();
        const { data: tk } = ch?.pedido ? await adm.from("exact_ticket").select("ticket_id").eq("sale_id", ch.pedido).maybeSingle() : { data: null } as any;
        if (token && tk?.ticket_id) {
          const fd = new FormData(); fd.append("file", new Blob([assinado], { type: "text/html" }), `Contrato_assinado_${k.venda || k.chamado_id}.html`);
          fd.append("referenceType", "OTHER"); fd.append("referenceId", "0"); fd.append("ticketId", String(tk.ticket_id));
          const rr = await fetch(API + "/attachments", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
          exactOk = rr.ok; if (!rr.ok) await adm.from("exact_log").insert({ tipo: "contrato", chamado_id: k.chamado_id, ok: false, detalhe: "POST /attachments → " + rr.status + " " + (await rr.text()).slice(0, 300) });
        }
      } catch (x: any) { await adm.from("exact_log").insert({ tipo: "contrato", chamado_id: k.chamado_id, ok: false, detalhe: String(x?.message || x).slice(0, 300) }); }
      await adm.from("ck_contratos").update({ status: "assinado", nome_assinante: nome, cpf, assinatura_path: base + "-assinatura.png", selfie_path: base + "-selfie.jpg",
        assinado_em: new Date().toISOString(), ip, user_agent: ua, assinado_html_path: pathAss, exact: exactOk, resposta: { ...resp, alteracoes } }).eq("id", k.id);
      if (k.chamado_id === TESTE) return json({ ok: true, assinado: true });
      const { error: e2 } = await adm.rpc("ck_contrato_registrar", { p_chamado: k.chamado_id, p: { id: k.id, nome, em: new Date().toISOString(), path: pathAss, exact: exactOk, geradoPor: k.criado_por_nome, hash: k.doc_hash, alteracoes } });
      if (e2) await adm.from("exact_log").insert({ tipo: "contrato", chamado_id: k.chamado_id, ok: false, detalhe: "registrar: " + e2.message });
      return json({ ok: true, assinado: true });
    }

    // ---------- contrato de TESTE (só com o segredo da integração) ----------
    if (b.acao === "teste" || b.acao === "teste_ver") {
      const { data: cfg } = await adm.from("exact_config").select("segredo").eq("id", 1).maybeSingle();
      if (!cfg?.segredo || req.headers.get("x-exact-segredo") !== cfg.segredo) return json({ erro: "não autorizado" }, 401);
      if (b.acao === "teste_ver") {
        const { data: k } = await adm.from("ck_contratos").select("*").eq("chamado_id", TESTE).order("criado_em", { ascending: false }).limit(1).maybeSingle();
        if (!k) return json({ ok: true, contrato: null });
        const a = k.assinado_html_path ? (await adm.storage.from("checklist").createSignedUrl(k.assinado_html_path, 7 * 86400)).data?.signedUrl || "" : "";
        return json({ ok: true, status: k.status, nome: k.nome_assinante, em: k.assinado_em, ip: k.ip, url: a, token: k.token });
      }
      const erro = dadosOk(b.dados); if (erro) return json({ erro }, 400);
      const { data: k, error } = await adm.from("ck_contratos").insert({ chamado_id: TESTE, criado_por_nome: b.dados.projetista || "Teste", aceites: [], cliente: b.dados.cliente, venda: b.dados.venda,
        reutilizavel: b.reutilizavel !== false, expira_em: new Date(Date.now() + 90 * 86400e3).toISOString() }).select("*").single();
      if (error) throw new Error(error.message);
      await guardar(k, b.dados);
      return json({ ok: true, token: k.token, expira: k.expira_em });
    }

    // ---------- projetista (logado) ----------
    const auth = req.headers.get("Authorization") || "";
    if (!/^Bearer\s+\S+/.test(auth)) return json({ erro: "Entre no 360 de novo" }, 401);
    const usu = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
    const { data: ctx, error: e1 } = await usu.rpc("ck_projetista_contexto", { p_id: String(b.id || "") });
    if (e1) return json({ erro: e1.message }, 403);
    if (b.acao === "criar") {
      const erro = dadosOk(b.dados); if (erro) return json({ erro }, 400);
      if (JSON.stringify(b.dados).length > 40e6) return json({ erro: "Contrato grande demais (imagens). Escolha menos imagens." }, 400);
      await adm.from("ck_contratos").update({ status: "cancelado" }).eq("chamado_id", ctx.id).eq("status", "pendente");
      const { data: ch } = await adm.from("chamados").select("cliente,pedido").eq("id", ctx.id).maybeSingle();
      const { data: k, error } = await adm.from("ck_contratos").insert({ chamado_id: ctx.id, criado_por: ctx.usuario, criado_por_nome: ctx.nome, aceites: [],
        cliente: ch?.cliente || b.dados.cliente || "", venda: ch?.pedido || b.dados.venda || "" }).select("*").single();
      if (error) throw new Error(error.message);
      await guardar(k, b.dados);
      await adm.from("historico").insert({ chamado_id: ctx.id, quem_id: ctx.usuario, quem_nome: ctx.nome, texto: "🔗 Contrato gerado para assinatura online (link válido por 3 dias)" });
      const { data: k2 } = await adm.from("ck_contratos").select("doc_hash").eq("id", k.id).maybeSingle();
      return json({ ok: true, token: k.token, expira: k.expira_em, hash: k2?.doc_hash || "" });
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
        nome: k.nome_assinante, assinado_em: k.assinado_em, exact: k.exact, url, selfie, alteracoes: k.resposta?.alteracoes || [] } });
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
