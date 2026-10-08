// Menu "Consultores externos" (Gestão, Supervisão de Marketing e Suporte a Consultores): painel por período, visitas e agendados na loja.
import { useState } from "react";
import { useApp } from "../estado";
import { fmtDate, fmtMoeda, hojeISO, isoLocal } from "../lib/regras";
import { Ticket, Vazio } from "../comp/Ticket";

type Per = "hoje" | "7" | "mes" | "30" | "90" | "per";
function usePeriodo(ini: Per = "mes") {
  const [p, setP] = useState<Per>(ini);
  const hoje = hojeISO();
  const menos = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return isoLocal(d); };
  const [de0, setDe0] = useState(hoje.slice(0, 8) + "01"); const [ate0, setAte0] = useState(hoje);
  const de = p === "hoje" ? hoje : p === "7" ? menos(6) : p === "mes" ? hoje.slice(0, 8) + "01" : p === "30" ? menos(29) : p === "90" ? menos(89) : de0;
  const ate = p === "per" ? ate0 : hoje;
  const ui = <div className="card" style={{ padding: "12px 16px", marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
    <div className="chips" style={{ margin: 0 }}>{([["hoje", "Hoje"], ["7", "7 dias"], ["mes", "Este mês"], ["30", "30 dias"], ["90", "90 dias"], ["per", "Escolher datas"]] as [Per, string][]).map(([k, l]) =>
      <button key={k} className={"chip" + (p === k ? " on" : "")} onClick={() => setP(k)}>{l}</button>)}</div>
    {p === "per" && <><div className="field" style={{ minWidth: 150 }}><label>De</label><input type="date" value={de0} onChange={e => setDe0(e.target.value)} /></div>
      <div className="field" style={{ minWidth: 150 }}><label>Até</label><input type="date" value={ate0} onChange={e => setAte0(e.target.value)} /></div></>}
    <span className="hint" style={{ marginLeft: "auto" }}>{fmtDate(de)}{de !== ate ? " a " + fmtDate(ate) : ""}</span>
  </div>;
  return { de, ate, ui };
}
const pc = (a: number, b: number) => b ? Math.round(a / b * 100) + "%" : "—";

export default function Consultores({ aba }: { aba: string }) {
  if (aba === "visitas") return <Visitas />;
  if (aba === "loja") return <AgendadosLoja />;
  return <Painel />;
}

function Painel() {
  const { R } = useApp() as any;
  const P = usePeriodo("mes");
  const [sel, setSel] = useState("");
  const veValor = R.ehGestao() || R.mySetores().includes("gerente_loja");
  const linhas = R.consultores().map((u: any) => {
    const l = R.clientesConsultor(u.id, P.de, P.ate), F = R.funil(l), ex = R.extratoConsultor(u.id, P.de, P.ate);
    return { u, l, F, ex };
  }).sort((a: any, b: any) => (b.F.valor - a.F.valor) || (b.F.vendas - a.F.vendas) || (b.F.total - a.F.total));
  const d = sel ? linhas.find((x: any) => x.u.id === sel) : null;
  return (
    <section className="view active">
      <div className="view-head"><div><h2>🧭 Painel dos consultores</h2><p>Números de cada consultor externo no período escolhido: clientes, visitas, vindas à loja, vendas e o que tem a receber. Clique no consultor para ver os clientes.</p></div></div>
      {P.ui}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Consultor</th><th>Clientes</th><th>Visitados</th><th>Na loja</th><th>Vieram</th><th>Vendas</th><th>Visita→venda</th>{veValor && <th>Vendido</th>}{veValor && <th>A receber</th>}<th>Visitas a fazer</th></tr></thead><tbody>
        {linhas.map((x: any) => <tr key={x.u.id} onClick={() => setSel(sel === x.u.id ? "" : x.u.id)} style={{ cursor: "pointer", background: sel === x.u.id ? "var(--primary-soft)" : undefined }}>
          <td><b>{x.u.nome}</b></td><td>{x.F.total}</td><td>{x.F.realizadas}</td><td>{x.F.agendadas}</td><td>{x.F.vieram}</td><td><b style={{ color: "var(--st-concluida)" }}>{x.F.vendas}</b></td><td>{x.F.pVisitaVenda === null ? "—" : x.F.pVisitaVenda + "%"}</td>
          {veValor && <td>{fmtMoeda(x.F.valor)}</td>}{veValor && <td><b>{fmtMoeda(x.ex.total)}</b></td>}<td style={x.F.pendentes ? { color: "var(--warn)", fontWeight: 700 } : undefined}>{x.F.pendentes}</td></tr>)}
      </tbody></table></div>
      {d && <div className="ap-sec" style={{ marginTop: 16 }}><h3>Clientes de {d.u.nome} no período <span className="badge b-tratativa">{d.l.length}</span></h3>
        <div className="list">{d.l.length ? R.ordenar(d.l.slice()).map((c: any) => <Ticket key={c.id} c={c} />) : <Vazio big="Nenhum cliente no período" />}</div></div>}
    </section>
  );
}

const ABAS_V: [string, string, string][] = [["fazer", "A fazer", "Direcionadas ao consultor e ainda não marcadas como realizadas."], ["atrasadas", "Atrasadas", "A data da visita já passou e não foi marcada como realizada."],
  ["semcontato", "Sem contato", "O consultor ainda não registrou contato com o cliente."], ["semloja", "Visitadas sem loja", "Visita feita, mas ainda sem data para vir à loja."]];
function Visitas() {
  const { R, st } = useApp() as any;
  const [aba, setAba] = useState("fazer"); const [cons, setCons] = useState("");
  const agora = new Date();
  const base = st.chamados.filter((c: any) => R.domMarketing(c) && R.podeVer(c) && c.consultorId && c.setorDestino === "consultor_externo" && (!cons || c.consultorId === cons));
  const F: Record<string, (c: any) => boolean> = {
    fazer: c => !(c.tratativa && c.tratativa.realizada),
    atrasadas: c => !(c.tratativa && c.tratativa.realizada) && !!c.dataVisita && new Date(c.dataVisita) < agora,
    semcontato: c => !(c.tratativa && c.tratativa.contatoIniciado) && !(c.tratativa && c.tratativa.realizada),
    semloja: c => !!(c.tratativa && c.tratativa.realizada) && !c.dataLoja,
  };
  const lista = base.filter(F[aba]).sort((a: any, b: any) => String(a.dataVisita || "9").localeCompare(String(b.dataVisita || "9")));
  return (
    <section className="view active">
      <div className="view-head"><div><h2>🧭 Visitas dos consultores</h2><p>{(ABAS_V.find(x => x[0] === aba) || ABAS_V[0])[2]}</p></div></div>
      <div className="subnav" style={{ marginBottom: 10 }}>{ABAS_V.map(([k, l]) => <button key={k} className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{l} ({base.filter(F[k]).length})</button>)}</div>
      <div className="toolbar"><select value={cons} onChange={e => setCons(e.target.value)}><option value="">Todos os consultores</option>{R.consultores().map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
      <div className="list">{lista.length ? lista.map((c: any) => <Ticket key={c.id} c={c} />) : <Vazio big="Nada aqui 👍" />}</div>
    </section>
  );
}

function AgendadosLoja() {
  const { R, st } = useApp() as any;
  const [cons, setCons] = useState(""); const [f, setF] = useState<"proximos" | "semvend" | "passados">("proximos");
  const hoje = hojeISO();
  const base = st.chamados.filter((c: any) => R.domMarketing(c) && R.podeVer(c) && c.consultorId && c.dataLoja && (!cons || c.consultorId === cons));
  const dia = (c: any) => String(c.dataLoja).slice(0, 10);
  const L = {
    proximos: base.filter((c: any) => dia(c) >= hoje).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja))),
    semvend: base.filter((c: any) => dia(c) >= hoje && !c.atendenteId).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja))),
    passados: base.filter((c: any) => dia(c) < hoje).sort((a: any, b: any) => String(b.dataLoja).localeCompare(String(a.dataLoja))).slice(0, 150),
  };
  const lista = L[f];
  return (
    <section className="view active">
      <div className="view-head"><div><h2>🧭 Agendados na loja</h2><p>Clientes dos consultores com data para vir à loja e o vendedor que vai atender.</p></div></div>
      <div className="subnav" style={{ marginBottom: 10 }}>
        <button className={f === "proximos" ? "on" : ""} onClick={() => setF("proximos")}>Próximos ({L.proximos.length})</button>
        <button className={f === "semvend" ? "on" : ""} onClick={() => setF("semvend")}>Sem vendedor ({L.semvend.length})</button>
        <button className={f === "passados" ? "on" : ""} onClick={() => setF("passados")}>Já passaram</button>
      </div>
      <div className="toolbar"><select value={cons} onChange={e => setCons(e.target.value)}><option value="">Todos os consultores</option>{R.consultores().map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
      <div className="list">{lista.length ? lista.map((c: any) => <Ticket key={c.id} c={c} />) : <Vazio big="Nada aqui" />}</div>
    </section>
  );
}
export { pc };
