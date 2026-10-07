// Regras de negócio portadas do protótipo (REFERENCIA-sistema-atual.html), mesma lógica e mesmos textos.
// Aqui elas servem para a TELA (o que mostrar/esconder). A proteção de verdade está no banco (RLS + funções).
import type { Estado, Chamado, Usuario } from "./dados";

export const STATUS: Record<string, { label: string; cls: string }> = {
  aberta: { label: "Aberta", cls: "b-aberta" }, tratativa: { label: "Em tratativa", cls: "b-tratativa" },
  respondida: { label: "Respondida", cls: "b-respondida" }, informar: { label: "Informar cliente", cls: "b-informar" }, concluida: { label: "Concluída", cls: "b-concluida" },
};
export const STATUS_CLIENTE: Record<string, string> = {
  aguardando_consultor: "Aguardando consultor", direcionado_consultor: "Direcionado ao consultor", visita_realizada: "Visita realizada",
  agendado_loja: "Agendado loja", com_vendedor: "Com vendedor", orcamento: "Orçamento", sem_resposta: "Sem resposta", reagendado: "Reagendado", reprovado: "Reprovado",
  em_obras: "Em obras", standby: "Standby", em_analise: "Em análise", ausente_endereco: "Ausente no endereço", atendido: "Atendimento finalizado", vendido_revisao: "Vendido — a confirmar",
  vendido_entrada: "Vendido — entrada + promissória", vendido_promissoria: "Vendido — 100% promissória", vendido: "Vendido — efetivado", venda_cancelada: "Venda cancelada", nao_compareceu: "Não compareceu",
};
// pareceres extras (menu "Mais opções")
export const SITUACOES_EXTRA = ["em_obras", "standby", "em_analise"];
export const SITUACOES_CONSULTOR = ["ausente_endereco", "em_obras", "standby", "em_analise"];
export const TIPO_VENDA_INFORMADO: Record<string, string> = { efetivada: "à vista (paga)", entrada: "entrada + promissória", promissoria: "100% promissória" };
export const TIPO_REEMBOLSO: Record<string, string> = { pedagio: "Pedágio", estacionamento: "Estacionamento", combustivel: "Combustível", outro: "Outro" };
export const ETAPA_MEDIDA: Record<string, string> = { pendente: "Pendente para medir", agendada: "Aguardando medição", validar: "Aguardando análise (medidas do consultor)", realizada: "Aguardando análise", em_obra: "Em obra", liberada: "Aprovada — medida oficial" };
/** grupo da medida para as listas: pendentes · aguardando medição · análise · aprovados · em obra */
export const grupoMedida = (etapa: string) => etapa === "liberada" ? "aprovados" : etapa === "agendada" ? "agendadas" : etapa === "em_obra" ? "obra" : ["validar", "realizada"].includes(etapa) ? "analise" : "pendentes";
export const VENDA_STATUS: Record<string, string> = {
  registrada: "Pendente de análise", efetivada: "Efetivada", entrada: "Entrada + promissória", promissoria: "Promissória", cancelada: "Cancelada",
};
export const VENDA_TO_CLIENTE: Record<string, string> = { registrada: "vendido_revisao", promissoria: "vendido_promissoria", entrada: "vendido_entrada", efetivada: "vendido", cancelada: "venda_cancelada" };
export const ORDEM = ["aberta", "tratativa", "respondida", "informar", "concluida"];
export const LIBS: Record<string, string> = {
  criar: "Abrir solicitações", verTudo: "Ver todos os setores (visão global)", cadastros: "Acessar aba Fábricas",
  admin: "Administração (usuários e setores)", verMarketing: "Ver todo o agendamento de marketing (todas as etapas e consultores)",
  viaCallcenter: "Não fala com o cliente: ao concluir vai para \"Informar cliente\" e o call center avisa",
};
export const MARKETING_SETORES = ["marketing_operadora", "marketing_supervisao", "consultor_externo", "suporte_consultores", "atendente_cliente", "gerente_loja"];
// status do cliente enquanto está com o vendedor (antes do desfecho)
export const EM_ATENDIMENTO = ["com_vendedor", "orcamento", "sem_resposta", "reagendado", "em_obras", "standby", "em_analise"];
export const LIMITE_INATIVIDADE_H = 24;
export const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
/** Turnos dos vendedores (escala): manhã = entra 9:00, almoço 11:00–13:00 · tarde = entra 10:40, almoço 13:30–15:30 (minutos do dia) */
export const TURNOS: Record<string, { rot: string; entra: number; almoco: [number, number] }> = {
  manha: { rot: "Entra 9:00 · almoço 11:00–13:00", entra: 540, almoco: [660, 780] },
  tarde: { rot: "Entra 10:40 · almoço 13:30–15:30", entra: 640, almoco: [810, 930] },
};
export const hhmm = (m: number) => Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0");
export const statusFinalCliente = ["vendido", "vendido_promissoria", "vendido_entrada", "venda_cancelada", "atendido", "nao_compareceu", "reprovado"];
export const COR_SETOR: Record<string, string> = {
  callcenter: "#4b6bd6", prazo_fabrica: "#b8802a", montagem: "#2f8fa8", assistencia: "#c23b3b", checklist: "#7a5bb5", medidas: "#1f9c7a",
  marketing_operadora: "#d1478f", marketing_supervisao: "#8e44ad", consultor_externo: "#b8802a", suporte_consultores: "#0f8a8a",
  atendente_cliente: "#3f8f4f", gerente_loja: "#2d6a4f", posvenda: "#c06a2b", juridico: "#6b4e2e", supervisao: "#5a6270", gestao: "#1a1d21",
};
// Pós-venda Projetados
export const PV_TIPOS: Record<string, string> = {
  avaria: "Avaria / dano", peca_faltante: "Peça faltante", peca_defeito: "Peça com defeito", medida: "Medida / peça não encaixa",
  montagem: "Montagem mal feita", acabamento: "Acabamento", dano_obra: "Dano no imóvel na montagem (ex.: furou cano)",
  duvida_projeto: "Dúvida de projeto / suporte ao montador", outro: "Outro",
};
export const PV_DESFECHO: Record<string, string> = {
  resolvido_telefone: "Resolvido por telefone / orientação", assistencia: "Assistência (peça)", retorno_montador: "Retorno do montador",
  erro_medida_projeto: "Erro de medida / projeto", reembolso_cliente: "Reembolso ao cliente", improcedente: "Improcedente (não era problema nosso)", outro: "Outro",
};
export const PV_REEMB: Record<string, string> = { em_analise: "Em análise", procedente: "Procedente — loja reembolsa", improcedente: "Improcedente — não reembolsa" };
export const PV_DESC: Record<string, string> = { a_descontar: "A descontar", descontado: "Descontado" };
/** Prazo do pós-venda: "vencido" | "hoje" | "ok" | "" (sem prazo ou concluído) */
export function pvPrazo(c: any): string {
  const p = c.posvenda; if (!p || !p.prazo || c.status === "concluida") return "";
  const d = new Date(p.prazo); const agora = new Date();
  if (d < agora) return "vencido";
  return d.toDateString() === agora.toDateString() ? "hoje" : "ok";
}
export const PV_RESP: Record<string, string> = {
  analise: "Em análise", montador: "Montador", medida: "Projeto — erro de medição", checklist: "Projeto — falha no checklist",
  fabrica: "Fábrica", transporte: "Transporte / entrega", cliente: "Cliente (mau uso)", nenhum: "Sem responsável",
};
export const PV_ORIGEM: Record<string, string> = { cliente: "Solicitação do cliente", montador: "Solicitação do montador" };
/** situação do montador na obra (solicitação do montador) */
export const PV_SITUACAO: Record<string, string> = {
  parado: "🚨 Parado na obra — não consegue continuar", peca_faltante: "Peça faltante", peca_defeito: "Peça com defeito / avariada",
  medida: "Medida não confere", duvida_projeto: "Dúvida de projeto", local: "Problema no local (obra, elétrica, hidráulica)", outro: "Outro",
};
/** link do WhatsApp: número com DDD (sem 55 → acrescenta) */
export const linkWhats = (tel: string, texto = "") => { let d = String(tel || "").replace(/\D/g, ""); if (d.length < 10) return ""; if (!d.startsWith("55") || d.length <= 11) d = "55" + d; return "https://wa.me/" + d + (texto ? "?text=" + encodeURIComponent(texto) : ""); };
export const PV_ENCAMINHAR: Record<string, string> = { vistoria: "Solicitar vistoria", assistencia: "Solicitar assistência (peça + montador)", montagem: "Nova montagem / retorno do montador", medidas: "Conferir medidas", checklist: "Revisar projeto (checklist)", prazo_fabrica: "Cobrar fábrica (prazo)" };
export const corDoSetor = (id: string) => COR_SETOR[id] || "#8b94a3";
// conta como venda: o que já foi pago e efetivado (100% promissória ainda não pago não conta; entrada + promissória conta a parte paga)
export const vendaContaVolume = (v: any) => !!v && ["entrada", "efetivada"].includes(v.status);
export const vendaContaComissao = (v: any) => !!v && v.status === "efetivada";
// lançamentos da venda (nºs pagos, promissórias e pagamentos). Sem a lista (sem acesso ao valor / dados antigos), um nº só.
export function itensVenda(v: any): any[] {
  if (!v) return [];
  if (Array.isArray(v.itens)) return v.itens;
  const val = v.valorNum != null ? Number(v.valorNum) : parseMoeda(v.valor);
  return v.numero ? [{ id: "", tipo: "pago", numero: v.numero, valor: val || 0, dataVenda: v.dataVendaReal || v.dataVenda || "", status: v.status === "registrada" ? "registrada" : v.status === "cancelada" ? "cancelada" : "efetivada", valorPago: 0, decididoEm: "", registradoEm: v.quando }] : [];
}
// nºs de venda do cliente (pagos + promissórias), sem cancelados
export const numerosVenda = (v: any) => itensVenda(v).filter(i => i.tipo !== "pagamento" && i.status !== "cancelada");
// lançamentos aguardando a Gestão
export const itensPendentes = (v: any) => itensVenda(v).filter(i => i.status === "registrada");
// cliente com venda cancelada (inteira) ou com algum nº de venda cancelado
export const temCancelamento = (c: any) => !!c && (String(c.statusCliente || "") === "venda_cancelada" || (!!c.venda && (c.venda.status === "cancelada" || itensVenda(c.venda).some((i: any) => i.status === "cancelada" && i.tipo !== "pagamento"))));
export const temPendenteGestao = (v: any) => !!v && (v.status === "registrada" || itensPendentes(v).length > 0);
// promissórias validadas com saldo a receber
export const promAbertas = (v: any) => (v && v.promissorias ? v.promissorias.filter((p: any) => p.status === "aberta") : []);
// números de venda e de promissória (para a busca)
export const numsVenda = (c: any) => (c && c.venda ? [c.venda.numero, ...itensVenda(c.venda).map((i: any) => i.numero)].filter(Boolean).join(" ") : "");
export const valorPendente = (v: any) => promAbertas(v).reduce((s: number, p: any) => s + (p.saldo != null ? p.saldo : p.valor), 0);
export const valorPago = (v: any) => itensVenda(v).filter(i => i.tipo !== "promissoria" && i.status === "efetivada").reduce((s, i) => s + i.valor, 0);
// competência do lançamento: se a data é de mês anterior ao da aprovação, conta no 1º dia do mês da aprovação
export function competenciaItem(data: string, decidido: string, registrado?: string) {
  const d = String(data || registrado || "").slice(0, 10);
  const ap = decidido || registrado;
  if (!d || !ap) return d;
  const r = new Date(ap); const m = `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, "0")}`;
  return d.slice(0, 7) < m ? m + "-01" : d;
}
// pagamentos que geram comissão: cada nº pago efetivado (mês da aprovação) + cada pagamento de promissória (data do pagamento)
export function pagamentosVenda(v: any): { valor: number; data: string; tipo: string; numero: string }[] {
  if (!v) return [];
  if (!Array.isArray(v.itens)) {
    if (v.status !== "efetivada") return [];
    const total = v.valorNum != null ? Number(v.valorNum) : parseMoeda(v.valor);
    return [{ valor: total, data: String(v.dataVenda || v.quando || "").slice(0, 10), tipo: "total", numero: v.numero }];
  }
  return v.itens.filter((i: any) => i.tipo !== "promissoria" && i.status === "efetivada")
    .map((i: any) => ({ valor: i.valor, data: competenciaItem(i.dataVenda, i.decididoEm, i.registradoEm), tipo: i.tipo === "pagamento" ? "promissoria" : "venda", numero: i.numero }));
}

// VALOR VENDIDO NO PERÍODO: cada nº pago conta no mês em que foi efetivado; pagamento de promissória conta no mês em que foi pago.
const noIntervalo = (d: string, de: string, ate: string) => !!d && (!de || d >= de) && (!ate || d <= String(ate).slice(0, 10));
export const pagamentosNoPeriodo = (v: any, de: string, ate: string) => pagamentosVenda(v).filter(p => noIntervalo(p.data, de, ate));
export const valorVendaPeriodo = (v: any, de: string, ate: string) => pagamentosNoPeriodo(v, de, ate).reduce((s, p) => s + p.valor, 0);
// TOTAL NEGOCIADO no período (só consulta): nºs pagos efetivados + promissórias confirmadas (valor cheio), cada um no seu mês.
// Pagamento de promissória não entra de novo (a promissória já foi contada inteira).
export function negociadoPeriodo(v: any, de: string, ate: string): number {
  if (!v || v.status === "cancelada") return 0;
  if (!Array.isArray(v.itens)) return ["efetivada", "entrada", "promissoria"].includes(v.status) && noIntervalo(String(v.dataVenda || v.quando || "").slice(0, 10), de, ate) ? (v.valorNum != null ? Number(v.valorNum) : parseMoeda(v.valor)) : 0;
  return v.itens.filter((i: any) => (i.tipo === "pago" || i.tipo === "promissoria") && i.status === "efetivada" && noIntervalo(competenciaItem(i.dataVenda, i.decididoEm, i.registradoEm), de, ate))
    .reduce((s: number, i: any) => s + i.valor, 0);
}
// clientes com venda no período, com o valor (e a data) só do que entrou no período — use no lugar de "venda com data no período"
export function vendasDoPeriodo(lista: any[], de: string, ate: string): any[] {
  return lista.filter(c => vendaContaVolume(c.venda)).map(c => {
    const ps = pagamentosNoPeriodo(c.venda, de, ate);
    if (!ps.length) return null;
    const val = ps.reduce((s, p) => s + p.valor, 0);
    return { ...c, venda: { ...c.venda, valorNum: val, valor: val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), dataVenda: ps.map(p => p.data).sort()[0] } };
  }).filter(Boolean);
}

// ---------- datas ----------
// datas só com dia ("2026-09-24") são tratadas como data local (o protótipo as lia em UTC e mostrava o dia anterior)
export const parseData = (v: any): Date => {
  if (v instanceof Date) return v;
  const s = String(v || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  return new Date(s);
};
export const fmtDate = (iso: any) => iso ? parseData(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
export const fmtDateTime = (iso: any) => {
  if (!iso) return "—";
  const d = parseData(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
export const fmtDT = (v: any) => v ? parseData(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtDiaHora = (v: any) => parseData(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export function tempoRel(iso: any) { const s = (Date.now() - +parseData(iso)) / 1000; if (s < 60) return "agora"; if (s < 3600) return Math.floor(s / 60) + " min"; if (s < 86400) return Math.floor(s / 3600) + " h"; return Math.floor(s / 86400) + " d"; }
export const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function estaAtrasado(c: Chamado) { if (c.status === "respondida" || c.status === "informar" || c.status === "concluida") return false; return new Date() > new Date(c.slaResposta); }
export function diasRestantes(c: Chamado) { return Math.ceil((+new Date(c.slaResposta) - +new Date()) / 86400000); }
export function horasAtraso(c: Chamado) { if (!estaAtrasado(c)) return 0; return (+new Date() - +new Date(c.slaResposta)) / 3600000; }
export function situacaoPrazo(c: Chamado) {
  if (c.status === "concluida") return "concluida"; if (c.status === "respondida") return "respondida"; if (c.status === "informar") return "informar";
  if (estaAtrasado(c)) return horasAtraso(c) >= 24 ? "critico" : "atrasado";
  const h = (+new Date(c.slaResposta) - +new Date()) / 3600000; return h <= 24 ? "perto" : "ok";
}
export const pesoPrazo: Record<string, number> = { critico: 0, atrasado: 1, informar: 2, perto: 3, ok: 4, respondida: 5, concluida: 6 };

// ---------- dinheiro ----------
export function parseMoeda(v: any) { const n = parseFloat((v || "0").toString().replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; }
export function fmtMoeda(n: number) { const v = Number(n) || 0; return "R$ " + (Math.round(v * 100) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ---------- whatsapp ----------
export function sanitizeWhats(w: string) { let d = (w || "").replace(/\D/g, ""); if (!d) return ""; if (d.length <= 11 && d.slice(0, 2) !== "55") d = "55" + d; return d; }
export const primeiroNome = (n: string) => (n || "").trim().split(" ")[0];
export const nomeNatural = (n: string) => { if (!n) return ""; const p = n.split("—"); return (p.length > 1 ? p[1] : p[0]).trim(); };
export const inicial = (n: string) => (n || "?").trim().charAt(0).toUpperCase();
export const soDigitos = (v: any) => (v || "").replace(/\D/g, "");

export function mesmaPessoa(c: Chamado, dados: any) {
  const doc = soDigitos(dados.clienteDoc), tel = soDigitos(dados.telefone), ped = (dados.pedido || "").trim().toLowerCase();
  if (doc && soDigitos(c.clienteDoc) === doc) return "CPF/CNPJ";
  if (tel && tel.length >= 10 && soDigitos(c.telefone) === tel) return "telefone";
  if (ped && (c.pedido || "").trim().toLowerCase() === ped) return "nº da venda";
  const nome = (dados.cliente || "").trim().toLowerCase();
  if (nome && nome.length > 5 && (c.cliente || "").trim().toLowerCase() === nome) return "nome";
  return null;
}

// ---------- regras dependentes do usuário logado ----------
export function criarRegras(state: Estado, currentUserId: string) {
  const TIPOS = state.tipos;
  const getSetor = (id: string) => (state.setores || []).find(x => x.id === id) || null;
  const setorNome = (id: string) => { const s = getSetor(id); return s ? s.nome : (id || "—"); };
  const destinoDe = (tipo: string) => (TIPOS[tipo] ? TIPOS[tipo].destino : "");
  const tipoNome = (k: string) => (TIPOS[k] ? TIPOS[k].nome : (k || "—"));
  const getUser = (id: string): Usuario | null => state.usuarios.find(u => u.id === id) || null;
  const me = () => getUser(currentUserId);
  const mySetores = () => (me() || ({} as any)).setores || [];
  const myLibs = () => { const acc: Record<string, boolean> = {}; mySetores().forEach((id: string) => { const s = getSetor(id); if (s && s.liberacoes) Object.keys(s.liberacoes).forEach(k => { if (s.liberacoes[k]) acc[k] = true; }); }); return acc; };
  const temLib = (k: string) => !!myLibs()[k];
  const setoresLabel = (u: any) => ((u && u.setores) || []).map(setorNome).join(", ") || "—";
  const getFab = (c: Chamado) => state.fabricas.find(f => f.id === c.fabrica) || null;
  const getRep = (c: Chamado) => { const f = getFab(c); return f ? state.representantes.find(r => r.id === f.repId) || null : null; };
  const nomeFab = (id: string) => { const f = state.fabricas.find(x => x.id === id); return f ? f.nome : "—"; };
  const nomeUser = (id: string) => (getUser(id) || ({} as any)).nome || "—";

  const verTudo = () => temLib("verTudo");
  const ehGestao = () => temLib("admin");
  const acompAtivo = (c: Chamado) => !!(c.tratativa && c.tratativa.acomp && ["pendente", "acompanhando"].includes(c.tratativa.acomp.status));
  const temCadastros = () => temLib("cadastros");
  const temMarketing = () => temLib("verMarketing");
  const ehSetorMarketing = (id: string) => MARKETING_SETORES.includes(id);
  const domMarketing = (c: Chamado) => !!(TIPOS[c.tipo] && TIPOS[c.tipo].presale);
  // é do call center: não é marketing e não é de setor com módulo próprio (Checklist, Medidas, Pós-venda) — esses não viram pendência do call center
  const TIPOS_FORA_CC = ["checklist", "medidas", "posvenda"];
  const doCC = (c: Chamado) => !domMarketing(c) && !TIPOS_FORA_CC.includes(c.tipo);

  function normalizarStatusCliente(c: Chamado) {
    if (c.venda && c.venda.status) return VENDA_TO_CLIENTE[c.venda.status] || c.statusCliente;
    if (c.statusCliente === "nao_compareceu") return "nao_compareceu";
    if (c.setorDestino === "marketing_supervisao") return "aguardando_consultor";
    if (c.setorDestino === "consultor_externo") return SITUACOES_CONSULTOR.includes(c.statusCliente) ? c.statusCliente : (c.tratativa && c.tratativa.realizada) ? "visita_realizada" : "direcionado_consultor";
    if (c.setorDestino === "suporte_consultores") return "agendado_loja";
    if (c.setorDestino === "atendente_cliente") return ["orcamento", "sem_resposta", "reagendado", "reprovado", "atendido", ...SITUACOES_EXTRA].includes(c.statusCliente) ? c.statusCliente : "com_vendedor";
    return c.statusCliente || "aguardando_consultor";
  }
  function statusClienteDe(c: Chamado) { if (domMarketing(c)) return normalizarStatusCliente(c); if (c.statusCliente) return c.statusCliente; return "aguardando_consultor"; }

  // crítico por inatividade: só ações de pessoas contam (entradas automáticas do Sistema não "resetam" o relógio)
  function ultimaAtividade(c: Chamado) {
    const h = (c.historico || []).filter((x: any) => x.quem !== "Sistema");
    if (h.length) return new Date(h[h.length - 1].quando);
    return new Date(c.criadoEm);
  }
  const horasSemAtualizar = (c: Chamado) => (+new Date() - +ultimaAtividade(c)) / 3600000;
  function clienteCriticoInatividade(c: Chamado) {
    if (!domMarketing(c) || (c.tratativa && c.tratativa.importadoVisita)) return false;
    if (statusFinalCliente.includes(statusClienteDe(c))) return false;
    return horasSemAtualizar(c) >= LIMITE_INATIVIDADE_H;
  }

  const trPendPara = (c: Chamado) => !!(c.transferencia && c.transferencia.status === "pendente" && c.transferencia.para === currentUserId);
  function podeVer(c: Chamado) {
    const u = me();
    if (u && u.somenteAtribuidos) return c.consultorId === currentUserId || c.atendenteId === currentUserId || trPendPara(c) || (c.tipo === "erro_venda" && (c as any).tratativa?.erroVenda?.vendedorId === currentUserId);
    if (ehGestao()) return true;
    if (domMarketing(c)) return temMarketing() || mySetores().includes("suporte_consultores") || mySetores().includes(c.setorDestino) || c.solicitanteId === currentUserId;
    if (verTudo()) return true;
    if (mySetores().includes("callcenter")) return true;
    return mySetores().includes(c.setorDestino) || c.solicitanteId === currentUserId;
  }
  // fila de trabalho: o que é do meu setor ou o que eu abri (o call center vê tudo, mas a fila dele é esta)
  function naMinhaFila(c: Chamado) {
    const u = me();
    if (u && u.somenteAtribuidos) return podeVer(c);
    if (ehGestao() || verTudo()) return true;
    return mySetores().includes(c.setorDestino) || c.solicitanteId === currentUserId;
  }
  const ehCallcenter = () => mySetores().includes("callcenter");
  // setor que não fala com o cliente (ex.: Solicitação Fábrica): ao concluir, o chamado vai para "Informar cliente"
  const viaCC = (setorId: string) => !!getSetor(setorId)?.liberacoes?.viaCallcenter;
  const ehFabrica = (c: Chamado) => c.tipo === "prazo_fabrica";
  // treinamento: call center e Supervisão (call center); a Gestão também, por administrar o sistema
  const podeTreinamento = () => ehGestao() || mySetores().some((x: string) => ["callcenter", "supervisao"].includes(x));
  // call center acompanha qualquer solicitação de pós-venda: anota novo contato e marca urgente (quem trata fala com o cliente e conclui)
  const podeAcompanhar = (c: Chamado) => podeTratar(c) || (ehCallcenter() && !domMarketing(c));
  function podeTratar(c: Chamado) {
    const u = me();
    if (u && u.somenteAtribuidos) return c.consultorId === currentUserId || c.atendenteId === currentUserId || (!!c.medidorId && c.medidorId === currentUserId) || trPendPara(c);
    if (ehGestao()) return true;
    if (domMarketing(c)) return temMarketing() || mySetores().includes("suporte_consultores") || mySetores().includes(c.setorDestino);
    if (verTudo()) return true;
    return mySetores().includes(c.setorDestino) || (!!c.medidorId && c.medidorId === currentUserId);
  }
  function podeAnexar(c: Chamado) {
    if (ehGestao()) return true;
    if (domMarketing(c)) {
      if (mySetores().includes("atendente_cliente") && !mySetores().some((s: string) => ["marketing_supervisao", "suporte_consultores"].includes(s))) return false;
      return podeTratar(c);
    }
    return podeTratar(c) || temLib("criar");
  }
  const setoresCriaMkt = ["marketing_operadora", "marketing_supervisao", "consultor_externo"];
  const podeCriarTipo = (k: string) => {
    const t = TIPOS[k]; if (!t) return false;
    if (!temLib("criar")) return false;
    if (ehGestao()) return true;
    const ms = mySetores();
    if (t.presale) return ms.some((x: string) => setoresCriaMkt.includes(x));
    return ms.some((x: string) => !ehSetorMarketing(x));
  };
  const podeCriarCC = () => Object.keys(TIPOS).some(k => !TIPOS[k].presale && podeCriarTipo(k));
  const podeCriarMkt = () => Object.keys(TIPOS).some(k => TIPOS[k].presale && podeCriarTipo(k));
  const operacionais = () => (state.setores || []).filter(s => !(s.liberacoes && s.liberacoes.verTudo));
  const setoresVisiveis = () => operacionais().filter(s => !ehSetorMarketing(s.id) || temMarketing() || ehGestao());
  const podeVerValor = (c: Chamado) => ehGestao() || mySetores().includes("gerente_loja") || (c.atendenteId && c.atendenteId === currentUserId) || (c.consultorId && c.consultorId === currentUserId);
  const ehConsultorExterno = () => mySetores().includes("consultor_externo");
  const ehPosvenda = () => mySetores().includes("posvenda");
  const ehJuridico = () => mySetores().includes("juridico");
  const podeChecklist = () => ehGestao() || mySetores().includes("checklist");
  const podeVerPosvenda = () => ehGestao() || ehPosvenda() || ehJuridico();
  // cadastro de montadores e contas de pagamento: só a Gestão (Cadastros)
  const podeMontadores = () => ehGestao();
  const responsaveisChecklist = () => state.usuarios.filter(u => (u.setores || []).includes("checklist"));
  const medidores = () => state.usuarios.filter(u => (u.setores || []).includes("medidas"));
  const nomeMontador = (id: string) => ((state.montadores || []).find(m => m.id === id) || ({} as any)).nome || "—";
  const podeEditarAgenda = () => ehGestao() || temMarketing() || mySetores().includes("suporte_consultores");
  const podeMudarDataLoja = (c: Chamado) => !(c.venda && c.venda.status !== "cancelada") && (podeEditarAgenda() || (c.consultorId && c.consultorId === currentUserId) || (c.setorDestino === "atendente_cliente" && c.atendenteId === currentUserId));
  const podeMudarDataVisita = (c: Chamado) => ["marketing_supervisao", "consultor_externo"].includes(c.setorDestino) && (ehGestao() || temMarketing() || (!!c.consultorId && c.consultorId === currentUserId));
  const podeEditarCliente = () => ehGestao() || mySetores().some((s: string) => ["supervisao", "marketing_supervisao"].includes(s));
  const ehProspeccao = (c: Chamado) => (c as any).origem === "prospeccao_consultor";

  // gerente que negociou a venda (obrigatório no registro): Gerentes de Loja e Gestão
  const gerentesVenda = () => state.usuarios.filter(u => u.ativo && ["gerente_loja", "gestao", "proprietario"].some(s => (u.setores || []).includes(s)))
    .sort((a, b) => Number((b.setores || []).includes("gerente_loja")) - Number((a.setores || []).includes("gerente_loja")) || a.nome.localeCompare(b.nome));
  const consultores = () => state.usuarios.filter(u => u.ativo && u.somenteAtribuidos && (u.setores || []).includes("consultor_externo"));
  // ---------- agendamento na loja / vendedor ----------
  const ehDireto = (c: Chamado) => !!(TIPOS[c.tipo] && TIPOS[c.tipo].direto);
  const origemLoja = (c: Chamado) => ehDireto(c) ? "marketing" : "externo";
  // cliente que vem (ou veio) à loja sem planta/fotos anexadas
  const semAnexo = (c: Chamado) => domMarketing(c) && !(c.tratativa && c.tratativa.importadoVisita) && !(c.anexos || []).length && !c.venda && !statusFinalCliente.includes(statusClienteDe(c))
    && (!!c.dataLoja || !!(c.tratativa && c.tratativa.realizada));
  // o cliente já veio (data/hora da loja passou) e o vendedor ainda não deu parecer depois disso
  function semParecer(c: Chamado) {
    if (!domMarketing(c) || c.setorDestino !== "atendente_cliente" || c.venda || !c.dataLoja) return false;
    if (statusFinalCliente.includes(statusClienteDe(c))) return false;
    const dl = parseData(c.dataLoja); if (dl > new Date()) return false;
    const t = c.tratativa || {};
    return !t.parecerEm || new Date(t.parecerEm) < dl;
  }
  const parecerCobrado = (c: Chamado) => !!(c.tratativa && c.tratativa.cobradoEm) && c.setorDestino === "atendente_cliente" && !c.venda && !statusFinalCliente.includes(statusClienteDe(c));
  // quem responde por definir o vendedor e cobrar parecer: Suporte = clientes dos consultores externos; Supervisão Marketing / Gerente de Loja = agendados pelo marketing
  const souRespLoja = (c: Chamado) => (mySetores().includes("suporte_consultores") && !ehDireto(c)) || (temMarketing() && ehDireto(c));
  const projetistas = () => state.usuarios.filter(u => u.ativo && u.somenteAtribuidos && (u.setores || []).includes("atendente_cliente")).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  /** Disponibilidade do vendedor para atender um cliente na loja num horário (folga, turno, almoço e outro cliente a menos de 2h) */
  const dispVendedor = (uid: string, quando: string | null | undefined, exceto?: Chamado | null): string[] => {
    const u: any = getUser(uid); if (!u || !quando) return [];
    const d = new Date(quando); if (isNaN(d.getTime())) return [];
    const mot: string[] = []; const m = d.getHours() * 60 + d.getMinutes();
    if (u.folga !== null && u.folga !== undefined && d.getDay() === u.folga) mot.push("folga (" + DIAS_SEMANA[u.folga] + ")");
    const tu = TURNOS[u.turno || ""];
    if (tu) {
      if (m < tu.entra) mot.push("só entra às " + hhmm(tu.entra));
      else if (m >= tu.almoco[0] && m < tu.almoco[1]) mot.push("no almoço (" + hhmm(tu.almoco[0]) + "–" + hhmm(tu.almoco[1]) + ")");
    }
    if (exceto && exceto.tratativa && exceto.tratativa.querProjeto === "sim" && u.fazProjeto === false) mot.push("não faz projeto (cliente quer projeto)");
    const outros = state.chamados.filter((x: any) => x.atendenteId === uid && x.dataLoja && (!exceto || x.id !== exceto.id) && x.setorDestino === "atendente_cliente" && !x.venda && !statusFinalCliente.includes(statusClienteDe(x)));
    for (const x of outros) { const dx = new Date(x.dataLoja as string); const dif = Math.abs(dx.getTime() - d.getTime()) / 60000; if (dif < 120) mot.push("já tem " + x.cliente + " às " + hhmm(dx.getHours() * 60 + dx.getMinutes())); }
    return mot;
  };

  // ---------- medidas (venda → medidas → checklist) ----------
  // Proprietário: vê e pode tudo (como a Gestão), mas sem tarefas pessoais
  const ehProprietario = () => mySetores().includes("proprietario");
  const ehMedidor = () => mySetores().includes("medidas") && !!me()?.somenteAtribuidos;
  // Encontrar vendas (Exact × Minha Visita): por enquanto só o Bruno
  const podeEncontrarVendas = () => ["00000000-0000-4000-a000-000000000007"].includes(currentUserId);
  const ehSupMedidas = () => ehGestao() || mySetores().includes("medidas_supervisao");
  const etapaMedida = (c: Chamado) => (c.tratativa && c.tratativa.medida && c.tratativa.medida.etapa) || (c.status === "concluida" ? "liberada" : "validar");
  const quemMede = () => ({
    medidores: state.usuarios.filter(u => u.ativo && (u.setores || []).includes("medidas") && !(u.setores || []).includes("medidas_supervisao")),
    consultores: state.usuarios.filter(u => u.ativo && (u.setores || []).includes("consultor_externo")),
  });
  const medidasDe = (uid: string) => state.chamados.filter(c => c.tipo === "medidas" && c.medidorId === uid);
  const reembolsosDe = (uid: string) => (state.reembolsos || []).filter(r => r.usuarioId === uid);

  // financeiro
  const cfg = () => state.config || { comissaoPct: 1.5, pagamentoVisita: 40 };
  const visitasPagas = (consultorId: string) => state.chamados.filter(c => c.consultorId === consultorId && c.tratativa && c.tratativa.realizada && c.dataLoja);
  const vendasComComissao = (consultorId: string) => state.chamados.filter(c => c.consultorId === consultorId && vendaContaComissao(c.venda));
  function dentroPeriodo(dataStr: any, de: string, ate: string) {
    if (!dataStr) return false;
    const d = parseData(dataStr);
    if (de && d < new Date(de + "T00:00:00")) return false;
    if (ate && d > new Date(ate + "T23:59:59")) return false;
    return true;
  }
  function extratoConsultor(consultorId: string, de: string, ate: string) {
    // visita paga no mês em que foi feita (data da visita); sem data da visita, vale a data na loja
    const visitas = visitasPagas(consultorId).filter(c => dentroPeriodo(c.dataVisita || c.dataLoja, de, ate) || (!de && !ate));
    // comissão pelos pagamentos: entrada na data da venda, promissórias na data em que foram pagas
    const meusVend = state.chamados.filter(c => c.consultorId === consultorId && c.venda);
    const pagamentos = meusVend.flatMap(c => pagamentosVenda(c.venda).map(p => ({ ...p, c }))).filter(p => dentroPeriodo(p.data, de, ate) || (!de && !ate));
    const vendas = meusVend.filter(c => pagamentos.some(p => p.c === c));
    const { pagamentoVisita, comissaoPct: pct } = cfg();
    const pagamentoVisitas = visitas.length * pagamentoVisita;
    const totalVendido = pagamentos.reduce((s, p) => s + p.valor, 0);
    // comissão futura: promissórias ainda em aberto dos clientes deste consultor
    const pendentes = meusVend.filter(c => !["cancelada", "registrada"].includes(c.venda.status) && valorPendente(c.venda) > 0);
    const comissaoFutura = pendentes.reduce((s, c) => s + valorPendente(c.venda), 0) * (pct / 100);
    const comissao = totalVendido * (pct / 100);
    // medidas feitas (R$ por visita, sem comissão) e reembolsos aprovados
    const medidas = medidasDe(consultorId).filter(c => c.tratativa && c.tratativa.medida && c.tratativa.medida.realizadaEm && !c.tratativa.medida.semPagamento && (dentroPeriodo(c.tratativa.medida.realizadaEm, de, ate) || (!de && !ate)));
    const pagamentoMedidas = medidas.length * pagamentoVisita;
    const reembolsos = reembolsosDe(consultorId).filter(r => r.status === "aprovado" && (dentroPeriodo(r.data, de, ate) || (!de && !ate)));
    const totalReembolsos = reembolsos.reduce((s, r) => s + r.valor, 0);
    // auxílio fixo (consultor e medidor): um por mês, pago no dia 15 — conta quando o dia 15 cai dentro do período
    const u = state.usuarios.find(x => x.id === consultorId);
    const temAux = !!u && (u.setores || []).some((x: string) => x === "consultor_externo" || x === "medidas");
    const cf: any = cfg(); const valAux = cf.auxilioFixo != null ? cf.auxilioFixo : 1500, diaAux = cf.diaAuxilio || 15;
    const datasAux: string[] = [];
    if (temAux && de && ate) {
      for (let d = new Date(de.slice(0, 7) + "-01T12:00"); isoLocal(d).slice(0, 7) <= ate.slice(0, 7); d.setMonth(d.getMonth() + 1)) {
        const dia = isoLocal(d).slice(0, 8) + String(diaAux).padStart(2, "0");
        if (dia >= de && dia <= ate.slice(0, 10)) datasAux.push(dia);
        if (datasAux.length > 24) break;
      }
    }
    const auxilio = datasAux.length * valAux;
    return { visitas, vendas, pagamentos, pendentes, comissaoFutura, pagamentoVisitas, totalVendido, comissao, medidas, pagamentoMedidas, reembolsos, totalReembolsos,
      auxilio, datasAuxilio: datasAux, valorAuxilio: valAux, total: pagamentoVisitas + comissao + pagamentoMedidas + totalReembolsos + auxilio };
  }

  // ---------- funil do marketing: visita → loja → venda ----------
  // período pela data da visita (ou do cadastro, se não houver); agendamento direto pela data na loja
  // venda importada de planilha não é visita (as visitas sobem separadas)
  const soVenda = new WeakSet<object>(), vendaFora = new WeakSet<object>();
  const perVenda = new WeakMap<object, { de: string; ate: string }>(); // período em que o valor vendido é contado
  const ehImportado = (c: Chamado) => !!(c.tratativa && c.tratativa.importado);
  // importados sem visita no mês: vendas da planilha sem visita e agendamentos na loja cuja visita foi no mês anterior
  const vendaSemVisita = (c: Chamado) => !!(c.tratativa && ((c.tratativa.importado && !c.tratativa.realizada) || c.tratativa.semVisita));
  const visitaFeita = (c: Chamado) => !vendaSemVisita(c) && !!((c.tratativa && c.tratativa.realizada) || c.dataLoja || c.venda);
  const compareceu = (c: Chamado) => !!c.venda || ["orcamento", "sem_resposta", "reprovado", "atendido"].includes(statusClienteDe(c));
  function funil(lista: Chamado[]) {
    const pct = cfg().comissaoPct;
    const L = lista.filter(c => !vendaSemVisita(c) && !soVenda.has(c)); // visitas/clientes: sem vendas sem visita e sem quem só comprou no período
    const LV = lista.filter(c => !vendaFora.has(c)); // vendas: só as do período
    const realizadas = L.filter(visitaFeita), agendadas = L.filter(c => !!c.dataLoja);
    const vieram = L.filter(compareceu), faltaram = L.filter(c => statusClienteDe(c) === "nao_compareceu");
    const vendas = LV.filter(c => vendaContaVolume(c.venda)), aConfirmar = LV.filter(c => c.venda && temPendenteGestao(c.venda));
    // valor: cada nº conta no mês em que foi efetivado (promissória paga conta no mês do pagamento)
    const pagsPer = (c: Chamado) => { const p = perVenda.get(c); return p ? pagamentosNoPeriodo(c.venda, p.de, p.ate) : pagamentosVenda(c.venda); };
    const valor = vendas.reduce((s, c) => s + (perVenda.has(c) || Array.isArray(c.venda.itens) ? pagsPer(c).reduce((x, p) => x + p.valor, 0) : parseMoeda(c.venda.valor)), 0);
    const comissao = LV.flatMap(pagsPer).reduce((s, p) => s + p.valor, 0) * pct / 100;
    // promissórias em aberto dos clientes do período (valor ainda a receber — comissão futura)
    const emPromissoria = LV.filter(c => c.venda && c.venda.status !== "cancelada" && valorPendente(c.venda) > 0);
    const valorPromissoria = emPromissoria.reduce((s, c) => s + valorPendente(c.venda), 0);
    const pendentes = lista.filter(c => c.setorDestino === "consultor_externo" && !(c.tratativa && c.tratativa.realizada));
    const taxa = (a: number, b: number) => b ? Math.round(a / b * 100) : null;
    return { total: L.length, realizadas: realizadas.length, agendadas: agendadas.length, vieram: vieram.length, faltaram: faltaram.length,
      vendas: vendas.length, aConfirmar: aConfirmar.length, valor, comissao, pendentes: pendentes.length,
      emPromissoria: emPromissoria.length, valorPromissoria, listaPromissoria: emPromissoria,
      pPresenca: taxa(vieram.length, realizadas.length), pVisitaVenda: taxa(vendas.length, realizadas.length), pLojaVenda: taxa(vendas.length, vieram.length) };
  }
  const ancoraVisita = (c: Chamado) => c.dataVisita || c.criadoEm;
  // clientes do consultor no período: visitas pela data da visita; vendas pelo mês de competência (aprovação).
  // Quem foi visitado em outro período mas comprou neste entra só como venda; quem comprou fora do período não conta a venda aqui.
  const clientesConsultor = (uid: string, de: string, ate: string) => {
    const todos = !de && !ate;
    return state.chamados.filter(c => {
      if (!(domMarketing(c) && !ehDireto(c) && c.consultorId === uid)) return false;
      const visNoPer = todos || dentroPeriodo(ancoraVisita(c), de, ate);
      const vendaNoPer = !!c.venda && (todos || (vendaContaVolume(c.venda) ? pagamentosNoPeriodo(c.venda, de, ate).length > 0 : dentroPeriodo(c.venda.dataVenda || c.venda.quando, de, ate)));
      if (todos) perVenda.delete(c); else perVenda.set(c, { de, ate });
      if (!visNoPer && !vendaNoPer) return false;
      if (visNoPer) soVenda.delete(c); else soVenda.add(c);
      if (c.venda && !vendaNoPer) vendaFora.add(c); else vendaFora.delete(c);
      return true;
    });
  };
  const funilConsultor = (uid: string, de: string, ate: string) => funil(clientesConsultor(uid, de, ate));

  // ---------- prioridade única por chamado (cada chamado cai em UMA faixa, sem duplicidade) ----------
  // call center: crítico (+24h vencido) > atrasado (vencido até 24h) > urgente (marcado, ainda no prazo) > perto (vence em 24h) > ok > respondida > concluída
  function prioridade(c: Chamado): string {
    if (domMarketing(c)) {
      const sc = statusClienteDe(c);
      if (statusFinalCliente.includes(sc)) return "concluida";
      return clienteCriticoInatividade(c) ? "critico" : "ok";
    }
    const sp = situacaoPrazo(c); // critico | atrasado | perto | ok | respondida | concluida
    if (sp === "critico" || sp === "atrasado" || sp === "respondida" || sp === "informar" || sp === "concluida") return sp;
    if (c.urgente) return "urgente";
    return sp;
  }
  const RANK: Record<string, number> = { critico: 0, atrasado: 1, urgente: 2, informar: 3, perto: 4, ok: 5, respondida: 6, concluida: 7 };
  const emAberto = (c: Chamado) => prioridade(c) !== "concluida";
  function ordenar(arr: Chamado[]) {
    if (ehConsultorExterno() && !ehGestao()) {
      return arr.sort((a, b) => {
        const fa = a.status === "concluida" ? 1 : 0, fb = b.status === "concluida" ? 1 : 0;
        if (fa !== fb) return fa - fb;
        const da = a.dataVisita ? +parseData(a.dataVisita) : Infinity, db = b.dataVisita ? +parseData(b.dataVisita) : Infinity;
        if (da !== db) return da - db;
        return +new Date(a.criadoEm) - +new Date(b.criadoEm);
      });
    }
    return arr.sort((a, b) => {
      const pa = RANK[prioridade(a)], pb = RANK[prioridade(b)];
      if (pa !== pb) return pa - pb;
      if (pa === RANK.concluida) return +new Date(b.criadoEm) - +new Date(a.criadoEm); // encerrados: mais recentes primeiro
      if (domMarketing(a) && domMarketing(b)) return +ultimaAtividade(a) - +ultimaAtividade(b); // mais tempo parado primeiro
      const sa = +new Date(a.slaResposta || a.criadoEm), sb = +new Date(b.slaResposta || b.criadoEm);
      if (sa !== sb) return sa - sb; // prazo que vence antes primeiro
      return +new Date(a.criadoEm) - +new Date(b.criadoEm);
    });
  }

  // mensagens de WhatsApp
  function msgWhats(c: Chamado) {
    const rep = getRep(c), u = me(); const L: string[] = [];
    L.push(`Olá${rep ? ", " + rep.nome : ""}! Aqui é ${u ? u.nome : ""} da Aliança Móveis.`); L.push("");
    L.push("Preciso de um retorno sobre este pedido:");
    L.push(`• Cliente: ${c.cliente}${c.clienteDoc ? " (" + c.clienteDoc + ")" : ""}`); L.push(`• Produto: ${c.produto}`); L.push(`• Pedido de venda: ${c.pedido}`);
    if (c.pedidoFabrica) L.push(`• Nosso pedido na fábrica: ${c.pedidoFabrica}`);
    if (c.prazoTatico) L.push(`• Prazo previsto (Tático): ${fmtDate(c.prazoTatico)}`);
    L.push(""); L.push(`Assunto (${tipoNome(c.tipo)}): ${c.motivo}`); L.push(""); L.push("Poderia nos passar uma previsão atualizada? Obrigado!");
    return L.join("\n");
  }
  function waLink(c: Chamado) { const rep = getRep(c); if (!rep) return ""; const n = sanitizeWhats(rep.whats); return n ? `https://wa.me/${n}?text=${encodeURIComponent(msgWhats(c))}` : ""; }
  const dh = (v: any) => fmtDiaHora(v).replace(", ", " às ");
  function msgWhatsConsultor(c: Chamado) {
    const u = me(); const L: string[] = [];
    L.push(`Olá, ${primeiroNome(c.cliente)}! Sou o(a) ${nomeNatural(u ? u.nome : "")}, consultor(a) externo(a) da Aliança Móveis.`); L.push("");
    const dv = c.dataVisita ? dh(c.dataVisita) : null;
    if (dv && c.endereco) L.push(`Estou confirmando que no dia ${dv}, estarei no endereço ${c.endereco}, conforme combinado${c.produto ? ", para tratarmos do projeto de " + c.produto : ""}.`);
    else if (dv) L.push(`Estou confirmando nossa visita no dia ${dv}${c.produto ? " para tratarmos do projeto de " + c.produto : ""}.`);
    else L.push(`Estou entrando em contato sobre a visita${c.produto ? " para o projeto de " + c.produto : ""}.`);
    L.push(""); L.push("Da minha parte está tudo certo — estarei aí no dia e horário marcado!");
    return L.join("\n");
  }
  function msgWhatsProjetista(c: Chamado) {
    const u = me(); const L: string[] = [];
    L.push(`Olá, ${primeiroNome(c.cliente)}! Sou ${nomeNatural(u ? u.nome : "")}, vendedor(a) da Aliança Móveis.`); L.push("");
    const dl = c.dataLoja ? dh(c.dataLoja) : null;
    if (dl) L.push(`Já está tudo certo para o nosso atendimento no dia ${dl}, aqui na loja.`); else L.push("Já está tudo certo para o seu atendimento aqui na loja.");
    L.push(""); L.push("Ao chegar na loja, pode procurar por mim."); L.push(""); L.push("Te aguardo!");
    return L.join("\n");
  }
  function msgWhatsGenerica(c: Chamado) {
    const u = me(); const L: string[] = [];
    L.push(`Olá, ${primeiroNome(c.cliente)}! Aqui é ${u ? nomeNatural(u.nome) : ""}, da Aliança Móveis.`); L.push("");
    L.push(`Estou entrando em contato sobre o seu interesse${c.produto ? " em " + c.produto : " em nossos móveis planejados"}.`); L.push(""); L.push("Podemos conversar?");
    return L.join("\n");
  }
  function msgWhatsSuporte(c: Chamado) {
    const u = me(); const L: string[] = [];
    const consultor = c.consultorId ? getUser(c.consultorId) : null, projetista = c.atendenteId ? getUser(c.atendenteId) : null;
    L.push(`Oi, ${primeiroNome(c.cliente)}! Aqui é ${nomeNatural(u ? u.nome : "")}, da Aliança Móveis.`); L.push("");
    L.push(consultor ? `${nomeNatural(consultor.nome)} já me passou aqui as informações do seu projeto${c.produto ? " de " + c.produto : ""}.` : `Já recebi aqui as informações do seu projeto${c.produto ? " de " + c.produto : ""}.`);
    if (projetista) L.push(`Estou te confirmando: ${nomeNatural(projetista.nome)} vai te atender pessoalmente.`);
    const dl = c.dataLoja ? dh(c.dataLoja) : null;
    if (dl) L.push(`Te aguardamos no dia ${dl}, aqui na loja.`);
    L.push(""); L.push("Já está tudo encaminhado e será um prazer te atender! Qualquer dúvida, pode me chamar por aqui.");
    return L.join("\n");
  }
  function waLinkCliente(c: Chamado) {
    const n = sanitizeWhats(c.telefone); if (!n) return "";
    const u = me();
    const souProjetista = u && c.atendenteId === u.id, souConsultor = u && c.consultorId === u.id;
    const souSuporte = u && (u.setores || []).includes("suporte_consultores");
    let msg;
    if (souSuporte) msg = msgWhatsSuporte(c);
    else if (souProjetista || (!souConsultor && c.dataLoja && ["agendado_loja", "com_vendedor"].includes(statusClienteDe(c)))) msg = msgWhatsProjetista(c);
    else if (souConsultor || c.dataVisita) msg = msgWhatsConsultor(c);
    else msg = msgWhatsGenerica(c);
    return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
  }
  const mapsLink = (c: Chamado) => c.endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.endereco)}` : "";
  const wazeLink = (c: Chamado) => c.endereco ? `https://waze.com/ul?q=${encodeURIComponent(c.endereco)}&navigate=yes` : "";

  // pendências
  function pendenciasGestao() {
    const vendasConfirmar = state.chamados.filter(c => c.venda && temPendenteGestao(c.venda));
    const promissorias = state.chamados.filter(c => c.venda && c.venda.status !== "cancelada" && promAbertas(c.venda).length > 0);
    const transferencias = state.chamados.filter(c => c.transferencia && c.transferencia.status === "pendente");
    return { vendasConfirmar, promissorias, transferencias, total: vendasConfirmar.length + promissorias.length + transferencias.length };
  }
  const pendentesDirecionamento = () => state.chamados.filter(c => domMarketing(c) && c.setorDestino === "marketing_supervisao" && podeVer(c));

  function minhasPendencias() {
    const eu = currentUserId; const G: any[] = [];
    if (ehProprietario()) return { grupos: [], total: 0 };
    const add = (chave: string, titulo: string, desc: string, itens: Chamado[], cor: string) => { if (itens.length) G.push({ chave, titulo, desc, itens, cor }); };
    const agora = new Date();
    const ch = state.chamados;
    add("aceite", "Aguardando seu aceite", "Outro vendedor indicou você para assumir estes clientes.", ch.filter(c => c.transferencia && c.transferencia.status === "pendente" && c.transferencia.para === eu), "var(--primary)");
    add("pedi", "Suas solicitações de transferência", "Aguardando o aceite do outro vendedor ou aprovação.", ch.filter(c => c.transferencia && c.transferencia.status === "pendente" && c.transferencia.solicitadoPor === eu && c.transferencia.para !== eu), "var(--ink-faint)");
    add("cobrado", "Parecer cobrado pelo Suporte", "Atualize o status do atendimento e escreva o parecer.", ch.filter(c => c.atendenteId === eu && parecerCobrado(c)), "var(--danger)");
    add("darparecer", "Clientes que já vieram — falta seu parecer", "O horário na loja já passou. Registre o status: orçamento, sem resposta, reprovado, reagendado, não compareceu ou venda.", ch.filter(c => c.atendenteId === eu && semParecer(c)), "var(--warn)");
    add("meusclientes", "Seus clientes na loja", "Clientes definidos para você que ainda não tiveram desfecho registrado.", ch.filter(c => c.atendenteId === eu && EM_ATENDIMENTO.includes(statusClienteDe(c)) && !c.venda), "var(--st-respondida)");
    add("devolvido", "Vendas canceladas pela Gestão", "O cliente voltou para você. Verifique e registre novamente, se for o caso.", ch.filter(c => c.atendenteId === eu && c.venda && c.venda.status === "cancelada"), "var(--danger)");
    const semAtualizacaoMkt = ch.filter(c => {
      if (!clienteCriticoInatividade(c)) return false;
      const souResponsavel = c.consultorId === eu || c.atendenteId === eu;
      return souResponsavel || ehGestao() || temMarketing() || mySetores().includes("suporte_consultores");
    });
    add("semAtualizacaoMkt", "Sem atualização há mais de " + LIMITE_INATIVIDADE_H + "h", "Nenhuma ação registrada neste cliente. Continua pendente até alguém atualizar — vendedor, consultor, Gestão, Supervisão ou Suporte.", semAtualizacaoMkt, "var(--critico)");
    add("semcontato", "Visitas sem contato iniciado", "Você ainda não registrou contato com estes clientes.", ch.filter(c => c.consultorId === eu && c.setorDestino === "consultor_externo" && !(c.tratativa && c.tratativa.contatoIniciado)), "var(--warn)");
    add("agendarloja", "Visitas feitas — falta agendar a loja", "Registre a data em que o cliente virá à loja para encaminhar ao Suporte.", ch.filter(c => c.consultorId === eu && c.setorDestino === "consultor_externo" && c.tratativa && c.tratativa.realizada && !c.dataLoja), "var(--st-respondida)");
    add("visitaatrasada", "Visitas com data vencida", "A data da visita já passou e ela não foi marcada como realizada.", ch.filter(c => c.consultorId === eu && c.dataVisita && parseData(c.dataVisita) < agora && !(c.tratativa && c.tratativa.realizada) && c.setorDestino === "consultor_externo"), "var(--danger)");
    if (ehGestao()) {
      const p = pendenciasGestao();
      add("apvendas", "Vendas a confirmar", "Decida se a venda é efetivada, promissória ou cancelada.", p.vendasConfirmar, "var(--warn)");
      add("appromis", "Promissórias em aberto", "Contam como venda, mas a comissão dessa parte só sai quando forem pagas.", p.promissorias, "var(--st-tratativa)");
      add("aptransf", "Transferências a decidir", "Pedidos entre vendedores aguardando sua aprovação.", p.transferencias.filter(c => c.transferencia.para !== eu), "var(--primary)");
    }
    if (temMarketing()) add("direcionar", "Clientes sem consultor", "Aguardando você designar um consultor externo.", ch.filter(c => domMarketing(c) && c.setorDestino === "marketing_supervisao" && podeVer(c)), "var(--st-aberta)");
    if (mySetores().includes("suporte_consultores") || temMarketing()) {
      add("pedidoatend", "Vendedor pediu para atender", "Um vendedor informou que está atendendo o cliente. Aprove ou recuse na tela Definir vendedor.", ch.filter(c => domMarketing(c) && c.setorDestino === "suporte_consultores" && !c.atendenteId && c.tratativa && c.tratativa.pedidoAtend), "var(--primary)");
      add("designar", "Clientes sem vendedor", "Já têm data na loja, mas ninguém foi definido para atender. Use a tela Definir vendedor.", ch.filter(c => domMarketing(c) && c.setorDestino === "suporte_consultores" && !c.atendenteId && souRespLoja(c)), "var(--warn)");
      add("semparecer", "Sem parecer do vendedor", "O cliente já veio e o vendedor não registrou o resultado. Cobre o parecer.", ch.filter(c => semParecer(c) && souRespLoja(c)), "var(--danger)");
    }
    add("retmont", "🔧 Retornos de montador para você", "O call center abriu um retorno do montador e escolheu você para tratar. Prioridade de atendimento.", ch.filter(c => c.tipo === "retorno_montador" && !["concluida", "respondida", "informar"].includes(c.status) && ((c as any).tratativa?.retorno?.atendenteId === eu)), "var(--critico)");
    add("errovend", "🚨 Erros de venda para você", "O call center registrou um erro na sua venda. Abra, corrija e escreva o que foi feito.", ch.filter(c => c.tipo === "erro_venda" && c.status !== "concluida" && (c as any).tratativa?.erroVenda?.vendedorId === eu && !((c as any).tratativa?.erroVenda?.respostas || []).length), "var(--critico)");
    if (mySetores().includes("supervisao")) {
      add("desmont", "🛋 Desmontagem de estofado", "Encaminhe para a Tatiana (depósito → Valdir, estofador), marque \"enviada ao estofador\" e finalize.", ch.filter(c => c.tipo === "desmontagem_estofado" && c.status !== "concluida"), "var(--warn)");
      add("errovsup", "⚠️ Erros de venda", "Informe o vendedor e acompanhe a tratativa dele. Quando estiver resolvido, finalize.", ch.filter(c => c.tipo === "erro_venda" && c.status !== "concluida"), "var(--critico)");
    }
    if (ehGestao() || mySetores().includes("supervisao")) add("acomp", "🚨 Pedidos de acompanhamento", "O call center chamou a supervisão para estes chamados. Abra e marque \"Estou acompanhando\".", ch.filter(c => acompAtivo(c)), "var(--critico)");
    if (ehSupMedidas()) {
      add("medalerta", "⚠️ Checklist em até 3 dias sem medida aprovada", "O checklist está chegando e a medida desta venda ainda não foi aprovada. Aprove, direcione a medição ou avise o checklist.", ch.filter(c => c.tipo === "checklist" && c.status !== "concluida" && (c as any).tratativa?.checklist?.etapa === "agendado" && (() => { const d = String((c as any).tratativa.checklist.agendadoPara || "").slice(0, 10), h = hojeISO(); const lim = new Date(); lim.setDate(lim.getDate() + 3); return d >= h && d <= isoLocal(lim).slice(0, 10); })() && !ch.some(m => m.tipo === "medidas" && m.pedido === c.pedido && etapaMedida(m) === "liberada")), "var(--critico)");
      add("medvalidar", "📐 Medidas para aprovar", "Medidas feitas pelos medidores/consultores ou que vieram do cruzamento com o Minha Visita. Se estiverem certas, aprove como medida oficial; se não, peça para refazer.", ch.filter(c => c.tipo === "medidas" && c.status !== "concluida" && ["validar", "realizada"].includes(etapaMedida(c))), "var(--primary)");
    }
    add("medfazer", "📐 Medidas a fazer (R$ 40 por cliente · sem comissão)", "Medições direcionadas para você — não é visita de venda. Depois de medir, anexe as fotos/planta e marque como realizada.", ch.filter(c => c.tipo === "medidas" && c.medidorId === eu && etapaMedida(c) === "agendada"), "var(--warn)");
    add("informar", "Informar o cliente", "O setor registrou a solução mas não fala com o cliente. Avise o cliente e conclua.", ch.filter(c => doCC(c) && c.status === "informar" && (ehCallcenter() || c.solicitanteId === eu)), "var(--st-informar)");
    add("criticos", "Críticos no seu setor", "Mais de 24h sem resposta — precisam de ação imediata.", ch.filter(c => doCC(c) && mySetores().includes(c.setorDestino) && situacaoPrazo(c) === "critico"), "var(--critico)");
    add("meusatrasados", "Chamados que você abriu e estão atrasados", "O setor responsável ainda não respondeu dentro do prazo.", ch.filter(c => doCC(c) && c.solicitanteId === eu && estaAtrasado(c)), "var(--danger)");
    add("responder", "Respondidos — conclua o atendimento", "Seu setor registrou a solução. Confirme com o cliente e conclua.", ch.filter(c => doCC(c) && mySetores().includes(c.setorDestino) && c.status === "respondida"), "var(--st-respondida)");
    // cada chamado aparece em uma só pendência: a de maior gravidade vence (sem contar duas vezes)
    const PRIORIDADE = ["retmont", "acomp", "medalerta", "medvalidar", "medfazer", "cobrado", "aceite", "apvendas", "aptransf", "appromis", "informar", "semparecer", "darparecer", "pedidoatend", "semAtualizacaoMkt", "criticos", "visitaatrasada", "devolvido", "meusatrasados", "responder", "designar", "direcionar", "agendarloja", "semcontato", "meusclientes", "pedi"];
    const dono: Record<string, string> = {};
    [...G].sort((a, b) => { const ia = PRIORIDADE.indexOf(a.chave), ib = PRIORIDADE.indexOf(b.chave); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); })
      .forEach(g => g.itens.forEach((c: Chamado) => { if (!dono[c.id]) dono[c.id] = g.chave; }));
    const grupos = G.map(g => ({ ...g, itens: g.itens.filter((c: Chamado) => dono[c.id] === g.chave) })).filter(g => g.itens.length);
    const total = grupos.reduce((s, g) => s + g.itens.length, 0);
    return { grupos, total };
  }

  function statsPessoa(uid: string, ehVend: boolean) {
    const meus = state.chamados.filter(c => domMarketing(c) && (ehVend ? c.atendenteId === uid : c.consultorId === uid));
    const ativos = meus.filter(c => ["aguardando_consultor", "direcionado_consultor", "visita_realizada", "agendado_loja", ...EM_ATENDIMENTO].includes(statusClienteDe(c))).length;
    const vend = meus.filter(c => vendaContaVolume(c.venda));
    const total = vend.reduce((s, c) => s + parseMoeda(c.venda.valor), 0);
    // conversão: vendas ÷ clientes já decididos (vendidos + os que não compraram)
    const fechados = meus.filter(c => vendaContaVolume(c.venda) || ["nao_compareceu", "venda_cancelada", "reprovado", "atendido"].includes(statusClienteDe(c))).length;
    const conv = fechados ? Math.round(vend.length / fechados * 100) : 0;
    return { meus, ativos, vendas: vend.length, total, conv };
  }

  function menuPerfil() {
    const G: any[] = [];
    // quem define vendedor (Suporte, Supervisão Marketing, Gerente de Loja) tem a tela logo abaixo das pendências
    // Gestão e Supervisão Marketing: as atividades do dia a dia ficam juntas no "Pessoal" (não se perdem no menu)
    const coord = (ehGestao() && !ehProprietario()) || mySetores().includes("marketing_supervisao");
    const defineVend = coord || mySetores().includes("suporte_consultores") || temMarketing();
    const pessoal: string[][] = ehProprietario() ? [["dashboard", "Painel do dono"]] : [["dashboard", "Dashboard"], ["pendencias", "Minhas pendências"]];
    if (!ehProprietario()) {
      if (ehGestao()) pessoal.push(["aprovacoes", "Aprovações (vendas e transferências)"]);
      if (defineVend) pessoal.push(["definir", "Definir vendedor"]);
      if (coord) pessoal.push(["direcionamento", "Direcionar consultor"]);
      if (coord) pessoal.push(["produtividade", "Produtividade e pagamento"]);
    }
    G.push({ g: "Pessoal", ic: "◆", itens: pessoal });
    const temCC = mySetores().some((x: string) => !ehSetorMarketing(x) && !["supervisao", "gestao"].includes(x));
    const temMkt = mySetores().some((x: string) => ehSetorMarketing(x));
    const cc: string[][] = [];
    if (podeCriarCC()) cc.push(["nova", "Nova solicitação"]);
    if (verTudo()) cc.push(["fila", "Acompanhamento"]); else if (temCC) cc.push(["fila", "Minha fila"]);
    if (cc.length) { cc.push(["consulta", "Consulta"]); if (podeTreinamento()) cc.push(["treino", "Treinamento"]); G.push({ g: "Call center", ic: "☎", itens: cc }); }
    const mk: string[][] = []; let soMeusClientes = false;
    if (podeCriarMkt()) mk.push(["novocli", "Novo cliente"]);
    if (temMarketing() || ehGestao()) {
      mk.push(["acompmkt", "Acompanhamento"]);
      if (ehProprietario()) mk.push(["definir", "Definir vendedor"]);
      if (!coord) mk.push(["direcionamento", "Direcionar consultor"]);
      mk.push(["agenda", "Agendamento loja"], ["operadoras", "Controle das operadoras"]);
      if (!coord) mk.push(["produtividade", "Produtividade e pagamento"]);
      mk.push(["clientes", "Clientes"], ["vendedores", "Vendedores"], ["consultores", "Consultores externos"]);
    } else if (temMkt) {
      // consultor e vendedor (só esse papel no marketing): menu enxuto — "Meus clientes" já tem busca, status, período e cancelamentos
      soMeusClientes = (ehConsultorExterno() || mySetores().includes("atendente_cliente")) && !mySetores().some((x: string) => ["suporte_consultores", "marketing_operadora"].includes(x));
      // consultor e vendedor: "Minha fila" e "Minha carteira" viraram uma tela só ("Meus clientes"), com filtros
      if (ehConsultorExterno() || mySetores().includes("atendente_cliente")) mk.push(["carteira", "Meus clientes"], ["agenda", "Agendamento loja"]);
      else mk.push(["acompmkt", "Minha fila"], ["carteira", "Minha carteira"], ["agenda", "Agendamento loja"]);
      if (mySetores().includes("suporte_consultores")) mk.push(["vendedores", "Vendedores"]);
      if (!soMeusClientes) mk.push(["clientes", "Clientes"]);
      if (mySetores().includes("marketing_operadora")) mk.push(["produtividade", "Minha produtividade"]);
    }
    if (mk.length) { if (!cc.length && !soMeusClientes) mk.push(["consulta", "Consulta"]); G.push({ g: temMkt && !temMarketing() && !ehGestao() ? "Minha operação" : "Marketing", ic: "◎", itens: mk }); }
    const ge: string[][] = [];
    const ehProjetista = mySetores().includes("atendente_cliente");
    if (ehConsultorExterno() || ehMedidor() || ehGestao() || ehProjetista || mySetores().includes("suporte_consultores")) ge.push(["financeiro", ehGestao() ? "Financeiro" : ehConsultorExterno() ? "Vendas e comissão" : ehMedidor() ? "Minhas medidas e reembolsos" : ehProjetista ? "Minhas vendas" : "Vendas dos vendedores"]);
    if (verTudo()) ge.push(["relatorios", "Relatórios"]);
    if (verTudo() || temMarketing()) ge.push(["atividades", "Controle de atividades"]);
    if (ge.length) G.push({ g: (ehConsultorExterno() || ehMedidor()) && !ehGestao() ? "Meu financeiro" : "Gestão", ic: "▣", itens: ge });
    // Pós-venda Projetados: grupo próprio (Vânia, Jurídico e Gestão)
    const pv: string[][] = [];
    if (ehPosvenda() || ehGestao()) pv.push(["novopv_cli", "Nova solicitação do cliente"], ["novopv_mont", "Nova solicitação do montador"]);
    if (podeVerPosvenda()) pv.push(["pv_clientes", "Solicitações de clientes"], ["pv_montadores", "Solicitações de montadores"], ["pv_numeros", "Números"]);
    if (pv.length) G.splice(G.findIndex(g => g.g === "Gestão") >= 0 ? G.findIndex(g => g.g === "Gestão") : G.length, 0, { g: "Pós-venda", ic: "✚", itens: pv });
    if (podeChecklist()) G.splice(G.findIndex(g => g.g === "Gestão") >= 0 ? G.findIndex(g => g.g === "Gestão") : G.length, 0, { g: "Checklist", ic: "✓", itens: [["ck_agendar", "A agendar"], ["ck_aguardando", "Aguardando"], ["ck_agendados", "Agendados"], ["ck_confirmar", "Confirmação de presença"], ["ck_agenda", "Agenda"]] });
    // Medidas: cruzamento Minha Visita × Exact (Gestão e Supervisão de Medidas)
    if (ehSupMedidas()) G.splice(G.findIndex(g => g.g === "Gestão") >= 0 ? G.findIndex(g => g.g === "Gestão") : G.length, 0, { g: "Medidas", ic: "📐", itens: [["md_pendentes", "Pendentes para medir"], ["md_agendadas", "Aguardando medição"], ["md_analise", "Aguardando análise"], ["md_aprovados", "Aprovados"], ["md_obra", "Em obra"], ["md_cruzar", "Cruzar Minha Visita × Exact"], ["md_resultados", "Resultado dos cruzamentos"]] });
    // consultor externo e medidor: as medidas deles separadas das visitas de venda (medida paga R$ 40, sem comissão)
    else if (ehMedidor() || ehConsultorExterno()) G.splice(G.findIndex(g => g.g === "Meu financeiro") >= 0 ? G.findIndex(g => g.g === "Meu financeiro") : G.length, 0, { g: "Minhas medidas", ic: "📐", itens: [["md_minhas", "Medidas para fazer"]] });
    if (podeEncontrarVendas()) G.splice(G.findIndex(g => g.g === "Gestão") >= 0 ? G.findIndex(g => g.g === "Gestão") : G.length, 0, { g: "Encontrar vendas", ic: "🔎", itens: [["encontrar_vendas", "Encontrar vendas"]] });
    const cd: string[][] = [];
    if (temCadastros()) cd.push(["cadastros", "Fábricas"]);
    if (podeMontadores()) cd.push(["pv_cadastro", "Montadores"]);
    if (ehGestao()) cd.push(["admin", "Administração"]);
    if (cd.length) G.push({ g: "Cadastros", ic: "⚙", itens: cd });
    return G;
  }

  return {
    acompAtivo, podeMudarDataVisita, podeEditarCliente, ehProspeccao, gerentesVenda, ehProprietario, ehMedidor, ehSupMedidas, podeEncontrarVendas, etapaMedida, quemMede, medidasDe, reembolsosDe, state, TIPOS, currentUserId, getSetor, setorNome, destinoDe, tipoNome, getUser, me, mySetores, temLib, setoresLabel, getFab, getRep, nomeFab, nomeUser,
    verTudo, ehGestao, temCadastros, doCC, prioridade, emAberto, naMinhaFila, ehCallcenter, viaCC, ehFabrica, podeTreinamento, podeAcompanhar, temMarketing, ehSetorMarketing, domMarketing, statusClienteDe, ultimaAtividade, horasSemAtualizar,
    clienteCriticoInatividade, podeVer, podeTratar, podeAnexar, podeCriarTipo, podeCriarCC, podeCriarMkt, operacionais, setoresVisiveis,
    funil, funilConsultor, clientesConsultor, visitaFeita, ehImportado, compareceu, ancoraVisita,
    ehDireto, origemLoja, semAnexo, semParecer, parecerCobrado, souRespLoja, vendedores: projetistas, dispVendedor,
    podeVerValor, ehConsultorExterno, ehPosvenda, podeVerPosvenda, podeMontadores, responsaveisChecklist, medidores, nomeMontador, podeEditarAgenda, podeMudarDataLoja, consultores, projetistas, cfg, extratoConsultor, dentroPeriodo,
    podeChecklist, ordenar, waLink, waLinkCliente, mapsLink, wazeLink, pendenciasGestao, pendentesDirecionamento, minhasPendencias, statsPessoa, menuPerfil,
  };
}
export type Regras = ReturnType<typeof criarRegras>;
