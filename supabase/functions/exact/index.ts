// Integração ALIANÇA 360 ⇄ Exact (checklist)
// · sync: lê o quadro do checklist e o calendário do Exact e aplica no 360 (rpc exact_aplicar)
// · enderecos: completa o endereço das medidas (e do checklist da mesma venda) que estão sem endereço, pelo cartão de medição do Exact
// · push: envia para o Exact o agendamento de um checklist do 360 (cria / altera / exclui eventos)
// Chamada pelo banco (pg_net / pg_cron) com o cabeçalho x-exact-segredo. A chave do Exact fica no segredo EXACT_TOKEN.
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

const cap = (x: string) => String(x || "").trim().toLowerCase().replace(/(^|[\s\-\/(])([a-zà-ú])/g, (_m, a, b) => a + b.toUpperCase());
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
async function completarEnderecos(sb: any, token: string, limite = 25) {
  const { data: ls } = await sb.from("chamados").select("id,pedido,tratativa").eq("tipo", "medidas").or("endereco.is.null,endereco.eq.")
    .not("tratativa->medida->>exactId", "is", null).neq("status", "concluida").limit(limite);
  let ok = 0; const erros: string[] = [];
  for (const c of ls || []) {
    const ex = c.tratativa?.medida?.exactId; if (!ex) continue;
    try {
      const t = await exact(token, "GET", `/ticket/measuring/${ex}`);
      const e = enderecoExact(t?.client); if (!e) continue;
      await sb.from("chamados").update({ endereco: e }).eq("id", c.id).or("endereco.is.null,endereco.eq.");
      if (c.pedido) await sb.from("chamados").update({ endereco: e }).eq("pedido", c.pedido).eq("tipo", "checklist").or("endereco.is.null,endereco.eq.");
      ok++;
    } catch (x: any) { erros.push(c.id + ": " + String(x?.message || x).slice(0, 80)); }
  }
  return { ok, vistos: (ls || []).length, erros };
}

Deno.serve(async (req: Request) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await sb.from("exact_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg || !cfg.segredo || req.headers.get("x-exact-segredo") !== cfg.segredo) return json({ erro: "não autorizado" }, 401);
  const token = Deno.env.get("EXACT_TOKEN");
  if (!token) return json({ erro: "EXACT_TOKEN não configurado" }, 500);
  const b = await req.json().catch(() => ({}));
  try {
    // ---------- teste manual de evento (só com o segredo) ----------
    if (b.acao === "evento") {
      const d = await exact(token, b.metodo, b.rota, b.corpo);
      return json({ ok: true, d });
    }

    if (b.acao === "enderecos") return json({ ok: true, r: await completarEnderecos(sb, token, Math.min(Number(b.limite) || 40, 120)) });

    // ---------- Exact → 360 ----------
    if (b.acao === "sync") {
      const agendas = await exact(token, "GET", "/agenda");
      const quadro = await exact(token, "GET", "/tickets/checklist/board");
      const hoje = new Date(Date.now() - 36 * 3600e3).toISOString();
      const cards: any[] = []; const evs: any[] = [];
      for (const col of quadro || []) for (const c of col.cards || []) {
        cards.push({ ticketId: c.id, saleId: String(c.saleId ?? ""), col: col.key, client: c.client, seller: c.seller, total: c.totalValue });
        for (const e of c.events || []) if (e.start >= hoje) evs.push({ id: e.id, agendaId: e.agendaId, ticketId: c.id, saleId: String(c.saleId ?? ""), start: e.start, end: e.end, description: e.description, notes: e.notes });
      }
      let completo = false; let eventos = evs;
      if (b.eventos) { // calendário inteiro (traz também as travas manuais: reservado, médico, feriado…)
        const todos = await exact(token, "GET", "/events");
        eventos = (todos || []).filter((e: any) => e.start >= hoje).map((e: any) => ({
          id: e.id, agendaId: e.agendaId, ticketId: e.ticketId ?? null, saleId: e.ticket?.saleId ? String(e.ticket.saleId) : null,
          start: e.start, end: e.end, description: e.description, notes: e.notes, status: e.ticket?.status ?? null }));
        completo = true;
      }
      // telefones dos clientes novos (que ainda não estão no 360)
      const { data: novos } = await sb.rpc("exact_vendas_novas", { p: cards.filter(c => c.col === "CHECKLIST_WAITING_SCHEDULE" || evs.some(e => e.ticketId === c.ticketId)).map(c => c.saleId) });
      const det: Record<string, any> = {};
      for (const s of (novos || []).slice(0, 25)) {
        const c = cards.find(x => x.saleId === s); if (!c) continue;
        try { const t = await exact(token, "GET", `/ticket/checklist/${c.ticketId}`); det[s] = { tel: t?.client?.phoneNumber || "", tel2: t?.client?.alternativePhoneNumber || "", nome: t?.client?.name || c.client }; } catch { /* segue sem telefone */ }
      }
      for (const c of cards) if (det[c.saleId]) Object.assign(c, det[c.saleId]);
      const { data: r, error } = await sb.rpc("exact_aplicar", { p: { agendas, cards, eventos, completo } });
      if (error) throw new Error(error.message);
      // quadro de Medição do Exact → filas de Medidas do 360 (1 cartão = 1 medida)
      let med: any = null;
      try {
        const qm = await exact(token, "GET", "/tickets/measuring/board");
        const cm: any[] = []; for (const col of qm || []) for (const c of col.cards || []) cm.push({ ...c, _col: col.key });
        if (cm.length) { const { data: rm, error: em } = await sb.rpc("exact_medidas_aplicar", { p: cm }); med = em ? { erro: em.message } : rm; }
      } catch (x: any) { med = { erro: String(x.message || x).slice(0, 300) }; }
      // endereço das medidas que chegaram sem endereço (a planilha do Tático não traz)
      let end: any = null; try { end = await completarEnderecos(sb, token, 15); } catch (x: any) { end = { erro: String(x.message || x).slice(0, 200) }; }
      return json({ ok: true, r, medidas: med, enderecos: end });
    }

    // ---------- bloqueio do 360 → evento manual no Exact ----------
    if (b.acao === "bloqueio") {
      try {
        if (b.op === "excluir") {
          if (b.eventId) await exact(token, "DELETE", `/event/${b.eventId}`);
          await sb.rpc("exact_bloq_ok", { p_id: b.id, p_event: null, p_erro: null });
          return json({ ok: true });
        }
        const { data: pl, error } = await sb.rpc("exact_bloq_plano", { p_id: b.id });
        if (error) throw new Error(error.message);
        if (!pl || !pl.agendaId) return json({ ok: true, pulado: "sem agenda no Exact" });
        const corpo = { start: pl.start, end: pl.end, agendaId: pl.agendaId, description: pl.description, notes: pl.notes };
        let idEv = pl.eventId;
        if (idEv) await exact(token, "PUT", `/event/${idEv}`, corpo);
        else { const r = await exact(token, "POST", "/event", corpo); idEv = r?.id ?? null; }
        await sb.rpc("exact_bloq_ok", { p_id: b.id, p_event: idEv, p_erro: null });
        return json({ ok: true, eventId: idEv });
      } catch (x: any) {
        await sb.rpc("exact_bloq_ok", { p_id: b.id, p_event: null, p_erro: String(x.message || x).slice(0, 500) });
        throw x;
      }
    }

    // ---------- 360 → Exact ----------
    if (b.acao === "push") {
      const saida: any = {};
      // 1) reserva: horário oferecido pelo WhatsApp, aguardando resposta → evento "RESERVA 360" na agenda do projetista
      if (b.reserva) {
        const { data: rp, error: er } = await sb.rpc("exact_reserva_plano", { p_id: b.id });
        if (er) throw new Error(er.message);
        const feitos: any[] = []; const erros: string[] = [];
        const ex: any[] = rp?.existentes || [];
        for (const d of rp?.desejadas || []) {
          const e = ex.find((x: any) => x.dia === d.dia);
          const corpo = { start: d.start, end: d.end, agendaId: d.agendaId, description: rp.descricao, notes: rp.notes };
          try {
            if (!e) { const r = await exact(token, "POST", "/event", corpo); feitos.push({ op: "criar", id: r?.id ?? null, ...corpo }); }
            else if (e.start !== d.start || e.end !== d.end || e.agendaId !== d.agendaId) { await exact(token, "PUT", `/event/${e.id}`, corpo); feitos.push({ op: "alterar", id: e.id, ...corpo }); }
          } catch (x: any) { erros.push(String(x.message || x)); }
        }
        for (const e of ex) if (!(rp?.desejadas || []).some((d: any) => d.dia === e.dia)) {
          try { await exact(token, "DELETE", `/event/${e.id}`); feitos.push({ op: "excluir", id: e.id, start: e.start }); }
          catch (x: any) { const m = String(x.message || x); if (/→ 404/.test(m)) feitos.push({ op: "excluir", id: e.id, start: e.start }); else erros.push(m); }
        }
        await sb.rpc("exact_reserva_ok", { p_id: b.id, p: { feitos, erros } });
        saida.reserva = { feitos, erros };
      }
      // 2) agendamento do cliente (ligado ao ticket)
      if (b.agenda !== false) {
        const { data: plano, error } = await sb.rpc("exact_push_plano", { p_id: b.id });
        if (error) throw new Error(error.message);
        if (!plano || plano.pular) { saida.agenda = { pulado: plano?.motivo || "nada a fazer" }; return json({ ok: true, ...saida }); }
        const feitos: any[] = []; const erros: string[] = [];
        const de: any[] = plano.desejados || [];
        const diaLocal = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
        const hojeL = diaLocal(new Date().toISOString());
        const lerEventos = async () => {
          const t = await exact(token, "GET", `/ticket/checklist/${plano.ticketId}`);
          return (t?.events || []).filter((e: any) => diaLocal(e.start) >= hojeL)
            .map((e: any) => ({ id: e.id, dia: diaLocal(e.start), start: e.start, end: e.end, agendaId: e.agendaId, notes: e.notes, description: e.description }));
        };
        let ex: any[] = plano.existentes || [];
        try { ex = await lerEventos(); } catch { /* usa a cópia do 360 */ }
        for (const d of de) {
          const e = ex.find(x => x.dia === d.dia);
          const corpo = { start: d.start, end: d.end, agendaId: d.agendaId, description: plano.descricao, notes: d.notes ?? e?.notes ?? "", ticketId: plano.ticketId };
          try {
            if (!e) { const r = await exact(token, "POST", "/event/schedule", corpo); feitos.push({ op: "criar", id: r?.id ?? null, ...corpo }); }
            else if (e.start !== d.start || e.end !== d.end || e.agendaId !== d.agendaId) { await exact(token, "PUT", `/event/${e.id}`, corpo); feitos.push({ op: "alterar", id: e.id, ...corpo }); }
          } catch (x: any) { erros.push(String(x.message || x)); }
        }
        for (const e of ex) if (!de.some(d => d.dia === e.dia)) {
          try { await exact(token, "DELETE", `/event/${e.id}`); feitos.push({ op: "excluir", id: e.id }); } catch (x: any) { erros.push(String(x.message || x)); }
        }
        let eventos: any[] | null = null;
        if (feitos.length) { try { eventos = await lerEventos(); } catch { eventos = null; } }
        await sb.rpc("exact_push_ok", { p_id: b.id, p: { feitos, erros, eventos, ticketId: plano.ticketId } });
        saida.agenda = { feitos, erros };
      }
      return json({ ok: true, ...saida });
    }
    return json({ erro: "ação desconhecida" }, 400);
  } catch (e: any) {
    await sb.from("exact_log").insert({ tipo: b.acao || "?", chamado_id: b.id ?? null, ok: false, detalhe: String(e?.message || e).slice(0, 2000) });
    return json({ erro: String(e?.message || e) }, 500);
  }
});
