// Relatório do marketing: funil visita → loja → venda, por consultor, por operadora (agendamento direto) e por vendedor.
import { useApp } from "../estado";
import { fmtMoeda, statusFinalCliente } from "../lib/regras";
import { Kpi } from "./Dashboard";

const pc = (v: number | null) => v == null ? "—" : v + "%";
const taxa = (a: number, b: number) => b ? Math.round(a / b * 100) : null;

export default function RelMkt({ de, ate }: { de: string; ate: string }) {
  const { R, st } = useApp() as any;
  const noPer = (v: any) => (!de && !ate) || R.dentroPeriodo(v, de, ate);
  const mkt = st.chamados.filter((c: any) => R.domMarketing(c) && R.podeVer(c));
  const visitas = mkt.filter((c: any) => !R.ehDireto(c) && c.consultorId && noPer(R.ancoraVisita(c)));
  const F = R.funil(visitas);
  const veValor = R.ehGestao() || R.mySetores().includes("gerente_loja");
  const cons = R.consultores().map((u: any) => ({ u, f: R.funil(visitas.filter((c: any) => c.consultorId === u.id)) })).filter((x: any) => x.f.total).sort((a: any, b: any) => b.f.vendas - a.f.vendas || b.f.total - a.f.total);
  // agendamento direto pelo marketing (sem consultor), pela data na loja
  const diretos = mkt.filter((c: any) => R.ehDireto(c) && c.dataLoja && noPer(c.dataLoja));
  const D = R.funil(diretos);
  const porOp: Record<string, any[]> = {}; diretos.forEach((c: any) => (porOp[c.solicitanteId] = porOp[c.solicitanteId] || []).push(c));
  const ops = Object.entries(porOp).map(([uid, l]) => ({ nome: R.nomeUser(uid), f: R.funil(l) })).sort((a: any, b: any) => b.f.total - a.f.total);
  // vendedores: clientes com vinda à loja no período
  const naLoja = mkt.filter((c: any) => c.atendenteId && c.dataLoja && noPer(c.dataLoja));
  const vend = R.vendedores().map((u: any) => {
    const l = naLoja.filter((c: any) => c.atendenteId === u.id); const f = R.funil(l);
    return { u, f, orc: l.filter((c: any) => R.statusClienteDe(c) === "orcamento").length, semPar: l.filter((c: any) => R.semParecer(c)).length,
      abertos: l.filter((c: any) => !statusFinalCliente.includes(R.statusClienteDe(c)) && !c.venda).length };
  }).filter((x: any) => x.f.total).sort((a: any, b: any) => b.f.vendas - a.f.vendas);
  const V = (n: number) => veValor ? fmtMoeda(n) : "—";
  return (
    <>
      <div className="sec-label" style={{ margin: "4px 0 8px" }}>Visitas dos consultores externos <span className="hint" style={{ textTransform: "none", letterSpacing: 0 }}>· clientes com visita no período</span></div>
      <div className="kpis">
        <Kpi n={F.total} l="Visitas encaminhadas" /><Kpi n={F.realizadas} l="Visitas realizadas" /><Kpi n={F.pendentes} l="Ainda a realizar" />
        <Kpi n={F.agendadas} l="Agendados na loja" /><Kpi n={F.vieram} l="Vieram à loja" /><Kpi n={F.vendas} l="Vendas" cor="var(--st-concluida)" />
      </div>
      <div className="kpis">
        <Kpi n={pc(F.pPresenca)} l="Presença na loja (vieram ÷ visitas realizadas)" />
        <Kpi n={pc(F.pVisitaVenda)} l="Visita → venda (vendas ÷ visitas realizadas)" />
        <Kpi n={pc(F.pLojaVenda)} l="Loja → venda (vendas ÷ vieram)" />
        {veValor && <><Kpi n={V(F.valor)} l="Valor vendido" /><Kpi n={V(F.comissao)} l={`Comissão dos consultores (${R.cfg().comissaoPct}%, efetivadas)`} /></>}
      </div>
      <div className="panel" style={{ marginBottom: 16 }}><h3>Por consultor</h3>
        {cons.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Consultor</th><th>Encaminhadas</th><th>Realizadas</th><th>A realizar</th><th>Agend. loja</th><th>Vieram</th><th>Não vieram</th><th>Vendas</th><th>% presença</th><th>% visita→venda</th><th>% loja→venda</th>{veValor && <><th>Valor vendido</th><th>Comissão</th></>}</tr></thead>
          <tbody>{cons.map(({ u, f }: any) => <tr key={u.id}><td><b>{u.nome}</b></td><td>{f.total}</td><td>{f.realizadas}</td><td>{f.pendentes}</td><td>{f.agendadas}</td><td>{f.vieram}</td><td>{f.faltaram}</td><td style={{ fontWeight: 700, color: "var(--st-concluida)" }}>{f.vendas}{f.aConfirmar ? <small style={{ color: "var(--warn)", fontWeight: 400 }}> (+{f.aConfirmar} a conf.)</small> : null}</td><td>{pc(f.pPresenca)}</td><td>{pc(f.pVisitaVenda)}</td><td>{pc(f.pLojaVenda)}</td>{veValor && <><td>{V(f.valor)}</td><td>{V(f.comissao)}</td></>}</tr>)}</tbody></table></div>
          : <div className="empty" style={{ padding: "18px 8px" }}>Nenhuma visita no período.</div>}
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 8 }}>Vendas contam efetivadas e promissórias; a comissão só as efetivadas. "Vieram" = venda registrada ou parecer do vendedor (orçamento, sem resposta, reprovado).</div>
      </div>

      <div className="sec-label" style={{ margin: "4px 0 8px" }}>Agendados direto pelo marketing <span className="hint" style={{ textTransform: "none", letterSpacing: 0 }}>· vinda à loja no período</span></div>
      <div className="kpis">
        <Kpi n={D.total} l="Agendamentos na loja" /><Kpi n={D.vieram} l="Vieram" /><Kpi n={D.faltaram} l="Não compareceram" />
        <Kpi n={D.vendas} l="Vendas" cor="var(--st-concluida)" /><Kpi n={pc(taxa(D.vieram, D.total))} l="Presença na loja" /><Kpi n={pc(D.pLojaVenda)} l="Loja → venda" />
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Por operadora do marketing</h3>
          {ops.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Operadora</th><th>Agendados</th><th>Vieram</th><th>Vendas</th><th>% presença</th><th>% conversão</th></tr></thead>
            <tbody>{ops.map((o: any) => <tr key={o.nome}><td><b>{o.nome}</b></td><td>{o.f.total}</td><td>{o.f.vieram}</td><td>{o.f.vendas}</td><td>{pc(taxa(o.f.vieram, o.f.total))}</td><td>{pc(o.f.pLojaVenda)}</td></tr>)}</tbody></table></div>
            : <div className="empty" style={{ padding: "18px 8px" }}>Nenhum agendamento direto no período.</div>}
        </div>
        <div className="panel"><h3>Por vendedor <span className="hint" style={{ marginLeft: 6 }}>clientes na loja no período</span></h3>
          {vend.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Vendedor</th><th>Recebidos</th><th>Vieram</th><th>Orçamento</th><th>Vendas</th><th>% conversão</th><th>Sem parecer</th></tr></thead>
            <tbody>{vend.map(({ u, f, orc, semPar }: any) => <tr key={u.id}><td><b>{u.nome}</b></td><td>{f.total}</td><td>{f.vieram}</td><td>{orc}</td><td style={{ fontWeight: 700, color: "var(--st-concluida)" }}>{f.vendas}</td><td>{pc(f.pLojaVenda)}</td><td style={semPar ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{semPar}</td></tr>)}</tbody></table></div>
            : <div className="empty" style={{ padding: "18px 8px" }}>Nenhum cliente com vendedor no período.</div>}
        </div>
      </div>
    </>
  );
}
