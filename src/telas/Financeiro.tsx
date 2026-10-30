import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";
import { useApp } from "../estado";
import { TIPO_REEMBOLSO, fmtDate, fmtDateTime, fmtMoeda, parseMoeda, vendaContaVolume } from "../lib/regras";
import { valorPendente, promAbertas, vendasDoPeriodo } from "../lib/regras";
import { Kpi } from "./Dashboard";
import { PromissoriasAbertas } from "../comp/VendaValidar";
import { FechamentoGestao, FechamentoMeu } from "../comp/Fechamento";
import { hojeISO } from "../lib/regras";
import { brCurto, cicloDe, cicloDoMes, diasAte, nomeCiclo, somaMes, ultimoFechado } from "../lib/ciclo";

// Ciclo de pagamento dos externos: dia 29 de um mês ao dia 28 do seguinte
const cicloAtual = () => cicloDoMes(cicloDe(hojeISO()));
const cicloFechado = () => cicloDoMes(ultimoFechado(hojeISO()));
function PeriodosCiclo({ de, ate, setDe, setAte }: any) {
  const [a1, a2] = cicloAtual(), [f1, f2] = cicloFechado(), [m1, m2] = mesAtual();
  const on = (x: string, y: string) => de === x && ate === y;
  const b = (l: string, x: string, y: string, forte?: boolean) => <button className={"chip" + (on(x, y) ? " on" : "")} style={forte ? { fontWeight: 700 } : undefined} onClick={() => { setDe(x); setAte(y); }}>{l}</button>;
  return <div className="chips" style={{ marginBottom: 10 }}>
    {b("📅 Ciclo atual · " + brCurto(a1) + " a " + brCurto(a2), a1, a2, true)}
    {b("✅ Último ciclo fechado · " + brCurto(f1) + " a " + brCurto(f2), f1, f2, true)}
    {b("Mês atual (calendário)", m1, m2)}{b("Tudo", "", "")}
  </div>;
}
/** faixa explicando o ciclo de comissão */
function AvisoCiclo({ de, ate }: { de: string; ate: string }) {
  const h = hojeISO(); const [a1, a2] = cicloAtual(); const ym = cicloDe(h);
  const ehCiclo = !!de && !!ate && cicloDoMes(cicloDe(ate))[0] === de && cicloDoMes(cicloDe(ate))[1] === ate;
  const falta = diasAte(h, a2);
  return <div className="aviso-anexo" style={{ marginBottom: 14, background: "var(--primary-soft)", borderColor: "var(--primary)", color: "var(--ink)" }}>
    <div style={{ fontSize: 15 }}><b>📅 A comissão dos consultores externos é paga por CICLO: do dia 29 de um mês até o dia 28 do mês seguinte.</b></div>
    <div style={{ marginTop: 4 }}>Ciclo atual: <b>{nomeCiclo(ym)} — {brCurto(a1)} a {brCurto(a2)}</b> · {falta > 0 ? <>fecha em <b>{falta} dia{falta === 1 ? "" : "s"}</b> (dia 28)</> : <b>fecha hoje</b>}. Tudo o que for registrado e aprovado até o dia 28 entra neste ciclo; a partir do dia 29 já conta para o próximo.</div>
    {!ehCiclo && (de || ate) ? <div style={{ marginTop: 4, color: "var(--warn)", fontWeight: 700 }}>⚠ O período filtrado ({de ? fmtDate(de) : "início"} a {ate ? fmtDate(ate) : "hoje"}) não é um ciclo completo de pagamento — use os botões de ciclo para conferir o pagamento.</div> : null}
  </div>;
}
/** Gestão lança o nº oficial de visitas de cada consultor/medidor no ciclo (vale R$ por visita) */
function VisitasDoCiclo({ de, ate, pessoas }: { de: string; ate: string; pessoas: any[] }) {
  const { R, st, recarregar, toast } = useApp() as any;
  const ym = de && ate ? cicloDe(ate) : "";
  const ehCiclo = !!ym && cicloDoMes(ym)[0] === de && cicloDoMes(ym)[1] === ate;
  const valor = Number(R.cfg().pagamentoVisita) || 0;
  const lanc = (st.visitasCiclo || []).filter((v: any) => v.ciclo === ym);
  const extras = lanc.filter((v: any) => !v.usuarioId || !pessoas.some(u => u.id === v.usuarioId));
  const linhas = [...pessoas.map((u: any) => ({ key: u.id, uid: u.id, pessoa: u.nome, papel: (u.setores || []).includes("consultor_externo") ? "consultor" : "medidor", v: lanc.find((x: any) => x.usuarioId === u.id) })),
    ...extras.map((v: any) => ({ key: "x" + v.id, uid: v.usuarioId || null, pessoa: v.pessoa, papel: v.papel, v }))];
  const [edit, setEdit] = useState<Record<string, string>>({}); const [abrir, setAbrir] = useState(false); const [salvando, setSalvando] = useState(false);
  useEffect(() => setEdit({}), [ym]);
  if (!ehCiclo) return null;
  const qtd = (l: any) => edit[l.key] != null ? Number(edit[l.key]) || 0 : l.v ? l.v.visitas : null;
  const tot = linhas.reduce((s, l) => s + (qtd(l) || 0), 0);
  const salvar = async () => {
    setSalvando(true);
    try {
      const rows = linhas.filter(l => edit[l.key] != null).map(l => ({ ciclo: ym, usuario_id: l.uid, pessoa: l.pessoa, papel: l.papel, visitas: Number(edit[l.key]) || 0, obs: "Lançado pela Gestão", atualizado_em: new Date().toISOString(), atualizado_por: R.currentUserId }));
      if (rows.length) { const { error } = await sb.from("visitas_ciclo").upsert(rows, { onConflict: "ciclo,pessoa" }); if (error) throw new Error(error.message); }
      await recarregar(); setEdit({}); toast("Visitas do ciclo salvas");
    } catch (e: any) { toast(e.message); } finally { setSalvando(false); }
  };
  return <div className="panel" style={{ marginBottom: 14, borderLeft: "4px solid var(--st-concluida)" }}>
    <h3 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>🚶 Visitas do ciclo {nomeCiclo(ym)} <span className="pill">{fmtMoeda(valor)} por visita</span>
      <span className="hint">{lanc.length ? "nº oficial lançado pela Gestão — é o que vale para o pagamento" : "ainda sem nº oficial lançado — vale a contagem do 360"}</span>
      <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => setAbrir(!abrir)}>{abrir ? "Fechar" : "✏️ Lançar / corrigir visitas"}</button></h3>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 8 }}>
      {linhas.map(l => { const q = qtd(l); const sis = l.uid ? (l.papel === "medidor" ? R.medidasDe(l.uid).filter((c: any) => c.tratativa?.medida?.realizadaEm && R.dentroPeriodo(c.tratativa.medida.realizadaEm, de, ate)).length : R.extratoConsultor(l.uid, de, ate).visitas.length) : null;
        return <div key={l.key} className="card" style={{ padding: "8px 10px" }}>
          <b>{l.pessoa}</b> <span className="hint">{l.papel}</span>
          {abrir ? <div><input type="number" min={0} style={{ width: "100%", marginTop: 4 }} value={edit[l.key] ?? (l.v ? String(l.v.visitas) : "")} placeholder={sis != null ? "360: " + sis : ""} onChange={e => setEdit({ ...edit, [l.key]: e.target.value })} /></div>
            : <div style={{ fontSize: 20, fontWeight: 800 }}>{q != null ? q : <span className="hint" style={{ fontSize: 13 }}>—</span>}</div>}
          <div className="hint">{q != null ? "= " + fmtMoeda(q * valor) : ""}{sis != null ? " · 360 registrou " + sis : !l.uid ? " · sem usuário no 360" : ""}</div>
        </div>; })}
    </div>
    <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><b>Total: {tot} visitas = {fmtMoeda(tot * valor)}</b>
      {abrir && <button className="btn primary sm" disabled={salvando || !Object.keys(edit).length} onClick={salvar}>{salvando ? "Salvando…" : "💾 Salvar visitas do ciclo"}</button>}</div>
  </div>;
}
/** Painel simples do que o consultor/medidor gerou no período: visitas × R$, comissão das vendas, auxílio, reembolsos e total */
function MeuCiclo({ r, de, ate, nome }: { r: any; de: string; ate: string; nome?: string }) {
  const { R } = useApp() as any;
  const valor = Number(R.cfg().pagamentoVisita) || 0, pct = Number(R.cfg().comissaoPct) || 0;
  const ym = de && ate ? cicloDe(ate) : ""; const ehCiclo = !!ym && cicloDoMes(ym)[0] === de && cicloDoMes(ym)[1] === ate;
  const bloco = (ic: string, tit: string, val: string, conta: string, cor?: string) => <div className="card" style={{ padding: "14px 16px", flex: "1 1 200px" }}>
    <div className="hint" style={{ fontWeight: 700 }}>{ic} {tit}</div><div style={{ fontSize: 26, fontWeight: 800, color: cor }}>{val}</div><div className="hint">{conta}</div></div>;
  const temMed = r.qtdMedidas > 0, temVis = r.qtdVisitas > 0 || !temMed;
  return <div className="panel" style={{ marginBottom: 14 }}>
    <h3>💼 {nome ? "O que " + nome + " gerou" : "O que você gerou"} {ehCiclo ? <>no ciclo <b>{nomeCiclo(ym)}</b> ({brCurto(de)} a {brCurto(ate)})</> : <>no período</>}</h3>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {temVis && bloco("🚶", "Visitas", fmtMoeda(r.pagamentoVisitas), r.qtdVisitas + " visita" + (r.qtdVisitas === 1 ? "" : "s") + " × " + fmtMoeda(valor) + (r.oficial && r.oficial.papel !== "medidor" ? " · nº oficial do ciclo" : ""))}
      {temMed && bloco("📐", "Medidas", fmtMoeda(r.pagamentoMedidas), r.qtdMedidas + " × " + fmtMoeda(valor) + (r.oficial && r.oficial.papel === "medidor" ? " · nº oficial do ciclo" : ""))}
      {bloco("💰", "Comissão das vendas", fmtMoeda(r.comissao), pct + "% de " + fmtMoeda(r.totalVendido) + " (" + r.vendas.length + " venda" + (r.vendas.length === 1 ? "" : "s") + ")")}
      {r.auxilio > 0 && bloco("🗓", "Auxílio fixo", fmtMoeda(r.auxilio), "pago dia " + r.datasAuxilio.map((d: string) => d.slice(8) + "/" + d.slice(5, 7)).join(", "))}
      {r.totalReembolsos > 0 && bloco("🧾", "Reembolsos", fmtMoeda(r.totalReembolsos), r.reembolsos.length + " aprovado(s)")}
      {bloco("✅", "Total previsto", fmtMoeda(r.total), "a confirmar no fechamento", "var(--st-concluida)")}
    </div>
    {r.comissaoFutura > 0 && <div className="hint" style={{ marginTop: 8 }}>🧾 Comissão futura: {fmtMoeda(r.comissaoFutura)} em promissórias — entra no ciclo em que forem pagas.</div>}
  </div>;
}

/** Previsão por ciclo: último fechado, atual e os 3 próximos. Comissão das vendas já lançadas no ciclo + promissórias que vencem no ciclo. */
function PrevisaoCiclos({ ids }: { ids: string[] }) {
  const { R, st } = useApp() as any;
  const h = hojeISO(); const atual = cicloDe(h); const pct = Number(R.cfg().comissaoPct) || 0;
  const meses = [somaMes(atual, -1), atual, somaMes(atual, 1), somaMes(atual, 2), somaMes(atual, 3)];
  const proms = (st.chamados || []).filter((c: any) => c.venda && ids.includes(c.consultorId) && !["cancelada", "registrada"].includes(c.venda.status))
    .flatMap((c: any) => promAbertas(c.venda).map((p: any) => ({ c, p, saldo: p.saldo != null ? p.saldo : p.valor })));
  const semVenc = proms.filter((x: any) => !x.p.vencimento);
  const linhas = meses.map(ym => {
    const [d1, d2] = cicloDoMes(ym);
    const ext = ym <= atual ? ids.reduce((s, id) => s + (R.extratoConsultor(id, d1, d2).comissao || 0), 0) : 0;
    const pr = proms.filter((x: any) => x.p.vencimento && cicloDe(x.p.vencimento) === ym);
    const prV = pr.reduce((s: number, x: any) => s + x.saldo, 0) * pct / 100;
    const sit = ym < atual ? "fechado" : ym === atual ? "em andamento" : "futuro";
    return { ym, d1, d2, ext, prN: pr.length, prV, sit };
  });
  const cor: Record<string, string> = { fechado: "var(--st-concluida)", "em andamento": "var(--primary)", futuro: "var(--ink-faint)" };
  return <div className="panel" style={{ marginBottom: 14 }}>
    <h3>🗓 Previsão de comissão por ciclo <span className="hint" style={{ marginLeft: 6 }}>{pct}% · ciclo = dia 29 ao dia 28</span></h3>
    <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Ciclo</th><th>Período</th><th>Situação</th><th>Comissão das vendas lançadas</th><th>Promissórias que vencem no ciclo</th><th>Previsão do ciclo</th></tr></thead>
      <tbody>{linhas.map(l => <tr key={l.ym} style={l.sit === "em andamento" ? { background: "var(--primary-soft)" } : undefined}>
        <td><b>{nomeCiclo(l.ym)}</b></td><td>{fmtDate(l.d1)} a {fmtDate(l.d2)}</td>
        <td><b style={{ color: cor[l.sit] }}>{l.sit === "em andamento" ? "em andamento · fecha " + brCurto(l.d2) : l.sit}</b></td>
        <td>{l.sit === "futuro" ? "—" : fmtMoeda(l.ext)}</td>
        <td>{l.prN ? fmtMoeda(l.prV) + " (" + l.prN + ")" : "—"}</td>
        <td><b>{fmtMoeda(l.ext + l.prV)}</b></td></tr>)}</tbody></table></div>
    <div className="hint" style={{ marginTop: 6 }}>Ciclos fechados e em andamento mostram a comissão das vendas e pagamentos de promissória já aprovados. Ciclos futuros mostram só as promissórias com vencimento naquele ciclo (comissão entra quando forem pagas).{semVenc.length ? " " + semVenc.length + " promissória(s) em aberto sem data de vencimento (" + fmtMoeda(semVenc.reduce((s: number, x: any) => s + x.saldo, 0) * pct / 100) + " de comissão) — entram no ciclo em que forem pagas." : ""}</div>
  </div>;
}

// períodos rápidos: mês atual, mês passado, tudo (ou datas livres)
const mesAtual = () => { const h = hojeISO(); return [h.slice(0, 8) + "01", h]; };
const mesPassado = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"); const fim = new Date(y, d.getMonth() + 1, 0).getDate(); return [`${y}-${m}-01`, `${y}-${m}-${String(fim).padStart(2, "0")}`]; };
function Periodos({ de, ate, setDe, setAte }: any) {
  const [a1, a2] = mesAtual(), [p1, p2] = mesPassado();
  const on = (x: string, y: string) => de === x && ate === y;
  const b = (l: string, x: string, y: string) => <button className={"chip" + (on(x, y) ? " on" : "")} onClick={() => { setDe(x); setAte(y); }}>{l}</button>;
  return <div className="chips" style={{ marginBottom: 10 }}>{b("Mês atual", a1, a2)}{b("Mês passado", p1, p2)}{b("Tudo", "", "")}</div>;
}

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
  const [de, setDe] = useState(mesAtual()[0]); const [ate, setAte] = useState(mesAtual()[1]); const [vend, setVend] = useState("");
  const alvo = souVend ? R.currentUserId : vend;
  const vendas = vendasDoPeriodo(st.chamados.filter((c: any) => R.domMarketing(c) && c.atendenteId && (!alvo || c.atendenteId === alvo)), de, ate);
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
      <div className="card" style={{ padding: "16px 18px", marginBottom: 16 }}><Periodos de={de} ate={ate} setDe={setDe} setAte={setAte} /><div className="grid">
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
  const souGestor = R.ehGestao();
  // Gestão abre no último ciclo fechado (o que vai pagar); o consultor abre no ciclo atual (o que está juntando)
  const ini = souGestor ? cicloFechado() : cicloAtual();
  const [de, setDe] = useState(ini[0]); const [ate, setAte] = useState(ini[1]); const [cons, setCons] = useState("");
  const consultores = st.usuarios.filter(u => u.somenteAtribuidos && ((u.setores || []).includes("consultor_externo") || (u.setores || []).includes("medidas")));
  const { pagamentoVisita, comissaoPct: pct } = R.cfg();
  const alvo = souGestor ? cons : R.currentUserId;
  let sub = souGestor ? "Visitas, medidas, comissão e reembolsos de cada consultor e medidor. Filtre por período." : "Suas visitas, medidas, vendas, comissão e reembolsos.";
  const cab = (
    <>
      <div className="view-head"><div><h2 id="finTitulo">{souGestor ? "Financeiro — Consultores e medidores" : "Financeiro"}</h2><p id="finSub">{souGestor && alvo ? "Extrato de " + R.nomeUser(alvo) + ". Filtre por período." : sub}</p></div></div>
      <div className="card" style={{ padding: "16px 18px", marginBottom: 16 }}>
        <PeriodosCiclo de={de} ate={ate} setDe={setDe} setAte={setAte} />
        <div className="grid">
          <div className="field"><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
          <div className="field"><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
          {souGestor && <div className="field" id="finConsultorField"><label>Consultor / medidor</label><select value={cons} onChange={e => setCons(e.target.value)}><option value="">Todos</option>{consultores.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>}
        </div>
        <div style={{ marginTop: 12 }}><button className="btn ghost sm" onClick={() => { setDe(ini[0]); setAte(ini[1]); setCons(""); }}>Limpar filtros</button></div>
      </div>
      <AvisoCiclo de={de} ate={ate} />
    </>
  );

  if (souGestor && !alvo) {
    const resumos = consultores.map(u => ({ u, r: R.extratoConsultor(u.id, de, ate) }));
    // quem tem nº oficial no ciclo mas não tem usuário de consultor/medidor no 360 (ex.: César, medidor)
    const ymSel = de && ate ? cicloDe(ate) : "";
    const semUsuario = ((st as any).visitasCiclo || []).filter((v: any) => v.ciclo === ymSel && cicloDoMes(ymSel)[0] === de && cicloDoMes(ymSel)[1] === ate && (!v.usuarioId || !consultores.some(u => u.id === v.usuarioId)));
    const valVis = Number(R.cfg().pagamentoVisita) || 0;
    const totVisitas = resumos.reduce((s, x) => s + x.r.qtdVisitas, 0), totVendas = resumos.reduce((s, x) => s + x.r.vendas.length, 0);
    const totVendido = resumos.reduce((s, x) => s + x.r.totalVendido, 0), totComissao = resumos.reduce((s, x) => s + x.r.comissao, 0);
    const totVisitasR = resumos.reduce((s, x) => s + x.r.pagamentoVisitas, 0);
    const extraMed = semUsuario.filter((v: any) => v.papel === "medidor").reduce((s: number, v: any) => s + v.visitas, 0), extraVis = semUsuario.filter((v: any) => v.papel !== "medidor").reduce((s: number, v: any) => s + v.visitas, 0);
    const totMed = resumos.reduce((s, x) => s + x.r.qtdMedidas, 0) + extraMed, totMedR = resumos.reduce((s, x) => s + x.r.pagamentoMedidas, 0) + extraMed * valVis, totReemb = resumos.reduce((s, x) => s + x.r.totalReembolsos, 0), totAux = resumos.reduce((s, x) => s + x.r.auxilio, 0);
    const totGeral = resumos.reduce((s, x) => s + x.r.total, 0) + (extraMed + extraVis) * valVis;
    const totVisitasR0 = totVisitasR + extraVis * valVis;
    return (
      <section className="view active" id="view-financeiro">{cab}
        <div className="kpis" id="finKpis"><Kpi n={totVisitas + extraVis} l="Visitas pagas" /><Kpi n={totMed} l="Medidas feitas" /><Kpi n={totVendas} l="Vendas efetivadas" /><Kpi fs={22} n={fmtMoeda(totVendido)} l="Valor vendido" /><Kpi fs={22} n={fmtMoeda(totComissao)} l={`Previsão de comissão (${pct}%)`} /><Kpi fs={22} n={fmtMoeda(totReemb)} l="Reembolsos aprovados" /><Kpi fs={22} n={fmtMoeda(totAux)} l="Auxílio fixo (dia 15)" /><Kpi fs={22} n={fmtMoeda(totGeral)} l="Total a receber" cor="var(--st-concluida)" /></div>
        <VisitasDoCiclo de={de} ate={ate} pessoas={consultores} />
        <PrevisaoCiclos ids={consultores.filter(u => (u.setores || []).includes("consultor_externo")).map(u => u.id)} />
        <FechamentoGestao />
        <PromissoriasAbertas titulo="Promissórias em aberto (comissão futura)" />
        <div id="finResumoTodos" className="panel"><h3>Por consultor <span className="hint" style={{ marginLeft: 6 }}>clique para ver o extrato</span></h3>
          {resumos.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Nome</th><th>Visitas pagas</th><th>Medidas</th><th>Vendas efetivadas</th><th>Valor vendido</th><th>Visitas + medidas</th><th>Comissão ({pct}%)</th><th>Reembolsos</th><th>Auxílio (dia 15)</th><th>Valor a receber</th></tr></thead>
            <tbody>{resumos.sort((a, b) => b.r.total - a.r.total || b.r.totalVendido - a.r.totalVendido).map(({ u, r }) => (
              <tr key={u.id} onClick={() => setCons(u.id)} style={{ cursor: "pointer" }}><td><b>{u.nome}</b>{(u.setores || []).includes("medidas") ? <span className="pill" style={{ marginLeft: 6 }}>medidor</span> : null}</td><td>{r.qtdVisitas}{r.oficial && r.oficial.papel !== "medidor" ? <span title="nº oficial do ciclo" style={{ color: "var(--st-concluida)" }}> ✓</span> : null}</td><td>{r.qtdMedidas}{r.oficial && r.oficial.papel === "medidor" ? <span title="nº oficial do ciclo" style={{ color: "var(--st-concluida)" }}> ✓</span> : null}</td><td>{r.vendas.length}</td><td style={{ fontWeight: 700 }}>{fmtMoeda(r.totalVendido)}</td><td>{fmtMoeda(r.pagamentoVisitas + r.pagamentoMedidas)}</td><td>{fmtMoeda(r.comissao)}</td><td>{fmtMoeda(r.totalReembolsos)}</td><td>{fmtMoeda(r.auxilio)}</td><td style={{ fontWeight: 800, color: "var(--st-concluida)" }}>{fmtMoeda(r.total)}</td></tr>))}</tbody>
            {semUsuario.map((v: any) => <tbody key={"su" + v.id}><tr><td><b>{v.pessoa}</b> <span className="pill" style={{ marginLeft: 6 }}>{v.papel}</span> <span className="hint">sem usuário no 360</span></td><td>{v.papel !== "medidor" ? v.visitas + " ✓" : 0}</td><td>{v.papel === "medidor" ? v.visitas + " ✓" : 0}</td><td>—</td><td>—</td><td>{fmtMoeda(v.visitas * valVis)}</td><td>—</td><td>—</td><td>—</td><td style={{ fontWeight: 800, color: "var(--st-concluida)" }}>{fmtMoeda(v.visitas * valVis)}</td></tr></tbody>)}
            <tfoot><tr><td><b>Total</b></td><td><b>{totVisitas + extraVis}</b></td><td><b>{totMed}</b></td><td><b>{totVendas}</b></td><td><b>{fmtMoeda(totVendido)}</b></td><td><b>{fmtMoeda(totVisitasR0 + totMedR)}</b></td><td><b>{fmtMoeda(totComissao)}</b></td><td><b>{fmtMoeda(totReemb)}</b></td><td><b>{fmtMoeda(totAux)}</b></td><td style={{ fontWeight: 800, color: "var(--st-concluida)" }}>{fmtMoeda(totGeral)}</td></tr></tfoot></table></div>
            : <div className="empty">Nenhum consultor cadastrado.</div>}
          <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 8 }}>Previsão = visitas realizadas e medidas feitas (R$ {pagamentoVisita} cada) + comissão de {pct}% sobre as vendas efetivadas (medida não gera comissão) + reembolsos aprovados + auxílio fixo de {fmtMoeda(R.cfg().auxilioFixo ?? 1500)} (pago todo dia {R.cfg().diaAuxilio || 15}, quando o dia cai no período). Vendas a confirmar e promissórias não entram. <b>Pagamento por ciclo: dia 29 ao dia 28.</b></div>
        </div>
      </section>
    );
  }

  const r = R.extratoConsultor(alvo, de, ate);
  const pendVendas = st.chamados.filter(c => c.consultorId === alvo && c.venda && ["registrada"].includes(c.venda.status) && (R.dentroPeriodo(c.venda.dataVenda || c.venda.quando, de, ate) || (!de && !ate)));
  const visOrd = r.visitas.slice().sort((a, b) => +new Date(b.dataVisita || b.dataLoja) - +new Date(a.dataVisita || a.dataLoja));
  const pagOrd = r.pagamentos.slice().sort((a: any, b: any) => +new Date(b.data) - +new Date(a.data));
  return (
    <section className="view active" id="view-financeiro">{cab}
      <MeuCiclo r={r} de={de} ate={ate} nome={souGestor ? R.nomeUser(alvo) : undefined} />
      <div className="kpis" id="finKpis"><Kpi n={r.qtdVisitas} l={"Visitas pagas" + (r.oficial && r.oficial.papel !== "medidor" ? " (oficial)" : "")} /><Kpi n={r.qtdMedidas} l={"Medidas feitas" + (r.oficial && r.oficial.papel === "medidor" ? " (oficial)" : "")} /><Kpi fs={22} n={fmtMoeda(r.pagamentoVisitas + r.pagamentoMedidas)} l="Visitas + medidas" /><Kpi n={r.vendas.length} l="Vendas com pagamento" /><Kpi fs={22} n={fmtMoeda(r.comissao)} l={`Previsão de comissão (${pct}%)`} /><Kpi fs={22} n={fmtMoeda(r.totalReembolsos)} l="Reembolsos aprovados" />{r.auxilio > 0 && <Kpi fs={22} n={fmtMoeda(r.auxilio)} l={"Auxílio fixo · pago dia " + r.datasAuxilio.map((d: string) => d.slice(8) + "/" + d.slice(5, 7)).join(", ")} />}<Kpi fs={22} n={fmtMoeda(r.total)} l={"Previsão a receber no período (a confirmar)"} cor="var(--st-concluida)" /><Kpi fs={22} n={fmtMoeda(r.comissaoFutura)} l={`Comissão futura (${r.pendentes.length} em promissória)`} cor="var(--warn)" /></div>
      <PrevisaoCiclos ids={[alvo]} />
      <FechamentoMeu uid={alvo} />
      <div id="finDetalheWrap"><div className="panel-grid">
        <div className="panel"><h3>Pagamento por visitas <span className="pill" style={{ marginLeft: 8 }}>R$ {pagamentoVisita} por visita</span></h3><div id="finVisitas">
          {r.oficial && r.oficial.papel !== "medidor" && <div className="aviso-anexo" style={{ marginBottom: 8 }}><b>Nº oficial do ciclo: {r.oficial.visitas} visitas × {fmtMoeda(pagamentoVisita)} = {fmtMoeda(r.pagamentoVisitas)}</b> (lançado pela Gestão). Abaixo, as visitas registradas no 360 ({r.visitas.length}).</div>}
          {visOrd.length ? visOrd.map(c => <div className="fin-item" key={c.id}><div><div className="nm">{c.cliente}</div><div className="sub">{c.dataVisita ? "Visita: " + fmtDateTime(c.dataVisita) + " · " : ""}Loja: {fmtDateTime(c.dataLoja)}</div></div><div className="val">{fmtMoeda(pagamentoVisita)}</div></div>) : <div className="empty" style={{ padding: "24px 10px" }}>Nenhuma visita paga no período.</div>}
        </div></div>
        <div className="panel"><h3>Vendas e comissão <span className="pill" style={{ marginLeft: 8 }}>{pct}% sobre vendas aprovadas</span></h3><div id="finVendas">
          {pagOrd.length ? pagOrd.map((p: any, i: number) => { const com = p.valor * (pct / 100); return (
            <div className="fin-item" key={p.c.id + i}><div><div className="nm">{p.c.cliente}</div><div className="sub">{p.tipo === "promissoria" ? "pagamento de promissória" : "venda"} nº {p.numero} · {fmtDate(p.data)}{p.c.venda.vendedor ? " · " + p.c.venda.vendedor : ""} · valor {fmtMoeda(p.valor)}</div></div><div className="val">{fmtMoeda(com)}<span className="sub2">comissão</span></div></div>); })
            : <div className="empty" style={{ padding: "24px 10px" }}>Nenhuma venda efetivada no período.</div>}
          {r.pendentes.length > 0 && <div style={{ marginTop: 12 }}><div className="sec-label">Comissão futura — promissórias em aberto</div>{r.pendentes.map((c: any) => <div className="fin-item" key={"p" + c.id}><div><div className="nm">{c.cliente}</div><div className="sub">Promissória nº {promAbertas(c.venda).map((x: any) => x.numero).join(", ")} · pendente {fmtMoeda(valorPendente(c.venda))}</div></div><div className="val" style={{ color: "var(--warn)" }}>{fmtMoeda(valorPendente(c.venda) * pct / 100)}<span className="sub2">quando pagar</span></div></div>)}</div>}
          {pendVendas.length > 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--warn)" }}>{pendVendas.length} venda(s) pendentes de análise pela Gestão (ainda sem comissão).</div>}
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
