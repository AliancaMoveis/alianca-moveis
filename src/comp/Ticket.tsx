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
  const slaTxt = pr === "informar" ? "Avisar o cliente" : pr === "respondida" ? "Respondido — falta concluir" : pr === "concluida" ? "Concluído" : pr === "critico" ? "Crítico — sem resposta há +24h" : pr === "atrasado" ? "Atrasado" : (dr <= 0 ? "Vence hoje" : `Responder em ${dr} ${dr === 1 ? "dia" : "dias"}`);
  const slaCls = pr === "informar" ? "warn" : pr === "critico" ? "critico" : pr === "atrasado" ? "late" : pr === "perto" ? "warn" : "";
  // um único selo por chamado, conforme a faixa de prioridade
  const urg = presale
    ? (pr === "critico" ? <span className="badge b-critico" title={Math.floor(R.horasSemAtualizar(c)) + "h sem atualização"}>🔴 Crítico — sem atualização</span> : null)
    : pr === "critico" ? <span className="badge b-critico">🔴 Crítico</span>
    : pr === "atrasado" ? <span className="badge b-urgente">⏰ Atrasado</span>
    : pr === "urgente" ? <span className="badge b-urgente">⚠ Urgente</span> : null;
  const att = c.anexos && c.anexos.length ? <span className="att-count">📎 {c.anexos.length}</span> : null;
  // agendamento na loja: origem, sem anexo, quer projeto, parecer
  const t = c.tratativa || {};
  const marcas = presale && (c.dataLoja || c.setorDestino === "suporte_consultores" || c.setorDestino === "atendente_cliente") ? <>
    <span className={"origem " + R.origemLoja(c)}>{R.origemLoja(c) === "marketing" ? "Marketing" : "Externo"}</span>{" "}
    {R.semAnexo(c) && <><span className="badge b-semanexo">⚠️ Sem anexo</span>{" "}</>}
    {t.querProjeto === "sim" && <><span className="marca-loja sim">📐 Quer projeto</span>{" "}</>}
    {R.acompAtivo(c) ? <><span className="badge b-critico">🚨 {c.tratativa.acomp.status === "pendente" ? "Supervisão chamada" : "Em acompanhamento"}</span>{" "}</> : null}
    {R.parecerCobrado(c) ? <><span className="badge b-critico">Parecer cobrado</span>{" "}</> : R.semParecer(c) ? <><span className="badge b-urgente">Sem parecer</span>{" "}</> : null}
  </> : (presale && R.semAnexo(c) ? <><span className="badge b-semanexo">⚠️ Sem anexo</span>{" "}</> : null);

  let linha2: React.ReactNode;
  if (presale && c.setorDestino === "atendente_cliente") {
    const vendaTxt = c.venda ? (" · venda " + c.venda.numero + (c.venda.vendedor ? " · " + c.venda.vendedor : "") + (R.podeVerValor(c) && c.venda.valor ? " · R$ " + c.venda.valor : "")) : "";
    linha2 = <><ScBadge c={c} />{vendaTxt}{c.atendenteId ? " · vendedor " + R.nomeUser(c.atendenteId) : ""}{c.tratativa && c.tratativa.assumidoFila ? <> <span className="marca-loja assumido">assumido na fila</span></> : null}{c.dataLoja ? <> · loja <b>{fmtDiaHora(c.dataLoja)}</b></> : null}</>;
  } else if (presale && c.setorDestino === "suporte_consultores") {
    linha2 = <>Vinda à loja <b>{fmtDateTime(c.dataLoja)}</b> · {c.tratativa && c.tratativa.atendenteExterno ? <b style={{ color: "#8a4b00" }}>Freelancer {c.tratativa.atendenteExterno} assumiu na fila — definir responsável</b> : c.tratativa && c.tratativa.pedidoAtend ? <b style={{ color: "var(--primary)" }}>{c.tratativa.pedidoAtendNome || "vendedor"} pediu — aguardando aprovação</b> : <b style={{ color: "var(--warn)" }}>Sem vendedor · fila</b>}</>;
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
        <div className="cli">{presale ? <>{c.cliente} {marcas}{urg}</> : <>{c.cliente}{R.ehFabrica(c) && c.fabrica ? <> · <b>{R.nomeFab(c.fabrica)}</b></> : null} {urg}</>}</div>
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
