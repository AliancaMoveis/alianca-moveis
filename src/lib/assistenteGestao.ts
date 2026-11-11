// ALIANÇA 360 — Assistente: consultas de montagem/pagamento, fretes e pós-venda.
// Mesma regra das telas: montagem e pagamentos só para Gestão, Financeiro ou quem tem o acesso "montagem" (R.mySetores / R.temAcesso);
// além disso o banco (RLS) continua filtrando as tabelas com o login da pessoa.
import { sb } from "./supabase";
import { hojeISO } from "./regras";

const r2 = (n: number) => Math.round(n * 100) / 100;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const somaDias = (s: string, n: number) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isoU = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
// 1ª quinzena = 10 a 24 (paga dia 25 do mesmo mês) · 2ª = 25 a 09 do mês seguinte (paga dia 10) — igual à tela de Montagem
export function quinzenaDe(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (d >= 10 && d <= 24) return { de: isoU(y, m - 1, 10), ate: isoU(y, m - 1, 24), ref: isoU(y, m - 1, 1).slice(0, 7) + "-1" };
  const base = d >= 25 ? new Date(Date.UTC(y, m - 1, 1)) : new Date(Date.UTC(y, m - 2, 1));
  const by = base.getUTCFullYear(), bm = base.getUTCMonth();
  return { de: isoU(by, bm, 25), ate: isoU(by, bm + 1, 9), ref: isoU(by, bm, 1).slice(0, 7) + "-2" };
}
const quinzenaAntes = (q: { de: string }) => quinzenaDe(somaDias(q.de, -1));

export const podeVerMontagem = (R: any) => R.mySetores().includes("gestao") || R.mySetores().includes("financeiro") || !!R.temAcesso?.("montagem");
export const podeVerFretes = (R: any) => R.ehGestao() || R.mySetores().includes("financeiro") || !!R.temAcesso?.("fretes");
const NEG = { erro: "Esse dado não está liberado para o seu acesso." };

const aprovado = (e: any) => /pagamento efetuado/i.test(e.status) || (!!e.aprovado_em && /aguardando aprova/i.test(e.status));
const aguardando = (e: any) => /aguardando aprova/i.test(e.status) && !e.aprovado_em;

async function todasOS(de: string, ate: string) {
  const out: any[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from("montagem_efet").select("chave,os,montador,status,data_montagem,data_finalizacao,total,tipo,descricao,aprovado_em")
      .is("excluido_em", null).gte("data_montagem", somaDias(de, -45)).lte("data_montagem", ate).order("chave").range(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return out.map(a => ({ ...a, total: Number(a.total) || 0 }));
}

export const FERRAMENTAS_GESTAO: any[] = [
  { name: "montagem_pagamento", description: "Montagens efetivadas e valor a pagar por montador numa quinzena (como a tela 'Montagens efetivadas e pagamentos'). Quinzena 10–24 paga dia 25; quinzena 25–09 paga dia 10. Sem parâmetros traz a quinzena a pagar agora. Só Gestão/Financeiro/Montagem.",
    input_schema: { type: "object", properties: { ref: { type: "string", description: "Referência da quinzena, ex.: 2026-10-1 (1ª, 10–24) ou 2026-10-2 (2ª, 25–09)" }, de: { type: "string", description: "YYYY-MM-DD (alternativa à ref)" }, ate: { type: "string", description: "YYYY-MM-DD" }, montador: { type: "string", description: "Filtrar por nome (parte do nome)" } }, required: [] } },
  { name: "montagem_fechamentos", description: "Pagamentos de montagem já fechados (histórico): referência, período, total e valor por montador. Só Gestão/Financeiro/Montagem.",
    input_schema: { type: "object", properties: { ref: { type: "string", description: "Referência, ex.: 2026-10-1 (opcional)" } }, required: [] } },
  { name: "fretes_pagamentos", description: "Pagamentos de frete enviados ao financeiro por mês: total, nº de freteiros e valor por freteiro. Só Gestão/Financeiro/Fretes.",
    input_schema: { type: "object", properties: { mes: { type: "string", description: "YYYY-MM-01 (opcional; padrão: o mais recente)" } }, required: [] } },
  { name: "posvenda_resumo", description: "Chamados de pós-venda que a pessoa pode ver: situação, categoria, responsabilidade, prazo, parado em obra. Pode filtrar por situação aberta/concluída.",
    input_schema: { type: "object", properties: { status: { type: "string", enum: ["abertos", "concluidos", "todos"] }, texto: { type: "string", description: "Nome do cliente (parte)" } }, required: [] } },
];
export const NOMES_GESTAO = FERRAMENTAS_GESTAO.map(f => f.name);

export async function executarGestao(nome: string, a: any, c: { R: any; st: any }): Promise<any> {
  const { R, st } = c; a = a || {};
  if (nome === "montagem_pagamento") {
    if (!podeVerMontagem(R)) return NEG;
    let q: { de: string; ate: string; ref: string };
    if (/^\d{4}-\d{2}-[12]$/.test(a.ref || "")) { const [y, m, n] = a.ref.split("-").map(Number); q = quinzenaDe(isoU(y, m - 1, n === 1 ? 10 : 25)); }
    else if (ISO.test(a.de) && ISO.test(a.ate)) q = { de: a.de, ate: a.ate, ref: "" };
    else q = quinzenaAntes(quinzenaDe(hojeISO()));
    const todas = await todasOS(q.de, q.ate);
    const dataDe = (e: any) => e.data_finalizacao || e.data_montagem || "";
    const noPer = todas.filter(e => { const d = dataDe(e); return d >= q.de && d <= q.ate; });
    const filtro = String(a.montador || "").toLowerCase();
    const por: Record<string, any> = {};
    noPer.filter(e => !filtro || String(e.montador).toLowerCase().includes(filtro)).forEach(e => {
      const g = (por[e.montador] = por[e.montador] || { montador: e.montador, os: 0, aprovado: 0, aguardando: 0, outros: 0 });
      g.os++; if (aprovado(e)) g.aprovado = r2(g.aprovado + e.total); else if (aguardando(e)) g.aguardando = r2(g.aguardando + e.total); else g.outros = r2(g.outros + e.total);
    });
    let descontos: any[] = [];
    if (q.ref) { const { data } = await sb.from("montagem_descontos").select("montador_id,descricao,parcela,valor").eq("referencia", q.ref); descontos = data || []; }
    const lista = Object.values(por).map((g: any) => ({ ...g, a_pagar: r2(g.aprovado + g.aguardando) })).sort((x: any, y: any) => y.a_pagar - x.a_pagar);
    return { periodo: q, quinzena_ref: q.ref || null, montadores: lista.length, total_aprovado: r2(lista.reduce((s: number, g: any) => s + g.aprovado, 0)), total_aguardando: r2(lista.reduce((s: number, g: any) => s + g.aguardando, 0)),
      total_geral: r2(lista.reduce((s: number, g: any) => s + g.a_pagar, 0)), por_montador: lista.slice(0, 40),
      descontos_lancados: descontos.length ? { quantidade: descontos.length, total: r2(descontos.reduce((s, d) => s + Number(d.valor || 0), 0)) } : null,
      aviso: "Valores pelas O.S. do período. Montador que recebe só no dia 10 soma também a quinzena retrasada, e O.S. já pagas em outro fechamento saem do total: o número oficial é o da tela 'Montagens efetivadas e pagamentos'." };
  }
  if (nome === "montagem_fechamentos") {
    if (!podeVerMontagem(R)) return NEG;
    let qy = sb.from("montagem_fechamentos").select("id,referencia,de,ate,total,criado_em").eq("ativo", true).order("referencia", { ascending: false }).limit(6);
    if (/^\d{4}-\d{2}-[12]$/.test(a.ref || "")) qy = qy.eq("referencia", a.ref);
    const { data: fs, error } = await qy; if (error) return { erro: error.message };
    const ids = (fs || []).map((f: any) => f.id); let itens: any[] = [];
    if (ids.length) { const r = await sb.from("montagem_fech_itens").select("fechamento_id,nome_exact,total").in("fechamento_id", ids); itens = r.data || []; }
    return { fechamentos: (fs || []).map((f: any) => ({ referencia: f.referencia, de: f.de, ate: f.ate, total: Number(f.total) || r2(itens.filter(i => i.fechamento_id === f.id).reduce((s, i) => s + Number(i.total || 0), 0)),
      por_montador: itens.filter(i => i.fechamento_id === f.id).map(i => ({ montador: i.nome_exact, total: Number(i.total) || 0 })).sort((x, y) => y.total - x.total).slice(0, 30) })) };
  }
  if (nome === "fretes_pagamentos") {
    if (!podeVerFretes(R)) return NEG;
    let qy = sb.from("frete_envios_fin").select("mes,data_pagamento,total,n_freteiros,linhas").eq("ativo", true).order("mes", { ascending: false }).limit(1);
    if (ISO.test(a.mes || "")) qy = sb.from("frete_envios_fin").select("mes,data_pagamento,total,n_freteiros,linhas").eq("ativo", true).eq("mes", a.mes).limit(1);
    const { data, error } = await qy; if (error) return { erro: error.message };
    const f: any = (data || [])[0]; if (!f) return { erro: "Nenhum pagamento de frete enviado para esse mês." };
    return { mes: f.mes, data_pagamento: f.data_pagamento, total: Number(f.total) || null, freteiros: f.n_freteiros,
      por_freteiro: ((f.linhas || []) as any[]).map(l => ({ freteiro: l.apelido, total: l.total, descontos: l.tDesc, a_pagar: l.pagar })).slice(0, 40) };
  }
  if (nome === "posvenda_resumo") {
    const t = String(a.texto || "").toLowerCase();
    const l = (st.chamados as any[]).filter(x => x.posvenda && R.podeVer(x))
      .filter(x => a.status === "abertos" ? x.status !== "concluida" : a.status === "concluidos" ? x.status === "concluida" : true)
      .filter(x => !t || String(x.cliente).toLowerCase().includes(t));
    return { total: l.length, chamados: l.slice(0, 30).map(x => ({ id: x.id, cliente: x.cliente, status: x.status, categoria: x.posvenda.categoria, responsabilidade: x.posvenda.responsabilidade,
      situacao: x.posvenda.situacao, prazo: x.posvenda.prazo || null, parado_obra: x.posvenda.paradoObra, aberto_em: String(x.criadoEm).slice(0, 10) })) };
  }
  return { erro: "Ferramenta desconhecida" };
}
