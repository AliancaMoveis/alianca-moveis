// ✅ Confirmação de vendas: fila única das vendas do Exact achadas nos clientes do 360 e do Minha Visita.
// Tudo que os cruzamentos acham entra aqui (sem apagar o que já estava). Na mesma tela: valida (vira venda efetivada,
// com o vendedor e o cliente comprador do Exact), nega, marca como checklist (pedido da fábrica, não conta) e corrige o valor.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { Kpi } from "./Dashboard";
import { fmtDate, fmtMoeda, numerosVenda } from "../lib/regras";
import { tira } from "./Medidas";

type Item = {
  numero: string; fonte: string; tipo: string; chamado_id: string | null; cands: { id: string; cliente: string; como: string }[]; cliente_ref: string;
  consultor_id: string | null; consultor_nome: string; mv: any; ex_cliente: string; ex_tel1: string; ex_tel2: string; ex_end: string; ex_idpessoa?: string; ex_vendedor: string;
  vendedor_id: string | null; ex_situacao: string; motivo?: string; ex_total?: number | null; ex_recebido?: number | null; forma?: string; entrada?: number | null; valor: number; valor_exact: number; data: string | null; como: string; status: string; decidido_em: string | null; decidido_por: string | null; criado_em: string;
};
type Aba = "pendente" | "validada" | "negada" | "checklist" | "todas";
const ABAS: [Aba, string][] = [["pendente", "⏳ A conferir"], ["validada", "✅ Validadas"], ["negada", "❌ Negadas"], ["checklist", "📋 Checklist"], ["todas", "Todas"]];
// como o cliente foi achado — telefone e nº da venda são confiáveis; endereço e nome precisam de conferência
const COMO: Record<string, [string, "ok" | "conf" | "risco", string]> = {
  venda: ["🧾 Nº da venda", "ok", "O nº da venda já está no cliente"],
  telefone: ["📞 Telefone", "ok", "O telefone da venda é o mesmo do cliente"],
  end_ok: ["🏠 Endereço + complemento", "ok", "Mesma rua, número e cidade — bloco/apto/casa também conferem"],
  end_sem: ["🏠 Endereço sem complemento", "conf", "Mesma rua, número e cidade, mas um dos lados não tem bloco/apto/casa — confira"],
  end_dif: ["⚠️ Endereço, complemento diferente", "risco", "Mesma rua e número, mas bloco/apto/casa diferentes — provavelmente outro morador"],
  nome: ["👤 Só o nome", "conf", "Achado só pelo nome — confira o telefone antes de validar"],
};
const comoDe = (k: string) => COMO[k] || [k || "—", "conf", ""] as [string, "conf", string];
const brl = (n: number) => fmtMoeda(Number(n) || 0);
const fmtN = (n: number) => (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lerValor = (s: string) => { const n = Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return isFinite(n) ? n : 0; };

export default function ConfirmacaoVendas() {
  const { R, st, toast, abrirDetalhe, recarregar } = useApp() as any;
  const [itens, setItens] = useState<Item[] | null>(null);
  const [aba, setAba] = useState<Aba>("pendente");
  const [tipo, setTipo] = useState<"" | "consultor" | "marketing">(() => { try { const v = localStorage.getItem("cv_tipo"); return v === "consultor" || v === "marketing" ? v : ""; } catch { return ""; } });
  const [q, setQ] = useState(""); const [ocup, setOcup] = useState<Record<string, boolean>>({});
  const [valEd, setValEd] = useState<Record<string, string>>({});
  const [metodo, setMetodo] = useState(""); const [sel, setSel] = useState<Record<string, boolean>>({});
  // promissória: total da venda e quanto foi pago à vista (0 = 100% promissória)
  const [prom, setProm] = useState<Record<string, { total: string; entrada: string }>>({});
  const abrirProm = (x: Item) => { const tot = Number(x.ex_total) || Number(x.valor_exact) || Number(x.valor); const rec = Number(x.ex_recebido) || 0;
    setProm(p => ({ ...p, [x.numero]: { total: fmtN(tot), entrada: fmtN(rec > 0 && rec < tot ? rec : 0) } })); };
  async function confirmarProm(x: Item) {
    const p = prom[x.numero]; if (!p) return; const tot = lerValor(p.total), ent = lerValor(p.entrada);
    if (tot <= 0) { toast("Informe o total da venda"); return; } if (ent >= tot) { toast("A entrada tem que ser menor que o total"); return; }
    setOcup(o => ({ ...o, [x.numero]: true }));
    try { await A.vendaConfPromissoria(x.numero, tot, ent); troca(x.numero, { status: "validada", forma: ent > 0 ? "entrada" : "promissoria", entrada: ent, valor: tot, decidido_em: new Date().toISOString() });
      setProm(q => { const n = { ...q }; delete n[x.numero]; return n; }); recarregarDepois(); }
    catch (e: any) { toast(x.numero + ": " + (e.message || "não deu certo")); }
    finally { setOcup(o => ({ ...o, [x.numero]: false })); }
  }
  const tRecarga = useRef<any>(null);

  const ler = async () => { try { setItens(((await A.vendaConfLista()) || []) as Item[]); } catch (e: any) { toast(e.message || "Não consegui carregar a confirmação"); setItens([]); } };
  useEffect(() => { ler(); }, []);
  // depois de validar, atualiza o resto do sistema sem travar a conferência (uma vez, quando parar de clicar)
  const recarregarDepois = () => { clearTimeout(tRecarga.current); tRecarga.current = setTimeout(() => recarregar(), 6000); };
  useEffect(() => () => clearTimeout(tRecarga.current), []);

  const chamado = (id: string | null) => id ? st.chamados.find((c: any) => c.id === id) : null;
  const vendedores = useMemo(() => st.usuarios.filter((u: any) => (u.setores || []).includes("atendente_cliente") && u.ativo).sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR")), [st.usuarios]);
  const consultores = useMemo(() => st.usuarios.filter((u: any) => (u.setores || []).includes("consultor_externo") && u.ativo), [st.usuarios]);

  // cliente do 360 de cada venda: o escolhido no cruzamento; para o Minha Visita, o que tem o mesmo telefone (ou o mesmo nome)
  const k8 = (s: string) => { const d = String(s || "").replace(/\D/g, ""); return d.length >= 8 ? d.slice(-8) : ""; };
  const idx = useMemo(() => { const tel: Record<string, any[]> = {}, nome: Record<string, any[]> = {};
    (st.chamados || []).filter((c: any) => R.domMarketing(c)).forEach((c: any) => {
      String(c.telefone || "").split(/[\/,;]| e /).forEach((t: string) => { const k = k8(t); if (k) (tel[k] = tel[k] || []).push(c); });
      const n = tira(c.cliente); if (n.length >= 6) (nome[n] = nome[n] || []).push(c); });
    return { tel, nome }; }, [st.chamados]);
  const cli360 = (x: Item): any => {
    const c = chamado(x.chamado_id); if (c) return c;
    const l: any[] = [];
    [x.mv?.telefone, x.ex_tel1, x.ex_tel2].forEach(t => (idx.tel[k8(t)] || []).forEach(c => { if (!l.includes(c)) l.push(c); }));
    if (!l.length) [x.mv?.nome, x.cliente_ref, x.ex_cliente].forEach(n => (idx.nome[tira(n)] || []).forEach(c => { if (!l.includes(c)) l.push(c); }));
    return l.sort((a, b) => Number(b.consultorId === x.consultor_id) - Number(a.consultorId === x.consultor_id) || Number(!!b.venda) - Number(!!a.venda))[0] || null;
  };
  const vendas360 = (c: any) => c && c.venda ? numerosVenda(c.venda) : [];
  // mesmo cliente = mesmo cliente do 360, ou mesmo comprador no Exact (ID da pessoa), ou mesmo nome do comprador
  const gk = (x: Item) => { const c = cli360(x); return c ? c.id : x.ex_idpessoa ? "p:" + x.ex_idpessoa : "n:" + tira(x.ex_cliente); };

  const todos = itens || [];
  const doTipo = todos.filter(x => !tipo || x.tipo === tipo);
  const busca = tira(q), dig = q.replace(/\D/g, "");
  const lista = doTipo.filter(x => (aba === "todas" || x.status === aba) && (!metodo || x.como === metodo)
    && (!q || tira([x.ex_cliente, x.cliente_ref, chamado(x.chamado_id)?.cliente || "", x.consultor_nome, x.ex_vendedor].join(" ")).includes(busca) || (dig.length >= 3 && (x.numero.includes(dig) || (x.ex_tel1 + x.ex_tel2).replace(/\D/g, "").includes(dig)))))
    .sort((a, b) => tira(a.ex_cliente).localeCompare(tira(b.ex_cliente)) || a.numero.localeCompare(b.numero));
  // agrupa as vendas do mesmo cliente (ordem alfabética do comprador)
  const grupos = (() => { const m = new Map<string, Item[]>(); lista.forEach(x => { const k = gk(x); m.set(k, [...(m.get(k) || []), x]); });
    return Array.from(m.entries()).map(([k, l]) => ({ k, l, nome: tira(l[0].ex_cliente) })).sort((a, b) => a.nome.localeCompare(b.nome)); })();
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
  const marcadas = lista.filter(x => sel[x.numero]);
  async function excluir(l: Item[]) {
    if (!l.length) return;
    if (!confirm(`Tirar ${l.length} venda(s) da Confirmação?${l.some(x => x.status === "validada") ? "\n\nAs já validadas continuam efetivadas no cliente — só saem desta lista." : ""}`)) return;
    try { await A.vendaConfExcluir(l.map(x => x.numero)); const s = new Set(l.map(x => x.numero)); setItens(v => (v || []).filter(x => !s.has(x.numero))); setSel({}); toast(l.length + " venda(s) tirada(s) da Confirmação"); }
    catch (e: any) { toast(e.message); }
  }
  async function validarMarcadas() {
    const l = marcadas.filter(x => x.status === "pendente"); if (!l.length) return;
    if (!confirm(`Validar ${l.length} venda(s) marcada(s) (${brl(l.reduce((s, x) => s + Number(x.valor), 0))})?`)) return;
    for (const x of l) await decidir(x, "validar");
    setSel({});
  }
  async function validarTodas() {
    const l = lista.filter(x => x.status === "pendente"); if (!l.length) return;
    if (!confirm(`Validar as ${l.length} vendas desta lista (${brl(l.reduce((s, x) => s + Number(x.valor), 0))})? Cada uma vira venda efetivada no 360.`)) return;
    for (const x of l) await decidir(x, "validar");
  }

  const th: React.CSSProperties = { textAlign: "left", padding: "8px 6px", fontSize: 12, color: "var(--ink-soft)", borderBottom: "2px solid var(--line)", whiteSpace: "normal", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 };
  const td: React.CSSProperties = { padding: "7px 6px", overflowWrap: "anywhere", fontSize: 13, borderBottom: "1px solid var(--line-soft)", verticalAlign: "top" };

  return <section className="view active">
    <div className="view-head"><div><h2>✅ Confirmação de vendas</h2>
      <p>Tudo o que o <b>Encontrar vendas</b> acha (Exact × 360 e Exact × Minha Visita) entra aqui, sem apagar o que já estava. Confira com o Exact/Tático e decida na mesma tela: <b>Validar</b> vira venda efetivada no 360 (com o vendedor e o cliente comprador do Exact), <b>Promissória</b> divide em entrada paga + promissória (ou 100% promissória — só o que foi pago conta como venda à vista), <b>Negar</b> descarta e <b>Checklist</b> guarda como pedido da fábrica (não conta como venda). O valor pode ser corrigido direto na linha.</p></div></div>

    {/* trabalhar separado: só os dos consultores ou só os do marketing */}
    <div className="cv-sep">
      {([["consultor", "🧭 Só consultores"], ["marketing", "🏬 Só marketing"], ["", "Todos"]] as const).map(([k, l]) => { const n = todos.filter(x => (!k || x.tipo === k) && x.status === "pendente").length;
        return <button key={k || "todos"} type="button" className={"cv-sep-b" + (tipo === k ? " on" : "")} onClick={() => { setTipo(k); setSel({}); try { localStorage.setItem("cv_tipo", k); } catch { /* sem armazenamento */ } }}>
          {l}<small>{n} a conferir</small></button>; })}
    </div>
    <div className="kpis" style={{ margin: "6px 0 10px" }}>
      <Kpi n={pend.length} l={"A conferir · " + brl(pend.reduce((s, x) => s + Number(x.valor), 0))} cor="var(--warn)" />
      <Kpi n={pend.filter(x => comoDe(x.como)[1] === "ok").length} l="🟢 Achadas por telefone / nº" cor="var(--st-concluida)" />
      <Kpi n={pend.filter(x => comoDe(x.como)[1] !== "ok").length} l="🟡 Por endereço / nome — conferir" cor="var(--warn)" />
      <Kpi n={validHoje.length} l={"Validadas hoje · " + brl(validHoje.reduce((s, x) => s + Number(x.valor), 0))} cor="var(--st-concluida)" />
    </div>

    <div className="cv-barra">
      <div className="chips" style={{ margin: 0 }}>{ABAS.map(([k, l]) => <button key={k} className={"chip" + (aba === k ? " on" : "")} onClick={() => setAba(k)}>{l}<span className="n">{doTipo.filter(x => k === "todas" || x.status === k).length}</span></button>)}</div>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 cliente, nº, telefone, consultor, vendedor" style={{ marginLeft: "auto", maxWidth: 300 }} />
      {aba === "pendente" && lista.length > 0 && <button className="btn sm" onClick={validarTodas}>✅ Validar todas da lista ({lista.length})</button>}
    </div>
    <div className="cv-barra">
      <span className="hint">Achado por:</span>
      <div className="chips" style={{ margin: 0 }}>
        <button className={"chip" + (!metodo ? " on" : "")} onClick={() => setMetodo("")}>Todos</button>
        {Object.keys(COMO).map(k => { const n = doTipo.filter(x => (aba === "todas" || x.status === aba) && x.como === k).length; if (!n) return null;
          return <button key={k} className={"chip cv-m " + COMO[k][1] + (metodo === k ? " on" : "")} title={COMO[k][2]} onClick={() => setMetodo(metodo === k ? "" : k)}>{COMO[k][0]}<span className="n">{n}</span></button>; })}
      </div>
      {marcadas.length > 0 && <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
        {marcadas.some(x => x.status === "pendente") && <button className="btn primary sm" onClick={validarMarcadas}>✅ Validar marcadas ({marcadas.filter(x => x.status === "pendente").length})</button>}
        <button className="btn sm cv-neg" onClick={() => excluir(marcadas)}>🗑 Excluir marcadas ({marcadas.length})</button>
        <button className="btn ghost sm" onClick={() => setSel({})}>limpar</button></span>}
    </div>

    {itens === null ? <div className="empty" style={{ padding: 30 }}>Carregando…</div> :
      <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: "72vh" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 980 }}>
          <colgroup><col style={{ width: 28 }} /><col style={{ width: "12%" }} /><col style={{ width: "17%" }} /><col style={{ width: "17%" }} /><col style={{ width: "11%" }} /><col style={{ width: "14%" }} /><col style={{ width: 130 }} /><col style={{ width: 130 }} /></colgroup>
          <thead><tr><th style={th}><input type="checkbox" style={{ width: "auto" }} checked={lista.length > 0 && lista.every(x => sel[x.numero])} onChange={e => { const n: Record<string, boolean> = {}; if (e.target.checked) lista.forEach(x => (n[x.numero] = true)); setSel(n); }} /></th><th style={th}>Venda (Exact)</th><th style={th}>Cliente comprador (Exact)</th><th style={th}>Cliente no 360 / Minha Visita</th><th style={th}>Consultor / Responsável</th><th style={th}>Vendedor</th><th style={th}>Valor</th><th style={th}>Decisão</th></tr></thead>
          <tbody>{grupos.map(g => { const c0 = cli360(g.l[0]); const ja = vendas360(c0); const pg = g.l.filter(x => x.status === "pendente");
            const cab = g.l.length > 1 || ja.length > 0;
            return <Fragment key={g.k}>
            {cab && <tr className="cv-grupo"><td colSpan={8}>
              <input type="checkbox" style={{ width: "auto", marginRight: 8 }} title="Marcar todas as vendas deste cliente" checked={g.l.every(x => sel[x.numero])} onChange={e => setSel(s => { const n = { ...s }; g.l.forEach(x => (n[x.numero] = e.target.checked)); return n; })} />
              👥 <b>{c0 ? c0.cliente : g.l[0].ex_cliente}</b>{c0 && <> <a href="#" className="hint" onClick={ev => { ev.preventDefault(); abrirDetalhe(c0.id); }}>{c0.id} · abrir ficha</a></>}
              <span className="hint"> · {g.l.length} venda{g.l.length > 1 ? "s" : ""} aqui{pg.length ? " · " + pg.length + " a conferir (" + brl(pg.reduce((s, x) => s + Number(x.valor), 0)) + ")" : ""}</span>
              {ja.length > 0 && <div className="cv-ja">📌 Já lançado no 360: {ja.map((i: any) => <span key={i.numero + i.status} className={"cv-jai " + i.status}>{i.numero} · {brl(i.valor)} · {i.status === "registrada" ? "a confirmar" : i.status}</span>)}</div>}
              {pg.length > 1 && <button className="btn primary sm" style={{ marginLeft: 10 }} onClick={async () => { if (!confirm(`Validar as ${pg.length} vendas de ${c0 ? c0.cliente : g.l[0].ex_cliente} (${brl(pg.reduce((s, x) => s + Number(x.valor), 0))})?`)) return; for (const x of pg) await decidir(x, "validar"); }}>✅ Validar as {pg.length} deste cliente</button>}
            </td></tr>}
            {g.l.map(x => { const c = chamado(x.chamado_id); const ed = valEd[x.numero]; const mudou = Number(x.valor) !== Number(x.valor_exact);
            const pendente = x.status === "pendente"; const vend = x.vendedor_id ? R.nomeUser(x.vendedor_id) : "";
            const cm = comoDe(x.como);
            const provavel = !c ? cli360(x) : null;
            return <Fragment key={x.numero}><tr className={"cv-l " + x.status + (sel[x.numero] ? " sel" : "") + (cab ? " nog" : "")}>
              <td style={td}><input type="checkbox" style={{ width: "auto" }} checked={!!sel[x.numero]} onChange={() => setSel(s => ({ ...s, [x.numero]: !s[x.numero] }))} /></td>
              <td style={td}><b>{x.numero}</b><div className="hint">{x.data ? fmtDate(x.data) : ""}</div>
                <div className="hint" style={{ color: /aguard|promiss/i.test(x.ex_situacao) ? "var(--warn)" : undefined }}>{x.ex_situacao}</div>
                {x.motivo ? <div className="hint" style={{ whiteSpace: "normal", maxWidth: 120 }}>{x.motivo}</div> : null}
                <span className={"cv-tipo " + x.tipo}>{x.tipo === "marketing" ? "🏬 Marketing" : "🧭 Consultor"}</span> <span className="hint">{x.fonte === "minha_visita" ? "Minha Visita" : "360"}</span></td>
              <td style={{ ...td, maxWidth: 210 }}><b>{x.ex_cliente || "—"}</b><div className="hint">{[x.ex_tel1, x.ex_tel2].filter(Boolean).join(" · ")}</div><div className="hint" style={{ maxWidth: 190 }}>{x.ex_end}</div></td>
              <td style={{ ...td, maxWidth: 190 }}>
                {c ? <><a href="#" onClick={e => { e.preventDefault(); abrirDetalhe(c.id); }}><b>{c.cliente}</b></a> <span className="hint">{c.id}</span></>
                  : x.fonte === "minha_visita" ? <><b>{x.mv?.nome || x.cliente_ref}</b> <span className="pill" style={{ fontSize: 11 }}>Minha Visita</span>
                    <div className="hint">{[x.mv?.telefone, x.mv?.status].filter(Boolean).join(" · ")}</div>{pendente && <div className="hint">entra no 360 ao validar</div>}</>
                  : <b>{x.cliente_ref || "—"}</b>}
                {x.como && <div><span className={"cv-como " + cm[1]} title={cm[2]}>{cm[0]}</span></div>}
                {provavel && <div className="hint">no 360: <a href="#" onClick={e => { e.preventDefault(); abrirDetalhe(provavel.id); }}>{provavel.cliente}</a> ({provavel.id}){provavel.consultorId ? " · " + R.nomeUser(provavel.consultorId) : ""}</div>}
                {!cab && vendas360(c || provavel).length > 0 && <div className="cv-ja">📌 já tem no 360: {vendas360(c || provavel).map((i: any) => <span key={i.numero + i.status} className={"cv-jai " + i.status}>{i.numero} · {brl(i.valor)}</span>)}</div>}
                {pendente && x.cands.length > 1 && <select style={{ fontSize: 12, marginTop: 4, maxWidth: 200 }} value={x.chamado_id || ""} onChange={e => editar(x, { chamado_id: e.target.value }, { chamado_id: e.target.value })}>
                  {x.cands.map(k => <option key={k.id} value={k.id}>{k.cliente} ({k.id}) · {comoDe(k.como)[0]}</option>)}</select>}
              </td>
              <td style={{ ...td, maxWidth: 120 }}>{x.consultor_id ? <b>{R.nomeUser(x.consultor_id)}</b> : x.consultor_nome ? <b>{x.consultor_nome}</b> : "—"}
                {pendente && x.fonte === "minha_visita" && !x.chamado_id && !x.consultor_id && <div><div className="hint" style={{ color: "var(--warn)" }}>escolha o consultor:</div>
                  <select style={{ fontSize: 12 }} value="" onChange={e => editar(x, { consultor_id: e.target.value }, { consultor_id: e.target.value })}><option value="">—</option>{consultores.map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>}</td>
              <td style={{ ...td, maxWidth: 150 }}><div>Exact: <b>{x.ex_vendedor || "—"}</b></div>
                {pendente ? <select style={{ fontSize: 12, width: "100%", marginTop: 2 }} value={x.vendedor_id || ""} onChange={e => editar(x, { vendedor_id: e.target.value }, { vendedor_id: e.target.value || null })}>
                  <option value="">{c?.atendenteId ? "manter " + R.nomeUser(c.atendenteId) : "sem vendedor"}</option>{vendedores.map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select>
                  : <div className="hint">360: {vend || (c?.atendenteId ? R.nomeUser(c.atendenteId) : "—")}</div>}</td>
              <td style={{ ...td, width: 130, minWidth: 130 }}>
                {pendente ? <input className="cv-valor" inputMode="decimal" value={ed !== undefined ? ed : Number(x.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  onChange={e => setValEd(v => ({ ...v, [x.numero]: e.target.value }))} onBlur={() => salvarValor(x)} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                  : <b>{brl(x.valor)}</b>}
                {mudou && <div className="hint">Exact: {brl(x.valor_exact)}</div>}
                {x.forma === "entrada" && <div className="hint">à vista {brl(Number(x.entrada))} · promissória {brl(Number(x.valor) - Number(x.entrada))}</div>}
                {Number(x.ex_total) > 0 && Number(x.ex_recebido) >= 0 && Number(x.ex_total) - Number(x.ex_recebido) > 0.5 && x.status === "pendente" && <div className="hint" style={{ color: "var(--warn)" }}>Exact: total {brl(Number(x.ex_total))}<br />recebido {brl(Number(x.ex_recebido))}</div>}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                {pendente ? <div className="cv-acoes">
                  <button className="btn primary sm" disabled={!!ocup[x.numero]} onClick={() => decidir(x, "validar")}>✅ Validar</button>
                  <button className="btn sm cv-neg" disabled={!!ocup[x.numero]} onClick={() => decidir(x, "negar")}>❌ Negar</button>
                  <button className={"btn sm" + (/promiss/i.test(x.ex_situacao) ? " cv-prom-sug" : "")} disabled={!!ocup[x.numero]} title="Entrada + promissória, ou 100% promissória" onClick={() => prom[x.numero] ? setProm(q => { const n = { ...q }; delete n[x.numero]; return n; }) : abrirProm(x)}>💳 Promissória</button>
                  <button className="btn sm" disabled={!!ocup[x.numero]} title="Pedido da fábrica de um checklist finalizado — não conta como venda" onClick={() => decidir(x, "checklist")}>📋 Checklist</button>
                </div> : <div>
                  <span className={"pill cv-st " + x.status}>{x.status === "validada" ? (x.forma === "entrada" ? "✅ entrada + promissória" : x.forma === "promissoria" ? "✅ 100% promissória" : "✅ validada") : x.status === "negada" ? "❌ negada" : "📋 checklist"}</span>
                  <div className="hint">{x.decidido_em ? new Date(x.decidido_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}{x.decidido_por ? " · " + R.nomeUser(x.decidido_por) : ""}</div>
                  {x.status !== "validada" && <button className="btn ghost sm" disabled={!!ocup[x.numero]} onClick={() => decidir(x, "reabrir")}>↩ voltar</button>}
                </div>}
              </td>
            </tr>
            {prom[x.numero] && (() => { const p = prom[x.numero]; const tot = lerValor(p.total), ent = lerValor(p.entrada), resto = Math.max(0, tot - ent);
              return <tr className="cv-prom-row"><td colSpan={8}><div className="cv-prom">
                <b>💳 Promissória · venda {x.numero}</b>
                <label>Total da venda<input inputMode="decimal" value={p.total} onChange={e => setProm(q => ({ ...q, [x.numero]: { ...p, total: e.target.value } }))} /></label>
                <label>Pago à vista (entrada)<input inputMode="decimal" value={p.entrada} onChange={e => setProm(q => ({ ...q, [x.numero]: { ...p, entrada: e.target.value } }))} /></label>
                <button className="btn ghost sm" type="button" onClick={() => setProm(q => ({ ...q, [x.numero]: { ...p, entrada: "0,00" } }))}>100% promissória</button>
                <div className="cv-prom-res">Promissória: <b>{brl(resto)}</b>{tot > 0 ? " (" + Math.round(resto / tot * 100) + "%)" : ""}<br /><span className="hint">{ent > 0 ? "Fica: Vendido — entrada + promissória" : "Fica: Vendido — 100% promissória (reserva)"}</span></div>
                <button className="btn primary sm" type="button" disabled={!!ocup[x.numero]} onClick={() => confirmarProm(x)}>✅ Confirmar promissória</button>
                <button className="btn ghost sm" type="button" onClick={() => setProm(q => { const n = { ...q }; delete n[x.numero]; return n; })}>cancelar</button>
              </div></td></tr>; })()}
            </Fragment>; })}
            </Fragment>; })}</tbody>
        </table>
        {!lista.length && <div className="empty" style={{ padding: 24 }}>{aba === "pendente" ? "Nada para conferir. Anexe o relatório do Exact em Encontrar vendas do 360 ou da Minha Visita — o que for achado aparece aqui." : "Nenhuma venda aqui."}</div>}
      </div>}
  </section>;
}
