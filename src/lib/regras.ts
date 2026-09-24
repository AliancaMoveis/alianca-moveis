// Regras de negócio portadas do protótipo (REFERENCIA-sistema-atual.html), mesma lógica e mesmos textos.
// Aqui elas servem para a TELA (o que mostrar/esconder). A proteção de verdade está no banco (RLS + funções).
import type { Estado, Chamado, Usuario } from "./dados";

export const STATUS: Record<string, { label: string; cls: string }> = {
  aberta: { label: "Aberta", cls: "b-aberta" }, tratativa: { label: "Em tratativa", cls: "b-tratativa" },
  respondida: { label: "Respondida", cls: "b-respondida" }, concluida: { label: "Concluída", cls: "b-concluida" },
};
export const STATUS_CLIENTE: Record<string, string> = {
  aguardando_consultor: "Aguardando consultor", direcionado_consultor: "Direcionado ao consultor", visita_realizada: "Visita realizada",
  agendado_loja: "Agendado loja", com_vendedor: "Com vendedor", vendido_revisao: "Vendido — a confirmar",
  vendido_promissoria: "Vendido — promissória", vendido: "Vendido — efetivado", venda_cancelada: "Venda cancelada", nao_compareceu: "Não compareceu",
};
export const VENDA_STATUS: Record<string, string> = {
  registrada: "Aguardando confirmação da Gestão", promissoria: "Promissória — sem pagamento", efetivada: "Efetivada", cancelada: "Cancelada",
};
export const VENDA_TO_CLIENTE: Record<string, string> = { registrada: "vendido_revisao", promissoria: "vendido_promissoria", efetivada: "vendido", cancelada: "venda_cancelada" };
export const ORDEM = ["aberta", "tratativa", "respondida", "concluida"];
export const LIBS: Record<string, string> = {
  criar: "Abrir solicitações", verTudo: "Ver todos os setores (visão global)", cadastros: "Acessar aba Fábricas",
  admin: "Administração (usuários e setores)", verMarketing: "Ver todo o agendamento de marketing (todas as etapas e consultores)",
};
export const MARKETING_SETORES = ["marketing_operadora", "marketing_supervisao", "consultor_externo", "suporte_consultores", "atendente_cliente"];
export const LIMITE_INATIVIDADE_H = 24;
export const statusFinalCliente = ["vendido", "vendido_promissoria", "venda_cancelada", "nao_compareceu"];
export const COR_SETOR: Record<string, string> = {
  callcenter: "#4b6bd6", prazo_fabrica: "#b8802a", montagem: "#2f8fa8", assistencia: "#c23b3b", checklist: "#7a5bb5", medidas: "#1f9c7a",
  marketing_operadora: "#d1478f", marketing_supervisao: "#8e44ad", consultor_externo: "#b8802a", suporte_consultores: "#0f8a8a",
  atendente_cliente: "#3f8f4f", posvenda: "#c06a2b", juridico: "#6b4e2e", supervisao: "#5a6270", gestao: "#1a1d21",
};
// Pós-venda Projetados
export const PV_TIPOS: Record<string, string> = {
  avaria: "Avaria / dano", peca_faltante: "Peça faltante", peca_defeito: "Peça com defeito", medida: "Medida / peça não encaixa",
  montagem: "Montagem mal feita", acabamento: "Acabamento", outro: "Outro",
};
export const PV_RESP: Record<string, string> = {
  analise: "Em análise", montador: "Montador", medida: "Projeto — erro de medição", checklist: "Projeto — falha no checklist",
  fabrica: "Fábrica", transporte: "Transporte / entrega", cliente: "Cliente (mau uso)", nenhum: "Sem responsável",
};
export const PV_ORIGEM: Record<string, string> = { cliente: "Cliente reclamou", montador: "Montador pediu suporte na obra" };
export const PV_ENCAMINHAR: Record<string, string> = { vistoria: "Solicitar vistoria", assistencia: "Solicitar assistência (peça + montador)", montagem: "Nova montagem / retorno do montador", medidas: "Conferir medidas", checklist: "Revisar projeto (checklist)", prazo_fabrica: "Cobrar fábrica (prazo)" };
export const corDoSetor = (id: string) => COR_SETOR[id] || "#8b94a3";
export const vendaContaVolume = (v: any) => !!v && ["promissoria", "efetivada"].includes(v.status);
export const vendaContaComissao = (v: any) => !!v && v.status === "efetivada";

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

export function estaAtrasado(c: Chamado) { if (c.status === "respondida" || c.status === "concluida") return false; return new Date() > new Date(c.slaResposta); }
export function diasRestantes(c: Chamado) { return Math.ceil((+new Date(c.slaResposta) - +new Date()) / 86400000); }
export function horasAtraso(c: Chamado) { if (!estaAtrasado(c)) return 0; return (+new Date() - +new Date(c.slaResposta)) / 3600000; }
export function situacaoPrazo(c: Chamado) {
  if (c.status === "concluida") return "concluida"; if (c.status === "respondida") return "respondida";
  if (estaAtrasado(c)) return horasAtraso(c) >= 24 ? "critico" : "atrasado";
  const h = (+new Date(c.slaResposta) - +new Date()) / 3600000; return h <= 24 ? "perto" : "ok";
}
export const pesoPrazo: Record<string, number> = { critico: 0, atrasado: 1, perto: 2, ok: 3, respondida: 4, concluida: 5 };

// ---------- dinheiro ----------
export function parseMoeda(v: any) { const n = parseFloat((v || "0").toString().replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; }
export function fmtMoeda(n: number) { return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2 }); }

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
  const temCadastros = () => temLib("cadastros");
  const temMarketing = () => temLib("verMarketing");
  const ehSetorMarketing = (id: string) => MARKETING_SETORES.includes(id);
  const domMarketing = (c: Chamado) => !!(TIPOS[c.tipo] && TIPOS[c.tipo].presale);

  function normalizarStatusCliente(c: Chamado) {
    if (c.venda && c.venda.status) return VENDA_TO_CLIENTE[c.venda.status] || c.statusCliente;
    if (c.statusCliente === "nao_compareceu") return "nao_compareceu";
    if (c.setorDestino === "marketing_supervisao") return "aguardando_consultor";
    if (c.setorDestino === "consultor_externo") return (c.tratativa && c.tratativa.realizada) ? "visita_realizada" : "direcionado_consultor";
    if (c.setorDestino === "suporte_consultores") return "agendado_loja";
    if (c.setorDestino === "atendente_cliente") return "com_vendedor";
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
    if (!domMarketing(c)) return false;
    if (statusFinalCliente.includes(statusClienteDe(c))) return false;
    return horasSemAtualizar(c) >= LIMITE_INATIVIDADE_H;
  }

  const trPendPara = (c: Chamado) => !!(c.transferencia && c.transferencia.status === "pendente" && c.transferencia.para === currentUserId);
  function podeVer(c: Chamado) {
    const u = me();
    if (u && u.somenteAtribuidos) return c.consultorId === currentUserId || c.atendenteId === currentUserId || trPendPara(c);
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
  // treinamento: call center e Supervisão (call center); a Gestão também, por administrar o sistema
  const podeTreinamento = () => ehGestao() || mySetores().some((x: string) => ["callcenter", "supervisao"].includes(x));
  // call center acompanha qualquer solicitação de pós-venda: anota novo contato e marca urgente (quem trata fala com o cliente e conclui)
  const podeAcompanhar = (c: Chamado) => podeTratar(c) || (ehCallcenter() && !domMarketing(c));
  function podeTratar(c: Chamado) {
    const u = me();
    if (u && u.somenteAtribuidos) return c.consultorId === currentUserId || c.atendenteId === currentUserId || trPendPara(c);
    if (ehGestao()) return true;
    if (domMarketing(c)) return temMarketing() || mySetores().includes("suporte_consultores") || mySetores().includes(c.setorDestino);
    if (verTudo()) return true;
    return mySetores().includes(c.setorDestino);
  }
  function podeAnexar(c: Chamado) {
    if (ehGestao()) return true;
    if (domMarketing(c)) {
      if (mySetores().includes("atendente_cliente") && !mySetores().some((s: string) => ["marketing_supervisao", "suporte_consultores"].includes(s))) return false;
      return podeTratar(c);
    }
    return podeTratar(c) || temLib("criar");
  }
  const setoresCriaMkt = ["marketing_operadora", "marketing_supervisao"];
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
  const podeVerValor = (c: Chamado) => ehGestao() || temMarketing() || (c.atendenteId && c.atendenteId === currentUserId) || (c.consultorId && c.consultorId === currentUserId);
  const ehConsultorExterno = () => mySetores().includes("consultor_externo");
  const ehPosvenda = () => mySetores().includes("posvenda");
  const ehJuridico = () => mySetores().includes("juridico");
  const podeVerPosvenda = () => ehGestao() || ehPosvenda() || ehJuridico();
  const podeMontadores = () => temCadastros() || ehPosvenda();
  const responsaveisChecklist = () => state.usuarios.filter(u => (u.setores || []).includes("checklist"));
  const medidores = () => state.usuarios.filter(u => (u.setores || []).includes("medidas"));
  const nomeMontador = (id: string) => ((state.montadores || []).find(m => m.id === id) || ({} as any)).nome || "—";
  const podeEditarAgenda = () => ehGestao() || temMarketing() || mySetores().includes("suporte_consultores");
  const podeMudarDataLoja = (c: Chamado) => podeEditarAgenda() || (c.consultorId && c.consultorId === currentUserId);

  const consultores = () => state.usuarios.filter(u => u.ativo && u.somenteAtribuidos && (u.setores || []).includes("consultor_externo"));
  const projetistas = () => state.usuarios.filter(u => u.ativo && u.somenteAtribuidos && (u.setores || []).includes("atendente_cliente"));

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
    const visitas = visitasPagas(consultorId).filter(c => dentroPeriodo(c.dataLoja, de, ate) || (!de && !ate));
    const vendas = vendasComComissao(consultorId).filter(c => dentroPeriodo(c.venda.dataVenda || c.venda.quando, de, ate) || (!de && !ate));
    const { pagamentoVisita, comissaoPct: pct } = cfg();
    const pagamentoVisitas = visitas.length * pagamentoVisita;
    const totalVendido = vendas.reduce((s, c) => s + parseMoeda(c.venda.valor), 0);
    const comissao = totalVendido * (pct / 100);
    return { visitas, vendas, pagamentoVisitas, totalVendido, comissao, total: pagamentoVisitas + comissao };
  }

  // ---------- prioridade única por chamado (cada chamado cai em UMA faixa, sem duplicidade) ----------
  // call center: crítico (+24h vencido) > atrasado (vencido até 24h) > urgente (marcado, ainda no prazo) > perto (vence em 24h) > ok > respondida > concluída
  function prioridade(c: Chamado): string {
    if (domMarketing(c)) {
      const sc = statusClienteDe(c);
      if (statusFinalCliente.includes(sc)) return "concluida";
      return clienteCriticoInatividade(c) ? "critico" : "ok";
    }
    const sp = situacaoPrazo(c); // critico | atrasado | perto | ok | respondida | concluida
    if (sp === "critico" || sp === "atrasado" || sp === "respondida" || sp === "concluida") return sp;
    if (c.urgente) return "urgente";
    return sp;
  }
  const RANK: Record<string, number> = { critico: 0, atrasado: 1, urgente: 2, perto: 3, ok: 4, respondida: 5, concluida: 6 };
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
    L.push(`Olá, ${primeiroNome(c.cliente)}! Sou ${nomeNatural(u ? u.nome : "")}, projetista da Aliança Móveis.`); L.push("");
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
    const vendasConfirmar = state.chamados.filter(c => c.venda && c.venda.status === "registrada");
    const promissorias = state.chamados.filter(c => c.venda && c.venda.status === "promissoria");
    const transferencias = state.chamados.filter(c => c.transferencia && c.transferencia.status === "pendente");
    return { vendasConfirmar, promissorias, transferencias, total: vendasConfirmar.length + promissorias.length + transferencias.length };
  }
  const pendentesDirecionamento = () => state.chamados.filter(c => domMarketing(c) && c.setorDestino === "marketing_supervisao" && podeVer(c));

  function minhasPendencias() {
    const eu = currentUserId; const G: any[] = [];
    const add = (chave: string, titulo: string, desc: string, itens: Chamado[], cor: string) => { if (itens.length) G.push({ chave, titulo, desc, itens, cor }); };
    const agora = new Date();
    const ch = state.chamados;
    add("aceite", "Aguardando seu aceite", "Outro vendedor indicou você para assumir estes clientes.", ch.filter(c => c.transferencia && c.transferencia.status === "pendente" && c.transferencia.para === eu), "var(--primary)");
    add("pedi", "Suas solicitações de transferência", "Aguardando o aceite do outro vendedor ou aprovação.", ch.filter(c => c.transferencia && c.transferencia.status === "pendente" && c.transferencia.solicitadoPor === eu && c.transferencia.para !== eu), "var(--ink-faint)");
    add("meusclientes", "Seus clientes na loja", "Clientes designados a você que ainda não tiveram desfecho registrado.", ch.filter(c => c.atendenteId === eu && statusClienteDe(c) === "com_vendedor" && !c.venda), "var(--st-respondida)");
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
      add("appromis", "Promissórias em aberto", "Contam como venda, mas não geram comissão até serem efetivadas.", p.promissorias, "var(--st-tratativa)");
      add("aptransf", "Transferências a decidir", "Pedidos entre vendedores aguardando sua aprovação.", p.transferencias.filter(c => c.transferencia.para !== eu), "var(--primary)");
    }
    if (temMarketing()) add("direcionar", "Clientes sem consultor", "Aguardando você designar um consultor externo.", ch.filter(c => domMarketing(c) && c.setorDestino === "marketing_supervisao" && podeVer(c)), "var(--st-aberta)");
    if (mySetores().includes("suporte_consultores")) add("designar", "Clientes sem projetista", "Já têm data na loja, mas ninguém foi designado para atender.", ch.filter(c => domMarketing(c) && c.setorDestino === "suporte_consultores" && !c.atendenteId), "var(--warn)");
    add("criticos", "Críticos no seu setor", "Mais de 24h sem resposta — precisam de ação imediata.", ch.filter(c => !domMarketing(c) && mySetores().includes(c.setorDestino) && situacaoPrazo(c) === "critico"), "var(--critico)");
    add("meusatrasados", "Chamados que você abriu e estão atrasados", "O setor responsável ainda não respondeu dentro do prazo.", ch.filter(c => !domMarketing(c) && c.solicitanteId === eu && estaAtrasado(c)), "var(--danger)");
    add("responder", "Respondidos — conclua o atendimento", "Seu setor registrou a solução. Confirme com o cliente e conclua.", ch.filter(c => !domMarketing(c) && mySetores().includes(c.setorDestino) && c.status === "respondida"), "var(--st-respondida)");
    // cada chamado aparece em uma só pendência: a de maior gravidade vence (sem contar duas vezes)
    const PRIORIDADE = ["aceite", "apvendas", "aptransf", "appromis", "semAtualizacaoMkt", "criticos", "visitaatrasada", "devolvido", "meusatrasados", "responder", "designar", "direcionar", "agendarloja", "semcontato", "meusclientes", "pedi"];
    const dono: Record<string, string> = {};
    [...G].sort((a, b) => { const ia = PRIORIDADE.indexOf(a.chave), ib = PRIORIDADE.indexOf(b.chave); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); })
      .forEach(g => g.itens.forEach((c: Chamado) => { if (!dono[c.id]) dono[c.id] = g.chave; }));
    const grupos = G.map(g => ({ ...g, itens: g.itens.filter((c: Chamado) => dono[c.id] === g.chave) })).filter(g => g.itens.length);
    const total = grupos.reduce((s, g) => s + g.itens.length, 0);
    return { grupos, total };
  }

  function statsPessoa(uid: string, ehVend: boolean) {
    const meus = state.chamados.filter(c => domMarketing(c) && (ehVend ? c.atendenteId === uid : c.consultorId === uid));
    const ativos = meus.filter(c => ["aguardando_consultor", "direcionado_consultor", "visita_realizada", "agendado_loja", "com_vendedor"].includes(statusClienteDe(c))).length;
    const vend = meus.filter(c => vendaContaVolume(c.venda));
    const total = vend.reduce((s, c) => s + parseMoeda(c.venda.valor), 0);
    const fechados = meus.filter(c => ["vendido", "vendido_promissoria", "nao_compareceu", "venda_cancelada"].includes(statusClienteDe(c))).length;
    const conv = fechados ? Math.round(vend.length / fechados * 100) : 0;
    return { meus, ativos, vendas: vend.length, total, conv };
  }

  function menuPerfil() {
    const G: any[] = [];
    G.push({ g: "Pessoal", ic: "◆", itens: [["dashboard", "Dashboard"], ["pendencias", "Minhas pendências"]] });
    const temCC = mySetores().some((x: string) => !ehSetorMarketing(x) && !["supervisao", "gestao"].includes(x));
    const temMkt = mySetores().some((x: string) => ehSetorMarketing(x));
    const cc: string[][] = [];
    if (podeCriarCC()) cc.push(["nova", "Nova solicitação"]);
    if (verTudo()) cc.push(["fila", "Acompanhamento"]); else if (temCC) cc.push(["fila", "Minha fila"]);
    if (cc.length) { cc.push(["consulta", "Consulta"]); if (podeTreinamento()) cc.push(["treino", "Treinamento"]); G.push({ g: "Call center", ic: "☎", itens: cc }); }
    const mk: string[][] = [];
    if (podeCriarMkt()) mk.push(["novocli", "Novo cliente"]);
    if (temMarketing() || ehGestao()) {
      mk.push(["acompmkt", "Acompanhamento"], ["direcionamento", "Direcionar consultor"], ["agenda", "Agendamento loja"], ["clientes", "Clientes"], ["vendedores", "Vendedores"], ["consultores", "Consultores externos"]);
    } else if (temMkt) {
      mk.push(["acompmkt", "Minha fila"], ["carteira", "Minha carteira"], ["agenda", "Agendamento loja"]);
      if (mySetores().includes("suporte_consultores")) mk.push(["vendedores", "Vendedores"]);
      mk.push(["clientes", "Clientes"]);
    }
    if (mk.length) { if (!cc.length) mk.push(["consulta", "Consulta"]); G.push({ g: temMkt && !temMarketing() && !ehGestao() ? "Minha operação" : "Marketing", ic: "◎", itens: mk }); }
    const ge: string[][] = [];
    if (ehGestao()) ge.push(["aprovacoes", "Aprovações"]);
    const ehProjetista = mySetores().includes("atendente_cliente");
    if (ehConsultorExterno() || ehGestao() || ehProjetista || mySetores().includes("suporte_consultores")) ge.push(["financeiro", ehGestao() ? "Financeiro" : "Vendas e comissão"]);
    if (verTudo()) ge.push(["relatorios", "Relatórios"]);
    if (verTudo() || temMarketing()) ge.push(["atividades", "Controle de atividades"]);
    if (ge.length) G.push({ g: ehConsultorExterno() && !ehGestao() ? "Meu financeiro" : "Gestão", ic: "▣", itens: ge });
    // Pós-venda Projetados: grupo próprio (Vânia, Jurídico e Gestão)
    const pv: string[][] = [];
    if (ehPosvenda() || ehGestao()) pv.push(["novopv", "Novo atendimento"]);
    if (podeVerPosvenda()) pv.push(["posvenda", "Números e montadores"]);
    if (pv.length) G.splice(G.findIndex(g => g.g === "Gestão") >= 0 ? G.findIndex(g => g.g === "Gestão") : G.length, 0, { g: "Pós-venda", ic: "✚", itens: pv });
    const cd: string[][] = [];
    if (temCadastros()) cd.push(["cadastros", "Fábricas"]);
    if (ehGestao()) cd.push(["admin", "Administração"]);
    if (cd.length) G.push({ g: "Cadastros", ic: "⚙", itens: cd });
    return G;
  }

  return {
    state, TIPOS, currentUserId, getSetor, setorNome, destinoDe, tipoNome, getUser, me, mySetores, temLib, setoresLabel, getFab, getRep, nomeFab, nomeUser,
    verTudo, ehGestao, temCadastros, prioridade, emAberto, naMinhaFila, ehCallcenter, podeTreinamento, podeAcompanhar, temMarketing, ehSetorMarketing, domMarketing, statusClienteDe, ultimaAtividade, horasSemAtualizar,
    clienteCriticoInatividade, podeVer, podeTratar, podeAnexar, podeCriarTipo, podeCriarCC, podeCriarMkt, operacionais, setoresVisiveis,
    podeVerValor, ehConsultorExterno, ehPosvenda, podeVerPosvenda, podeMontadores, responsaveisChecklist, medidores, nomeMontador, podeEditarAgenda, podeMudarDataLoja, consultores, projetistas, cfg, extratoConsultor, dentroPeriodo,
    ordenar, waLink, waLinkCliente, mapsLink, wazeLink, pendenciasGestao, pendentesDirecionamento, minhasPendencias, statsPessoa, menuPerfil,
  };
}
export type Regras = ReturnType<typeof criarRegras>;
