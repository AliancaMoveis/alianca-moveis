import { useState } from "react";
import { useApp } from "../estado";
import { fmtDate, fmtDateTime, fmtMoeda, parseMoeda, vendaContaVolume } from "../lib/regras";
import { Kpi } from "./Dashboard";

export default function Financeiro() {
  const { R } = useApp();
  const [aba, setAba] = useState<"consultores" | "vendedores">("consultores");
  if (R.ehConsultorExterno() && !R.ehGestao()) return <FinConsultor />;
  if (!R.ehGestao()) return <VendasVendedores />;
  return <>
    <div className="subnav" style={{ marginBottom: 6 }}><button className={aba === "consultores" ? "on" : ""} onClick={() => setAba("consultores")}>Consultores externos</button><button className={aba === "vendedores" ? "on" : ""} onClick={() => setAba("vendedores")}>Vendedores (loja)</button></div>
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
    <div className="fin-item" key={c.id} onClick={() => abrirDetalhe(c.id)} style={{ cursor: "pointer" }}><div><div className="nm">{c.cliente}</div><div className="sub">Venda nº {c.venda.numero} · {fmtDate(c.venda.dataVenda || c.venda.quando)}{!souVend ? " · " + R.nomeUser(c.atendenteId) : ""}{c.consultorId ? " · consultor " + R.nomeUser(c.consultorId) : ""}</div></div><div className="val">{R.podeVerValor(c) && c.venda.valor ? "R$ " + c.venda.valor : "—"}</div></div>
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
        <Kpi n={ext.length} l="Vendas — clientes externos" /><Kpi n={val(ext)} l="Total externos" />
        <Kpi n={mkt.length} l="Vendas — clientes marketing" /><Kpi n={val(mkt)} l="Total marketing" />
        <Kpi n={val(vendas)} l="Total geral" cor="var(--st-concluida)" />
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
  const consultores = st.usuarios.filter(u => u.somenteAtribuidos && (u.setores || []).includes("consultor_externo"));
  const { pagamentoVisita, comissaoPct: pct } = R.cfg();
  const alvo = souGestor ? cons : R.currentUserId;
  let sub = souGestor ? "Vendas, comissão e pagamento por visita de cada consultor. Filtre por período." : "Suas vendas, comissão e pagamento por visita realizada.";
  const cab = (
    <>
      <div className="view-head"><div><h2 id="finTitulo">{souGestor ? "Financeiro — Consultores externos" : "Financeiro"}</h2><p id="finSub">{souGestor && alvo ? "Extrato de " + R.nomeUser(alvo) + ". Filtre por período." : sub}</p></div></div>
      <div className="card" style={{ padding: "16px 18px", marginBottom: 16 }}>
        <div className="grid">
          <div className="field"><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
          <div className="field"><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
          {souGestor && <div className="field" id="finConsultorField"><label>Consultor</label><select value={cons} onChange={e => setCons(e.target.value)}><option value="">Todos os consultores</option>{consultores.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>}
        </div>
        <div style={{ marginTop: 12 }}><button className="btn ghost sm" onClick={() => { setDe(""); setAte(""); setCons(""); }}>Limpar filtros</button></div>
      </div>
    </>
  );

  if (souGestor && !alvo) {
    const resumos = consultores.map(u => ({ u, r: R.extratoConsultor(u.id, de, ate) }));
    const totVisitas = resumos.reduce((s, x) => s + x.r.visitas.length, 0), totVendas = resumos.reduce((s, x) => s + x.r.vendas.length, 0);
    const totVendido = resumos.reduce((s, x) => s + x.r.totalVendido, 0), totComissao = resumos.reduce((s, x) => s + x.r.comissao, 0);
    return (
      <section className="view active" id="view-financeiro">{cab}
        <div className="kpis" id="finKpis"><Kpi n={totVisitas} l="Visitas pagas" /><Kpi n={totVendas} l="Vendas efetivadas" /><Kpi n={fmtMoeda(totVendido)} l="Total vendido" /><Kpi n={fmtMoeda(totComissao)} l="Comissão total" /></div>
        <div id="finResumoTodos" className="panel"><h3>Por consultor</h3><div id="finPorConsultor">
          {resumos.length ? resumos.sort((a, b) => b.r.total - a.r.total).map(({ u, r }) => (
            <div className="fin-consultor-row" key={u.id} onClick={() => setCons(u.id)}>
              <div><div className="nm" style={{ fontWeight: 600 }}>{u.nome}</div><div className="sub" style={{ fontSize: 12, color: "var(--ink-soft)" }}>{r.visitas.length} visitas · {r.vendas.length} vendas · {fmtMoeda(r.totalVendido)} vendido</div></div>
              <div className="val" style={{ textAlign: "right", fontWeight: 700 }}>{fmtMoeda(r.total)}<span className="sub2" style={{ display: "block", fontSize: 11, color: "var(--ink-faint)", fontWeight: 400 }}>{fmtMoeda(r.pagamentoVisitas)} visitas + {fmtMoeda(r.comissao)} comissão</span></div>
            </div>)) : <div className="empty">Nenhum consultor cadastrado.</div>}
        </div></div>
      </section>
    );
  }

  const r = R.extratoConsultor(alvo, de, ate);
  const pendVendas = st.chamados.filter(c => c.consultorId === alvo && c.venda && ["registrada", "promissoria"].includes(c.venda.status) && (R.dentroPeriodo(c.venda.dataVenda || c.venda.quando, de, ate) || (!de && !ate)));
  const visOrd = r.visitas.slice().sort((a, b) => +new Date(b.dataLoja) - +new Date(a.dataLoja));
  const vendOrd = r.vendas.slice().sort((a, b) => +new Date(b.venda.dataVenda || b.venda.quando) - +new Date(a.venda.dataVenda || a.venda.quando));
  return (
    <section className="view active" id="view-financeiro">{cab}
      <div className="kpis" id="finKpis"><Kpi n={r.visitas.length} l="Visitas pagas" /><Kpi n={fmtMoeda(r.pagamentoVisitas)} l="Pagamento por visitas" /><Kpi n={r.vendas.length} l="Vendas efetivadas" /><Kpi n={fmtMoeda(r.comissao)} l={`Comissão (${pct}%)`} /><Kpi n={fmtMoeda(r.total)} l="Total a receber" cor="var(--st-concluida)" /></div>
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
      </div></div>
    </section>
  );
}
