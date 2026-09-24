// Ficha do chamado/cliente — porta do abrirDetalhe() do protótipo, com os mesmos blocos e textos.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../estado";
import { A, comprimir, enviarFotos } from "../lib/acoes";
import {
  PV_ENCAMINHAR, PV_ORIGEM, PV_RESP, PV_TIPOS, fmtMoeda, ORDEM, STATUS, STATUS_CLIENTE, VENDA_STATUS, estaAtrasado, fmtDate, fmtDateTime, fmtDT, hojeISO, isoLocal, mesmaPessoa, parseMoeda, situacaoPrazo,
} from "../lib/regras";
import { ScBadge } from "./Ticket";

const Row = ({ k, children, style }: any) => <div className="detail-row" style={style}><span className="k">{k}</span><span className="v">{children}</span></div>;
const RowSb = ({ k, children, pb = "4px 0", bold }: any) => <div className="detail-row" style={{ border: 0, padding: pb }}><span className="k">{k}</span><span className="v" style={bold ? { fontWeight: 700 } : undefined}>{children}</span></div>;
const corVenda = (vs: string) => vs === "efetivada" ? "var(--st-concluida)" : vs === "promissoria" ? "var(--st-tratativa)" : vs === "cancelada" ? "var(--danger)" : "var(--warn)";
const VENDA_SC = ["vendido", "vendido_revisao", "vendido_promissoria", "venda_cancelada"];

export default function Detalhe({ id }: { id: string }) {
  const app = useApp();
  const { R, st, fecharDetalhe, focoDetalhe, abrirDetalhe } = app;
  const c = st.chamados.find(x => x.id === id);
  const notaRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focoDetalhe === "nota") setTimeout(() => notaRef.current?.focus(), 150); }, [focoDetalhe, id]);
  if (!c) return (
    <div className="overlay on" id="overlay" onMouseDown={e => { if (e.target === e.currentTarget) fecharDetalhe(); }}>
      <div className="modal" id="modal"><div className="mh"><div className="tid">{id}</div><button className="x" onClick={fecharDetalhe}>&times;</button></div>
        <div className="mb"><div className="ro-note">Este chamado não está mais visível para você.</div></div></div>
    </div>
  );

  // dados da fábrica e contato do representante só em Solicitação Fábrica (prazo de fábrica)
  const ehFab = R.ehFabrica(c);
  const st_ = STATUS[c.status], late = estaAtrasado(c), rep = R.getRep(c), fab = R.getFab(c), link = ehFab ? R.waLink(c) : null, tratar = R.podeTratar(c), anexar = R.podeAnexar(c);
  const presale = R.domMarketing(c);
  const prazoSit = situacaoPrazo(c);
  const prio = R.prioridade(c);
  const semResp = c.status === "aberta" || c.status === "tratativa";
  const t = c.tratativa || {};
  const tratResumo = [t.montador ? "Responsável: " + t.montador : "", t.peca ? "Peça: " + t.peca : "", t.agenda ? "Agenda: " + fmtDate(t.agenda) : "", t.data ? "Vistoria: " + fmtDate(t.data) : "", t.aprovada ? "Vistoria aprovada" : "", t.entregaTatico ? "No Tático" : "", t.medidas ? "Medidas: " + t.medidas : "", t.confirmado ? "Confirmado com cliente" : "", t.obs ? "Obs.: " + t.obs : "", t.realizada ? "Visita realizada" : "", c.dataLoja ? "Vinda à loja: " + fmtDateTime(c.dataLoja) : "", t.vendedor ? "Vendedor: " + t.vendedor : ""].filter(Boolean).join(" · ");
  const ex = app.executar;
  const trat = <Tratativa c={c} />;
  const temTrat = tratativaExiste(c, R);

  return (
    <div className="overlay on" id="overlay" onMouseDown={e => { if (e.target === e.currentTarget) fecharDetalhe(); }}>
      <div className="modal" id="modal">
        <div className="mh">
          <div><span className="tid">{c.id}</span>{" "}
            {presale ? <span style={{ marginLeft: 8 }}><ScBadge c={c} /></span> : <span className={"badge " + st_.cls} style={{ marginLeft: 8 }}>{st_.label}</span>}{" "}
            {presale ? (R.clienteCriticoInatividade(c) ? <span className="badge b-critico" style={{ marginLeft: 6 }}>🔴 Crítico — sem atualização</span> : null)
              : (prio === "critico" ? <span className="badge b-critico" style={{ marginLeft: 6 }}>🔴 Crítico</span> : prio === "atrasado" ? <span className="badge b-urgente" style={{ marginLeft: 6 }}>⏰ Atrasado</span> : prio === "urgente" ? <span className="badge b-urgente" style={{ marginLeft: 6 }}>⚠ Urgente</span> : null)}
          </div>
          <button className="x" id="fechar" onClick={fecharDetalhe}>&times;</button>
        </div>
        <div className="mb">
          {presale ? <ClienteCard c={c} /> : <Row k="Motivo">{R.tipoNome(c.tipo)} <span className="pill setor" style={{ marginLeft: 6 }}>{R.setorNome(c.setorDestino)}</span></Row>}
          {c.escalonadoAuto && semResp && <div className="ro-note" style={{ marginBottom: 14 }}>Escalonado automaticamente em {fmtDateTime(c.escaladoEm || c.slaResposta)} por falta de resposta dentro do prazo.</div>}
          {tratar && temTrat && <div className="acao-etapa"><div className="acao-etapa-tit">Ação desta etapa</div>{trat}</div>}
          {presale && <>
            <StatusCliente c={c} />
            <Venda c={c} />
            <Vendedor c={c} />
            <DataLoja c={c} />
            <Destaque c={c} anexar={anexar} />
            <Anexos c={c} editavel={anexar} />
            <HistoricoCliente c={c} />
          </>}
          {!presale && <>
            <Row k="Cliente">{c.cliente}{c.clienteDoc ? " · " + c.clienteDoc : ""}{c.telefone ? " · " + c.telefone : ""}</Row>
            <Row k="Pedido venda">{c.pedido}{c.dataVenda ? " · " + fmtDate(c.dataVenda) : ""}</Row>
            <Row k="Produto">{c.produto}</Row>
            {ehFab && <>
              <Row k="Pedido fábrica">{c.pedidoFabrica || "—"}</Row>
              <Row k="Fábrica">{fab ? fab.nome : (tratar ? <DefinirFabrica c={c} /> : "—")}{fab && fab.emails ? " · " + fab.emails : ""}</Row>
              <Row k="Representante">{rep ? rep.nome : "—"}{rep && rep.whats ? " · " + rep.whats : ""}</Row>
            </>}
            {(ehFab || c.tipo === "entrega") && c.prazoTatico && <Row k="Prazo Tático">{fmtDate(c.prazoTatico)}</Row>}
          </>}
          {presale && <Row k="Motivo do contato">{R.tipoNome(c.tipo)}</Row>}
          <Row k="Solicitado por">{c.solicitante} · {c.setor || "—"}</Row>
          <Row k="Detalhe">{c.motivo || "—"}</Row>
          {tratResumo && <Row k="Tratativa">{tratResumo}</Row>}
          {c.resposta && <><Row k="Previsão informada">{fmtDate(c.resposta.previsao)}</Row><Row k="Observação">{c.resposta.texto || "—"}</Row></>}
          {c.status === "informar" && <div className="alerta" style={{ background: "var(--st-informar-bg)", borderColor: "var(--st-informar)" }}><b style={{ color: "var(--st-informar)" }}>Informar o cliente.</b> O setor {R.setorNome(c.setorDestino)} registrou a solução{c.resposta && c.resposta.previsao ? " (previsão " + fmtDate(c.resposta.previsao) + ")" : ""}. O call center avisa o cliente e conclui.</div>}
          {tratar && late && semResp && (prazoSit === "critico" ? (
            <div className="alerta" style={{ background: "var(--critico-bg)", borderColor: "var(--critico)" }}><b style={{ color: "var(--critico)" }}>Crítico — mais de 24h sem resposta.</b> O sistema já escalou este chamado automaticamente. Cobre agora.
              {link && <div className="row"><a className="btn wa sm" href={link} target="_blank" rel="noopener">Cobrar no WhatsApp</a></div>}</div>
          ) : (
            <div className="alerta"><b>Atrasado — escalado automaticamente para urgente.</b> {ehFab ? "Cobre o representante ou trate agora." : "Trate agora."}
              <div className="row">{link && <a className="btn wa sm" href={link} target="_blank" rel="noopener">Cobrar no WhatsApp</a>}
                <button className="btn sm" onClick={() => ex(() => A.alternarUrgente(c.id), c.urgente ? "Urgência removida" : "Marcado urgente")}>{c.urgente ? "Remover urgência" : "Marcar urgente"}</button></div></div>
          ))}
          {!presale && <Anexos c={c} editavel={anexar} />}
          {!presale && <HistoricoCliente c={c} />}
          {tratar ? <AcoesGerais c={c} link={link} presale={presale} notaRef={notaRef} foco={focoDetalhe} />
            : R.podeAcompanhar(c) ? <AcompanhamentoCC c={c} link={link} notaRef={notaRef} foco={focoDetalhe} />
            : <div className="ro-note">Você tem acesso de leitura a este chamado. Quem trata é o setor <b>{R.setorNome(c.setorDestino)}</b>.{anexar ? " Você pode anexar comprovações acima." : ""}</div>}
          <div className="hist"><h4>Histórico</h4>{c.historico.slice().reverse().map((x: any, i: number) => <div className="h" key={i}><b>{fmtDateTime(x.quando)}</b> · {x.quem} — {x.texto}</div>)}</div>
          <Vinculados c={c} />
          {c.vinculadoA && <div className="ro-note" style={{ marginTop: 10 }}>Vinculado ao atendimento <a href="#" onClick={e => { e.preventDefault(); abrirDetalhe(c.vinculadoA); }}>{c.vinculadoA}</a>.</div>}
        </div>
      </div>
    </div>
  );
}

// ---------------- blocos ----------------
function ClienteCard({ c }: any) {
  const { R } = useApp();
  const direto = !!(R.TIPOS[c.tipo] && R.TIPOS[c.tipo].direto);
  const consultor = c.consultorId ? R.getUser(c.consultorId) : null;
  const dataChave = direto ? c.dataLoja : c.dataVisita;
  const itens: [string, string][] = [["Telefone", c.telefone || "—"], ["E-mail", c.email || "—"], [direto ? "Data na loja" : "Data da visita", dataChave ? fmtDT(dataChave) : "—"], ["Ambiente de interesse", c.produto || "—"]];
  if (!direto) itens.splice(2, 0, ["Consultor", consultor ? consultor.nome : "—"], ["Endereço", c.endereco || "—"]);
  if (c.atendenteId) itens.push(["Vendedor / Projetista", R.nomeUser(c.atendenteId)]);
  const wa = R.waLinkCliente(c), maps = R.mapsLink(c), waze = R.wazeLink(c);
  return (
    <div className="cli-card">
      <div className="cli-card-nome">{c.cliente}</div>
      <div className="cli-card-sub">{c.clienteDoc ? c.clienteDoc + " · " : ""}{c.id}</div>
      <div className="cli-card-grid">{itens.map(([k, v]) => <div className="item" key={k}><span className="k">{k}</span><span className="v">{v}</span></div>)}</div>
      <div className="cli-card-acoes">
        {wa ? <a className="btn wa sm" href={wa} target="_blank" rel="noopener">WhatsApp do cliente</a> : <button className="btn sm" disabled>Sem telefone</button>}
        {maps && <a className="btn sm" href={maps} target="_blank" rel="noopener">Abrir no Maps</a>}
        {waze && <a className="btn sm" href={waze} target="_blank" rel="noopener">Abrir no Waze</a>}
      </div>
    </div>
  );
}

function tratativaExiste(c: any, R: any) {
  if (["montagem", "assistencia", "vistoria", "entrega", "checklist", "medidas", "posvenda"].includes(c.tipo)) return true;
  if (!R.domMarketing(c)) return false;
  return ["marketing_supervisao", "consultor_externo", "suporte_consultores", "atendente_cliente"].includes(c.setorDestino);
}

function Tratativa({ c }: any) {
  const { R, executar: ex, toast } = useApp();
  const t = c.tratativa || {};
  const [v, setV] = useState<any>({ agenda: t.agenda || "", montador: t.montador || "", peca: t.peca || "", data: t.data || "", medidas: t.medidas || "", obs: t.obs || "" });
  const [cons, setCons] = useState(c.consultorId || "");
  const [editAg, setEditAg] = useState(false);
  const [dv, setDv] = useState(c.dataVisita || ""); const [end, setEnd] = useState(c.endereco || "");
  const [dataLoja, setDataLoja] = useState(c.dataLoja ? String(c.dataLoja).slice(0, 16) : "");
  const [aten, setAten] = useState("");
  useEffect(() => { setV({ agenda: t.agenda || "", montador: t.montador || "", peca: t.peca || "", data: t.data || "", medidas: t.medidas || "", obs: t.obs || "" }); }, [c.id, JSON.stringify(t)]);
  const s = (k: string) => (e: any) => setV((x: any) => ({ ...x, [k]: e.target.value }));
  const salvar = (campos: string[]) => ex(() => A.salvarTratativa(c.id, Object.fromEntries(campos.map(k => [k, v[k]]))), "Tratativa salva");
  const marcar = (campo: string) => ex(() => A.alternarMarcacao(c.id, campo), "Atualizado");
  const Btn = ({ on, ids, lOn, lOff, campo }: any) => <button className={"btn " + (on ? "" : "primary") + " sm"} id={ids} onClick={() => marcar(campo)}>{on ? lOn : lOff}</button>;

  if (c.tipo === "posvenda") return <TratPosvenda c={c} />;
  if (c.tipo === "montagem") return <div className="resp-box"><h4>Tratativa — Montagem (Exact)</h4><div className="grid"><div className="field"><label>Data agendada</label><input type="date" value={v.agenda} onChange={s("agenda")} /></div><div className="field"><label>Montador</label><input value={v.montador} onChange={s("montador")} placeholder="Nome do montador" /></div></div><div style={{ marginTop: 12 }}><button className="btn primary sm" onClick={() => salvar(["agenda", "montador"])}>Salvar tratativa</button></div></div>;
  if (c.tipo === "assistencia") return <div className="resp-box"><h4>Tratativa — Assistência (peça + montador)</h4><div className="grid"><div className="field"><label>Peça solicitada</label><input value={v.peca} onChange={s("peca")} placeholder="Ex.: puxador, dobradiça…" /></div><div className="field"><label>Montador designado</label><input value={v.montador} onChange={s("montador")} /></div></div><div style={{ marginTop: 12 }}><button className="btn primary sm" onClick={() => salvar(["peca", "montador"])}>Salvar tratativa</button></div></div>;
  if (c.tipo === "vistoria") return <div className="resp-box"><h4>Tratativa — Vistoria (aprovar e designar)</h4><div className="grid"><div className="field"><label>Montador de vistoria</label><input value={v.montador} onChange={s("montador")} /></div><div className="field"><label>Data da vistoria</label><input type="date" value={v.data} onChange={s("data")} /></div></div><div style={{ marginTop: 12, display: "flex", gap: 9, flexWrap: "wrap" }}><Btn on={t.aprovada} campo="aprovada" lOn="Vistoria aprovada ✓" lOff="Aprovar vistoria" /><button className="btn primary sm" onClick={() => salvar(["montador", "data"])}>Salvar tratativa</button></div></div>;
  if (c.tipo === "entrega") return <div className="resp-box"><h4>Tratativa — Entrega (Tático)</h4><p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "0 0 12px" }}>Se há disponibilidade, coloque para entrega no Tático. Se não houver, encaminhe para Prazo de fábrica.</p><div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}><Btn on={t.entregaTatico} campo="entregaTatico" lOn="Enviado ao Tático ✓" lOff="Colocar para entrega (Tático)" /><button className="btn sm" onClick={() => ex(() => A.entregaParaFabrica(c.id), "Encaminhado para Prazo de fábrica")}>Sem disponibilidade → Prazo de fábrica</button></div></div>;
  if (c.tipo === "checklist") return <div className="resp-box"><h4>Tratativa — Checklist (revisão do projeto)</h4><div className="grid"><div className="field"><label>Data do checklist</label><input type="date" value={v.agenda} onChange={s("agenda")} /></div><div className="field"><label>Responsável pela revisão</label><input value={v.montador} onChange={s("montador")} placeholder="Nome de quem revisa" /></div></div><div style={{ marginTop: 12 }}><button className="btn primary sm" onClick={() => salvar(["agenda", "montador"])}>Salvar tratativa</button></div></div>;
  if (c.tipo === "medidas") return <div className="resp-box"><h4>Tratativa — Medidas</h4><div className="grid"><div className="field full"><label>Medidas informadas ao cliente</label><textarea value={v.medidas} onChange={s("medidas")} placeholder="Ex.: Largura 2,40m x altura 2,60m x profundidade 0,60m"></textarea></div></div><div style={{ marginTop: 12, display: "flex", gap: 9, flexWrap: "wrap" }}><Btn on={t.confirmado} campo="confirmado" lOn="Confirmado com o cliente ✓" lOff="Confirmar com o cliente" /><button className="btn primary sm" onClick={() => salvar(["medidas"])}>Salvar tratativa</button></div></div>;
  if (!R.domMarketing(c)) return null;

  if (c.setorDestino === "marketing_supervisao") {
    if (!(R.temMarketing() || R.ehGestao())) return <div className="resp-box"><h4>Aguardando direcionamento</h4><div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>A Supervisão Marketing ainda vai direcionar este cliente ao consultor. Depois disso aparecem aqui os campos da visita e o agendamento na loja.</div></div>;
    return (
      <div className="resp-box"><h4>Designar consultor</h4>
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 9, padding: "11px 13px", marginBottom: 14, fontSize: 13 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 7 }}>Dados já cadastrados</div>
          <div style={{ marginBottom: 4 }}><span style={{ color: "var(--ink-soft)" }}>Endereço:</span> <b>{c.endereco || "não informado"}</b></div>
          <div><span style={{ color: "var(--ink-soft)" }}>Visita:</span> <b>{c.dataVisita ? fmtDT(c.dataVisita) : "não informada"}</b></div>
        </div>
        <div className="grid"><div className="field full"><label>Consultor externo <span className="req-star">*</span></label>
          <select value={cons} onChange={e => setCons(e.target.value)}><option value="">Selecione…</option>{R.consultores().map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div></div>
        <div style={{ marginTop: 12, display: "flex", gap: 9, flexWrap: "wrap" }}>
          <button className="btn primary sm" onClick={() => { if (!cons) { toast("Selecione o consultor"); return; } ex(() => A.direcionarConsultor(c.id, cons, editAg ? dv : "", editAg ? end : ""), "Direcionado ao consultor"); }}>Direcionar ao consultor</button>
          <button className="btn ghost sm" onClick={() => setEditAg(x => !x)}>Corrigir endereço/data</button>
        </div>
        {editAg && <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}><div className="grid">
          <div className="field"><label>Data/horário da visita</label><input type="datetime-local" value={dv} onChange={e => setDv(e.target.value)} /></div>
          <div className="field full"><label>Endereço da visita</label><input value={end} onChange={e => setEnd(e.target.value)} placeholder="Rua, número, bairro, cidade" /></div>
        </div></div>}
      </div>
    );
  }
  if (c.setorDestino === "consultor_externo") {
    return (
      <div className="resp-box"><h4>Tratativa — Visita do consultor {t.contatoIniciado && <span className="badge b-tratativa" style={{ marginLeft: 8 }}>Contato iniciado</span>}</h4>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 14 }}><Btn on={t.contatoIniciado} campo="contatoIniciado" lOn="Contato iniciado ✓" lOff="Marcar contato iniciado" /></div>
        <div style={{ padding: "11px 13px", background: "var(--primary-soft)", border: "1px dashed var(--primary)", borderRadius: 9, marginBottom: 12, fontSize: 12.5, color: "var(--primary)" }}><b>Planta baixa e medidas:</b> anexe as fotos no bloco “Comprovações / anexos”, abaixo. Use o campo ao lado só para complementos.</div>
        <div className="grid">
          <div className="field full"><label>Complemento das medidas <span className="hint">(opcional — o oficial é a planta anexada)</span></label><textarea value={v.medidas} onChange={s("medidas")} placeholder="Ex.: cotas que não aparecem na planta"></textarea></div>
          <div className="field full"><label>Observação da visita</label><textarea value={v.obs} onChange={s("obs")} placeholder="Condições do local, acesso, particularidades..."></textarea></div>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 9, flexWrap: "wrap" }}><button className="btn primary sm" onClick={() => salvar(["medidas", "obs"])}>Salvar</button><Btn on={t.realizada} campo="realizada" lOn="Visita realizada ✓" lOff="Marcar visita como realizada" /></div>
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Agendamento na loja</div>
          <div className="grid"><div className="field"><label>Data e horário na loja <span className="req-star">*</span></label><input type="datetime-local" value={dataLoja} onChange={e => setDataLoja(e.target.value)} /></div></div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", margin: "6px 0 10px" }}>Ao agendar, o cliente vai para a fila do Suporte Consultores, que designa o vendedor.</div>
          <button className="btn primary sm" onClick={() => { if (!dataLoja || dataLoja.length < 16) { toast("Informe a data e o horário da vinda à loja"); return; } ex(() => A.agendarLoja(c.id, dataLoja, v.medidas, v.obs), "Agendado — enviado para designar o vendedor"); }}>Agendar na loja e encaminhar</button>
        </div>
      </div>
    );
  }
  if (c.setorDestino === "suporte_consultores") {
    if (!R.podeEditarAgenda()) return <div className="resp-box"><h4>Aguardando direcionamento a um projetista</h4><div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>O Suporte a Consultores, a Supervisão de Marketing ou a Gestão fazem esse direcionamento.</div></div>;
    return (
      <div className="resp-box"><h4>Direcionar a um projetista</h4>
        {t.medidas && <RowSb k="Medidas">{t.medidas}</RowSb>}
        {t.obs && <RowSb k="Observação">{t.obs}</RowSb>}
        <RowSb k="Vinda à loja" pb="4px 0 12px">{fmtDateTime(c.dataLoja)}</RowSb>
        <div className="grid"><div className="field"><label>Projetista que vai atender</label><select value={aten} onChange={e => setAten(e.target.value)}><option value="">Selecione…</option>{R.projetistas().map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div></div>
        <div style={{ marginTop: 12 }}><button className="btn primary sm" onClick={() => { if (!aten) { toast("Selecione o atendente"); return; } ex(() => A.designarProjetista(c.id, aten), "Encaminhado ao atendente"); }}>Direcionar ao projetista</button></div>
      </div>
    );
  }
  if (c.setorDestino === "atendente_cliente") {
    const sc = c.statusCliente || "com_vendedor";
    const scReal = R.statusClienteDe(c);
    const infoTop = <>{t.medidas && <RowSb k="Medidas">{t.medidas}</RowSb>}<RowSb k="Vinda à loja" pb="4px 0 12px">{fmtDateTime(c.dataLoja)}</RowSb></>;
    if (c.venda || VENDA_SC.includes(sc)) {
      const vv = c.venda || {}; const vs = vv.status || "registrada";
      return (
        <div className="resp-box"><h4>Atendimento concluído <ScBadge c={c} /></h4>
          {vv.numero && <RowSb k="Venda">Nº {vv.numero}{R.podeVerValor(c) && vv.valor ? " · R$ " + vv.valor : ""}</RowSb>}
          {R.ehGestao() ? (
            <div style={{ marginTop: 12 }}><div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>Situação da venda: <b>{VENDA_STATUS[vs] || vs}</b> — alterar para:</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {vs !== "efetivada" && <button className="btn primary sm" onClick={() => ex(() => A.decidirVenda(c.id, "efetivada"), "Situação atualizada")}>Efetivada</button>}
                {vs !== "promissoria" && <button className="btn sm" onClick={() => ex(() => A.decidirVenda(c.id, "promissoria"), "Situação atualizada")}>Promissória</button>}
                {vs !== "cancelada" && <button className="btn danger sm" onClick={() => ex(() => A.decidirVenda(c.id, "cancelada"), "Situação atualizada")}>Cancelar venda</button>}
              </div></div>
          ) : <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 8 }}>Situação da venda: <b>{VENDA_STATUS[vs] || vs}</b>. Só a Gestão altera.</div>}
        </div>
      );
    }
    if (scReal === "nao_compareceu") return <div className="resp-box"><h4>Cliente não compareceu</h4>{infoTop}<button className="btn sm" onClick={() => ex(() => A.marcarComparecimento(c.id, "voltou"), "Reaberto")}>Cliente veio afinal — reabrir</button></div>;
    if (sc === "com_vendedor") return <div className="resp-box"><h4>Atendimento em loja <ScBadge c={c} /></h4>{infoTop}<div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Registre a venda no bloco “Dados da venda”, abaixo.</div></div>;
    return <div className="resp-box"><h4>Aguardando o cliente na loja <ScBadge c={c} /></h4>{infoTop}<div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
      <button className="btn primary sm" onClick={() => ex(() => A.marcarComparecimento(c.id, "chegou"), "Atualizado")}>Cliente chegou — com vendedor</button>
      <button className="btn sm" onClick={() => ex(() => A.marcarComparecimento(c.id, "nao_compareceu"), "Atualizado")}>Cliente não compareceu</button></div></div>;
  }
  return null;
}

function StatusCliente({ c }: any) {
  const { R, executar: ex, toast } = useApp();
  const atual = R.statusClienteDe(c);
  const [novo, setNovo] = useState(atual);
  const [dl, setDl] = useState(c.dataLoja ? String(c.dataLoja).slice(0, 16) : "");
  useEffect(() => { setNovo(atual); setDl(c.dataLoja ? String(c.dataLoja).slice(0, 16) : ""); }, [atual, c.id, c.dataLoja]);
  const pedeData = novo === "agendado_loja";
  if (!(R.podeTratar(c) || R.ehGestao())) return <Row k="Status do cliente"><ScBadge c={c} /></Row>;
  const g = R.ehGestao();
  const opcoes = Object.keys(STATUS_CLIENTE).filter(k => g || !VENDA_SC.includes(k) || k === atual);
  async function aplicar() {
    if (pedeData) {
      if (!dl || dl.length < 16) { toast("Agendado loja: informe a data e o horário na loja"); return; }
      const mudouData = !c.dataLoja || String(c.dataLoja).slice(0, 16) !== dl;
      if (novo === atual && !mudouData) { toast("O status já é esse"); return; }
      ex(() => A.alterarStatusCliente(c.id, novo, dl), "Agendado — vai para designar o vendedor"); return;
    }
    if (novo === atual) { toast("O status já é esse"); return; }
    if (novo === "vendido" && !g) { toast("Só a Gestão pode confirmar a venda como efetivada"); setNovo(atual); return; }
    if (novo === "vendido" && !c.venda) {
      toast("Registre os dados da venda abaixo — número e valor são obrigatórios");
      const alvo = document.getElementById("tVendaNumero");
      if (alvo) { alvo.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => (alvo as HTMLInputElement).focus(), 350); }
      setNovo(atual); return;
    }
    ex(() => A.alterarStatusCliente(c.id, novo), "Status atualizado");
  }
  return (
    <div className="resp-box"><h4>Status do cliente</h4>
      <div className="inline-2"><div className="field"><select id="selStatusCliente" value={novo} onChange={e => setNovo(e.target.value)}>{opcoes.map(k => <option key={k} value={k} disabled={!g && VENDA_SC.includes(k)}>{STATUS_CLIENTE[k]}</option>)}</select></div><button className="btn sm" onClick={aplicar}>{pedeData ? "Salvar agendamento" : "Alterar status"}</button></div>
      {pedeData && <div className="grid" style={{ marginTop: 10 }}><div className="field"><label>Data e horário na loja <span className="req-star">*</span></label><input type="datetime-local" value={dl} onChange={e => setDl(e.target.value)} /></div></div>}
      <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 8 }}>{g ? "Toda alteração fica registrada no histórico, abaixo." : "A confirmação final da venda (“Vendido”) só a Gestão pode dar — registre a venda abaixo e aguarde."}</div>
    </div>
  );
}

function Venda({ c }: any) {
  const { R, executar: ex, toast } = useApp();
  const [editando, setEditando] = useState(false);
  const v = c.venda || null;
  const iniF = () => ({ numero: v?.numero || "", valor: v?.valor || "", data: v?.dataVenda || hojeISO(), vendedor: v?.vendedor || (c.atendenteId ? R.nomeUser(c.atendenteId) : "") || R.me()?.nome || "" });
  const iniG = () => ({ status: v?.status || "registrada", numero: v?.numero || "", valor: v?.valor || "", data: v?.dataVenda || "", vendedor: v?.vendedor || "" });
  const [f, setF] = useState<any>(iniF);
  const [g, setG] = useState<any>(iniG);
  useEffect(() => { setF(iniF()); setG(iniG()); setEditando(false); }, [c.id, JSON.stringify(v)]);
  if (!c.venda && !c.dataLoja) return null;
  const podeRegistrar = R.podeTratar(c) || R.ehGestao();
  const vejaVal = R.podeVerValor(c);
  const s = (k: string) => (e: any) => setF((x: any) => ({ ...x, [k]: e.target.value }));
  const sg = (k: string) => (e: any) => setG((x: any) => ({ ...x, [k]: e.target.value }));

  async function registrar() {
    if (!f.numero.trim()) { toast("Informe o número da venda"); document.getElementById("tVendaNumero")?.focus(); return; }
    if (!String(f.valor).trim() || parseMoeda(f.valor) <= 0) { toast("Informe o valor da venda"); document.getElementById("tVendaValor")?.focus(); return; }
    if (!f.vendedor.trim()) { toast("Informe o vendedor da loja"); return; }
    const ed = !!c.venda;
    await ex(() => A.registrarVenda(c.id, f.numero.trim(), parseMoeda(f.valor), f.data, f.vendedor.trim()), ed ? "Venda atualizada, aguardando validação" : "Venda registrada, aguardando confirmação da Gestão");
  }
  const form = (
    <div className="resp-box"><h4>Dados da venda</h4>
      <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>Preencha quando o cliente fechar a compra. A Gestão confirma depois se é promissória ou efetivada.</div>
      <div className="grid">
        <div className="field"><label>Nº da venda <span className="req-star">*</span></label><input id="tVendaNumero" placeholder="Ex.: 48310" value={f.numero || ""} onChange={s("numero")} /></div>
        <div className="field"><label>Valor da venda <span className="req-star">*</span></label><input id="tVendaValor" placeholder="Ex.: 8.500,00" value={f.valor || ""} onChange={s("valor")} /></div>
        <div className="field"><label>Data da venda</label><input type="date" value={f.data || ""} onChange={s("data")} /></div>
        <div className="field"><label>Vendedor na loja</label><input placeholder="Nome de quem vendeu" value={f.vendedor || ""} onChange={s("vendedor")} /></div>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 9 }}><button className="btn primary sm" onClick={registrar}>Registrar venda</button>{editando && <button className="btn ghost sm" onClick={() => setEditando(false)}>Cancelar</button>}</div>
    </div>
  );
  if (v && !editando) {
    const vs = v.status || "registrada"; const cor = corVenda(vs);
    const nota = vs === "promissoria" ? <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--st-tratativa-bg)", border: "1px solid var(--st-tratativa)", borderRadius: 9, fontSize: 12.5, color: "var(--st-tratativa)" }}><b>Venda sem pagamento.</b> Conta como venda, mas <b>não gera comissão</b> até ser efetivada.</div>
      : vs === "registrada" ? <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--warn-bg)", border: "1px solid var(--warn)", borderRadius: 9, fontSize: 12.5, color: "var(--warn)" }}>Aguardando a Gestão confirmar. Não conta em nenhum relatório ainda.</div>
      : vs === "cancelada" ? <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--danger-bg)", border: "1px solid var(--danger)", borderRadius: 9, fontSize: 12.5, color: "var(--danger)" }}>Venda cancelada — não conta em relatórios nem em comissão.</div> : null;
    return (
      <div className="resp-box" style={{ borderColor: cor }}><h4>Dados da venda <span className="badge" style={{ background: cor, color: "#fff" }}>{VENDA_STATUS[vs] || vs}</span></h4>
        <RowSb k="Nº da venda" pb="5px 0">{v.numero || "—"}</RowSb>
        <RowSb k="Valor" pb="5px 0" bold>{vejaVal ? (v.valor ? "R$ " + v.valor : "—") : "— (restrito)"}</RowSb>
        <RowSb k="Data da venda" pb="5px 0">{v.dataVenda ? fmtDate(v.dataVenda) : "—"}</RowSb>
        <RowSb k="Vendedor na loja" pb="5px 0">{v.vendedor || v.atendenteNome || "—"}</RowSb>
        {nota}
        {!R.ehGestao() && podeRegistrar && vs === "registrada" && <div style={{ marginTop: 12 }}><button className="btn sm" onClick={() => setEditando(true)}>Corrigir dados da venda</button></div>}
        {R.ehGestao() && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 10 }}>Controle da Gestão</div>
            <div className="inline-2"><div className="field"><label>Situação da venda</label><select value={g.status} onChange={sg("status")}>{Object.keys(VENDA_STATUS).map(k => <option key={k} value={k}>{VENDA_STATUS[k]}</option>)}</select></div>
              <button className="btn primary sm" onClick={() => { if (g.status === vs) { toast("A situação já é essa"); return; } ex(() => A.decidirVenda(c.id, g.status), "Situação atualizada"); }}>Aplicar</button></div>
            <div className="grid" style={{ marginTop: 12 }}>
              <div className="field"><label>Nº da venda <span className="req-star">*</span></label><input value={g.numero} onChange={sg("numero")} /></div>
              <div className="field"><label>Valor <span className="req-star">*</span></label><input value={g.valor} onChange={sg("valor")} /></div>
              <div className="field"><label>Data da venda</label><input type="date" value={g.data} onChange={sg("data")} /></div>
              <div className="field"><label>Vendedor</label><input value={g.vendedor} onChange={sg("vendedor")} /></div>
            </div>
            <div style={{ marginTop: 12 }}><button className="btn sm" onClick={() => {
              if (!g.numero.trim()) { toast("Informe o número da venda"); return; }
              if (!String(g.valor).trim() || parseMoeda(g.valor) <= 0) { toast("Informe o valor da venda"); return; }
              ex(() => A.corrigirVenda(c.id, g.numero.trim(), parseMoeda(g.valor), g.data, g.vendedor.trim()), "Correções salvas");
            }}>Salvar correções</button></div>
          </div>
        )}
      </div>
    );
  }
  if (!podeRegistrar) return <div className="resp-box"><h4>Dados da venda</h4><div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Nenhuma venda registrada para este cliente ainda.</div></div>;
  return form;
}

function Vendedor({ c }: any) {
  const { R, executar: ex, toast } = useApp();
  const [novo, setNovo] = useState("");
  if (!c.atendenteId) return null;
  const atual = R.getUser(c.atendenteId);
  const tr = c.transferencia && c.transferencia.status === "pendente" ? c.transferencia : null;
  const autoridade = R.podeEditarAgenda(), souAtual = c.atendenteId === R.currentUserId, souDestino = tr && tr.para === R.currentUserId;
  const projs = R.projetistas().filter(p => p.id !== c.atendenteId);
  const sel = (label: string) => <div className="field"><label>{label}</label><select value={novo} onChange={e => setNovo(e.target.value)}><option value="">Selecione…</option>{projs.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>;
  return (
    <div className="resp-box"><h4>Vendedor designado</h4>
      <RowSb k="Vendedor atual" pb="5px 0" bold>{atual ? atual.nome : "—"}</RowSb>
      {tr ? <>
        <div style={{ marginTop: 10, padding: "12px 14px", background: "var(--warn-bg)", border: "1px solid var(--warn)", borderRadius: 10 }}>
          <div style={{ fontWeight: 700, color: "var(--warn)", fontSize: 13 }}>Transferência pendente</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 5 }}>{R.nomeUser(tr.de)} → <b style={{ color: "var(--ink)" }}>{R.nomeUser(tr.para)}</b> · solicitada por {R.nomeUser(tr.solicitadoPor)} em {fmtDateTime(tr.quando)}</div>
          <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>Até o aceite, o cliente continua com <b>{atual ? atual.nome : "—"}</b>.</div>
          {(souDestino || autoridade) ? <div style={{ marginTop: 11, display: "flex", gap: 9, flexWrap: "wrap" }}>
            <button className="btn primary sm" onClick={() => ex(() => A.responderTransferencia(c.id, true), "Transferência confirmada")}>{souDestino ? "Aceitar transferência" : "Aprovar transferência"}</button>
            <button className="btn danger sm" onClick={() => ex(() => A.responderTransferencia(c.id, false), "Transferência recusada")}>Recusar</button>
          </div> : <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 9 }}>Aguardando aceite de {R.nomeUser(tr.para)} ou aprovação da Gestão/Supervisão/Suporte.</div>}
        </div>
        {(autoridade || souAtual) && <div style={{ marginTop: 10 }}><button className="btn ghost sm" onClick={() => ex(() => A.cancelarTransferencia(c.id), "Solicitação cancelada")}>Cancelar solicitação</button></div>}
      </> : autoridade ? <>
        <div className="inline-2" style={{ marginTop: 12 }}>{sel("Trocar para")}<button className="btn sm" onClick={() => { if (!novo) { toast("Selecione o vendedor"); return; } ex(() => A.trocarVendedor(c.id, novo), "Vendedor alterado"); }}>Alterar vendedor</button></div>
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 7 }}>Como Gestão/Supervisão/Suporte, a troca é aplicada na hora.</div>
      </> : souAtual ? <>
        <div className="inline-2" style={{ marginTop: 12 }}>{sel("Indicar outro vendedor")}<button className="btn sm" onClick={async () => { if (!novo) { toast("Indique o vendedor"); return; } await ex(() => A.solicitarTransferencia(c.id, novo), "Solicitação enviada, aguardando aceite"); }}>Solicitar transferência</button></div>
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 7 }}>A troca só vale após o aceite do outro vendedor ou aprovação da Gestão/Supervisão/Suporte.</div>
      </> : null}
    </div>
  );
}

function DataLoja({ c }: any) {
  const { R, executar: ex, toast } = useApp();
  const val = c.dataLoja ? String(c.dataLoja).slice(0, 16) : "";
  const [nova, setNova] = useState(val);
  useEffect(() => setNova(val), [val]);
  if (!c.dataLoja) return null;
  const quando = fmtDT(c.dataLoja);
  if (!R.podeMudarDataLoja(c)) return (
    <div className="resp-box"><h4>Agendamento na loja</h4><RowSb k="Data e hora" pb="5px 0" bold>{quando}</RowSb>
      <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>Reagendamento feito pelo consultor, Suporte, Supervisão de Marketing ou Gestão.</div></div>
  );
  return (
    <div className="resp-box"><h4>Reagendar vinda à loja</h4>
      <RowSb k="Data e hora atual" pb="5px 0" bold>{quando}</RowSb>
      <div className="inline-2" style={{ marginTop: 12 }}><div className="field"><label>Nova data e hora</label><input type="datetime-local" value={nova} onChange={e => setNova(e.target.value)} /></div>
        <button className="btn sm" onClick={() => { if (!nova) { toast("Informe a nova data"); return; } if (nova === val) { toast("A data já é essa"); return; } ex(() => A.reagendarLoja(c.id, nova), "Vinda à loja reagendada"); }}>Reagendar</button></div>
      <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 7 }}>Gera uma nova data de vinda à loja para este cliente e fica registrado no histórico.</div>
    </div>
  );
}

function Destaque({ c, anexar }: any) {
  const { R, openImg, abrirGaleria } = useApp();
  const sc = R.statusClienteDe(c);
  let titulo = "", valor = "", extra = "", cor = "var(--primary)";
  if (["aguardando_consultor", "direcionado_consultor"].includes(sc)) { titulo = "Data solicitada para a visita"; valor = fmtDT(c.dataVisita); extra = c.endereco || ""; cor = "var(--st-aberta)"; }
  else if (sc === "visita_realizada") { titulo = "Visita feita — falta agendar a loja"; valor = fmtDT(c.dataVisita); extra = "Próximo passo: combinar a data de ida à loja"; cor = "var(--st-respondida)"; }
  else if (["agendado_loja", "com_vendedor"].includes(sc)) { titulo = "Cliente vem à loja em"; valor = fmtDT(c.dataLoja); extra = c.atendenteId ? "Projetista: " + R.nomeUser(c.atendenteId) : "Ainda sem projetista designado"; cor = sc === "com_vendedor" ? "var(--st-respondida)" : "var(--st-aberta)"; }
  else if (VENDA_SC.includes(sc)) { const v = c.venda || {}; titulo = "Venda nº " + (v.numero || "—"); valor = R.podeVerValor(c) && v.valor ? "R$ " + v.valor : "valor restrito"; extra = (VENDA_STATUS[v.status] || "") + (v.dataVenda ? " · " + fmtDate(v.dataVenda) : ""); cor = corVenda(v.status); }
  else if (sc === "nao_compareceu") { titulo = "Cliente não compareceu"; valor = fmtDT(c.dataLoja); cor = "var(--danger)"; }
  if (!titulo) return null;
  const imgs = (c.anexos || []).filter((a: any) => a.tipo === "img"), links = (c.anexos || []).filter((a: any) => a.tipo === "link");
  return (
    <div style={{ border: `2px solid ${cor}`, borderRadius: 13, padding: "14px 16px", margin: "0 0 18px", background: "var(--surface)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: cor }}>{titulo}</div>
      <div style={{ fontSize: 21, fontWeight: 700, marginTop: 4, letterSpacing: "-.02em" }}>{valor}</div>
      {extra && <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>{extra}</div>}
      {(imgs.length || links.length) ? (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)" }}>Planta baixa e fotos do consultor ({imgs.length + links.length})</div>
            {imgs.length > 0 && <button className="btn sm" onClick={() => abrirGaleria(c.id, anexar)}>Ver e baixar</button>}
          </div>
          <div className="thumbs">{imgs.map((a: any, i: number) => <img key={a.id || i} className="thumb" src={a.url} onClick={() => openImg(imgs.map((x: any) => x.url), i)} />)}
            {links.map((a: any, i: number) => <a key={"l" + i} className="att-link" href={a.url} target="_blank" rel="noopener">🔗 link</a>)}</div>
        </div>
      ) : <div style={{ marginTop: 10, fontSize: 12, color: "var(--ink-faint)" }}>Nenhuma planta ou foto anexada ainda.</div>}
    </div>
  );
}

function Anexos({ c, editavel }: any) {
  const { R, executar: ex, toast, openImg, abrirGaleria } = useApp();
  const [link, setLink] = useState(""); const [enviando, setEnviando] = useState(false);
  const presale = R.domMarketing(c);
  const anexos = c.anexos || [];
  const links = anexos.filter((a: any) => a.tipo !== "img");
  const imgs = anexos.filter((a: any) => a.tipo === "img");
  // no call center não existe o quadro de destaque: as fotos aparecem aqui (uma única vez)
  const mostrarFotos = !presale;
  if (!editavel && !links.length && !(mostrarFotos && imgs.length)) return null;
  async function addFotos(files: FileList | null) {
    if (!files || !files.length) return;
    setEnviando(true);
    try {
      const blobs: any[] = [];
      for (const f of Array.from(files)) { const b = await comprimir(f); if (b) blobs.push({ nome: f.name, blob: b }); }
      await ex(async () => { const itens = await enviarFotos(c.id, blobs); await A.adicionarAnexos(c.id, itens, true); });
    } finally { setEnviando(false); }
  }
  return (
    <div className="resp-box"><h4>Anexos{links.length ? " — links (" + links.length + ")" : ""}</h4>
      {mostrarFotos && imgs.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div className="thumbs" style={{ flex: 1 }}>{imgs.map((a: any, i: number) => <img key={a.id || i} className="thumb" src={a.url} onClick={() => openImg(imgs.map((x: any) => x.url), i)} />)}</div>
        <button className="btn sm" onClick={() => abrirGaleria(c.id, editavel)}>Ver e baixar</button></div>}
      {links.length ? <div className="thumbs" id="dThumbs">{links.map((a: any) => (
        <div className="thumb-wrap" key={a.id}><a className="att-link" href={a.url} target="_blank" rel="noopener">🔗 {a.nome.length > 22 ? "link" : a.nome}</a>{editavel && <button className="rm" onClick={() => ex(() => A.removerAnexo(a.id))}>×</button>}</div>
      ))}</div> : (presale ? <span style={{ color: "var(--ink-faint)", fontSize: 12.5 }}>As fotos aparecem no quadro acima. Use aqui só para links de vídeo.</span> : (!imgs.length ? <span style={{ color: "var(--ink-faint)", fontSize: 12.5 }}>Nenhum anexo ainda.</span> : null))}
      {editavel && <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label className="btn sm" style={{ cursor: "pointer" }}>{enviando ? "Enviando…" : "Anexar foto"}<input type="file" accept="image/*" multiple style={{ display: "none" }} disabled={enviando} onChange={e => { addFotos(e.target.files); e.target.value = ""; }} /></label>
        <input placeholder="Colar link de vídeo" style={{ flex: 1, minWidth: 180 }} value={link} onChange={e => setLink(e.target.value)} />
        <button className="btn sm" onClick={async () => { const v = link.trim(); if (!v) return; if (await ex(() => A.adicionarAnexos(c.id, [{ tipo: "link", url: v }], true))) setLink(""); else toast("Não foi possível anexar"); }}>Add link</button>
      </div>}
    </div>
  );
}

function HistoricoCliente({ c }: any) {
  const { R, st, abrirDetalhe, irPara, fecharDetalhe } = useApp() as any;
  const presale = R.domMarketing(c);
  // mesmo cliente = mesmo CPF/CNPJ, telefone, nº da venda ou nome — pega também outras vendas do mesmo cliente
  const irmaos = st.chamados.filter((x: any) => x.id !== c.id && R.domMarketing(x) === presale && R.podeVer(x) && !!mesmaPessoa(x, { clienteDoc: c.clienteDoc, telefone: c.telefone, pedido: c.pedido, cliente: c.cliente }));
  const podeNova = !presale && R.podeCriarCC();
  if (!irmaos.length && !podeNova) return null;
  const todos = [c].concat(irmaos).sort((a: any, b: any) => +new Date(b.criadoEm) - +new Date(a.criadoEm));
  const nova = () => { fecharDetalhe(); irPara("nova", { prefill: { cliente: c.cliente, clienteDoc: c.clienteDoc, telefone: c.telefone, pedido: c.pedido, dataVenda: c.dataVenda, produto: c.produto, vinculadoA: c.id } }); };
  return (
    <div className="hist-cli"><h4 style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ flex: 1 }}>Histórico deste cliente · {todos.length} {presale ? "registros" : "solicitações"}</span>
      {podeNova && <button className="btn primary sm" onClick={nova}>+ Nova solicitação</button>}</h4>
      {todos.map((x: any) => { const at = x.id === c.id; const s = presale ? (STATUS_CLIENTE[R.statusClienteDe(x)] || "") : (STATUS[x.status] || {} as any).label || "";
        return <div key={x.id} className={"l" + (at ? " atual" : "")} onClick={at ? undefined : () => abrirDetalhe(x.id)}><span className="pill">{x.id}</span><span>{R.tipoNome(x.tipo)}{!presale && x.pedido ? " · venda " + x.pedido : ""}</span><span style={{ color: "var(--ink-faint)" }}>{fmtDateTime(x.criadoEm)}</span><span style={{ marginLeft: "auto" }}>{s}{at ? <> · <b>este</b></> : ""}</span></div>; })}
      <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 9 }}>{presale ? "Cada registro tem tratativa própria." : "Inclui todas as vendas do mesmo cliente. Assunto novo (ex.: montagem depois do prazo)? Use \"+ Nova solicitação\": o histórico fica ligado a este atendimento."}</div>
    </div>
  );
}

function DefinirFabrica({ c }: any) {
  const { R, st, executar: ex } = useApp() as any;
  const [f, setF] = useState("");
  return <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
    <select value={f} onChange={e => setF(e.target.value)}><option value="">Informar a fábrica…</option>{(st.fabricas || []).filter((x: any) => x.ativo !== false).map((x: any) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
    <button className="btn sm" disabled={!f} onClick={() => ex(() => A.definirFabrica(c.id, f), "Fábrica definida")}>Salvar</button>
  </span>;
}

function AcoesGerais({ c, link, presale, notaRef, foco }: any) {
  const { R, executar: ex, toast } = useApp();
  const u = R.me();
  const [prev, setPrev] = useState(c.resposta?.previsao || "");
  const [quem, setQuem] = useState(c.resposta ? (c.resposta.quem || u?.nome || "") : (u?.nome || ""));
  const [texto, setTexto] = useState(c.resposta?.texto || "");
  const [sla, setSla] = useState(c.slaResposta ? isoLocal(new Date(c.slaResposta)) : "");
  const [enc, setEnc] = useState(c.setorDestino);
  const [nota, setNota] = useState("");
  useEffect(() => { setEnc(c.setorDestino); }, [c.setorDestino]);
  const podeEncaminhar = R.verTudo() || (R.podeTratar(c) && c.setorDestino === "callcenter");
  return <>
    <div style={{ margin: "16px 0 6px", display: "flex", gap: 9, flexWrap: "wrap" }}>
      {link && <a className="btn wa" href={link} target="_blank" rel="noopener">WhatsApp do representante</a>}
      <button className={"btn " + (c.urgente ? "danger" : "")} onClick={() => ex(() => A.alternarUrgente(c.id), c.urgente ? "Urgência removida" : "Marcado urgente")}>{c.urgente ? "Remover urgência" : "Marcar urgente"}</button>
    </div>
    {!presale && <><div className="sec-label" style={{ marginTop: 16 }}>Mudar status</div>
      {R.viaCC(c.setorDestino) && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>Ao concluir, o chamado vai para <b>Informar cliente</b>: o call center avisa o cliente e encerra.</div>}
      <div className="status-flow" id="flow">{ORDEM.filter(s => s !== "informar" || R.viaCC(c.setorDestino) || c.status === "informar").map(s => <button key={s} className={c.status === s ? "cur" : ""} onClick={() => { if (s !== c.status) ex(() => A.mudarStatus(c.id, s), "Status atualizado"); }}>{STATUS[s].label}</button>)}</div></>}
    {!presale && <div className="resp-box"><h4>Registrar solução / previsão</h4><div className="grid">
      <div className="field"><label>Previsão</label><input type="date" value={prev} onChange={e => setPrev(e.target.value)} /></div>
      <div className="field"><label>Quem respondeu</label><input value={quem} onChange={e => setQuem(e.target.value)} /></div>
      <div className="field full"><label>Observação</label><textarea placeholder={R.viaCC(c.setorDestino) ? "O retorno da fábrica/representante — o call center repassa ao cliente" : "A solução ou resposta passada ao cliente (o setor fala direto com o cliente)"} value={texto} onChange={e => setTexto(e.target.value)}></textarea></div>
    </div><div style={{ marginTop: 12 }}><button className="btn primary sm" onClick={() => { if (!prev && !texto.trim()) { toast("Preencha previsão ou observação"); return; } ex(() => A.registrarRetorno(c.id, prev, quem.trim(), texto.trim()), "Retorno salvo"); }}>Salvar retorno</button></div></div>}
    {podeEncaminhar && <div className="resp-box"><h4>Encaminhar para outro setor</h4><div className="inline-2"><div className="field"><select value={enc} onChange={e => setEnc(e.target.value)}>{R.setoresVisiveis().map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></div>
      <button className="btn sm" onClick={() => { if (enc === c.setorDestino) { toast("Já está neste setor"); return; } ex(() => A.encaminharSetor(c.id, enc), "Encaminhado"); }}>Encaminhar</button></div></div>}
    {!presale && <div className="resp-box"><h4>Prazo para responder</h4><div className="inline-2"><div className="field"><label>Data limite</label><input type="date" value={sla} onChange={e => setSla(e.target.value)} /></div>
      <button className="btn sm" onClick={() => { if (!sla) return; ex(() => A.alterarPrazo(c.id, sla), "Prazo alterado"); }}>Alterar prazo</button></div></div>}
    <div className="resp-box"><h4>Anotação interna</h4><div className="inline-2"><div className="field"><input ref={notaRef} placeholder={foco === "nota" ? "Cliente ligou de novo — descreva o que ele pediu agora" : "Ex.: Liguei 10h, sem retorno."} value={nota} onChange={e => setNota(e.target.value)} /></div>
      <button className="btn sm" onClick={async () => { const v = nota.trim(); if (!v) return; if (await ex(() => A.adicionarNota(c.id, v), "Anotação adicionada")) setNota(""); }}>Adicionar</button></div></div>
  </>;
}

// call center acompanhando uma solicitação que está com outro setor
function AcompanhamentoCC({ c, link, notaRef, foco }: any) {
  const { R, executar: ex } = useApp();
  const [nota, setNota] = useState("");
  return <>
    {c.status === "informar" ? <div className="resp-box" style={{ marginTop: 12, borderColor: "var(--st-informar)" }}><h4>Informar o cliente</h4>
      <div style={{ fontSize: 13, marginBottom: 10 }}>{c.resposta ? <>Retorno: <b>{c.resposta.texto || "—"}</b>{c.resposta.previsao ? " · previsão " + fmtDate(c.resposta.previsao) : ""}</> : "Veja o retorno no histórico abaixo."}</div>
      <button className="btn primary sm" onClick={() => ex(() => A.mudarStatus(c.id, "concluida"), "Cliente informado — concluído")}>Cliente informado — concluir</button></div>
    : <div className="ro-note" style={{ marginTop: 12 }}>Quem trata é o setor <b>{R.setorNome(c.setorDestino)}</b>{R.viaCC(c.setorDestino) ? <>. Quando ele registrar o retorno, o chamado volta para o call center em <b>Informar cliente</b>.</> : <>, que fala direto com o cliente e conclui.</>} Pelo call center você pode registrar um novo contato do cliente e marcar urgente.</div>}
    <div style={{ margin: "12px 0 6px", display: "flex", gap: 9, flexWrap: "wrap" }}>
      {link && <a className="btn wa" href={link} target="_blank" rel="noopener">WhatsApp do representante</a>}
      <button className={"btn " + (c.urgente ? "danger" : "")} onClick={() => ex(() => A.alternarUrgente(c.id), c.urgente ? "Urgência removida" : "Marcado urgente")}>{c.urgente ? "Remover urgência" : "Marcar urgente"}</button>
    </div>
    <div className="resp-box"><h4>Anotação interna</h4><div className="inline-2"><div className="field"><input ref={notaRef} placeholder={foco === "nota" ? "Cliente ligou de novo — descreva o que ele pediu agora" : "Ex.: Cliente ligou perguntando da previsão."} value={nota} onChange={e => setNota(e.target.value)} /></div>
      <button className="btn sm" onClick={async () => { const v = nota.trim(); if (!v) return; if (await ex(() => A.adicionarNota(c.id, v), "Anotação adicionada")) setNota(""); }}>Adicionar</button></div></div>
  </>;
}

// atendimentos abertos a partir deste (ex.: vistoria pedida pelo pós-venda) — para acompanhar tudo do cliente num lugar
function Vinculados({ c }: any) {
  const { R, st, abrirDetalhe } = useApp();
  const filhos = st.chamados.filter((x: any) => x.vinculadoA === c.id && R.podeVer(x));
  if (!filhos.length) return null;
  return (
    <div className="resp-box" style={{ marginTop: 14 }}><h4>Atendimentos ligados a este</h4>
      {filhos.map((x: any) => (
        <div key={x.id} className="detail-row" style={{ cursor: "pointer" }} onClick={() => abrirDetalhe(x.id)}>
          <span className="k">{x.id}</span>
          <span className="v">{R.tipoNome(x.tipo)} · {R.setorNome(x.setorDestino)} · <span className={"badge " + STATUS[x.status].cls}>{STATUS[x.status].label}</span>{x.resposta && x.resposta.previsao ? " · previsão " + fmtDate(x.resposta.previsao) : ""}</span>
        </div>
      ))}
    </div>
  );
}

// Pós-venda Projetados: Relato (fato, como foi contado) · Análise (tipo + responsabilidade) · Custo e solução · Encaminhar
function TratPosvenda({ c }: any) {
  const { R, st, executar: ex, toast, recarregar } = useApp() as any;
  const p = c.posvenda || {};
  const ini = () => ({
    categoria: p.categoria || "", responsabilidade: p.responsabilidade || "analise", montadorId: p.montadorId || "", medidorResp: p.medidorResp || "",
    checklistResp: p.checklistResp || "", ocorrido: p.ocorrido || "", solucao: p.solucao || "",
    custo: p.custo ? String(p.custo).replace(".", ",") : "", custoDesc: p.custoDesc || "", descontoMontador: p.descontoMontador ? String(p.descontoMontador).replace(".", ",") : "",
  });
  const [v, setV] = useState<any>(ini);
  useEffect(() => { setV(ini()); }, [c.id, JSON.stringify(p)]);
  const [encTipo, setEncTipo] = useState("vistoria");
  const [encTxt, setEncTxt] = useState("");
  const s = (k: string) => (e: any) => setV((x: any) => ({ ...x, [k]: e.target.value }));
  const montadores = (st.montadores || []).filter((m: any) => m.ativo || m.id === v.montadorId);
  if (!R.podeVerPosvenda()) return <div className="resp-box"><h4>Pós-venda Projetados</h4><div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>A análise deste atendimento (responsabilidade, montador e custos) é vista só pelo Pós-venda e pela Gestão.</div></div>;
  const r = v.responsabilidade;
  const salvar = () => {
    if (r === "montador" && !v.montadorId) { toast("Informe o montador responsável"); return; }
    if (r === "medida" && !v.medidorResp) { toast("Informe quem fez a medição"); return; }
    if (r === "checklist" && !v.checklistResp) { toast("Informe quem fez o checklist"); return; }
    const desc = r === "montador" ? parseMoeda(v.descontoMontador) : 0;
    ex(() => A.salvarPosvenda(c.id, { ...v, custo: parseMoeda(v.custo), descontoMontador: desc }), "Análise salva");
  };
  const encaminhar = async () => {
    if (!encTxt.trim()) { toast("Descreva o que precisa ser feito"); return; }
    try { const novo = await A.posvendaEncaminhar(c.id, encTipo, encTxt.trim()); setEncTxt(""); await recarregar(); toast("Atendimento " + novo + " aberto"); }
    catch (e: any) { toast(e.message); }
  };
  const Sel = ({ k, label, req, children }: any) => <div className="field"><label>{label}{req && <span className="req-star"> *</span>}</label><select value={v[k]} onChange={s(k)}>{children}</select></div>;
  return (
    <>
      <div className="resp-box"><h4>1 · Relato do problema</h4>
        <RowSb k="Quem acionou">{PV_ORIGEM[p.origem || "cliente"]}</RowSb>
        {p.pecaAfetada && <RowSb k="Ambiente / peça">{p.pecaAfetada}</RowSb>}
        <RowSb k="Relato">{c.motivo}</RowSb>
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>O relato fica como foi registrado na abertura. Fotos e vídeos do cliente: bloco “Comprovações / anexos”, abaixo.</div>
      </div>
      <div className="resp-box"><h4>2 · Análise {r !== "analise" ? <span className="badge b-concluida" style={{ marginLeft: 8 }}>{PV_RESP[r]}</span> : <span className="badge b-tratativa" style={{ marginLeft: 8 }}>em análise</span>}</h4>
        <div className="grid">
          <Sel k="categoria" label="Tipo de problema"><option value="">Selecione…</option>{Object.entries(PV_TIPOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel>
          <Sel k="responsabilidade" label="De quem é a responsabilidade">{Object.entries(PV_RESP).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel>
          <Sel k="montadorId" label={r === "montador" ? "Montador responsável" : "Montador que montou"} req={r === "montador"}><option value="">Não informado</option>{montadores.map((m: any) => <option key={m.id} value={m.id}>{m.nome}{m.ativo ? "" : " (inativo)"}</option>)}</Sel>
          {(r === "medida" || v.medidorResp) && <Sel k="medidorResp" label="Quem fez a medição" req={r === "medida"}><option value="">Não informado</option>{R.medidores().map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</Sel>}
          <Sel k="checklistResp" label="Quem fez o checklist" req={r === "checklist"}><option value="">Não informado</option>{R.responsaveisChecklist().map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</Sel>
          <div className="field full"><label>O que foi constatado</label><textarea value={v.ocorrido} onChange={s("ocorrido")} placeholder="Depois de falar com o cliente/montador ou da vistoria: o que de fato aconteceu e por quê"></textarea></div>
        </div>
        {!montadores.length && <div className="hint" style={{ marginTop: 6 }}>Cadastre os montadores em Pós-venda → Números e montadores → Montadores.</div>}
      </div>
      <div className="resp-box"><h4>3 · Custo e solução</h4>
        <div className="grid">
          <div className="field full"><label>Solução / o que será feito</label><textarea value={v.solucao} onChange={s("solucao")} placeholder="Ex.: troca da porta, retorno do montador, peça pedida à fábrica"></textarea></div>
          <div className="field"><label>Custo para a loja (R$)</label><input inputMode="decimal" value={v.custo} onChange={s("custo")} placeholder="0,00" /></div>
          <div className="field"><label>Do que é o custo</label><input value={v.custoDesc} onChange={s("custoDesc")} placeholder="Ex.: peça, frete, retorno do montador" /></div>
          {r === "montador" && <div className="field"><label>Desconto do montador (R$)</label><input inputMode="decimal" value={v.descontoMontador} onChange={s("descontoMontador")} placeholder="0,00" /><span className="hint">Vai para desconto do montador.</span></div>}
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn primary sm" onClick={salvar}>Salvar análise</button>
          {p.atualizadoPor && <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>Salvo em {fmtDateTime(p.atualizadoEm)}{p.custo ? " · custo " + fmtMoeda(p.custo) : ""}{p.descontoMontador ? " · desconto " + fmtMoeda(p.descontoMontador) : ""}</span>}
        </div>
      </div>
      <div className="resp-box"><h4>Encaminhar para outro setor</h4>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "0 0 10px" }}>Abre um novo atendimento com os dados deste cliente, ligado a este. Você acompanha o andamento aqui na ficha, em “Atendimentos ligados a este”.</p>
        <div className="grid">
          <div className="field"><label>O que pedir</label><select value={encTipo} onChange={e => setEncTipo(e.target.value)}>{Object.entries(PV_ENCAMINHAR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field full"><label>O que precisa ser feito</label><textarea value={encTxt} onChange={e => setEncTxt(e.target.value)} placeholder="Ex.: vistoria da porta do armário riscada; fotos anexadas no pós-venda"></textarea></div>
        </div>
        <div style={{ marginTop: 12 }}><button className="btn sm" onClick={encaminhar}>Abrir {R.tipoNome(encTipo).toLowerCase()}</button></div>
      </div>
    </>
  );
}
