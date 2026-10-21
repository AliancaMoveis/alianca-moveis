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
  em_obras: "Em obras", standby: "Standby", em_analise: "Em análise", ausente_endereco: "Ausente no endereço", visita_cancelada: "Cancelou visita do consultor", loja_cancelada: "Cancelou visita na loja", atendido: "Atendimento finalizado", vendido_revisao: "Vendido — a confirmar",
  vendido_entrada: "Vendido — entrada + promissória", vendido_promissoria: "Vendido — 100% promissória", vendido: "Vendido — efetivado", venda_cancelada: "Venda cancelada", nao_compareceu: "Não compareceu",
};
// pareceres extras (menu "Mais opções")
export const SITUACOES_EXTRA = ["em_obras", "standby", "em_analise"];
export const SITUACOES_CONSULTOR = ["ausente_endereco", "visita_cancelada", "em_obras", "standby", "em_analise"];
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
/** setores que ganham menu próprio (o que o call center abre para eles vira a "Fila do setor") */
export const SETORES_MENU: [string, string, string][] = [["montagem", "Montagem", "🔧"], ["assistencia", "Assistência", "🛠"], ["prazo_fabrica", "Solicitação Fábrica", "🏭"]];
/** data que conta para filtros de período: venda → data da venda; senão loja, visita ou cadastro */
export function dataRefCliente(c: any): string {
  const v = c && c.venda ? String(c.venda.dataVendaReal || c.venda.dataVenda || c.venda.quando || "").slice(0, 10) : "";
  return v || String((c && (c.dataLoja || c.dataVisita || c.criadoEm)) || "").slice(0, 10);
}
/** primeiro e último dia do mês atual (padrão dos filtros de período) */
export function mesAtual(): { de: string; ate: string } {
  const h = new Date(); const p = (n: number) => String(n).padStart(2, "0");
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 0);
  return { de: h.getFullYear() + "-" + p(h.getMonth() + 1) + "-01", ate: fim.getFullYear() + "-" + p(fim.getMonth() + 1) + "-" + p(fim.getDate()) };
}
/** marca "litoral" do agendamento com consultor: pendente (aguarda a Supervisão Marketing), aprovado ou recusado */
export const litoralDe = (c: any): "" | "pendente" | "aprovado" | "recusado" => (c && c.tratativa && c.tratativa.litoral && c.tratativa.litoral.status) || "";
export const LITORAL_TXT: Record<string, string> = { pendente: "🏖 Litoral — aguarda aprovação", aprovado: "🏖 Litoral aprovado", recusado: "🏖 Litoral recusado" };
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
/** texto para o WhatsApp sem emojis: em alguns celulares/computadores o emoji que vai pelo link chega como "�" para o cliente */
export const semEmoji = (t: string) => String(t || "").replace(/[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}][\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]* ?/gu, "").replace(/[\u{FE0F}\u{200D}]/gu, "").replace(/[ \t]+\n/g, "\n").replace(/[ \t]+$/g, "");
/** link do WhatsApp com o texto já pronto (sem emojis) */
export const waTexto = (numero: string, texto = "") => "https://wa.me/" + numero + (texto ? "?text=" + encodeURIComponent(semEmoji(texto)) : "");
/** link do WhatsApp: número com DDD (sem 55 → acrescenta) */
export const linkWhats = (tel: string, texto = "") => { let d = String(tel || "").replace(/\D/g, ""); if (d.length < 10) return ""; if (!d.startsWith("55") || d.length <= 11) d = "55" + d; return waTexto(d, texto); };
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
/** vendedor de férias num dia (AAAA-MM-DD) — devolve o texto "férias até DD/MM" ou "" */
// folga no dia (mesma regra do banco, _vend_folga_em): troca do dia > domingo do rodízio (trabalha 2, folga 1) >
// folga da semana — que só vale na semana (seg–dom) em que ele trabalha o domingo
const diasEntre = (a: string, b: string) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 864e5);
const somaDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const domingoDeFolga = (u: any, dom: string, dias?: Record<string, string>) => { const ex = dias && dias[dom]; if (ex) return ex === "folga"; return !!u.domingoRef && ((diasEntre(dom, u.domingoRef) % 21) + 21) % 21 === 0; };
export function folgaEm(u: any, dia: string, dias?: Record<string, string>): boolean {
  if (!u) return false;
  const ex = dias && dias[dia]; if (ex) return ex === "folga";
  const dow = new Date(dia + "T12:00:00Z").getUTCDay();
  if (dow === 0) return domingoDeFolga(u, dia, dias);
  if (u.folga === null || u.folga === undefined || dow !== u.folga) return false;
  if (!u.domingoRef) return true;
  return !domingoDeFolga(u, somaDias(dia, 7 - dow), dias);
}
export const fimDeSemana = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
export const feriasEm = (u: any, dia: string) => u && u.feriasAte && dia <= u.feriasAte && dia >= (u.feriasDe || dia) ? "férias até " + u.feriasAte.slice(8, 10) + "/" + u.feriasAte.slice(5, 7) : "";
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
export const enderecoSemTelefone = (e: string) => String(e || "")
  .replace(/(?:tel(?:efone)?|fone|cel(?:ular)?|whats(?:app)?)\s*[:.]?\s*/gi, " ")
  .replace(/(?:\+?55\s*)?\(?\b\d{2}\)?[\s.-]*9?\s?\d{4}[\s.-]?\d{4}\b/g, " ")
  .replace(/\s*[-–,;|/]\s*(?=[-–,;|/])/g, "").replace(/^[\s,;|/–-]+|[\s,;|/–-]+$/g, "").replace(/\s{2,}/g, " ").trim();
export function criarRegras(state: Estado, currentUserId: string) {
  const TIPOS = state.tipos;
  const getSetor = (id: string) => (state.setores || []).find(x => x.id === id) || null;
  const setorNome = (id: string) => { const s = getSetor(id); return s ? s.nome : (id || "—"); };
  const destinoDe = (tipo: string) => (TIPOS[tipo] ? TIPOS[tipo].destino : "");
  const tipoNome = (k: string) => (TIPOS[k] ? TIPOS[k].nome : (k || "—"));
  const getUser = (id: string): Usuario | null => state.usuarios.find(u => u.id === id) || null;
  const me = () => getUser(currentUserId);
  const mySetores = () => (me() || ({} as any)).setores || [];
  /** base de clientes (CPF, endereço, histórico de compras): Gestão, call center e supervisão — o banco confere o mesmo */
  const podeBaseClientes = () => ehGestao() || mySetores().includes("callcenter") || mySetores().includes("supervisao");
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
  const TIPOS_FORA_CC = ["checklist", "medidas", "posvenda", "juridico", "porta"];
  // cliente porta: entrou direto na loja (sem marketing e sem consultor externo) — registrado pela Confirmação de presença
  const ehPorta = (c: any) => !!c && c.tipo === "porta";
  // menus que a Gestão escondeu para a pessoa (ex.: Weverton: anuncios, presenca, consultores, clientes)
  const oculto = (k: string) => (((me() as any) || {}).menusOcultos || []).includes(k);
  const temPresenca = () => (ehGestao() || mySetores().includes("presenca")) && !oculto("presenca");
  // ▶️ iniciar atendimento na loja: o vendedor do cliente, a Confirmação de presença, o gerente ou a Gestão (com vendedor definido)
  const podeIniciarAtend = (c: any) => !!c && !!c.atendenteId && !c.venda && !(c.tratativa && c.tratativa.emAtendimento) && (domMarketing(c) || c.tipo === "porta")
    && !["vendido", "vendido_promissoria", "vendido_entrada", "vendido_revisao", "atendido", "venda_cancelada", "reprovado", "nao_compareceu", "loja_cancelada"].includes(String(c.statusCliente || ""))
    && (c.atendenteId === currentUserId || ehGestao() || mySetores().some((x: string) => x === "presenca" || x === "gerente_loja"));
  // ⭐ Pesquisa de satisfação: Gestão, donos, call center, supervisão e pós-venda (o banco confere: _ve_qualidade)
  const veQualidade = () => mySetores().some((x: string) => ["gestao", "proprietario", "callcenter", "supervisao", "posvenda"].includes(x));
  // 📣 Anúncios (Reportei): Gestão, proprietário e quem tem a permissão "anuncios" (ex.: Lucas Santana)
  const veAnuncios = () => mySetores().some((x: string) => ["gestao", "proprietario", "anuncios"].includes(x)) && !oculto("anuncios");
  const doCC = (c: Chamado) => !domMarketing(c) && !TIPOS_FORA_CC.includes(c.tipo);

  function normalizarStatusCliente(c: Chamado) {
    if (c.venda && c.venda.status) return VENDA_TO_CLIENTE[c.venda.status] || c.statusCliente;
    if (c.statusCliente === "nao_compareceu") return "nao_compareceu";
    if (c.setorDestino === "marketing_supervisao") return c.statusCliente === "visita_cancelada" ? "visita_cancelada" : "aguardando_consultor";
    if (c.setorDestino === "consultor_externo") return SITUACOES_CONSULTOR.includes(c.statusCliente) ? c.statusCliente : (c.tratativa && c.tratativa.realizada) ? "visita_realizada" : "direcionado_consultor";
    // agendado na loja: vale o status que a equipe escolheu (standby, em obras, orçamento…); sem escolha = agendado loja
    if (c.setorDestino === "suporte_consultores") return ["orcamento", "sem_resposta", "reagendado", "reprovado", "atendido", "em_obras", "standby", "em_analise", "visita_cancelada", "loja_cancelada"].includes(c.statusCliente) ? c.statusCliente : "agendado_loja";
    if (c.setorDestino === "atendente_cliente") return ["orcamento", "sem_resposta", "reagendado", "reprovado", "atendido", "loja_cancelada", ...SITUACOES_EXTRA].includes(c.statusCliente) ? c.statusCliente : "com_vendedor";
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
    if (c.tipo === "juridico") return mySetores().includes("juridico"); // caso jurídico: só o Jurídico e a Gestão
    if (c.tipo === "porta") return mySetores().some((x: string) => x === "presenca" || x === "gerente_loja") || c.solicitanteId === currentUserId;
    if (domMarketing(c)) return temMarketing() || mySetores().includes("presenca") || !!(me() as any)?.editaAgenda || mySetores().includes("suporte_consultores") || mySetores().includes(c.setorDestino) || c.solicitanteId === currentUserId || (mySetores().includes("medidas_supervisao") && !!c.consultorId);
    if (verTudo()) return true;
    if (mySetores().includes("callcenter")) return true;
    // gerente de loja acompanha todo o call center (menos os setores com módulo próprio)
    if (mySetores().includes("gerente_loja") && !["checklist", "medidas", "posvenda"].includes(c.tipo)) return true;
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
    if (c.tipo === "porta") return mySetores().some((x: string) => x === "presenca" || x === "gerente_loja") || c.solicitanteId === currentUserId;
    if (domMarketing(c)) return temMarketing() || mySetores().some((x: string) => x === "suporte_consultores" || x === "presenca") || mySetores().includes(c.setorDestino);
    if (verTudo()) return true;
    return mySetores().includes(c.setorDestino) || (!!c.medidorId && c.medidorId === currentUserId);
  }
  function podeAnexar(c: Chamado) {
    if (ehGestao()) return true;
    if (domMarketing(c) || c.tipo === "porta") {
      if (mySetores().includes("atendente_cliente") && !mySetores().some((s: string) => ["marketing_supervisao", "suporte_consultores"].includes(s))) return false;
      // operadora do marketing anexa a qualquer momento nos clientes que cadastrou; a supervisão do marketing em todos
      if (c.solicitanteId === currentUserId || mySetores().includes("marketing_supervisao")) return true;
      return podeTratar(c);
    }
    return podeTratar(c) || temLib("criar");
  }
  const setoresCriaMkt = ["marketing_operadora", "marketing_supervisao", "consultor_externo"];
  const podeCriarTipo = (k: string) => {
    const t = TIPOS[k]; if (!t) return false;
    // ordem de medida: só o setor de Medidas (o call center abre "Solicitação de medidas")
    if (k === "medidas") return ehGestao() || mySetores().includes("medidas_supervisao");
    if (k === "juridico") return false; // caso jurídico abre pelo menu Jurídico
    if (k === "porta") return false; // cliente porta: só pela Confirmação de presença
    if (!temLib("criar")) return false;
    if (ehGestao()) return true;
    const ms = mySetores();
    if (t.presale) return ms.some((x: string) => setoresCriaMkt.includes(x));
    return ms.includes("gerente_loja") || ms.some((x: string) => !ehSetorMarketing(x));
  };
  const podeCriarCC = () => Object.keys(TIPOS).some(k => !TIPOS[k].presale && podeCriarTipo(k));
  const podeCriarMkt = () => Object.keys(TIPOS).some(k => TIPOS[k].presale && podeCriarTipo(k));
  const operacionais = () => (state.setores || []).filter(s => !(s.liberacoes && s.liberacoes.verTudo));
  // "presenca" e "anuncios" são permissões de acesso, não setores que recebem solicitações
  const SETORES_SO_ACESSO = ["presenca", "anuncios"];
  const setoresVisiveis = () => operacionais().filter(s => !SETORES_SO_ACESSO.includes(s.id) && (!ehSetorMarketing(s.id) || temMarketing() || ehGestao()));
  // gerente de loja não vê valores de venda (o banco também não devolve)
  /** remover anexo/foto: só quem anexou, a Gestão e as supervisões (o banco confere de novo) */
  // só quem enviou o anexo ou a Gestão; vendedor nunca apaga anexo (o banco confere igual)
  const podeRemoverAnexo = (a: any) => !!a && (ehGestao() || (!!a.criadoPor && a.criadoPor === currentUserId && !mySetores().includes("atendente_cliente")));
  const podeVerValor = (c: Chamado) => ehGestao() || (c.atendenteId && c.atendenteId === currentUserId) || (c.consultorId && c.consultorId === currentUserId);
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
  // edita a agenda da loja: Gestão, marketing, Suporte e quem tem a permissão avulsa (ex.: Camila no fim de semana)
  const podeEditarAgenda = () => ehGestao() || temMarketing() || mySetores().some((x: string) => x === "suporte_consultores" || x === "presenca") || !!(me() as any)?.editaAgenda;
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
  // marketing (direto na loja): só precisa definir vendedor quando o cliente quer projeto pronto (ou pediram vendedor); o resto vai para a fila automática
  const precisaDefinirVendedor = (c: Chamado) => !ehDireto(c) || !!(c.tratativa && (c.tratativa.querProjeto === "sim" || c.tratativa.pedeVendedor));
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
  // gerente de loja só (sem supervisão do marketing/suporte): app simplificado, sem as obrigações do marketing e dos consultores
  // operadora do marketing: não vê valores (comissão, bônus, a receber) — só o pagamento depois que a Supervisão aprova
  const ocultaValoresMkt = () => mySetores().includes("marketing_operadora") && !ehGestao() && !mySetores().some((x: string) => ["marketing_supervisao", "proprietario"].includes(x));
  const ehGerenteLoja = () => mySetores().includes("gerente_loja") && !ehGestao() && !mySetores().some((x: string) => ["marketing_supervisao", "suporte_consultores", "proprietario"].includes(x));
  const souRespLoja = (c: Chamado) => (mySetores().includes("suporte_consultores") && !ehDireto(c)) || (temMarketing() && ehDireto(c) && !ehGerenteLoja());
  // quem entra na agenda (definir vendedor, fila, chamar): sem os que estão "fora da agenda" (ex.: freelance)
  const cienteDe = (c: Chamado, sc: string) => !!(c.tratativa && c.tratativa["ciente_" + sc] && c.tratativa["ciente_" + sc][currentUserId]);
  // alguém da coordenação (Bruno, Haisla…) já marcou "Estou ciente": sai das listas de ação e fica só no status do cliente
  const alguemCiente = (c: Chamado, sc: string) => !!(c.tratativa && c.tratativa["ciente_" + sc] && Object.keys(c.tratativa["ciente_" + sc]).length);
  const cancelouSemCiente = (c: Chamado) => statusClienteDe(c) === "visita_cancelada" && !alguemCiente(c, "visita_cancelada");
  const vendAgenda = () => projetistas().filter((u: any) => u.naAgenda !== false);
  const folgaDia = (uid: string, dia: string) => folgaEm(getUser(uid), dia, (state.vendedorDias || {})[uid]);
  const projetistas = () => state.usuarios.filter(u => u.ativo && u.somenteAtribuidos && (u.setores || []).includes("atendente_cliente")).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  /** Disponibilidade do vendedor para atender um cliente na loja num horário (folga, turno, almoço e outro cliente a menos de 2h) */
  const dispVendedor = (uid: string, quando: string | null | undefined, exceto?: Chamado | null): string[] => {
    const u: any = getUser(uid); if (!u || !quando) return [];
    const d = new Date(quando); if (isNaN(d.getTime())) return [];
    const mot: string[] = []; const m = d.getHours() * 60 + d.getMinutes();
    const fe = feriasEm(u, isoLocal(d)); if (fe) mot.push("🏖 " + fe);
    if (folgaEm(u, isoLocal(d), (state.vendedorDias || {})[uid])) mot.push("folga (" + DIAS_SEMANA[d.getDay()] + ")");
    const tu = TURNOS[u.turno || ""];
    if (fimDeSemana(d)) { if (m < 540) mot.push("só entra às 9:00"); else if (m >= 1080) mot.push("sai às 18:00"); }
    else if (tu) {
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
  // Supervisão do call center (Salete): vê só o call center — nada do marketing nem das ações da Gestão
  const soCallCenter = () => mySetores().includes("supervisao") && !ehGestao() && !temMarketing();
  // ação registrada no histórico por alguém da Gestão/dono ou do marketing (escondida de quem é só call center)
  const acaoDeFora = (quem: string) => { const u = state.usuarios.find(x => x.nome === quem); return !!u && (u.setores || []).some((x: string) => x === "gestao" || x === "proprietario" || MARKETING_SETORES.includes(x)); };
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
    const ger = (c: Chamado) => !!(c.tratativa && (c.tratativa as any).porGerencia) && prioridade(c) !== "concluida" && prioridade(c) !== "respondida" ? 0 : 1;
    return arr.sort((a, b) => {
      const ga = ger(a), gb = ger(b);
      if (ga !== gb) return ga - gb; // solicitado pela gerência: sempre no topo enquanto aberto
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
  function waLink(c: Chamado) { const rep = getRep(c); if (!rep) return ""; const n = sanitizeWhats(rep.whats); return n ? waTexto(n, msgWhats(c)) : ""; }
  const dh = (v: any) => fmtDiaHora(v).replace(", ", " às ");
  // nome do cliente como se fala (RAMON → Ramon)
  const nomeCli = (n: string) => { const p = String(n || "").trim().split(/\s+/)[0] || ""; return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ""; };
  const endCli = (c: Chamado) => enderecoSemTelefone(c.endereco || "");
  // dia da semana + data + hora ("quinta, 22/10 às 14h")
  const diaHoraCli = (v: any) => { const d = parseData(v); const ds = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][d.getDay()];
    const hh = d.getHours(), mm = d.getMinutes(); return ds + ", " + String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + " às " + hh + "h" + (mm ? String(mm).padStart(2, "0") : ""); };
  // consultor externo: 1ª mensagem ao cliente do marketing — confirma que está tudo certo e pede um "sim"
  function msgWhatsConsultor(c: Chamado) {
    const u = me(); const L: string[] = [];
    const nome = nomeCli(c.cliente), proj = c.produto ? " do seu projeto de " + String(c.produto).trim().toLowerCase() : " do seu projeto";
    L.push(`Olá${nome ? ", " + nome : ""}! Tudo bem?`); L.push("");
    L.push(`Meu nome é ${nomeNatural(u ? u.nome : "")}, sou da equipe de consultores da Aliança Móveis. Está tudo certo para a nossa visita${proj}!`); L.push("");
    if (c.dataVisita) L.push(`*Data:* ${diaHoraCli(c.dataVisita)}`);
    const e = endCli(c);
    if (e) {
      L.push(`*Endereço:* ${e}`); L.push("");
      L.push("Pode me confirmar se o endereço está correto, com o bairro e a cidade? Se tiver complemento ou ponto de referência, me avise também.");
    } else { if (c.dataVisita) L.push(""); L.push("Pode me passar o endereço completo da visita, com rua, número, bairro e cidade?"); }
    L.push("");
    L.push("Na visita, vou conhecer os ambientes, tirar as medidas e entender o que você imagina para o projeto. Se tiver fotos, plantas ou referências de que gostou, pode separar que ajuda bastante."); L.push("");
    L.push(c.dataVisita ? "Posso confirmar a nossa visita?" : "Qual o melhor dia e horário para eu passar aí?");
    return L.join("\n");
  }
  // Setor de Medidas: ordem de medição direcionada ao consultor/medidor — sem horário: o cliente diz o melhor dia
  function msgWhatsMedida(c: Chamado) {
    const u = me(); const L: string[] = [];
    const nome = nomeCli(c.cliente);
    L.push(`Olá${nome ? ", " + nome : ""}! Tudo bem?`); L.push("");
    L.push(`Meu nome é ${nomeNatural(u ? u.nome : "")}, sou da equipe de consultores da Aliança Móveis e estarei com você na visita de medição técnica dos seus móveis.`); L.push("");
    const e = endCli(c);
    if (e) { L.push(`*Endereço:* ${e}`); L.push("Pode me confirmar se está certo, com o bairro e a cidade? Se tiver complemento (apto, bloco, casa dos fundos) ou um ponto de referência, me avise também."); }
    else L.push("Pode me passar o endereço completo, com rua, número, bairro e cidade?");
    // com data marcada: propõe o dia/horário e deixa o cliente ajustar; sem data: pergunta o melhor dia
    const dm = String(c.dataMedida || "").replace(" ", "T");
    if (dm.length >= 16) {
      const dia = dm.slice(0, 10), hj = hojeISO(), am = isoLocal(new Date(Date.now() + 864e5)).slice(0, 10);
      const DS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
      const quando = dia === hj ? "hoje" : dia === am ? "amanhã" : DS[parseData(dia + "T12:00").getDay()] + " (" + dia.slice(8, 10) + "/" + dia.slice(5, 7) + ")";
      const hh = Number(dm.slice(11, 13)), mm = dm.slice(14, 16);
      L.push(""); L.push(`*Horário:* consigo passar ${quando} às ${hh}h${mm !== "00" ? mm : ""}. Caso não seja possível, me avise outro dia ou horário que ajusto na minha rota.`); L.push("");
    } else { L.push(""); L.push("Qual o melhor dia e horário para fazermos a medição?"); L.push(""); }
    const amb = String(c.produto || "").split(/\s*(?:,|;|\+|\/|\s+e\s+)\s*/i).map(x => x.trim()).filter(Boolean).map(x => x.charAt(0).toUpperCase() + x.slice(1));
    if (amb.length) { L.push(`Nesta visita, iremos medir ${amb.length} ambiente${amb.length === 1 ? "" : "s"}, ${amb.length === 1 ? "sendo ele" : "sendo eles"}:`); amb.forEach(a => L.push("• " + a)); }
    else L.push("Nesta visita, iremos medir os ambientes do seu projeto.");
    L.push(""); L.push("Peço, se possível, que os ambientes estejam livres e acessíveis para uma medição tranquila."); L.push("");
    L.push("*Importante:* caso o imóvel ainda esteja em obra (piso, gesso ou revestimentos pendentes), me avise a previsão de término para evitarmos interferências na fabricação."); L.push("");
    L.push("Fico no aguardo para agendarmos!");
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
    // depois que o contato já foi feito (consultor: "Contato realizado" · vendedor: "Já estou em contato"), abre a conversa sem texto pronto
    const t: any = (c as any).tratativa || {};
    if ((souConsultor && t.contatoIniciado) || (souProjetista && t.emContato)) return `https://wa.me/${n}`;
    let msg;
    if (c.tipo === "medidas") msg = msgWhatsMedida(c);
    else if (souSuporte) msg = msgWhatsSuporte(c);
    else if (souProjetista || (!souConsultor && c.dataLoja && ["agendado_loja", "com_vendedor"].includes(statusClienteDe(c)))) msg = msgWhatsProjetista(c);
    else if (souConsultor || c.dataVisita) msg = msgWhatsConsultor(c);
    else msg = msgWhatsGenerica(c);
    return waTexto(n, msg);
  }
  // endereço para o Maps sem telefone no meio (às vezes o telefone foi digitado junto com o endereço)
  const mapsLink = (c: Chamado) => { const e = enderecoSemTelefone(c.endereco || ""); return e ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e)}` : ""; };
  const wazeLink = (c: Chamado) => c.endereco ? `https://waze.com/ul?q=${encodeURIComponent(enderecoSemTelefone(c.endereco))}&navigate=yes` : "";

  // pendências
  function pendenciasGestao() {
    const vendasConfirmar = state.chamados.filter(c => c.venda && temPendenteGestao(c.venda));
    const promissorias = state.chamados.filter(c => c.venda && c.venda.status !== "cancelada" && promAbertas(c.venda).length > 0);
    const transferencias = state.chamados.filter(c => c.transferencia && c.transferencia.status === "pendente");
    return { vendasConfirmar, promissorias, transferencias, total: vendasConfirmar.length + promissorias.length + transferencias.length };
  }
  // cancelou a visita e alguém já está ciente: não polui o "Direcionar consultor" (fica nos Clientes com o status "Cancelou visita do consultor")
  const pendentesDirecionamento = () => state.chamados.filter(c => domMarketing(c) && c.setorDestino === "marketing_supervisao" && podeVer(c) && !(statusClienteDe(c) === "visita_cancelada" && alguemCiente(c, "visita_cancelada")));

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
    // coordenação do marketing (Supervisão / Suporte): pendências contam a partir do início do uso (14/10/2026) —
    // o que é anterior ficou da migração e não vira pendência
    const MARCO = "2026-10-14";
    const recente = (c: Chamado) => [c.criadoEm, c.dataLoja, c.dataVisita].some((x: any) => !!x && String(x).slice(0, 10) >= MARCO);
    const recenteLoja = (c: Chamado) => !!c.dataLoja && String(c.dataLoja).slice(0, 10) >= MARCO;
    const semAtualizacaoMkt = ch.filter(c => {
      if (!clienteCriticoInatividade(c)) return false;
      const souResponsavel = c.consultorId === eu || c.atendenteId === eu;
      // Gestão: só o que é dela (o geral fica informativo no dashboard e nos relatórios)
      return souResponsavel || (!ehGestao() && !ehGerenteLoja() && (temMarketing() || mySetores().includes("suporte_consultores")) && recente(c));
    });
    add("semAtualizacaoMkt", "Sem atualização há mais de " + LIMITE_INATIVIDADE_H + "h", "Nenhuma ação registrada neste cliente. Continua pendente até alguém atualizar — vendedor, consultor, Gestão, Supervisão ou Suporte.", semAtualizacaoMkt, "var(--critico)");
    add("semcontato", "Visitas sem contato iniciado", "Você ainda não registrou contato com estes clientes.", ch.filter(c => c.consultorId === eu && c.setorDestino === "consultor_externo" && !(c.tratativa && c.tratativa.contatoIniciado)), "var(--warn)");
    add("agendarloja", "Visitas feitas — falta agendar a loja", "Registre a data em que o cliente virá à loja para encaminhar ao Suporte.", ch.filter(c => c.consultorId === eu && c.setorDestino === "consultor_externo" && c.tratativa && c.tratativa.realizada && !c.dataLoja), "var(--st-respondida)");
    add("visitaatrasada", "Visitas com data vencida", "A data da visita já passou e ela não foi marcada como realizada.", ch.filter(c => c.consultorId === eu && c.dataVisita && parseData(c.dataVisita) < agora && !(c.tratativa && c.tratativa.realizada) && c.setorDestino === "consultor_externo"), "var(--danger)");
    if (false) { // vendas/promissórias/transferências ficam em "Aprovações" (com contador) e no painel da Gestão
      const p = pendenciasGestao();
      add("apvendas", "Vendas a confirmar", "Decida se a venda é efetivada, promissória ou cancelada.", p.vendasConfirmar, "var(--warn)");
      add("appromis", "Promissórias em aberto", "Contam como venda, mas a comissão dessa parte só sai quando forem pagas.", p.promissorias, "var(--st-tratativa)");
      add("aptransf", "Transferências a decidir", "Pedidos entre vendedores aguardando sua aprovação.", p.transferencias.filter(c => c.transferencia.para !== eu), "var(--primary)");
    }
    // cliente cancelou a visita do consultor: a Supervisão do Marketing acompanha (reagenda, redireciona ou encerra)
    if (mySetores().includes("marketing_supervisao") || (ehGestao() && !ehProprietario())) add("visitacanc", "Cancelaram a visita do consultor", "Voltaram para direcionar de novo (Direcionar consultor). Clique em “Estou ciente” depois de ver.", ch.filter(c => domMarketing(c) && podeVer(c) && cancelouSemCiente(c)), "var(--danger)");
    if (mySetores().includes("marketing_supervisao") || (ehGestao() && !ehProprietario())) add("lojacanc", "Cancelaram a visita na loja", "O cliente cancelou a vinda à loja. Clique em “Estou ciente” depois de ver.", ch.filter(c => domMarketing(c) && podeVer(c) && statusClienteDe(c) === "loja_cancelada" && !cienteDe(c, "loja_cancelada") && recente(c)), "var(--warn)");
    // confirmação da vinda na loja (hoje e amanhã): a Supervisão/Suporte acompanham todos; vendedor, consultor e marketing os seus
    { const am = new Date(); am.setDate(am.getDate() + 1); const h0 = hojeISO(), h1 = isoLocal(am).slice(0, 10);
      const conf = (c: any) => { const k = (c.tratativa || {}).confirmLoja; return !!(k && String(k.para || "").slice(0, 16) === String(c.dataLoja).replace(" ", "T").slice(0, 16)); };
      const aConf = ch.filter(c => domMarketing(c) && c.dataLoja && !c.venda && c.status !== "concluida" && !["loja_cancelada", "atendido", "reprovado", "visita_cancelada", "em_obras", "nao_compareceu"].includes(statusClienteDe(c)) && String(c.dataLoja).slice(0, 10) >= h0 && String(c.dataLoja).slice(0, 10) <= h1 && !conf(c));
      if (mySetores().some(x => ["marketing_supervisao", "suporte_consultores"].includes(x))) add("confvinda", "⏳ Confirmar a vinda na loja (hoje e amanhã)", "Ligue/mande mensagem ao cliente e marque “✅ Cliente confirmou a vinda na loja” na ficha.", aConf.filter(c => podeVer(c)), "var(--warn)");
      else if (!ehGestao()) add("minhaconfvinda", "⏳ Seus clientes: confirmar a vinda na loja", "Confirme com o cliente e marque “✅ Cliente confirmou a vinda na loja” na ficha.", aConf.filter(c => [c.atendenteId, c.consultorId, (c as any).solicitanteId, (c as any).responsavelMkt].includes(eu)), "var(--warn)"); }
    add("minhalojacanc", "Seus clientes que cancelaram a loja", "Fale com o cliente e tente reagendar a vinda à loja.", ch.filter(c => domMarketing(c) && statusClienteDe(c) === "loja_cancelada" && (c.consultorId === eu || c.atendenteId === eu) && recente(c)), "var(--warn)");
    if ((temMarketing() && !ehGestao() && !ehGerenteLoja()) || mySetores().includes("suporte_consultores")) add("direcionar", "Clientes sem consultor", "Aguardando você designar um consultor externo.", ch.filter(c => domMarketing(c) && c.setorDestino === "marketing_supervisao" && podeVer(c) && recente(c)), "var(--st-aberta)");
    if (mySetores().includes("suporte_consultores") || (temMarketing() && !ehGestao() && !ehGerenteLoja())) {
      add("pedidoatend", "Vendedor pediu para atender", "Um vendedor informou que está atendendo o cliente. Aprove ou recuse na tela Definir vendedor.", ch.filter(c => domMarketing(c) && c.setorDestino === "suporte_consultores" && !c.atendenteId && c.tratativa && c.tratativa.pedidoAtend && recenteLoja(c)), "var(--primary)");
      add("designar", "Clientes sem vendedor", "Já têm data na loja, mas ninguém foi definido para atender. Use a tela Definir vendedor.", ch.filter(c => domMarketing(c) && c.setorDestino === "suporte_consultores" && !c.atendenteId && souRespLoja(c) && recenteLoja(c) && precisaDefinirVendedor(c) && !(c.dataLoja && String(c.dataLoja).slice(0, 10) < hojeISO())), "var(--warn)");
      add("semparecer", "Sem parecer do vendedor", "O cliente já veio e o vendedor não registrou o resultado. Cobre o parecer.", ch.filter(c => semParecer(c) && souRespLoja(c) && recenteLoja(c)), "var(--danger)");
    }
    if (mySetores().includes("marketing_supervisao")) add("litoral", "🏖 Litoral para aprovar", "Agendamentos com consultor no litoral (datas específicas). Abra a ficha e aprove ou recuse.", ch.filter(c => domMarketing(c) && litoralDe(c) === "pendente"), "var(--warn)");
    add("retmont", "🔧 Retornos de montador para você", "O call center abriu um retorno do montador e escolheu você para tratar. Prioridade de atendimento.", ch.filter(c => c.tipo === "retorno_montador" && !["concluida", "respondida", "informar"].includes(c.status) && ((c as any).tratativa?.retorno?.atendenteId === eu)), "var(--critico)");
    add("errovend", "🚨 Erros de venda para você", "O call center registrou um erro na sua venda. Abra, corrija e escreva o que foi feito.", ch.filter(c => c.tipo === "erro_venda" && c.status !== "concluida" && (c as any).tratativa?.erroVenda?.vendedorId === eu && !((c as any).tratativa?.erroVenda?.respostas || []).length), "var(--critico)");
    if (mySetores().includes("juridico")) add("jurprazo", "⚖️ Prazos jurídicos em até 3 dias", "Casos com prazo (Reclame Aqui, Procon, processo) vencendo. Atualize o caso.", ch.filter(c => c.tipo === "juridico" && c.status !== "concluida" && (() => { const d = String((c as any).tratativa?.juridico?.prazo || ""); if (!d) return false; const lim = new Date(); lim.setDate(lim.getDate() + 3); return d <= isoLocal(lim); })()), "var(--critico)");
    if (mySetores().includes("posvenda")) add("pvcc", "📞 Pós-venda aberto pelo call center — sem resposta", "O call center abriu e o cliente aguarda. Trate a solicitação no Pós-venda.", ch.filter(c => c.tipo === "posvenda" && ["aberta", "tratativa"].includes(c.status) && /call center/i.test((c as any).setor || "")), "var(--critico)");
    if (mySetores().includes("supervisao")) {
      add("desmont", "🛋 Desmontagem de estofado", "Encaminhe para a Tatiana (depósito → Valdir, estofador), marque \"enviada ao estofador\" e finalize.", ch.filter(c => c.tipo === "desmontagem_estofado" && c.status !== "concluida"), "var(--warn)");
      add("endsup", "📍 Atualizações de endereço", "O cliente pediu para atualizar o endereço. Atualize nos sistemas e finalize.", ch.filter(c => c.tipo === "atualizacao_endereco" && c.status !== "concluida"), "var(--warn)");
      add("errovsup", "⚠️ Erros de venda", "Informe o vendedor e acompanhe a tratativa dele. Quando estiver resolvido, finalize.", ch.filter(c => c.tipo === "erro_venda" && c.status !== "concluida"), "var(--critico)");
    }
    if (mySetores().includes("supervisao")) add("acomp", "🚨 Pedidos de acompanhamento", "O call center chamou a supervisão para estes chamados. Abra e marque \"Estou acompanhando\".", ch.filter(c => acompAtivo(c)), "var(--critico)");
    if (mySetores().includes("medidas_supervisao")) {
      add("solmed", "📞 Call center sem resposta (medidas)", "Trate a solicitação: se precisar medir, use \"Encaminhar para medir\" (vai para a fila de medidas). Depois finalize o ticket do call center.", ch.filter(c => c.tipo === "solicitacao_medida" && ["aberta", "tratativa"].includes(c.status)), "var(--warn)");
      add("medalerta", "⚠️ Medida para aprovar — checklist em até 3 dias", "O checklist está chegando e a medida desta venda ainda não foi aprovada. Aprove (Aguardando análise), direcione a medição ou avise o checklist.", ch.filter(c => c.tipo === "checklist" && c.status !== "concluida" && (c as any).tratativa?.checklist?.etapa === "agendado" && (() => { const d = String((c as any).tratativa.checklist.agendadoPara || "").slice(0, 10), h = hojeISO(); const lim = new Date(); lim.setDate(lim.getDate() + 3); return d >= h && d <= isoLocal(lim).slice(0, 10); })() && !ch.some(m => m.tipo === "medidas" && m.pedido === c.pedido && etapaMedida(m) === "liberada")), "var(--critico)");
      // aprovações ficam em "Aguardando análise"; viram pendência só quando o checklist está a 3 dias (medalerta)
    }
    add("medfazer", "📐 Medidas a fazer (R$ 40 por cliente · sem comissão)", "Medições direcionadas para você — não é visita de venda. Depois de medir, anexe as fotos/planta e marque como realizada.", ch.filter(c => c.tipo === "medidas" && c.medidorId === eu && etapaMedida(c) === "agendada"), "var(--warn)");
    add("informar", "Informar o cliente", "O setor registrou a solução mas não fala com o cliente. Avise o cliente e conclua.", ch.filter(c => doCC(c) && c.status === "informar" && (ehCallcenter() || c.solicitanteId === eu)), "var(--st-informar)");
    add("criticos", "Críticos no seu setor", "Mais de 24h sem resposta — precisam de ação imediata.", ch.filter(c => doCC(c) && mySetores().includes(c.setorDestino) && situacaoPrazo(c) === "critico"), "var(--critico)");
    add("meusatrasados", "Chamados que você abriu e estão atrasados", "O setor responsável ainda não respondeu dentro do prazo.", ch.filter(c => doCC(c) && c.solicitanteId === eu && estaAtrasado(c)), "var(--danger)");
    if (ehGerenteLoja()) add("gerabertos", "Chamados que você abriu — em andamento", "Solicitações que você abriu para os setores. Acompanhe a resposta.", ch.filter(c => doCC(c) && c.solicitanteId === eu && !["concluida"].includes(c.status)), "var(--st-aberta)");
    add("responder", "Respondidos — conclua o atendimento", "Seu setor registrou a solução. Confirme com o cliente e conclua.", ch.filter(c => doCC(c) && mySetores().includes(c.setorDestino) && c.status === "respondida"), "var(--st-respondida)");
    // cada chamado aparece em uma só pendência: a de maior gravidade vence (sem contar duas vezes)
    const PRIORIDADE = ["litoral", "visitacanc", "jurprazo", "retmont", "pvcc", "solmed", "acomp", "medalerta", "medvalidar", "medfazer", "cobrado", "aceite", "apvendas", "aptransf", "appromis", "informar", "semparecer", "darparecer", "pedidoatend", "semAtualizacaoMkt", "criticos", "visitaatrasada", "devolvido", "meusatrasados", "responder", "designar", "direcionar", "agendarloja", "semcontato", "meusclientes", "pedi", "gerabertos"];
    const dono: Record<string, string> = {};
    [...G].sort((a, b) => { const ia = PRIORIDADE.indexOf(a.chave), ib = PRIORIDADE.indexOf(b.chave); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); })
      .forEach(g => g.itens.forEach((c: Chamado) => { if (!dono[c.id]) dono[c.id] = g.chave; }));
    const grupos = G.map(g => ({ ...g, itens: g.itens.filter((c: Chamado) => dono[c.id] === g.chave) })).filter(g => g.itens.length);
    const total = grupos.reduce((s, g) => s + g.itens.length, 0);
    return { grupos, total };
  }

  function statsPessoa(uid: string, ehVend: boolean, de?: string, ate?: string) {
    const meus = state.chamados.filter(c => domMarketing(c) && (ehVend ? c.atendenteId === uid : c.consultorId === uid));
    const ativos = meus.filter(c => ["aguardando_consultor", "direcionado_consultor", "visita_realizada", "agendado_loja", ...EM_ATENDIMENTO].includes(statusClienteDe(c))).length;
    // período (vendas, total e conversão): pela data da venda ou, sem venda, da loja / visita / cadastro
    const inP = (c: Chamado) => { if (!de && !ate) return true; const d = dataRefCliente(c); return !!d && (!de || d >= de) && (!ate || d <= ate); };
    const vend = meus.filter(c => vendaContaVolume(c.venda) && inP(c));
    const total = vend.reduce((s, c) => s + parseMoeda(c.venda.valor), 0);
    // conversão: vendas ÷ clientes já decididos (vendidos + os que não compraram)
    const fechados = meus.filter(c => inP(c) && (vendaContaVolume(c.venda) || ["nao_compareceu", "venda_cancelada", "reprovado", "atendido"].includes(statusClienteDe(c)))).length;
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
      if (coord) pessoal.push(["produtividade", "Produtividade e pagamento"]);
    }
    G.push({ g: "Pessoal", ic: "◆", itens: pessoal });
    // Medidas tem a própria "Fila do call center" (menu Medidas): não repete a "Minha fila" para quem é só de Medidas
    const temCC = mySetores().some((x: string) => !ehSetorMarketing(x) && !["supervisao", "gestao", "medidas", "medidas_supervisao"].includes(x));
    const temMkt = mySetores().some((x: string) => ehSetorMarketing(x));
    // menu "Call center": só o call center, a Supervisão do call center e a Gestão. Os outros setores têm o menu do próprio setor.
    const gerCC = mySetores().includes("gerente_loja");
    const veCC = ehGestao() || mySetores().includes("callcenter") || mySetores().includes("supervisao") || gerCC;
    const cc: string[][] = [];
    if (veCC) {
      if (podeCriarCC()) cc.push(["nova", "Nova solicitação"]);
      if (verTudo()) cc.push(["fila", "Acompanhamento"]); else if (gerCC) cc.push(["fila", "Solicitações da gerência"]); else if (temCC) cc.push(["fila", "Minha fila"]);
      if (cc.length) { cc.push(["consulta", "Consulta"]); if (podeTreinamento()) cc.push(["treino", "Treinamento"]); G.push({ g: "Call center", ic: "☎", itens: cc }); }
    }
    // menus por setor (o que vem do call center vira a fila do setor)
    let abrirNoSetor = !veCC && podeCriarCC(), consultaNoSetor = !veCC;
    SETORES_MENU.filter(([id]) => mySetores().includes(id)).forEach(([id, nome, ic]) => {
      const it: string[][] = [["st_" + id + "_mim", "Para mim"], ["st_" + id + "_fila", "Fila do setor"], ["st_" + id + "_resolvidos", "Resolvidos"]];
      // agendadoras da montagem: os próprios agendamentos do Exact no ciclo 26 → 25
      if (id === "montagem") it.push(["montagem_meus", "📅 Agendamentos pessoais"]);
      if (abrirNoSetor) { it.push(["nova", "Abrir solicitação"]); abrirNoSetor = false; }
      if (consultaNoSetor) { it.push(["consulta", "Consulta"]); consultaNoSetor = false; }
      G.push({ g: nome, ic, itens: it });
    });
    const mk: string[][] = []; let soMeusClientes = false;
    if (podeCriarMkt()) mk.push(["novocli", "Novo cliente"]);
    if (temMarketing() || ehGestao()) {
      mk.push(["acompmkt", "Acompanhamento"]);
      if (ehProprietario()) mk.push(["definir", "Definir vendedor"]);
      mk.push(["agenda", "Agendamento loja"], ["operadoras", "Controle das operadoras"]);
      if (!coord && !ehGerenteLoja()) mk.push(["produtividade", "Produtividade e pagamento"]);
      mk.push(["clientes", "Clientes"], ["vendedores", "Vendedores"], ["ctl_vendedores", "Controle dos vendedores"]);
    } else if (temMkt) {
      // consultor e vendedor (só esse papel no marketing): menu enxuto — "Meus clientes" já tem busca, status, período e cancelamentos
      soMeusClientes = (ehConsultorExterno() || mySetores().includes("atendente_cliente")) && !mySetores().some((x: string) => ["suporte_consultores", "marketing_operadora"].includes(x));
      // consultor e vendedor: "Minha fila" e "Minha carteira" viraram uma tela só ("Meus clientes"), com filtros
      if (ehConsultorExterno() && !mySetores().includes("atendente_cliente")) { /* consultor externo: menu próprio "Consultor externo" */ }
      else if (ehConsultorExterno() || mySetores().includes("atendente_cliente")) mk.push(["carteira", "Meus clientes"], ["agenda", "Agendamento loja"]);
      else mk.push(["acompmkt", "Minha fila"], ["carteira", "Minha carteira"], ["agenda", "Agendamento loja"]);
      if (mySetores().includes("suporte_consultores")) mk.push(["vendedores", "Vendedores"], ["ctl_vendedores", "Controle dos vendedores"]);
      if (!soMeusClientes) mk.push(["clientes", "Clientes"]);
      if (mySetores().includes("marketing_operadora")) mk.push(["produtividade", "Minha produtividade"]);
    }
    if (mk.length) { if (!cc.length && !soMeusClientes) mk.push(["consulta", "Consulta"]); G.push({ g: temMkt && !temMarketing() && !ehGestao() ? "Minha operação" : "Marketing", ic: "◎", itens: mk }); }
    // Confirmação de presença: quem vem à loja (marketing, externo) e o cliente porta (entrou direto) — Camila e Gestão
    // 👔 Vendedores: gerentes (e Gestão) veem os atendimentos de cada vendedor hoje e nos próximos dias
    if ((mySetores().includes("gerente_loja") || ehGestao()) && !oculto("vendedores")) G.push({ g: "Vendedores", ic: "👔", itens: [["agenda_vendedores", "Atendimentos dos vendedores"]] });
    if (temPresenca()) G.push({ g: "Presença na loja", ic: "✅", itens: [["presenca", "✅ Confirmação de presença"], ["presenca_porta", "＋ Novo cliente porta"]] });
    if (veQualidade()) G.push({ g: "Qualidade", ic: "⭐", itens: [["qualidade", "Pesquisa de satisfação"]] });
    if (veAnuncios()) G.push({ g: "Anúncios", ic: "📣", itens: [["anuncios", "Meta e Google (Reportei)"]] });
    // Consultores externos: setor próprio (o marketing gera a demanda, o consultor atende). Fica logo abaixo do Marketing.
    const coordCE = ehGestao() || mySetores().includes("marketing_supervisao") || mySetores().includes("suporte_consultores");
    if (coordCE && !oculto("consultores")) G.push({ g: "Consultores externos", ic: "🧭", itens: [["ce_painel", "Painel dos consultores"], ["ce_vendas", "💰 Vendas dos consultores"], ["direcionamento", "Direcionar consultor"], ["ce_agenda", "📅 Agenda dos consultores"], ["ce_visitas", "Visitas"], ["ce_realizadas", "✅ Visitas realizadas"], ["ce_loja", "Agendados na loja"]] });
    else if (ehConsultorExterno()) G.push({ g: "Minhas operações", ic: "🧭", itens: [["carteira", "Meus clientes"], ["ce_agenda", "📅 Minha agenda"], ["ce_realizadas", "✅ Minhas visitas realizadas"], ["agenda", "Agendamento loja"]] });
    // quem mede (consultor externo ou medidor): "Setor de medidas" (pós-venda) separado da operação de venda, e o financeiro
    if ((ehConsultorExterno() || ehMedidor()) && !coordCE && !ehSupMedidas()) {
      G.push({ g: "Setor de medidas", ic: "📐", itens: [["md_minhas", "Medidas para fazer"], ["md_minhasfeitas", "Medidas finalizadas"]] });
      G.push({ g: "Meu financeiro", ic: "💰", itens: [["financeiro", ehConsultorExterno() ? "Meus pagamentos (externos + medidas)" : "Meus pagamentos"]] });
    }
    const ge: string[][] = [];
    const ehProjetista = mySetores().includes("atendente_cliente");
    if ((ehGestao() || ehProjetista || mySetores().includes("suporte_consultores")) && !((ehConsultorExterno() || ehMedidor()) && !ehGestao())) ge.push(["financeiro", ehGestao() ? "Financeiro" : ehConsultorExterno() ? "Vendas e comissão" : ehMedidor() ? "Minhas medidas e reembolsos" : ehProjetista ? "Minhas vendas" : "Vendas dos vendedores"]);
    if (verTudo()) ge.push(["relatorios", "Relatórios"]);
    if (verTudo() || temMarketing()) ge.push(["atividades", "Controle de atividades"]);
    if (ge.length) G.push({ g: (ehConsultorExterno() || ehMedidor()) && !ehGestao() ? "Meu financeiro" : "Gestão", ic: "▣", itens: ge });
    // Pós-venda Projetados: grupo próprio (Vânia, Jurídico e Gestão)
    const pv: string[][] = [];
    if (ehPosvenda() || ehGestao()) pv.push(["novopv_cli", "Nova solicitação do cliente"], ["novopv_mont", "Nova solicitação do montador"]);
    if (podeVerPosvenda()) pv.push(["pv_clientes", "Solicitações de clientes"], ["pv_montadores", "Solicitações de montadores"], ["pv_encaminhadas", "Encaminhadas (assistência, vistoria, montagem)"], ["pv_numeros", "Números"]);
    if (pv.length) G.splice(G.findIndex(g => g.g === "Gestão") >= 0 ? G.findIndex(g => g.g === "Gestão") : G.length, 0, { g: "Pós-venda", ic: "✚", itens: pv });
    if (podeChecklist()) G.splice(G.findIndex(g => g.g === "Gestão") >= 0 ? G.findIndex(g => g.g === "Gestão") : G.length, 0, { g: "Checklist", ic: "✓", itens: [["ck_produtividade", "📈 Produtividade"], ["st_checklist_cc", "📞 Pedidos do call center"], ["ck_agendar", "A agendar"], ["ck_aguardando", "Aguardando"], ["ck_agendados", "Agendados"], ["ck_confirmar", "Confirmação de presença"], ["ck_agenda", "Agenda"]] });
    // Medidas: cruzamento Minha Visita × Exact (Gestão e Supervisão de Medidas)
    if (ehSupMedidas()) G.splice(G.findIndex(g => g.g === "Gestão") >= 0 ? G.findIndex(g => g.g === "Gestão") : G.length, 0, { g: "Medidas", ic: "📐", itens: [["md_callcenter", "📞 Fila do call center"], ["md_pendentes", "Pendentes para medir"], ["md_agendadas", "Aguardando medição"], ["md_analise", "Aguardando análise"], ["md_aprovados", "Aprovados"], ["md_obra", "Em obra"], ["md_visitados", "📷 Visitados pelo consultor (360)"], ["md_cruzar", "Cruzar Minha Visita × Exact"], ["md_resultados", "Resultado dos cruzamentos"]] });
    // consultor externo e medidor: as medidas deles separadas das visitas de venda (medida paga R$ 40, sem comissão)
    else if (false) G.splice(G.findIndex(g => g.g === "Meu financeiro") >= 0 ? G.findIndex(g => g.g === "Meu financeiro") : G.length, 0, { g: "Minhas medidas", ic: "📐", itens: [["md_minhas", "Medidas para fazer"]] });
    // Montagem: só acompanhamento dos agendamentos do Exact (agendadoras e montadores) — só a Gestão
    if (mySetores().includes("gestao")) G.splice(G.findIndex(g => g.g === "Gestão") >= 0 ? G.findIndex(g => g.g === "Gestão") : G.length, 0, { g: "Montagem", ic: "🔧", itens: [["montagem_agend", "Agendamentos (Exact)"], ["montagem_pag", "Montagens efetivadas e pagamento"]] });
    if (podeEncontrarVendas()) G.splice(G.findIndex(g => g.g === "Gestão") >= 0 ? G.findIndex(g => g.g === "Gestão") : G.length, 0, { g: "Encontrar vendas", ic: "🔎", itens: [["encontrar_vendas360", "Encontrar vendas do 360"], ["encontrar_vendas", "Encontrar vendas da Minha Visita"]] });
    if (ehJuridico() || ehGestao()) G.splice(G.findIndex(g => g.g === "Gestão") >= 0 ? G.findIndex(g => g.g === "Gestão") : G.length, 0, { g: "Jurídico", ic: "⚖", itens: [["jur_novo", "Novo caso"], ["jur_andamento", "Casos em andamento"], ["jur_prazos", "Prazos (próx. 15 dias)"], ["jur_encerrados", "Encerrados"]] });
    if (!veCC && consultaNoSetor && (ehJuridico() || podeChecklist() || ehSupMedidas() || ehPosvenda())) {
      const gi = G.findIndex(g => ["Jurídico", "Checklist", "Medidas", "Pós-venda"].includes(g.g)); if (gi >= 0) G[gi].itens.push(["consulta", "Consulta"]);
    }
    // permissão avulsa de agenda da loja (ex.: Camila no fim de semana), para quem não é do marketing
    if ((me() as any)?.editaAgenda && !temMarketing() && !ehGestao()) G.push({ g: "Loja", ic: "🏬", itens: [["agenda", "Agendamento loja"], ["definir", "Definir vendedor"]] });
    if (podeBaseClientes() && !oculto("clientes")) G.push({ g: "Clientes", ic: "📇", itens: [["cli_base", "Base de clientes"]] });
    const cd: string[][] = [];
    if (temCadastros()) cd.push(["cadastros", "Fábricas"]);
    if (podeMontadores()) cd.push(["pv_cadastro", "Montadores"]);
    if (ehGestao()) cd.push(["admin", "Administração"]);
    if (cd.length) G.push({ g: "Cadastros", ic: "⚙", itens: cd });
    return G;
  }

  return {
    acompAtivo, ocultaValoresMkt, ehGerenteLoja, podeRemoverAnexo, podeMudarDataVisita, podeEditarCliente, ehProspeccao, gerentesVenda, ehProprietario, ehMedidor, ehSupMedidas, podeEncontrarVendas, etapaMedida, quemMede, medidasDe, reembolsosDe, state, TIPOS, currentUserId, getSetor, setorNome, destinoDe, tipoNome, getUser, me, mySetores, temLib, setoresLabel, getFab, getRep, nomeFab, nomeUser,
    verTudo, ehGestao, podeBaseClientes, temCadastros, doCC, prioridade, emAberto, naMinhaFila, ehCallcenter, viaCC, ehFabrica, podeTreinamento, podeAcompanhar, temMarketing, ehSetorMarketing, domMarketing, statusClienteDe, ultimaAtividade, horasSemAtualizar,
    clienteCriticoInatividade, podeVer, podeTratar, podeAnexar, podeCriarTipo, podeCriarCC, podeCriarMkt, operacionais, setoresVisiveis,
    funil, funilConsultor, clientesConsultor, visitaFeita, ehImportado, compareceu, ancoraVisita,
    msgWhatsMedida, ehDireto, ehPorta, temPresenca, veAnuncios, veQualidade, oculto, podeIniciarAtend, precisaDefinirVendedor, origemLoja, semAnexo, semParecer, parecerCobrado, souRespLoja, vendedores: projetistas, cienteDe, vendAgenda, folgaDia, dispVendedor, soCallCenter, acaoDeFora, ehJuridico,
    podeVerValor, ehConsultorExterno, ehPosvenda, podeVerPosvenda, podeMontadores, responsaveisChecklist, medidores, nomeMontador, podeEditarAgenda, podeMudarDataLoja, consultores, projetistas, cfg, extratoConsultor, dentroPeriodo,
    podeChecklist, alguemCiente, cancelouSemCiente, ordenar, waLink, waLinkCliente, mapsLink, wazeLink, pendenciasGestao, pendentesDirecionamento, minhasPendencias, statsPessoa, menuPerfil,
  };
}
export type Regras = ReturnType<typeof criarRegras>;
