// Medidas · busca no Exact o cartão de cada medição e guarda no 360:
// · `notes` → a observação que o vendedor escreveu na venda (quantos e quais ambientes serão medidos)
// · `attachments` → as fotos da medição, cadastradas como anexo da medida (ficam com a URL do Exact, sem cópia)
// · `client.address` → o endereço completo (o quadro do Exact só manda bairro e cidade)
//
// Chamada pelo banco (pg_cron / pg_net) com o cabeçalho x-exact-segredo:
// · {acao:"lote", limite:20} → pega a fila por prioridade (quem está esperando aprovação primeiro)
// · {acao:"um", id:"ALM-0000"} → uma medida só (para testar)
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://alianca-api.ddnsking.com/api";
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });

async function exact(token: string, rota: string) {
  const r = await fetch(API + rota, { headers: { Authorization: "Bearer " + token } });
  const txt = await r.text(); let d: any = null; try { d = JSON.parse(txt); } catch { d = txt; }
  if (!r.ok) throw new Error(`GET ${rota} → ${r.status}`);
  return d && typeof d === "object" && !Array.isArray(d) && "data" in d ? d.data : d;
}

const ext = (n: string) => (String(n || "").toLowerCase().match(/\.([a-z0-9]{2,6})(?:\?|$)/) || [])[1] || "";
const ehImagem = (nome: string, mime?: string) => /^image\//.test(String(mime || "").toLowerCase()) || ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(ext(nome));

/** O `notes` do cartão começa com nome, endereço e telefones do cliente (o 360 já tem isso) e só depois vem o que o
 *  vendedor escreveu. Corta o cabeçalho (até a linha dos telefones) e separa as respostas do formulário do texto livre. */
export function lerNotas(notas: string) {
  const linhas = String(notas || "").split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim());
  let ini = 0;
  for (let i = 0; i < Math.min(linhas.length, 6); i++) if (/\(\d{2}\)\s*\d/.test(linhas[i])) ini = i + 1;
  // sem a linha dos telefones: corta até a linha da cidade ("BAIRRO, CIDADE-PR")
  if (!ini) for (let i = 0; i < Math.min(linhas.length, 6); i++) if (/-\s*[A-Z]{2}\s*$/.test(linhas[i])) ini = i + 1;
  const resto = linhas.slice(ini).filter(l => l && !/^-+$/.test(l));
  let qtd = "", ambientes = ""; const livres: string[] = [];
  for (const l of resto) {
    const resp = l.includes(":") ? l.slice(l.indexOf(":") + 1).trim() : "";
    if (/quantidade de ambientes/i.test(l)) { qtd = (resp.match(/\d+/) || [""])[0]; continue; }
    if (/quais ambientes/i.test(l)) { ambientes = resp; continue; }
    if (/data do checklist/i.test(l)) continue; // o 360 tem a data do checklist por conta própria
    livres.push(l);
  }
  return { qtd, ambientes, obs: livres.join(" · ").slice(0, 600) };
}

const cap = (x: string) => String(x || "").trim().toLowerCase().replace(/(^|[\s\-/(])([a-zà-ú])/g, (_m, a, b) => a + b.toUpperCase());
/** endereço do cliente do Exact em uma linha: "Da Paz, 733 - Casa · Planta Deodoro, Piraquara-PR" */
function enderecoExact(cli: any): string {
  const a = cli?.deliveryAddress?.street ? cli.deliveryAddress : cli?.address; if (!a) return "";
  const num = String(a.addressNumber || "").trim(); let rua = cap(a.street);
  if (num && rua && !rua.includes(num)) rua += ", " + num;
  if (String(a.add || "").trim()) rua += " - " + cap(a.add);
  const uf = String(a.state || "").trim().toUpperCase();
  const cid = [cap(a.neighbor), cap(a.city) + (uf ? "-" + uf : "")].filter(x => x && x !== "-" + uf).join(", ");
  return [rua, cid].filter(Boolean).join(" · ");
}

async function uma(sb: any, token: string, id: string, exactId: string) {
  const t = await exact(token, `/ticket/measuring/${exactId}`);
  const n = lerNotas(String(t?.notes || ""));
  const endereco = enderecoExact(t?.client);
  const fotos = (Array.isArray(t?.attachments) ? t.attachments : [])
    .map((a: any) => ({
      nome: String(a.originalFileName || a.fileName || ("foto " + (a.id ?? ""))).split("/").pop() || "foto",
      url: String(a.url || ""), mime: String(a.mimeType || ""),
    }))
    .filter((a: any) => /^https?:\/\//.test(a.url) && ehImagem(a.nome, a.mime));
  const { data, error } = await sb.rpc("medida_exact_detalhe_ok", { p_id: id, p: { ...n, endereco, fotos } });
  if (error) throw new Error(error.message);
  return { id, fotos: fotos.length, novas: data?.novas ?? 0, endereco: !!data?.endereco, ambientes: n.ambientes, qtd: n.qtd, obs: n.obs };
}

Deno.serve(async (req: Request) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await sb.from("exact_config").select("segredo").eq("id", 1).maybeSingle();
  if (!cfg?.segredo || req.headers.get("x-exact-segredo") !== cfg.segredo) return json({ erro: "não autorizado" }, 401);
  const token = Deno.env.get("EXACT_TOKEN");
  if (!token) return json({ erro: "EXACT_TOKEN não configurado" }, 500);
  const b = await req.json().catch(() => ({}));
  try {
    if (b.acao === "um") {
      const { data: c } = await sb.from("chamados").select("id,tratativa").eq("id", String(b.id || "")).maybeSingle();
      const ex = c?.tratativa?.medida?.exactId;
      if (!ex) return json({ erro: "medida sem cartão no Exact" }, 400);
      return json({ ok: true, r: await uma(sb, token, c.id, String(ex)) });
    }
    // fila: as que estão esperando aprovação primeiro, depois as que ainda vão ser medidas
    const { data: fila, error } = await sb.rpc("medida_exact_pendentes", { p_limite: Math.min(Number(b.limite) || 20, 60) });
    if (error) throw new Error(error.message);
    const feitos: any[] = []; const erros: string[] = [];
    for (const m of (fila || [])) {
      try { feitos.push(await uma(sb, token, m.id, String(m.exactId))); }
      catch (x: any) { erros.push(m.id + ": " + String(x?.message || x).slice(0, 120)); }
    }
    return json({ ok: true, vistos: (fila || []).length, novas: feitos.reduce((s, f) => s + f.novas, 0),
      enderecos: feitos.filter(f => f.endereco).length, feitos, erros });
  } catch (e: any) {
    await sb.from("exact_log").insert({ tipo: "detalhes", chamado_id: b.id ?? null, ok: false, detalhe: String(e?.message || e).slice(0, 2000) });
    return json({ erro: String(e?.message || e) }, 500);
  }
});
