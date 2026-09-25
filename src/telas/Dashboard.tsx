import { useState } from "react";
import { useApp } from "../estado";
import { PainelConsultor, PainelLoja, PainelVendedor } from "./DashLoja";
import PainelOperadora from "./PainelOperadora";
import PainelConsultorVisual from "./PainelConsultorVisual";
import PainelGestao from "./PainelGestao";
import PainelDono from "./PainelDono";
import PainelBruno from "./PainelBruno";
import { LIMITE_INATIVIDADE_H, ORDEM, STATUS, fmtDate, fmtMoeda, hojeISO, isoLocal, tempoRel, vendaContaVolume } from "../lib/regras";

export const BarRow = ({ nm, pct, v, cor, extra }: { nm: string; pct: number; v: any; cor?: string; extra?: React.ReactNode }) => (
  <div className="bar-row"><span className="nm">{nm}</span><span className="track"><span className="fill" style={{ width: pct + "%", ...(cor ? { background: cor } : {}) }}></span></span><span className="v">{v}</span>{extra}</div>
);
const Nada = ({ t }: { t: string }) => <div style={{ color: "var(--ink-faint)", fontSize: 13 }}>{t}</div>;
export const Kpi = ({ n, l, cls, cor, fs }: { n: any; l: string; cls?: string; cor?: string; fs?: number }) => (
  <div className={"kpi" + (cls ? " " + cls : "")}><div className="n" style={{ ...(cor ? { color: cor } : {}), ...(fs ? { fontSize: fs } : {}) }}>{n}</div><div className="l">{l}</div></div>
);

export default function Dashboard() {
  const { R, st, irPara, abrirDetalhe, currentUserId } = useApp() as any;
  // período: padrão = mês atual. O que está em aberto (fila, atrasos, críticos) aparece sempre, de qualquer data;
  // o período vale para o que aconteceu nele: abertos, concluídos, agendamentos, vendas.
  const [preset, setPreset] = useState<"mes" | "30" | "90" | "periodo">("mes");
  const hoje = hojeISO();
  const menos = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return isoLocal(d); };
  const [pDe, setPDe] = useState(hoje.slice(0, 8) + "01"); const [pAte, setPAte] = useState(hoje);
  const de = preset === "mes" ? hoje.slice(0, 8) + "01" : preset === "30" ? menos(29) : preset === "90" ? menos(89) : pDe;
  const ate = preset === "periodo" ? pAte : hoje;
  const noPeriodo = (v: any) => { if (!v) return false; const d = new Date(v); return (!de || d >= new Date(de + "T00:00:00")) && (!ate || d <= new Date(ate + "T23:59:59")); };
  // área: quem vê call center e marketing (Gestão) pode separar. Pós-venda Projetados conta como call center.
  const veAmbos = R.ehGestao() || (R.verTudo() && R.temMarketing());
  const [area, setArea] = useState<"tudo" | "cc" | "mkt">("tudo");
  const naArea = (c: any) => area === "tudo" || (area === "mkt") === !!R.domMarketing(c);
  const todos = st.chamados.filter(R.podeVer);
  const vis = todos.filter((c: any) => noPeriodo(c.criadoEm));
  const concluidoEm = (c: any) => { const h = (c.historico || []).filter((x: any) => (String(x.texto).startsWith("Status → Concluída") || String(x.texto).startsWith("✓ Atendimento finalizado"))); return h.length ? h[h.length - 1].quando : c.criadoEm; };
  const periodoTxt = " · " + fmtDate(de) + " a " + fmtDate(ate);
  const sub = (R.verTudo() ? (R.ehGestao() ? "Visão consolidada de todos os setores, em tempo real." : "Visão consolidada dos setores do call center, em tempo real. Marketing e Consultoria externa têm supervisão própria.") : "Visão do seu setor (" + (R.mySetores().map(R.setorNome).join(", ") || "—") + "), em tempo real.") + periodoTxt;
  // indicadores do call center (pós-venda). Marketing não tem prazo de resposta e fica fora destes números.
  const cc = todos.filter((c: any) => !R.domMarketing(c));
  const pr = (c: any) => R.prioridade(c);
  const abertas = cc.filter((c: any) => c.status === "aberta" || c.status === "tratativa").length, atras = cc.filter((c: any) => pr(c) === "atrasado").length,
    crit = cc.filter((c: any) => pr(c) === "critico").length, urg = cc.filter((c: any) => pr(c) === "urgente").length, resp = cc.filter((c: any) => c.status === "respondida").length, inf = cc.filter((c: any) => c.status === "informar").length,
    conc = cc.filter((c: any) => c.status === "concluida" && noPeriodo(concluidoEm(c))).length, novos = vis.filter((c: any) => !R.domMarketing(c)).length;

  const vejaMkt = (R.temMarketing() || R.ehGestao()) && area !== "cc";
  const verCC = area !== "mkt" && (R.verTudo() || R.mySetores().some((x: string) => !R.ehSetorMarketing(x)));
  const mktTodos = todos.filter(R.domMarketing);
  const mktCrit = mktTodos.filter((c: any) => R.prioridade(c) === "critico").length;
  const mktNovos = vis.filter(R.domMarketing).length;
  const mktVendasPer = mktTodos.filter((c: any) => vendaContaVolume(c.venda) && noPeriodo(c.venda.dataVenda || c.venda.quando)).length;
  const mktAConfirmar = mktTodos.filter((c: any) => c.venda && c.venda.status === "registrada").length;
  const mktVisitasPer = mktTodos.filter((c: any) => !R.ehDireto(c) && R.visitaFeita(c) && noPeriodo(c.dataVisita || c.criadoEm)).length;
  const mktAgendPer = mktTodos.filter((c: any) => c.dataLoja && noPeriodo(c.dataLoja)).length;
  const mktVisitasPend = mktTodos.filter((c: any) => c.setorDestino === "consultor_externo" && !(c.tratativa && c.tratativa.realizada)).length;
  const mktTix = vis.filter(R.domMarketing);
  const porOp: Record<string, any> = {};
  mktTix.forEach((c: any) => { const k = c.solicitanteId; porOp[k] = porOp[k] || { loja: 0, consultor: 0, total: 0 }; porOp[k].total++; if (R.TIPOS[c.tipo] && R.TIPOS[c.tipo].direto) porOp[k].loja++; else porOp[k].consultor++; });
  const rowsOp = Object.entries(porOp).map(([uid, v]) => [R.nomeUser(uid), v] as [string, any]).sort((a, b) => b[1].total - a[1].total);
  const vendidos = mktTix.filter((c: any) => vendaContaVolume(c.venda));
  const pendentesVal = mktTix.filter((c: any) => c.venda && c.venda.status === "registrada").length;
  const porOpVenda: Record<string, any> = {};
  vendidos.forEach((c: any) => { const k = c.solicitanteId; porOpVenda[k] = porOpVenda[k] || { n: 0, total: 0 }; porOpVenda[k].n++; const val = parseFloat((c.venda && c.venda.valor || "0").replace(/\./g, "").replace(",", ".")); if (!isNaN(val)) porOpVenda[k].total += val; });
  const rowsVenda = Object.entries(porOpVenda).map(([uid, v]) => [R.nomeUser(uid), v] as [string, any]);
  const vejaValor = R.ehGestao() || R.mySetores().includes("gerente_loja");

  const ehCons = R.ehConsultorExterno();
  const r = ehCons ? R.extratoConsultor(R.currentUserId, de, ate) : null;
  const pendCons = ehCons ? st.chamados.filter((c: any) => c.consultorId === R.currentUserId && c.venda && ["registrada", "promissoria"].includes(c.venda.status)).length : 0;

  const ccTix = vis.filter((c: any) => c.setorDestino === "callcenter");
  const porAt: Record<string, any> = {};
  ccTix.forEach((c: any) => { const k = c.solicitanteId; porAt[k] = porAt[k] || { ab: 0, rv: 0 }; porAt[k].ab++; if (c.status === "concluida") porAt[k].rv++; });
  const rowsAt = Object.entries(porAt).map(([uid, v]) => [R.nomeUser(uid), v] as [string, any]).sort((a, b) => b[1].ab - a[1].ab);

  const srows = ORDEM.map(s => [STATUS[s].label, cc.filter((c: any) => c.status === s && (s !== "concluida" || noPeriodo(concluidoEm(c)))).length, s] as [string, number, string]);
  const smx = Math.max(1, ...srows.map(x => x[1]));
  // uma linha por chamado, com a faixa de prioridade dele (crítico, atrasado ou urgente); marketing entra só se parado +24h
  const acao = R.ordenar(todos.filter((c: any) => naArea(c) && ["critico", "atrasado", "urgente"].includes(pr(c))));
  const ab = cc.filter((c: any) => c.status === "aberta" || c.status === "tratativa");
  const pf: Record<string, number> = {}; ab.forEach((c: any) => { if (c.fabrica && c.tipo === "prazo_fabrica") pf[c.fabrica] = (pf[c.fabrica] || 0) + 1; });
  const fr = Object.entries(pf).sort((a, b) => b[1] - a[1]); const mxf = Math.max(1, ...fr.map(x => x[1]));
  const evs: any[] = []; todos.filter(naArea).forEach((c: any) => (c.historico || []).forEach((h: any) => evs.push({ id: c.id, quando: h.quando, quem: h.quem, texto: h.texto })));
  evs.sort((a, b) => +new Date(b.quando) - +new Date(a.quando));

  const cabecalho = <>
      <div className="view-head"><div><h2>Dashboard</h2><p id="dashSub">{sub}</p></div></div>
      <div className="card" style={{ padding: "14px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="chips" style={{ margin: 0 }}>
            {([["mes", "Mês atual"], ["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["periodo", "Escolher período"]] as [any, string][]).map(([k, l]) =>
              <button key={k} className={"chip" + (preset === k ? " on" : "")} onClick={() => setPreset(k)}>{l}</button>)}
          </div>
          {preset === "periodo" && <>
            <div className="field" style={{ minWidth: 150 }}><label>De</label><input type="date" id="dashDe" value={pDe} max={pAte || undefined} onChange={e => setPDe(e.target.value)} /></div>
            <div className="field" style={{ minWidth: 150 }}><label>Até</label><input type="date" id="dashAte" value={pAte} min={pDe || undefined} onChange={e => setPAte(e.target.value)} /></div>
          </>}
          <span className="live" style={{ marginLeft: "auto" }}><i></i>ao vivo</span>
        </div>
        {veAmbos && !R.ehGestao() && <div className="subnav" style={{ marginTop: 12 }}>
          {([["tudo", "Todos os setores"], ["cc", "Call center e pós-venda"], ["mkt", "Marketing"]] as [any, string][]).map(([k, l]) => <button key={k} className={area === k ? "on" : ""} onClick={() => setArea(k)}>{l}</button>)}
        </div>}
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 8 }}>Período {fmtDate(de)} a {fmtDate(ate)}: vale para novos, concluídos, agendamentos e vendas. O que está em aberto aparece sempre, de qualquer data.</div>
      </div>
  </>;
  // operadora do marketing: dashboard só visual (números e gráficos), sem lista de ações
  const souOperadora = R.mySetores().includes("marketing_operadora") && !R.ehGestao() && !R.temMarketing() && !R.verTudo();
  const souConsultor = R.ehConsultorExterno() && !R.ehGestao() && !R.temMarketing() && !R.verTudo();
  if (R.ehProprietario()) return <section className="view active" id="view-dashboard"><div className="view-head"><div><h2>Painel do dono</h2><p>Resultado do mês, loja ao vivo, quem vende e quanto custa vender. Só visualização — as tarefas ficam com a Gestão.</p></div></div><PainelDono /></section>;
  if (R.ehGestao()) return <section className="view active" id="view-dashboard">{cabecalho}<PainelBruno de={de} ate={ate} /></section>;
  if (souConsultor) return <section className="view active" id="view-dashboard">{cabecalho}<PainelConsultorVisual de={de} ate={ate} /></section>;
  if (souOperadora) return <section className="view active" id="view-dashboard">{cabecalho}<PainelOperadora de={de} ate={ate} /></section>;
  return (
    <section className="view active" id="view-dashboard">
      {cabecalho}
      {R.ehGestao() && area !== "cc" && <PainelGestao de={de} ate={ate} />}
      {!R.ehGestao() && R.podeEditarAgenda() && (area !== "cc") && <PainelLoja de={de} ate={ate} />}
      {R.mySetores().includes("atendente_cliente") && !R.ehGestao() && <PainelVendedor />}
      {verCC && veAmbos && area === "tudo" && <div className="sec-label" style={{ margin: "0 0 8px" }}>Call center e pós-venda</div>}
      {verCC && <div className="kpis" id="kpis">
        <Kpi n={novos} l="Atendimentos no período" />
        <Kpi n={abertas} l="Em aberto (sem resposta)" />
        <Kpi n={crit} l="Críticos (+24h)" cls={crit ? "alert" : ""} cor={crit ? "var(--critico)" : undefined} />
        <Kpi n={atras} l="Atrasados (até 24h)" cls={atras ? "alert" : ""} />
        <Kpi n={urg} l="Urgentes no prazo" cls={urg ? "urg" : ""} />
        <Kpi n={resp} l="Respondidos — falta concluir" />
        <Kpi n={inf} l="Informar o cliente" cor={inf ? "var(--st-informar)" : undefined} />
        <Kpi n={conc} l="Concluídos no período" />
      </div>}
      {vejaMkt && veAmbos && !R.ehGestao() && <>
        {area === "tudo" && <div className="sec-label" style={{ margin: "0 0 8px" }}>Marketing</div>}
        <div className="kpis" id="kpisMkt">
          <Kpi n={mktNovos} l="Clientes novos no período" />
          <Kpi n={mktVisitasPer} l="Visitas no período" />
          <Kpi n={mktAgendPer} l="Agendamentos na loja no período" />
          <Kpi n={mktCrit} l={`Sem atualização +${LIMITE_INATIVIDADE_H}h`} cls={mktCrit ? "alert" : ""} cor={mktCrit ? "var(--critico)" : undefined} />
          <Kpi n={mktAConfirmar} l="Vendas a confirmar" cls={mktAConfirmar ? "urg" : ""} />
          <Kpi n={mktVendasPer} l="Vendas no período" cor="var(--st-concluida)" />
          <Kpi n={mktVisitasPend} l="Visitas pendentes (a realizar)" cls={mktVisitasPend ? "urg" : ""} />
        </div>
      </>}
      {R.verTudo() && (
        <div className="setores" id="setoresWrap">
          {R.setoresVisiveis().filter((s: any) => area === "tudo" || (area === "mkt") === R.ehSetorMarketing(s.id)).map((s: any) => {
            const mkt = R.ehSetorMarketing(s.id);
            const arr = todos.filter((c: any) => c.setorDestino === s.id && (c.status !== "concluida" && R.emAberto(c) || noPeriodo(concluidoEm(c))));
            const aberto = mkt ? arr.filter((c: any) => R.emAberto(c)).length : arr.filter((c: any) => c.status === "aberta" || c.status === "tratativa").length;
            const at = arr.filter((c: any) => pr(c) === "critico" || pr(c) === "atrasado").length, ug = arr.filter((c: any) => pr(c) === "urgente").length, cc = arr.filter((c: any) => mkt ? !R.emAberto(c) : c.status === "concluida").length;
            const total = arr.length;
            return (
              <div className="setorc" key={s.id} data-s={s.id} onClick={() => irPara(R.ehSetorMarketing(s.id) ? "acompmkt" : "fila", { setor: s.id })}>
                <div className="hd"><div><div className="nm">{s.nome}</div><div className="subl">em aberto</div></div><div className="ab">{aberto}</div></div>
                <div className="mini">{ORDEM.map(x => { const n = arr.filter((c: any) => c.status === x).length; return n ? <i key={x} style={{ width: n / total * 100 + "%", background: `var(--st-${x})` }} title={STATUS[x].label + ": " + n}></i> : null; })}</div>
                <div className="row">{mkt ? <><span className={"st" + (at ? " al" : "")}><b>{at}</b> sem atualização +{LIMITE_INATIVIDADE_H}h</span><span className="st"><b>{cc}</b> encerrados no período</span></>
                  : <><span className={"st" + (at ? " al" : "")}><b>{at}</b> atrasados</span><span className="st"><b>{ug}</b> urgentes</span><span className="st"><b>{cc}</b> concluídos no período</span></>}</div>
              </div>
            );
          })}
        </div>
      )}
      {vejaMkt && !R.ehGestao() && (
        <div className="panel-grid" id="painelMktWrap">
          <div className="panel"><h3>Agendamentos por operadora</h3><div id="mktPorOperadora">
            {rowsOp.length ? rowsOp.map(([nm, v]) => <div key={nm}><BarRow nm={nm} pct={v.total / Math.max(1, ...rowsOp.map(x => x[1].total)) * 100} v={v.total} /><div style={{ fontSize: 11.5, color: "var(--ink-faint)", margin: "-6px 0 8px 0" }}>{v.consultor} p/ consultor · {v.loja} direto na loja</div></div>) : <Nada t="Nenhum agendamento ainda." />}
          </div></div>
          <div className="panel"><h3>Vendas das suas operadoras</h3><div id="mktVendas">
            {pendentesVal > 0 && <div style={{ fontSize: 11.5, color: "var(--warn)", marginBottom: 8 }}>{pendentesVal} venda(s) aguardando confirmação da Gestão — não contam aqui ainda.</div>}
            {rowsVenda.length ? rowsVenda.map(([nm, v]) => <div key={nm}><BarRow nm={nm} pct={v.n / Math.max(1, ...rowsVenda.map(x => x[1].n)) * 100} v={v.n} cor="var(--st-concluida)" />{vejaValor && v.total ? <div style={{ fontSize: 11.5, color: "var(--ink-faint)", margin: "-6px 0 8px 0" }}>R$ {v.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div> : null}</div>) : <Nada t="Nenhuma venda efetivada ainda." />}
          </div></div>
        </div>
      )}
      {ehCons && <PainelConsultor de={de} ate={ate} />}
      {ehCons && r && (
        <div id="dashConsultorWrap" style={{ marginBottom: 16 }}>
          <div className="panel">
            <h3>Minhas vendas e comissão (consultor) <span className="pill" style={{ marginLeft: 8 }}>{fmtDate(de)} a {fmtDate(ate)}</span></h3>
            <div className="kpis" style={{ marginBottom: 0 }}>
              <Kpi n={r.visitas.length} l="Visitas pagas" /><Kpi n={fmtMoeda(r.pagamentoVisitas)} l="Pagamento por visitas" />
              <Kpi n={r.vendas.length} l="Vendas efetivadas" /><Kpi n={fmtMoeda(r.totalVendido)} l="Valor vendido" />
              <Kpi n={fmtMoeda(r.comissao)} l={`Comissão (${R.cfg().comissaoPct}%)`} /><Kpi n={fmtMoeda(r.total)} l="Total a receber" cor="var(--st-concluida)" />
            </div>
            <div style={{ marginTop: 12 }}>
              {pendCons > 0 && <div style={{ fontSize: 12.5, color: "var(--warn)", marginBottom: 6 }}>{pendCons} venda(s) sem comissão ainda (aguardando confirmação ou em promissória).</div>}
              <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Extrato detalhado, venda por venda, na aba <b>Financeiro</b>.</div>
            </div>
          </div>
        </div>
      )}
      {R.verTudo() && verCC && (
        <div className="panel-grid" id="painelCallcenterWrap">
          <div className="panel"><h3>Atendimento por atendente (Call center)</h3><div id="ccPorAtendente">
            {rowsAt.length ? rowsAt.map(([nm, v]) => <BarRow key={nm} nm={nm} pct={v.ab / Math.max(1, ...rowsAt.map(x => x[1].ab)) * 100} v={v.ab} extra={<span className="v" style={{ color: "var(--st-concluida)" }}>{v.rv}</span>} />) : <Nada t="Sem solicitações do call center ainda." />}
          </div></div>
        </div>
      )}
      <div className="panel-grid">
        {verCC && <div className="panel"><h3 id="tPanel1">Situação da fila</h3><div id="bars1">{srows.map(([nm, n, s]) => <BarRow key={s} nm={nm} pct={n / smx * 100} v={n} cor={`var(--st-${s})`} />)}</div></div>}
        <div className="panel"><h3>Precisam de ação agora</h3><div className="acao-list" id="acaoList">
          {acao.length ? acao.map((c: any) => { const sp = pr(c); const lbl = R.domMarketing(c) ? "Sem atualização" : sp === "critico" ? "Crítico" : sp === "atrasado" ? "Atrasado" : "Urgente"; const cor = sp === "critico" ? "var(--critico)" : "var(--danger)";
            return <div className="acao" key={c.id} style={{ borderLeftColor: cor }} onClick={() => abrirDetalhe(c.id)}><span>{c.id} · {c.cliente} · <b>{R.setorNome(c.setorDestino)}</b></span><span className="g" style={{ color: cor }}>{lbl}</span></div>; })
            : <Nada t="Tudo sob controle." />}
        </div></div>
      </div>
      <div className="panel-grid">
        {verCC && <div className="panel"><h3>Prazo de fábrica em aberto, por fábrica</h3><div id="barsFabrica">{fr.length ? fr.map(([fid, n]) => <BarRow key={fid} nm={R.nomeFab(fid)} pct={n / mxf * 100} v={n} />) : <Nada t="Nada em aberto." />}</div></div>}
        <div className="panel"><h3>Atividade recente <span className="live"><i></i>ao vivo</span></h3><div className="feed" id="feed">
          {evs.length ? evs.slice(0, 12).map((e, i) => <div className="f" key={i}><span><b>{e.id}</b> {e.texto} <span style={{ color: "var(--ink-faint)" }}>· {e.quem}</span></span><span className="t">{tempoRel(e.quando)}</span></div>) : <Nada t="Sem atividade." />}
        </div></div>
      </div>
    </section>
  );
}
