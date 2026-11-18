// 📨 O que aconteceu com as mensagens do checklist.
// Antes a gente só sabia que a mensagem saiu: o cliente ficava em "aguardando resposta" e pronto.
// Agora cada mensagem que sai e cada resposta que volta ficam registradas, e aqui elas viram número:
// quantas foram, quantos clientes responderam, quantos confirmaram, quantos pediram outra data,
// quantos estão em obra, quantos escreveram outra coisa (precisa de gente) e quantos não responderam.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtDate, hojeISO, isoLocal } from "../lib/regras";
import { Kpi } from "../telas/Dashboard";

export type Funil = {
  de: string; ate: string;
  mensagens: number; mensagensPrimeiro: number; mensagensNovaData: number; falhas: number;
  clientes: number; responderam: number; confirmaram: number; novaData: number; obra: number; livre: number; semResposta: number;
  respostas: number; minutosAteResposta: number | null;
  whatsCobranca: number; whatsConfirmacao: number;
  porDia: { dia: string; enviadas: number; respostas: number; confirmou: number }[];
  porAtendente: { nome: string; enviadas: number; confirmou: number }[];
  listas: Record<string, string[]>;
};

const pct = (n: number, t: number) => t ? Math.round(n / t * 100) : 0;
const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return isoLocal(d); };

/** os desfechos, na ordem em que interessam a quem opera */
export const DESFECHO: [string, string, string, string][] = [
  // chave · rótulo · cor · o que fazer
  ["confirmou", "✅ Confirmaram o horário", "var(--st-concluida)", "já estão agendados, com presença confirmada"],
  ["outra_data", "🔄 Pediram outra data", "#1d6fd1", "precisam de uma data nova — estão em “A agendar”"],
  ["obra", "🚧 Responderam que estão em obra", "var(--st-tratativa)", "voltam para a fila com retorno em 30 dias"],
  ["outro", "💬 Escreveram outra coisa", "var(--warn)", "não apertaram botão: alguém precisa ler e responder"],
  ["semResposta", "📵 Não responderam", "var(--ink-faint)", "mensagem entregue e nenhuma resposta até agora"],
];

export function useFunilKommo(dias = 30, deFixo?: string, ateFixo?: string) {
  const { toast } = useApp() as any;
  const [de, setDe] = useState(deFixo || diasAtras(dias - 1));
  const [ate, setAte] = useState(ateFixo || hojeISO());
  const [f, setF] = useState<Funil | null>(null);
  const [erro, setErro] = useState("");
  // painel com período próprio (ex.: o painel da Gestão): os números seguem o período de lá
  useEffect(() => { if (deFixo) setDe(deFixo); if (ateFixo) setAte(ateFixo); }, [deFixo, ateFixo]);
  const carregar = async (d = de, a = ate) => {
    try { setErro(""); setF(await A.kommoFunil(d, a)); }
    catch (e: any) { setErro(e.message || "não consegui carregar"); if (toast) toast(e.message); }
  };
  useEffect(() => { carregar(de, ate); }, [de, ate]);
  return { f, de, ate, setDe, setAte, erro, recarregar: () => carregar() };
}

/** a barra de um desfecho, com o número, a fatia e o que fazer com esses clientes */
function Linha({ l, n, tot, cor, dica, on, aberto }: any) {
  return <div style={{ margin: "0 0 8px" }}>
    <button type="button" onClick={on} style={{ width: "100%", textAlign: "left", background: "none", border: 0, padding: 0, font: "inherit", cursor: on ? "pointer" : "default" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13.5, fontWeight: 700 }}>
        <span>{l}</span>
        <b style={{ marginLeft: "auto", fontSize: 17, color: cor }}>{n}</b>
        <span style={{ fontSize: 12, color: "var(--ink-faint)", minWidth: 38, textAlign: "right" }}>{pct(n, tot)}%</span>
      </div>
      <div style={{ height: 9, borderRadius: 6, background: "var(--surface-2)", overflow: "hidden", margin: "3px 0 2px" }}>
        <div style={{ width: pct(n, tot) + "%", height: "100%", background: cor }} />
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>{dica}{on ? (aberto ? " · toque para fechar" : " · toque para ver quem") : ""}</div>
    </button>
  </div>;
}

/** o gráfico de barras por dia: enviadas x respostas x confirmações */
function PorDia({ dias }: { dias: Funil["porDia"] }) {
  const comAlgo = dias.filter(d => d.enviadas || d.respostas);
  if (!comAlgo.length) return null;
  const max = Math.max(1, ...comAlgo.map(d => d.enviadas));
  const mostrar = comAlgo.slice(-21);
  return <div>
    <div style={{ display: "flex", gap: 10, fontSize: 11.5, fontWeight: 700, margin: "0 0 6px" }}>
      <span style={{ color: "var(--primary)" }}>▮ enviadas</span><span style={{ color: "var(--warn)" }}>▮ respostas</span><span style={{ color: "var(--st-concluida)" }}>▮ confirmaram</span>
    </div>
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", overflowX: "auto", paddingBottom: 4 }}>
      {mostrar.map(d => <div key={d.dia} style={{ minWidth: 26, flex: 1, textAlign: "center" }} title={fmtDate(d.dia) + ": " + d.enviadas + " enviadas · " + d.respostas + " respostas · " + d.confirmou + " confirmaram"}>
        <div style={{ display: "flex", gap: 1, alignItems: "flex-end", justifyContent: "center", height: 70 }}>
          <div style={{ width: 7, height: Math.round(d.enviadas / max * 68) + "px", background: "var(--primary)", borderRadius: "3px 3px 0 0" }} />
          <div style={{ width: 7, height: Math.round(d.respostas / max * 68) + "px", background: "var(--warn)", borderRadius: "3px 3px 0 0" }} />
          <div style={{ width: 7, height: Math.round(d.confirmou / max * 68) + "px", background: "var(--st-concluida)", borderRadius: "3px 3px 0 0" }} />
        </div>
        <div style={{ fontSize: 9.5, color: "var(--ink-faint)", marginTop: 2 }}>{d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}</div>
      </div>)}
    </div>
  </div>;
}

/** lista de clientes de um desfecho (abre ao toque na barra) */
function Clientes({ ids }: { ids: string[] }) {
  const { st, abrirDetalhe } = useApp() as any;
  const nome = (id: string) => (st.chamados.find((c: any) => c.id === id) || {}).cliente || id;
  const venda = (id: string) => (st.chamados.find((c: any) => c.id === id) || {}).pedido || "";
  if (!ids.length) return <div className="hint">Nenhum cliente aqui.</div>;
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "2px 0 10px" }}>
    {ids.map(id => <button key={id} type="button" className="chip" onClick={() => abrirDetalhe && abrirDetalhe(id)}>
      {nome(id)}{venda(id) ? " · " + venda(id) : ""}</button>)}
  </div>;
}

/** O quadro inteiro: mensagens, desfechos, dias e atendentes. `compacto` entra dentro de um painel. */
export default function FunilKommo({ compacto, dias = 30, de: deFixo, ate: ateFixo }: { compacto?: boolean; dias?: number; de?: string; ate?: string }) {
  const { f, de, ate, setDe, setAte, erro, recarregar } = useFunilKommo(dias, deFixo, ateFixo);
  const [ab, setAb] = useState("");
  if (erro) return <div className="cp-card hint">Não consegui carregar os números das mensagens: {erro}</div>;
  if (!f) return <div className="hint">Carregando os números das mensagens…</div>;
  const n = (k: string) => k === "semResposta" ? f.semResposta : k === "confirmou" ? f.confirmaram : k === "outra_data" ? f.novaData : k === "obra" ? f.obra : f.livre;
  const tempo = f.minutosAteResposta == null ? "—" : f.minutosAteResposta < 60 ? f.minutosAteResposta + " min"
    : f.minutosAteResposta < 1440 ? Math.round(f.minutosAteResposta / 60) + " h" : Math.round(f.minutosAteResposta / 1440) + " dias";
  return <div>
    {!compacto && !deFixo && <div className="card" style={{ padding: "10px 14px", marginBottom: 12, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div className="field" style={{ minWidth: 150 }}><label>De</label><input type="date" value={de} max={ate} onChange={e => e.target.value && setDe(e.target.value)} /></div>
      <div className="field" style={{ minWidth: 150 }}><label>Até</label><input type="date" value={ate} min={de} onChange={e => e.target.value && setAte(e.target.value)} /></div>
      <button className="btn sm" onClick={() => { setDe(hojeISO()); setAte(hojeISO()); }}>Hoje</button>
      <button className="btn sm" onClick={() => { setDe(diasAtras(6)); setAte(hojeISO()); }}>7 dias</button>
      <button className="btn sm" onClick={() => { setDe(diasAtras(29)); setAte(hojeISO()); }}>30 dias</button>
      <button className="btn ghost sm" onClick={recarregar}>↻ Atualizar</button>
    </div>}

    <div className="kpis">
      <Kpi n={f.mensagens} l="Mensagens enviadas pelo WhatsApp do checklist" />
      <Kpi n={f.clientes} l="Clientes que receberam" />
      <Kpi n={f.responderam} l={"Responderam · " + pct(f.responderam, f.clientes) + "% de quem recebeu"} cor="var(--warn)" />
      <Kpi n={f.confirmaram} l={"Confirmaram o horário · " + pct(f.confirmaram, f.clientes) + "% de quem recebeu"} cor="var(--st-concluida)" />
      <Kpi n={tempo} l="Tempo médio até o cliente responder" />
      {!!f.falhas && <Kpi n={f.falhas} l="Mensagens que não saíram" cor="var(--danger)" />}
    </div>

    <div className="sec-label" style={{ marginTop: 14 }}>O que o cliente fez com a mensagem</div>
    <div className="card" style={{ padding: "12px 16px" }}>
      {DESFECHO.map(([k, l, cor, dica]) => <div key={k}>
        <Linha l={l} n={n(k)} tot={f.clientes} cor={cor} dica={dica} aberto={ab === k} on={() => setAb(ab === k ? "" : k)} />
        {ab === k && <Clientes ids={f.listas[k] || []} />}
      </div>)}
      <div style={{ fontSize: 12, color: "var(--ink-faint)", borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 4 }}>
        {f.clientes} cliente(s) receberam {f.mensagens} mensagem(ns) — {f.mensagensPrimeiro} de primeiro contato e {f.mensagensNovaData} de nova data.
        O cliente conta uma vez, pelo melhor desfecho que ele deu. Quem recebeu mais de uma mensagem aparece uma única vez.
        {(f.whatsCobranca || f.whatsConfirmacao) ? " Fora daqui saíram ainda " + (f.whatsCobranca + f.whatsConfirmacao) + " mensagem(ns) pelo WhatsApp pessoal (cobrança e confirmação de presença), que ainda não passam pela Kommo." : ""}
      </div>
    </div>

    {!compacto && <>
      <div className="sec-label" style={{ marginTop: 14 }}>Dia por dia</div>
      <div className="card" style={{ padding: "12px 16px" }}><PorDia dias={f.porDia} /></div>

      <div className="sec-label" style={{ marginTop: 14 }}>Quem enviou</div>
      <div className="card" style={{ padding: "12px 16px" }}>
        {f.porAtendente.length ? <table className="ng-tab"><thead><tr><th>Atendente</th><th>Mensagens</th><th>Confirmaram</th><th>Aproveitamento</th></tr></thead>
          <tbody>{f.porAtendente.map(a => <tr key={a.nome}><td><b>{a.nome}</b></td><td>{a.enviadas}</td><td>{a.confirmou}</td>
            <td><b style={{ color: "var(--st-concluida)" }}>{pct(a.confirmou, a.enviadas)}%</b></td></tr>)}</tbody></table>
          : <div className="hint">Nenhuma mensagem no período.</div>}
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>Aproveitamento = de cada 100 mensagens que a pessoa mandou, quantas terminaram com o cliente confirmando o horário.</div>
      </div>
    </>}
  </div>;
}

/** o mesmo quadro, mas no período de quem chamou (o painel da Gestão tem o seu próprio seletor de datas) */
export const FunilKommoPeriodo = ({ de, ate }: { de: string; ate: string }) => <FunilKommo de={de} ate={ate} />;
