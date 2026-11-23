// Integração ALIANÇA 360 ⇄ Exact (checklist)
// · sync: lê o quadro do checklist e o calendário do Exact e aplica no 360 (rpc exact_aplicar)
// · enderecos: completa o endereço das medidas (e do checklist da mesma venda) que estão sem endereço, pelo cartão de medição do Exact
// · montagem: relatório de pagamento de montagem (o mesmo "Exportar em Massa" do Exact) → montagem_efet (tela Pagamento de Montagem)
// · agendamentos: relatório de agendamentos de montagem (quem agendou, montador, datas) → montagem_agend (tela Agendamentos de Montagem)
// · push: envia para o Exact o agendamento de um checklist do 360 (cria / altera / exclui eventos)
// Chamada pelo banco (pg_net / pg_cron) com o cabeçalho x-exact-segredo. A chave do Exact fica no segredo EXACT_TOKEN.
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://alianca-api.ddnsking.com/api";
/** o evento já não existe no Exact: 404, ou o 500 do Prisma dizendo que o registro sumiu.
 *  Nos dois casos o horário já está livre — é sucesso, não erro, e o 360 precisa dar baixa.
 *  Sem isso a reserva ficava órfã para sempre no 360 (13 casos em 23/11/2026). */
const sumiu = (m: string) => /→ 404/.test(m) || /Record to delete does not exist/i.test(m);
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

/** CSV do Exact ("a","b",…) → linhas */
function lerCsv(txt: string): string[][] {
  const out: string[][] = []; let lin: string[] = []; let cel = ""; let q = false;
  const t = txt.replace(/^\ufeff/, "");
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
const dataIso = (s: string) => { const m = String(s || "").match(/(\d{2})[-\/](\d{2})[-\/](\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };
const numero = (s: string) => { const t = String(s || "0").trim(); const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "")); return isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;
/** mesmo critério da importação do Excel na tela Pagamento de Montagem (chave = O.S. ¦ montador ¦ data de montagem) */
function montagensDoCsv(txt: string) {
  const ls = lerCsv(txt); if (!ls.length) return [];
  const cab = ls[0].map(x => x.trim().toLowerCase());
  const ix = (...n: string[]) => cab.findIndex(c => n.some(k => c === k.toLowerCase()));
  const iM = ix("Montador"), iO = ix("os", "O.S."), iS = ix("status"), iD = ix("Data Montagem"), iF = ix("Data Finalizacao", "Data Finalização"),
        iP = ix("Total Produtos"), iA = ix("Total Adicionais"), iT = ix("Total OS");
  if (iM < 0 || iO < 0 || iD < 0 || iT < 0) throw new Error("Relatório do Exact mudou de formato: " + ls[0].join(", "));
  const m = new Map<string, any>();
  for (const l of ls.slice(1)) {
    const osFull = String(l[iO] || "").trim(), mont = String(l[iM] || "").trim(); if (!osFull || !mont) continue;
    const os = osFull.split("|")[0].trim(), dm = dataIso(l[iD]), chave = [os, mont, dm].join("¦");
    const e = { chave, os, montador: mont, status: String(l[iS] || "").trim(), mont: dm, fin: iF >= 0 ? dataIso(l[iF]) : "",
      prod: numero(l[iP]), adic: iA >= 0 ? numero(l[iA]) : 0, total: numero(l[iT]) };
    const ex = m.get(chave);
    if (ex) { ex.prod = r2(ex.prod + e.prod); ex.adic = r2(ex.adic + e.adic); ex.total = r2(ex.total + e.total); } else m.set(chave, e);
  }
  return Array.from(m.values());
}

/** relatório de agendamentos (mesmo critério da importação na tela Agendamentos: chave = O.S. ¦ montador ¦ data de montagem ¦ agendadora;
 *  a mesma O.S. em 2 linhas — Linha Pronta + Planejada — vira 1 agendamento) */
function agendamentosDoCsv(txt: string) {
  const ls = lerCsv(txt); if (!ls.length) return [];
  const cab = ls[0].map(x => x.trim());
  const ix = (...n: string[]) => cab.findIndex(c => n.some(k => c.toLowerCase() === k.toLowerCase()));
  const iL = ix("Lider", "Líder"), iM = ix("Montador"), iO = ix("os", "O.S."), iS = ix("status"), iI = ix("Cliente indisponível para montagem"),
        iInc = ix("Data Inclusao", "Data Inclusão"), iD = ix("Data Montagem"), iF = ix("Data Finalizacao", "Data Finalização"), iT = ix("Tipo"), iTot = ix("Total OS");
  if (iL < 0 || iO < 0 || iD < 0) throw new Error("Relatório de agendamentos do Exact mudou de formato: " + cab.join(", "));
  const m = new Map<string, any>();
  for (const l of ls.slice(1)) {
    const osFull = String(l[iO] || "").trim(), lider = String(l[iL] || "").trim(), mont = iM >= 0 ? String(l[iM] || "").trim() : "";
    if (!osFull || !lider) continue;
    const os = osFull.split("|")[0].trim(), dm = dataIso(l[iD]), chave = [os, mont, dm, lider].join("¦");
    const tipo = iT >= 0 ? String(l[iT] || "").trim() : "", tot = iTot >= 0 ? numero(l[iTot]) : 0;
    const bruto = Object.fromEntries(cab.map((c, k) => [c, l[k] ?? ""]));
    const ex = m.get(chave);
    if (ex) { ex.total = r2(ex.total + tot); if (tipo && !ex.tipos.includes(tipo)) ex.tipos = ex.tipos ? ex.tipos + " + " + tipo : tipo; ex.bruto.push(bruto); continue; }
    m.set(chave, { chave, os, lider, montador: mont, status: iS >= 0 ? String(l[iS] || "").trim() : "", indisp: iI >= 0 && /^sim/i.test(String(l[iI] || "")),
      inc: iInc >= 0 ? dataIso(l[iInc]) : "", mont: dm, fin: iF >= 0 ? dataIso(l[iF]) : "", tipos: tipo, total: tot, bruto: [bruto] });
  }
  return Array.from(m.values());
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

    // ---------- pagamento de montagem (relatório "Exportar em Massa" do Exact) → 360 ----------
    if (b.acao === "montagem") {
      const de = String(b.de || "").slice(0, 10), ate = String(b.ate || "").slice(0, 10), por = b.por === "schedule" ? "schedule" : "assemble";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return json({ erro: "período inválido" }, 400);
      const csv = await exact(token, "GET", `/tickets/payment-report?start=${de}&end=${ate}&date=${por}`);
      const lin = montagensDoCsv(typeof csv === "string" ? csv : String(csv ?? ""));
      let r: any = { novos: 0, atualizados: 0, total: 0 };
      for (let i = 0; i < lin.length; i += 500) {
        const { data, error } = await sb.rpc("_montagem_efet_aplicar", { p: lin.slice(i, i + 500) });
        if (error) throw new Error(error.message);
        r = { novos: r.novos + data.novos, atualizados: r.atualizados + data.atualizados, total: data.total };
      }
      const soma = r2(lin.reduce((s: number, x: any) => s + x.total, 0));
      const res = { ok: true, de, ate, por, linhas: lin.length, soma, ...r };
      await sb.from("exact_log").insert({ tipo: "montagem", ok: true, detalhe: JSON.stringify({ ...res, quem: b.quem || "" }) });
      return json(res);
    }

    // ---------- agendamentos de montagem (relatório de agendamentos do Exact, pela data de inclusão) → 360 ----------
    if (b.acao === "agendamentos") {
      const de = String(b.de || "").slice(0, 10), ate = String(b.ate || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return json({ erro: "período inválido" }, 400);
      const csv = await exact(token, "GET", `/tickets/schedule-report?start=${de}&end=${ate}`);
      const lin = agendamentosDoCsv(typeof csv === "string" ? csv : String(csv ?? ""));
      let r: any = { novos: 0, atualizados: 0, total: 0 };
      for (let i = 0; i < lin.length; i += 300) {
        const { data, error } = await sb.rpc("_montagem_agend_aplicar", { p: lin.slice(i, i + 300) });
        if (error) throw new Error(error.message);
        r = { novos: r.novos + data.novos, atualizados: r.atualizados + data.atualizados, total: data.total };
      }
      const res = { ok: true, de, ate, linhas: lin.length, agendadoras: new Set(lin.map((x: any) => x.lider)).size, ...r };
      await sb.from("exact_log").insert({ tipo: "agendamentos", ok: true, detalhe: JSON.stringify({ ...res, quem: b.quem || "" }) });
      return json(res);
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
          catch (x: any) { const m = String(x.message || x); if (sumiu(m)) feitos.push({ op: "excluir", id: e.id, start: e.start }); else erros.push(m); }
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
          try { await exact(token, "DELETE", `/event/${e.id}`); feitos.push({ op: "excluir", id: e.id }); }
          catch (x: any) { const m = String(x.message || x); if (sumiu(m)) feitos.push({ op: "excluir", id: e.id }); else erros.push(m); }
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
