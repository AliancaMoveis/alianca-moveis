// ALIANÇA 360 — Assistente: consultas de montagem/pagamento, fretes e pós-venda.
// Mesma regra das telas: montagem e pagamentos só para Gestão, Financeiro ou quem tem o acesso "montagem" (R.mySetores / R.temAcesso);
// além disso o banco (RLS) continua filtrando as tabelas com o login da pessoa.
import { sb } from "./supabase";
import { A } from "./acoes";
import { calcGeral, concluidoEm } from "./geral";
import { hojeISO, isoLocal, vendaContaVolume, pagamentosVenda } from "./regras";

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
export const FERRAMENTA_PRODUCAO = { name: "producao_cadastros", description: "ATENDIMENTOS/AGENDAMENTOS FEITOS por uma pessoa (quem cadastrou o cliente), por dia: total, quantos para consultor externo e quantos direto na loja, por tipo, quantos já vieram, vendas efetivadas e meta do dia (marketing/call center). Use para 'quantos atendimentos/agendamentos eu fiz hoje'. Sem 'pessoa' é da própria pessoa; Gestão e supervisão marketing podem pedir de outra pessoa ou 'todas' (ranking).",
  input_schema: { type: "object", properties: { de: { type: "string", description: "YYYY-MM-DD (padrão: hoje)" }, ate: { type: "string", description: "YYYY-MM-DD (padrão: igual a de)" }, pessoa: { type: "string", description: "Nome (parte) ou 'todas' — só Gestão/supervisão" } }, required: [] } };
export const FERRAMENTA_AREAS = { name: "atividade_por_area", description: "Números SEPARADOS por área, no período: 'callcenter' (solicitações cadastradas pelo Call Center), 'marketing' (agendamentos do marketing: para consultor externo e direto na loja, e quantos vieram), 'consultor_externo' (visitas: marcadas, realizadas, a realizar, atrasadas, canceladas) e 'checklist' (agendados, realizados, a agendar, aguardando). Sempre cite a área na resposta. Use para: 'quantos atendimentos no call center', 'quantos agendamentos do marketing', 'quantas visitas do externo / realizadas', 'quantos checklists agendados'. 'escopo' meus (padrão) ou todos (só o que a pessoa pode ver).",
  input_schema: { type: "object", properties: { area: { type: "string", description: "Área, em texto livre (aceita erro de digitação e apelidos): call center/cc/central, marketing/agendamentos/agendadoras, externo/consultor/visitas, checklist/ck/projetista, vendas, ou todas. Na dúvida use todas." }, de: { type: "string", description: "YYYY-MM-DD (padrão: hoje)" }, ate: { type: "string", description: "YYYY-MM-DD (padrão: igual a de)" }, escopo: { type: "string", enum: ["meus", "todos"] } }, required: ["area"] } };
export const FERRAMENTA_ANUNCIOS = { name: "anuncios_resumo", description: "Anúncios Meta (Instagram/Facebook) e Google Ads (via Reportei) — use para QUALQUER pergunta de anúncios (investimento, hoje, impressões, cliques, CTR, custo, melhor campanha, melhor dia da semana, maior investimento, Meta x Google, vendas por canal, clientes cadastrados/agendados/vieram). Num período: investimento, impressões, cliques, conversas/conversões, custo por contato, comparação com o período anterior de mesmo tamanho, por plataforma, melhores campanhas e o funil do 360 (cadastros do marketing, vieram à loja, vendas, faturamento, custo por cliente na loja e por venda). Só Gestão, proprietário e quem tem a permissão Anúncios.",
  input_schema: { type: "object", properties: { de: { type: "string", description: "YYYY-MM-DD (padrão: início do mês)" }, ate: { type: "string", description: "YYYY-MM-DD (padrão: hoje)" }, plataforma: { type: "string", enum: ["todas", "meta", "google"] }, campanhas: { type: "number", description: "Quantas campanhas listar (padrão 5, máx 15)" } }, required: [] } };
export const podeVerAnuncios = (R: any) => !!R.veAnuncios?.();
export const NOMES_GESTAO = [...FERRAMENTAS_GESTAO.map(f => f.name), "anuncios_resumo", "producao_cadastros", "atividade_por_area"];

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
  if (nome === "atividade_por_area") {
    const uid = R.currentUserId; const hj = hojeISO(); const de = ISO.test(a.de) ? a.de : hj; let ate = ISO.test(a.ate) ? a.ate : de; if (ate < de) ate = de;
    const dia = (v: any) => (v ? String(v).slice(0, 10) : ""); const no = (v: any) => { const d = dia(v); return !!d && d >= de && d <= ate; };
    const todosEsc = a.escopo === "todos";
    // entende apelidos e erros de digitação ("calcenter", "agendamento", "extrnos", "chek list"…); sem match, traz tudo
    const sem = String(a.area || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const area = /^(todas|tudo|geral|)$/.test(sem) ? "todas" : /^(cc|ca|c|)?(c?all?|cal|cel|cen).*(c?e?n?t?e?r?|central)|callc|callcenter|^cc$|central|atendimento|sac|ligac|telefon/.test(sem) ? "callcenter"
      : /(chec|chek|cheq|^ck|projet|medida)/.test(sem) ? "checklist" : /(exter|extr|consult|visit|campo)/.test(sem) ? "consultor_externo"
      : /(market|mkt|agend|operador|anunc)/.test(sem) ? "marketing" : /venda|vend|faturam/.test(sem) ? "vendas" : "todas";
    const ck = (k: any) => (k.tratativa && k.tratativa.checklist) || {};
    const cham = (st.chamados as any[]).filter(k => R.podeVer(k));
    const meu = (k: any) => k.solicitanteId === uid || k.cadastradoPorId === uid || k.atendenteId === uid || k.consultorId === uid;
    const base = todosEsc ? cham : cham.filter(meu);
    const out: any = { periodo: { de, ate }, escopo: todosEsc ? "todos (o que você pode ver)" : "só os seus" };
    // Gestão: exatamente os mesmos números dos cartões do painel (Call center, Agendamentos, Externos, Checklist, Vendas)
    if (R.ehGestao()) {
      const G = calcGeral(R, st, de, ate); const mapa: Record<string, string> = { callcenter: "cc", marketing: "ag", consultor_externo: "cons", checklist: "ck", vendas: "vendas" };
      const nomes: Record<string, string> = { callcenter: "Call Center", marketing: "Agendamentos (marketing)", consultor_externo: "Externos (visitas dos consultores)", checklist: "Checklist", vendas: "Vendas do marketing" };
      const chaves = area === "todas" ? Object.keys(mapa) : [area, ...(area === "marketing" ? [] : [])].filter(k => mapa[k]);
      chaves.forEach(k => { const c = G.cartoes.find(x => x.k === mapa[k]); if (c) out[k] = { area: nomes[k], principal: c.n + " " + c.l, detalhes: Object.fromEntries(c.linhas.map(([x, y]: any) => [x, y])), pendente_agora: c.pend }; });
      if (area === "callcenter" || area === "todas") {
        const dentro = (v: any) => { if (!v) return false; const d = new Date(v); return d >= new Date(de + "T00:00:00") && d <= new Date(ate + "T23:59:59"); };
        const cc = (st.chamados as any[]).filter(k => R.doCC(k) && dentro(k.criadoEm));
        const porU: Record<string, number> = {}; cc.forEach(k => { const n = R.nomeUser(k.solicitanteId) || "—"; porU[n] = (porU[n] || 0) + 1; });
        if (out.callcenter) { out.callcenter.registrados_por_pessoa = Object.entries(porU).map(([pessoa, qtd]) => ({ pessoa, qtd })).sort((x, y) => y.qtd - x.qtd).slice(0, 15); out.callcenter.registrados_por_voce = cc.filter(k => k.solicitanteId === uid).length; }
      }
      out.nota = "Mesma conta dos cartões do painel da Gestão. 'Registrados' no Call Center = chamados abertos no período.";
      return out;
    }
    if (area === "callcenter" || area === "todas") {
      const dentro = (v: any) => { if (!v) return false; const d = new Date(v); return d >= new Date(de + "T00:00:00") && d <= new Date(ate + "T23:59:59"); };
      const l = (st.chamados as any[]).filter(k => R.doCC(k) && R.podeVer(k) && dentro(k.criadoEm) && (todosEsc || k.solicitanteId === uid));
      const fin = l.filter(k => k.status === "concluida" && concluidoEm(k));
      out.callcenter = { area: "Call Center", registrados: l.length, finalizados: fin.length, em_aberto_agora: (st.chamados as any[]).filter(k => R.doCC(k) && R.podeVer(k) && k.status !== "concluida" && (todosEsc || k.solicitanteId === uid)).length };
    }
    if (area === "marketing" || area === "todas") {
      const l = base.filter(k => R.domMarketing(k) && no(k.criadoEm));
      out.marketing = { agendamentos_cadastrados: l.length, para_consultor_externo: l.filter(k => !R.ehDireto(k)).length, direto_na_loja: l.filter(k => R.ehDireto(k)).length, ja_vieram: l.filter(k => R.compareceu(k)).length,
        vendas_efetivadas: l.filter(k => k.venda && k.venda.status === "efetivada").length };
    }
    if (area === "consultor_externo" || area === "todas") {
      const l = base.filter(k => k.dataVisita && no(k.dataVisita) && !R.ehDireto(k));
      const sit = (k: any) => R.statusClienteDe(k); const feita = (k: any) => !!(k.tratativa && k.tratativa.realizada);
      const hojeMs = hj;
      out.consultor_externo = { visitas_marcadas: l.length, realizadas: l.filter(feita).length, a_realizar: l.filter(k => !feita(k) && dia(k.dataVisita) >= hojeMs && !/cancel/i.test(sit(k))).length,
        atrasadas_sem_baixa: l.filter(k => !feita(k) && dia(k.dataVisita) < hojeMs && !/cancel/i.test(sit(k))).length, canceladas: l.filter(k => /cancel/i.test(sit(k))).length, reagendadas: l.filter(k => /reagend/i.test(sit(k))).length };
    }
    if (area === "checklist" || area === "todas") {
      if (!(R.ehGestao() || R.mySetores().includes("checklist") || R.mySetores().includes("medidas_supervisao"))) out.checklist = NEG;
      else {
        const l = (st.chamados as any[]).filter(k => k.tipo === "checklist" && R.podeVer(k));
        const ag = l.filter(k => ck(k).etapa === "agendado" && no(ck(k).agendadoPara));
        out.checklist = { agendados_no_periodo: ag.length, realizados_no_periodo: l.filter(k => (ck(k).etapa === "realizado" || (!ck(k).etapa && k.status === "concluida")) && no(ck(k).agendadoPara || k.atualizadoEm)).length,
          a_agendar_agora: l.filter(k => k.status !== "concluida" && (ck(k).etapa || "a_contatar") === "a_contatar").length, aguardando_cliente: l.filter(k => k.status !== "concluida" && ck(k).etapa === "aguardando").length,
          nota: "Contagem do que você pode ver; confira em Checklist se precisar do número oficial." };
      }
    }
    return out;
  }
  if (nome === "producao_cadastros") {
    const uid = R.currentUserId; const gestor = R.ehGestao() || R.mySetores().includes("marketing_supervisao");
    const hj = hojeISO(); const de = ISO.test(a.de) ? a.de : hj; let ate = ISO.test(a.ate) ? a.ate : de; if (ate < de) ate = de;
    const dia = (v: any) => isoLocal(new Date(v));
    const quem = (st.usuarios as any[]).filter(u => u.ativo);
    const t = String(a.pessoa || "").trim().toLowerCase();
    if (t && !gestor && t !== "eu") return { erro: "Você só vê a sua própria produção." };
    const alvo = !gestor || !t || t === "eu" ? quem.filter(u => u.id === uid) : t === "todas" ? quem : quem.filter(u => String(u.nome).toLowerCase().includes(t));
    if (!alvo.length) return { erro: "Não achei essa pessoa." };
    const todos = (st.chamados as any[]).filter(k => R.podeVer(k));
    const calc = (u: any) => {
      const l = todos.filter(k => (k.solicitanteId === u.id || k.cadastradoPorId === u.id) && k.criadoEm && dia(k.criadoEm) >= de && dia(k.criadoEm) <= ate);
      const tipos: Record<string, number> = {}; l.forEach(k => { const n = (st.tipos?.[k.tipo]?.nome) || k.tipo || "—"; tipos[n] = (tipos[n] || 0) + 1; });
      const mk = l.filter(k => R.domMarketing(k));
      const vendas = todos.filter(k => (k.solicitanteId === u.id) && R.domMarketing(k) && k.venda && k.venda.status === "efetivada" && String(k.venda.dataVenda || k.venda.quando || "").slice(0, 10) >= de && String(k.venda.dataVenda || k.venda.quando || "").slice(0, 10) <= ate).length;
      return { pessoa: u.nome, total_cadastrados: l.length, marketing_para_consultor_externo: mk.filter(k => !R.ehDireto(k)).length, marketing_direto_na_loja: mk.filter(k => R.ehDireto(k)).length,
        outros_tipos: Object.entries(tipos).map(([nome, n]) => ({ tipo: nome, qtd: n })).sort((x, y) => y.qtd - x.qtd).slice(0, 8), marketing_que_ja_vieram: mk.filter(k => R.compareceu(k)).length, vendas_efetivadas_marketing: vendas };
    };
    let meta: any = null;
    if (alvo.length === 1 && de === ate) { try { const m = (await A.listarMetasMkt(de, de)) as any[]; if (m && m[0]) meta = { meta_agendamentos: m[0].meta, bonus: R.ocultaValoresMkt?.() && !gestor ? null : m[0].valor }; } catch { /* sem meta */ } }
    const r = alvo.map(calc).filter(x => alvo.length === 1 || x.total_cadastrados > 0).sort((x, y) => y.total_cadastrados - x.total_cadastrados);
    return { periodo: { de, ate }, meta_do_dia: meta, resultado: r.slice(0, 30),
      aviso: "'Atendimento' aqui = cliente cadastrado/agendado pela pessoa no 360 no período (é o que a tela Produtividade conta). Ligações que não viraram cadastro não aparecem." };
  }
  if (nome === "anuncios_resumo") {
    if (!podeVerAnuncios(R)) return NEG;
    const hj = hojeISO(); const de = ISO.test(a.de) ? a.de : hj.slice(0, 8) + "01"; let ate = ISO.test(a.ate) ? a.ate : hj; if (ate < de) ate = de;
    const dias = Math.max(1, Math.round((+new Date(ate + "T12:00Z") - +new Date(de + "T12:00Z")) / 86400000) + 1);
    const dePrev = somaDias(de, -dias), atePrev = somaDias(de, -1);
    const plat = a.plataforma === "meta" || a.plataforma === "google" ? a.plataforma : "todas";
    const ls: any[] = [];
    for (let p = 0; p < 20; p++) {
      const { data, error } = await sb.from("anuncios_dia").select("plataforma,dia,campanha,gasto,impressoes,cliques,conversas,conversoes").gte("dia", dePrev).lte("dia", ate).order("dia").range(p * 1000, p * 1000 + 999);
      if (error) return { erro: error.message };
      ls.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    const sy = await sb.from("anuncios_sync").select("ate,ultimo").maybeSingle();
    const f = (x: any) => plat === "todas" || x.plataforma === plat;
    const soma = (l: any[]) => { const t = { gasto: 0, impressoes: 0, cliques: 0, conversas: 0, conversoes: 0 }; l.forEach(x => { t.gasto += +x.gasto || 0; t.impressoes += +x.impressoes || 0; t.cliques += +x.cliques || 0; t.conversas += +x.conversas || 0; t.conversoes += +x.conversoes || 0; });
      const contatos = t.conversas + t.conversoes; return { gasto: r2(t.gasto), impressoes: t.impressoes, cliques: t.cliques, conversas: t.conversas, conversoes: t.conversoes, contatos, custo_por_contato: contatos ? r2(t.gasto / contatos) : null, cpc: t.cliques ? r2(t.gasto / t.cliques) : null, ctr_pct: t.impressoes ? r2((t.cliques / t.impressoes) * 100) : null }; };
    const atual = ls.filter(x => f(x) && x.dia >= de && x.dia <= ate), ant = ls.filter(x => f(x) && x.dia >= dePrev && x.dia <= atePrev);
    const camp: Record<string, any> = {};
    atual.forEach(x => { const k = x.plataforma + "|" + x.campanha; (camp[k] = camp[k] || { plataforma: x.plataforma, campanha: x.campanha, l: [] }).l.push(x); });
    const campanhas = Object.values(camp).map((c: any) => ({ plataforma: c.plataforma, campanha: c.campanha, ...soma(c.l) })).sort((x, y) => y.gasto - x.gasto).slice(0, Math.min(15, Math.max(1, Number(a.campanhas) || 5)));
    // funil do 360 (marketing) — mesma conta da tela Anúncios; os cadastros pelo 360 só valem a partir de 15/10/2026
    const INI = "2026-10-15"; const no = (v: any, x: string, y: string) => { const d = String(v || "").slice(0, 10); return !!v && d >= x && d <= y; };
    const imp = (k: any) => /^Importa/i.test(k.solicitante || "") || !!(k.tratativa && (k.tratativa.agendLojaImportado || k.tratativa.importadoVisita || k.tratativa.visitaImportada));
    const mk = (st.chamados as any[]).filter(k => R.domMarketing(k) && !imp(k) && String(k.criadoEm).slice(0, 10) >= INI);
    const funil = (x0: string, y: string) => { const x = x0 < INI ? INI : x0; if (x > y) return null;
      const vend = mk.filter(k => vendaContaVolume(k.venda) && pagamentosVenda(k.venda).some((p: any) => no(p.data, x, y)));
      return { cadastros: mk.filter(k => no(k.criadoEm, x, y)).length, vieram_loja: mk.filter(k => no(k.dataLoja, x, y)).length, vendas: vend.length, faturamento: r2(vend.reduce((sm, k) => sm + (Number(k.venda?.valorNum) || 0), 0)) }; };
    const F = funil(de, ate); const T = soma(atual);
    // por dia e por dia da semana (investimento e resultado) — "melhor dia", "maior investimento"
    const DS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    const porDiaM: Record<string, any[]> = {}; atual.forEach(x => (porDiaM[x.dia] = porDiaM[x.dia] || []).push(x));
    const dias_ = Object.entries(porDiaM).map(([d, l]) => ({ dia: d, dia_semana: DS[new Date(d + "T12:00:00").getDay()], ...soma(l) }));
    const porSem = DS.map((nm, i) => { const l = dias_.filter(x => new Date(x.dia + "T12:00:00").getDay() === i); const t = soma(atual.filter(x => new Date(x.dia + "T12:00:00").getDay() === i));
      return { dia_semana: nm, dias_no_periodo: l.length, ...t, media_gasto_por_dia: l.length ? r2(t.gasto / l.length) : 0, media_contatos_por_dia: l.length ? r2(t.contatos / l.length) : 0 }; }).filter(x => x.dias_no_periodo);
    const melhorSem = [...porSem].sort((x, y) => y.media_contatos_por_dia - x.media_contatos_por_dia)[0] || null;
    const hojeAn = soma(ls.filter(x => f(x) && x.dia === hj));
    const camps2 = Object.values(camp).map((c: any) => ({ plataforma: c.plataforma, campanha: c.campanha, ...soma(c.l) }));
    const comRes = camps2.filter(c => c.contatos >= 3 && c.custo_por_contato != null);
    // funil de HOJE e por canal do anúncio (campo "Canal do anúncio" da ficha do cliente)
    const hojeFunil = { cadastrados_hoje: mk.filter(k => no(k.criadoEm, hj, hj)).length, agendados_loja_hoje: mk.filter(k => no(k.dataLoja, hj, hj)).length, vieram_hoje: mk.filter(k => no(k.dataLoja, hj, hj) && R.compareceu(k)).length,
      agendados_consultor_externo_hoje: mk.filter(k => !R.ehDireto(k) && no(k.dataVisita, hj, hj)).length };
    const canalDe = (k: any) => (k.tratativa && k.tratativa.canalAnuncio) || "";
    const porCanal = (["meta", "google", "outro", ""] as const).map(cn => { const g = (x0: string, y0: string, d: string) => mk.filter(k => canalDe(k) === cn && no(k[d] , x0, y0));
      const vend = mk.filter(k => canalDe(k) === cn && vendaContaVolume(k.venda) && pagamentosVenda(k.venda).some((p: any) => no(p.data, de, ate)));
      return { canal: cn || "nao_informado", cadastrados: g(de, ate, "criadoEm").length, agendados_loja: g(de, ate, "dataLoja").length, vieram: g(de, ate, "dataLoja").filter(k => R.compareceu(k)).length, vendas: vend.length, faturamento: r2(vend.reduce((sm, k) => sm + (Number(k.venda?.valorNum) || 0), 0)) }; });
    const marcados = porCanal.filter(x => x.canal !== "nao_informado").reduce((sm, x) => sm + x.cadastrados, 0);
    return { periodo: { de, ate, dias }, anterior: { de: dePrev, ate: atePrev }, plataforma: plat, atual: T, periodo_anterior: soma(ant),
      por_plataforma: (["meta", "google"] as const).filter(p => plat === "todas" || plat === p).map(p => ({ plataforma: p, ...soma(atual.filter(x => x.plataforma === p)) })),
      hoje_anuncios: hojeAn, hoje_clientes: hojeFunil, melhores_campanhas_por_gasto: campanhas,
      campanha_mais_contatos: [...camps2].sort((x, y) => y.contatos - x.contatos)[0] || null, campanha_menor_custo_por_contato: [...comRes].sort((x, y) => (x.custo_por_contato as number) - (y.custo_por_contato as number))[0] || null,
      dia_mais_contatos: [...dias_].sort((x, y) => y.contatos - x.contatos)[0] || null, dia_maior_investimento: [...dias_].sort((x, y) => y.gasto - x.gasto)[0] || null, por_dia_da_semana: porSem, melhor_dia_da_semana_por_contatos: melhorSem,
      por_dia: dias_.slice(-31), por_canal_do_anuncio: porCanal, canal_informado_em: marcados + " cadastros do período já têm o canal (Meta/Google) marcado na ficha",
      funil_360: F ? { ...F, custo_por_cliente_na_loja: F.vieram_loja ? r2(T.gasto / F.vieram_loja) : null, custo_por_venda: F.vendas ? r2(T.gasto / F.vendas) : null } : null,
      dados_ate: sy.data?.ate || null,
      aviso: "Anúncios vêm do Reportei, atualizados por tarefa agendada (veja 'dados_ate'). Vendas por Meta/Google dependem do campo Canal do anúncio na ficha do cliente (marcado a mão); sem marcação aparece como nao_informado. O funil do 360 só conta cadastros feitos no 360 desde 15/10/2026, então períodos anteriores a isso não casam com o investimento." };
  }
  return { erro: "Ferramenta desconhecida" };
}
