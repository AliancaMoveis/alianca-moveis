// 360 → Exact: aprova no Exact o pagamento das O.S. que foram aprovadas aqui.
// O Exact aprova em lote por montador: POST /tickets/assemble/bulk-approve-payments {ownerId, fieldReportIds}
// O ticket sai de ASSEMBLE_APPROVED para ASSEMBLE_FINALIZED ("Pagamento efetuado" no relatório de pagamento).
// Chamada pelo banco (rpc montagem_exact_pagar) com o cabeçalho x-exact-segredo. A chave do Exact fica no segredo EXACT_TOKEN.
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://alianca-api.ddnsking.com/api";
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });

async function exact(token: string, metodo: string, rota: string, corpo?: unknown) {
  const r = await fetch(API + rota, {
    method: metodo,
    headers: { Authorization: "Bearer " + token, ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const txt = await r.text();
  let d: any = null; try { d = JSON.parse(txt); } catch { d = txt; }
  if (!r.ok) throw new Error(`${metodo} ${rota} → ${r.status} ${typeof d === "string" ? d.slice(0, 200) : JSON.stringify(d).slice(0, 200)}`);
  return d && typeof d === "object" && "data" in d ? d.data : d;
}

Deno.serve(async (req: Request) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await sb.from("exact_config").select("segredo").eq("id", 1).maybeSingle();
  if (!cfg || !cfg.segredo || req.headers.get("x-exact-segredo") !== cfg.segredo) return json({ erro: "não autorizado" }, 401);
  const token = Deno.env.get("EXACT_TOKEN");
  if (!token) return json({ erro: "EXACT_TOKEN não configurado" }, 500);
  const b = await req.json().catch(() => ({}));

  try {
    const chaves: string[] = Array.isArray(b.chaves) ? b.chaves.slice(0, 300) : [];
    if (!chaves.length) return json({ erro: "nenhuma O.S. para aprovar" }, 400);

    const { data: linhas } = await sb.from("montagem_efet").select("chave,os,origem,montador")
      .in("chave", chaves).is("excluido_em", null).is("nao_pagar_em", null);
    const alvo = (linhas || []).filter((l: any) => l.origem !== "avulsa");

    const ok: string[] = [];
    const falhas: { chave: string; os: string; erro: string }[] = [];
    const porDono = new Map<number, { ids: number[]; chaves: string[]; oss: string[] }>();

    // 1) número da O.S. do 360 → ticket do Exact (externalId)
    for (const l of alvo) {
      const n = String(l.os || "").match(/\d+/)?.[0] || "";
      if (!n) { falhas.push({ chave: l.chave, os: l.os, erro: "sem número de O.S." }); continue; }
      try {
        const r = await exact(token, "GET", `/tickets/assemble?search=${n}&pageSize=10&page=1`);
        const ts: any[] = r?.tickets || [];
        const t = ts.find(x => String(x.externalId ?? "") === n) || ts.find(x => String(x.title || "").includes(n));
        if (!t) { falhas.push({ chave: l.chave, os: l.os, erro: "não achei o ticket no Exact" }); continue; }
        if (/FINALIZED/i.test(String(t.status || ""))) { ok.push(l.chave); continue; } // já estava paga lá
        if (!t.ownerId) { falhas.push({ chave: l.chave, os: l.os, erro: "ticket sem montador (ownerId)" }); continue; }
        const g = porDono.get(t.ownerId) || { ids: [], chaves: [], oss: [] };
        g.ids.push(t.id); g.chaves.push(l.chave); g.oss.push(l.os); porDono.set(t.ownerId, g);
      } catch (x: any) { falhas.push({ chave: l.chave, os: l.os, erro: String(x?.message || x).slice(0, 200) }); }
    }

    // 2) um lote por montador
    for (const [ownerId, g] of porDono) {
      try {
        await exact(token, "POST", "/tickets/assemble/bulk-approve-payments", { ownerId, fieldReportIds: g.ids });
        ok.push(...g.chaves);
      } catch (x: any) {
        const erro = String(x?.message || x).slice(0, 200);
        g.chaves.forEach((c, i) => falhas.push({ chave: c, os: g.oss[i], erro }));
      }
    }

    const agora = new Date().toISOString();
    for (let i = 0; i < ok.length; i += 100) await sb.from("montagem_efet").update({ exact_pag_em: agora, exact_pag_erro: null }).in("chave", ok.slice(i, i + 100));
    for (const f of falhas) await sb.from("montagem_efet").update({ exact_pag_erro: f.erro }).eq("chave", f.chave);

    await sb.from("exact_log").insert({ tipo: "pagar", ok: falhas.length === 0,
      detalhe: `${b.quem || "?"}: ${ok.length} aprovada(s) no Exact · ${falhas.length} falha(s)`
        + (falhas.length ? " — " + falhas.slice(0, 6).map(f => f.os + ": " + f.erro).join(" | ") : "") });

    return json({ ok: true, aprovadas: ok.length, falhas });
  } catch (e: any) {
    await sb.from("exact_log").insert({ tipo: "pagar", ok: false, detalhe: String(e?.message || e).slice(0, 2000) });
    return json({ erro: String(e?.message || e) }, 500);
  }
});
