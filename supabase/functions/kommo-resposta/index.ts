// Recebe da Kommo cada mensagem que chega no WhatsApp do checklist e,
// quando é resposta do cliente a um horário oferecido pelo 360, resolve sozinho:
// agenda, devolve a confirmação para o cliente, move o card e deixa o resto para uma pessoa.
//
// A Kommo chama esta URL no evento "add_message" (Integrações → webhooks).
// Ela não manda cabeçalho de autenticação e recusa URL com ?query,
// então o segredo vai no fim do caminho: /kommo-resposta/<segredo>.
//
// Regra: só mexe em cliente que ESTE sistema colocou em "aguardando resposta".
// Mensagem de qualquer outra conversa da equipe é ignorada sem ruído.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};
const ok = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

const SB = () => Deno.env.get("SUPABASE_URL")!;
const SR = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cab = () => ({ apikey: SR(), Authorization: `Bearer ${SR()}`, "Content-Type": "application/json" });

const CF_DATA = 2070600; // "360 data oferecida" — é o campo que a mensagem de confirmação imprime

// o card da Kommo acompanha o 360: cada resposta do cliente leva o lead para a coluna certa
const FUNIL_CK = 13550523;
const ETAPA: Record<string, number> = {
  agendado: 106848191,   // Agendamento confirmado
  outra_data: 114261099, // Cliente solicitou nova data
  em_obras: 106848195,   // Em obras
};

async function segredo(chave: string): Promise<string> {
  const r = await fetch(`${SB()}/rest/v1/segredos?chave=eq.${chave}&select=valor`, { headers: cab() });
  const d = await r.json();
  if (!Array.isArray(d) || !d.length) throw new Error(`segredo ${chave} não encontrado`);
  return d[0].valor as string;
}

async function kommo(caminho: string, init: RequestInit = {}) {
  const base = await segredo("kommo_base"), tok = await segredo("kommo_token");
  const r = await fetch(base + caminho, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
  });
  const t = await r.text();
  let d: any = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  return { st: r.status, d };
}

const soDig = (s: string) => String(s || "").replace(/\D/g, "");

/** Tira acento, pontuação e caixa — "Confirmo o horário!" e "confirmo o horario" viram a mesma coisa. */
const limpo = (s: string) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * O que o cliente quis dizer.
 * Os três primeiros são os botões do modelo aprovado — texto exato, sem margem a dúvida.
 * Qualquer outra coisa fica para uma pessoa ler: automatizar palpite aqui é pior que não automatizar.
 */
function decidir(texto: string): "confirmou" | "outra_data" | "obra" | "outro" {
  const t = limpo(texto);
  if (!t) return "outro";
  if (t === "confirmo o horario" || t === "confirmo horario" || t === "confirmo") return "confirmou";
  if (t === "outra data") return "outra_data";
  if (t === "ainda em obra" || t === "em obra") return "obra";
  return "outro";
}

/** A Kommo manda formulário (message[add][0][campo]=valor); alguns ambientes mandam JSON. */
async function corpo(req: Request): Promise<Record<string, string>> {
  const bruto = await req.text();
  const m: Record<string, string> = {};
  const tipo = req.headers.get("content-type") || "";
  if (tipo.includes("json")) {
    const achatar = (o: any, pre = "") => {
      for (const [k, v] of Object.entries(o || {})) {
        const ch = pre ? `${pre}[${k}]` : k;
        if (v && typeof v === "object") achatar(v, ch); else m[ch] = String(v ?? "");
      }
    };
    try { achatar(JSON.parse(bruto)); } catch { /* cai no formulário */ }
    if (Object.keys(m).length) return m;
  }
  for (const [k, v] of new URLSearchParams(bruto)) m[k] = v;
  return m;
}

/** Pega message[add][N][campo] sem depender do índice, e sem confundir [id] com [author][id]. */
const campo = (m: Record<string, string>, nome: string): string => {
  const chaves = Object.keys(m).filter((x) => x.startsWith("message[add]") && x.endsWith(`[${nome}]`));
  const direto = chaves.find((x) => /^message\[add\]\[\d+\]\[[^\]]+\]$/.test(x));
  return direto ? m[direto] : chaves.length ? m[chaves[0]] : "";
};

/** Telefones do contato na Kommo — última cartada para casar a resposta com o cliente do 360. */
async function fonesDoContato(contato_id: number): Promise<string[]> {
  try {
    const { st, d } = await kommo(`/api/v4/contacts/${contato_id}`);
    if (st !== 200) return [];
    return (d?.custom_fields_values || []).filter((f: any) => f.field_code === "PHONE")
      .flatMap((f: any) => (f.values || []).map((v: any) => soDig(v.value))).filter(Boolean);
  } catch { return []; }
}

async function rpc(nome: string, corpo: unknown = {}): Promise<string | null> {
  const r = await fetch(`${SB()}/rest/v1/rpc/${nome}`, { method: "POST", headers: cab(), body: JSON.stringify(corpo) });
  if (r.status !== 200) return null;
  const t = (await r.text()).replace(/"/g, "").trim();
  return t && t !== "null" ? t : null;
}

/**
 * Manda a confirmação de volta para o cliente.
 * Vai como texto livre, e não como modelo, porque o cliente acabou de escrever:
 * dentro das 24h a Meta entrega texto livre, sem custo de template.
 * Antes de disparar, garante que a data impressa na mensagem é a que foi confirmada.
 */
async function confirmarParaCliente(chamado: string, lead_id: number | null): Promise<string> {
  try {
    const r = await fetch(`${SB()}/rest/v1/kommo_vinculo?chamado_id=eq.${encodeURIComponent(chamado)}&select=lead_id,envio_data_oferecida`, { headers: cab() });
    const v = (await r.json())?.[0];
    const alvo = lead_id || v?.lead_id;
    if (!alvo) return "sem lead para confirmar";
    if (v?.envio_data_oferecida) {
      await kommo(`/api/v4/leads/${alvo}`, {
        method: "PATCH",
        body: JSON.stringify({ custom_fields_values: [{ field_id: CF_DATA, values: [{ value: String(v.envio_data_oferecida) }] }] }),
      });
    }
    const bot = Number(await segredo("kommo_bot_confirmacao"));
    const run = await kommo(`/api/v4/bots/${bot}/run`, {
      method: "POST", body: JSON.stringify({ entity_id: alvo, entity_type: "leads" }),
    });
    return run.st >= 200 && run.st < 300 ? "confirmacao enviada" : `confirmacao recusada (${run.st})`;
  } catch (e) {
    return `confirmacao falhou (${String((e as Error).message || e)})`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const doCaminho = url.pathname.split("/").filter(Boolean).pop() || "";
    const esperado = await segredo("kommo_webhook_segredo");
    if (doCaminho !== esperado && url.searchParams.get("s") !== esperado) {
      return new Response("não autorizado", { status: 401, headers: cors });
    }
    const m = await corpo(req);

    // só mensagem de entrada; o que a própria loja envia não interessa
    const direcao = campo(m, "type");
    if (direcao && direcao !== "incoming") return ok({ ignorado: "mensagem de saída" });

    const msg_id = campo(m, "id");
    const texto = campo(m, "text");
    const lead_id = Number(campo(m, "entity_id") || campo(m, "element_id") || 0) || null;
    const contato_id = Number(campo(m, "contact_id") || 0) || null;
    if (!msg_id) return ok({ ignorado: "sem id de mensagem", chaves: Object.keys(m).slice(0, 40) });

    // a Kommo reenvia o webhook quando não recebe 200: a mesma mensagem não pode agendar duas vezes
    const ja = await fetch(`${SB()}/rest/v1/kommo_resposta?mensagem_id=eq.${encodeURIComponent(msg_id)}&select=mensagem_id`, { headers: cab() });
    if (((await ja.json()) || []).length) return ok({ ignorado: "mensagem já processada" });

    // --- de quem é essa conversa, no 360 ---
    // 1) pelo lead ou por QUALQUER um dos cadastros duplicados que o cliente tinha no envio;
    // 2) pelo telefone, se o cliente responder por um cadastro criado depois.
    let chamado: string | null = null, como = "cadastro", erro: string | null = null, decisao = "ignorado";
    chamado = await rpc("kommo_chamado_por_contato", { p_lead: lead_id, p_contato: contato_id });
    if (!chamado && contato_id) {
      for (const f of await fonesDoContato(contato_id)) {
        chamado = await rpc("kommo_chamado_por_telefone", { p_fone: f });
        if (chamado) { como = "telefone"; break; }
      }
      // passa a conversa para o cadastro por onde o cliente de fato responde,
      // assim a próxima mensagem dele casa direto
      if (chamado) {
        await fetch(`${SB()}/rest/v1/kommo_vinculo?chamado_id=eq.${encodeURIComponent(chamado)}`, {
          method: "PATCH", headers: cab(),
          body: JSON.stringify({ lead_id, contato_id, atualizado_em: new Date().toISOString() }),
        });
      }
    }

    if (chamado) {
      const tipo = decidir(texto);
      const r = await fetch(`${SB()}/rest/v1/rpc/checklist_resposta_kommo`, {
        method: "POST", headers: cab(),
        body: JSON.stringify({ p_chamado: chamado, p_tipo: tipo, p_texto: texto }),
      });
      const saida = (await r.text()).replace(/"/g, "");
      if (r.status !== 200) { erro = `${r.status} ${saida}`; decisao = "falhou"; }
      else {
        decisao = `${tipo} → ${saida} (por ${como})`;
        if (ETAPA[saida] && lead_id) {
          await kommo(`/api/v4/leads/${lead_id}`, { method: "PATCH", body: JSON.stringify({ pipeline_id: FUNIL_CK, status_id: ETAPA[saida] }) });
        }
        // agendou de verdade → o cliente recebe a confirmação com data, endereço e orientações
        if (saida === "agendado") decisao += " · " + await confirmarParaCliente(chamado, lead_id);
      }
    }

    await fetch(`${SB()}/rest/v1/kommo_resposta`, {
      method: "POST", headers: { ...cab(), Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify([{ mensagem_id: msg_id, lead_id, contato_id, chamado_id: chamado, texto, decisao, erro, bruto: m }]),
    });

    return ok({ ok: true, chamado, decisao });
  } catch (e) {
    // a Kommo reenvia em caso de erro; devolvemos 200 com o motivo para não entrar em laço
    return ok({ ok: false, erro: String((e as Error).message || e) });
  }
});
