// Visão geral da Gestão: a faixa "Precisa de você agora" e os 5 cartões (Call center, Agendamentos, Externos,
// Checklist, Vendas). Uma conta só, usada no computador (Dashboard) e no celular (Painel) — os números batem.
import { fmtMoeda, isoLocal, pagamentosVenda, parseData, parseMoeda, vendaContaVolume } from "./regras";
import { ck, etapaCk, grupoCk, reservaVencida, querEnc, aConfirmar, cfgAgenda } from "../telas/Checklist";

const FIM_TXT = (t: string) => t.startsWith("Status → Concluída") || t.startsWith("✓ Atendimento finalizado");
export const concluidoEm = (c: any) => { const h = (c.historico || []).filter((x: any) => FIM_TXT(String(x.texto))); return h.length ? h[h.length - 1].quando : null; };

export type AreaGeral = "cc" | "ag" | "cons" | "ck" | "vendas";
export type AlertaGeral = { ic: string; n: number; l: string; cls: "warn" | "crit"; ir: "aprovacoes" | "pendencias" | "fila" | "definir" };
export type CartaoGeral = { k: AreaGeral; ic: string; t: string; n: number; l: string; linhas: [string, any][]; pend: string; alerta: boolean };

export function calcGeral(R: any, st: any, de: string, ate: string) {
  const dentro = (v: any) => { if (!v) return false; const d = parseData(v); return d >= new Date(de + "T00:00:00") && d <= new Date(ate + "T23:59:59"); };
  const agora = new Date(), hojeS = isoLocal(agora);
  const todos = st.chamados;

  // ----- faixa -----
  const pg = R.pendenciasGestao();
  const acomp = todos.filter((c: any) => R.acompAtivo(c));
  const criticos = todos.filter((c: any) => R.doCC(c) && R.prioridade(c) === "critico");
  const reemb = (st.reembolsos || []).filter((r: any) => r.status === "pendente");
  const medParadas = todos.filter((c: any) => c.tipo === "medidas" && c.status !== "concluida" && (+agora - +new Date(c.criadoEm)) > 2 * 86400000 && ["validar", "realizada"].includes(R.etapaMedida(c)));
  const semVendHoje = todos.filter((c: any) => R.domMarketing(c) && !c.atendenteId && R.precisaDefinirVendedor(c) && String(c.dataLoja || "").slice(0, 10) === hojeS && !c.venda);
  const semAtual = todos.filter((c: any) => R.domMarketing(c) && R.clienteCriticoInatividade(c));
  const alertas: AlertaGeral[] = ([
    { ic: "🧾", n: pg.vendasConfirmar.length, l: "vendas a confirmar", cls: "warn", ir: "aprovacoes" },
    { ic: "🔁", n: pg.transferencias.length, l: "transferências a decidir", cls: "warn", ir: "aprovacoes" },
    { ic: "🚨", n: acomp.length, l: "acompanhamentos urgentes", cls: "crit", ir: "pendencias" },
    { ic: "🔴", n: criticos.length, l: "chamados críticos (+24h)", cls: "crit", ir: "fila" },
    { ic: "💵", n: reemb.length, l: "reembolsos para aprovar", cls: "warn", ir: "aprovacoes" },
    { ic: "📐", n: medParadas.length, l: "medidas paradas há +2 dias", cls: "warn", ir: "fila" },
    { ic: "🏬", n: semVendHoje.length, l: "clientes hoje sem vendedor", cls: "warn", ir: "definir" },
    { ic: "🕒", n: semAtual.length, l: "clientes sem atualização +24h", cls: "warn", ir: "pendencias" },
  ] as AlertaGeral[]).filter(a => a.n > 0);

  // ----- call center -----
  const cc = todos.filter((c: any) => R.doCC(c));
  const R1 = cc.filter((c: any) => dentro(c.criadoEm));
  const F1 = cc.filter((c: any) => c.status === "concluida" && dentro(concluidoEm(c)));
  const noPrazo = F1.filter((c: any) => { const f = concluidoEm(c); return f && c.slaResposta && new Date(f) <= new Date(c.slaResposta); });
  const prazo = F1.length ? Math.round(noPrazo.length / F1.length * 100) : null;
  const abertos = cc.filter((c: any) => c.status !== "concluida");
  const atrasados = cc.filter((c: any) => ["atrasado", "critico"].includes(R.prioridade(c)));

  // ----- agendamentos -----
  const mk = todos.filter((c: any) => R.domMarketing(c));
  const A1 = mk.filter((c: any) => dentro(c.criadoEm));
  const L1 = mk.filter((c: any) => c.dataLoja && dentro(c.dataLoja));
  const V1 = L1.filter(R.compareceu);
  const oM = A1.filter((c: any) => R.ehDireto(c)).length, oE = A1.length - oM;
  const agHojeLoja = mk.filter((c: any) => String(c.dataLoja || "").slice(0, 10) === hojeS);
  const semVendT = mk.filter((c: any) => c.dataLoja && String(c.dataLoja).slice(0, 10) >= hojeS && !c.atendenteId && !c.venda && R.precisaDefinirVendedor(c));

  // ----- externos -----
  const ext = mk.filter((c: any) => !R.ehDireto(c));
  const feita = (c: any) => !!(c.tratativa && c.tratativa.realizada);
  const visPer = ext.filter((c: any) => c.consultorId && dentro(c.dataVisita)), visFeitas = visPer.filter(feita);
  const semConsT = R.pendentesDirecionamento(), visAFazer = ext.filter((c: any) => c.setorDestino === "consultor_externo" && !feita(c));
  const visAtras = visAFazer.filter((c: any) => c.dataVisita && String(c.dataVisita).slice(0, 10) < hojeS);
  const cancelT = ext.filter((c: any) => R.statusClienteDe(c) === "visita_cancelada");

  // ----- checklist -----
  const cfgCk = cfgAgenda(st);
  const cl = todos.filter((c: any) => c.tipo === "checklist");
  const clAb = cl.filter((c: any) => c.status !== "concluida");
  const ckAg = cl.filter((c: any) => ["agendado", "realizado"].includes(etapaCk(c)) && dentro(ck(c).agendadoPara));
  const ckReal = cl.filter((c: any) => etapaCk(c) === "realizado" && dentro(ck(c).realizadoEm || ck(c).agendadoPara));
  const ckCont = cl.filter((c: any) => dentro(ck(c).ultimoContato));
  const ckAgendar = clAb.filter((c: any) => grupoCk(c) === "agendar");
  const ckVenc = clAb.filter((c: any) => reservaVencida(c, cfgCk));
  const ckConf = clAb.filter((c: any) => aConfirmar(c, cfgCk.confirmarDias ?? 2));
  const ckEnc = clAb.filter((c: any) => querEnc(c));
  const ckPassou = clAb.filter((c: any) => grupoCk(c) === "agendado" && !!ck(c).agendadoPara && String(ck(c).agendadoPara).slice(0, 10) < hojeS);

  // ----- vendas -----
  const vendasPer = mk.filter((c: any) => vendaContaVolume(c.venda) && pagamentosVenda(c.venda).some((p: any) => dentro(p.data + "T12:00")));
  const valorPer = vendasPer.reduce((s: number, c: any) => s + parseMoeda(c.venda.valor), 0);
  const vendasAConf = mk.filter((c: any) => c.venda && c.venda.status === "registrada");
  const veValor = R.ehGestao() || R.mySetores().includes("gerente_loja");

  const cartoes: CartaoGeral[] = [
    { k: "cc", ic: "☎", t: "Call center", n: R1.length, l: "registrados", linhas: [["Finalizados", F1.length], ["No prazo", prazo == null ? "—" : prazo + "%"]], pend: abertos.length + " em aberto · " + atrasados.length + " fora do prazo", alerta: atrasados.length > 0 },
    { k: "ag", ic: "◎", t: "Agendamentos", n: A1.length, l: "agendados", linhas: [["Marketing", oM], ["Externos", oE], ["Vieram", V1.length]], pend: agHojeLoja.length + " na loja hoje · " + semVendT.length + " sem vendedor", alerta: semVendT.length > 0 },
    { k: "cons", ic: "🧭", t: "Externos", n: visPer.length, l: "visitas", linhas: [["Realizadas", visFeitas.length], ["Atrasadas", visAtras.length]], pend: semConsT.length + " sem consultor · " + visAFazer.length + " a fazer" + (cancelT.length ? " · " + cancelT.length + " cancelaram" : ""), alerta: semConsT.length + visAtras.length + cancelT.length > 0 },
    { k: "ck", ic: "✓", t: "Checklist", n: ckAg.length, l: "agendados", linhas: [["Realizados", ckReal.length], ["Contatados", ckCont.length]], pend: ckAgendar.length + " a agendar · " + ckVenc.length + " prazo vencido · " + ckConf.length + " confirmar", alerta: ckVenc.length + ckEnc.length + ckPassou.length > 0 },
    { k: "vendas", ic: "💰", t: "Vendas", n: vendasPer.length, l: "vendas", linhas: veValor ? [["Valor", fmtMoeda(valorPer)]] : [], pend: vendasAConf.length + " a confirmar", alerta: vendasAConf.length > 0 },
  ];
  return { alertas, cartoes };
}
