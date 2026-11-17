// Ponte entre o 360 e a Kommo (CRM de WhatsApp da loja).
//
// Autenticação, dois caminhos:
//   x-360-segredo         — chamadas internas (banco, cron), conferido contra segredos.kommo_segredo
//   Authorization: Bearer — JWT do usuário do 360; só passa quem tem pode_checklist()
// O token da Kommo vem do banco (segredos.kommo_token), nunca do código.
//
// Ações:
//   conta        — teste de conexão
//   localizar    — onde o cliente está na Kommo, pelo telefone
//   sincronizar  — garante lead no funil do checklist (aplicar:false = simulação)
//   enviar       — grava os campos no lead e dispara o bot que manda a mensagem

const FUNIL_PRE = 13398119;         // VENDAS E AGENDAMENTO
const FUNIL_CK = 13550523;          // Pós Venda Proj. / Checklist
const ETAPA_CK_FILA = 104552799;      // CHECKLIST — cliente entrou na fila, ainda a agendar
const ETAPA_CK_AGUARDANDO = 114261095; // Aguardando confirmação — mensagem enviada
const ETAPA_CK_ENTRADA = ETAPA_CK_FILA;
const ETAPA_PRE_COMPROU = 105287587;

// campos do lead que alimentam as variáveis do modelo aprovado
const CF_ATENDENTE = 2070596, CF_PEDIDO = 2070598, CF_DATA = 2070600, CF_CHECKLIST = 2070602;

const ETAPAS: Record<number, string> = {
  105287011: "entrada", 103392019: "em tratativa", 107365047: "engatilhados",
  105291631: "linha pronta", 103392023: "agendado", 103392027: "tent 1",
  103392031: "tent 2", 103392035: "tent 3", 103392039: "cliente não responde",
  105287015: "pedido cancelado", 105287019: "NÃO QUALIFICADO", 107365051: "disparos para hoje",
  105287587: "comprou", 109435419: "confirmação", 110061091: "Haisla", 110061787: "Confirmou",
  109434803: "campanha chaleira",
  106849795: "primeiro contato", 104552791: "Contato inicial", 104552795: "confirma agendamento",
  106848187: "PÓS VENDA", 104552799: "CHECKLIST", 106848191: "AGENDADO",
  106848195: "OBRAS", 106848223: "FINALIZADO",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-360-segredo",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SB = () => Deno.env.get("SUPABASE_URL")!;
const SR = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5dW53YWR0a3Znd3FubHhocGNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxMjk2OTQsImV4cCI6MjEwNTcwNTY5NH0.vx8dUNTBtrVUI_UoQawllEnfjCQxAnoLO4plt1ghSFc";

async function segredo(chave: string): Promise<string> {
  const r = await fetch(`${SB()}/rest/v1/segredos?chave=eq.${chave}&select=valor`, {
    headers: { apikey: SR(), Authorization: `Bearer ${SR()}` },
  });
  const d = await r.json();
  if (!Array.isArray(d) || !d.length) throw new Error(`segredo ${chave} não encontrado`);
  return d[0].valor as string;
}

/** Deixa passar chamada interna (segredo) ou usuário do 360 com permissão de checklist. */
async function autorizado(req: Request): Promise<boolean> {
  try {
    if (req.headers.get("x-360-segredo") === await segredo("kommo_segredo")) return true;
  } catch { /* segue para o JWT */ }
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const r = await fetch(`${SB()}/rest/v1/rpc/pode_checklist`, {
    method: "POST", headers: { apikey: ANON, Authorization: auth, "Content-Type": "application/json" }, body: "{}",
  });
  if (r.status !== 200) return false;
  return (await r.json()) === true;
}

let _tok = "", _base = "";
async function kommo(caminho: string, init: RequestInit = {}): Promise<{ st: number; d: any }> {
  if (!_tok) { _tok = await segredo("kommo_token"); _base = await segredo("kommo_base"); }
  const r = await fetch(_base + caminho, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${_tok}`, "Content-Type": "application/json" },
  });
  const t = await r.text();
  let d: any = null;
  try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  return { st: r.status, d };
}

const soDig = (s: string) => String(s || "").replace(/\D/g, "");

/**
 * Acha o contato do cliente na Kommo.
 * A Kommo guarda muitos telefones SEM o nono dígito (4195362803 em vez de 41995362803),
 * então a busca é pelos 8 últimos dígitos — a única chave que casa nos dois formatos.
 */
async function acharContato(telefone: string) {
  const n = soDig(telefone);
  if (n.length < 10) return { erro: "telefone inválido" as const };
  const ult8 = n.slice(-8), ddd = n.slice(0, 2);
  const { st, d } = await kommo(`/api/v4/contacts?query=${ult8}&with=leads&limit=10`);
  if (st === 204) return { contatos: [] as any[] };
  if (st !== 200) return { erro: `busca falhou (${st})` as const };
  const todos = d?._embedded?.contacts || [];
  const fonesDe = (c: any) => (c.custom_fields_values || []).filter((f: any) => f.field_code === "PHONE")
    .flatMap((f: any) => (f.values || []).map((v: any) => soDig(v.value)));
  // Cliente duplicado na Kommo é comum, e as cópias costumam ter o telefone quebrado
  // (sem o nono dígito). Fica na frente quem bate EXATAMENTE com o número do 360 —
  // é esse que tem a conversa de WhatsApp viva. O resto entra só como reserva.
  const exato = todos.filter((c: any) => fonesDe(c).some((f: string) => f === n || f === "55" + n || f.slice(-11) === n));
  const porDDD = todos.filter((c: any) => {
    const fones = fonesDe(c);
    if (!fones.length) return false;
    return fones.some((f: string) => f.slice(-8) === ult8 && (f.length < 10 || f.slice(-11, -9) === ddd || f.slice(-10, -8) === ddd));
  });
  const ordem = [...exato, ...porDDD.filter((c: any) => !exato.includes(c)), ...todos.filter((c: any) => !exato.includes(c) && !porDDD.includes(c))];
  return { contatos: ordem };
}

async function situacao(telefone: string) {
  const r = await acharContato(telefone);
  if ("erro" in r) return { ok: false, motivo: r.erro };
  const contatos = r.contatos;
  if (!contatos.length) return { ok: true, achou: false, leads: [] as any[] };
  const ids = [...new Set(contatos.flatMap((c: any) => (c._embedded?.leads || []).map((l: any) => l.id)))];
  const leads: any[] = [];
  for (const id of ids.slice(0, 10)) {
    const { st, d } = await kommo(`/api/v4/leads/${id}`);
    if (st === 200 && d) leads.push({ id: d.id, funil: d.pipeline_id, etapa: d.status_id, nome_etapa: ETAPAS[d.status_id] || String(d.status_id) });
  }
  return { ok: true, achou: true, contato_id: contatos[0].id, contatos: contatos.map((c: any) => c.id), leads };
}

/** Cria contato + lead no funil do checklist. Reaproveita o contato quando ele já existe. */
async function criarCliente(it: any, contatoExistente?: number | null) {
  const fone = soDig(String(it.telefone || ""));
  const nome = String(it.cliente || "").trim() || "Cliente";
  const nomeLead = it.pedido ? `${nome} — venda ${it.pedido}` : nome;
  let contato_id: number | null = contatoExistente ?? null;
  let lead_id: number | null = null;

  if (contato_id) {
    const { st, d } = await kommo("/api/v4/leads", {
      method: "POST",
      body: JSON.stringify([{ name: nomeLead, pipeline_id: FUNIL_CK, status_id: ETAPA_CK_ENTRADA, _embedded: { contacts: [{ id: contato_id }] } }]),
    });
    if (st !== 200 && st !== 201) return { ok: false, st, d };
    lead_id = d?._embedded?.leads?.[0]?.id ?? null;
  } else {
    const { st, d } = await kommo("/api/v4/leads/complex", {
      method: "POST",
      body: JSON.stringify([{
        name: nomeLead, pipeline_id: FUNIL_CK, status_id: ETAPA_CK_ENTRADA,
        _embedded: { contacts: [{ name: nome, custom_fields_values: [{ field_code: "PHONE", values: [{ enum_code: "WORK", value: fone }] }] }] },
      }]),
    });
    if (st !== 200 && st !== 201) return { ok: false, st, d };
    const r0 = Array.isArray(d) ? d[0] : null;
    lead_id = r0?.id ?? null;
    contato_id = r0?.contact_id ?? null;
  }
  if (lead_id) {
    await kommo(`/api/v4/leads/${lead_id}/notes`, {
      method: "POST",
      body: JSON.stringify([{ note_type: "common", params: { text: `Criado pelo ALIANÇA 360 · checklist ${it.id}${it.pedido ? ` · venda ${it.pedido}` : ""}` } }]),
    });
  }
  return { ok: true, contato_id, lead_id };
}

async function salvarVinculo(chamado_id: string, v: Record<string, unknown>) {
  await fetch(`${SB()}/rest/v1/kommo_vinculo?on_conflict=chamado_id`, {
    method: "POST",
    headers: { apikey: SR(), Authorization: `Bearer ${SR()}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ chamado_id, ...v, atualizado_em: new Date().toISOString() }]),
  });
}

/** Garante que o cliente tem lead no funil do checklist e devolve os ids. */
async function garantirLead(it: any) {
  const s = await situacao(String(it.telefone || ""));
  if (!s.ok) return { ok: false, motivo: (s as any).motivo };
  // todos os cadastros duplicados do cliente: a resposta dele pode voltar por qualquer um
  const contatos: number[] = (s as any).contatos || [];
  const jaCk = s.achou ? s.leads.find((l: any) => l.funil === FUNIL_CK) : null;
  if (jaCk) return { ok: true, lead_id: jaCk.id, contato_id: s.contato_id, origem: "encontrado", contatos };
  const noPre = s.achou ? s.leads.find((l: any) => l.funil === FUNIL_PRE) : null;
  if (noPre && noPre.etapa !== ETAPA_PRE_COMPROU) {
    const { st } = await kommo(`/api/v4/leads/${noPre.id}`, {
      method: "PATCH", body: JSON.stringify({ pipeline_id: FUNIL_CK, status_id: ETAPA_CK_ENTRADA }),
    });
    if (st === 200) return { ok: true, lead_id: noPre.id, contato_id: s.contato_id, origem: "movido", etapa_anterior: noPre.nome_etapa, contatos };
  }
  const c = await criarCliente(it, s.achou ? s.contato_id : null);
  if (!c.ok) return { ok: false, motivo: `não consegui criar o cliente na Kommo (${(c as any).st})` };
  return { ok: true, lead_id: c.lead_id, contato_id: c.contato_id, origem: "criado", contatos: [...contatos, c.contato_id].filter(Boolean) as number[] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!await autorizado(req)) return json({ erro: "não autorizado" }, 401);
    const b = await req.json().catch(() => ({}));
    const acao = String(b.acao || "");

    if (acao === "conta") {
      const { st, d } = await kommo("/api/v4/account");
      return json({ st, conta: d?.name, subdominio: d?.subdomain });
    }

    if (acao === "localizar") return json(await situacao(String(b.telefone || "")));

    // enviar: grava os campos no lead e dispara o bot que manda a mensagem aprovada.
    // Só devolve ok quando a Kommo aceitou o disparo — é isso que autoriza o 360
    // a reservar o horário e mover o cliente para "aguardando".
    if (acao === "enviar") {
      const it = { id: b.chamado, cliente: b.cliente, telefone: b.telefone, pedido: b.pedido };
      if (!it.id || !b.data) return json({ erro: "faltou chamado ou data" }, 400);

      const g = await garantirLead(it);
      if (!g.ok) {
        await salvarVinculo(String(it.id), { envio_status: "falhou", envio_em: new Date().toISOString(), envio_erro: g.motivo });
        return json({ ok: false, erro: g.motivo }, 200);
      }

      const campos = [
        { field_id: CF_ATENDENTE, values: [{ value: String(b.atendente || "") }] },
        { field_id: CF_PEDIDO, values: [{ value: String(b.pedido || "") }] },
        { field_id: CF_DATA, values: [{ value: String(b.data || "") }] },
        { field_id: CF_CHECKLIST, values: [{ value: String(it.id) }] },
      ];
      const up = await kommo(`/api/v4/leads/${g.lead_id}`, { method: "PATCH", body: JSON.stringify({ custom_fields_values: campos }) });
      if (up.st !== 200) {
        await salvarVinculo(String(it.id), { contato_id: g.contato_id, lead_id: g.lead_id, origem: g.origem, envio_status: "falhou", envio_em: new Date().toISOString(), envio_erro: `não consegui gravar os dados no lead (${up.st})` });
        return json({ ok: false, erro: `não consegui gravar os dados no lead (${up.st})` }, 200);
      }

      const bot = Number(await segredo("kommo_bot_primeiro"));
      const run = await kommo(`/api/v4/bots/${bot}/run`, {
        method: "POST", body: JSON.stringify({ entity_id: g.lead_id, entity_type: "leads" }),
      });
      const ok = run.st >= 200 && run.st < 300;
      // o card da Kommo acompanha o 360: mensagem enviada = aguardando confirmação
      if (ok) await kommo(`/api/v4/leads/${g.lead_id}`, { method: "PATCH", body: JSON.stringify({ pipeline_id: FUNIL_CK, status_id: ETAPA_CK_AGUARDANDO }) });
      await salvarVinculo(String(it.id), {
        contato_id: g.contato_id, lead_id: g.lead_id, origem: g.origem, contatos: (g as any).contatos || null,
        envio_status: ok ? "enviado" : "falhou", envio_em: new Date().toISOString(),
        envio_erro: ok ? null : `a Kommo recusou o disparo (${run.st})`,
        envio_data_oferecida: String(b.data || ""),
      });
      return json(ok
        ? { ok: true, lead_id: g.lead_id, contato_id: g.contato_id, origem: g.origem }
        : { ok: false, erro: `a Kommo recusou o disparo (${run.st})` });
    }

    if (acao === "organizar" || acao === "sincronizar") {
      const aplicar = b.aplicar === true;
      const moverComprou = b.moverComprou === true;
      const itens: any[] = Array.isArray(b.clientes) ? b.clientes : [];
      const saida: any[] = [];
      for (const it of itens) {
        const s = await situacao(String(it.telefone || ""));
        if (!s.ok) { saida.push({ ...it, decisao: "erro", motivo: (s as any).motivo }); continue; }
        const jaCk = s.achou ? s.leads.find((l: any) => l.funil === FUNIL_CK) : null;
        if (jaCk) {
          if (aplicar) await salvarVinculo(it.id, { contato_id: s.contato_id, lead_id: jaCk.id, origem: "encontrado" });
          saida.push({ ...it, decisao: "nada", motivo: "já está no funil do checklist", lead: jaCk.id, etapa: jaCk.nome_etapa });
          continue;
        }
        const noPre = s.achou ? s.leads.find((l: any) => l.funil === FUNIL_PRE) : null;
        if (!noPre) {
          if (!aplicar) { saida.push({ ...it, decisao: "criar", motivo: s.achou ? "contato existe, sem lead" : "sem contato na Kommo" }); continue; }
          const c = await criarCliente(it, s.achou ? s.contato_id : null);
          if (!c.ok) { saida.push({ ...it, decisao: "falhou", motivo: `criação falhou (${c.st})` }); continue; }
          await salvarVinculo(it.id, { contato_id: c.contato_id, lead_id: c.lead_id, origem: "criado" });
          saida.push({ ...it, decisao: "criado", contato: c.contato_id, lead: c.lead_id });
          continue;
        }
        if (noPre.etapa === ETAPA_PRE_COMPROU && !moverComprou) {
          saida.push({ ...it, decisao: "deixar", motivo: 'está em "comprou" — preservado para a contagem do marketing', lead: noPre.id });
          continue;
        }
        if (!aplicar) { saida.push({ ...it, decisao: "mover", de: noPre.nome_etapa, lead: noPre.id }); continue; }
        const { st } = await kommo(`/api/v4/leads/${noPre.id}`, {
          method: "PATCH", body: JSON.stringify({ pipeline_id: FUNIL_CK, status_id: ETAPA_CK_ENTRADA }),
        });
        if (st === 200) await salvarVinculo(it.id, { contato_id: s.contato_id, lead_id: noPre.id, origem: "movido", etapa_anterior: noPre.nome_etapa });
        saida.push({ ...it, decisao: st === 200 ? "movido" : "falhou", de: noPre.nome_etapa, lead: noPre.id, st });
      }
      const resumo: Record<string, number> = {};
      for (const s of saida) resumo[s.decisao] = (resumo[s.decisao] || 0) + 1;
      return json({ aplicar, resumo, itens: saida });
    }

    return json({ erro: "ação desconhecida" }, 400);
  } catch (e) {
    return json({ erro: String((e as Error).message || e) }, 500);
  }
});
