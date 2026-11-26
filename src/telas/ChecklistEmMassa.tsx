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
import { useMemo, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { parseData, primeiroNome, sanitizeWhats } from "../lib/regras";
import {
  ck, etapaCk, cfgAgenda, ocupacoes, livresNoHorario, atendeNoDia, diaComAgenda,
  durSugeridaCk, cidadeCk, modeloAprovado,
} from "./Checklist";

/** tempo em palavras: 120 → "2 h" */
const fmtDur = (m: number) => m >= 60 ? Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) : "") : m + " min";

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const dataLonga = (v: string) => { if (!v) return "(data)"; const d = parseData(v); return `${DIAS[d.getDay()]}, ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`; };
const curto = (v: string) => { if (!v) return "—"; const d = parseData(v); return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + v.slice(11, 16); };

type Linha = { c: any; dur: number; slot: string; proj: string; manual: boolean; estado: "" | "indo" | "ok" | "erro"; msg: string };

/** Distribui os clientes nos horários livres, reservando dentro da própria rodada.
 *  Os de maior duração vêm primeiro: um atendimento de 8h só cabe em dia vazio, e se os
 *  pequenos ocuparem os buracos antes, os grandes nunca acham lugar. */
function alocar(st: any, clientes: any[], jaEscolhidos: Linha[]): Linha[] {
  const cfg = cfgAgenda(st);
  const occ = ocupacoes(st);                       // o que já está ocupado no sistema
  const reserva: { proj: string; ini: number; fim: number }[] = [];  // o que esta rodada já tomou
  // quem o usuário mexeu na mão mantém o horário dele e entra na reserva antes dos outros
  const fixos = new Map<string, Linha>();
  jaEscolhidos.filter(l => l.manual && l.slot && l.proj).forEach(l => {
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
    out.push({ c, dur, slot: achou?.slot || "", proj: achou?.proj || "", manual: false, estado: "", msg: achou ? "" : "sem horário livre em 90 dias" });
  }
  // volta na ordem da fila (quem espera há mais tempo primeiro), não na ordem de alocação
  const pos = new Map(clientes.map((c, i) => [c.id, i]));
  return out.sort((a, b) => (pos.get(a.c.id) ?? 0) - (pos.get(b.c.id) ?? 0));
}

export default function ChecklistEmMassa() {
  const { st, R, recarregar, toast } = useApp() as any;
  const cfg = cfgAgenda(st);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [indo, setIndo] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [busca, setBusca] = useState("");
  const LOTE = 10;

  // a fila: quem está em "a contatar", mais antigo primeiro
  const fila = useMemo(() => (st.chamados || [])
    .filter((c: any) => c.tipo === "checklist" && c.status !== "concluida" && etapaCk(c) === "a_contatar")
    .filter((c: any) => !busca.trim() || (c.cliente + " " + (c.pedido || "") + " " + (c.telefone || "")).toLowerCase().includes(busca.trim().toLowerCase()))
    .sort((a: any, b: any) => String(a.criadoEm || "").localeCompare(String(b.criadoEm || ""))), [st.chamados, busca]);

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
    setLinhas(ls => ls.map(l => l.c.id === id ? { ...l, [campo]: v, manual: true, msg: "" } : l));
  };

  const prontas = linhas.filter(l => l.slot && l.proj && l.estado !== "ok");
  const horas = linhas.reduce((s, l) => s + l.dur, 0) / 60;

  async function disparar() {
    if (!prontas.length) return;
    if (!confirm(`Disparar ${prontas.length} mensagem${prontas.length > 1 ? "s" : ""} pelo WhatsApp do checklist?\n\nCada cliente recebe o horário que está na linha dele, e o horário fica reservado assim que a Kommo aceitar.`)) return;
    setIndo(true); setFeitos(0);
    const rem = primeiroNome(R.me()?.nome || "");
    for (const l of prontas) {
      setLinhas(ls => ls.map(x => x.c.id === l.c.id ? { ...x, estado: "indo", msg: "" } : x));
      const tel = sanitizeWhats(l.c.telefone || ck(l.c).telefone2 || "");
      if (!tel) {
        setLinhas(ls => ls.map(x => x.c.id === l.c.id ? { ...x, estado: "erro", msg: "cliente sem telefone válido" } : x));
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
          encaixe: false, texto: modeloAprovado("primeiro", l.c, l.slot, rem), duracaoMin: l.dur, diasExtras: [] });
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
            <th style={{ width: 34 }}></th><th>Cliente</th><th>Venda</th><th>Tempo</th>
            <th>Data sugerida</th><th>Hora</th><th>Projetista</th><th>Situação</th>
          </tr></thead>
          <tbody>
            {fila.map((c: any) => {
              const l = linhas.find(x => x.c.id === c.id);
              const marcado = sel.has(c.id);
              const sug = durSugeridaCk(c);
              return <tr key={c.id} style={marcado ? { background: "var(--pj-bg, #f6f8fc)" } : undefined}>
                <td><input type="checkbox" checked={marcado} disabled={indo} onChange={() => marcar(c.id)} /></td>
                <td><b>{c.cliente}</b>{cidadeCk(c) ? <span className="hint" style={{ display: "block" }}>📍 {cidadeCk(c)}</span> : null}</td>
                <td>{c.pedido || "—"}</td>
                <td>{fmtDur(Number(ck(c).duracaoMin) || sug.min)}{!ck(c).duracaoMin && sug.cupom ? <span className="hint" style={{ display: "block" }}>pelo cupom</span> : null}</td>
                <td>{l ? <input type="date" value={(l.slot || "").slice(0, 10)} disabled={indo}
                  onChange={e => mudar(c.id, "slot", e.target.value ? e.target.value + "T" + ((l.slot || "").slice(11, 16) || opcoesHora[0]) : "")} /> : <span className="hint">—</span>}</td>
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
                  {l && !l.estado && l.slot && <span className="hint">{curto(l.slot)}{l.manual ? " · escolhido à mão" : ""}</span>}
                </td>
              </tr>;
            })}
            {!fila.length && <tr><td colSpan={8}><div className="empty">Ninguém na fila de “a contatar”.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
