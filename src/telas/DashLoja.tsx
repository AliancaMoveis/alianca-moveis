// Painéis do Dashboard para o atendimento na loja:
// - PainelLoja: Suporte Consultores, Supervisão Marketing, Gerente de Loja e Gestão (agendamentos do dia, sem vendedor, sem parecer, respostas dos vendedores, pós-loja por consultor)
// - PainelVendedor: o vendedor (agendados de hoje e próximos, parecer pendente, sem atualização)
import { useRef, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { EM_ATENDIMENTO, STATUS_CLIENTE, fmtDateTime, hojeISO, parseData, sanitizeWhats, statusFinalCliente, tempoRel, waTexto } from "../lib/regras";
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

  // o período do dashboard vale para os agendamentos (hoje, 7 dias, mês...); pendências (sem parecer, cobrados) aparecem sempre
  const soHoje = de === hoje && ate === hoje;
  const perTxt = soHoje ? "hoje" : "no período";
  const deHoje = mkt.filter((c: any) => c.dataLoja && noPer(c.dataLoja) && !(c.tratativa && (c.tratativa.importadoVisita || c.tratativa.visitaImportada))).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  const semVendHoje = deHoje.filter((c: any) => !c.atendenteId).length;
  // agendamentos por dia no período: quantos vieram, não vieram, cancelaram e compraram
  const veio = (c: any) => !!(c.venda || (c.tratativa && (c.tratativa.parecerEm || c.tratativa.emAtendimento)));
  const porDia: Record<string, any> = {};
  deHoje.forEach((c: any) => { const d = dia(c); const r = porDia[d] = porDia[d] || { t: 0, mkt: 0, ext: 0, veio: 0, nao: 0, canc: 0, vend: 0, semVend: 0 };
    const sc = R.statusClienteDe(c); r.t++; if (R.origemLoja(c) === "marketing") r.mkt++; else r.ext++;
    if (veio(c)) r.veio++; if (sc === "nao_compareceu") r.nao++; if (sc === "loja_cancelada") r.canc++; if (c.venda && c.venda.status !== "cancelada") r.vend++; if (!c.atendenteId) r.semVend++; });
  const dias = Object.keys(porDia).sort();
  const tot = dias.reduce((a: any, d) => { Object.keys(porDia[d]).forEach(k => a[k] = (a[k] || 0) + porDia[d][k]); return a; }, {} as any);
  const semVendTodos = mkt.filter((c: any) => c.setorDestino === "suporte_consultores" && !c.atendenteId).length;
  const semParecer = mkt.filter((c: any) => R.semParecer(c));
  const cobrados = mkt.filter((c: any) => R.parecerCobrado(c));
  const semAnexo = mkt.filter((c: any) => c.dataLoja && dia(c) >= hoje && R.semAnexo(c));
  const hojeComParecer = deHoje.filter((c: any) => c.venda || (c.tratativa && c.tratativa.parecerEm && new Date(c.tratativa.parecerEm) >= parseData(c.dataLoja))).length;

  // vendedores: quem está respondendo e quem não
  const vendedores = R.vendedores().map((u: any) => {
    const meus = mkt.filter((c: any) => c.atendenteId === u.id);
    const pareceres = meus.filter((c: any) => c.tratativa && c.tratativa.parecerEm).map((c: any) => c.tratativa.parecerEm).sort();
    return { u, hoje: meus.filter((c: any) => c.dataLoja && noPer(c.dataLoja)).length, semParecer: meus.filter((c: any) => R.semParecer(c)).length,
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
    if (["reprovado", "nao_vai_comprar", "nao_compareceu", "venda_cancelada"].includes(sc)) r.perdido++;
    if (R.semParecer(c)) r.semPar++;
    if (!(c.anexos || []).length) r.semAnexo++;
  });
  const linhasCons = Object.entries(porCons).sort((a: any, b: any) => b[1].ag - a[1].ag);

  const cobrar = (c: any) => ex(() => A.cobrarParecer(c.id), "Cobrado — o vendedor vê nas pendências dele");
  // pendências de cada vendedor: o cliente já veio e não teve parecer, foi cobrado e não respondeu, ou o status parou (+24h sem atualização)
  const pendDe = (c: any): string => {
    if (!c.atendenteId || c.setorDestino !== "atendente_cliente" || c.venda || statusFinalCliente.includes(R.statusClienteDe(c))) return "";
    if (R.parecerCobrado(c)) return "cobrado";
    if (R.semParecer(c)) return "semparecer";
    if (c.dataLoja && parseData(c.dataLoja) < new Date() && EM_ATENDIMENTO.includes(R.statusClienteDe(c)) && R.horasSemAtualizar(c) > 24) return "parado";
    return "";
  };
  const ROT_PEND: Record<string, [string, string]> = { cobrado: ["cobrado, sem resposta", "var(--critico)"], semparecer: ["já veio — sem parecer", "var(--danger)"], parado: ["status parado +24h", "var(--warn)"] };
  const podeCobrar = (c: any) => !!c.atendenteId && c.setorDestino === "atendente_cliente" && !c.venda && !statusFinalCliente.includes(R.statusClienteDe(c)) && !!c.dataLoja && parseData(c.dataLoja) < new Date();
  const [vSel, setVSel] = useState(""); const [vBusca, setVBusca] = useState("");
  const refVend = useRef<HTMLDivElement>(null);
  const escolherVend = (id: string) => { setVSel(id); setTimeout(() => refVend.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const pendVend = (id: string) => mkt.filter((c: any) => c.atendenteId === id && pendDe(c));
  async function cobrarTodos(l: any[], quem: string) {
    if (!l.length) return;
    if (!confirm(`Cobrar ${l.length} cliente(s) de ${quem}? Cada um aparece como "cobrado" nas pendências do vendedor.`)) return;
    for (const c of l) { try { await A.cobrarParecer(c.id); } catch { /* segue os outros */ } }
    await ex(async () => null, l.length + " cliente(s) cobrado(s) de " + quem);
  }
  const msgVend = (u: any, l: any[]) => `Oi, ${u.nome}! Tudo bem?\n\nPreciso do retorno destes clientes no 360 (status e parecer):\n\n${l.map((c: any) => "• " + c.cliente + (c.dataLoja ? " (loja " + fmtDateTime(c.dataLoja).slice(0, 5) + ")" : "") + " — " + ROT_PEND[pendDe(c)][0]).join("\n")}\n\nAtualize na ficha de cada um, por favor. Obrigada!`;

  return (
    <div className="dl-wrap">
      <div className="dl-cab"><h3>Atendimento na loja</h3>
        <div className="subnav" style={{ margin: 0 }}>
          {([["todos", "Todos"], ["externo", "Externos (consultores)"], ["marketing", "Marketing"]] as [any, string][]).map(([k, l]) => <button key={k} className={area === k ? "on" : ""} onClick={() => setArea(k)}>{l}</button>)}
        </div></div>
      <div className="kpis">
        <Kpi n={deHoje.length} l={"Agendados " + perTxt} />
        <Kpi n={tot.veio || 0} l={"Vieram à loja " + perTxt} cor="var(--st-concluida)" />
        <Kpi n={semVendHoje} l={`Sem vendedor ${perTxt} (${semVendTodos} no total)`} cls={semVendHoje ? "urg" : ""} />
        <Kpi n={semParecer.length} l="Já vieram — sem parecer" cls={semParecer.length ? "alert" : ""} cor={semParecer.length ? "var(--danger)" : undefined} />
        <Kpi n={cobrados.length} l="Parecer cobrado, sem resposta" cls={cobrados.length ? "alert" : ""} />
        <Kpi n={semAnexo.length} l="⚠️ Agendados sem anexo" cor={semAnexo.length ? "#b07a00" : undefined} />
        <Kpi n={hojeComParecer + "/" + deHoje.length} l={(soHoje ? "Hoje" : "No período") + " com parecer"} cor="var(--st-concluida)" />
      </div>

      <div className="panel-grid">
        <div className="panel"><h3>Agendamentos {soHoje ? "de hoje" : "do período"} <span className="pill" style={{ marginLeft: 6 }}>{deHoje.length}</span></h3>
          {deHoje.length ? <div className="dl-lista" style={soHoje ? undefined : { maxHeight: 520, overflowY: "auto" }}>{deHoje.map((c: any) => (
            <div className="dl-l" key={c.id}>
              <b className="dl-h" style={soHoje ? undefined : { fontSize: 12 }}>{soHoje ? hora(c) : fmtDateTime(c.dataLoja).slice(0, 5) + " " + hora(c)}</b><Origem c={c} />
              <span className="dl-nm" onClick={() => abrirDetalhe(c.id)}>{c.cliente}{R.semAnexo(c) ? " ⚠️" : ""}<small>{c.consultorId ? R.nomeUser(c.consultorId) : "marketing"} → {c.atendenteId ? R.nomeUser(c.atendenteId) : "sem vendedor"}</small></span>
              <Situacao c={c} />
              {podeCobrar(c) && <button className="btn sm" title={c.tratativa && c.tratativa.cobradoEm ? "Cobrado " + tempoRel(c.tratativa.cobradoEm) : "Cobrar o vendedor sobre o status deste cliente"} onClick={() => cobrar(c)}>{c.tratativa && c.tratativa.cobradoEm ? "Cobrar de novo" : "Cobrar"}</button>}
            </div>))}</div> : <div className="empty" style={{ padding: "18px 8px" }}>Nenhum agendamento {perTxt}.</div>}
        </div>
        <div className="panel"><h3>Vendedores — respostas</h3>
          {vendedores.length ? vendedores.map(({ u, hoje: h, semParecer: sp, cobrados: cb, emAtendimento: ea, ultimo }: any) => { const spl = mkt.filter((c: any) => c.atendenteId === u.id && R.semParecer(c) && !R.parecerCobrado(c)); return (
            <div className="dl-vend" key={u.id}>
              <div style={{ flex: 1, cursor: "pointer" }} onClick={() => escolherVend(u.id)} title="Ver todas as pendências deste vendedor"><b className="dl-vnome">{u.nome}</b><small>{ultimo ? "último parecer " + tempoRel(ultimo) : "nenhum parecer ainda"} · {ea} em atendimento</small></div>
              <span className="dv-n cinza">{h} {perTxt}</span>
              {sp > 0 && <span className="dv-n" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{sp} sem parecer</span>}
              {cb > 0 && <span className="dv-n" style={{ background: "var(--critico-bg)", color: "var(--critico)" }}>{cb} cobrado{cb > 1 ? "s" : ""}</span>}
              {spl.length > 0 && <button className="btn sm" title="Cobrar todos os clientes deste vendedor que já vieram e estão sem parecer" onClick={() => cobrarTodos(spl, u.nome)}>Cobrar todos sem parecer ({spl.length})</button>}
            </div>); }) : <div className="empty">Nenhum vendedor cadastrado.</div>}
        </div>
      </div>

      {/* 🔎 pendências de um vendedor: a Carla escolhe o vendedor e cobra tudo o que está parado com ele */}
      <div className="panel dl-pv" ref={refVend} style={{ marginBottom: 16 }}>
        <h3>🔎 Pendências por vendedor</h3>
        <div className="dl-pv-bar">
          <input type="search" placeholder="Buscar vendedor" value={vBusca} onChange={e => setVBusca(e.target.value)} style={{ maxWidth: 220 }} />
          <div className="dl-pv-chips">{vendedores.map(({ u }: any) => ({ u, n: pendVend(u.id).length })).filter(({ u, n }: any) => (n > 0 || vSel === u.id) && (!vBusca.trim() || String(u.nome).toLowerCase().includes(vBusca.trim().toLowerCase())))
            .sort((a: any, b: any) => b.n - a.n).map(({ u, n }: any) => <button key={u.id} type="button" className={"chip" + (vSel === u.id ? " on" : "")} onClick={() => setVSel(vSel === u.id ? "" : u.id)}>{u.nome}<span className="n">{n}</span></button>)}</div>
        </div>
        {!vSel ? <div className="hint" style={{ padding: "8px 2px" }}>Escolha um vendedor para ver todos os clientes que estão parados com ele: os que já vieram sem parecer, os já cobrados que não responderam e os com status parado há mais de 24h.</div>
          : (() => { const u = (R.vendedores() as any[]).find((x: any) => x.id === vSel) || { id: vSel, nome: R.nomeUser(vSel) }; const l = pendVend(vSel).sort((a: any, b: any) => String(a.dataLoja || "").localeCompare(String(b.dataLoja || "")));
            const tel = sanitizeWhats((st.usuarios.find((x: any) => x.id === vSel) || {}).telefone || "");
            return <>
              <div className="dl-pv-cab"><b>{u.nome}</b> <span className="hint">{l.length} cliente{l.length === 1 ? "" : "s"} para cobrar</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {l.length > 0 && <button className="btn primary sm" onClick={() => cobrarTodos(l, u.nome)}>📣 Cobrar todos ({l.length})</button>}
                  {l.length > 0 && tel && <a className="btn wa sm" href={waTexto(tel, msgVend(u, l))} target="_blank" rel="noopener">Mandar a lista no WhatsApp</a>}
                  <button className="btn ghost sm" onClick={() => setVSel("")}>✕</button></span></div>
              {l.length ? <div className="dl-lista">{l.map((c: any) => { const p = ROT_PEND[pendDe(c)]; return (
                <div className="dl-l" key={c.id}>
                  <b className="dl-h" style={{ fontSize: 12 }}>{c.dataLoja ? fmtDateTime(c.dataLoja).slice(0, 5) + " " + hora(c) : "—"}</b><Origem c={c} />
                  <span className="dl-nm" onClick={() => abrirDetalhe(c.id)}>{c.cliente}<small>{STATUS_CLIENTE[R.statusClienteDe(c)] || "—"}{c.consultorId ? " · consultor " + R.nomeUser(c.consultorId) : ""}{c.tratativa && c.tratativa.cobradoEm ? " · cobrado " + tempoRel(c.tratativa.cobradoEm) : ""}</small></span>
                  <span className="badge" style={{ background: "transparent", color: p[1], border: "1px solid " + p[1] }}>{p[0]}</span>
                  <button className="btn sm" onClick={() => cobrar(c)}>{c.tratativa && c.tratativa.cobradoEm ? "Cobrar de novo" : "Cobrar"}</button>
                </div>); })}</div> : <div className="empty" style={{ padding: "14px 8px" }}>Nada parado com {u.nome}. 👏</div>}
            </>; })()}
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

      {!soHoje && <div className="panel" style={{ marginBottom: 16 }}><h3>Agendamentos na loja por dia <span className="pill" style={{ marginLeft: 8 }}>{fmtDateTime(de + "T12:00").slice(0, 5)} a {fmtDateTime(ate + "T12:00").slice(0, 5)}</span></h3>
        {dias.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Dia</th><th>Agendados</th><th>Marketing</th><th>Externos</th><th>Vieram</th><th>Não vieram</th><th>Cancelaram</th><th>Vendas</th><th>Sem vendedor</th></tr></thead>
          <tbody>{dias.map(d => { const r = porDia[d]; return <tr key={d}><td><b>{fmtDateTime(d + "T12:00").slice(0, 5)}</b> <small>{["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][parseData(d + "T12:00").getDay()]}</small></td><td><b>{r.t}</b></td><td>{r.mkt}</td><td>{r.ext}</td><td style={{ color: "var(--st-concluida)", fontWeight: 700 }}>{r.veio}</td><td>{r.nao}</td><td>{r.canc}</td><td style={{ color: "var(--st-concluida)", fontWeight: 700 }}>{r.vend}</td><td style={r.semVend ? { color: "var(--warn)", fontWeight: 700 } : undefined}>{r.semVend}</td></tr>; })}
            <tr style={{ borderTop: "2px solid var(--line)" }}><td><b>Total</b></td><td><b>{tot.t}</b></td><td>{tot.mkt}</td><td>{tot.ext}</td><td><b>{tot.veio}</b> <small>({tot.t ? Math.round(tot.veio / tot.t * 100) : 0}%)</small></td><td>{tot.nao}</td><td>{tot.canc}</td><td><b>{tot.vend}</b></td><td>{tot.semVend}</td></tr></tbody></table></div>
          : <div className="empty" style={{ padding: "18px 8px" }}>Nenhum agendamento na loja no período.</div>}
      </div>}

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
        <Kpi n={f.realizadas} l="Visitas realizadas" />
        <Kpi n={f.total} l="Clientes direcionados" />
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
