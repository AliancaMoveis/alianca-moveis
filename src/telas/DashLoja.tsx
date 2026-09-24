// Painéis do Dashboard para o atendimento na loja:
// - PainelLoja: Suporte Consultores, Supervisão Marketing, Gerente de Loja e Gestão (agendamentos do dia, sem vendedor, sem parecer, respostas dos vendedores, pós-loja por consultor)
// - PainelVendedor: o vendedor (agendados de hoje e próximos, parecer pendente, sem atualização)
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { EM_ATENDIMENTO, STATUS_CLIENTE, fmtDateTime, hojeISO, parseData, tempoRel } from "../lib/regras";
import { Kpi } from "./Dashboard";

const dia = (c: any) => String(c.dataLoja || "").slice(0, 10);
const hora = (c: any) => { const s = String(c.dataLoja || ""); return s.length > 10 ? s.slice(11, 16) : "—"; };
const Origem = ({ c }: any) => { const { R } = useApp(); const o = R.origemLoja(c); return <span className={"origem " + o}>{o === "marketing" ? "Mkt" : "Ext"}</span>; };

function Situacao({ c }: any) {
  const { R } = useApp();
  if (!c.atendenteId && c.setorDestino === "suporte_consultores") return <span className="badge b-urgente">Sem vendedor</span>;
  if (R.parecerCobrado(c)) return <span className="badge b-critico">Parecer cobrado</span>;
  if (R.semParecer(c)) return <span className="badge b-urgente">Sem parecer</span>;
  const sc = R.statusClienteDe(c);
  return <span className={"sc sc-" + sc}>{STATUS_CLIENTE[sc] || "—"}</span>;
}

export function PainelLoja({ de, ate }: { de: string; ate: string }) {
  const { R, st, abrirDetalhe, executar: ex } = useApp() as any;
  const suporte = R.mySetores().includes("suporte_consultores");
  const [area, setArea] = useState<"todos" | "externo" | "marketing">(R.ehGestao() ? "todos" : suporte && !R.temMarketing() ? "externo" : R.temMarketing() && !suporte ? "marketing" : "todos");
  const hoje = hojeISO();
  const naArea = (c: any) => area === "todos" || R.origemLoja(c) === area;
  const mkt = st.chamados.filter((c: any) => R.domMarketing(c) && R.podeVer(c) && naArea(c));
  const noPer = (v: any) => { if (!v) return false; const d = parseData(v); return d >= new Date(de + "T00:00:00") && d <= new Date(ate + "T23:59:59"); };

  const deHoje = mkt.filter((c: any) => c.dataLoja && dia(c) === hoje).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  const semVendHoje = deHoje.filter((c: any) => !c.atendenteId).length;
  const semVendTodos = mkt.filter((c: any) => c.setorDestino === "suporte_consultores" && !c.atendenteId).length;
  const semParecer = mkt.filter((c: any) => R.semParecer(c));
  const cobrados = mkt.filter((c: any) => R.parecerCobrado(c));
  const semAnexo = mkt.filter((c: any) => c.dataLoja && dia(c) >= hoje && R.semAnexo(c));
  const hojeComParecer = deHoje.filter((c: any) => c.venda || (c.tratativa && c.tratativa.parecerEm && new Date(c.tratativa.parecerEm) >= parseData(c.dataLoja))).length;

  // vendedores: quem está respondendo e quem não
  const vendedores = R.vendedores().map((u: any) => {
    const meus = mkt.filter((c: any) => c.atendenteId === u.id);
    const pareceres = meus.filter((c: any) => c.tratativa && c.tratativa.parecerEm).map((c: any) => c.tratativa.parecerEm).sort();
    return { u, hoje: meus.filter((c: any) => dia(c) === hoje).length, semParecer: meus.filter((c: any) => R.semParecer(c)).length,
      cobrados: meus.filter((c: any) => R.parecerCobrado(c)).length, emAtendimento: meus.filter((c: any) => EM_ATENDIMENTO.includes(R.statusClienteDe(c)) && !c.venda).length,
      ultimo: pareceres.length ? pareceres[pareceres.length - 1] : null };
  }).sort((a: any, b: any) => (b.semParecer + b.cobrados) - (a.semParecer + a.cobrados) || b.hoje - a.hoje);

  const respostas = mkt.filter((c: any) => c.tratativa && c.tratativa.parecerEm).sort((a: any, b: any) => String(b.tratativa.parecerEm).localeCompare(String(a.tratativa.parecerEm))).slice(0, 10);

  // pós-loja por consultor (clientes que tinham vinda à loja no período)
  const noPeriodoLoja = mkt.filter((c: any) => c.dataLoja && noPer(c.dataLoja) && c.consultorId);
  const porCons: Record<string, any> = {};
  noPeriodoLoja.forEach((c: any) => {
    const k = c.consultorId; const r = porCons[k] = porCons[k] || { ag: 0, atend: 0, orc: 0, vend: 0, perdido: 0, semPar: 0, semAnexo: 0 };
    const sc = R.statusClienteDe(c);
    r.ag++;
    if (c.venda || (c.tratativa && c.tratativa.parecerEm)) r.atend++;
    if (sc === "orcamento") r.orc++;
    if (c.venda && c.venda.status !== "cancelada") r.vend++;
    if (["reprovado", "nao_compareceu", "venda_cancelada"].includes(sc)) r.perdido++;
    if (R.semParecer(c)) r.semPar++;
    if (!(c.anexos || []).length) r.semAnexo++;
  });
  const linhasCons = Object.entries(porCons).sort((a: any, b: any) => b[1].ag - a[1].ag);

  const cobrar = (c: any) => ex(() => A.cobrarParecer(c.id), "Parecer cobrado — o vendedor vê nas pendências");

  return (
    <div className="dl-wrap">
      <div className="dl-cab"><h3>Atendimento na loja</h3>
        <div className="subnav" style={{ margin: 0 }}>
          {([["todos", "Todos"], ["externo", "Externos (consultores)"], ["marketing", "Marketing"]] as [any, string][]).map(([k, l]) => <button key={k} className={area === k ? "on" : ""} onClick={() => setArea(k)}>{l}</button>)}
        </div></div>
      <div className="kpis">
        <Kpi n={deHoje.length} l="Agendados hoje" />
        <Kpi n={semVendHoje} l={`Sem vendedor hoje (${semVendTodos} no total)`} cls={semVendHoje ? "urg" : ""} />
        <Kpi n={semParecer.length} l="Já vieram — sem parecer" cls={semParecer.length ? "alert" : ""} cor={semParecer.length ? "var(--danger)" : undefined} />
        <Kpi n={cobrados.length} l="Parecer cobrado, sem resposta" cls={cobrados.length ? "alert" : ""} />
        <Kpi n={semAnexo.length} l="⚠️ Agendados sem anexo" cor={semAnexo.length ? "#b07a00" : undefined} />
        <Kpi n={hojeComParecer + "/" + deHoje.length} l="Hoje com parecer" cor="var(--st-concluida)" />
      </div>

      <div className="panel-grid">
        <div className="panel"><h3>Agendamentos de hoje</h3>
          {deHoje.length ? <div className="dl-lista">{deHoje.map((c: any) => (
            <div className="dl-l" key={c.id}>
              <b className="dl-h">{hora(c)}</b><Origem c={c} />
              <span className="dl-nm" onClick={() => abrirDetalhe(c.id)}>{c.cliente}{R.semAnexo(c) ? " ⚠️" : ""}<small>{c.consultorId ? R.nomeUser(c.consultorId) : "marketing"} → {c.atendenteId ? R.nomeUser(c.atendenteId) : "sem vendedor"}</small></span>
              <Situacao c={c} />
              {R.semParecer(c) && <button className="btn sm" onClick={() => cobrar(c)}>Cobrar</button>}
            </div>))}</div> : <div className="empty" style={{ padding: "18px 8px" }}>Nenhum agendamento hoje.</div>}
        </div>
        <div className="panel"><h3>Vendedores — respostas</h3>
          {vendedores.length ? vendedores.map(({ u, hoje: h, semParecer: sp, cobrados: cb, emAtendimento: ea, ultimo }: any) => (
            <div className="dl-vend" key={u.id}>
              <div style={{ flex: 1 }}><b>{u.nome}</b><small>{ultimo ? "último parecer " + tempoRel(ultimo) : "nenhum parecer ainda"} · {ea} em atendimento</small></div>
              <span className="dv-n cinza">{h} hoje</span>
              {sp > 0 && <span className="dv-n" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{sp} sem parecer</span>}
              {cb > 0 && <span className="dv-n" style={{ background: "var(--critico-bg)", color: "var(--critico)" }}>{cb} cobrado{cb > 1 ? "s" : ""}</span>}
            </div>)) : <div className="empty">Nenhum vendedor cadastrado.</div>}
        </div>
      </div>

      <div className="panel-grid">
        <div className="panel"><h3>Sem parecer do vendedor</h3>
          {semParecer.length ? <div className="dl-lista">{semParecer.sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja))).map((c: any) => (
            <div className="dl-l" key={c.id}>
              <b className="dl-h" style={{ fontSize: 12 }}>{dia(c) === hoje ? hora(c) : fmtDateTime(c.dataLoja).slice(0, 5)}</b><Origem c={c} />
              <span className="dl-nm" onClick={() => abrirDetalhe(c.id)}>{c.cliente}<small>vendedor {R.nomeUser(c.atendenteId)}{c.tratativa && c.tratativa.cobradoEm ? " · cobrado " + tempoRel(c.tratativa.cobradoEm) : ""}</small></span>
              <button className="btn sm" onClick={() => cobrar(c)}>{c.tratativa && c.tratativa.cobradoEm ? "Cobrar de novo" : "Cobrar parecer"}</button>
            </div>))}</div> : <div className="empty" style={{ padding: "18px 8px" }}>Todos os vendedores deram parecer.</div>}
        </div>
        <div className="panel"><h3>Últimas respostas dos vendedores</h3>
          {respostas.length ? respostas.map((c: any) => { const t = c.tratativa; return (
            <div className="dl-resp" key={c.id} onClick={() => abrirDetalhe(c.id)}>
              <div><b>{c.cliente}</b> · <span className={"sc sc-" + t.parecerStatus}>{STATUS_CLIENTE[t.parecerStatus] || t.parecerStatus}</span> <small>{t.parecerPor} · {tempoRel(t.parecerEm)}</small></div>
              {t.parecer && <div className="dl-txt">{t.parecer}</div>}
            </div>); }) : <div className="empty" style={{ padding: "18px 8px" }}>Nenhum parecer registrado ainda.</div>}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}><h3>Depois da vinda à loja — por consultor <span className="pill" style={{ marginLeft: 8 }}>vindas no período</span></h3>
        {linhasCons.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Consultor</th><th>Agendados</th><th>Com parecer</th><th>Orçamento</th><th>Vendas</th><th>Perdidos</th><th>Sem parecer</th><th>Sem anexo</th></tr></thead>
          <tbody>{linhasCons.map(([k, r]: any) => <tr key={k}><td><b>{R.nomeUser(k)}</b></td><td>{r.ag}</td><td>{r.atend}</td><td>{r.orc}</td><td style={{ color: "var(--st-concluida)", fontWeight: 700 }}>{r.vend}</td><td>{r.perdido}</td><td style={r.semPar ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{r.semPar}</td><td style={r.semAnexo ? { color: "#b07a00", fontWeight: 700 } : undefined}>{r.semAnexo}</td></tr>)}</tbody></table></div>
          : <div className="empty" style={{ padding: "18px 8px" }}>Nenhum cliente de consultor veio à loja no período.</div>}
      </div>
    </div>
  );
}

export function PainelVendedor() {
  const { R, st, abrirDetalhe } = useApp() as any;
  const eu = R.currentUserId, hoje = hojeISO(), agora = new Date();
  const meus = st.chamados.filter((c: any) => R.domMarketing(c) && c.atendenteId === eu);
  const abertos = meus.filter((c: any) => !c.venda && EM_ATENDIMENTO.includes(R.statusClienteDe(c)));
  const deHoje = abertos.filter((c: any) => dia(c) === hoje).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  const proximos = abertos.filter((c: any) => c.dataLoja && dia(c) > hoje).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  const semParecer = meus.filter((c: any) => R.semParecer(c));
  const cobrados = meus.filter((c: any) => R.parecerCobrado(c));
  const semAtual = meus.filter((c: any) => !c.venda && R.clienteCriticoInatividade(c));
  const Linha = ({ c, quando }: any) => { const t = c.tratativa || {}; return (
    <div className="dl-l" onClick={() => abrirDetalhe(c.id)} style={{ cursor: "pointer" }}>
      <b className="dl-h" style={quando ? { fontSize: 12 } : undefined}>{quando ? fmtDateTime(c.dataLoja).slice(0, 5) + " " + hora(c) : hora(c)}</b><Origem c={c} />
      <span className="dl-nm">{c.cliente}{R.semAnexo(c) ? " ⚠️" : ""}<small>{c.produto || "—"}{c.consultorId ? " · consultor " + R.nomeUser(c.consultorId) : ""}</small></span>
      {t.querProjeto === "sim" && <span className="marca-loja sim">📐 Quer projeto</span>}
      {t.emContato && <span className="marca-loja ok">em contato</span>}
      {t.projetoSistema && <span className="marca-loja ok">projeto pronto</span>}
      <Situacao c={c} />
    </div>); };
  return (
    <div className="dl-wrap">
      <div className="dl-cab"><h3>Meus atendimentos na loja</h3></div>
      <div className="kpis">
        <Kpi n={deHoje.length} l="Agendados hoje" />
        <Kpi n={proximos.length} l="Próximos agendamentos" />
        <Kpi n={cobrados.length} l="Parecer cobrado" cls={cobrados.length ? "alert" : ""} cor={cobrados.length ? "var(--critico)" : undefined} />
        <Kpi n={semParecer.length} l="Já vieram — falta parecer" cls={semParecer.length ? "urg" : ""} />
        <Kpi n={semAtual.length} l="Sem atualização +24h" cls={semAtual.length ? "alert" : ""} />
      </div>
      {(cobrados.length > 0 || semParecer.length > 0) && <div className="panel" style={{ marginBottom: 16, borderColor: "var(--danger)" }}><h3 style={{ color: "var(--danger)" }}>Dê o parecer destes clientes</h3>
        <div className="dl-lista">{[...cobrados, ...semParecer.filter((c: any) => !cobrados.includes(c))].map((c: any) => <Linha key={c.id} c={c} quando />)}</div></div>}
      <div className="panel-grid">
        <div className="panel"><h3>Hoje</h3>{deHoje.length ? <div className="dl-lista">{deHoje.map((c: any) => <Linha key={c.id} c={c} />)}</div> : <div className="empty" style={{ padding: "18px 8px" }}>Nenhum cliente seu hoje.</div>}</div>
        <div className="panel"><h3>Próximos</h3>{proximos.length ? <div className="dl-lista">{proximos.slice(0, 15).map((c: any) => <Linha key={c.id} c={c} quando />)}</div> : <div className="empty" style={{ padding: "18px 8px" }}>Nenhum agendamento futuro.</div>}</div>
      </div>
      {semAtual.length > 0 && <div className="panel" style={{ marginBottom: 16 }}><h3>Clientes sem atualização há mais de 24h</h3><div className="dl-lista">{semAtual.map((c: any) => <Linha key={c.id} c={c} quando />)}</div></div>}
      <div style={{ fontSize: 12, color: "var(--ink-faint)", marginBottom: 16 }}>Atualizado {agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Clique no cliente para abrir a ficha e registrar o status.</div>
    </div>
  );
}

// Consultor externo: o funil dele no período e o que fazer agora
export function PainelConsultor({ de, ate }: { de: string; ate: string }) {
  const { R, st, abrirDetalhe } = useApp() as any;
  const eu = R.currentUserId, agora = new Date();
  const f = R.funilConsultor(eu, de, ate);
  const meus = st.chamados.filter((c: any) => R.domMarketing(c) && c.consultorId === eu);
  const aVisitar = meus.filter((c: any) => c.setorDestino === "consultor_externo" && !(c.tratativa && c.tratativa.realizada))
    .sort((a: any, b: any) => String(a.dataVisita || "9").localeCompare(String(b.dataVisita || "9")));
  const faltaAgendar = meus.filter((c: any) => c.setorDestino === "consultor_externo" && c.tratativa && c.tratativa.realizada && !c.dataLoja);
  const semAnexo = meus.filter((c: any) => R.semAnexo(c));
  const naLoja = meus.filter((c: any) => c.dataLoja && parseData(c.dataLoja) >= agora && !c.venda).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  const resultados = meus.filter((c: any) => c.venda || (c.tratativa && c.tratativa.parecerEm) || R.statusClienteDe(c) === "nao_compareceu")
    .sort((a: any, b: any) => String((b.tratativa && b.tratativa.parecerEm) || b.criadoEm).localeCompare(String((a.tratativa && a.tratativa.parecerEm) || a.criadoEm))).slice(0, 8);
  const pc = (v: number | null) => v == null ? "—" : v + "%";
  const L = ({ c, quando, extra }: any) => (
    <div className="dl-l" onClick={() => abrirDetalhe(c.id)} style={{ cursor: "pointer" }}>
      <b className="dl-h" style={{ fontSize: 12, minWidth: 92 }}>{quando ? fmtDateTime(quando).slice(0, 16) : "sem data"}</b>
      <span className="dl-nm">{c.cliente}{R.semAnexo(c) ? " ⚠️" : ""}<small>{extra || c.endereco || c.produto || "—"}</small></span>
      <Situacao c={c} />
    </div>);
  return (
    <div className="dl-wrap">
      <div className="dl-cab"><h3>Minhas visitas <span className="pill" style={{ marginLeft: 6, fontWeight: 500 }}>visitas com data no período</span></h3></div>
      <div className="kpis">
        <Kpi n={f.total} l="Visitas recebidas" />
        <Kpi n={f.realizadas} l="Visitas realizadas" />
        <Kpi n={aVisitar.length} l="A realizar (agora)" cls={aVisitar.length ? "urg" : ""} />
        <Kpi n={f.agendadas} l="Agendados na loja" />
        <Kpi n={f.vieram} l="Vieram à loja" />
        <Kpi n={f.vendas} l="Vendas" cor="var(--st-concluida)" />
      </div>
      <div className="kpis">
        <Kpi n={pc(f.pPresenca)} l="Presença na loja (vieram ÷ visitas feitas)" />
        <Kpi n={pc(f.pVisitaVenda)} l="Visita → venda (vendas ÷ visitas feitas)" />
        <Kpi n={pc(f.pLojaVenda)} l="Loja → venda (vendas ÷ vieram)" />
      </div>
      {(faltaAgendar.length > 0 || semAnexo.length > 0) && <div className="panel-grid">
        <div className="panel" style={faltaAgendar.length ? { borderColor: "var(--warn)" } : undefined}><h3>Visita feita — falta agendar a loja</h3>{faltaAgendar.length ? <div className="dl-lista">{faltaAgendar.map((c: any) => <L key={c.id} c={c} quando={c.dataVisita} />)}</div> : <div className="empty" style={{ padding: "14px 8px" }}>Nada pendente.</div>}</div>
        <div className="panel" style={semAnexo.length ? { borderColor: "#f0c24b" } : undefined}><h3>⚠️ Sem anexo — anexe planta e fotos</h3>{semAnexo.length ? <div className="dl-lista">{semAnexo.map((c: any) => <L key={c.id} c={c} quando={c.dataLoja || c.dataVisita} />)}</div> : <div className="empty" style={{ padding: "14px 8px" }}>Todos com anexo.</div>}</div>
      </div>}
      <div className="panel-grid">
        <div className="panel"><h3>Próximas visitas</h3>{aVisitar.length ? <div className="dl-lista">{aVisitar.slice(0, 12).map((c: any) => <L key={c.id} c={c} quando={c.dataVisita} />)}</div> : <div className="empty" style={{ padding: "14px 8px" }}>Nenhuma visita a fazer.</div>}</div>
        <div className="panel"><h3>Seus clientes que vêm à loja</h3>{naLoja.length ? <div className="dl-lista">{naLoja.map((c: any) => <L key={c.id} c={c} quando={c.dataLoja} extra={c.atendenteId ? "vendedor " + R.nomeUser(c.atendenteId) : "aguardando definir o vendedor"} />)}</div> : <div className="empty" style={{ padding: "14px 8px" }}>Nenhum agendamento futuro.</div>}</div>
      </div>
      <div className="panel" style={{ marginBottom: 16 }}><h3>Resultado dos seus clientes na loja</h3>
        {resultados.length ? <div className="dl-lista">{resultados.map((c: any) => { const t = c.tratativa || {}; return <L key={c.id} c={c} quando={c.dataLoja} extra={(c.atendenteId ? R.nomeUser(c.atendenteId) : "—") + (t.parecer ? " · " + t.parecer : "")} />; })}</div>
          : <div className="empty" style={{ padding: "14px 8px" }}>Ainda sem resultados registrados pelos vendedores.</div>}
      </div>
    </div>
  );
}
