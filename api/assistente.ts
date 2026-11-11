// ALIANÇA 360 — Assistente: ponte segura entre o app e a API do Claude.
// O navegador nunca vê a chave: ela fica só nas variáveis de ambiente do Vercel (ANTHROPIC_API_KEY).
// Aqui só confere QUEM está chamando (login do Supabase) e se o e-mail está liberado; o resto das regras
// (quem vê o quê, o que pode alterar) continua sendo do banco, porque as ferramentas rodam no app com o login da pessoa.

export const config = { maxDuration: 60 };

const SUPA_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://byunwadtkvgwqnlxhpcn.supabase.co";
const SUPA_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_ONP-uDLUTJruInBWEfaabA_2kn_OQrc";
// por enquanto só o Bruno. Para liberar mais gente depois: variável ASSISTENTE_EMAILS (e-mails separados por vírgula)
const LIBERADOS = (process.env.ASSISTENTE_EMAILS || "bruno.fiaron@aliancamoveis.com.br").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const MODELO = process.env.ASSISTENTE_MODELO || "claude-sonnet-5-5";

// liberação por permissão: quem tem um destes setores/acessos no 360 também usa o assistente (padrão: "anuncios" = Lucas Santana e "proprietario" = donos).
// Para liberar outra permissão: variável ASSISTENTE_SETORES (ids separados por vírgula). Vazia = só a lista de e-mails.
const SETORES = (process.env.ASSISTENTE_SETORES ?? "anuncios,proprietario,gerente_loja").split(",").map(s => s.trim()).filter(Boolean);
async function temSetor(token: string, id: string): Promise<boolean> {
  if (!SETORES.length) return false;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/usuario_setores?usuario_id=eq.${encodeURIComponent(id)}&setor_id=in.(${SETORES.map(encodeURIComponent).join(",")})&select=setor_id&limit=1`, { headers: { apikey: SUPA_KEY, Authorization: "Bearer " + token } });
    if (!r.ok) return false;
    const j: any = await r.json(); return Array.isArray(j) && j.length > 0;
  } catch { return false; }
}

async function quemE(token: string): Promise<{ id: string; email: string } | null> {
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: SUPA_KEY, Authorization: "Bearer " + token } });
    if (!r.ok) return null;
    const u: any = await r.json();
    return u && u.id ? { id: u.id, email: String(u.email || "").toLowerCase() } : null;
  } catch { return null; }
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ erro: "Entre no sistema para usar o assistente." });
  const u = await quemE(token);
  if (!u) return res.status(401).json({ erro: "Sessão inválida. Entre de novo no sistema." });
  const liberado = LIBERADOS.includes(u.email) || (await temSetor(token, u.id));
  const configurado = !!process.env.ANTHROPIC_API_KEY;

  // o app pergunta aqui se deve mostrar o botão do assistente
  if (req.method === "GET") return res.status(200).json({ liberado, configurado });
  if (req.method !== "POST") return res.status(405).json({ erro: "Método não permitido" });
  if (!liberado) return res.status(403).json({ erro: "O assistente ainda não está liberado para o seu usuário." });
  if (!configurado) return res.status(503).json({ erro: "A chave da API do Claude ainda não foi configurada no Vercel (ANTHROPIC_API_KEY)." });

  let b: any = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  const msgs = b && b.messages, tools = (b && b.tools) || [], system = String((b && b.system) || "");
  if (!Array.isArray(msgs) || !msgs.length || msgs.length > 80) return res.status(400).json({ erro: "Conversa inválida" });
  if (!Array.isArray(tools) || tools.length > 40 || system.length > 12000) return res.status(400).json({ erro: "Pedido inválido" });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": String(process.env.ANTHROPIC_API_KEY), "anthropic-version": "2023-06-01" },
      // cache do prompt: regras + ferramentas (a parte grande e igual a cada pergunta) passam a custar ~10% nas chamadas seguintes
      body: JSON.stringify({ model: MODELO, max_tokens: 900,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools: tools.map((t: any, i: number) => (i === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t)),
        messages: msgs }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j && j.error && j.error.message) || "Erro ao falar com o Claude";
      return res.status(r.status === 401 ? 502 : r.status).json({ erro: msg });
    }
    return res.status(200).json({ content: j.content, stop_reason: j.stop_reason, usage: j.usage });
  } catch (e: any) {
    return res.status(502).json({ erro: "Não foi possível falar com o Claude agora. Tente de novo." });
  }
}
