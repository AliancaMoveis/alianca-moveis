// Vendas · puxa o relatório de vendas do Exact (o mesmo botão "Relatório de Vendas" do Checklist) e guarda no 360.
// Rota do Exact: GET /tickets/sales-report?start=AAAA-MM-DD&end=AAAA-MM-DD (CSV, com a coluna "Incluído por").
// Chamada pelo banco (pg_cron / pg_net) com o cabeçalho x-exact-segredo: {acao:"vendas", de, ate, quem}
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://alianca-api.ddnsking.com/api";
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });

/** CSV do Exact ("a","b",…) → linhas */
function lerCsv(txt: string): string[][] {
  const out: string[][] = []; let lin: string[] = []; let cel = ""; let q = false;
  const t = txt.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cel += '"'; i++; } else q = false; } else cel += ch; continue; }
    if (ch === '"') q = true; else if (ch === ",") { lin.push(cel); cel = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; lin.push(cel); cel = ""; if (lin.some(x => x !== "")) out.push(lin); lin = []; }
    else cel += ch;
  }
  if (cel !== "" || lin.length) { lin.push(cel); if (lin.some(x => x !== "")) out.push(lin); }
  return out;
}

Deno.serve(async (req: Request) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await sb.from("exact_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg || !cfg.segredo || req.headers.get("x-exact-segredo") !== cfg.segredo) return json({ erro: "não autorizado" }, 401);
  const token = Deno.env.get("EXACT_TOKEN");
  if (!token) return json({ erro: "EXACT_TOKEN não configurado" }, 500);
  const b = await req.json().catch(() => ({}));
  try {
    const de = String(b.de || "").slice(0, 10), ate = String(b.ate || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || ate < de) return json({ erro: "período inválido" }, 400);
    const r = await fetch(`${API}/tickets/sales-report?start=${de}&end=${ate}`, { headers: { Authorization: "Bearer " + token } });
    const txt = await r.text();
    if (!r.ok) throw new Error(`sales-report → ${r.status} ${txt.slice(0, 200)}`);
    let csv = txt; try { const d = JSON.parse(txt); csv = typeof d === "string" ? d : typeof d?.data === "string" ? d.data : txt; } catch { /* já é CSV */ }
    const ls = lerCsv(csv); if (!ls.length) throw new Error("relatório vazio");
    const cab = ls[0].map(x => x.trim());
    if (!cab.includes("ID") || !cab.includes("SituaçãoVenda")) throw new Error("Relatório do Exact mudou de formato: " + cab.join(", "));
    const linhas = ls.slice(1).map(l => Object.fromEntries(cab.map((c, i) => [c, (l[i] ?? "").trim()])));
    let novos = 0, atualizados = 0;
    for (let i = 0; i < linhas.length; i += 400) {
      const { data, error } = await sb.rpc("_exact_vendas_rel_aplicar", { p: linhas.slice(i, i + 400) });
      if (error) throw new Error(error.message);
      novos += data.novos; atualizados += data.atualizados;
    }
    const res = { ok: true, de, ate, linhas: linhas.length, novos, atualizados };
    await sb.from("exact_log").insert({ tipo: "vendas", ok: true, detalhe: JSON.stringify({ ...res, quem: b.quem || "" }) });
    return json(res);
  } catch (e: any) {
    await sb.from("exact_log").insert({ tipo: "vendas", ok: false, detalhe: String(e?.message || e).slice(0, 2000) });
    return json({ erro: String(e?.message || e) }, 500);
  }
});
