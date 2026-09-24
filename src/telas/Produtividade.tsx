// Produtividade e pagamento do marketing.
// Supervisão Marketing / Gestão: define a meta diária de agendamentos e o bônus, acompanha cada operadora e aprova o pagamento do mês.
// Operadora: vê a própria produtividade, a meta do dia e quanto tem a receber.
// Regra: R$ (config) por venda fechada (efetivada) de cliente que ela agendou — consultor externo ou direto na loja —
//        + bônus de cada dia em que ela bateu a meta de agendamentos definida pela supervisora.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtDate, fmtDateTime, fmtMoeda, hojeISO, isoLocal } from "../lib/regras";
import { Kpi } from "./Dashboard";

const diaLocal = (v: any) => isoLocal(new Date(v));
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export default function Produtividade() {
  const { R, st, executar: ex, toast, abrirDetalhe } = useApp() as any;
  const hoje = hojeISO();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const de = mes + "-01";
  const fim = (() => { const d = new Date(+mes.slice(0, 4), +mes.slice(5, 7), 0); return isoLocal(d); })();
  const ate = fim > hoje && mes === hoje.slice(0, 7) ? fim : fim;
  const gestor = R.ehGestao() || R.mySetores().includes("marketing_supervisao");
  const valorVenda = Number((R.cfg() as any).valorVendaMkt ?? 10);
  const [metas, setMetas] = useState<any[] | null>(null);
  const [pags, setPags] = useState<any[]>([]);
  const [f, setF] = useState({ dia: hoje, meta: "", valor: "100", obs: "" });
  const carregar = () => { A.listarMetasMkt(de, ate).then(setMetas).catch((e: any) => { setMetas([]); toast(e.message); }); A.listarPagamentosMkt(de, ate).then(setPags).catch(() => setPags([])); };
  useEffect(() => { carregar(); }, [mes]);

  const ops = st.usuarios.filter((u: any) => u.ativo && (u.setores || []).includes("marketing_operadora") && (gestor || u.id === R.currentUserId));
  const metaDe: Record<string, any> = {}; (metas || []).forEach((m: any) => (metaDe[m.dia] = m));
  const meusCli = (uid: string) => st.chamados.filter((c: any) => R.domMarketing(c) && c.solicitanteId === uid);
  const calc = (uid: string) => {
    const l = meusCli(uid);
    const noMes = l.filter((c: any) => { const d = diaLocal(c.criadoEm); return d >= de && d <= ate; });
    const porDia: Record<string, number> = {}; noMes.forEach((c: any) => { const d = diaLocal(c.criadoEm); porDia[d] = (porDia[d] || 0) + 1; });
    const vendas = l.filter((c: any) => c.venda && c.venda.status === "efetivada" && (() => { const d = String(c.venda.dataVenda || c.venda.quando || "").slice(0, 10); return d >= de && d <= ate; })());
    const pendentes = l.filter((c: any) => c.venda && ["registrada", "promissoria"].includes(c.venda.status)).length;
    const diasMeta = Object.values(metaDe).filter((m: any) => m.dia <= hoje);
    const batidos = diasMeta.filter((m: any) => (porDia[m.dia] || 0) >= m.meta);
    const bonus = batidos.reduce((s: number, m: any) => s + Number(m.valor), 0);
    return { agend: noMes.length, cons: noMes.filter((c: any) => !R.ehDireto(c)).length, loja: noMes.filter((c: any) => R.ehDireto(c)).length,
      vieram: noMes.filter(R.compareceu).length, vendas: vendas.length, vendasLista: vendas, pendentes, valorVendas: vendas.length * valorVenda,
      diasMeta: diasMeta.length, batidos: batidos.length, bonus, total: vendas.length * valorVenda + bonus, porDia, hoje: porDia[hoje] || 0 };
  };
  const linhas = ops.map((u: any) => ({ u, r: calc(u.id), pag: pags.find((p: any) => p.operadora_id === u.id) })).sort((a: any, b: any) => b.r.total - a.r.total);
  const tot = linhas.reduce((s: any, x: any) => ({ agend: s.agend + x.r.agend, vendas: s.vendas + x.r.vendas, bonus: s.bonus + x.r.bonus, total: s.total + x.r.total }), { agend: 0, vendas: 0, bonus: 0, total: 0 });
  const metaHoje = metaDe[hoje];
  // operadora: só é "a receber" o que a supervisora aprovou; o resto fica pendente de aprovação
  const aprovado = linhas.reduce((s: number, x: any) => s + (x.pag ? Number(x.pag.total) : 0), 0);
  const pendente = Math.max(0, tot.total - aprovado);
  const diasMes: string[] = []; for (let d = new Date(de + "T12:00"); isoLocal(d) <= ate && isoLocal(d) <= hoje; d.setDate(d.getDate() + 1)) diasMes.push(isoLocal(d));
  const salvarMeta = () => {
    const m = parseInt(f.meta), v = parseFloat(String(f.valor).replace(",", "."));
    if (!f.dia) { toast("Informe o dia"); return; } if (!m || m <= 0) { toast("Informe a meta de agendamentos"); return; } if (isNaN(v) || v < 0) { toast("Informe o valor do bônus"); return; }
    ex(() => A.salvarMetaMkt(f.dia, m, v, f.obs), "Meta salva").then((ok: boolean) => { if (ok) { setF({ ...f, meta: "", obs: "" }); carregar(); } });
  };
  const titulo = new Date(de + "T12:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <section className="view active" id="view-produtividade">
      <div className="view-head"><div><h2>{gestor ? "Produtividade e pagamento do marketing" : "Minha produtividade"}</h2>
        <p>Cada venda fechada de cliente que a operadora agendou (consultor externo ou direto na loja) vale <b>{fmtMoeda(valorVenda)}</b>. Nos dias com meta, quem bater a meta de agendamentos ganha o bônus do dia. {gestor ? "A Supervisão Marketing aprova o pagamento do mês." : "O pagamento é aprovado pela Supervisão Marketing."}</p></div></div>
      <div className="toolbar"><div className="field" style={{ maxWidth: 200 }}><label>Mês</label><input type="month" value={mes} max={hoje.slice(0, 7)} onChange={e => e.target.value && setMes(e.target.value)} /></div></div>

      {mes === hoje.slice(0, 7) && <div className="panel" style={{ marginBottom: 16, borderColor: metaHoje ? "var(--primary)" : undefined }}>
        <h3>Hoje, {fmtDate(hoje)} {metaHoje ? <span className="pill" style={{ marginLeft: 8 }}>meta {metaHoje.meta} agendamentos · bônus {fmtMoeda(Number(metaHoje.valor))}</span> : <span className="pill" style={{ marginLeft: 8 }}>sem meta hoje</span>}</h3>
        {metaHoje?.obs && <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 8 }}>{metaHoje.obs}</div>}
        {linhas.map(({ u, r }: any) => { const pct = metaHoje ? Math.min(100, r.hoje / metaHoje.meta * 100) : 0; const bateu = metaHoje && r.hoje >= metaHoje.meta; return (
          <div key={u.id} className="bar-row" style={{ gridTemplateColumns: "160px 1fr 200px", whiteSpace: "nowrap" }}><span className="nm">{u.nome}</span>
            <span className="track">{metaHoje ? <span className="fill" style={{ width: pct + "%", background: bateu ? "var(--st-concluida)" : "var(--primary)" }}></span> : null}</span>
            <span className="v">{r.hoje}{metaHoje ? ` / ${metaHoje.meta}` : ""} {bateu ? "✓ bateu" : metaHoje ? `· faltam ${metaHoje.meta - r.hoje}` : "agendados"}</span></div>); })}
      </div>}

      {gestor && <div className="panel" style={{ marginBottom: 16 }}><h3>Metas diárias — {titulo}</h3>
        <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10 }}>Defina, dia a dia, quantos agendamentos cada operadora precisa fazer e o valor do bônus. Dia sem meta = sem bônus.</div>
        <div className="grid" style={{ gridTemplateColumns: "160px 140px 140px 1fr auto", alignItems: "end" }}>
          <div className="field"><label>Dia</label><input type="date" value={f.dia} onChange={e => setF({ ...f, dia: e.target.value })} /></div>
          <div className="field"><label>Meta (agendamentos)</label><input type="number" min="1" value={f.meta} onChange={e => setF({ ...f, meta: e.target.value })} /></div>
          <div className="field"><label>Bônus (R$)</label><input type="number" min="0" step="10" value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} /></div>
          <div className="field"><label>Observação</label><input placeholder="Ex.: campanha de sábado" value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></div>
          <button className="btn primary sm" onClick={salvarMeta}>Salvar meta</button>
        </div>
        {metas === null ? <div className="empty">Carregando…</div> : metas.length ? <div style={{ overflowX: "auto", marginTop: 12 }}><table className="dl-tab"><thead><tr><th>Dia</th><th>Meta</th><th>Bônus</th><th>Bateram</th><th>Obs.</th><th></th></tr></thead>
          <tbody>{metas.map((m: any) => { const bat = linhas.filter((x: any) => (x.r.porDia[m.dia] || 0) >= m.meta).map((x: any) => x.u.nome); return (
            <tr key={m.dia}><td><b>{fmtDate(m.dia)}</b> <small style={{ color: "var(--ink-faint)" }}>{DIAS[new Date(m.dia + "T12:00").getDay()]}</small></td><td>{m.meta}</td><td>{fmtMoeda(Number(m.valor))}</td>
              <td>{m.dia > hoje ? <span style={{ color: "var(--ink-faint)" }}>—</span> : bat.length ? bat.join(", ") : <span style={{ color: "var(--ink-faint)" }}>ninguém</span>}</td><td>{m.obs || "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}><button className="btn ghost sm" onClick={() => setF({ dia: m.dia, meta: String(m.meta), valor: String(m.valor), obs: m.obs || "" })}>Editar</button>
                <button className="btn danger sm" onClick={() => ex(() => A.removerMetaMkt(m.dia), "Meta removida").then((ok: boolean) => ok && carregar())}>Remover</button></td></tr>); })}</tbody></table></div>
          : <div className="empty" style={{ padding: "14px 8px" }}>Nenhuma meta definida neste mês.</div>}
      </div>}

      <div className="kpis">
        <Kpi n={tot.agend} l="Agendamentos no mês" /><Kpi n={tot.vendas} l="Vendas fechadas" />
        <Kpi n={fmtMoeda(tot.vendas * valorVenda)} l={`Vendas × ${fmtMoeda(valorVenda)}`} /><Kpi n={fmtMoeda(tot.bonus)} l="Bônus de meta" />
        {gestor ? <Kpi n={fmtMoeda(tot.total)} l="Total a pagar" cor="var(--st-concluida)" /> : <>
          <Kpi n={fmtMoeda(aprovado)} l="Aprovado para receber" cor={aprovado ? "var(--st-concluida)" : "var(--ink-faint)"} />
          <Kpi n={fmtMoeda(pendente)} l="Pendente de aprovação" cor={pendente ? "var(--warn)" : "var(--ink-faint)"} />
        </>}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}><h3>{gestor ? "Pagamento por operadora" : "Meu pagamento"} — {titulo}</h3>
        {linhas.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Operadora</th><th>Agendou</th><th>→ Consultor</th><th>→ Loja</th><th>Vieram</th><th>Vendas fechadas</th><th>Valor vendas</th><th>Metas batidas</th><th>Bônus</th><th>{gestor ? "Total" : "Previsto"}</th><th>Aprovação</th></tr></thead>
          <tbody>{linhas.map(({ u, r, pag }: any) => (
            <tr key={u.id}><td><b>{u.nome}</b></td><td>{r.agend}</td><td>{r.cons}</td><td>{r.loja}</td><td>{r.vieram}</td>
              <td style={{ fontWeight: 700, color: "var(--st-concluida)" }}>{r.vendas}{r.pendentes ? <small style={{ color: "var(--warn)", fontWeight: 400 }}> (+{r.pendentes} aguardando)</small> : null}</td>
              <td>{fmtMoeda(r.valorVendas)}</td><td>{r.batidos}/{r.diasMeta}</td><td>{fmtMoeda(r.bonus)}</td><td style={{ fontWeight: 800 }}>{fmtMoeda(r.total)}</td>
              <td style={{ whiteSpace: "nowrap" }}>{pag ? <><span className="badge b-concluida">{gestor ? "Aprovado" : "Aprovado para receber"} {fmtMoeda(Number(pag.total))}</span><div style={{ fontSize: 11, color: "var(--ink-faint)" }}>{R.nomeUser(pag.aprovado_por)} · {fmtDateTime(pag.aprovado_em)}</div>
                {Number(pag.total) !== r.total && <div style={{ fontSize: 11, color: "var(--warn)" }}>{gestor ? "valores mudaram depois da aprovação — reaprove" : "diferença de " + fmtMoeda(Math.abs(r.total - Number(pag.total))) + " pendente de aprovação"}</div>}</> : <span className="badge b-urgente" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>Pendente de aprovação</span>}
                {gestor && <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
                  <button className="btn primary sm" onClick={() => ex(() => A.aprovarPagamentoMkt(u.id, de, ate), "Pagamento aprovado").then((ok: boolean) => ok && carregar())}>{pag ? "Reaprovar" : "Aprovar"}</button>
                  {pag && <button className="btn ghost sm" onClick={() => ex(() => A.cancelarAprovacaoMkt(pag.id), "Aprovação desfeita").then((ok: boolean) => ok && carregar())}>Desfazer</button>}</div>}</td></tr>))}</tbody></table></div>
          : <div className="empty" style={{ padding: "14px 8px" }}>Nenhuma operadora do marketing cadastrada.</div>}
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 8 }}>Vendas fechadas = efetivadas pela Gestão com data no mês. Vendas a confirmar e promissórias entram quando forem efetivadas. Bônus só conta dias até hoje.</div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}><h3>Agendamentos dia a dia</h3>
        {diasMes.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Dia</th><th>Meta</th>{linhas.map(({ u }: any) => <th key={u.id}>{u.nome}</th>)}</tr></thead>
          <tbody>{diasMes.slice().reverse().map(d => { const m = metaDe[d]; return (
            <tr key={d}><td><b>{fmtDate(d).slice(0, 5)}</b> <small style={{ color: "var(--ink-faint)" }}>{DIAS[new Date(d + "T12:00").getDay()]}</small></td><td>{m ? <>{m.meta} <small style={{ color: "var(--ink-faint)" }}>({fmtMoeda(Number(m.valor))})</small></> : "—"}</td>
              {linhas.map(({ u, r }: any) => { const n = r.porDia[d] || 0; const bateu = m && n >= m.meta; return <td key={u.id} style={bateu ? { color: "var(--st-concluida)", fontWeight: 800 } : m && n < m.meta ? { color: "var(--danger)" } : undefined}>{n}{bateu ? " ✓" : ""}</td>; })}</tr>); })}</tbody></table></div>
          : <div className="empty">Sem dias no período.</div>}
      </div>

      {!gestor && linhas[0] && linhas[0].r.vendasLista.length > 0 && <div className="panel" style={{ marginBottom: 16 }}><h3>Minhas vendas fechadas no mês</h3>
        <div className="dl-lista">{linhas[0].r.vendasLista.map((c: any) => <div className="dl-l" key={c.id} onClick={() => abrirDetalhe(c.id)} style={{ cursor: "pointer" }}><span className="dl-nm">{c.cliente}<small>venda nº {c.venda.numero} · {fmtDate(c.venda.dataVenda)}</small></span><b>{fmtMoeda(valorVenda)}</b></div>)}</div></div>}
    </section>
  );
}
