// App do celular — Gestão / Supervisões: painel completo (Marketing primeiro, Call center depois),
// equipe (consultores, vendedores, operadoras, setores), fila de ação e busca de clientes.
import { useEffect, useRef, useState } from "react";
import { A } from "../lib/acoes";
import { useApp } from "../estado";
import { STATUS, STATUS_CLIENTE, fmtDate, fmtMoeda, hojeISO, isoLocal, parseData, parseMoeda, vendaContaComissao, vendaContaVolume } from "../lib/regras";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const dia = (v: any) => String(v || "").slice(0, 10);
const addDias = (n: number) => { const d = parseData(hojeISO() + "T12:00"); d.setDate(d.getDate() + n); return isoLocal(d); };
const pc = (a: number, b: number) => b ? Math.round(a / b * 100) + "%" : "—";
const primeiro = (n: string) => (n || "").replace(/^(Consultora?|Vendedora?|Suporte)\s+—\s+/, "").split(" ")[0];

export type Per = "hoje" | "7" | "mes" | "ant";
export function periodo(p: Per) {
  const h = hojeISO(), d = parseData(h + "T12:00");
  if (p === "hoje") return { de: h, ate: h, nome: "hoje" };
  if (p === "7") return { de: addDias(-6), ate: h, nome: "últimos 7 dias" };
  if (p === "mes") return { de: h.slice(0, 8) + "01", ate: h, nome: MESES[d.getMonth()] + " (até hoje)" };
  const ini = new Date(d.getFullYear(), d.getMonth() - 1, 1), fim = new Date(d.getFullYear(), d.getMonth(), 0);
  return { de: isoLocal(ini), ate: isoLocal(fim), nome: MESES[ini.getMonth()] };
}
export function SelPer({ per, setPer }: { per: Per; setPer: (p: Per) => void }) {
  return <div className="mv-seg">{([["hoje", "Hoje"], ["7", "7 dias"], ["mes", "Este mês"], ["ant", "Mês anterior"]] as [Per, string][]).map(([k, l]) =>
    <button key={k} className={per === k ? "on" : ""} onClick={() => setPer(k)}>{l}</button>)}</div>;
}

// quais áreas a pessoa enxerga
export function areas(R: any, st: any) {
  const todos = st.chamados.filter(R.podeVer);
  const mkt = R.ehGestao() || R.temMarketing() || R.verTudo() || R.mySetores().includes("suporte_consultores") || todos.some((c: any) => R.domMarketing(c));
  const cc = todos.some((c: any) => !R.domMarketing(c));
  return { mkt, cc, todos };
}
function SelArea({ area, setArea, a }: any) {
  if (!(a.mkt && a.cc)) return null;
  return <div className="mv-area"><button className={area === "mkt" ? "on" : ""} onClick={() => setArea("mkt")}>📣 Marketing</button><button className={area === "cc" ? "on" : ""} onClick={() => setArea("cc")}>☎ Call center</button></div>;
}

// quem vê R$ das vendas da loja: Gestão e Gerente de Loja (o banco também só entrega o valor para eles)
export const veValorLoja = (R: any) => R.ehGestao() || R.mySetores().includes("gerente_loja");
const doMkt = (u: any) => !!u && (u.setores || []).some((x: string) => ["marketing_operadora", "marketing_supervisao"].includes(x));
const diaLocal = (v: any) => { const x = parseData(v); return isNaN(+x) ? "" : isoLocal(x); };
// produção e pagamento de cada pessoa do marketing no período (mesma regra da tela Produtividade)
export function useTimeMkt(P: { de: string; ate: string }, tick = 0) {
  const { R, st } = useApp() as any;
  const [metas, setMetas] = useState<any[]>([]);
  useEffect(() => { let v = true; A.listarMetasMkt(P.de, P.ate).then(m => { if (v) setMetas(m || []); }).catch(() => setMetas([])); return () => { v = false; }; }, [P.de, P.ate, tick]);
  const hoje = hojeISO(), valorVenda = Number((R.cfg() as any).valorVendaMkt ?? 10);
  const ops = st.usuarios.filter((u: any) => u.ativo && doMkt(u) && (u.setores || []).includes("marketing_operadora"));
  const linhas = ops.map((u: any) => {
    const l = st.chamados.filter((c: any) => R.domMarketing(c) && c.solicitanteId === u.id);
    const ag = l.filter((c: any) => { const d = diaLocal(c.criadoEm); return d >= P.de && d <= P.ate; });
    const porDia: Record<string, number> = {}; ag.forEach((c: any) => { const d = diaLocal(c.criadoEm); porDia[d] = (porDia[d] || 0) + 1; });
    const vendas = l.filter((c: any) => c.venda && c.venda.status === "efetivada" && (() => { const d = String(c.venda.dataVenda || c.venda.quando || "").slice(0, 10); return d >= P.de && d <= P.ate; })());
    const aConf = l.filter((c: any) => c.venda && ["registrada", "promissoria"].includes(c.venda.status));
    const dm = metas.filter((m: any) => m.dia <= hoje), bat = dm.filter((m: any) => (porDia[m.dia] || 0) >= m.meta);
    const bonus = bat.reduce((x: number, m: any) => x + Number(m.valor), 0);
    return { u, ag, mkt: ag.filter((c: any) => R.ehDireto(c)), ext: ag.filter((c: any) => !R.ehDireto(c)), vieram: ag.filter(R.compareceu), vendas, aConf,
      diasMeta: dm.length, batidos: bat.length, bonus, total: vendas.length * valorVenda + bonus, hojeFeitos: porDia[hoje] || 0 };
  }).sort((a: any, b: any) => b.vendas.length - a.vendas.length || b.ag.length - a.ag.length);
  const metaHoje = metas.find((m: any) => m.dia === hoje);
  return { linhas, valorVenda, metaHoje, metas };
}

// ----- blocos -----
function useLista() {
  const [sel, setSel] = useState<{ k: string; t: string; l: any[] } | null>(null);
  const abrirLista = (k: string, t: string, l: any[]) => setSel(sel && sel.k === k ? null : { k, t, l });
  return { sel, abrirLista, fechar: () => setSel(null) };
}
function Tile({ n, l, cor, lista, k, sel, sub }: any) {
  const clic = !!lista;
  return <button className={"mv-tile" + (typeof n === "string" ? " din" : "") + (clic ? " clic" : "") + (sel && sel.k === k ? " sel" : "")} onClick={clic ? lista : undefined}>
    <b style={cor ? { color: cor } : undefined}>{n}</b><span>{l}</span>{sub ? <small className="mv-tile-sub">{sub}</small> : null}</button>;
}
const Barra = ({ l, n, max, cor, extra }: any) => <div className="mv-barra"><span>{l}</span><i><em style={{ width: (max ? Math.min(100, n / max * 100) : 0) + "%", background: cor }}></em></i><b>{n}{extra}</b></div>;
export function ListaClientes({ sel, fechar }: any) {
  const { R, abrirDetalhe } = useApp() as any;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (sel && ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "start" }); }, [sel && sel.k]);
  if (!sel) return null;
  return <div className="mv-lista" ref={ref}>
    <div className="mv-sec">{sel.t} <i>{sel.l.length}</i><button className="mv-x" onClick={fechar}>fechar ✕</button></div>
    {sel.l.length ? sel.l.slice(0, 80).map((c: any) => <LinhaCliente key={c.id} c={c} abrir={() => abrirDetalhe(c.id)} R={R} />) : <div className="mv-vazio">Nenhum cliente.</div>}
    {sel.l.length > 80 && <div className="mv-mais">+{sel.l.length - 80} — use a busca ou a versão completa</div>}
  </div>;
}
function LinhaCliente({ c, abrir, R }: any) {
  const mk = R.domMarketing(c);
  const sc = mk ? R.statusClienteDe(c) : "";
  const p = R.prioridade(c);
  const cor = p === "critico" ? "var(--critico)" : p === "atrasado" ? "var(--danger)" : p === "urgente" ? "var(--warn)" : undefined;
  const info = mk
    ? [c.dataLoja ? "loja " + fmtDate(c.dataLoja).slice(0, 5) + " " + String(c.dataLoja).slice(11, 16) : c.dataVisita ? "visita " + fmtDate(c.dataVisita).slice(0, 5) : "",
       c.consultorId ? "cons. " + primeiro(R.nomeUser(c.consultorId)) : R.ehDireto(c) ? "direto loja" : "",
       c.atendenteId ? "vend. " + primeiro(R.nomeUser(c.atendenteId)) : c.dataLoja ? "sem vendedor" : "",
       c.venda && R.podeVerValor(c) && c.venda.valor ? fmtMoeda(parseMoeda(c.venda.valor)) : ""].filter(Boolean).join(" · ")
    : [c.id, R.setorNome(c.setorDestino), R.tipoNome(c.tipo)].join(" · ");
  return <button className="mv-linha" onClick={abrir} style={cor ? { borderLeftColor: cor } : undefined}>
    <b>{c.cliente}{mk && R.semAnexo(c) ? " ⚠️" : ""}<em className={mk ? "sc sc-" + sc : "st-mini st-" + c.status}>{mk ? (STATUS_CLIENTE[sc] || "—") : (STATUS[c.status]?.label || c.status)}</em></b>
    <span>{info || "—"}</span></button>;
}

// ================= RESUMO =================
function buscar(todos: any[], q: string) {
  const t = q.trim().toLowerCase(), dg = t.replace(/\D/g, "");
  if (t.length < 2) return [];
  return todos.filter((c: any) => (c.cliente + " " + c.id + " " + (c.produto || "") + " " + (c.venda?.numero || "")).toLowerCase().includes(t) || (dg.length >= 3 && String(c.telefone || "").replace(/\D/g, "").includes(dg))).slice(0, 60);
}
export function GestResumo() {
  const { R, st, abrirDetalhe } = useApp() as any;
  const a = areas(R, st);
  const [area, setArea] = useState<"mkt" | "cc">(a.mkt ? "mkt" : "cc");
  const [per, setPer] = useState<Per>("mes");
  const L = useLista();
  const P = periodo(per);
  const noPer = (v: any) => !!v && R.dentroPeriodo(v, P.de, P.ate);
  const [q, setQ] = useState("");
  const achados = buscar(a.todos, q);
  return <>
    <input className="mv-busca" type="search" placeholder="🔎 Consultar cliente: nome, telefone, nº…" value={q} onChange={e => setQ(e.target.value)} />
    {q.trim().length >= 2 ? <><div className="mv-sec">Resultado <i>{achados.length}</i></div>{achados.length ? achados.map((c: any) => <LinhaCliente key={c.id} c={c} R={R} abrir={() => abrirDetalhe(c.id)} />) : <div className="mv-vazio">Nenhum cliente encontrado.</div>}</> : <>
    <SelArea area={area} setArea={(x: any) => { setArea(x); L.fechar(); }} a={a} />
    <SelPer per={per} setPer={p => { setPer(p); L.fechar(); }} />
    {area === "mkt" ? <ResMkt todos={a.todos} noPer={noPer} P={P} L={L} /> : <ResCC todos={a.todos} noPer={noPer} P={P} L={L} />}
    <ListaClientes sel={L.sel} fechar={L.fechar} />
    {!L.sel && <div className="mv-dica" style={{ marginTop: 10 }}>Toque nos quadros com “ver lista” para ver os clientes e abrir a ficha.</div>}
    </>}
  </>;
}

function ResMkt({ todos, noPer, P, L }: any) {
  const { R } = useApp() as any;
  const hoje = hojeISO(), amanha = addDias(1);
  const mk = todos.filter((c: any) => R.domMarketing(c));
  const T = (k: string, n: any, l: string, lista?: any[], cor?: string, sub?: string) => <Tile k={k} n={n} l={l} cor={cor} sub={sub} sel={L.sel} lista={lista ? () => L.abrirLista(k, l, lista) : undefined} />;
  // vendas
  const vendas = mk.filter((c: any) => vendaContaVolume(c.venda) && noPer(c.venda.dataVenda || c.venda.quando));
  const efet = vendas.filter((c: any) => vendaContaComissao(c.venda));
  const aConf = mk.filter((c: any) => c.venda && c.venda.status === "registrada");
  const veValor = veValorLoja(R);
  const valor = vendas.reduce((s: number, c: any) => s + parseMoeda(c.venda.valor), 0);
  const vDir = vendas.filter((c: any) => R.ehDireto(c)), vExt = vendas.filter((c: any) => !R.ehDireto(c));
  const soma = (l: any[]) => l.reduce((s: number, c: any) => s + parseMoeda(c.venda.valor), 0);
  // entrada
  const novos = mk.filter((c: any) => noPer(c.criadoEm));
  const novosDir = novos.filter((c: any) => R.ehDireto(c)), novosExt = novos.filter((c: any) => !R.ehDireto(c));
  // funil de visitas (consultor externo)
  const vis = mk.filter((c: any) => !R.ehDireto(c) && c.consultorId && noPer(R.ancoraVisita(c)));
  const F = R.funil(vis);
  // loja no período
  const naLoja = mk.filter((c: any) => noPer(c.dataLoja));
  const vieram = naLoja.filter(R.compareceu), faltaram = naLoja.filter((c: any) => R.statusClienteDe(c) === "nao_compareceu");
  const orc = mk.filter((c: any) => ["orcamento", "sem_resposta", "reagendado"].includes(R.statusClienteDe(c)) && !c.venda);
  const perdidos = mk.filter((c: any) => ["reprovado", "venda_cancelada"].includes(R.statusClienteDe(c)) && noPer(c.dataLoja || c.criadoEm));
  // operação agora (não depende do período)
  const lojaHoje = mk.filter((c: any) => dia(c.dataLoja) === hoje), lojaAmanha = mk.filter((c: any) => dia(c.dataLoja) === amanha);
  const semVend = mk.filter((c: any) => c.dataLoja && dia(c.dataLoja) >= hoje && !c.atendenteId && !c.venda);
  const pedidos = mk.filter((c: any) => !c.atendenteId && c.tratativa && c.tratativa.pedidoAtend);
  const semParecer = mk.filter((c: any) => R.semParecer(c));
  const cobrados = mk.filter((c: any) => R.parecerCobrado(c));
  const semAnexo = mk.filter((c: any) => R.semAnexo(c) && !c.venda && R.emAberto(c));
  const visAtras = mk.filter((c: any) => c.setorDestino === "consultor_externo" && !(c.tratativa && c.tratativa.realizada) && c.dataVisita && dia(c.dataVisita) < hoje);
  const semCons = mk.filter((c: any) => !R.ehDireto(c) && !c.consultorId && R.emAberto(c) && !c.dataLoja);
  const parados = mk.filter((c: any) => R.emAberto(c) && R.clienteCriticoInatividade(c));
  return <>
    {/* principais números do marketing: agendamentos (marketing e externos), vindas na loja e vendas */}
    <div className="mv-receber mk"><span>Agendamentos · {P.nome}</span><b>{novos.length}</b>
      <small><b>{novosDir.length}</b> marketing (direto na loja) · <b>{novosExt.length}</b> externos (consultor)</small></div>
    <div className="mv-tiles c3">
      {T("nd", novosDir.length, "Agend. marketing", novosDir)}{T("ne", novosExt.length, "Agend. externos", novosExt)}{T("vr0", vieram.length, "Vieram na loja", vieram, "var(--warn)")}
      {T("vendas", vendas.length, "Vendas", vendas, "var(--st-concluida)")}{T("vdir", vDir.length, "Vendas marketing", vDir)}{T("vext", vExt.length, "Vendas externos", vExt)}
    </div>
    <div className="mv-taxas" style={{ margin: "2px 2px 10px" }}><span>Presença na loja <b>{pc(vieram.length, vieram.length + faltaram.length)}</b></span><span>Agendamento→venda <b>{pc(vendas.length, novos.length)}</b></span><span>Veio→comprou <b>{pc(vendas.length, vieram.length)}</b></span>{aConf.length ? <span>A confirmar <b style={{ color: "var(--warn)" }}>{aConf.length}</b></span> : null}</div>
    {veValor && <div className="mv-valor" onClick={() => L.abrirLista("vendasv", "Vendas do período", vendas)}><span>Valor vendido ({P.nome})<br /><small>{vendas.length ? "ticket médio " + fmtMoeda(valor / vendas.length) + " · " : ""}mkt {fmtMoeda(soma(vDir))} · externos {fmtMoeda(soma(vExt))}</small></span><b>{fmtMoeda(valor)}</b></div>}

    <TimeMkt P={P} L={L} />

    <div className="mv-sec">⚡ Agora — precisa de atenção</div>
    <div className="mv-tiles c3">
      {T("lh", lojaHoje.length, "Na loja hoje", lojaHoje)}{T("la", lojaAmanha.length, "Na loja amanhã", lojaAmanha)}
      {T("sv", semVend.length, "Sem vendedor (fila)", semVend, semVend.length ? "var(--warn)" : undefined)}{T("pd", pedidos.length, "Pedidos de atendimento", pedidos, pedidos.length ? "var(--primary)" : undefined)}
      {T("sp", semParecer.length, "Sem parecer do vendedor", semParecer, semParecer.length ? "var(--danger)" : undefined)}{T("cb", cobrados.length, "Parecer cobrado", cobrados, cobrados.length ? "var(--critico)" : undefined)}
      {T("va", visAtras.length, "Visitas atrasadas", visAtras, visAtras.length ? "var(--danger)" : undefined)}{T("sa", semAnexo.length, "Sem anexo", semAnexo, semAnexo.length ? "#b07a00" : undefined)}
      {T("sc", semCons.length, "Sem consultor definido", semCons, semCons.length ? "var(--warn)" : undefined)}{T("pa", parados.length, "Parados +24h", parados, parados.length ? "var(--critico)" : undefined)}
    </div>

    <div className="mv-sec">Entrada de clientes · {P.nome}</div>
    <div className="mv-tiles">
      {T("nv", novos.length, "Clientes novos", novos)}{T("or", orc.length, "Orçamentos em aberto", orc, orc.length ? "var(--warn)" : undefined)}
    </div>

    <div className="mv-sec">Consultor externo: visita → loja → venda</div>
    <div className="mv-funil" onClick={() => L.abrirLista("fv", "Clientes dos consultores no período", vis)}>
      <Barra l="Clientes" n={F.total} max={F.total} cor="var(--primary)" /><Barra l="Visitados" n={F.realizadas} max={F.total} cor="var(--st-respondida)" />
      <Barra l="Agend. loja" n={F.agendadas} max={F.total} cor="var(--st-tratativa)" /><Barra l="Vieram" n={F.vieram} max={F.total} cor="var(--warn)" />
      <Barra l="Vendas" n={F.vendas} max={F.total} cor="var(--st-concluida)" />
      <div className="mv-taxas"><span>Presença <b>{F.pPresenca === null ? "—" : F.pPresenca + "%"}</b></span><span>Visita→venda <b>{F.pVisitaVenda === null ? "—" : F.pVisitaVenda + "%"}</b></span><span>Loja→venda <b>{F.pLojaVenda === null ? "—" : F.pLojaVenda + "%"}</b></span></div>
    </div>

    <div className="mv-sec">Loja · {P.nome}</div>
    <div className="mv-tiles">
      {T("nl", naLoja.length, "Agendados na loja", naLoja)}{T("vr", vieram.length, "Vieram", vieram, undefined, "presença " + pc(vieram.length, vieram.length + faltaram.length))}
      {T("fl", faltaram.length, "Não compareceram", faltaram, faltaram.length ? "var(--danger)" : undefined)}{T("pe", perdidos.length, "Perdidos / cancelados", perdidos, perdidos.length ? "var(--danger)" : undefined)}
    </div>
  </>;
}

// vendas por pessoa do marketing (controle e comissão delas)
function TimeMkt({ P, L }: any) {
  const T = useTimeMkt(P);
  if (!T.linhas.length) return null;
  const tot = T.linhas.reduce((x: number, l: any) => x + l.total, 0);
  return <>
    <div className="mv-sec">Time do marketing · {P.nome}{T.metaHoje ? <small style={{ textTransform: "none", fontWeight: 500 }}> · meta hoje {T.metaHoje.meta}</small> : null}</div>
    {T.linhas.map((x: any, i: number) => <div key={x.u.id} className="mv-pessoa">
      <button className="mv-pessoa-h" onClick={() => L.abrirLista("op" + x.u.id, primeiro(x.u.nome) + " — agendamentos", x.ag)}><span className="pos">{i + 1}</span><b>{x.u.nome}</b><em>{fmtMoeda(x.total)}</em></button>
      <div className="mv-pessoa-n">
        <div><b>{x.ag.length}</b><span>Agendou</span></div><div><b>{x.vieram.length}</b><span>Vieram</span></div>
        <div onClick={() => L.abrirLista("opv" + x.u.id, primeiro(x.u.nome) + " — vendas", x.vendas)}><b style={{ color: "var(--st-concluida)" }}>{x.vendas.length}</b><span>Vendas</span></div>
        <div><b>{x.batidos}/{x.diasMeta}</b><span>Metas</span></div></div>
      <div className="mv-pessoa-rod">{x.mkt.length} marketing · {x.ext.length} externos{T.metaHoje ? " · hoje " + x.hojeFeitos + "/" + T.metaHoje.meta : ""}{x.aConf.length ? " · " + x.aConf.length + " venda(s) a confirmar" : ""} · {x.vendas.length}×{fmtMoeda(T.valorVenda)}{x.bonus ? " + bônus " + fmtMoeda(x.bonus) : ""}</div>
    </div>)}
    <div className="mv-dica">Total a pagar ao time no período: <b>{fmtMoeda(tot)}</b> (vendas efetivadas × {fmtMoeda(T.valorVenda)} + bônus de meta). Aprovação na aba <b>Time</b>.</div>
  </>;
}

function ResCC({ todos, noPer, P, L }: any) {
  const { R, st } = useApp() as any;
  const cc = todos.filter((c: any) => !R.domMarketing(c));
  const pr = (c: any) => R.prioridade(c);
  const T = (k: string, n: any, l: string, lista?: any[], cor?: string, sub?: string) => <Tile k={k} n={n} l={l} cor={cor} sub={sub} sel={L.sel} lista={lista ? () => L.abrirLista(k, l, R.ordenar(lista)) : undefined} />;
  const concluidoEm = (c: any) => { const h = (c.historico || []).filter((x: any) => String(x.texto).startsWith("Status → Concluída")); return h.length ? h[h.length - 1].quando : c.criadoEm; };
  const abertos = cc.filter((c: any) => c.status !== "concluida");
  const crit = cc.filter((c: any) => pr(c) === "critico"), atr = cc.filter((c: any) => pr(c) === "atrasado"), urg = cc.filter((c: any) => pr(c) === "urgente");
  const perto = cc.filter((c: any) => pr(c) === "perto"), inf = cc.filter((c: any) => c.status === "informar"), resp = cc.filter((c: any) => c.status === "respondida");
  const novos = cc.filter((c: any) => noPer(c.criadoEm)), conc = cc.filter((c: any) => c.status === "concluida" && noPer(concluidoEm(c)));
  const transf = cc.filter((c: any) => c.transferencia && c.transferencia.status === "pendente");
  const noPrazo = abertos.filter((c: any) => !["critico", "atrasado"].includes(pr(c)));
  // tempo médio de conclusão (dias) no período
  const tempos = conc.map((c: any) => (+parseData(concluidoEm(c)) - +parseData(c.criadoEm)) / 864e5).filter((x: number) => x >= 0);
  const tm = tempos.length ? (tempos.reduce((s: number, x: number) => s + x, 0) / tempos.length) : null;
  // por setor
  const setores = st.setores.filter((s: any) => cc.some((c: any) => c.setorDestino === s.id));
  const porSetor = setores.map((s: any) => { const l = abertos.filter((c: any) => c.setorDestino === s.id); return { s, l, at: l.filter((c: any) => ["critico", "atrasado"].includes(pr(c))) }; }).filter((x: any) => x.l.length).sort((a: any, b: any) => b.at.length - a.at.length || b.l.length - a.l.length);
  const maxS = Math.max(1, ...porSetor.map((x: any) => x.l.length));
  // por tipo (novos no período)
  const porTipo: Record<string, any[]> = {}; novos.forEach((c: any) => (porTipo[c.tipo] = porTipo[c.tipo] || []).push(c));
  const tipos = Object.entries(porTipo).sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  const maxT = Math.max(1, ...tipos.map(x => x[1].length));
  return <>
    <div className="mv-receber cc"><span>Call center e pós-venda · agora</span><b>{abertos.length} em aberto</b>
      <small>{crit.length + atr.length} fora do prazo · {pc(noPrazo.length, abertos.length)} no prazo</small></div>
    <div className="mv-tiles">
      {T("cr", crit.length, "Críticos (+24h)", crit, "var(--critico)")}{T("at", atr.length, "Atrasados", atr, "var(--danger)")}
      {T("ur", urg.length, "Urgentes", urg, "var(--warn)")}{T("pt", perto.length, "Vencem em 24h", perto, perto.length ? "#b07a00" : undefined)}
      {T("in", inf.length, "Informar cliente", inf, "var(--st-informar)")}{T("rp", resp.length, "Respondidas (revisar)", resp, "var(--st-respondida)")}
      {T("tr", transf.length, "Transferências pendentes", transf, transf.length ? "var(--warn)" : undefined)}{T("ab", abertos.length, "Todos em aberto", abertos)}
    </div>
    <div className="mv-sec">Movimento · {P.nome}</div>
    <div className="mv-tiles">
      {T("nv", novos.length, "Abertos no período", novos)}{T("cc", conc.length, "Concluídos no período", conc, "var(--st-concluida)")}
      <Tile n={tm === null ? "—" : tm.toFixed(1).replace(".", ",") + " dias"} l="Tempo médio p/ concluir" />
      <Tile n={pc(conc.length, novos.length)} l="Concluídos / abertos" />
    </div>
    <div className="mv-sec">Em aberto por setor <small style={{ textTransform: "none", fontWeight: 500 }}>(vermelho = fora do prazo)</small></div>
    <div className="mv-funil">
      {porSetor.length ? porSetor.map((x: any) => <div key={x.s.id} onClick={() => L.abrirLista("s" + x.s.id, x.s.nome, R.ordenar(x.l))} style={{ cursor: "pointer" }}>
        <Barra l={x.s.nome} n={x.l.length} max={maxS} cor={x.at.length ? "var(--danger)" : "var(--primary)"} extra={x.at.length ? <small style={{ color: "var(--danger)" }}> · {x.at.length}</small> : null} /></div>) : <div className="mv-vazio">Nada em aberto. 👍</div>}
    </div>
    {tipos.length > 0 && <><div className="mv-sec">Assuntos mais abertos · {P.nome}</div>
      <div className="mv-funil">{tipos.map(([k, l]) => <div key={k} onClick={() => L.abrirLista("t" + k, R.tipoNome(k), R.ordenar(l))} style={{ cursor: "pointer" }}><Barra l={R.tipoNome(k)} n={l.length} max={maxT} cor="var(--st-tratativa)" /></div>)}</div></>}
  </>;
}

// ================= EQUIPE =================
export function GestEquipe({ irTime }: { irTime?: () => void }) {
  const { R, st } = useApp() as any;
  const a = areas(R, st);
  const [area, setArea] = useState<"mkt" | "cc">(a.mkt ? "mkt" : "cc");
  const [per, setPer] = useState<Per>("mes");
  const [grupo, setGrupo] = useState<"cons" | "vend" | "op">(R.ehGestao() ? "cons" : "op");
  const [aberto, setAberto] = useState("");
  const L = useLista();
  const P = periodo(per);
  const noPer = (v: any) => !!v && R.dentroPeriodo(v, P.de, P.ate);
  const mk = a.todos.filter((c: any) => R.domMarketing(c));
  const veValor = veValorLoja(R);
  const V = (n: number) => veValor ? fmtMoeda(n) : "—";
  const TM = useTimeMkt(P);
  const soma = (l: any[]) => l.reduce((s: number, c: any) => s + parseMoeda(c.venda.valor), 0);
  let linhas: any[] = [];
  if (area === "mkt" && grupo === "cons") {
    linhas = R.consultores().map((u: any) => {
      const l = R.clientesConsultor(u.id, P.de, P.ate), F = R.funil(l), ex = R.extratoConsultor(u.id, P.de, P.ate);
      const pend = mk.filter((c: any) => c.consultorId === u.id && c.setorDestino === "consultor_externo" && !(c.tratativa && c.tratativa.realizada));
      return { u, l, chave: F.valor * 1000 + F.vendas, nums: [["Clientes", F.total], ["Visitados", F.realizadas], ["Na loja", F.agendadas], ["Vendas", F.vendas]],
        dest: veValor ? V(F.valor) : F.vendas + " venda(s)", extra: [["Visita→venda", F.pVisitaVenda === null ? "—" : F.pVisitaVenda + "%"], ...(veValor ? [["A receber", V(ex.total)]] : []), ["Visitas a fazer", pend.length]], listas: [["Clientes do período", l], ["Visitas a fazer", pend]] };
    });
  } else if (area === "mkt" && grupo === "vend") {
    linhas = R.projetistas().map((u: any) => {
      const meus = mk.filter((c: any) => c.atendenteId === u.id);
      const ag = meus.filter((c: any) => noPer(c.dataLoja)), vi = ag.filter(R.compareceu);
      const vd = meus.filter((c: any) => vendaContaVolume(c.venda) && noPer(c.venda.dataVenda || c.venda.quando));
      const sp = meus.filter((c: any) => R.semParecer(c) || R.parecerCobrado(c));
      const orc = meus.filter((c: any) => ["orcamento", "sem_resposta", "reagendado"].includes(R.statusClienteDe(c)) && !c.venda);
      return { u, l: ag, chave: soma(vd), nums: [["Agendados", ag.length], ["Vieram", vi.length], ["Vendas", vd.length], ["Sem parecer", sp.length]],
        dest: veValor ? V(soma(vd)) : vd.length + " venda(s)", extra: [["Conversão", pc(vd.length, vi.length)], ...(veValor ? [["Ticket médio", vd.length ? V(soma(vd) / vd.length) : "—"]] : []), ["Orçamentos", orc.length]], listas: [["Agendados no período", ag], ["Vendas", vd], ["Sem parecer", sp], ["Orçamentos em aberto", orc]] };
    });
  } else if (area === "mkt") {
    linhas = TM.linhas.map((x: any) => ({ u: x.u, l: x.ag, chave: x.total * 1000 + x.ag.length,
      nums: [["Agendou", x.ag.length], ["Vieram", x.vieram.length], ["Vendas", x.vendas.length], ["Metas", x.batidos + "/" + x.diasMeta]],
      dest: fmtMoeda(x.total), extra: [["Marketing", x.mkt.length], ["Externos", x.ext.length], ["Agend.→venda", pc(x.vendas.length, x.ag.length)], ["Vendas × " + fmtMoeda(TM.valorVenda), fmtMoeda(x.vendas.length * TM.valorVenda)], ["Bônus", fmtMoeda(x.bonus)], ["A confirmar", x.aConf.length]],
      listas: [["Agendamentos", x.ag], ["Vieram", x.vieram], ["Vendas", x.vendas], ["Vendas a confirmar", x.aConf]] }));
  } else {
    // call center: por setor e por atendente
    const cc = a.todos.filter((c: any) => !R.domMarketing(c));
    const porU: Record<string, any[]> = {}; cc.filter((c: any) => noPer(c.criadoEm)).forEach((c: any) => (porU[c.solicitanteId] = porU[c.solicitanteId] || []).push(c));
    linhas = Object.entries(porU).map(([uid, l]) => {
      const ab = l.filter((c: any) => c.status !== "concluida"), fora = ab.filter((c: any) => ["critico", "atrasado"].includes(R.prioridade(c)));
      return { u: { id: uid, nome: R.nomeUser(uid) }, l, chave: l.length, nums: [["Abertos", l.length], ["Em andamento", ab.length], ["Concluídos", l.length - ab.length], ["Fora do prazo", fora.length]],
        dest: l.length + " chamado(s)", extra: [["Resolvidos", pc(l.length - ab.length, l.length)]], listas: [["Chamados do período", R.ordenar(l)], ["Fora do prazo", R.ordenar(fora)]] };
    });
  }
  linhas.sort((x, y) => y.chave - x.chave);
  return <>
    <SelArea area={area} setArea={(x: any) => { setArea(x); setAberto(""); L.fechar(); }} a={a} />
    <SelPer per={per} setPer={p => { setPer(p); L.fechar(); }} />
    {area === "mkt" && <div className="mv-seg">{((R.ehGestao() ? [["cons", "Consultores"], ["vend", "Vendedores"], ["op", "Time marketing"]] : [["op", "Time marketing"], ["cons", "Consultores"], ["vend", "Vendedores"]]) as any[]).map(([k, l]) =>
      <button key={k} className={grupo === k ? "on" : ""} onClick={() => { setGrupo(k); setAberto(""); L.fechar(); }}>{l}</button>)}</div>}
    {area === "mkt" && grupo === "op" && irTime && <button className="mv-principal" style={{ marginBottom: 10 }} onClick={irTime}>🎯 Metas do dia e aprovação de pagamento</button>}
    {area === "cc" && <div className="mv-sec">Chamados abertos por atendente · {P.nome}</div>}
    {linhas.length ? linhas.map((x, i) => <div key={x.u.id} className={"mv-pessoa" + (aberto === x.u.id ? " on" : "")}>
      <button className="mv-pessoa-h" onClick={() => { setAberto(aberto === x.u.id ? "" : x.u.id); L.fechar(); }}>
        <span className="pos">{i + 1}</span><b>{x.u.nome}</b><em>{x.dest}</em></button>
      <div className="mv-pessoa-n">{x.nums.map(([l, n]: any) => <div key={l}><b>{n}</b><span>{l}</span></div>)}</div>
      {aberto === x.u.id && <div className="mv-pessoa-x">
        <div className="mv-taxas">{x.extra.map(([l, n]: any) => <span key={l}>{l} <b>{n}</b></span>)}</div>
        <div className="mv-pessoa-b">{x.listas.map(([l, arr]: any) => <button key={l} className={"btn sm" + (L.sel && L.sel.k === x.u.id + l ? " primary" : "")} onClick={() => L.abrirLista(x.u.id + l, primeiro(x.u.nome) + " — " + l, arr)}>{l} ({arr.length})</button>)}</div>
        {L.sel && L.sel.k.startsWith(x.u.id) && <ListaClientes sel={L.sel} fechar={L.fechar} />}
      </div>}
    </div>) : <div className="mv-vazio">Ninguém com movimento no período.</div>}
    <div className="mv-dica" style={{ marginTop: 10 }}>Toque no nome para ver mais números e as listas de clientes.</div>
  </>;
}

// ================= AÇÃO =================
export function GestAcao() {
  const { R, st, abrirDetalhe } = useApp() as any;
  const a = areas(R, st);
  const [area, setArea] = useState<"mkt" | "cc">(a.mkt ? "mkt" : "cc");
  const [q, setQ] = useState("");
  const L = useLista();
  const hoje = hojeISO();
  const pend = R.minhasPendencias();
  const grupos = pend.grupos.filter((g: any) => g.itens.some((c: any) => area === "mkt" ? R.domMarketing(c) : !R.domMarketing(c)))
    .map((g: any) => ({ ...g, itens: g.itens.filter((c: any) => area === "mkt" ? R.domMarketing(c) : !R.domMarketing(c)) }));
  const t = q.trim().toLowerCase(), dg = t.replace(/\D/g, "");
  const achados = t.length >= 2 ? a.todos.filter((c: any) => (c.cliente + " " + c.id + " " + (c.produto || "") + " " + (c.venda?.numero || "")).toLowerCase().includes(t) || (dg.length >= 3 && String(c.telefone || "").replace(/\D/g, "").includes(dg))).slice(0, 60) : [];
  const base = a.todos.filter((c: any) => area === "mkt" ? R.domMarketing(c) : !R.domMarketing(c));
  const urg = area === "mkt"
    ? base.filter((c: any) => R.emAberto(c) && (R.clienteCriticoInatividade(c) || (c.dataLoja && dia(c.dataLoja) >= hoje && !c.atendenteId) || R.semParecer(c)))
    : base.filter((c: any) => ["critico", "atrasado", "urgente"].includes(R.prioridade(c)));
  return <>
    <input className="mv-busca" type="search" placeholder="🔎 Consultar cliente: nome, telefone, nº, venda…" value={q} onChange={e => setQ(e.target.value)} />
    {t.length >= 2 ? <><div className="mv-sec">Resultado <i>{achados.length}</i></div>{achados.length ? achados.map((c: any) => <LinhaCliente key={c.id} c={c} R={R} abrir={() => abrirDetalhe(c.id)} />) : <div className="mv-vazio">Nenhum cliente encontrado.</div>}</> : <>
      <SelArea area={area} setArea={(x: any) => { setArea(x); L.fechar(); }} a={a} />
      {grupos.map((g: any) => <div key={g.chave} className="mv-grupo">
        <button className="mv-grupo-h" onClick={() => L.abrirLista(g.chave, g.titulo, g.itens)} style={{ borderLeftColor: g.cor }}><b>{g.titulo}</b><i style={{ background: g.cor }}>{g.itens.length}</i></button>
        {L.sel && L.sel.k === g.chave && <ListaClientes sel={L.sel} fechar={L.fechar} />}</div>)}
      <div className="mv-grupo"><button className="mv-grupo-h" onClick={() => L.abrirLista("urg", area === "mkt" ? "Clientes que precisam de ação" : "Críticos, atrasados e urgentes", R.ordenar(urg))} style={{ borderLeftColor: "var(--danger)" }}>
        <b>{area === "mkt" ? "Clientes que precisam de ação" : "Críticos, atrasados e urgentes"}</b><i style={{ background: "var(--danger)" }}>{urg.length}</i></button>
        {L.sel && L.sel.k === "urg" && <ListaClientes sel={L.sel} fechar={L.fechar} />}</div>
      {!grupos.length && !urg.length && <div className="mv-vazio">Tudo sob controle. 👍</div>}
    </>}
  </>;
}

// ================= TIME DO MARKETING (metas do dia + aprovação do pagamento) =================
export function GestTime({ voltar }: { voltar?: () => void }) {
  const { R, executar: ex, toast } = useApp() as any;
  const hoje = hojeISO();
  const [off, setOff] = useState(0);
  const d0 = parseData(hoje + "T12:00"), ini = new Date(d0.getFullYear(), d0.getMonth() - off, 1), fim = new Date(d0.getFullYear(), d0.getMonth() - off + 1, 0);
  const P = { de: isoLocal(ini), ate: isoLocal(fim), nome: MESES[ini.getMonth()] };
  const [tick, setTick] = useState(0);
  const T = useTimeMkt(P, tick);
  const [pags, setPags] = useState<any[]>([]);
  useEffect(() => { A.listarPagamentosMkt(P.de, P.ate).then(setPags).catch(() => setPags([])); }, [P.de, tick]);
  const [f, setF] = useState({ dia: hoje, meta: "", valor: "100" });
  const recarregar = () => setTick(t => t + 1);
  const salvar = () => {
    const m = parseInt(f.meta), v = parseFloat(String(f.valor).replace(",", "."));
    if (!m || m <= 0) { toast("Informe a meta de agendamentos"); return; } if (isNaN(v) || v < 0) { toast("Informe o valor do bônus"); return; }
    ex(() => A.salvarMetaMkt(f.dia, m, v, ""), "Meta salva").then((ok: boolean) => { if (ok) { setF({ ...f, meta: "" }); recarregar(); } });
  };
  const gere = R.ehGestao() || R.mySetores().includes("marketing_supervisao");
  const totPagar = T.linhas.reduce((x: number, l: any) => x + l.total, 0);
  const totAprov = T.linhas.reduce((x: number, l: any) => { const p = pags.find((y: any) => y.operadora_id === l.u.id); return x + (p ? Number(p.total) : 0); }, 0);
  const proximas = T.metas.filter((m: any) => m.dia >= hoje).slice(0, 7);
  return <>
    {voltar && <button className="mv-voltar" onClick={voltar}>‹ Voltar</button>}
    <div className="mv-seg">{[0, 1, 2].map(o => <button key={o} className={off === o ? "on" : ""} onClick={() => setOff(o)}>{o === 0 ? "Este mês" : MESES[new Date(d0.getFullYear(), d0.getMonth() - o, 1).getMonth()]}</button>)}</div>

    {off === 0 && <>
      <div className="mv-receber mk"><span>Hoje · {fmtDate(hoje)}</span><b>{T.metaHoje ? "Meta " + T.metaHoje.meta : "Sem meta hoje"}</b>
        <small>{T.metaHoje ? "Bônus " + fmtMoeda(Number(T.metaHoje.valor)) + " para quem bater" : "Defina abaixo a meta e o bônus do dia"}</small></div>
      {T.linhas.map((x: any) => { const meta = T.metaHoje ? T.metaHoje.meta : 0; const ok = meta && x.hojeFeitos >= meta; return (
        <div key={x.u.id} className="mv-barra" style={{ padding: "6px 2px" }}><span>{primeiro(x.u.nome)}</span>
          <i><em style={{ width: (meta ? Math.min(100, x.hojeFeitos / meta * 100) : x.hojeFeitos ? 100 : 0) + "%", background: ok ? "var(--st-concluida)" : "var(--primary)" }}></em></i>
          <b>{x.hojeFeitos}{meta ? "/" + meta : ""}{ok ? " ✓" : ""}</b></div>); })}
      {gere && <div className="mv-bloco">
        <div className="mv-bloco-t">🎯 Definir meta do dia</div>
        <div className="mv-form3">
          <label>Dia<input type="date" value={f.dia} onChange={e => setF({ ...f, dia: e.target.value })} /></label>
          <label>Meta (agend.)<input inputMode="numeric" value={f.meta} onChange={e => setF({ ...f, meta: e.target.value.replace(/\D/g, "") })} placeholder="ex.: 10" /></label>
          <label>Bônus R$<input inputMode="decimal" value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} /></label>
        </div>
        <button className="mv-principal" onClick={salvar}>Salvar meta</button>
        {proximas.length > 0 && <div className="mv-metas">{proximas.map((m: any) => <div key={m.dia}><b>{fmtDate(m.dia).slice(0, 5)}</b> meta {m.meta} · bônus {fmtMoeda(Number(m.valor))}
          <button onClick={() => ex(() => A.removerMetaMkt(m.dia), "Meta removida").then((ok: boolean) => ok && recarregar())}>remover</button></div>)}</div>}
        <div className="mv-dica" style={{ marginTop: 8 }}>Dia sem meta = sem bônus. A meta vale para cada operadora individualmente.</div>
      </div>}
    </>}

    <div className="mv-sec">Pagamento · {P.nome}</div>
    <div className="mv-tiles">
      <Tile n={fmtMoeda(totPagar)} l="Total calculado" /><Tile n={fmtMoeda(totAprov)} l="Já aprovado" cor={totAprov ? "var(--st-concluida)" : undefined} />
    </div>
    {T.linhas.map((x: any) => { const pag = pags.find((y: any) => y.operadora_id === x.u.id); const mudou = pag && Number(pag.total) !== x.total; return (
      <div key={x.u.id} className="mv-pessoa">
        <div className="mv-pessoa-h"><b>{x.u.nome}</b><em>{fmtMoeda(x.total)}</em></div>
        <div className="mv-pessoa-n"><div><b>{x.ag.length}</b><span>Agendou</span></div><div><b>{x.vieram.length}</b><span>Vieram</span></div>
          <div><b style={{ color: "var(--st-concluida)" }}>{x.vendas.length}</b><span>Vendas</span></div><div><b>{x.batidos}/{x.diasMeta}</b><span>Metas</span></div></div>
        <div className="mv-pessoa-rod">{x.vendas.length} × {fmtMoeda(T.valorVenda)} = {fmtMoeda(x.vendas.length * T.valorVenda)} · bônus {fmtMoeda(x.bonus)}{x.aConf.length ? " · " + x.aConf.length + " venda(s) a confirmar (entram depois)" : ""}</div>
        <div className="mv-pessoa-x" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {pag ? <span className="badge b-concluida">Aprovado {fmtMoeda(Number(pag.total))}</span> : <span className="badge" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>Pendente de aprovação</span>}
          {mudou && <small style={{ color: "var(--warn)" }}>valores mudaram — reaprove</small>}
          {gere && <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="btn primary sm" onClick={() => ex(() => A.aprovarPagamentoMkt(x.u.id, P.de, P.ate), "Pagamento aprovado").then((ok: boolean) => ok && recarregar())}>{pag ? "Reaprovar" : "Aprovar"}</button>
            {pag && <button className="btn ghost sm" onClick={() => ex(() => A.cancelarAprovacaoMkt(pag.id), "Aprovação desfeita").then((ok: boolean) => ok && recarregar())}>Desfazer</button>}</span>}
        </div>
      </div>); })}
    {!T.linhas.length && <div className="mv-vazio">Nenhuma operadora cadastrada.</div>}
  </>;
}
