import { useApp } from "../estado";
import { STATUS, STATUS_CLIENTE, diasRestantes, fmtDate, fmtDateTime, fmtDiaHora } from "../lib/regras";

export function ScBadge({ c }: { c: any }) {
  const { R } = useApp();
  const k = R.statusClienteDe(c);
  return <span className={"sc sc-" + k}>{STATUS_CLIENTE[k] || "—"}</span>;
}

export function Ticket({ c, resposta }: { c: any; resposta?: boolean }) {
  const { R, abrirDetalhe } = useApp();
  const presale = R.domMarketing(c);
  const pr = R.prioridade(c), st = STATUS[c.status], dr = diasRestantes(c);
  const slaTxt = pr === "respondida" ? "Respondido — avisar cliente" : pr === "concluida" ? "Concluído" : pr === "critico" ? "Crítico — sem resposta há +24h" : pr === "atrasado" ? "Atrasado" : (dr <= 0 ? "Vence hoje" : `Responder em ${dr} ${dr === 1 ? "dia" : "dias"}`);
  const slaCls = pr === "critico" ? "critico" : pr === "atrasado" ? "late" : pr === "perto" ? "warn" : "";
  // um único selo por chamado, conforme a faixa de prioridade
  const urg = presale
    ? (pr === "critico" ? <span className="badge b-critico" title={Math.floor(R.horasSemAtualizar(c)) + "h sem atualização"}>🔴 Crítico — sem atualização</span> : null)
    : pr === "critico" ? <span className="badge b-critico">🔴 Crítico</span>
    : pr === "atrasado" ? <span className="badge b-urgente">⏰ Atrasado</span>
    : pr === "urgente" ? <span className="badge b-urgente">⚠ Urgente</span> : null;
  const att = c.anexos && c.anexos.length ? <span className="att-count">📎 {c.anexos.length}</span> : null;

  let linha2: React.ReactNode;
  if (presale && c.setorDestino === "atendente_cliente") {
    const vendaTxt = c.venda ? (" · venda " + c.venda.numero + (c.venda.vendedor ? " · " + c.venda.vendedor : "") + (R.podeVerValor(c) && c.venda.valor ? " · R$ " + c.venda.valor : "")) : "";
    linha2 = <><ScBadge c={c} />{vendaTxt}{c.atendenteId ? " · atendente " + R.nomeUser(c.atendenteId) : ""}</>;
  } else if (presale && c.setorDestino === "suporte_consultores") {
    linha2 = <>Vinda à loja <b>{fmtDateTime(c.dataLoja)}</b></>;
  } else if (presale) {
    const dv = c.dataVisita ? fmtDiaHora(c.dataVisita) : "sem data";
    linha2 = <>Visita <b>{dv}</b>{c.tratativa && c.tratativa.contatoIniciado ? <> <span className="pill">contato iniciado</span></> : null} · Consultor {c.consultorId ? R.nomeUser(c.consultorId) : "—"}{c.endereco ? " · " + c.endereco : ""}</>;
  } else {
    linha2 = <>Pedido <b>{c.pedido}</b> · {c.produto}</>;
  }
  return (
    <div className="ticket" data-id={c.id} data-prazo={pr === "urgente" ? "atrasado" : pr} onClick={() => abrirDetalhe(c.id)}>
      <span className="bar"></span>
      <div className="idcol"><span className="tid">{c.id}</span><span className="tdate">{fmtDateTime(c.criadoEm)}</span></div>
      <div className="main">
        <div className="cli">{presale ? <>{c.cliente} {urg}</> : <>{c.cliente} · <b>{R.nomeFab(c.fabrica)}</b> {urg}</>}</div>
        <div className="meta"><span className="pill">{R.tipoNome(c.tipo)}</span> <span className="pill setor">{R.setorNome(c.setorDestino)}</span> · {linha2} {att}</div>
        {resposta && c.resposta && (
          <div className="resp-inline"><b>Retorno:</b> {c.resposta.texto || "—"}{c.resposta.previsao ? " · previsão " + fmtDate(c.resposta.previsao) : ""} <span style={{ color: "var(--ink-faint)" }}>({c.resposta.quem || "—"})</span></div>
        )}
      </div>
      <div className="right">{presale ? <ScBadge c={c} /> : <span className={"badge " + st.cls}>{st.label}</span>}{presale ? null : <span className={"sla " + slaCls}>{slaTxt}</span>}</div>
    </div>
  );
}

export const Vazio = ({ big, children }: { big: string; children?: React.ReactNode }) => <div className="empty"><div className="big">{big}</div>{children}</div>;
