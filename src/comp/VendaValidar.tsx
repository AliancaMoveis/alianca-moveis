// Venda do cliente: vários nºs de venda (pagos), promissórias (valor pendente) e pagamentos de promissória.
// Formulário de lançamento (vendedor / Gestão), validação nº a nº pela Gestão, pagamento de promissória e relatórios.
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtDate, fmtMoeda, hojeISO, itensVenda, parseMoeda, promAbertas, valorPago, valorPendente } from "../lib/regras";
import { TIPO_VENDA_INFORMADO, VENDA_STATUS } from "../lib/regras";

export type Linha = { tipo: "pago" | "promissoria"; numero: string; valor: string; vencimento: string };
const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const linhaVazia = (tipo: "pago" | "promissoria" = "pago"): Linha => ({ tipo, numero: "", valor: "", vencimento: "" });
// modelo de linhas a partir do tipo de pagamento escolhido no status do cliente
export const linhasDoTipo = (t: string): Linha[] => t === "entrada" ? [linhaVazia(), linhaVazia("promissoria")] : t === "promissoria" ? [linhaVazia("promissoria")] : [linhaVazia()];

// confere as linhas; devolve a lista pronta para o banco ou uma mensagem de erro
export function conferirLinhas(linhas: Linha[]): { itens?: any[]; erro?: string } {
  const us = linhas.filter(l => l.numero.trim() || l.valor.trim());
  if (!us.length) return { erro: "Informe ao menos um nº de venda com valor" };
  const vistos = new Set<string>();
  for (const l of us) {
    if (!l.numero.trim()) return { erro: l.tipo === "promissoria" ? "Informe o nº da venda da promissória" : "Informe o nº de cada venda" };
    if (parseMoeda(l.valor) <= 0) return { erro: "Informe o valor do nº " + l.numero.trim() };
    if (vistos.has(l.numero.trim())) return { erro: "O nº " + l.numero.trim() + " está repetido" };
    vistos.add(l.numero.trim());
  }
  return { itens: us.map(l => ({ tipo: l.tipo, numero: l.numero.trim(), valor: parseMoeda(l.valor), vencimento: l.tipo === "promissoria" ? l.vencimento || null : null })) };
}

// editor de linhas: nºs pagos (+ outro nº) e promissórias (+ promissória)
export function LinhasVenda({ linhas, setLinhas }: { linhas: Linha[]; setLinhas: (f: (l: Linha[]) => Linha[]) => void }) {
  const set = (i: number, k: keyof Linha, v: string) => setLinhas(l => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const tira = (i: number) => setLinhas(l => l.filter((_, j) => j !== i));
  const pago = linhas.filter(l => l.tipo === "pago").reduce((s, l) => s + parseMoeda(l.valor), 0);
  const prom = linhas.filter(l => l.tipo === "promissoria").reduce((s, l) => s + parseMoeda(l.valor), 0);
  const bloco = (tipo: "pago" | "promissoria") => {
    const idx = linhas.map((l, i) => [l, i] as const).filter(([l]) => l.tipo === tipo);
    return <div className={"lv-bloco " + tipo}>
      <div className="lv-tit">{tipo === "pago" ? "💵 Vendas pagas (à vista / entrada)" : "📄 Promissória — valor pendente"}</div>
      {idx.map(([l, i]) => <div className="lv-linha" key={i}>
        <label>Nº da venda<input value={l.numero} onChange={e => set(i, "numero", e.target.value)} placeholder="Ex.: 1308706" /></label>
        <label>Valor (R$)<input inputMode="decimal" value={l.valor} onChange={e => set(i, "valor", e.target.value)} placeholder="Ex.: 50.000,00" /></label>
        {tipo === "promissoria" && <label>Vencimento<input type="date" value={l.vencimento} onChange={e => set(i, "vencimento", e.target.value)} /></label>}
        <button type="button" className="lv-x" title="Remover" onClick={() => tira(i)}>✕</button>
      </div>)}
      <button type="button" className="btn ghost sm" onClick={() => setLinhas(l => [...l, linhaVazia(tipo)])}>{tipo === "pago" ? "＋ outro nº de venda" : "＋ promissória"}</button>
    </div>;
  };
  return <div className="lv">
    {bloco("pago")}
    {bloco("promissoria")}
    <div className="lv-tot">Pago <b>{fmtMoeda(pago)}</b> · Promissória <b>{fmtMoeda(prom)}</b> · Total <b>{fmtMoeda(pago + prom)}</b></div>
  </div>;
}

const TIPO_ITEM: Record<string, string> = { pago: "Venda paga", promissoria: "Promissória", pagamento: "Pagamento de promissória" };
const ST_ITEM: Record<string, string> = { registrada: "a confirmar", efetivada: "efetivada", cancelada: "cancelada" };

// Gestão: lançamentos aguardando análise — efetivar / cancelar nº a nº ou todos
export function ValidarVenda({ c, onFeito }: { c: any; onFeito?: () => void }) {
  const { executar: ex } = useApp() as any;
  const v = c.venda || {};
  const pend = itensVenda(v).filter((i: any) => i.status === "registrada");
  const decidir = async (l: any[], msg: string) => { if (await ex(() => A.decidirItensVenda(c.id, l), msg)) onFeito && onFeito(); };
  if (!pend.length || !pend[0].id) return <div className="vv">
    <div className="vv-ops">
      <button type="button" className="vv-op on" onClick={async () => { if (await ex(() => A.validarVenda(c.id, "efetivada", 0, []), "Venda efetivada")) onFeito && onFeito(); }}><b>✅ Efetivar</b><small>confirma a venda</small></button>
      <button type="button" className="vv-op canc" onClick={async () => { if (await ex(() => A.validarVenda(c.id, "cancelada", 0, []), "Venda cancelada")) onFeito && onFeito(); }}><b>❌ Cancelar</b><small>não houve venda</small></button>
    </div>
  </div>;
  return (
    <div className="vv">
      {v.status === "registrada" && v.tipoInformado && <div className="vv-info">O vendedor informou: <b>{TIPO_VENDA_INFORMADO[v.tipoInformado]}</b> — confira cada nº e valide.</div>}
      <div className="vi-lista">
        {pend.map((i: any) => <div className={"vi-linha " + i.tipo} key={i.id}>
          <span className="vi-tipo">{TIPO_ITEM[i.tipo]}</span>
          <span>nº <b>{i.numero}</b></span><b>{fmtMoeda(i.valor)}</b>
          <small>{i.dataVenda ? fmtDate(i.dataVenda) : ""}{i.tipo === "promissoria" && i.vencimento ? " · vence " + fmtDate(i.vencimento) : ""}</small>
          <span className="vi-acoes">
            <button className="btn sm" onClick={() => decidir([{ id: i.id, status: "efetivada" }], "Nº " + i.numero + " efetivado")}>✅ Efetivar</button>
            <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => decidir([{ id: i.id, status: "cancelada" }], "Nº " + i.numero + " cancelado")}>❌ Cancelar</button>
          </span>
        </div>)}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-soft)", margin: "8px 0" }}>Venda paga gera comissão no mês da aprovação. Promissória fica como valor pendente — a comissão sai quando for paga.</div>
      {pend.length > 1 && <button className="btn primary sm" onClick={() => decidir(pend.map((i: any) => ({ id: i.id, status: "efetivada" })), pend.length + " nº(s) efetivado(s)")}>✅ Efetivar todos ({pend.length})</button>}
    </div>
  );
}

// lista completa da venda do cliente: nºs pagos, promissórias (pago / pendente) e pagamentos; ações da Gestão
export function Promissorias({ c }: { c: any }) {
  const { R, executar: ex, toast } = useApp() as any;
  const v = c.venda || {};
  const itens = itensVenda(v);
  const [pagando, setPagando] = useState(""); const [pg, setPg] = useState({ valor: "", numero: "", data: hojeISO() });
  const [corr, setCorr] = useState(""); const [cf, setCf] = useState({ numero: "", valor: "", data: "", venc: "" });
  if (!itens.length) return null;
  const G = R.ehGestao();
  const hoje = hojeISO();
  const principais = itens.filter((i: any) => i.tipo !== "pagamento");
  const pagamentosDe = (id: string) => itens.filter((i: any) => i.tipo === "pagamento" && i.promissoriaId === id);
  const pend = valorPendente(v), pago = valorPago(v);
  const total = principais.filter((i: any) => i.status !== "cancelada").reduce((s: number, i: any) => s + i.valor, 0);
  const pagar = async (p: any) => {
    const saldo = p.valor - (p.valorPago || 0);
    const val = pg.valor.trim() ? parseMoeda(pg.valor) : saldo;
    if (val <= 0 || val > saldo + 0.001) { toast("Valor inválido (até " + fmtMoeda(saldo) + ")"); return; }
    if (!pg.numero.trim()) { toast("Informe o nº da venda do pagamento"); return; }
    if (await ex(() => A.quitarPromissoria(p.id, val, pg.numero.trim(), pg.data), val < saldo - 0.001 ? "Pagamento registrado — ainda pendente " + fmtMoeda(saldo - val) : "Promissória quitada")) setPagando("");
  };
  const salvarCorr = async (i: any) => {
    if (!cf.numero.trim() || parseMoeda(cf.valor) <= 0) { toast("Informe nº e valor"); return; }
    if (await ex(() => A.corrigirItemVenda(i.id, cf.numero.trim(), parseMoeda(cf.valor), cf.data, cf.venc), "Lançamento corrigido")) setCorr("");
  };
  const decidir = (i: any, st: string, msg: string) => ex(() => A.decidirItensVenda(c.id, [{ id: i.id, status: st }]), msg);
  const acoesG = (i: any) => G && i.id && corr !== i.id && <span className="vi-acoes">
    <button className="btn ghost sm" onClick={() => { setCorr(i.id); setCf({ numero: i.numero, valor: fmt(i.valor), data: i.dataVenda || "", venc: i.vencimento || "" }); }}>Corrigir</button>
    {i.status !== "cancelada" && <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => decidir(i, "cancelada", (i.tipo === "pagamento" ? "Pagamento estornado" : "Nº " + i.numero + " cancelado"))}>{i.tipo === "pagamento" ? "Estornar" : "Cancelar"}</button>}
    {i.status === "cancelada" && i.tipo !== "pagamento" && <button className="btn ghost sm" onClick={() => decidir(i, "registrada", "Nº " + i.numero + " voltou para análise")}>Reabrir</button>}
  </span>;
  const formCorr = (i: any) => corr === i.id && <div className="vv-quitar">
    <label className="vv-campo">Nº<input value={cf.numero} onChange={e => setCf({ ...cf, numero: e.target.value })} /></label>
    <label className="vv-campo">Valor (R$)<input inputMode="decimal" value={cf.valor} onChange={e => setCf({ ...cf, valor: e.target.value })} /></label>
    <label className="vv-campo">Data<input type="date" value={cf.data} onChange={e => setCf({ ...cf, data: e.target.value })} /></label>
    {i.tipo === "promissoria" && <label className="vv-campo">Vencimento<input type="date" value={cf.venc} onChange={e => setCf({ ...cf, venc: e.target.value })} /></label>}
    <div style={{ display: "flex", gap: 8 }}><button className="btn primary sm" onClick={() => salvarCorr(i)}>Salvar</button><button className="btn ghost sm" onClick={() => setCorr("")}>Cancelar</button></div>
  </div>;
  return (
    <div className="vv-lista">
      <div className="vc-res">
        <div><span>Total da venda</span><b>{fmtMoeda(total)}</b></div>
        <div className="ok"><span>Pago</span><b>{fmtMoeda(pago)}</b></div>
        <div className={pend > 0 ? "pend" : ""}><span>Pendente em promissória</span><b>{fmtMoeda(pend)}</b></div>
      </div>
      {principais.map((i: any) => {
        const saldo = i.tipo === "promissoria" ? Math.max(0, i.valor - (i.valorPago || 0)) : 0;
        const aberta = i.tipo === "promissoria" && i.status === "efetivada" && saldo > 0.004;
        const vencida = aberta && i.vencimento && i.vencimento < hoje;
        const cls = i.status === "cancelada" ? "canc" : i.status === "registrada" ? "pendg" : i.tipo === "promissoria" ? (aberta ? (vencida ? "vencida" : "aberta") : "paga") : "paga";
        return <div key={i.id || i.numero}>
          <div className={"vv-linha " + cls}>
            <span>{i.tipo === "promissoria" ? "Promissória" : "Venda"} nº <b>{i.numero}</b></span><b>{fmtMoeda(i.valor)}</b>
            <small>{i.status === "registrada" ? "⏳ a confirmar pela Gestão" : i.status === "cancelada" ? "cancelada"
              : i.tipo === "promissoria" ? (aberta ? "pendente " + fmtMoeda(saldo) + (i.valorPago > 0 ? " · pago " + fmtMoeda(i.valorPago) : "") + (i.vencimento ? (vencida ? " · ⚠️ venceu " : " · vence ") + fmtDate(i.vencimento) : "") : "✓ quitada")
              : "✓ paga" + (i.dataVenda ? " · " + fmtDate(i.dataVenda) : "")}</small>
            {aberta && G && pagando !== i.id && <button className="btn sm" onClick={() => { setPagando(i.id); setPg({ valor: fmt(saldo), numero: "", data: hoje }); }}>💰 Registrar pagamento</button>}
            {acoesG(i)}
          </div>
          {formCorr(i)}
          {pagamentosDe(i.id).map((p: any) => <div key={p.id}>
            <div className={"vv-linha pgto " + (p.status === "cancelada" ? "canc" : "paga")}>
              <span>↳ pagamento nº <b>{p.numero}</b></span><b>{fmtMoeda(p.valor)}</b><small>{p.status === "cancelada" ? "estornado" : "✓ pago em " + fmtDate(p.dataVenda)}</small>{acoesG(p)}
            </div>{formCorr(p)}
          </div>)}
          {pagando === i.id && <div className="vv-quitar">
            <label className="vv-campo">Valor pago (R$)<input inputMode="decimal" value={pg.valor} onChange={e => setPg({ ...pg, valor: e.target.value })} /></label>
            <label className="vv-campo">Nº da venda do pagamento<input value={pg.numero} onChange={e => setPg({ ...pg, numero: e.target.value })} placeholder="Ex.: 1309059" /></label>
            <label className="vv-campo">Data do pagamento<input type="date" value={pg.data} onChange={e => setPg({ ...pg, data: e.target.value })} /></label>
            {parseMoeda(pg.valor) > 0 && parseMoeda(pg.valor) < saldo - 0.001 && <div className="vv-soma">Pagamento parcial: continua pendente {fmtMoeda(saldo - parseMoeda(pg.valor))} nesta promissória.</div>}
            <div style={{ display: "flex", gap: 8 }}><button className="btn primary sm" onClick={() => pagar(i)}>Confirmar pagamento</button><button className="btn ghost sm" onClick={() => setPagando("")}>Cancelar</button></div>
          </div>}
        </div>;
      })}
      {pend > 0 && <div className="vv-pend">Pendente em promissória: <b>{fmtMoeda(pend)}</b> — a comissão desta parte sai quando for paga.</div>}
    </div>
  );
}

// selo com nº(s) da venda (+ promissória pendente) — listas, ficha e app
export function SeloVenda({ c, curto }: { c: any; curto?: boolean }) {
  const { R } = useApp() as any;
  const v = c.venda; if (!v || !v.numero) return null;
  const ab = promAbertas(v);
  const verVal = R.podeVerValor(c);
  const hoje = hojeISO();
  const venc = ab.some((p: any) => p.vencimento && p.vencimento < hoje);
  const nums = itensVenda(v).filter((i: any) => i.tipo === "pago" && i.status !== "cancelada").map((i: any) => i.numero);
  const pendG = itensVenda(v).some((i: any) => i.status === "registrada") && v.status !== "registrada";
  const cor = v.status === "efetivada" ? "ok" : v.status === "cancelada" ? "canc" : ab.length ? (venc ? "venc" : "prom") : v.status === "registrada" ? "pend" : "ok";
  const vendas = nums.length > 1 ? (curto ? nums[0] + " +" + (nums.length - 1) : nums.join(", ")) : (nums[0] || v.numero);
  return <span className={"selo-venda " + cor} title={VENDA_STATUS[v.status]}>
    Venda {vendas}{ab.length ? <> · Prom. {ab.map((p: any) => p.numero).join(", ")}{verVal ? " · " + fmtMoeda(valorPendente(v)) + " pendente" : ""}{!curto && ab[0].vencimento ? " · " + (venc ? "vencida " : "vence ") + fmtDate(ab[0].vencimento).slice(0, 5) : ""}</> : v.status === "registrada" ? " · pendente de análise" : v.status === "cancelada" ? " · cancelada" : " · efetivada"}{pendG ? " · + nº a confirmar" : ""}
  </span>;
}

// relatório: clientes com promissória em aberto (valor pendente). Consultor vê só os dele (quem pode ver o valor).
export function PromissoriasAbertas({ titulo = "Promissórias em aberto", consultorId }: { titulo?: string; consultorId?: string }) {
  const { R, st, abrirDetalhe } = useApp() as any;
  const hoje = hojeISO();
  const [f, setF] = useState<"todas" | "vencidas" | "semana">("todas");
  const linhas = st.chamados.filter((c: any) => c.venda && c.venda.status !== "cancelada" && R.podeVerValor(c) && (!consultorId || c.consultorId === consultorId))
    .flatMap((c: any) => promAbertas(c.venda).map((p: any) => ({ c, p, saldo: p.saldo != null ? p.saldo : p.valor, atraso: p.vencimento && p.vencimento < hoje ? Math.round((+new Date(hoje) - +new Date(p.vencimento)) / 86400000) : 0 })))
    .sort((a: any, b: any) => b.atraso - a.atraso || String(a.p.vencimento || "9").localeCompare(String(b.p.vencimento || "9")));
  const em7 = (d: string) => { if (!d) return false; const x = new Date(hoje); x.setDate(x.getDate() + 7); return d >= hoje && d <= x.toISOString().slice(0, 10); };
  const vis = linhas.filter((l: any) => f === "todas" || (f === "vencidas" ? l.atraso > 0 : em7(l.p.vencimento)));
  const soma = (l: any[]) => l.reduce((s, x) => s + x.saldo, 0);
  const venc = linhas.filter((l: any) => l.atraso > 0), sem = linhas.filter((l: any) => em7(l.p.vencimento));
  const pct = (st.config && st.config.comissaoPct) || 1.5;
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3>{titulo}</h3>
      <div className="vv-res">
        <button className={f === "todas" ? "on" : ""} onClick={() => setF("todas")}><b>{fmtMoeda(soma(linhas))}</b><span>{linhas.length} em aberto · comissão futura {fmtMoeda(soma(linhas) * pct / 100)}</span></button>
        <button className={"r" + (f === "vencidas" ? " on" : "")} onClick={() => setF("vencidas")}><b>{fmtMoeda(soma(venc))}</b><span>{venc.length} vencida(s)</span></button>
        <button className={f === "semana" ? "on" : ""} onClick={() => setF("semana")}><b>{fmtMoeda(soma(sem))}</b><span>{sem.length} vencem em 7 dias</span></button>
      </div>
      {vis.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Cliente</th><th>Vendas pagas</th><th>Promissória</th><th>Já pago</th><th>Pendente</th><th>Vencimento</th><th>Vendedor</th><th>Consultor</th></tr></thead><tbody>
        {vis.map(({ c, p, saldo, atraso }: any) => <tr key={p.id} onClick={() => abrirDetalhe(c.id)} style={{ cursor: "pointer" }}>
          <td><b>{c.cliente}</b></td>
          <td>{itensVenda(c.venda).filter((i: any) => i.tipo === "pago" && i.status === "efetivada").map((i: any) => i.numero).join(", ") || "—"}<br /><small>{fmtMoeda(valorPago(c.venda))}</small></td>
          <td>nº {p.numero}<br /><small>{fmtMoeda(p.valor)}</small></td>
          <td>{fmtMoeda(p.valorPago || 0)}</td>
          <td style={{ fontWeight: 700, color: "var(--st-tratativa)" }}>{fmtMoeda(saldo)}</td>
          <td style={atraso ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{p.vencimento ? fmtDate(p.vencimento) : "—"}{atraso ? " · " + atraso + "d atraso" : ""}</td>
          <td>{c.atendenteId ? R.nomeUser(c.atendenteId) : c.venda.vendedor || "—"}</td><td>{c.consultorId ? R.nomeUser(c.consultorId) : "marketing"}</td></tr>)}
      </tbody></table></div> : <div className="dn-vazio">Nenhuma promissória {f === "vencidas" ? "vencida" : f === "semana" ? "vencendo nos próximos 7 dias" : "em aberto"}.</div>}
    </div>
  );
}
