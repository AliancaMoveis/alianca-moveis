// Dashboard visual da operadora do marketing (computador): só números e gráficos, sem lista de ações.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { STATUS_CLIENTE, fmtDate, fmtMoeda, hojeISO, isoLocal, parseData } from "../lib/regras";
import { useTimeMkt } from "../movel/Gestor";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const diaLocal = (v: any) => { const x = parseData(v); return isNaN(+x) ? "" : isoLocal(x); };
const pc = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;

// grupos de situação do cliente, na ordem do caminho
const GRUPOS: [string, string, string[], string][] = [
  ["consultor", "Com o consultor", ["aguardando_consultor", "direcionado_consultor", "visita_realizada"], "#5b7fc7"],
  ["agendado", "Agendado na loja", ["agendado_loja"], "#7a5cc2"],
  ["atendimento", "Em atendimento na loja", ["com_vendedor", "orcamento", "sem_resposta", "reagendado"], "#d4a020"],
  ["vendido", "Vendido", ["vendido", "vendido_promissoria", "vendido_revisao"], "#2f8f5b"],
  ["perdido", "Não veio / perdido", ["nao_compareceu", "reprovado", "venda_cancelada"], "#c24a4a"],
];

export default function PainelOperadora({ de, ate }: { de: string; ate: string }) {
  const { R, st, abrirDetalhe, irPara } = useApp() as any;
  const eu = R.currentUserId, hoje = hojeISO();
  const meus = st.chamados.filter((c: any) => R.domMarketing(c) && c.solicitanteId === eu);
  const noPer = (v: any) => { const d = diaLocal(v); return !!d && d >= de && d <= ate; };
  const ag = meus.filter((c: any) => noPer(c.criadoEm));
  const agMkt = ag.filter((c: any) => R.ehDireto(c)), agExt = ag.filter((c: any) => !R.ehDireto(c));
  const comLoja = ag.filter((c: any) => !!c.dataLoja);
  const vieram = ag.filter(R.compareceu);
  const vendas = ag.filter((c: any) => c.venda && c.venda.status !== "cancelada");
  // comissão: sempre do mês atual
  const h = parseData(hoje + "T12:00");
  const M = { de: isoLocal(new Date(h.getFullYear(), h.getMonth(), 1)), ate: isoLocal(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
  const T = useTimeMkt(M);
  const minha = T.linhas.find((x: any) => x.u.id === eu);
  const [pag, setPag] = useState<any>(null);
  useEffect(() => { A.listarPagamentosMkt(M.de, M.ate).then((l: any[]) => setPag(l.find(p => p.operadora_id === eu) || null)).catch(() => setPag(null)); }, [M.de]);
  const total = minha ? minha.total : 0, aprovado = pag ? Number(pag.total) : 0, pendente = Math.max(0, total - aprovado);
  // gráfico dia a dia
  const dias: string[] = []; for (let d = parseData(de + "T12:00"); isoLocal(d) <= ate && isoLocal(d) <= hoje; d.setDate(d.getDate() + 1)) dias.push(isoLocal(d));
  const porDia: Record<string, { m: number; e: number }> = {}; ag.forEach((c: any) => { const d = diaLocal(c.criadoEm); porDia[d] = porDia[d] || { m: 0, e: 0 }; R.ehDireto(c) ? porDia[d].m++ : porDia[d].e++; });
  const metaDe: Record<string, any> = {}; (T.metas || []).forEach((m: any) => (metaDe[m.dia] = m));
  const maxDia = Math.max(1, ...dias.map(d => (porDia[d]?.m || 0) + (porDia[d]?.e || 0)), ...dias.map(d => metaDe[d]?.meta || 0));
  const hojeN = meus.filter((c: any) => diaLocal(c.criadoEm) === hoje).length, metaHoje = T.metaHoje;
  // situação dos clientes do período
  const grupos = GRUPOS.map(([k, l, sts, cor]) => ({ k, l, cor, n: ag.filter((c: any) => sts.includes(R.statusClienteDe(c))).length }));
  const outros = ag.length - grupos.reduce((s, g) => s + g.n, 0);
  if (outros > 0) grupos[0].n += outros;
  // rosca
  let acc = 0; const R0 = 60, C = 2 * Math.PI * R0;
  const proxLoja = meus.filter((c: any) => c.dataLoja && String(c.dataLoja).slice(0, 10) >= hoje && !c.venda).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja))).slice(0, 8);

  const Card = ({ ic, n, l, sub, cor }: any) => <div className="po-card"><div className="po-ic" style={{ background: cor }}>{ic}</div><div><div className="po-n">{n}</div><div className="po-l">{l}</div>{sub && <div className="po-s">{sub}</div>}</div></div>;
  return (
    <div className="po">
      <div className="po-cards">
        <Card ic="📅" n={ag.length} l="Clientes agendados" sub={<><b>{agMkt.length}</b> direto na loja · <b>{agExt.length}</b> consultor externo</>} cor="#8a2a6b" />
        <Card ic="🏬" n={vieram.length} l="Vieram à loja" sub={<>{pc(vieram.length, comLoja.length)}% de quem foi agendado na loja</>} cor="#d4a020" />
        <Card ic="🤝" n={vendas.length} l="Vendas" sub={<>{pc(vendas.length, ag.length)}% dos agendamentos viraram venda</>} cor="#2f8f5b" />
        <Card ic="💰" n={fmtMoeda(total)} l={"Comissão de " + MESES[h.getMonth()]} sub={<><b style={{ color: "var(--st-concluida)" }}>{fmtMoeda(aprovado)}</b> aprovado · <b style={{ color: "var(--warn)" }}>{fmtMoeda(pendente)}</b> pendente</>} cor="#2d6a4f" />
      </div>

      <div className="po-grid">
        <div className="panel">
          <h3>Do agendamento à venda <span className="hint">· {fmtDate(de)} a {fmtDate(ate)}</span></h3>
          <div className="po-funil">
            {[["Agendados", ag.length, "#8a2a6b"], ["Com data na loja", comLoja.length, "#7a5cc2"], ["Vieram à loja", vieram.length, "#d4a020"], ["Compraram", vendas.length, "#2f8f5b"]].map(([l, n, cor]: any, i, arr: any) => (
              <div key={l} className="po-etapa">
                <div className="po-barra" style={{ width: Math.max(8, pc(n, ag.length)) + "%", background: cor }}><b>{n}</b></div>
                <span>{l}{i > 0 && arr[i - 1][1] ? <small> · {pc(n, arr[i - 1][1])}% da etapa anterior</small> : null}</span>
              </div>))}
          </div>
        </div>

        <div className="panel">
          <h3>Situação dos seus clientes</h3>
          <div className="po-rosca">
            <svg viewBox="0 0 160 160" width="160" height="160">
              <circle cx="80" cy="80" r={R0} fill="none" stroke="var(--line)" strokeWidth="22" />
              {ag.length > 0 && grupos.filter(g => g.n).map(g => { const len = g.n / ag.length * C; const el = <circle key={g.k} cx="80" cy="80" r={R0} fill="none" stroke={g.cor} strokeWidth="22" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 80 80)" />; acc += len; return el; })}
              <text x="80" y="78" textAnchor="middle" fontSize="28" fontWeight="800" fill="var(--ink)">{ag.length}</text>
              <text x="80" y="98" textAnchor="middle" fontSize="11" fill="var(--ink-soft)">clientes</text>
            </svg>
            <div className="po-leg">{grupos.map(g => <div key={g.k}><i style={{ background: g.cor }}></i><span>{g.l}</span><b>{g.n}</b></div>)}</div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Agendamentos por dia {metaHoje ? <span className="pill" style={{ marginLeft: 8 }}>hoje {hojeN} de {metaHoje.meta} · bônus {fmtMoeda(Number(metaHoje.valor))}</span> : <span className="pill" style={{ marginLeft: 8 }}>hoje {hojeN}</span>}</h3>
        <div className="po-dias">
          {dias.map(d => { const v = porDia[d] || { m: 0, e: 0 }, n = v.m + v.e, m = metaDe[d]; const bateu = m && n >= m.meta; return (
            <div key={d} className={"po-dia" + (d === hoje ? " hoje" : "")} title={`${fmtDate(d)}: ${n} agendamento(s)${m ? " · meta " + m.meta : ""}`}>
              <div className="po-col">
                {m && <div className="po-meta" style={{ bottom: (m.meta / maxDia * 100) + "%" }}></div>}
                <div className="po-seg e" style={{ height: (v.e / maxDia * 100) + "%" }}></div>
                <div className="po-seg m" style={{ height: (v.m / maxDia * 100) + "%" }}></div>
              </div>
              <b style={bateu ? { color: "var(--st-concluida)" } : undefined}>{n || ""}{bateu ? "✓" : ""}</b>
              <small>{d.slice(8)}<br />{DIAS[parseData(d + "T12:00").getDay()]}</small>
            </div>); })}
        </div>
        <div className="po-leg h"><div><i style={{ background: "#c0428a" }}></i><span>Direto na loja</span></div><div><i style={{ background: "#5b7fc7" }}></i><span>Consultor externo</span></div><div><i className="linha"></i><span>Meta do dia</span></div></div>
      </div>

      <div className="po-grid">
        <div className="panel">
          <h3>Seus próximos clientes na loja</h3>
          {proxLoja.length ? proxLoja.map((c: any) => (
            <div key={c.id} className="po-prox" onClick={() => abrirDetalhe(c.id)}>
              <div className="po-data"><b>{fmtDate(c.dataLoja).slice(0, 5)}</b><small>{String(c.dataLoja).slice(11, 16)}</small></div>
              <div style={{ flex: 1 }}><b>{c.cliente}</b><small>{c.atendenteId ? "vendedor " + R.nomeUser(c.atendenteId) : "aguardando vendedor"}</small></div>
              <span className={"sc sc-" + R.statusClienteDe(c)}>{STATUS_CLIENTE[R.statusClienteDe(c)]}</span>
            </div>)) : <div className="empty" style={{ padding: "16px 8px" }}>Nenhum cliente seu marcado na loja.</div>}
        </div>
        <div className="panel">
          <h3>Sua comissão — {MESES[h.getMonth()]}</h3>
          <div className="po-com">
            <div><span>Vendas efetivadas</span><b>{minha ? minha.vendas.length : 0} × {fmtMoeda(T.valorVenda)}</b></div>
            <div><span>Bônus de meta ({minha ? minha.batidos : 0} de {minha ? minha.diasMeta : 0} dias)</span><b>{fmtMoeda(minha ? minha.bonus : 0)}</b></div>
            <div className="tot"><span>Total calculado</span><b>{fmtMoeda(total)}</b></div>
            <div className="ok"><span>✔ Aprovado para receber</span><b>{fmtMoeda(aprovado)}</b></div>
            <div className="pend"><span>⏳ Pendente de aprovação</span><b>{fmtMoeda(pendente)}</b></div>
          </div>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => irPara("produtividade")}>Ver minha produtividade ›</button>
        </div>
      </div>
    </div>
  );
}
