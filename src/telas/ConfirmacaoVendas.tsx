// ✅ Confirmação de vendas: fila única das vendas do Exact achadas nos clientes do 360 e do Minha Visita.
// Tudo que os cruzamentos acham entra aqui (sem apagar o que já estava). Na mesma tela: valida (vira venda efetivada,
// com o vendedor e o cliente comprador do Exact), nega, marca como checklist (pedido da fábrica, não conta) e corrige o valor.
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { Kpi } from "./Dashboard";
import { fmtDate, fmtMoeda } from "../lib/regras";
import { tira } from "./Medidas";

type Item = {
  numero: string; fonte: string; tipo: string; chamado_id: string | null; cands: { id: string; cliente: string; como: string }[]; cliente_ref: string;
  consultor_id: string | null; consultor_nome: string; mv: any; ex_cliente: string; ex_tel1: string; ex_tel2: string; ex_end: string; ex_vendedor: string;
  vendedor_id: string | null; ex_situacao: string; valor: number; valor_exact: number; data: string | null; como: string; status: string; decidido_em: string | null; decidido_por: string | null; criado_em: string;
};
type Aba = "pendente" | "validada" | "negada" | "checklist" | "todas";
const ABAS: [Aba, string][] = [["pendente", "⏳ A conferir"], ["validada", "✅ Validadas"], ["negada", "❌ Negadas"], ["checklist", "📋 Checklist"], ["todas", "Todas"]];
const COMO: Record<string, string> = { venda: "nº da venda", telefone: "telefone", nome: "só o nome", end_ok: "endereço + compl.", end_sem: "endereço", end_dif: "endereço (compl. diferente)" };
const brl = (n: number) => fmtMoeda(Number(n) || 0);
const lerValor = (s: string) => { const n = Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return isFinite(n) ? n : 0; };

export default function ConfirmacaoVendas() {
  const { R, st, toast, abrirDetalhe, recarregar } = useApp() as any;
  const [itens, setItens] = useState<Item[] | null>(null);
  const [aba, setAba] = useState<Aba>("pendente");
  const [tipo, setTipo] = useState<"" | "consultor" | "marketing">("");
  const [q, setQ] = useState(""); const [ocup, setOcup] = useState<Record<string, boolean>>({});
  const [valEd, setValEd] = useState<Record<string, string>>({});
  const tRecarga = useRef<any>(null);

  const ler = async () => { try { setItens(((await A.vendaConfLista()) || []) as Item[]); } catch (e: any) { toast(e.message || "Não consegui carregar a confirmação"); setItens([]); } };
  useEffect(() => { ler(); }, []);
  // depois de validar, atualiza o resto do sistema sem travar a conferência (uma vez, quando parar de clicar)
  const recarregarDepois = () => { clearTimeout(tRecarga.current); tRecarga.current = setTimeout(() => recarregar(), 6000); };
  useEffect(() => () => clearTimeout(tRecarga.current), []);

  const chamado = (id: string | null) => id ? st.chamados.find((c: any) => c.id === id) : null;
  const vendedores = useMemo(() => st.usuarios.filter((u: any) => (u.setores || []).includes("atendente_cliente") && u.ativo).sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR")), [st.usuarios]);
  const consultores = useMemo(() => st.usuarios.filter((u: any) => (u.setores || []).includes("consultor_externo") && u.ativo), [st.usuarios]);

  const todos = itens || [];
  const doTipo = todos.filter(x => !tipo || x.tipo === tipo);
  const busca = tira(q), dig = q.replace(/\D/g, "");
  const lista = doTipo.filter(x => (aba === "todas" || x.status === aba)
    && (!q || tira([x.ex_cliente, x.cliente_ref, chamado(x.chamado_id)?.cliente || "", x.consultor_nome, x.ex_vendedor].join(" ")).includes(busca) || (dig.length >= 3 && (x.numero.includes(dig) || (x.ex_tel1 + x.ex_tel2).replace(/\D/g, "").includes(dig)))))
    .sort((a, b) => tira(a.ex_cliente).localeCompare(tira(b.ex_cliente)) || a.numero.localeCompare(b.numero));
  const pend = doTipo.filter(x => x.status === "pendente");
  const hoje = new Date().toISOString().slice(0, 10);
  const validHoje = doTipo.filter(x => x.status === "validada" && String(x.decidido_em || "").slice(0, 10) === hoje);

  const troca = (numero: string, patch: Partial<Item>) => setItens(l => (l || []).map(x => x.numero === numero ? { ...x, ...patch } : x));
  async function decidir(x: Item, acao: "validar" | "negar" | "checklist" | "reabrir") {
    if (ocup[x.numero]) return;
    // valor digitado e ainda não salvo vai junto
    const ed = valEd[x.numero];
    setOcup(o => ({ ...o, [x.numero]: true }));
    const antes = x.status;
    try {
      if (ed !== undefined && acao === "validar") { const v = lerValor(ed); if (v <= 0) throw new Error("Valor inválido"); if (v !== Number(x.valor)) { await A.vendaConfEditar(x.numero, { valor: v }); troca(x.numero, { valor: v }); } }
      troca(x.numero, { status: acao === "validar" ? "validada" : acao === "negar" ? "negada" : acao === "checklist" ? "checklist" : "pendente", decidido_em: new Date().toISOString() });
      await A.vendaConfDecidir(x.numero, acao);
      setValEd(v => { const n = { ...v }; delete n[x.numero]; return n; });
      if (acao === "validar") recarregarDepois();
    } catch (e: any) { troca(x.numero, { status: antes }); toast(x.numero + ": " + (e.message || "não deu certo")); }
    finally { setOcup(o => ({ ...o, [x.numero]: false })); }
  }
  async function salvarValor(x: Item) {
    const ed = valEd[x.numero]; if (ed === undefined) return;
    const v = lerValor(ed); if (v <= 0) { toast("Valor inválido"); return; }
    if (v === Number(x.valor)) { setValEd(o => { const n = { ...o }; delete n[x.numero]; return n; }); return; }
    try { await A.vendaConfEditar(x.numero, { valor: v }); troca(x.numero, { valor: v }); setValEd(o => { const n = { ...o }; delete n[x.numero]; return n; }); }
    catch (e: any) { toast(e.message); }
  }
  async function editar(x: Item, patch: any, local: Partial<Item>) {
    try { await A.vendaConfEditar(x.numero, patch); troca(x.numero, local); } catch (e: any) { toast(e.message); }
  }
  async function validarTodas() {
    const l = lista.filter(x => x.status === "pendente"); if (!l.length) return;
    if (!confirm(`Validar as ${l.length} vendas desta lista (${brl(l.reduce((s, x) => s + Number(x.valor), 0))})? Cada uma vira venda efetivada no 360.`)) return;
    for (const x of l) await decidir(x, "validar");
  }

  const th: React.CSSProperties = { textAlign: "left", padding: "8px", fontSize: 12, color: "var(--ink-soft)", borderBottom: "2px solid var(--line)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 };
  const td: React.CSSProperties = { padding: "8px", fontSize: 13, borderBottom: "1px solid var(--line-soft)", verticalAlign: "top" };

  return <section className="view active">
    <div className="view-head"><div><h2>✅ Confirmação de vendas</h2>
      <p>Tudo o que o <b>Encontrar vendas</b> acha (Exact × 360 e Exact × Minha Visita) entra aqui, sem apagar o que já estava. Confira com o Exact/Tático e decida na mesma tela: <b>Validar</b> vira venda efetivada no 360 (com o vendedor e o cliente comprador do Exact), <b>Negar</b> descarta e <b>Checklist</b> guarda como pedido da fábrica (não conta como venda). O valor pode ser corrigido direto na linha.</p></div></div>

    <div className="kpis" style={{ margin: "6px 0 10px" }}>
      <Kpi n={pend.length} l={"A conferir · " + brl(pend.reduce((s, x) => s + Number(x.valor), 0))} cor="var(--warn)" />
      <Kpi n={pend.filter(x => x.tipo === "consultor").length} l="🧭 De consultores" cor="var(--primary)" />
      <Kpi n={pend.filter(x => x.tipo === "marketing").length} l="🏬 Do marketing" cor="var(--primary)" />
      <Kpi n={validHoje.length} l={"Validadas hoje · " + brl(validHoje.reduce((s, x) => s + Number(x.valor), 0))} cor="var(--st-concluida)" />
    </div>

    <div className="cv-barra">
      <div className="chips" style={{ margin: 0 }}>{ABAS.map(([k, l]) => <button key={k} className={"chip" + (aba === k ? " on" : "")} onClick={() => setAba(k)}>{l}<span className="n">{doTipo.filter(x => k === "todas" || x.status === k).length}</span></button>)}</div>
      <div className="subnav" style={{ margin: 0 }}>
        <button className={!tipo ? "on" : ""} onClick={() => setTipo("")}>Tudo</button>
        <button className={tipo === "consultor" ? "on" : ""} onClick={() => setTipo("consultor")}>🧭 Consultores</button>
        <button className={tipo === "marketing" ? "on" : ""} onClick={() => setTipo("marketing")}>🏬 Marketing</button>
      </div>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 cliente, nº, telefone, consultor, vendedor" style={{ marginLeft: "auto", maxWidth: 300 }} />
      {aba === "pendente" && lista.length > 0 && <button className="btn sm" onClick={validarTodas}>✅ Validar todas da lista ({lista.length})</button>}
    </div>

    {itens === null ? <div className="empty" style={{ padding: 30 }}>Carregando…</div> :
      <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: "72vh" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>Venda (Exact)</th><th style={th}>Cliente comprador (Exact)</th><th style={th}>Cliente no 360 / Minha Visita</th><th style={th}>Consultor / Responsável</th><th style={th}>Vendedor</th><th style={th}>Valor</th><th style={th}>Decisão</th></tr></thead>
          <tbody>{lista.slice(0, 600).map(x => { const c = chamado(x.chamado_id); const ed = valEd[x.numero]; const mudou = Number(x.valor) !== Number(x.valor_exact);
            const pendente = x.status === "pendente"; const vend = x.vendedor_id ? R.nomeUser(x.vendedor_id) : "";
            return <tr key={x.numero} className={"cv-l " + x.status}>
              <td style={{ ...td, whiteSpace: "nowrap" }}><b>{x.numero}</b><div className="hint">{x.data ? fmtDate(x.data) : ""}</div>
                <div className="hint" style={{ color: /aguard|promiss/i.test(x.ex_situacao) ? "var(--warn)" : undefined }}>{x.ex_situacao}</div>
                <span className={"cv-tipo " + x.tipo}>{x.tipo === "marketing" ? "🏬 Marketing" : "🧭 Consultor"}</span> <span className="hint">{x.fonte === "minha_visita" ? "Minha Visita" : "360"}</span></td>
              <td style={td}><b>{x.ex_cliente || "—"}</b><div className="hint">{[x.ex_tel1, x.ex_tel2].filter(Boolean).join(" · ")}</div><div className="hint" style={{ maxWidth: 200 }}>{x.ex_end}</div></td>
              <td style={td}>
                {c ? <><a href="#" onClick={e => { e.preventDefault(); abrirDetalhe(c.id); }}><b>{c.cliente}</b></a> <span className="hint">{c.id}</span></>
                  : x.fonte === "minha_visita" ? <><b>{x.mv?.nome || x.cliente_ref}</b> <span className="pill" style={{ fontSize: 11 }}>Minha Visita</span>
                    <div className="hint">{[x.mv?.telefone, x.mv?.status].filter(Boolean).join(" · ")}</div>{pendente && <div className="hint">ao validar, entra no 360 como cliente do consultor (visita realizada)</div>}</>
                  : <b>{x.cliente_ref || "—"}</b>}
                {x.como && <div className="hint">achado por {COMO[x.como] || x.como}</div>}
                {pendente && x.cands.length > 1 && <select style={{ fontSize: 12, marginTop: 4, maxWidth: 200 }} value={x.chamado_id || ""} onChange={e => editar(x, { chamado_id: e.target.value }, { chamado_id: e.target.value })}>
                  {x.cands.map(k => <option key={k.id} value={k.id}>{k.cliente} ({k.id}) · {COMO[k.como] || k.como}</option>)}</select>}
              </td>
              <td style={td}>{x.consultor_id ? <b>{R.nomeUser(x.consultor_id)}</b> : x.consultor_nome ? <b>{x.consultor_nome}</b> : "—"}
                {pendente && x.fonte === "minha_visita" && !x.chamado_id && !x.consultor_id && <div><div className="hint" style={{ color: "var(--warn)" }}>consultor não achado — escolha:</div>
                  <select style={{ fontSize: 12 }} value="" onChange={e => editar(x, { consultor_id: e.target.value }, { consultor_id: e.target.value })}><option value="">—</option>{consultores.map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>}</td>
              <td style={td}><div>Exact: <b>{x.ex_vendedor || "—"}</b></div>
                {pendente ? <select style={{ fontSize: 12, width: 150, marginTop: 2 }} value={x.vendedor_id || ""} onChange={e => editar(x, { vendedor_id: e.target.value }, { vendedor_id: e.target.value || null })}>
                  <option value="">{c?.atendenteId ? "manter " + R.nomeUser(c.atendenteId) : "sem vendedor"}</option>{vendedores.map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select>
                  : <div className="hint">360: {vend || (c?.atendenteId ? R.nomeUser(c.atendenteId) : "—")}</div>}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                {pendente ? <input className="cv-valor" inputMode="decimal" value={ed !== undefined ? ed : Number(x.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  onChange={e => setValEd(v => ({ ...v, [x.numero]: e.target.value }))} onBlur={() => salvarValor(x)} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                  : <b>{brl(x.valor)}</b>}
                {mudou && <div className="hint">Exact: {brl(x.valor_exact)}</div>}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                {pendente ? <div className="cv-acoes">
                  <button className="btn primary sm" disabled={!!ocup[x.numero]} onClick={() => decidir(x, "validar")}>✅ Validar</button>
                  <button className="btn sm cv-neg" disabled={!!ocup[x.numero]} onClick={() => decidir(x, "negar")}>❌ Negar</button>
                  <button className="btn sm" disabled={!!ocup[x.numero]} title="Pedido da fábrica de um checklist finalizado — não conta como venda" onClick={() => decidir(x, "checklist")}>📋 Checklist</button>
                </div> : <div>
                  <span className={"pill cv-st " + x.status}>{x.status === "validada" ? "✅ validada" : x.status === "negada" ? "❌ negada" : "📋 checklist"}</span>
                  <div className="hint">{x.decidido_em ? new Date(x.decidido_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}{x.decidido_por ? " · " + R.nomeUser(x.decidido_por) : ""}</div>
                  {x.status !== "validada" && <button className="btn ghost sm" disabled={!!ocup[x.numero]} onClick={() => decidir(x, "reabrir")}>↩ voltar</button>}
                </div>}
              </td>
            </tr>; })}</tbody>
        </table>
        {!lista.length && <div className="empty" style={{ padding: 24 }}>{aba === "pendente" ? "Nada para conferir. Anexe o relatório do Exact em Encontrar vendas do 360 ou da Minha Visita — o que for achado aparece aqui." : "Nenhuma venda aqui."}</div>}
        {lista.length > 600 && <div className="hint" style={{ padding: 8 }}>Mostrando 600 de {lista.length}. Use a busca.</div>}
      </div>}
  </section>;
}
