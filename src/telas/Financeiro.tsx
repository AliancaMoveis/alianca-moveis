import { useState } from "react";
import { useApp } from "../estado";
import { TIPO_REEMBOLSO, fmtDate, fmtDateTime, fmtMoeda, parseMoeda, vendaContaVolume } from "../lib/regras";
import { Kpi } from "./Dashboard";

export default function Financeiro() {
  const { R } = useApp();
  const [aba, setAba] = useState<"consultores" | "vendedores">("consultores");
  if ((R.ehConsultorExterno() || R.ehMedidor()) && !R.ehGestao()) return <FinConsultor />;
  if (!R.ehGestao()) return <VendasVendedores />;
  return <>
    <div className="subnav" style={{ marginBottom: 6 }}><button className={aba === "consultores" ? "on" : ""} onClick={() => setAba("consultores")}>Consultores e medidores</button><button className={aba === "vendedores" ? "on" : ""} onClick={() => setAba("vendedores")}>Vendedores (loja)</button></div>
    {aba === "consultores" ? <FinConsultor /> : <VendasVendedores />}
  </>;
}

// Vendedor (loja): só o total das vendas, separado por origem. A comissão do vendedor é calculada no Tático.
function VendasVendedores() {
  const { R, st, abrirDetalhe } = useApp() as any;
  const souVend = R.mySetores().includes("atendente_cliente") && !R.ehGestao();
  const [de, setDe] = useState(""); const [ate, setAte] = useState(""); const [vend, setVend] = useState("");
  const alvo = souVend ? R.currentUserId : vend;
  const vendas = st.chamados.filter((c: any) => R.domMarketing(c) && c.atendenteId && vendaContaVolume(c.venda) && (!alvo || c.atendenteId === alvo)
    && (R.dentroPeriodo(c.venda.dataVenda || c.venda.quando, de, ate) || (!de && !ate)));
  const aConfirmar = st.chamados.filter((c: any) => R.domMarketing(c) && c.venda && c.venda.status === "registrada" && (!alvo || c.atendenteId === alvo)).length;
  const ext = vendas.filter((c: any) => R.origemLoja(c) === "externo"), mkt = vendas.filter((c: any) => R.origemLoja(c) === "marketing");
  const soma = (arr: any[]) => arr.reduce((s, c) => s + parseMoeda(c.venda.valor), 0);
  const temValor = vendas.some((c: any) => R.podeVerValor(c));
  const val = (arr: any[]) => temValor ? fmtMoeda(soma(arr)) : "—";
  const Lista = ({ arr, vazio }: any) => arr.length ? arr.slice().sort((a: any, b: any) => String(b.venda.dataVenda || b.venda.quando).localeCompare(String(a.venda.dataVenda || a.venda.quando))).map((c: any) => (
    <div className="fin-item" key={c.id} onClick={() => abrirDetalhe(c.id)} style={{ cursor: "pointer" }}><div><div className="nm">{c.cliente}</div><div className="sub">Venda nº {c.venda.numero} · {fmtDate(c.venda.dataVenda || c.venda.quando)}{!souVend ? " · " + R.nomeUser(c.atendenteId) : ""}{c.consultorId ? " · consultor " + R.nomeUser(c.consultorId) : ""}</div></div>{R.podeVerValor(c) && c.venda.valor ? <div className="val">{"R$ " + c.venda.valor}</div> : null}</div>
  )) : <div className="empty" style={{ padding: "24px 10px" }}>{vazio}</div>;
  return (
    <section className="view active" id="view-financeiro">
      <div className="view-head"><div><h2>{souVend ? "Minhas vendas" : "Vendas dos vendedores"}</h2><p>Total das vendas vindas dos atendimentos, separado por origem: <b>consultores externos</b> e <b>marketing</b>.</p></div></div>
      <div className="aviso-anexo" style={{ marginBottom: 14, background: "var(--primary-soft)", borderColor: "var(--primary)", color: "var(--primary)" }}><b>A comissão do vendedor (2%) é calculada no Tático, no usuário de cada vendedor</b> — não neste painel. Aqui não há pagamento por visita: só o total vendido.</div>
      <div className="card" style={{ padding: "16px 18px", marginBottom: 16 }}><div className="grid">
        <div className="field"><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
        <div className="field"><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
        {!souVend && <div className="field"><label>Vendedor</label><select value={vend} onChange={e => setVend(e.target.value)}><option value="">Todos os vendedores</option>{R.vendedores().map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>}
      </div></div>
      <div className="kpis">
        <Kpi n={ext.length} l="Vendas — clientes externos" />{temValor && <Kpi n={val(ext)} l="Total externos" />}
        <Kpi n={mkt.length} l="Vendas — clientes marketing" />{temValor && <Kpi n={val(mkt)} l="Total marketing" />}
        {temValor ? <Kpi n={val(vendas)} l="Total geral" cor="var(--st-concluida)" /> : <Kpi n={vendas.length} l="Total de vendas" cor="var(--st-concluida)" />}
      </div>
      {aConfirmar > 0 && <div style={{ fontSize: 12.5, color: "var(--warn)", margin: "-6px 0 12px" }}>{aConfirmar} venda(s) aguardando confirmação da Gestão — ainda não entram nestes totais.</div>}
      <div className="panel-grid">
        <div className="panel"><h3><span className="origem externo">Externo</span> Vendas de clientes dos consultores</h3><Lista arr={ext} vazio="Nenhuma venda de cliente externo no período." /></div>
        <div className="panel"><h3><span className="origem marketing">Marketing</span> Vendas de clientes do marketing</h3><Lista arr={mkt} vazio="Nenhuma venda de cliente do marketing no período." /></div>
      </div>
    </section>
  );
}

function FinConsultor() {
  const { R, st } = useApp();
  const [de, setDe] = useState(""); const [ate, setAte] = useState(""); const [cons, setCons] = useState("");
  const souGestor = R.ehGestao();
  const consultores = st.usuarios.filter(u => u.somenteAtribuidos && ((u.setores || []).includes("consultor_externo") || (u.setores || []).includes("medidas")));
  const { pagamentoVisita, comissaoPct: pct } = R.cfg();
  const alvo = souGestor ? cons : R.currentUserId;
  let sub = souGestor ? "Visitas, medidas, comissão e reembolsos de cada consultor e medidor. Filtre por período." : "Suas visitas, medidas, vendas, comissão e reembolsos.";
  const cab = (
    <>
      <div className="view-head"><div><h2 id="finTitulo">{souGestor ? "Financeiro — Consultores e medidores" : "Financeiro"}</h2><p id="finSub">{souGestor && alvo ? "Extrato de " + R.nomeUser(alvo) + ". Filtre por período." : sub}</p></div></div>
      <div className="card" style={{ padding: "16px 18px", marginBottom: 16 }}>
        <div className="grid">
          <div className="field"><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
          <div className="field"><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
          {souGestor && <div className="field" id="finConsultorField"><label>Consultor / medidor</label><select value={cons} onChange={e => setCons(e.target.value)}><option value="">Todos</option>{consultores.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>}
        </div>
        <div style={{ marginTop: 12 }}><button className="btn ghost sm" onClick={() => { setDe(""); setAte(""); setCons(""); }}>Limpar filtros</button></div>
      </div>
    </>
  );

  if (souGestor && !alvo) {
    const resumos = consultores.map(u => ({ u, r: R.extratoConsultor(u.id, de, ate) }));
    const totVisitas = resumos.reduce((s, x) => s + x.r.visitas.length, 0), totVendas = resumos.reduce((s, x) => s + x.r.vendas.length, 0);
    const totVendido = resumos.reduce((s, x) => s + x.r.totalVendido, 0), totComissao = resumos.reduce((s, x) => s + x.r.comissao, 0);
    const totVisitasR = resumos.reduce((s, x) => s + x.r.pagamentoVisitas, 0);
    const totMed = resumos.reduce((s, x) => s + x.r.medidas.length, 0), totMedR = resumos.reduce((s, x) => s + x.r.pagamentoMedidas, 0), totReemb = resumos.reduce((s, x) => s + x.r.totalReembolsos, 0);
    const totGeral = resumos.reduce((s, x) => s + x.r.total, 0);
    return (
      <section className="view active" id="view-financeiro">{cab}
        <div className="kpis" id="finKpis"><Kpi n={totVisitas} l="Visitas pagas" /><Kpi n={totMed} l="Medidas feitas" /><Kpi n={totVendas} l="Vendas efetivadas" /><Kpi fs={22} n={fmtMoeda(totVendido)} l="Valor vendido" /><Kpi fs={22} n={fmtMoeda(totComissao)} l={`Comissão (${pct}%)`} /><Kpi fs={22} n={fmtMoeda(totReemb)} l="Reembolsos aprovados" /><Kpi fs={22} n={fmtMoeda(totGeral)} l="Total a receber" cor="var(--st-concluida)" /></div>
        <div id="finResumoTodos" className="panel"><h3>Por consultor <span className="hint" style={{ marginLeft: 6 }}>clique para ver o extrato</span></h3>
          {resumos.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Nome</th><th>Visitas pagas</th><th>Medidas</th><th>Vendas efetivadas</th><th>Valor vendido</th><th>Visitas + medidas</th><th>Comissão ({pct}%)</th><th>Reembolsos</th><th>Valor a receber</th></tr></thead>
            <tbody>{resumos.sort((a, b) => b.r.total - a.r.total || b.r.totalVendido - a.r.totalVendido).map(({ u, r }) => (
              <tr key={u.id} onClick={() => setCons(u.id)} style={{ cursor: "pointer" }}><td><b>{u.nome}</b>{(u.setores || []).includes("medidas") ? <span className="pill" style={{ marginLeft: 6 }}>medidor</span> : null}</td><td>{r.visitas.length}</td><td>{r.medidas.length}</td><td>{r.vendas.length}</td><td style={{ fontWeight: 700 }}>{fmtMoeda(r.totalVendido)}</td><td>{fmtMoeda(r.pagamentoVisitas + r.pagamentoMedidas)}</td><td>{fmtMoeda(r.comissao)}</td><td>{fmtMoeda(r.totalReembolsos)}</td><td style={{ fontWeight: 800, color: "var(--st-concluida)" }}>{fmtMoeda(r.total)}</td></tr>))}</tbody>
            <tfoot><tr><td><b>Total</b></td><td><b>{totVisitas}</b></td><td><b>{totMed}</b></td><td><b>{totVendas}</b></td><td><b>{fmtMoeda(totVendido)}</b></td><td><b>{fmtMoeda(totVisitasR + totMedR)}</b></td><td><b>{fmtMoeda(totComissao)}</b></td><td><b>{fmtMoeda(totReemb)}</b></td><td style={{ fontWeight: 800, color: "var(--st-concluida)" }}>{fmtMoeda(totGeral)}</td></tr></tfoot></table></div>
            : <div className="empty">Nenhum consultor cadastrado.</div>}
          <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 8 }}>Valor a receber = visitas realizadas e medidas feitas (R$ {pagamentoVisita} cada) + comissão de {pct}% sobre as vendas efetivadas (medida não gera comissão) + reembolsos aprovados. Vendas a confirmar e promissórias não entram.</div>
        </div>
      </section>
    );
  }

  const r = R.extratoConsultor(alvo, de, ate);
  const pendVendas = st.chamados.filter(c => c.consultorId === alvo && c.venda && ["registrada", "promissoria"].includes(c.venda.status) && (R.dentroPeriodo(c.venda.dataVenda || c.venda.quando, de, ate) || (!de && !ate)));
  const visOrd = r.visitas.slice().sort((a, b) => +new Date(b.dataLoja) - +new Date(a.dataLoja));
  const vendOrd = r.vendas.slice().sort((a, b) => +new Date(b.venda.dataVenda || b.venda.quando) - +new Date(a.venda.dataVenda || a.venda.quando));
  return (
    <section className="view active" id="view-financeiro">{cab}
      <div className="kpis" id="finKpis"><Kpi n={r.visitas.length} l="Visitas pagas" /><Kpi n={r.medidas.length} l="Medidas feitas" /><Kpi fs={22} n={fmtMoeda(r.pagamentoVisitas + r.pagamentoMedidas)} l="Visitas + medidas" /><Kpi n={r.vendas.length} l="Vendas efetivadas" /><Kpi fs={22} n={fmtMoeda(r.comissao)} l={`Comissão (${pct}%)`} /><Kpi fs={22} n={fmtMoeda(r.totalReembolsos)} l="Reembolsos aprovados" /><Kpi fs={22} n={fmtMoeda(r.total)} l="Valor a receber" cor="var(--st-concluida)" /></div>
      <div id="finDetalheWrap"><div className="panel-grid">
        <div className="panel"><h3>Pagamento por visitas <span className="pill" style={{ marginLeft: 8 }}>R$ {pagamentoVisita} por visita</span></h3><div id="finVisitas">
          {visOrd.length ? visOrd.map(c => <div className="fin-item" key={c.id}><div><div className="nm">{c.cliente}</div><div className="sub">Vinda à loja: {fmtDateTime(c.dataLoja)}</div></div><div className="val">{fmtMoeda(pagamentoVisita)}</div></div>) : <div className="empty" style={{ padding: "24px 10px" }}>Nenhuma visita paga no período.</div>}
        </div></div>
        <div className="panel"><h3>Vendas e comissão <span className="pill" style={{ marginLeft: 8 }}>{pct}% sobre vendas aprovadas</span></h3><div id="finVendas">
          {vendOrd.length ? vendOrd.map(c => { const val = parseMoeda(c.venda.valor); const com = val * (pct / 100); return (
            <div className="fin-item" key={c.id}><div><div className="nm">{c.cliente}</div><div className="sub">Venda nº {c.venda.numero} · {fmtDate(c.venda.dataVenda || c.venda.quando)}{c.venda.vendedor ? " · " + c.venda.vendedor : ""} · valor {fmtMoeda(val)}</div></div><div className="val">{fmtMoeda(com)}<span className="sub2">comissão</span></div></div>); })
            : <div className="empty" style={{ padding: "24px 10px" }}>Nenhuma venda efetivada no período.</div>}
          {pendVendas.length > 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--warn)" }}>{pendVendas.length} venda(s) sem comissão ainda (aguardando confirmação ou em promissória).</div>}
        </div></div>
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Medidas feitas <span className="pill" style={{ marginLeft: 8 }}>R$ {pagamentoVisita} por medida · sem comissão</span></h3>
          {r.medidas.length ? r.medidas.map((c: any) => <div className="fin-item" key={c.id}><div><div className="nm">{c.cliente}</div><div className="sub">Medida {c.id} · {fmtDateTime(c.tratativa.medida.realizadaEm)}</div></div><div className="val">{fmtMoeda(pagamentoVisita)}</div></div>) : <div className="empty" style={{ padding: "24px 10px" }}>Nenhuma medida no período.</div>}</div>
        <div className="panel"><h3>Reembolsos aprovados</h3>
          {r.reembolsos.length ? r.reembolsos.map((x: any) => <div className="fin-item" key={x.id}><div><div className="nm">{TIPO_REEMBOLSO[x.tipo] || x.tipo}</div><div className="sub">{fmtDate(x.data)}{x.descricao ? " · " + x.descricao : ""}</div></div><div className="val">{fmtMoeda(x.valor)}</div></div>) : <div className="empty" style={{ padding: "24px 10px" }}>Nenhum reembolso aprovado no período.</div>}</div>
      </div></div>
    </section>
  );
}
