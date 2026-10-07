// Dashboard da Supervisão do call center no computador (Salete): o mesmo painel do celular + tempo médio por atendente.
// Só call center — sem marketing e sem as ações da Gestão.
import { useState } from "react";
import { useApp } from "../estado";
import { ListaClientes, ResCC, SelPer, doPainelCC, periodo, useLista } from "../movel/Gestor";
import { fmtTempo, porAtendente } from "../lib/atendimento";
import { fmtDate, tempoRel } from "../lib/regras";

export default function PainelSupervisao() {
  const { R, st, abrirDetalhe } = useApp() as any;
  const [per, setPer] = useState<any>("hoje");
  const L = useLista();
  const P = periodo(per);
  const noPer = (v: any) => !!v && R.dentroPeriodo(v, P.de, P.ate);
  const todos = st.chamados.filter((c: any) => R.podeVer(c) && doPainelCC(R, c));
  const ats = porAtendente(R, todos, P.de, P.ate);
  const acao = R.ordenar(todos.filter((c: any) => ["critico", "atrasado", "urgente"].includes(R.prioridade(c))));
  const evs: any[] = []; todos.forEach((c: any) => (c.historico || []).forEach((h: any) => { if (!R.acaoDeFora(h.quem)) evs.push({ id: c.id, quando: h.quando, quem: h.quem, texto: h.texto }); }));
  evs.sort((a, b) => +new Date(b.quando) - +new Date(a.quando));
  return (
    <section className="view active" id="view-dashboard">
      <div className="view-head"><div><h2>Dashboard</h2><p>Call center e pós-venda, em tempo real · {P.nome} ({fmtDate(P.de)}{P.de !== P.ate ? " a " + fmtDate(P.ate) : ""})</p></div><span className="live"><i></i>ao vivo</span></div>
      <SelPer per={per} setPer={p => { setPer(p); L.fechar(); }} />
      <div className="mv-pc">
        <ResCC todos={todos} noPer={noPer} P={P} L={L} />
        <ListaClientes sel={L.sel} fechar={L.fechar} />
      </div>
      <div className="panel" style={{ margin: "16px 0" }}><h3>Por atendente · {P.nome}</h3>
        {ats.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Atendente</th><th>Abertos no período</th><th>Finalizados</th><th>Na ligação</th><th>Em aberto (dela)</th><th>Fora do prazo</th><th title="Média entre abrir e finalizar, dos atendimentos dela finalizados no período">Tempo médio de atendimento</th></tr></thead><tbody>
          {ats.map((x: any) => <tr key={x.u.id}><td><b>{x.u.nome}</b></td>
            <td><a href="#" onClick={e => { e.preventDefault(); L.abrirLista("r" + x.u.id, x.u.nome + " — abertos no período", R.ordenar(x.reg)); }}>{x.reg.length}</a></td>
            <td>{x.fin.length}</td><td>{x.lig.length}</td>
            <td><a href="#" onClick={e => { e.preventDefault(); L.abrirLista("a" + x.u.id, x.u.nome + " — em aberto", R.ordenar(x.aberto)); }}>{x.aberto.length}</a></td>
            <td style={x.fora.length ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{x.fora.length}</td>
            <td><b>{fmtTempo(x.tm)}</b></td></tr>)}
        </tbody></table></div> : <div className="dn-vazio">Sem movimento no período.</div>}
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Precisam de ação agora</h3><div className="acao-list">
          {acao.length ? acao.slice(0, 30).map((c: any) => { const sp = R.prioridade(c); const cor = sp === "critico" ? "var(--critico)" : "var(--danger)";
            return <div className="acao" key={c.id} style={{ borderLeftColor: cor }} onClick={() => abrirDetalhe(c.id)}><span>{c.id} · {c.cliente} · <b>{R.setorNome(c.setorDestino)}</b></span><span className="g" style={{ color: cor }}>{sp === "critico" ? "Crítico" : sp === "atrasado" ? "Atrasado" : "Urgente"}</span></div>; })
            : <div style={{ color: "var(--ink-faint)", fontSize: 13 }}>Tudo sob controle.</div>}
        </div></div>
        <div className="panel"><h3>Atividade recente <span className="live"><i></i>ao vivo</span></h3><div className="feed">
          {evs.length ? evs.slice(0, 14).map((e, i) => <div className="f" key={i}><span><b>{e.id}</b> {e.texto} <span style={{ color: "var(--ink-faint)" }}>· {e.quem}</span></span><span className="t">{tempoRel(e.quando)}</span></div>) : <div style={{ color: "var(--ink-faint)", fontSize: 13 }}>Sem atividade.</div>}
        </div></div>
      </div>
    </section>
  );
}
