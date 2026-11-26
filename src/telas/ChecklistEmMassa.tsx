// Agendar checklist em massa.
//
// Hoje cada cliente é agendado à mão: abrir, olhar a agenda, escolher data, escolher projetista,
// disparar. São 92 clientes na fila — 253 horas de agenda. Esta tela faz a mesma coisa para
// vários de uma vez, com a data sugerida do lado de cada um e editável antes de sair.
//
// NÃO reinventa a regra de disponibilidade: usa as mesmas funções da tela de agendamento
// (ocupacoes, livresNoHorario, atendeNoDia, durSugeridaCk). A única coisa que esta tela
// acrescenta é a RESERVA DENTRO DA PRÓPRIA RODADA — sem isso, os dez clientes selecionados
// receberiam todos o mesmo primeiro horário livre.
//
// O disparo é idêntico ao individual, cliente por cliente: primeiro a Kommo, e só se ela
// aceitar é que o horário é reservado no 360. Falhou um, os outros seguem e o que falhou
// aparece com o motivo.
import { Fragment, useEffect, useMemo, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { parseData, primeiroNome, sanitizeWhats } from "../lib/regras";
import {
  ck, etapaCk, cfgAgenda, ocupacoes, livresNoHorario, atendeNoDia, diaComAgenda,
  durSugeridaCk, modeloAprovado, conflitosProj, bloqueiosEm, rotuloBloq,
} from "./Checklist";
import { SeloMedidaVenda } from "./Medidas";
import { Selo360 } from "../comp/Visita360";

/** tempo em palavras: 120 → "2 h" */
const fmtDur = (m: number) => m >= 60 ? Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) : "") : m + " min";
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const diaBR = (v?: string | null) => v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—";
/** "Reserva com Promissória" → promissória; "Efetivada" → efetivada */
const tipoVenda = (s?: string | null) => {
  const x = (s || "").toLowerCase();
  if (x.includes("promiss")) return { l: "Promissória", cor: "var(--warn)", t: "Reserva com promissória — ainda não efetivada" };
  if (x.includes("efetiv")) return { l: "Efetivada", cor: "var(--st-concluida)", t: "Venda efetivada" };
  return { l: s || "—", cor: "var(--muted)", t: s || "Situação não encontrada na base de vendas" };
};
const cap = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (x: string) => x.toUpperCase());
/** Cidade · bairro do cliente, por três fontes em ordem de confiança.
 *  O campo `local` do checklist só existe em quem passou pela medida (13 de 93 na fila), e era
 *  por isso que a região aparecia em uns e em outros não. O endereço do chamado já vem formatado
 *  "Rua X, 123 - compl · Bairro, Cidade-PR"; a base de vendas do Tático cobre o resto.
 *  Só é usado para a atendente saber a distância — nunca para cruzar ou identificar cliente. */
function regiao(c: any, endBase?: string | null): string {
  const l = ck(c).local;
  if (l?.cidade) return cap(String(l.cidade)) + (l.bairro ? " · " + cap(String(l.bairro)) : "");
  const bruto = String(c.endereco || "");
  if (bruto.includes("·")) {
    const dep = bruto.split("·").pop()!.trim();            // "Bairro, Cidade-PR"
    const virg = dep.lastIndexOf(",");
    if (virg > 0) {
      const bairro = dep.slice(0, virg).trim();
      const cidade = dep.slice(virg + 1).replace(/-[A-Za-z]{2}\s*$/, "").trim();
      if (cidade) return cap(cidade) + (bairro ? " · " + cap(bairro) : "");
    }
  }
  const b = String(endBase || "");                          // "RUA X, 123, BAIRRO - CIDADE"
  if (b.includes(" - ")) {
    const fim = b.split(" - ").pop()!.trim();
    const antes = b.slice(0, b.lastIndexOf(" - "));
    const bairro = antes.includes(",") ? antes.split(",").pop()!.trim() : "";
    if (fim) return cap(fim) + (bairro ? " · " + cap(bairro) : "");
  }
  return "";
}
/** todos os números do cliente, na ordem de preferência — mesma regra da tela individual */
const telsDe = (c: any): string[] => {
  const k = ck(c);
  const salvos: string[] = Array.isArray(k.telefones) ? k.telefones : [];
  return [c.telefone, k.telefone2, ...salvos].filter((t: string) => t && String(t).replace(/\D/g, "").length >= 10);
};
/** ambientes do pedido, quando o checklist já trouxe (na maioria ainda não vem) */
const ambientesCk = (c: any): string[] => {
  const k = ck(c);
  const fonte = k.ambientes || k.planilha?.ambientes || (k.termo && k.termo.ambientes);
  if (!Array.isArray(fonte)) return [];
  return fonte.map((a: any) => String(typeof a === "string" ? a : (a?.nome || a?.ambiente || "")).trim()).filter(Boolean);
};

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const dataLonga = (v: string) => { if (!v) return "(data)"; const d = parseData(v); return `${DIAS[d.getDay()]}, ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`; };
const diaCurto = (v: string) => { const d = parseData(v); return DIAS[d.getDay()].slice(0, 3) + " " + d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); };
const curto = (v: string) => { if (!v) return "—"; const d = parseData(v); return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + v.slice(11, 16); };

type Linha = { c: any; dur: number; slot: string; proj: string; manual: boolean; encaixe: boolean; estado: "" | "indo" | "ok" | "erro"; msg: string };

/** Mesma checagem da tela de agendamento individual, aplicada linha a linha enquanto a pessoa
 *  mexe na data, no horário, no projetista ou no tempo. Acrescenta só uma verificação que lá
 *  não existe: o choque com OUTRA linha desta mesma rodada, que ainda não está no banco. */
function problemas(st: any, l: Linha, outras: Linha[]): { duro: string[]; leve: string[] } {
  const duro: string[] = [], leve: string[] = [];
  if (!l.slot || l.slot.length < 16) return { duro: ["sem data"], leve: [] };
  if (!l.proj) return { duro: ["sem projetista"], leve: [] };
  const cfg = cfgAgenda(st), dia = l.slot.slice(0, 10);
  const ini = +parseData(l.slot), fim = ini + l.dur * 6e4;
  if (ini < Date.now()) duro.push("data já passou");
  if (!diaComAgenda(cfg, dia)) duro.push("dia sem agenda");
  else if (!atendeNoDia(cfg, l.proj, dia)) duro.push(primeiroNome(l.proj) + " não atende neste dia");
  bloqueiosEm(st, l.proj, ini, fim).forEach((b: any) => duro.push(rotuloBloq(b)));
  conflitosProj(st, l.slot, l.proj, l.c.id, l.dur)
    .forEach((o: any) => duro.push(primeiroNome(l.proj) + " já tem " + (o.cliente || "cliente") + " neste horário"));
  outras.forEach(o => {
    if (o.c.id === l.c.id || !o.slot || o.proj !== l.proj) return;
    const oi = +parseData(o.slot);
    if (oi < fim && ini < oi + o.dur * 6e4) duro.push("choca com " + o.c.cliente + " desta mesma rodada");
  });
  if (!cfg.horarios.includes(l.slot.slice(11, 16))) leve.push("horário fora da grade");
  return { duro, leve };
}

/** Distribui os clientes nos horários livres, reservando dentro da própria rodada.
 *  Os de maior duração vêm primeiro: um atendimento de 8h só cabe em dia vazio, e se os
 *  pequenos ocuparem os buracos antes, os grandes nunca acham lugar. */
function alocar(st: any, clientes: any[], jaEscolhidos: Linha[]): Linha[] {
  const cfg = cfgAgenda(st);
  const occ = ocupacoes(st);                       // o que já está ocupado no sistema
  const reserva: { proj: string; ini: number; fim: number }[] = [];  // o que esta rodada já tomou
  // Data que já foi dada não muda mais. Antes, desmarcar um cliente fazia o alocador rodar de
  // novo e reembaralhar a data de todo mundo que tinha ficado — a pessoa perdia o que já tinha
  // conferido. Agora toda linha que já tem horário entra como FIXA (tenha sido escolhida à mão
  // ou sugerida pelo sistema), e só quem acabou de ser marcado recebe data nova, encaixada nos
  // buracos que sobraram.
  const fixos = new Map<string, Linha>();
  jaEscolhidos.filter(l => l.slot && l.proj).forEach(l => {
    fixos.set(l.c.id, l);
    const ini = +parseData(l.slot); reserva.push({ proj: l.proj, ini, fim: ini + l.dur * 6e4 });
  });

  const ordem = [...clientes].sort((a, b) => durSugeridaCk(b).min - durSugeridaCk(a).min);
  const out: Linha[] = [];
  const agora = Date.now() + 2 * 36e5;

  for (const c of ordem) {
    const fx = fixos.get(c.id);
    if (fx) { out.push(fx); continue; }
    const dur = Number(ck(c).duracaoMin) || durSugeridaCk(c).min;
    let achou: { slot: string; proj: string } | null = null;

    const base = new Date(); base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 90 && !achou; i++) {
      const d = new Date(base); d.setDate(base.getDate() + i);
      const dia = isoDia(d);
      if (!diaComAgenda(cfg, dia)) continue;
      for (const h of [...cfg.horarios].sort()) {
        const slot = dia + "T" + h;
        const t = +parseData(slot);
        if (t < agora) continue;
        const fim = t + dur * 6e4;
        const { livres } = livresNoHorario(st, slot, undefined, occ, dur);
        // tira quem esta rodada já comprometeu neste intervalo
        const tomados = new Set(reserva.filter(r => r.ini < fim && t < r.fim).map(r => r.proj));
        const cand = livres.filter((p: string) => !tomados.has(p) && atendeNoDia(cfg, p, dia));
        if (!cand.length) continue;
        // espalha o trabalho: fica com quem tem menos cliente nesta rodada
        const carga = (p: string) => reserva.filter(r => r.proj === p).length;
        const proj = [...cand].sort((a, b) => carga(a) - carga(b))[0];
        achou = { slot, proj };
        reserva.push({ proj, ini: t, fim });
        break;
      }
    }
    out.push({ c, dur, slot: achou?.slot || "", proj: achou?.proj || "", manual: false, encaixe: false, estado: "", msg: achou ? "" : "sem horário livre em 90 dias" });
  }
  // volta na ordem da fila (quem espera há mais tempo primeiro), não na ordem de alocação
  const pos = new Map(clientes.map((c, i) => [c.id, i]));
  return out.sort((a, b) => (pos.get(a.c.id) ?? 0) - (pos.get(b.c.id) ?? 0));
}

/** Todos os horários realmente livres para esta linha, dia a dia, já descontando o que as
 *  OUTRAS linhas desta mesma rodada pegaram — o painel do agendamento individual não sabe
 *  dessas, porque elas ainda não estão no banco. Devolve agrupado por dia, para rolar na tela. */
function livresPara(st: any, l: Linha, outras: Linha[], dias = 60) {
  const cfg = cfgAgenda(st), occ = ocupacoes(st, l.c.id);
  const reserva = outras.filter(o => o.c.id !== l.c.id && o.slot && o.proj)
    .map(o => { const i = +parseData(o.slot); return { proj: o.proj, ini: i, fim: i + o.dur * 6e4, cliente: o.c.cliente }; });
  const agora = Date.now() + 2 * 36e5;
  const out: { dia: string; slots: { slot: string; livres: string[] }[] }[] = [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  for (let i = 0; i < dias; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i);
    const dia = isoDia(d);
    if (!diaComAgenda(cfg, dia)) continue;
    const slots: { slot: string; livres: string[] }[] = [];
    for (const h of [...cfg.horarios].sort()) {
      const slot = dia + "T" + h, tt = +parseData(slot);
      if (tt < agora) continue;
      const fim = tt + l.dur * 6e4;
      const { livres } = livresNoHorario(st, slot, l.c.id, occ, l.dur);
      const tomados = new Set(reserva.filter(r => r.ini < fim && tt < r.fim).map(r => r.proj));
      const cand = livres.filter((p: string) => !tomados.has(p) && atendeNoDia(cfg, p, dia));
      if (cand.length) slots.push({ slot, livres: cand });
    }
    if (slots.length) out.push({ dia, slots });
  }
  return out;
}

/** O painel que substitui o chute: mostra os dias que têm vaga e, em cada dia, os horários com
 *  quem está livre. Um clique preenche data, hora e projetista de uma vez. */
function EscolherHorario({ l, outras, onPick, onEditar, onFechar }:
  { l: Linha; outras: Linha[]; onPick: (slot: string, proj: string) => void; onEditar: (slot: string, proj: string) => void; onFechar: () => void }) {
  const { st } = useApp() as any;
  const [soProj, setSoProj] = useState("");
  const dias = useMemo(() => livresPara(st, l, outras), [st, l.dur, l.c.id, outras]);
  const projs = useMemo(() => Array.from(new Set(dias.flatMap(d => d.slots.flatMap(s => s.livres)))).sort(), [dias]);
  const vis = soProj ? dias.map(d => ({ ...d, slots: d.slots.filter(s => s.livres.includes(soProj)) })).filter(d => d.slots.length) : dias;
  return <div>
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
      <b>Horários livres para {l.c.cliente} · atendimento de {fmtDur(l.dur)}</b>
      <select value={soProj} onChange={e => setSoProj(e.target.value)} style={{ width: "auto" }}>
        <option value="">Qualquer projetista</option>
        {projs.map(p => <option key={p} value={p}>só {p}</option>)}
      </select>
      <button className="btn ghost sm" onClick={onFechar}>fechar</button>
    </div>
    {/* a lista mostra o que está livre, mas a escolha nunca fica presa a ela: dá para marcar
        qualquer data e horário na mão, e aí a linha avisa em vermelho se houver conflito */}
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8, fontSize: 13 }}>
      <span className="hint">Ou escolha qualquer data:</span>
      <input type="date" value={(l.slot || "").slice(0, 10)} style={{ width: 150 }}
        onChange={e => { if (e.target.value) onEditar(e.target.value + "T" + ((l.slot || "").slice(11, 16) || cfgAgenda(st).horarios[0] || "09:00"), l.proj); }} />
      <input type="time" value={(l.slot || "").slice(11, 16)} step={900} style={{ width: 110 }}
        onChange={e => { if (e.target.value && l.slot) onEditar(l.slot.slice(0, 10) + "T" + e.target.value, l.proj); }} />
      <select value={l.proj} onChange={e => { if (l.slot) onEditar(l.slot, e.target.value); }} style={{ width: "auto" }}>
        <option value="">projetista…</option>
        {cfgAgenda(st).projetistas.map((p: string) => <option key={p} value={p}>{p}</option>)}
      </select>
      <span className="hint">o aviso em vermelho continua valendo</span>
    </div>
    {!vis.length
      ? <div className="hint">Nenhum horário livre nos próximos 60 dias com esse tempo de atendimento. Diminua o tempo ou escolha outro projetista.</div>
      : <div style={{ maxHeight: 300, overflowY: "auto", paddingRight: 6 }}>
        {vis.map(d => {
          const dd = parseData(d.dia + "T12:00");
          return <div key={d.dia} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", borderTop: "1px solid var(--linha)" }}>
            <span style={{ minWidth: 150, fontWeight: 700, fontSize: 13 }}>
              {DIAS[dd.getDay()]}<br /><span style={{ fontWeight: 400, opacity: .8 }}>{dd.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span></span>
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {d.slots.map(s => {
                const escolhido = l.slot.slice(0, 16) === s.slot;
                const pj = soProj || (l.proj && s.livres.includes(l.proj) ? l.proj : s.livres[0]);
                return <button key={s.slot} type="button" className={"chip" + (escolhido ? " on" : "")}
                  title={"Livres neste horário: " + s.livres.join(", ")}
                  onClick={() => onPick(s.slot, pj)}>
                  {s.slot.slice(11, 16)}
                  <span style={{ display: "block", fontSize: 11, opacity: .8, fontWeight: 400 }}>
                    {s.livres.length === 1 ? primeiroNome(s.livres[0]) : s.livres.length + " livres"}</span>
                </button>;
              })}
            </span></div>;
        })}
      </div>}
  </div>;
}

export default function ChecklistEmMassa() {
  const { st, R, recarregar, toast, abrirDetalhe } = useApp() as any;
  const cfg = cfgAgenda(st);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [indo, setIndo] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [busca, setBusca] = useState("");
  const [verLivres, setVerLivres] = useState("");  // id da linha com o painel de horários livres aberto
  // data e situação da venda vêm da base do Tático: o checklist não guarda isso
  const [vb, setVb] = useState<Record<string, { data: string | null; situacao: string | null; endereco: string | null; valor: number | null; desconto: number | null }>>({});
  const LOTE = 10;

  // a fila: quem está em "a contatar", mais antigo primeiro
  const fila = useMemo(() => (st.chamados || [])
    .filter((c: any) => c.tipo === "checklist" && c.status !== "concluida" && etapaCk(c) === "a_contatar")
    .filter((c: any) => !busca.trim() || (c.cliente + " " + (c.pedido || "") + " " + (c.telefone || "")).toLowerCase().includes(busca.trim().toLowerCase()))
    .sort((a: any, b: any) => String(a.criadoEm || "").localeCompare(String(b.criadoEm || ""))), [st.chamados, busca]);

  // busca uma vez os pedidos da fila inteira (são ~90, cabe numa consulta só)
  const pedidos = useMemo(() => (st.chamados || [])
    .filter((c: any) => c.tipo === "checklist" && c.status !== "concluida" && etapaCk(c) === "a_contatar")
    .map((c: any) => c.pedido).filter(Boolean).join(","), [st.chamados]);
  useEffect(() => {
    if (!pedidos) return;
    let vivo = true;
    A.ckVendasBase(pedidos.split(",")).then((m: any) => { if (vivo) setVb(m); }).catch(() => { /* sem a base, a tela segue sem essas colunas */ });
    return () => { vivo = false; };
  }, [pedidos]);

  const montar = (ids: Set<string>) => {
    const cl = fila.filter((c: any) => ids.has(c.id));
    setLinhas(prev => alocar(st, cl, prev));
  };
  const marcar = (id: string) => {
    const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id);
    setSel(n); montar(n);
  };
  const marcarLote = () => {
    const n = new Set(sel);
    for (const c of fila) { if (n.size >= LOTE) break; n.add(c.id); }
    setSel(n); montar(n);
  };
  const limpar = () => { setSel(new Set()); setLinhas([]); setFeitos(0); };

  const mudar = (id: string, campo: "slot" | "proj", v: string) => {
    // mexeu em qualquer coisa, o "confirmo o encaixe" cai: o aviso tem que ser reconhecido de novo
    setLinhas(ls => ls.map(l => l.c.id === id ? { ...l, [campo]: v, manual: true, encaixe: false, msg: "" } : l));
  };
  const mudarDur = (id: string, min: number) => {
    setLinhas(ls => ls.map(l => l.c.id === id ? { ...l, dur: min, manual: true, encaixe: false, msg: "" } : l));
  };
  const marcarEncaixe = (id: string, v: boolean) => {
    setLinhas(ls => ls.map(l => l.c.id === id ? { ...l, encaixe: v } : l));
  };
  // recalculado a cada tecla: a linha reage igual à tela de agendamento
  const probs = useMemo(() => {
    const m: Record<string, { duro: string[]; leve: string[] }> = {};
    linhas.forEach(l => { m[l.c.id] = problemas(st, l, linhas); });
    return m;
  }, [linhas, st]);

  const travadas = linhas.filter(l => l.estado !== "ok" && (probs[l.c.id]?.duro.length || 0) > 0 && !l.encaixe);
  const prontas = linhas.filter(l => l.slot && l.proj && l.estado !== "ok" && !travadas.includes(l));
  const horas = linhas.reduce((s, l) => s + l.dur, 0) / 60;

  async function disparar() {
    if (!prontas.length) return;
    if (!confirm(`Disparar ${prontas.length} mensagem${prontas.length > 1 ? "s" : ""} pelo WhatsApp do checklist?\n\nCada cliente recebe o horário que está na linha dele, e o horário fica reservado assim que a Kommo aceitar.`)) return;
    setIndo(true); setFeitos(0);
    const rem = primeiroNome(R.me()?.nome || "");
    for (const l of prontas) {
      setLinhas(ls => ls.map(x => x.c.id === l.c.id ? { ...x, estado: "indo", msg: "" } : x));
      // o cliente pode ter mais de um número: tenta todos antes de desistir
      const tel = telsDe(l.c).map(sanitizeWhats).find(Boolean) || "";
      if (!tel) {
        setLinhas(ls => ls.map(x => x.c.id === l.c.id ? { ...x, estado: "erro", msg: "nenhum telefone válido no cadastro" } : x));
        continue;
      }
      try {
        // 1) a Kommo primeiro: o horário só é reservado se ela aceitar o disparo
        await A.kommoEnviar({ chamado: l.c.id, cliente: l.c.cliente, telefone: tel, pedido: l.c.pedido,
          atendente: rem, data: dataLonga(l.slot), modelo: "primeiro" });
      } catch (e: any) {
        setLinhas(ls => ls.map(x => x.c.id === l.c.id ? { ...x, estado: "erro", msg: "não disparou: " + (e.message || "erro") } : x));
        continue;
      }
      try {
        // 2) registra e reserva, igual ao agendamento individual
        await A.checklistRegistrar(l.c.id, { acao: "mensagem", data: l.slot, projetista: l.proj,
          encaixe: l.encaixe, texto: modeloAprovado("primeiro", l.c, l.slot, rem), duracaoMin: l.dur, diasExtras: [] });
      } catch (e: any) {
        setLinhas(ls => ls.map(x => x.c.id === l.c.id ? { ...x, estado: "erro", msg: "disparou, mas não registrou: " + (e.message || "erro") } : x));
        continue;
      }
      setLinhas(ls => ls.map(x => x.c.id === l.c.id ? { ...x, estado: "ok", msg: "" } : x));
      setFeitos(f => f + 1);
    }
    setIndo(false);
    toast("Rodada concluída — confira as linhas que ficaram em vermelho");
    recarregar();
  }

  const opcoesHora = [...cfg.horarios].sort();

  return (
    <section className="view active">
      <div className="head">
        <h2>📨 Agendar em massa</h2>
        <p>Marque os clientes, confira a data que o sistema sugeriu em cada linha (dá para trocar) e dispare.
          A sugestão respeita a agenda de cada projetista, os bloqueios e o tempo que cada atendimento leva.
          Recomendado <b>{LOTE} por vez</b>, para não sobrecarregar a fila do WhatsApp.</p>
      </div>

      <div className="panel">
        <div className="linha" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="Buscar cliente, nº da venda ou telefone" value={busca} onChange={e => setBusca(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <button className="btn primary" onClick={marcarLote} disabled={indo}>Marcar {LOTE} da fila</button>
          <button className="btn" onClick={limpar} disabled={indo}>Limpar seleção</button>
          <span className="hint">{fila.length} cliente{fila.length === 1 ? "" : "s"} a contatar</span>
        </div>
      </div>

      {linhas.length > 0 && <div className="panel" style={{ borderLeft: "4px solid var(--primary)" }}>
        <b>{linhas.length} selecionado{linhas.length === 1 ? "" : "s"} · {horas.toFixed(1)}h de agenda</b>
        {linhas.some(l => !l.slot) && <span style={{ color: "var(--danger)", fontWeight: 700, marginLeft: 10 }}>
          ⚠️ {linhas.filter(l => !l.slot).length} sem horário livre</span>}
        {travadas.length > 0 && <span style={{ color: "var(--danger)", fontWeight: 700, marginLeft: 10 }}>
          ⚠️ {travadas.length} com conflito — marque “confirmo o encaixe” na linha ou mude a data</span>}
        <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn primary" onClick={disparar} disabled={indo || !prontas.length}>
            {indo ? `Disparando… ${feitos}/${prontas.length}` : `📨 Disparar ${prontas.length}`}</button>
          {linhas.some(l => l.estado === "ok") && <span style={{ color: "var(--st-concluida)", fontWeight: 700 }}>
            ✅ {linhas.filter(l => l.estado === "ok").length} disparado(s)</span>}
          {linhas.some(l => l.estado === "erro") && <span style={{ color: "var(--danger)", fontWeight: 700 }}>
            ✖ {linhas.filter(l => l.estado === "erro").length} com problema</span>}
        </div>
      </div>}

      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="tabela">
          <thead><tr>
            <th style={{ width: 34 }}></th><th>Cliente</th><th>Venda</th>
            <th style={{ textAlign: "right" }}>Cupom</th>
            <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>Data da venda</th>
            <th style={{ textAlign: "center" }}>Tipo</th>
            <th>Medida</th>
            <th style={{ textAlign: "center", padding: "0 14px" }}>Tempo</th>
            <th>Data sugerida</th><th>Hora</th><th>Projetista</th><th>Situação</th>
          </tr></thead>
          <tbody>
            {fila.map((c: any) => {
              const l = linhas.find(x => x.c.id === c.id);
              const marcado = sel.has(c.id);
              const sug = durSugeridaCk(c);
              const v = vb[c.pedido] || {} as any;
              const tv = tipoVenda(v.situacao);
              const ambs = ambientesCk(c);
              return <Fragment key={c.id}>
                <tr style={marcado ? { background: "var(--pj-bg, #f6f8fc)" } : undefined}>
                <td><input type="checkbox" checked={marcado} disabled={indo} onChange={() => marcar(c.id)} /></td>
                <td><button type="button" onClick={() => abrirDetalhe(c.id)} title="Abrir a ficha do cliente"
                  style={{ background: "none", border: 0, padding: 0, font: "inherit", fontWeight: 700, color: "var(--primary)", cursor: "pointer", textAlign: "left" }}>{c.cliente}</button>
                  {(() => { const rg = regiao(c, v.endereco); return rg ? <span className="hint" style={{ display: "block" }}>📍 {rg}</span> : null; })()}
                  {ambs.length ? <span className="hint" style={{ display: "block" }}>🏠 {ambs.join(", ")}</span> : null}</td>
                <td>{c.pedido || "—"}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}
                  title={sug.cupom ? "Valor do cupom — é ele que define o tempo sugerido" : "Sem valor de cupom"}>
                  {sug.cupom ? fmtBRL(sug.cupom) : <span className="hint" style={{ fontWeight: 400 }}>—</span>}</td>
                <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>{diaBR(v.data)}</td>
                <td style={{ textAlign: "center" }}>
                  <span className="pill" style={{ color: tv.cor, fontWeight: 700, whiteSpace: "nowrap" }} title={tv.t}>{tv.l}</span></td>
                <td style={{ minWidth: 190 }}>
                  <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                    {c.pedido ? <SeloMedidaVenda pedido={c.pedido} peq /> : null}
                    <Selo360 c={c} />
                    {!c.pedido ? <span className="hint">—</span> : null}
                  </span></td>
                <td style={{ textAlign: "center", padding: "0 14px", whiteSpace: "nowrap" }}>
                  {l ? <select value={l.dur} disabled={indo} title="Tempo que o atendimento trava na agenda — mudar aqui muda a disponibilidade"
                    onChange={e => mudarDur(c.id, Number(e.target.value))}>
                    {[...new Set([60, 120, 180, 240, 300, 360, 480, l.dur])].sort((a, b) => a - b).map(m => <option key={m} value={m}>{fmtDur(m)}</option>)}
                  </select> : <>{fmtDur(Number(ck(c).duracaoMin) || sug.min)}{!ck(c).duracaoMin && sug.cupom ? <span className="hint" style={{ display: "block" }}>pelo cupom</span> : null}</>}</td>
                <td style={{ whiteSpace: "nowrap" }}>{l
                  ? <button className="btn sm" disabled={indo} style={{ minWidth: 148, justifyContent: "flex-start" }}
                      title="Clique para ver todos os horários livres e escolher"
                      onClick={() => setVerLivres(verLivres === c.id ? "" : c.id)}>
                      📅 {l.slot ? diaCurto(l.slot) : "escolher data"}</button>
                  : <span className="hint">—</span>}</td>
                <td>{l ? <select value={(l.slot || "").slice(11, 16)} disabled={indo || !l.slot}
                  onChange={e => mudar(c.id, "slot", (l.slot || "").slice(0, 10) + "T" + e.target.value)}>
                  {[...new Set([...opcoesHora, (l.slot || "").slice(11, 16)].filter(Boolean))].sort().map(h => <option key={h} value={h}>{h}</option>)}
                </select> : <span className="hint">—</span>}</td>
                <td>{l ? <select value={l.proj} disabled={indo}
                  onChange={e => mudar(c.id, "proj", e.target.value)}>
                  <option value="">escolher…</option>
                  {cfg.projetistas.map((p: string) => <option key={p} value={p}>{p}</option>)}
                </select> : <span className="hint">—</span>}</td>
                <td>
                  {l?.estado === "ok" && <span style={{ color: "var(--st-concluida)", fontWeight: 700 }}>✅ disparado</span>}
                  {l?.estado === "indo" && <span className="hint">enviando…</span>}
                  {l?.estado === "erro" && <span style={{ color: "var(--danger)", fontWeight: 700 }}>✖ {l.msg}</span>}
                  {l && !l.estado && !l.slot && <span style={{ color: "var(--danger)" }}>{l.msg || "sem horário"}</span>}
                  {l && !l.estado && l.slot && (() => {
                    const p = probs[c.id] || { duro: [], leve: [] };
                    if (!p.duro.length && !p.leve.length) return <span style={{ color: "var(--st-concluida)", fontWeight: 700 }}>✓ livre</span>;
                    return <span style={{ display: "inline-block" }}>
                      {p.duro.map((x, i) => <span key={"d" + i} style={{ display: "block", color: "var(--danger)", fontWeight: 700, fontSize: 12.5 }}>⚠️ {x}</span>)}
                      {p.leve.map((x, i) => <span key={"v" + i} style={{ display: "block", color: "var(--warn)", fontSize: 12.5 }}>• {x}</span>)}
                      {p.duro.length ? <label style={{ display: "block", marginTop: 4, fontSize: 12, cursor: "pointer" }}>
                        <input type="checkbox" checked={l.encaixe} disabled={indo} onChange={e => marcarEncaixe(c.id, e.target.checked)} /> confirmo o encaixe
                      </label> : null}
                    </span>;
                  })()}
                </td>
              </tr>
              {/* o painel de disponíveis abre LOGO ABAIXO da linha clicada */}
              {l && verLivres === c.id && <tr>
                <td colSpan={12} style={{ background: "var(--pj-bg, #f6f8fc)", padding: "10px 14px" }}>
                  <EscolherHorario l={l} outras={linhas} onFechar={() => setVerLivres("")}
                    onEditar={(slot: string, pj: string) => setLinhas(ls => ls.map(x => x.c.id === c.id ? { ...x, slot, proj: pj, manual: true, encaixe: false, msg: "" } : x))}
                    onPick={(slot: string, pj: string) => {
                      setLinhas(ls => ls.map(x => x.c.id === c.id ? { ...x, slot, proj: pj || x.proj, manual: true, encaixe: false, msg: "" } : x));
                      setVerLivres("");
                    }} />
                </td></tr>}
              </Fragment>;
            })}

            {!fila.length && <tr><td colSpan={12}><div className="empty">Ninguém na fila de “a contatar”.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
