// Montagem · espelho do quadro operacional do Exact → mt_os
//
// Sondado em 23/11/2026: a listagem paginada /tickets/assemble?status=…&pageSize=100&page=N já traz
// cliente, DOIS telefones, ENDEREÇO DE ENTREGA com CEP, produtos com assemblyTime (horas previstas),
// anexos, owner e eventos — cerca de 3,9 KB por O.S. Ou seja, não é preciso buscar ticket a ticket
// como o desenho de 18/11 previa: uma varredura paginada traz tudo.
//
// Vive separada da função `exact` de propósito: aquela é infraestrutura do checklist, em produção,
// e um erro aqui não pode derrubar o agendamento de ninguém.
//
// Corpo: { acao:"varrer", status:"ASSEMBLE_PENDING_SCHEDULE", page?, paginas?, pageSize? }
//        { acao:"colunas" }  → só lê o quadro e devolve o tamanho de cada coluna
// Cabeçalho: x-exact-segredo (exact_config.segredo). A chave do Exact fica no segredo EXACT_TOKEN.
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://alianca-api.ddnsking.com/api";
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });

// as 11 colunas do quadro, na ordem em que interessam para a operação
const COLUNAS = [
  "ASSEMBLE_PENDING_SCHEDULE", "ASSEMBLE_PENDING", "ASSEMBLE_WAITING_PARTS",
  "ASSEMBLE_WAITING_ANALYSIS", "ASSEMBLE_PENDING_ADDITION_APPROVEMENT", "ASSEMBLE_TECHNICAL_ASSISTANCE",
  "ASSEMBLE_APPROVED", "ASSEMBLE_PAYMENT_APPROVED", "ASSEMBLE_REJECTED",
];

async function exact(token: string, rota: string) {
  const r = await fetch(API + rota, { headers: { Authorization: "Bearer " + token } });
  const txt = await r.text();
  let d: any = null; try { d = JSON.parse(txt); } catch { d = txt; }
  if (!r.ok) throw new Error(`GET ${rota} → ${r.status} ${String(typeof d === "string" ? d : JSON.stringify(d)).slice(0, 200)}`);
  // o Exact embrulha tudo em { data: … }; sem desembrulhar, a lista chega sempre vazia
  return d && typeof d === "object" && "data" in d ? d.data : d;
}

Deno.serve(async (req: Request) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cfg } = await sb.from("exact_config").select("segredo, ler_ativo").eq("id", 1).single();
  if (!cfg || req.headers.get("x-exact-segredo") !== cfg.segredo) return json({ erro: "não autorizado" }, 401);
  const token = Deno.env.get("EXACT_TOKEN");
  if (!token) return json({ erro: "EXACT_TOKEN não configurado" }, 500);
  const b = await req.json().catch(() => ({} as any));

  try {
    if (!cfg.ler_ativo) return json({ ok: false, erro: "leitura do Exact desligada" });

    // quanto tem em cada coluna, sem gravar nada — serve para planejar a varredura
    if (b.acao === "colunas") {
      const out: Record<string, number> = {};
      for (const c of COLUNAS) {
        const d: any = await exact(token, `/tickets/assemble?status=${c}&pageSize=1&page=1`);
        out[c] = Number(d?.total) || 0;
      }
      return json({ ok: true, colunas: out, soma: Object.values(out).reduce((s, n) => s + n, 0) });
    }

    // diagnóstico: mostra o que a função realmente recebe do Exact, sem gravar nada
    if (b.acao === "sonda") {
      const rota = `/tickets/assemble?status=${String(b.status || "ASSEMBLE_PENDING_SCHEDULE")}&pageSize=${Number(b.pageSize) || 2}&page=1`;
      const d: any = await exact(token, rota);
      return json({
        ok: true, rota, tipo: typeof d, ehArray: Array.isArray(d),
        chaves: d && typeof d === "object" ? Object.keys(d).slice(0, 20) : null,
        temTickets: Array.isArray(d?.tickets), qtdTickets: Array.isArray(d?.tickets) ? d.tickets.length : null,
        total: d?.total ?? null, amostra: String(typeof d === "string" ? d : JSON.stringify(d)).slice(0, 400),
      });
    }

    // varre UMA coluna por chamada, para não estourar o tempo da função
    const col = String(b.status || "").trim();
    if (!/^ASSEMBLE_[A-Z_]+$/.test(col)) return json({ erro: "status inválido" }, 400);
    const porPg = Math.min(Number(b.pageSize) || 100, 100);
    const maxPg = Math.min(Number(b.paginas) || 12, 30);
    let pg = Math.max(1, Number(b.page) || 1), lidos = 0, totalExact = 0, paginas = 0;
    let r: any = { novos: 0, atualizados: 0, total: 0 };

    while (paginas < maxPg) {
      const d: any = await exact(token, `/tickets/assemble?status=${col}&pageSize=${porPg}&page=${pg}`);
      const lista = Array.isArray(d?.tickets) ? d.tickets : [];
      totalExact = Number(d?.total) || totalExact;
      if (!lista.length) break;
      const { data, error } = await sb.rpc("_mt_os_aplicar", { p: lista });
      if (error) throw new Error(error.message);
      r = { novos: r.novos + data.novos, atualizados: r.atualizados + data.atualizados, total: data.total };
      lidos += lista.length; paginas++;
      if (lista.length < porPg) { pg++; break; }
      pg++;
    }
    // proxima: null quando acabou a coluna; o banco usa isso para saber se precisa chamar de novo
    const acabou = lidos === 0 || (pg - 1) * porPg >= totalExact;
    const res = { ok: true, status: col, lidos, paginas, proxima: acabou ? null : pg, totalExact, ...r };
    await sb.from("exact_log").insert({ tipo: "assemble", ok: true, detalhe: JSON.stringify({ ...res, quem: b.quem || "" }) });
    return json(res);
  } catch (e: any) {
    const erro = String(e?.message || e).slice(0, 2000);
    await sb.from("exact_log").insert({ tipo: "assemble", ok: false, detalhe: erro });
    return json({ ok: false, erro }, 200);
  }
});
