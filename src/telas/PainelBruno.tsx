// Dashboard da GESTÃO (operação): faixa "Precisa de você agora" + abas Call center / Agendamentos / Consultores / Vendas.
// Cada número importante vem com a comparação ao período anterior de mesmo tamanho.
import { useState } from "react";
import { useApp } from "../estado";
import { fmtDate, fmtMoeda, isoLocal, parseData, vendaContaVolume } from "../lib/regras";
import { BarRow, Kpi } from "./Dashboard";
import PainelGestao from "./PainelGestao";

const FIM_TXT = (t: string) => t.startsWith("Status → Concluída") || t.startsWith("✓ Atendimento finalizado");
const concluidoEm = (c: any) => { const h = (c.historico || []).filter((x: any) => FIM_TXT(String(x.texto))); return h.length ? h[h.length - 1].quando : null; };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

function Comp({ a, b, inverso, suf = "" }: { a: number | null; b: number | null; inverso?: boolean; suf?: string }) {
  if (a == null || b == null || !b) return <span className="pb-comp neutro">sem base anterior</span>;
  const d = Math.round(((a - b) / b) * 100);
  const bom = inverso ? d <= 0 : d >= 0;
  return <span className={"pb-comp " + (d === 0 ? "neutro" : bom ? "bom" : "ruim")}>{d > 0 ? "▲" : d < 0 ? "▼" : "="} {Math.abs(d)}% <small>(antes {b}{suf})</small></span>;
}
const Big = ({ n, l, a, b, inverso, suf, cor }: any) => <div className="pb-big"><b style={cor ? { color: cor } : undefined}>{n}</b><span>{l}</span>{a !== undefined && <Comp a={a} b={b} inverso={inverso} suf={suf} />}</div>;

export default function PainelBruno({ de, ate }: { de: string; ate: string }) {
  const { R, st, irPara, abrirDetalhe } = useApp() as any;
  const [aba, setAba] = useState<"cc" | "ag" | "cons" | "vendas">("cc");
  // período anterior com o mesmo número de dias
  const d0 = new Date(de + "T00:00:00"), d1 = new Date(ate + "T23:59:59");
  const dias = Math.max(1, Math.round((+d1 - +d0) / 86400000));
  const pa = new Date(+d0 - dias * 86400000), pb = new Date(+d0 - 1000);
  const dePrev = isoLocal(pa), atePrev = isoLocal(pb);
  const dentro = (v: any, a: string, b: string) => { if (!v) return false; const d = parseData(v); return d >= new Date(a + "T00:00:00") && d <= new Date(b + "T23:59:59"); };
  const agora = new Date();
  const todos = st.chamados;

  // ---------- faixa: precisa de você agora ----------
  const pg = R.pendenciasGestao();
  const acomp = todos.filter((c: any) => R.acompAtivo(c));
  const criticos = todos.filter((c: any) => !R.domMarketing(c) && R.prioridade(c) === "critico");
  const reemb = (st.reembolsos || []).filter((r: any) => r.status === "pendente");
  const medParadas = todos.filter((c: any) => c.tipo === "medidas" && c.status !== "concluida" && (+agora - +new Date(c.criadoEm)) > 2 * 86400000 && ["validar", "realizada"].includes(R.etapaMedida(c)));
  const semVendHoje = todos.filter((c: any) => R.domMarketing(c) && !c.atendenteId && String(c.dataLoja || "").slice(0, 10) === isoLocal(agora) && !c.venda);
  const semAtual = todos.filter((c: any) => R.domMarketing(c) && R.clienteCriticoInatividade(c));
  const alertas: [string, number, string, string, () => void][] = [
    ["🧾", pg.vendasConfirmar.length, "vendas a confirmar", "warn", () => irPara("aprovacoes")],
    ["🚨", acomp.length, "acompanhamentos urgentes", "crit", () => irPara("pendencias")],
    ["🔴", criticos.length, "chamados críticos (+24h)", "crit", () => irPara("fila")],
    ["💵", reemb.length, "reembolsos para aprovar", "warn", () => irPara("aprovacoes")],
    ["📐", medParadas.length, "medidas paradas há +2 dias", "warn", () => irPara("fila")],
    ["🏬", semVendHoje.length, "clientes hoje sem vendedor", "warn", () => irPara("definir")],
    ["🕒", semAtual.length, "clientes sem atualização +24h", "warn", () => irPara("pendencias")],
  ];
  const ativos = alertas.filter(a => a[1] > 0);

  // ---------- call center ----------
  const cc = todos.filter((c: any) => !R.domMarketing(c));
  const regs = (a: string, b: string) => cc.filter((c: any) => dentro(c.criadoEm, a, b));
  const fins = (a: string, b: string) => cc.filter((c: any) => c.status === "concluida" && dentro(concluidoEm(c), a, b));
  const naLigacao = (l: any[]) => l.filter((c: any) => { const f = concluidoEm(c); return f && (+new Date(f) - +new Date(c.criadoEm)) < 15 * 60000; });
  const noPrazo = (l: any[]) => l.filter((c: any) => { const f = concluidoEm(c); return f && c.slaResposta && new Date(f) <= new Date(c.slaResposta); });
  const tMedio = (l: any[]) => { const hs = l.map((c: any) => { const f = concluidoEm(c); return f ? (+new Date(f) - +new Date(c.criadoEm)) / 3600000 : null; }).filter((x: any) => x != null) as number[]; return hs.length ? Math.round(hs.reduce((s, x) => s + x, 0) / hs.length) : null; };
  const R1 = regs(de, ate), R0 = regs(dePrev, atePrev), F1 = fins(de, ate), F0 = fins(dePrev, atePrev);
  const abertos = cc.filter((c: any) => c.status !== "concluida");
  const atrasados = cc.filter((c: any) => ["atrasado", "critico"].includes(R.prioridade(c)));
  const prazo1 = pct(noPrazo(F1).length, F1.length), prazo0 = pct(noPrazo(F0).length, F0.length);
  const tm1 = tMedio(F1), tm0 = tMedio(F0);
  const atendentes = R.state.usuarios.filter((u: any) => u.ativo && (u.setores || []).includes("callcenter"));
  const porAt = atendentes.map((u: any) => {
    const reg = R1.filter((c: any) => c.solicitanteId === u.id);
    const fin = F1.filter((c: any) => (c.historico || []).some((h: any) => FIM_TXT(String(h.texto)) && h.quem === u.nome));
    return { nome: u.nome, reg: reg.length, fin: fin.length, lig: naLigacao(reg.filter((c: any) => c.status === "concluida")).length,
      aberto: abertos.filter((c: any) => c.solicitanteId === u.id).length, sup: reg.filter((c: any) => c.tratativa && c.tratativa.acomp).length };
  }).sort((a: any, b: any) => b.reg - a.reg);
  const motivos: Record<string, number> = {}; R1.forEach((c: any) => { motivos[c.tipo] = (motivos[c.tipo] || 0) + 1; });
  const motL = Object.entries(motivos).sort((a, b) => b[1] - a[1]); const mxMot = Math.max(1, ...motL.map(x => x[1]));
  const setAb: Record<string, number> = {}; abertos.forEach((c: any) => { setAb[c.setorDestino] = (setAb[c.setorDestino] || 0) + 1; });
  const setL = Object.entries(setAb).sort((a, b) => b[1] - a[1]); const mxSet = Math.max(1, ...setL.map(x => x[1]));

  // ---------- agendamentos ----------
  const mk = todos.filter((c: any) => R.domMarketing(c));
  const agd = (a: string, b: string) => mk.filter((c: any) => dentro(c.criadoEm, a, b));
  const loja = (a: string, b: string) => mk.filter((c: any) => c.dataLoja && dentro(c.dataLoja, a, b));
  const A1 = agd(de, ate), A0 = agd(dePrev, atePrev), L1 = loja(de, ate), L0 = loja(dePrev, atePrev);
  const vieram = (l: any[]) => l.filter(R.compareceu), naoVeio = (l: any[]) => l.filter((c: any) => R.statusClienteDe(c) === "nao_compareceu");
  const vend = (l: any[]) => l.filter((c: any) => vendaContaVolume(c.venda));
  const V1 = vieram(L1), V0 = vieram(L0), C1 = vend(L1), C0 = vend(L0);
  const ops = R.state.usuarios.filter((u: any) => u.ativo && (u.setores || []).includes("marketing_operadora")).map((u: any) => {
    const a = A1.filter((c: any) => c.solicitanteId === u.id), l = L1.filter((c: any) => c.solicitanteId === u.id);
    return { nome: u.nome, ag: a.length, hoje: mk.filter((c: any) => c.solicitanteId === u.id && String(c.criadoEm).slice(0, 10) === isoLocal(agora)).length,
      vieram: vieram(l).length, nao: naoVeio(l).length, vendas: vend(l).length };
  }).sort((a: any, b: any) => b.ag - a.ag);
  const porDia: Record<string, number> = {}; A1.forEach((c: any) => { const d = String(c.criadoEm).slice(0, 10); porDia[d] = (porDia[d] || 0) + 1; });
  const diasL = Object.entries(porDia).sort((a, b) => a[0].localeCompare(b[0])); const mxDia = Math.max(1, ...diasL.map(x => x[1]));
  const oM = A1.filter((c: any) => R.ehDireto(c)).length, oE = A1.length - oM;

  // ---------- consultores ----------
  const cons = R.consultores().map((u: any) => {
    const meus = mk.filter((c: any) => c.consultorId === u.id);
    const F = R.funilConsultor(u.id, de, ate);
    const ex = R.extratoConsultor(u.id, de, ate);
    const semAnexo = meus.filter((c: any) => R.semAnexo(c)).length;
    const parados = meus.filter((c: any) => R.clienteCriticoInatividade(c)).length;
    const pend = meus.filter((c: any) => c.setorDestino === "consultor_externo" && !(c.tratativa && c.tratativa.realizada)).length;
    const atras = meus.filter((c: any) => c.setorDestino === "consultor_externo" && !(c.tratativa && c.tratativa.realizada) && c.dataVisita && parseData(c.dataVisita) < agora).length;
    return { u, F, ex, semAnexo, parados, pend, atras, alerta: semAnexo + parados + atras };
  }).sort((a: any, b: any) => b.alerta - a.alerta || b.ex.total - a.ex.total);

  const Tab = ({ k, l, n }: any) => <button className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{l}{n ? <i>{n}</i> : null}</button>;
  return (
    <div className="pb">
      <div className={"pb-faixa" + (ativos.length ? "" : " ok")}>
        <b>{ativos.length ? "Precisa de você agora" : "✓ Nada urgente agora"}</b>
        <div className="pb-alertas">{ativos.map(([ic, n, l, cls, go]) => <button key={l} className={"pb-al " + cls} onClick={go}><span>{ic}</span><b>{n}</b>{l}</button>)}</div>
      </div>
      <div className="subnav pb-abas"><Tab k="cc" l="☎ Call center" n={atrasados.length} /><Tab k="ag" l="◎ Agendamentos" /><Tab k="cons" l="🧭 Consultores" n={cons.filter((x: any) => x.alerta).length} /><Tab k="vendas" l="💰 Vendas" /></div>
      <div className="pb-per">Comparando {fmtDate(de)}–{fmtDate(ate)} com {fmtDate(dePrev)}–{fmtDate(atePrev)}</div>

      {aba === "cc" && <>
        <div className="pb-bigs">
          <Big n={R1.length} l="Atendimentos registrados" a={R1.length} b={R0.length} />
          <Big n={F1.length} l="Finalizados" a={F1.length} b={F0.length} />
          <Big n={prazo1 == null ? "—" : prazo1 + "%"} l="Finalizados no prazo" a={prazo1} b={prazo0} suf="%" cor="var(--st-concluida)" />
          <Big n={tm1 == null ? "—" : tm1 + "h"} l="Tempo médio até finalizar" a={tm1} b={tm0} inverso suf="h" />
        </div>
        <div className="kpis">
          <Kpi n={naLigacao(F1).length} l="Resolvidos na ligação" cor="var(--st-concluida)" />
          <Kpi n={abertos.length} l="Em aberto agora" />
          <Kpi n={atrasados.length} l="Atrasados / críticos" cls={atrasados.length ? "alert" : ""} cor={atrasados.length ? "var(--danger)" : undefined} />
          <Kpi n={acomp.length} l="Com a supervisão" cor={acomp.length ? "var(--critico)" : undefined} />
        </div>
        <div className="panel" style={{ marginBottom: 16 }}><h3>Por atendente</h3>
          {porAt.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Atendente</th><th>Registrados</th><th>Finalizados</th><th>Na ligação</th><th>Em aberto (dela)</th><th>Acionou supervisão</th></tr></thead><tbody>
            {porAt.map((x: any) => <tr key={x.nome}><td><b>{x.nome}</b></td><td>{x.reg}</td><td>{x.fin}</td><td>{x.lig}</td><td>{x.aberto}</td><td style={x.sup ? { color: "var(--critico)", fontWeight: 700 } : undefined}>{x.sup}</td></tr>)}
          </tbody></table></div> : <div className="dn-vazio">Nenhuma atendente cadastrada.</div>}</div>
        <div className="panel-grid">
          <div className="panel"><h3>Motivos mais frequentes</h3>{motL.length ? motL.map(([k, n]) => <BarRow key={k} nm={R.tipoNome(k)} pct={n / mxMot * 100} v={n} />) : <div className="dn-vazio">Sem registros no período.</div>}</div>
          <div className="panel"><h3>Onde está parado (em aberto por setor)</h3>{setL.length ? setL.map(([k, n]) => <BarRow key={k} nm={R.setorNome(k)} pct={n / mxSet * 100} v={n} cor="var(--warn)" />) : <div className="dn-vazio">Nada em aberto.</div>}</div>
        </div>
        {criticos.length > 0 && <div className="panel" style={{ marginBottom: 16 }}><h3>Críticos agora</h3>{criticos.slice(0, 12).map((c: any) => <div className="acao" key={c.id} style={{ borderLeftColor: "var(--critico)" }} onClick={() => abrirDetalhe(c.id)}><span>{c.id} · {c.cliente} · <b>{R.setorNome(c.setorDestino)}</b></span><span className="g" style={{ color: "var(--critico)" }}>{R.tipoNome(c.tipo)}</span></div>)}</div>}
      </>}

      {aba === "ag" && <>
        <div className="pb-bigs">
          <Big n={A1.length} l="Agendamentos feitos" a={A1.length} b={A0.length} />
          <Big n={V1.length} l={`Vieram à loja (${pct(V1.length, L1.length) ?? "—"}%)`} a={V1.length} b={V0.length} />
          <Big n={C1.length} l="Compraram" a={C1.length} b={C0.length} cor="var(--st-concluida)" />
          <Big n={(pct(naoVeio(L1).length, L1.length) ?? "—") + "%"} l="Não vieram" a={pct(naoVeio(L1).length, L1.length)} b={pct(naoVeio(L0).length, L0.length)} inverso suf="%" />
        </div>
        <div className="panel" style={{ marginBottom: 16 }}><h3>Funil: agendou → veio → comprou</h3>
          <div className="pb-funil">{[["Agendados na loja", L1.length, "var(--primary)"], ["Vieram", V1.length, "var(--warn)"], ["Compraram", C1.length, "var(--st-concluida)"]].map(([l, n, cor]: any) =>
            <div key={l}><span>{l}</span><i><em style={{ width: (L1.length ? n / L1.length * 100 : 0) + "%", background: cor }}></em></i><b>{n}</b></div>)}
            <small>Veio→comprou: <b>{pct(C1.length, V1.length) ?? "—"}%</b> (antes {pct(C0.length, V0.length) ?? "—"}%) · Marketing {oM} × consultor externo {oE} agendamentos</small></div></div>
        <div className="panel" style={{ marginBottom: 16 }}><h3>Operadoras</h3>
          {ops.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Operadora</th><th>Agendamentos</th><th>Hoje</th><th>Vieram</th><th>Não vieram</th><th>Vendas</th></tr></thead><tbody>
            {ops.map((x: any) => <tr key={x.nome}><td><b>{x.nome}</b></td><td>{x.ag}</td><td>{x.hoje}</td><td>{x.vieram}</td><td style={x.nao ? { color: "var(--danger)" } : undefined}>{x.nao}</td><td style={{ fontWeight: 700, color: "var(--st-concluida)" }}>{x.vendas}</td></tr>)}
          </tbody></table></div> : <div className="dn-vazio">Sem operadoras.</div>}</div>
        <div className="panel" style={{ marginBottom: 16 }}><h3>Agendamentos por dia</h3>{diasL.length ? diasL.map(([d, n]) => <BarRow key={d} nm={fmtDate(d)} pct={n / mxDia * 100} v={n} cor="#c0428a" />) : <div className="dn-vazio">Sem agendamentos no período.</div>}</div>
      </>}

      {aba === "cons" && <div className="pb-cons">
        {cons.map(({ u, F, ex, semAnexo, parados, pend, atras, alerta }: any) => (
          <div key={u.id} className={"pb-card" + (alerta ? " pb-alerta" : "")}>
            <div className="pb-card-h"><b>{u.nome}</b><span>{fmtMoeda(ex.total)} a receber</span></div>
            <div className="pb-card-n">
              <div><b>{ex.visitas.length}</b><span>visitas pagas</span></div><div><b>{ex.medidas.length}</b><span>medidas</span></div>
              <div><b>{ex.vendas.length}</b><span>vendas efetivadas</span></div><div><b>{F.pVisitaVenda ?? "—"}{F.pVisitaVenda != null ? "%" : ""}</b><span>visita→venda</span></div>
            </div>
            <div className="pb-card-f">{[["Clientes", F.total], ["Visitados", F.realizadas], ["Agend. loja", F.agendadas], ["Vieram", F.vieram], ["Vendas", F.vendas]].map(([l, n]: any) => <span key={l}>{l} <b>{n}</b></span>)}</div>
            <div className="pb-card-a">
              {pend ? <span>{pend} visita(s) a fazer</span> : null}
              {atras ? <span className="r">{atras} visita(s) atrasada(s)</span> : null}
              {semAnexo ? <span className="r">{semAnexo} sem anexo</span> : null}
              {parados ? <span className="r">{parados} sem atualização +24h</span> : null}
              {!alerta && !pend ? <span className="ok">✓ em dia</span> : null}
            </div>
          </div>))}
        {!cons.length && <div className="dn-vazio">Nenhum consultor cadastrado.</div>}
      </div>}

      {aba === "vendas" && <PainelGestao de={de} ate={ate} />}
    </div>
  );
}
