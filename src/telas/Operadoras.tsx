// Controle das operadoras do marketing (Supervisão Marketing / Gestão):
// quem cada uma agendou (para consultor ou direto na loja), quantos vieram e quantos compraram.
import { useState } from "react";
import { useApp } from "../estado";
import { STATUS_CLIENTE, fmtDate, fmtDateTime, fmtMoeda, hojeISO, isoLocal } from "../lib/regras";
import { Kpi } from "./Dashboard";

const pc = (a: number, b: number) => b ? Math.round(a / b * 100) + "%" : "—";

export default function Operadoras() {
  const { R, st, abrirDetalhe } = useApp() as any;
  const hoje = hojeISO();
  const menos = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return isoLocal(d); };
  const [preset, setPreset] = useState<"mes" | "30" | "90" | "periodo">("mes");
  const [pDe, setPDe] = useState(hoje.slice(0, 8) + "01"); const [pAte, setPAte] = useState(hoje);
  const de = preset === "mes" ? hoje.slice(0, 8) + "01" : preset === "30" ? menos(29) : preset === "90" ? menos(89) : pDe;
  const ate = preset === "periodo" ? pAte : hoje;
  const [op, setOp] = useState("");
  const [filtro, setFiltro] = useState("todos");

  // clientes cadastrados no período pelas pessoas do marketing
  const doMkt = (uid: string) => { const u = R.getUser(uid); return !!u && (u.setores || []).some((s: string) => ["marketing_operadora", "marketing_supervisao"].includes(s)); };
  const base = st.chamados.filter((c: any) => R.domMarketing(c) && R.podeVer(c) && doMkt(c.solicitanteId) && R.dentroPeriodo(c.criadoEm, de, ate));
  const resumo = (l: any[]) => {
    const cons = l.filter((c: any) => !R.ehDireto(c)), loja = l.filter((c: any) => R.ehDireto(c));
    const f = R.funil(l);
    return { total: l.length, cons: cons.length, loja: loja.length, realizadas: cons.filter(R.visitaFeita).length, agendados: l.filter((c: any) => c.dataLoja).length,
      vieram: f.vieram, faltaram: f.faltaram, vendas: f.vendas, aConfirmar: f.aConfirmar, valor: f.valor, perdidos: l.filter((c: any) => ["reprovado", "venda_cancelada"].includes(R.statusClienteDe(c))).length };
  };
  const T = resumo(base);
  const porOp: Record<string, any[]> = {}; base.forEach((c: any) => (porOp[c.solicitanteId] = porOp[c.solicitanteId] || []).push(c));
  const linhas = Object.entries(porOp).map(([uid, l]) => ({ uid, nome: R.nomeUser(uid), r: resumo(l) })).sort((a, b) => b.r.vendas - a.r.vendas || b.r.total - a.r.total);
  const veValor = base.some((c: any) => c.venda && R.podeVerValor(c));
  const V = (n: number) => veValor ? fmtMoeda(n) : "—";

  const FIL: Record<string, (c: any) => boolean> = {
    todos: () => true, consultor: (c: any) => !R.ehDireto(c), loja: (c: any) => R.ehDireto(c),
    vieram: (c: any) => R.compareceu(c), vendas: (c: any) => !!c.venda && c.venda.status !== "cancelada",
    faltaram: (c: any) => R.statusClienteDe(c) === "nao_compareceu", andamento: (c: any) => R.emAberto(c),
  };
  const lista = base.filter((c: any) => (!op || c.solicitanteId === op) && FIL[filtro](c)).sort((a: any, b: any) => +new Date(b.criadoEm) - +new Date(a.criadoEm));

  return (
    <section className="view active" id="view-operadoras">
      <div className="view-head"><div><h2>Controle das operadoras</h2><p>Quem cada pessoa do marketing agendou — para consultor externo ou direto na loja —, quantos vieram à loja e quantos compraram. Período pela data do cadastro do cliente.</p></div></div>
      <div className="card" style={{ padding: "14px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="chips" style={{ margin: 0 }}>
            {([["mes", "Mês atual"], ["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["periodo", "Escolher período"]] as [any, string][]).map(([k, l]) =>
              <button key={k} className={"chip" + (preset === k ? " on" : "")} onClick={() => setPreset(k)}>{l}</button>)}
          </div>
          {preset === "periodo" && <>
            <div className="field" style={{ minWidth: 150 }}><label>De</label><input type="date" value={pDe} onChange={e => setPDe(e.target.value)} /></div>
            <div className="field" style={{ minWidth: 150 }}><label>Até</label><input type="date" value={pAte} onChange={e => setPAte(e.target.value)} /></div>
          </>}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 8 }}>Clientes cadastrados de {fmtDate(de)} a {fmtDate(ate)}.</div>
      </div>

      <div className="kpis">
        <Kpi n={T.total} l="Clientes agendados" />
        <Kpi n={T.cons} l="Para consultor externo" />
        <Kpi n={T.loja} l="Direto na loja" />
        <Kpi n={T.agendados} l="Com data na loja" />
        <Kpi n={T.vieram} l="Vieram à loja" />
        <Kpi n={T.vendas} l="Vendas" cor="var(--st-concluida)" />
      </div>
      <div className="kpis">
        <Kpi n={pc(T.vieram, T.agendados)} l="Comparecimento (vieram ÷ agendados na loja)" />
        <Kpi n={pc(T.vendas, T.total)} l="Conversão (vendas ÷ clientes agendados)" />
        <Kpi n={pc(T.vendas, T.vieram)} l="Loja → venda (vendas ÷ vieram)" />
        <Kpi n={V(T.valor)} l="Valor vendido" />
        <Kpi n={T.aConfirmar} l="Vendas a confirmar" cls={T.aConfirmar ? "urg" : ""} />
      </div>

      <div className="panel" style={{ marginBottom: 16 }}><h3>Por pessoa do marketing <span className="hint" style={{ marginLeft: 6 }}>clique para ver os clientes dela</span></h3>
        {linhas.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Operadora</th><th>Agendou</th><th>→ Consultor</th><th>→ Loja</th><th>Visitas feitas</th><th>Com data na loja</th><th>Vieram</th><th>Não vieram</th><th>Vendas</th><th>% comparec.</th><th>% conversão</th><th>Valor vendido</th></tr></thead>
          <tbody>{linhas.map(({ uid, nome, r }) => (
            <tr key={uid} onClick={() => setOp(op === uid ? "" : uid)} style={{ cursor: "pointer", background: op === uid ? "var(--primary-soft)" : undefined }}>
              <td><b>{nome}</b></td><td>{r.total}</td><td>{r.cons}</td><td>{r.loja}</td><td>{r.realizadas}</td><td>{r.agendados}</td><td>{r.vieram}</td><td>{r.faltaram}</td>
              <td style={{ fontWeight: 700, color: "var(--st-concluida)" }}>{r.vendas}{r.aConfirmar ? <small style={{ color: "var(--warn)", fontWeight: 400 }}> (+{r.aConfirmar} a conf.)</small> : null}</td>
              <td>{pc(r.vieram, r.agendados)}</td><td>{pc(r.vendas, r.total)}</td><td>{V(r.valor)}</td></tr>))}</tbody></table></div>
          : <div className="empty" style={{ padding: "18px 8px" }}>Nenhum cliente cadastrado pelo marketing no período.</div>}
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 8 }}>"Vieram" = venda registrada ou parecer do vendedor (orçamento, sem resposta, reprovado). Vendas contam efetivadas e promissórias.</div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Clientes {op ? "de " + R.nomeUser(op) : "de todas"} <span className="pill" style={{ marginLeft: 8 }}>{lista.length}</span>{op && <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => setOp("")}>Ver todas</button>}</h3>
        <div className="chips">{([["todos", "Todos"], ["consultor", "Para consultor"], ["loja", "Direto na loja"], ["andamento", "Em andamento"], ["vieram", "Vieram"], ["faltaram", "Não vieram"], ["vendas", "Vendas"]] as [string, string][]).map(([k, l]) =>
          <button key={k} className={"chip" + (filtro === k ? " on" : "")} onClick={() => setFiltro(k)}>{l}</button>)}</div>
        {lista.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Cliente</th><th>Cadastro</th><th>Operadora</th><th>Destino</th><th>Consultor</th><th>Na loja</th><th>Vendedor</th><th>Situação</th><th>Venda</th></tr></thead>
          <tbody>{lista.map((c: any) => { const sc = R.statusClienteDe(c); return (
            <tr key={c.id} onClick={() => abrirDetalhe(c.id)} style={{ cursor: "pointer" }}>
              <td><b>{c.cliente}</b><div style={{ fontSize: 11, color: "var(--ink-faint)" }}>{c.id} · {c.produto || "—"}</div></td>
              <td>{fmtDate(c.criadoEm)}</td><td>{R.nomeUser(c.solicitanteId)}</td>
              <td><span className={"origem " + R.origemLoja(c)}>{R.ehDireto(c) ? "Loja" : "Consultor"}</span></td>
              <td>{c.consultorId ? R.nomeUser(c.consultorId) : "—"}</td>
              <td>{c.dataLoja ? fmtDateTime(c.dataLoja) : "—"}</td>
              <td>{c.atendenteId ? R.nomeUser(c.atendenteId) : "—"}</td>
              <td><span className={"sc sc-" + sc}>{STATUS_CLIENTE[sc] || "—"}</span></td>
              <td>{c.venda ? <>nº {c.venda.numero}{R.podeVerValor(c) && c.venda.valor ? " · R$ " + c.venda.valor : ""}</> : "—"}</td>
            </tr>); })}</tbody></table></div>
          : <div className="empty" style={{ padding: "18px 8px" }}>Nenhum cliente neste filtro.</div>}
      </div>
    </section>
  );
}
