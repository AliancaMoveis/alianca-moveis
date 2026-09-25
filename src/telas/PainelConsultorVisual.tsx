// Dashboard visual do consultor externo (computador): visitas, loja, vendas e valor a receber.
import { useApp } from "../estado";
import { STATUS_CLIENTE, fmtDate, fmtMoeda, hojeISO, isoLocal, parseData } from "../lib/regras";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaLocal = (v: any) => { const x = parseData(v); return isNaN(+x) ? "" : isoLocal(x); };
const pc = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;
const GRUPOS: [string, string, string[], string][] = [
  ["visitar", "A visitar", ["aguardando_consultor", "direcionado_consultor"], "#5b7fc7"],
  ["visitado", "Visitado — falta agendar loja", ["visita_realizada"], "#2a9bb0"],
  ["agendado", "Agendado na loja", ["agendado_loja"], "#7a5cc2"],
  ["atendimento", "Em atendimento na loja", ["com_vendedor", "orcamento", "sem_resposta", "reagendado"], "#d4a020"],
  ["vendido", "Vendido", ["vendido", "vendido_promissoria", "vendido_revisao"], "#2f8f5b"],
  ["perdido", "Não veio / perdido", ["nao_compareceu", "reprovado", "venda_cancelada"], "#c24a4a"],
];

export default function PainelConsultorVisual({ de, ate }: { de: string; ate: string }) {
  const { R, st, abrirDetalhe, irPara } = useApp() as any;
  const eu = R.currentUserId, hoje = hojeISO();
  const cfg = R.cfg();
  const cli = R.clientesConsultor(eu, de, ate);
  const F = R.funil(cli);
  const ex = R.extratoConsultor(eu, de, ate);
  const meus = st.chamados.filter((c: any) => R.domMarketing(c) && c.consultorId === eu);
  const aVisitar = meus.filter((c: any) => c.setorDestino === "consultor_externo" && !(c.tratativa && c.tratativa.realizada));
  const atrasadas = aVisitar.filter((c: any) => c.dataVisita && String(c.dataVisita).slice(0, 10) < hoje);
  const faltaLoja = meus.filter((c: any) => c.setorDestino === "consultor_externo" && c.tratativa && c.tratativa.realizada && !c.dataLoja);
  const semAnexo = meus.filter((c: any) => R.semAnexo(c));
  const aConf = meus.filter((c: any) => c.venda && ["registrada", "promissoria"].includes(c.venda.status) && R.dentroPeriodo(c.venda.dataVenda || c.venda.quando, de, ate));
  // visitas por dia (data da visita): realizadas x a realizar
  const dias: string[] = []; for (let d = parseData(de + "T12:00"); isoLocal(d) <= ate; d.setDate(d.getDate() + 1)) { if (dias.length > 62) break; dias.push(isoLocal(d)); }
  const porDia: Record<string, { r: number; p: number }> = {};
  cli.forEach((c: any) => { const d = diaLocal(c.dataVisita || c.criadoEm); if (!d) return; porDia[d] = porDia[d] || { r: 0, p: 0 }; R.visitaFeita(c) ? porDia[d].r++ : porDia[d].p++; });
  const maxDia = Math.max(1, ...dias.map(d => (porDia[d]?.r || 0) + (porDia[d]?.p || 0)));
  const grupos = GRUPOS.map(([k, l, sts, cor]) => ({ k, l, cor, n: cli.filter((c: any) => sts.includes(R.statusClienteDe(c))).length }));
  const resto = cli.length - grupos.reduce((s, g) => s + g.n, 0); if (resto > 0) grupos[0].n += resto;
  let acc = 0; const R0 = 60, C = 2 * Math.PI * R0;
  const proxVisitas = aVisitar.slice().sort((a: any, b: any) => String(a.dataVisita || "9").localeCompare(String(b.dataVisita || "9"))).slice(0, 7);
  const proxLoja = meus.filter((c: any) => c.dataLoja && String(c.dataLoja).slice(0, 10) >= hoje && !c.venda).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja))).slice(0, 7);
  const pct = String(cfg.comissaoPct).replace(".", ",");

  const Card = ({ ic, n, l, sub, cor }: any) => <div className="po-card"><div className="po-ic" style={{ background: cor }}>{ic}</div><div><div className={"po-n" + (typeof n === "string" ? " din" : "")}>{n}</div><div className="po-l">{l}</div>{sub && <div className="po-s">{sub}</div>}</div></div>;
  const Alerta = ({ n, l, cor, lista }: any) => <div className={"pc-alerta" + (n ? "" : " zero")} style={n ? { borderColor: cor, color: cor } : undefined} onClick={() => n && lista[0] && abrirDetalhe(lista[0].id)}><b>{n}</b><span>{l}</span></div>;
  const Prox = ({ c, quando, sub }: any) => (
    <div className="po-prox" onClick={() => abrirDetalhe(c.id)}>
      <div className="po-data"><b>{quando ? fmtDate(quando).slice(0, 5) : "—"}</b><small>{quando ? String(quando).slice(11, 16) : "sem data"}</small></div>
      <div style={{ flex: 1, minWidth: 0 }}><b>{c.cliente}{R.semAnexo(c) ? " ⚠️" : ""}</b><small>{sub}</small></div>
      <span className={"sc sc-" + R.statusClienteDe(c)}>{STATUS_CLIENTE[R.statusClienteDe(c)]}</span>
    </div>);
  return (
    <div className="po">
      <div className="po-cards">
        <Card ic="📍" n={F.total} l="Visitas recebidas" sub={<><b>{F.realizadas}</b> realizadas · <b>{F.pendentes}</b> a realizar</>} cor="#5b7fc7" />
        <Card ic="🏬" n={F.vieram} l="Vieram à loja" sub={<>{F.agendadas} agendados · presença {pc(F.vieram, F.vieram + F.faltaram)}%</>} cor="#d4a020" />
        <Card ic="🤝" n={F.vendas} l="Vendas" sub={<>{pc(F.vendas, F.realizadas)}% das visitas viraram venda</>} cor="#2f8f5b" />
        <Card ic="💰" n={fmtMoeda(ex.total)} l="Valor a receber" sub={<>{ex.visitas.length} visita(s) + comissão {pct}%</>} cor="#2d6a4f" />
      </div>

      <div className="pc-alertas">
        <Alerta n={atrasadas.length} l="visitas atrasadas" cor="var(--danger)" lista={atrasadas} />
        <Alerta n={aVisitar.length} l="visitas a realizar" cor="var(--primary)" lista={aVisitar} />
        <Alerta n={faltaLoja.length} l="visitados sem data na loja" cor="var(--warn)" lista={faltaLoja} />
        <Alerta n={semAnexo.length} l="sem planta/fotos" cor="#b07a00" lista={semAnexo} />
        <Alerta n={aConf.length} l="vendas a confirmar" cor="var(--warn)" lista={aConf} />
      </div>

      <div className="po-grid">
        <div className="panel">
          <h3>Da visita à venda <span className="hint">· {fmtDate(de)} a {fmtDate(ate)}</span></h3>
          <div className="po-funil">
            {[["Visitas recebidas", F.total, "#5b7fc7"], ["Visitas realizadas", F.realizadas, "#2a9bb0"], ["Agendados na loja", F.agendadas, "#7a5cc2"], ["Vieram à loja", F.vieram, "#d4a020"], ["Compraram", F.vendas, "#2f8f5b"]].map(([l, n, cor]: any, i, arr: any) => (
              <div key={l} className="po-etapa">
                <div className="po-barra" style={{ width: Math.max(8, pc(n, F.total)) + "%", background: cor }}><b>{n}</b></div>
                <span>{l}{i > 0 && arr[i - 1][1] ? <small> · {pc(n, arr[i - 1][1])}% da etapa anterior</small> : null}</span>
              </div>))}
          </div>
        </div>
        <div className="panel">
          <h3>Situação dos seus clientes</h3>
          <div className="po-rosca">
            <svg viewBox="0 0 160 160" width="160" height="160">
              <circle cx="80" cy="80" r={R0} fill="none" stroke="var(--line)" strokeWidth="22" />
              {cli.length > 0 && grupos.filter(g => g.n).map(g => { const len = g.n / cli.length * C; const el = <circle key={g.k} cx="80" cy="80" r={R0} fill="none" stroke={g.cor} strokeWidth="22" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 80 80)" />; acc += len; return el; })}
              <text x="80" y="78" textAnchor="middle" fontSize="28" fontWeight="800" fill="var(--ink)">{cli.length}</text>
              <text x="80" y="98" textAnchor="middle" fontSize="11" fill="var(--ink-soft)">clientes</text>
            </svg>
            <div className="po-leg">{grupos.map(g => <div key={g.k}><i style={{ background: g.cor }}></i><span>{g.l}</span><b>{g.n}</b></div>)}</div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Visitas por dia <span className="hint">· pela data da visita</span></h3>
        <div className="po-dias">
          {dias.map(d => { const v = porDia[d] || { r: 0, p: 0 }, n = v.r + v.p; return (
            <div key={d} className={"po-dia" + (d === hoje ? " hoje" : "")} title={`${fmtDate(d)}: ${v.r} realizada(s), ${v.p} a realizar`}>
              <div className="po-col">
                <div className="po-seg e" style={{ height: (v.p / maxDia * 100) + "%", background: "#b9c7e6" }}></div>
                <div className="po-seg m" style={{ height: (v.r / maxDia * 100) + "%", background: "#2a9bb0" }}></div>
              </div>
              <b>{n || ""}</b>
              <small>{d.slice(8)}<br />{DIAS[parseData(d + "T12:00").getDay()]}</small>
            </div>); })}
        </div>
        <div className="po-leg h"><div><i style={{ background: "#2a9bb0" }}></i><span>Realizadas</span></div><div><i style={{ background: "#b9c7e6" }}></i><span>A realizar</span></div></div>
      </div>

      <div className="po-grid">
        <div className="panel">
          <h3>Próximas visitas</h3>
          {proxVisitas.length ? proxVisitas.map((c: any) => <Prox key={c.id} c={c} quando={c.dataVisita} sub={c.endereco || c.produto || "—"} />) : <div className="empty" style={{ padding: "16px 8px" }}>Nenhuma visita a fazer. 👍</div>}
          <h3 style={{ marginTop: 18 }}>Seus clientes que vêm à loja</h3>
          {proxLoja.length ? proxLoja.map((c: any) => <Prox key={c.id} c={c} quando={c.dataLoja} sub={c.atendenteId ? "vendedor " + R.nomeUser(c.atendenteId) : "aguardando vendedor"} />) : <div className="empty" style={{ padding: "16px 8px" }}>Nenhum cliente seu marcado na loja.</div>}
        </div>
        <div className="panel">
          <h3>Seu extrato <span className="hint">· {fmtDate(de)} a {fmtDate(ate)}</span></h3>
          <div className="po-com">
            <div><span>Visitas realizadas (pagas)</span><b>{ex.visitas.length} × {fmtMoeda(cfg.pagamentoVisita)}</b></div>
            <div><span>Pagamento por visitas</span><b>{fmtMoeda(ex.pagamentoVisitas)}</b></div>
            <div><span>Vendas efetivadas</span><b>{ex.vendas.length}</b></div>
            <div><span>Total vendido</span><b>{fmtMoeda(ex.totalVendido)}</b></div>
            <div><span>Comissão ({pct}%)</span><b>{fmtMoeda(ex.comissao)}</b></div>
            <div className="ok"><span>Valor a receber</span><b>{fmtMoeda(ex.total)}</b></div>
            {aConf.length > 0 && <div className="pend"><span>⏳ Vendas aguardando confirmação</span><b>{aConf.length}</b></div>}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 8 }}>A comissão entra quando a venda é confirmada (efetivada). Visita paga = visita realizada com o cliente agendado na loja.</div>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => irPara("financeiro")}>Ver extrato completo ›</button>
        </div>
      </div>
    </div>
  );
}
