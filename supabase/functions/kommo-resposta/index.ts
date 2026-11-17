// Recebe da Kommo cada mensagem que chega no WhatsApp do checklist e,
// quando é resposta do cliente a um horário oferecido pelo 360, resolve sozinho.
//
// A Kommo chama esta URL no evento "add_message" (Integrações → webhooks).
// Como ela não manda cabeçalho de autenticação, o segredo vai na URL (?s=…)
// e ainda conferimos o id da conta.
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
const cab = { apikey: SR(), Authorization: `Bearer ${SR()}`, "Content-Type": "application/json" };

async function segredo(chave: string): Promise<string> {
  const r = await fetch(`${SB()}/rest/v1/segredos?chave=eq.${chave}&select=valor`, { headers: cab });
  const d = await r.json();
  if (!Array.isArray(d) || !d.length) throw new Error(`segredo ${chave} não encontrado`);
  return d[0].valor as string;
}

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

/** Pega message[add][N][campo] sem depender do índice. */
const campo = (m: Record<string, string>, nome: string): string => {
  const k = Object.keys(m).find((x) => x.startsWith("message[add]") && x.endsWith(`[${nome}]`));
  return k ? m[k] : "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("s") !== await segredo("kommo_webhook_segredo")) {
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
    if (!msg_id) return ok({ ignorado: "sem id de mensagem" });

    // a Kommo reenvia o webhook quando não recebe 200 na hora: a mesma mensagem não pode agendar duas vezes
    const ja = await fetch(`${SB()}/rest/v1/kommo_resposta?mensagem_id=eq.${encodeURIComponent(msg_id)}&select=mensagem_id`, { headers: cab });
    if ((await ja.json() || []).length) return ok({ ignorado: "mensagem já processada" });

    // de quem é essa conversa, no 360
    let chamado: string | null = null, decisao = "ignorado", erro: string | null = null;
    const por = lead_id ? `lead_id=eq.${lead_id}` : contato_id ? `contato_id=eq.${contato_id}` : null;
    if (por) {
      const r = await fetch(`${SB()}/rest/v1/kommo_vinculo?${por}&envio_status=eq.enviado&select=chamado_id&order=envio_em.desc&limit=1`, { headers: cab });
      const v = await r.json();
      if (Array.isArray(v) && v.length) chamado = v[0].chamado_id;
    }

    if (chamado) {
      const tipo = decidir(texto);
      const r = await fetch(`${SB()}/rest/v1/rpc/checklist_resposta_kommo`, {
        method: "POST", headers: cab,
        body: JSON.stringify({ p_chamado: chamado, p_tipo: tipo, p_texto: texto }),
      });
      const saida = await r.text();
      if (r.status !== 200) { erro = `${r.status} ${saida}`; decisao = "falhou"; }
      else decisao = `${tipo} → ${saida.replace(/"/g, "")}`;
    }

    await fetch(`${SB()}/rest/v1/kommo_resposta`, {
      method: "POST", headers: { ...cab, Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify([{ mensagem_id: msg_id, lead_id, contato_id, chamado_id: chamado, texto, decisao, erro }]),
    });

    return ok({ ok: true, chamado, decisao });
  } catch (e) {
    // a Kommo reenvia em caso de erro; devolvemos 200 com o motivo para não entrar em laço
    return ok({ ok: false, erro: String((e as Error).message || e) });
  }
});
