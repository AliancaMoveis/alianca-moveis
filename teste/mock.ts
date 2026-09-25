// Somente para testes locais (VITE_MOCK=1): monta o estado a partir dos dados de exemplo, sem Supabase.
import seed from "../supabase/seed/chamados-seed.json";
import type { Estado } from "../src/lib/dados";
import { fmtValor } from "../src/lib/dados";

const U = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const usuarios = [
  [7, "Bruno Fiaron", ["gestao"], false], [1, "Rafaela Lima", ["callcenter"], false], [2, "Camila Rocha", ["callcenter"], false],
  [3, "Diego Alves", ["prazo_fabrica"], false], [4, "Bruno Sá", ["montagem"], false], [5, "Paula Reis", ["assistencia", "montagem"], false],
  [8, "Fernanda Melo", ["checklist"], false], [9, "Igor Tavares", ["medidas"], false], [10, "Ana Ribeiro", ["marketing_operadora"], false],
  [13, "Marcelo Duarte", ["marketing_supervisao"], false], [11, "Consultor — Anderson", ["consultor_externo"], true], [12, "Consultor — Priscila", ["consultor_externo"], true],
  [14, "Suporte — Carla", ["suporte_consultores"], false], [15, "Vendedor — Roy", ["atendente_cliente"], true], [16, "Vendedora — Giovanna", ["atendente_cliente"], true], [6, "Supervisão", ["supervisao"], false], [17, "Vânia", ["posvenda"], false], [18, "Camila (Jurídico)", ["juridico"], false],
].map(([n, nome, setores, s]: any) => ({ id: U(n), nome, email: "", setores, somenteAtribuidos: s, ativo: true }));
const L = (criar = false, verTudo = false, cadastros = false, admin = false, verMarketing = false) => ({ criar, verTudo, cadastros, admin, verMarketing });
const setores = [
  ["callcenter", "Call center", L(true)], ["prazo_fabrica", "Prazo de fábrica", { ...L(), viaCallcenter: true }], ["montagem", "Montagem", L()], ["assistencia", "Assistência", L()],
  ["checklist", "Checklist", L()], ["medidas", "Medidas", L()], ["marketing_operadora", "Operadora Marketing", L(true)],
  ["marketing_supervisao", "Supervisão Marketing", L(true, false, false, false, true)], ["consultor_externo", "Consultor externo", L()],
  ["suporte_consultores", "Suporte Consultores Externos", L()], ["atendente_cliente", "Vendedores (loja)", L()], ["posvenda", "Pós-venda Projetados", L(true)], ["juridico", "Jurídico", L(false, true)],
  ["supervisao", "Supervisão (Call center)", L(true, true, true)], ["gestao", "Gestão", L(true, true, true, true)],
].map(([id, nome, liberacoes]: any) => ({ id, nome, liberacoes }));
const tipos: any = {
  entrega: { nome: "Solicitação de entrega", destino: "callcenter" }, prazo_fabrica: { nome: "Prazo de fábrica", destino: "prazo_fabrica" },
  montagem: { nome: "Solicitação de montagem", destino: "montagem" }, assistencia: { nome: "Solicitação de assistência", destino: "assistencia", anexos: true },
  vistoria: { nome: "Solicitação de vistoria", destino: "assistencia", anexos: true }, checklist: { nome: "Agendamento de checklist", destino: "checklist" },
  medidas: { nome: "Solicitação de medidas", destino: "medidas" },
  visita_consultor: { nome: "Visita técnica — consultor externo", destino: "marketing_supervisao", anexos: true, presale: true },
  agendamento_loja: { nome: "Agendamento direto na loja", destino: "suporte_consultores", anexos: true, presale: true, direto: true }, posvenda: { nome: "Pós-venda projetados (reclamação / ocorrência)", destino: "posvenda", anexos: true }, outros: { nome: "Outros", destino: "callcenter" },
};
const H = (h: number) => new Date(Date.now() + h * 3600000);
const local = (h: number | null) => { if (h == null) return ""; const d = H(h); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const svg = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#c9b896"/><text x="20" y="455" font-size="20">Foto</text></svg>');

const POSVENDA = [
  { id: "ALM-0090", tipo: "posvenda", sd: "posvenda", st: "tratativa", cr: -30, sla: 18, sol: U(1), soln: "Rafaela Lima", sols: "Call center", cli: "Helena Duarte", doc: "111.222.333-44", tel: "41988887777", em: "", ped: "VP-100", pf: "", pr: "Cozinha planejada", fab: "00000000-0000-4000-c000-000000000001", mo: "Porta do armário riscada na montagem", urg: false, tr: {},
    h: [[-30, "Rafaela Lima", "Solicitação aberta (Pós-venda projetados) → Pós-venda Projetados"]],
    pv: { origem: "cliente", categoria: "avaria", responsabilidade: "montador", pecaAfetada: "Cozinha — porta do aéreo", montadorId: "m1", medidorResp: "", checklistResp: U(8), ocorrido: "Montador riscou a porta", solucao: "Troca da porta", custo: 350, custoDesc: "Porta nova", descontoMontador: 150, atualizadoPor: U(17), atualizadoEm: new Date().toISOString() } },
  { id: "ALM-0091", tipo: "posvenda", sd: "posvenda", st: "aberta", cr: -5, sla: 40, sol: U(17), soln: "Vânia", sols: "Pós-venda Projetados", cli: "Marcos Lima", doc: "222.333.444-55", tel: "41977776666", em: "", ped: "VP-101", pf: "", pr: "Dormitório", fab: "00000000-0000-4000-c000-000000000002", mo: "Montador ligou: vão menor que o projeto", urg: false, tr: { acomp: { status: "pendente", porId: U(1), porNome: "Rafaela Lima", motivo: "Cliente muito irritado, ameaçando Procon", em: new Date().toISOString(), lembretes: 0 } },
    h: [[-5, "Vânia", "Solicitação aberta (Pós-venda projetados) → Pós-venda Projetados"]],
    pv: { origem: "montador", categoria: "", responsabilidade: "analise", pecaAfetada: "Dormitório — nicho da cama", montadorId: "", medidorResp: "", checklistResp: "", ocorrido: "", solucao: "", custo: 0, custoDesc: "", descontoMontador: 0 } },
];
export function estadoMock(): Estado {
  return {
    usuarios, setores, tipos,
    representantes: [{ id: "r1", nome: "Marcos Vieira", whats: "5541999990001", email: "" }, { id: "r2", nome: "Juliana Prado", whats: "5547999990002", email: "" }, { id: "r3", nome: "Carlos Nunes", whats: "5549999990003", email: "" }],
    fabricas: [1, 2, 3, 4].map(i => ({ id: `00000000-0000-4000-c000-00000000000${i}`, nome: ["Móveis Bartira", "Henn Estofados", "Madesa Indústria", "Kappesberg"][i - 1], emails: "", repId: ["r1", "r2", "r3", "r1"][i - 1] })),
    config: { comissaoPct: 1.5, pagamentoVisita: 40 },
    montadores: [{ id: "m1", nome: "João Montador", telefone: "41999990011", ativo: true }, { id: "m2", nome: "Carlos Montador", telefone: "", ativo: true }],
    chamados: (seed as any[]).concat(POSVENDA).map(c => ({
      id: c.id, tipo: c.tipo, setorDestino: c.sd, status: c.st, criadoEm: H(c.cr).toISOString(), slaResposta: H(c.sla).toISOString(),
      solicitanteId: c.sol, solicitante: c.soln, setor: c.sols, cliente: c.cli, clienteDoc: c.doc, telefone: c.tel, email: c.em, pedido: c.ped,
      dataVenda: c.dv || "", pedidoFabrica: c.pf, produto: c.pr, fabrica: c.fab || "", prazoTatico: c.pt || "", motivo: c.mo, urgente: c.urg,
      escalonadoAuto: false, escaladoEm: null, vinculadoA: null, consultorId: c.con || "", atendenteId: c.ate || "",
      dataVisita: local(c.vis), endereco: c.end, dataLoja: local(c.loja), statusCliente: c.sc || "", tratativa: c.tr,
      resposta: c.rw != null ? { previsao: c.rp || "", quem: c.rq, texto: c.rt, quando: H(c.rw).toISOString() } : null,
      venda: c.v ? { numero: c.v.n, valor: fmtValor(c.v.val), valorNum: c.v.val, dataVenda: c.v.d, vendedor: c.v.vd, atendenteNome: c.v.an, quando: H(c.v.q).toISOString(), status: c.v.s } : null,
      transferencia: c.t ? { de: c.t.de, para: c.t.para, solicitadoPor: c.t.por, quando: H(c.t.q).toISOString(), status: "pendente" } : null,
      anexos: ["ALM-0023", "ALM-0026", "ALM-0037"].includes(c.id) ? [{ id: "a" + c.id, tipo: "img", nome: "planta.svg", url: svg }] : [],
      historico: c.h.map((h: any) => ({ quando: H(h[0]).toISOString(), quem: h[1], texto: h[2] })),
      posvenda: c.pv || null,
    })).sort((a, b) => +new Date(b.criadoEm) - +new Date(a.criadoEm)),
  };
}
export const usuariosMock = usuarios;
