// Dashboard da Gestão: visão do todo em números (período escolhido no topo) — vendas, funil da loja, origem e rankings.
// Não mostra a agenda do dia (isso fica em "Agendamento loja").
import { useApp } from "../estado";
import { fmtDate, fmtMoeda, parseData, parseMoeda, vendaContaVolume } from "../lib/regras";
import { BarRow, Kpi } from "./Dashboard";

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "—");

export default function PainelGestao({ de, ate }: { de: string; ate: string }) {
  const { R, st, abrirDetalhe } = useApp() as any;
  const ini = new Date(de + "T00:00:00"), fim = new Date(ate + "T23:59:59");
  const noPer = (v: any) => { if (!v) return false; const d = parseData(v); return d >= ini && d <= fim; };
  const mkt = st.chamados.filter((c: any) => R.domMarketing(c));
  const val = (c: any) => (c.venda && c.venda.valorNum != null ? Number(c.venda.valorNum) : parseMoeda(c.venda && c.venda.valor));

  // ---- vendas do período (pela data da venda) ----
  const vendasPer = mkt.filter((c: any) => c.venda && noPer(c.venda.dataVenda || c.venda.quando));
  const por = (s: string) => vendasPer.filter((c: any) => c.venda.status === s);
  const soma = (l: any[]) => l.reduce((s, c) => s + val(c), 0);
  const vendidas = vendasPer.filter((c: any) => vendaContaVolume(c.venda));
  const efet = por("efetivada"), prom = por("promissoria"), conf = por("registrada"), canc = por("cancelada");
  const totalVend = soma(vendidas), ticket = vendidas.length ? totalVend / vendidas.length : 0;
  const maior = vendidas.slice().sort((a: any, b: any) => val(b) - val(a))[0];
  const aConfirmarTodas = mkt.filter((c: any) => c.venda && c.venda.status === "registrada");
  const conf24 = aConfirmarTodas.filter((c: any) => c.venda.quando && Date.now() - new Date(c.venda.quando).getTime() > 86400000);

  // ---- funil da loja (pela data na loja) ----
  const loja = mkt.filter((c: any) => c.dataLoja && noPer(c.dataLoja));
  const vieram = loja.filter(R.compareceu), faltaram = loja.filter((c: any) => R.statusClienteDe(c) === "nao_compareceu");
  const semPar = loja.filter((c: any) => R.semParecer(c));
  const lojaVend = loja.filter((c: any) => vendaContaVolume(c.venda));
  const novos = mkt.filter((c: any) => noPer(c.criadoEm));
  const visitas = mkt.filter((c: any) => !R.ehDireto(c) && R.visitaFeita(c) && noPer(c.dataVisita || c.criadoEm));

  // ---- origem ----
  const orig = (o: string) => { const l = loja.filter((c: any) => R.origemLoja(c) === o); const v = vendidas.filter((c: any) => R.origemLoja(c) === o); return { ag: l.length, vieram: l.filter(R.compareceu).length, vendas: v.length, valor: soma(v) }; };
  const oMkt = orig("marketing"), oExt = orig("externo");

  // ---- rankings ----
  const rank = (chave: (c: any) => string, base: any[]) => {
    const m: Record<string, { n: number; v: number }> = {};
    base.forEach((c: any) => { const k = chave(c); if (!k) return; m[k] = m[k] || { n: 0, v: 0 }; m[k].n++; m[k].v += val(c); });
    return Object.entries(m).sort((a, b) => b[1].v - a[1].v);
  };
  const rVend = rank((c: any) => c.atendenteId ? R.nomeUser(c.atendenteId) : (c.venda.vendedor || ""), vendidas);
  const rGer = rank((c: any) => c.venda.gerenteNome || "(sem gerente informado)", vendidas);
  const rCons = rank((c: any) => c.consultorId ? R.nomeUser(c.consultorId) : "", vendidas);
  const rOp = rank((c: any) => c.solicitanteId ? R.nomeUser(c.solicitanteId) : "", vendidas);
  // vendedores: atendimento na loja x venda
  const vendRows = R.vendedores().map((u: any) => {
    const l = loja.filter((c: any) => c.atendenteId === u.id), vi = l.filter(R.compareceu), v = vendidas.filter((c: any) => c.atendenteId === u.id);
    return { nome: u.nome, ag: l.length, vieram: vi.length, vendas: v.length, valor: soma(v), semPar: l.filter((c: any) => R.semParecer(c)).length };
  }).filter((x: any) => x.ag || x.vendas).sort((a: any, b: any) => b.valor - a.valor);

  // vendas por dia (R$)
  const dias: Record<string, number> = {};
  vendidas.forEach((c: any) => { const d = String(c.venda.dataVenda || c.venda.quando || "").slice(0, 10); if (d) dias[d] = (dias[d] || 0) + val(c); });
  const diasL = Object.entries(dias).sort((a, b) => a[0].localeCompare(b[0]));
  const mxDia = Math.max(1, ...diasL.map(x => x[1]));

  const Barras = ({ l, cor }: { l: [string, { n: number; v: number }][]; cor?: string }) => {
    const mx = Math.max(1, ...l.map(x => x[1].v));
    return l.length ? <>{l.map(([nm, x]) => <BarRow key={nm} nm={nm} pct={(x.v / mx) * 100} v={fmtMoeda(x.v)} cor={cor} extra={<span className="v" style={{ color: "var(--ink-faint)" }}>{x.n}</span>} />)}</> : <div style={{ color: "var(--ink-faint)", fontSize: 13 }}>Sem vendas no período.</div>;
  };

  return (
    <div className="pg-wrap">
      <div className="sec-label" style={{ margin: "0 0 8px" }}>Vendas no período</div>
      <div className="kpis">
        <Kpi fs={22} n={fmtMoeda(totalVend)} l={`Vendido (${vendidas.length} vendas)`} cor="var(--st-concluida)" />
        <Kpi fs={22} n={fmtMoeda(soma(efet))} l={`Efetivadas (${efet.length})`} />
        <Kpi fs={22} n={fmtMoeda(soma(prom))} l={`Promissórias (${prom.length})`} cor={prom.length ? "var(--st-tratativa)" : undefined} />
        <Kpi fs={22} n={fmtMoeda(ticket)} l="Ticket médio" />
        <Kpi n={conf.length} l={`A confirmar · ${fmtMoeda(soma(conf))}`} cls={conf.length ? "urg" : ""} />
        <Kpi n={conf24.length} l="A confirmar há +24h (todas)" cls={conf24.length ? "alert" : ""} cor={conf24.length ? "var(--danger)" : undefined} />
        <Kpi n={canc.length} l={`Canceladas · ${fmtMoeda(soma(canc))}`} />
        <Kpi fs={22} n={maior ? fmtMoeda(val(maior)) : "—"} l={maior ? "Maior venda · " + maior.cliente : "Maior venda"} />
      </div>

      <div className="sec-label" style={{ margin: "4px 0 8px" }}>Clientes e loja no período</div>
      <div className="kpis">
        <Kpi n={novos.length} l="Clientes novos cadastrados" />
        <Kpi n={visitas.length} l="Visitas de consultor feitas" />
        <Kpi n={loja.length} l="Agendados na loja" />
        <Kpi n={vieram.length} l={`Vieram (${pct(vieram.length, loja.length)})`} />
        <Kpi n={faltaram.length} l="Não compareceram" cls={faltaram.length ? "urg" : ""} />
        <Kpi n={pct(lojaVend.length, vieram.length)} l="Conversão loja → venda" cor="var(--st-concluida)" />
        <Kpi n={semPar.length} l="Vieram sem parecer do vendedor" cls={semPar.length ? "alert" : ""} cor={semPar.length ? "var(--danger)" : undefined} />
      </div>

      <div className="panel-grid">
        <div className="panel"><h3>Origem dos clientes</h3>
          <table className="dl-tab"><thead><tr><th></th><th>Agendados</th><th>Vieram</th><th>Vendas</th><th>Valor</th></tr></thead><tbody>
            <tr><td><b>Marketing</b></td><td>{oMkt.ag}</td><td>{oMkt.vieram}</td><td>{oMkt.vendas}</td><td>{fmtMoeda(oMkt.valor)}</td></tr>
            <tr><td><b>Consultor externo</b></td><td>{oExt.ag}</td><td>{oExt.vieram}</td><td>{oExt.vendas}</td><td>{fmtMoeda(oExt.valor)}</td></tr>
          </tbody></table></div>
        <div className="panel"><h3>Vendas por dia (R$)</h3>
          {diasL.length ? diasL.map(([d, v]) => <BarRow key={d} nm={fmtDate(d)} pct={(v / mxDia) * 100} v={fmtMoeda(v)} cor="var(--st-concluida)" />) : <div style={{ color: "var(--ink-faint)", fontSize: 13 }}>Sem vendas no período.</div>}</div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}><h3>Vendedores — loja x venda</h3>
        {vendRows.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Vendedor</th><th>Clientes na loja</th><th>Vieram</th><th>Vendas</th><th>Conversão</th><th>Valor vendido</th><th>Sem parecer</th></tr></thead><tbody>
          {vendRows.map((x: any) => <tr key={x.nome}><td><b>{x.nome}</b></td><td>{x.ag}</td><td>{x.vieram}</td><td>{x.vendas}</td><td>{pct(x.vendas, x.vieram)}</td><td>{fmtMoeda(x.valor)}</td><td style={x.semPar ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{x.semPar}</td></tr>)}
        </tbody></table></div> : <div style={{ color: "var(--ink-faint)", fontSize: 13 }}>Sem movimento no período.</div>}
      </div>

      <div className="panel-grid">
        <div className="panel"><h3>Vendas por gerente que negociou</h3><Barras l={rGer} cor="#27468f" /></div>
        <div className="panel"><h3>Vendas por vendedor</h3><Barras l={rVend} cor="var(--st-concluida)" /></div>
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Vendas por consultor externo</h3><Barras l={rCons} /></div>
        <div className="panel"><h3>Vendas por operadora (quem agendou)</h3><Barras l={rOp} cor="#c0428a" /></div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}><h3>Vendas aguardando sua confirmação</h3>
        {aConfirmarTodas.length ? aConfirmarTodas.slice().sort((a: any, b: any) => String(a.venda.quando).localeCompare(String(b.venda.quando))).map((c: any) =>
          <div className="acao" key={c.id} style={{ borderLeftColor: conf24.includes(c) ? "var(--danger)" : "var(--warn)" }} onClick={() => abrirDetalhe(c.id)}>
            <span>{c.cliente} · venda {c.venda.numero} · {fmtMoeda(val(c))} · {c.atendenteId ? R.nomeUser(c.atendenteId) : c.venda.vendedor}{c.venda.gerenteNome ? " · ger. " + c.venda.gerenteNome : ""}</span>
            <span className="g" style={{ color: conf24.includes(c) ? "var(--danger)" : "var(--warn)" }}>{c.venda.quando ? fmtDate(c.venda.quando) : ""}</span></div>)
          : <div style={{ color: "var(--ink-faint)", fontSize: 13 }}>Nenhuma venda aguardando.</div>}
      </div>
    </div>
  );
}
