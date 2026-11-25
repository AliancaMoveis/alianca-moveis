// ✅ Confirmação de vendas: fila única das vendas do Exact achadas nos clientes do 360 e do Minha Visita.
// Tudo que os cruzamentos acham entra aqui (sem apagar o que já estava). Na mesma tela: valida (vira venda efetivada,
// com o vendedor e o cliente comprador do Exact), nega, marca como checklist (pedido da fábrica, não conta) e corrige o valor.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { Kpi } from "./Dashboard";
import { fmtDate, fmtMoeda, itensPendentes, itensVenda, moedaDigitando, numerosVenda } from "../lib/regras";
import { tira } from "./Medidas";
import { faixa, PER, type Per } from "./VendasConsultores";
import { ehVendedor } from "../lib/vendaExact";

type Item = {
  numero: string; fonte: string; tipo: string; chamado_id: string | null; cands: { id: string; cliente: string; como: string }[]; cliente_ref: string;
  consultor_id: string | null; consultor_nome: string; mv: any; ex_cliente: string; ex_tel1: string; ex_tel2: string; ex_end: string; ex_idpessoa?: string; ex_vendedor: string;
  vendedor_id: string | null; ex_situacao: string; incluido_por?: string; _item?: string; motivo?: string; ex_total?: number | null; ex_recebido?: number | null; forma?: string; entrada?: number | null; valor: number; valor_exact: number; data: string | null; como: string; status: string; decidido_em: string | null; decidido_por: string | null; criado_em: string;
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
  // período da venda (data da situação no Exact) para priorizar: este mês, mês passado, datas à escolha
  const [per, setPer] = useState<"todas" | Per>(() => { try { return (localStorage.getItem("cv_per") as any) || "todas"; } catch { return "todas"; } });
  const [pde, setPde] = useState(""); const [pate, setPate] = useState("");
  const [ini, fim] = per === "todas" ? ["", ""] : faixa(per, pde, pate);
  // origem (quem trouxe a venda) e filtros por vendedor / consultor
  const [orig, setOrig] = useState<"" | "vendedor" | "relatorio">("");
  const [fVend, setFVend] = useState(""); const [fCons, setFCons] = useState("");
  const [lim, setLim] = useState(120); // só desenha os primeiros clientes (a tela fica leve); "Mostrar mais" abre o resto
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

  const byId = useMemo(() => new Map<string, any>((st.chamados || []).map((c: any) => [c.id, c])), [st.chamados]);
  const chamado = (id: string | null) => id ? byId.get(id) : null;
  // gerente de loja e proprietário também vendem: sem eles a venda do gerente não tinha a quem ser atribuída
  const vendedores = useMemo(() => st.usuarios.filter((u: any) => ehVendedor(u) && u.ativo).sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR")), [st.usuarios]);
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

  // vendas que o VENDEDOR lançou no cliente e ainda esperam a Gestão (não estão na fila do relatório): entram aqui para confirmar no mesmo lugar
  const doVend: Item[] = useMemo(() => {
    const na = new Set((itens || []).map(x => String(x.numero)));
    return (st.chamados || []).filter((c: any) => R.domMarketing(c) && c.venda).flatMap((c: any) => {
      const direto = R.ehDireto(c); const consId = direto ? c.solicitanteId : c.consultorId;
      return itensPendentes(c.venda).filter((i: any) => i.tipo !== "pagamento" && i.numero && !na.has(String(i.numero))).map((i: any): Item => ({
        numero: String(i.numero), fonte: "vendedor", tipo: direto ? "marketing" : "consultor", chamado_id: c.id, cands: [], cliente_ref: c.cliente,
        consultor_id: consId || null, consultor_nome: consId ? R.nomeUser(consId) : "", mv: null, ex_cliente: c.cliente, ex_tel1: c.telefone || "", ex_tel2: "", ex_end: c.endereco || "",
        ex_vendedor: c.atendenteId ? R.nomeUser(c.atendenteId) : "", vendedor_id: c.atendenteId || null, ex_situacao: "Lançada pelo vendedor", valor: Number(i.valor) || 0, valor_exact: Number(i.valor) || 0,
        data: String(i.dataVenda || c.venda.dataVenda || "").slice(0, 10) || null, como: "venda", status: "pendente", decidido_em: null, decidido_por: null, criado_em: String(i.registradoEm || ""),
        motivo: "lançada pelo vendedor — aguardando a Gestão", _item: i.id }));
    });
  }, [st.chamados, itens]);
  const todos = useMemo(() => [...(itens || []), ...doVend], [itens, doVend]);
  /**
   * Vendas que JÁ ESTÃO lançadas num cliente do 360, por nº.
   * Elas continuam aparecendo aqui como "a conferir" e não têm nenhuma marca — validar de
   * novo é comissão dobrada. Em 25/11/2026 eram 120 na fila, 77 já efetivadas.
   * Ficam escondidas do "a conferir" e só aparecem no filtro próprio.
   */
  const lancadas = useMemo(() => {
    const m = new Map<string, { status: string; id: string; cliente: string }>();
    (st.chamados || []).forEach((c: any) => itensVenda(c.venda).forEach((i: any) => {
      // SÓ efetivada. "registrada" é a venda que o vendedor lançou e ESPERA a aprovação da
      // Gestão — é justamente o que tem que aparecer para conferir; escondê-la junto com as
      // já contadas sumiu com 54 clientes da fila. "cancelada" também não conta como lançada.
      if (i.tipo === "pagamento" || !i.numero || i.status !== "efetivada") return;
      m.set(String(i.numero), { status: "efetivada", id: c.id, cliente: c.cliente || "" });
    }));
    return m;
  }, [st.chamados]);
  const jaLancada = (x: Item) => (x.status === "pendente" ? lancadas.get(x.numero) : undefined);
  /** vendas já efetivadas de cada cliente, para achar a mesma venda com outro número */
  const efetivadasDoCliente = useMemo(() => {
    const m = new Map<string, { numero: string; valor: number }[]>();
    (st.chamados || []).forEach((c: any) => itensVenda(c.venda).forEach((i: any) => {
      if (i.tipo === "pagamento" || i.status !== "efetivada" || !i.numero) return;
      (m.get(c.id) || m.set(c.id, []).get(c.id)!).push({ numero: String(i.numero), valor: Number(i.valor) || 0 });
    }));
    return m;
  }, [st.chamados]);
  const mesCorrente = new Date().toISOString().slice(0, 7);
  /**
   * O Exact às vezes refaz a venda com outro número e o valor quase igual. O cliente já tem
   * a venda lançada e efetivada, e a "nova" é a mesma coisa — validar as duas paga em dobro.
   * Caso real: Daniele Venski, 1314485 efetivada R$ 22.000 e 1314477 pendente R$ 21.910.
   * Só vale para mês anterior: no mês corrente a Gestão está validando e quer ver tudo.
   */
  const provavelDup = (x: Item) => {
    if (x.status !== "pendente" || !x.chamado_id) return undefined;
    if (String(x.data || x.criado_em || "").slice(0, 7) >= mesCorrente) return undefined;
    const v = Number(x.valor) || 0; if (v <= 0) return undefined;
    return (efetivadasDoCliente.get(x.chamado_id) || []).find(i =>
      i.numero !== x.numero && i.valor > 0 && Math.abs(i.valor - v) / Math.max(i.valor, v) <= 0.05);
  };
  /** fora do "a conferir": já lançada (mesmo nº) ou provável duplicata (outro nº, valor quase igual) */
  const foraDaFila = (x: Item) => jaLancada(x) ? "lancada" : provavelDup(x) ? "dup" : "";
  const [verLancadas, setVerLancadas] = useState(false);
  const lancouVendedor = (x: Item) => x.fonte === "vendedor" || /lançada/i.test(x.motivo || "");
  const nomeVend = (x: Item) => (x.vendedor_id ? R.nomeUser(x.vendedor_id) : x.ex_vendedor) || "";
  const nomeCons = (x: Item) => (x.consultor_id ? R.nomeUser(x.consultor_id) : x.consultor_nome) || "";
  const gkMap = useMemo(() => { const m = new Map<string, string>(); todos.forEach(x => m.set(x.numero, gk(x))); return m; }, [todos, idx, byId]);
  const gkDe = (x: Item) => gkMap.get(x.numero) ?? gk(x);
  const doTipo = useMemo(() => todos.filter(x => (!tipo || x.tipo === tipo) && (!orig || (orig === "vendedor") === lancouVendedor(x)) && (!fVend || nomeVend(x) === fVend) && (!fCons || nomeCons(x) === fCons) && (per === "todas" || (!!x.data && String(x.data).slice(0, 10) >= ini && String(x.data).slice(0, 10) <= fim))), [todos, tipo, orig, fVend, fCons, per, ini, fim]);
  const busca = tira(q), dig = q.replace(/\D/g, "");
  const lista = doTipo.filter(x => (aba === "todas" || x.status === aba) && (!metodo || x.como === metodo)
    && (verLancadas ? !!foraDaFila(x) : !foraDaFila(x))
    && (!q || tira([x.ex_cliente, x.cliente_ref, chamado(x.chamado_id)?.cliente || "", x.consultor_nome, x.ex_vendedor].join(" ")).includes(busca) || (dig.length >= 3 && (x.numero.includes(dig) || (x.ex_tel1 + x.ex_tel2).replace(/\D/g, "").includes(dig)))))
    .sort((a, b) => tira(a.ex_cliente).localeCompare(tira(b.ex_cliente)) || a.numero.localeCompare(b.numero));
  // agrupa as vendas do mesmo cliente (ordem alfabética do comprador)
  const grupos = (() => { const m = new Map<string, Item[]>(); lista.forEach(x => { const k = gkDe(x); const a = m.get(k); if (a) a.push(x); else m.set(k, [x]); });
    return Array.from(m.entries()).map(([k, l]) => ({ k, l, nome: tira(l[0].ex_cliente) })).sort((a, b) => a.nome.localeCompare(b.nome)); })();
  const pend = doTipo.filter(x => x.status === "pendente" && !foraDaFila(x));
  const pendLancadas = doTipo.filter(x => !!foraDaFila(x));
  /** quanto está parado em cada mês de venda — é o que decide o que ainda dá para pagar neste comissionamento */
  const porMes = (() => {
    const m: Record<string, { n: number; v: number }> = {};
    todos.filter(x => x.status === "pendente" && !foraDaFila(x) && (!tipo || x.tipo === tipo)).forEach(x => {
      const k = String(x.data || x.criado_em || "").slice(0, 7) || "sem data";
      (m[k] = m[k] || { n: 0, v: 0 }).n++; m[k].v += Number(x.valor) || 0;
    });
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0]));
  })();
  const mesNome = (k: string) => { const [a, b] = k.split("-"); return b ? ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(b) - 1] + "/" + a.slice(2) : k; };
  /** vendas do mesmo cliente caídas no mesmo dia — candidatas a ser uma venda só, partida em vários números */
  const mesmoDia = (l: Item[]): [string, Item[]][] => {
    const m: Record<string, Item[]> = {};
    l.forEach(x => { const d = String(x.data || "").slice(0, 10); if (d) (m[d] = m[d] || []).push(x); });
    return Object.entries(m).filter(([, v]) => v.length > 1).sort((a, b) => b[0].localeCompare(a[0]));
  };
  const gruposVis = (() => { let n = 0; const out: typeof grupos = []; for (const g of grupos) { if (n >= lim) break; out.push(g); n += g.l.length; } return out; })();
  // resumo por consultor (respeita período, origem e vendedor; não o filtro de consultor, para poder trocar de consultor)
  const resCons = (() => { const m: Record<string, { p: number; vp: number; v: number }> = {};
    todos.filter(x => (!tipo || x.tipo === tipo) && (!orig || (orig === "vendedor") === lancouVendedor(x)) && (!fVend || nomeVend(x) === fVend) && (per === "todas" || (!!x.data && String(x.data).slice(0, 10) >= ini && String(x.data).slice(0, 10) <= fim)))
      .forEach(x => { const k = nomeCons(x) || "— sem consultor"; const o = m[k] = m[k] || { p: 0, vp: 0, v: 0 }; if (x.status === "pendente") { o.p++; o.vp += Number(x.valor) || 0; } else if (x.status === "validada") o.v++; });
    return Object.entries(m).sort((a, b) => b[1].p - a[1].p || b[1].v - a[1].v); })();
  // dinheiro do cliente: efetivadas = entrou de fato; reservas com promissória = combinado (inclui o que ainda vai entrar). Falta = reservas − efetivadas (só sugestão)
  const porCli = useMemo(() => { const m = new Map<string, Item[]>(); doTipo.forEach(i => { const k = gkMap.get(i.numero) ?? gk(i); const a = m.get(k); if (a) a.push(i); else m.set(k, [i]); }); return m; }, [doTipo, gkMap]);
  const resumoCli = (k: string) => { const l = porCli.get(k) || []; const rec = (i: Item) => Number(i.ex_recebido) || 0;
    const ef = l.filter(i => /^efetiv/i.test(i.ex_situacao)).reduce((s, i) => s + rec(i), 0);
    const rs = l.filter(i => /reserva|promiss/i.test(i.ex_situacao)).reduce((s, i) => s + rec(i), 0);
    return { ef, rs, falta: ef > 0 && rs > ef ? rs - ef : rs > 0 && ef === 0 ? rs : 0, tem: rs > 0 && l.length > 0, n: l.length }; };
  const hoje = new Date().toISOString().slice(0, 10);
  const validHoje = doTipo.filter(x => x.status === "validada" && String(x.decidido_em || "").slice(0, 10) === hoje);

  const troca = (numero: string, patch: Partial<Item>) => setItens(l => (l || []).map(x => x.numero === numero ? { ...x, ...patch } : x));
  async function decidir(x: Item, acao: "validar" | "negar" | "checklist" | "reabrir") {
    if (ocup[x.numero]) return;
    if (x.fonte === "vendedor") { // lançada pelo vendedor: a Gestão efetiva (ou cancela) o item no cliente
      if (acao === "checklist" || acao === "reabrir") { toast("Para esta venda use a ficha do cliente"); return; }
      setOcup(o => ({ ...o, [x.numero]: true }));
      try { await A.decidirItensVenda(x.chamado_id as string, [{ id: x._item, status: acao === "validar" ? "efetivada" : "cancelada" }]); await recarregar(); toast("Venda " + x.numero + (acao === "validar" ? " efetivada" : " cancelada")); }
      catch (e: any) { toast(x.numero + ": " + (e.message || "não deu certo")); } finally { setOcup(o => ({ ...o, [x.numero]: false })); }
      return;
    }
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
    <div className="card" style={{ padding: "12px 14px", margin: "6px 0 12px", borderLeft: "4px solid var(--primary)" }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>📅 Período da venda <span className="hint" style={{ fontWeight: 500 }}>— escolha para priorizar; o número é quanto ainda falta conferir</span></div>
      <div className="chips" style={{ margin: 0 }}>
        {([["todas", "Todas as datas"], ...PER] as [string, string][]).map(([k, l]) => {
          const [a0, a1] = k === "todas" ? ["", ""] : faixa(k as Per, pde, pate);
          const n = todos.filter(x => (!tipo || x.tipo === tipo) && x.status === "pendente" && (k === "todas" || (!!x.data && String(x.data).slice(0, 10) >= a0 && String(x.data).slice(0, 10) <= a1))).length;
          return <button key={k} className={"chip" + (per === k ? " on" : "")} style={{ fontSize: 14, padding: "7px 14px" }}
            onClick={() => { setPer(k as any); setSel({}); try { localStorage.setItem("cv_per", k); } catch { /* sem armazenamento */ } }}>{l}{k !== "outro" && <span className="n">{n}</span>}</button>; })}
      </div>
      {per === "outro" && <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <input type="date" value={pde} max={pate || undefined} onChange={e => setPde(e.target.value)} style={{ width: "auto" }} /> até
        <input type="date" value={pate} min={pde || undefined} onChange={e => setPate(e.target.value)} style={{ width: "auto" }} /></div>}
      {per !== "todas" && <div className="hint" style={{ marginTop: 6 }}>Mostrando vendas de <b>{fmtDate(ini)}</b> a <b>{fmtDate(fim)}</b>{todos.length - doTipo.length > 0 ? " · " + (todos.length - doTipo.length) + " fora deste período" : ""}</div>}
    </div>
    <div className="card" style={{ padding: "12px 14px", margin: "0 0 12px", borderLeft: "4px solid var(--st-concluida)" }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>🧭 Quem trouxe a venda <span className="hint" style={{ fontWeight: 500 }}>— o número é quanto ainda falta conferir</span></div>
      <div className="chips" style={{ margin: 0 }}>
        {([["", "Todas"], ["vendedor", "🧑‍💼 Vendedor lançou"], ["relatorio", "🔎 Só pelo relatório do Exact"]] as [string, string][]).map(([k, l]) => {
          const n = todos.filter(x => (!tipo || x.tipo === tipo) && x.status === "pendente" && (!k || (k === "vendedor") === lancouVendedor(x))).length;
          return <button key={k || "t"} className={"chip" + (orig === k ? " on" : "")} style={{ fontSize: 14, padding: "7px 14px" }} onClick={() => { setOrig(k as any); setSel({}); }}>{l}<span className="n">{n}</span></button>; })}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label className="hint">Vendedor <select value={fVend} onChange={e => { setFVend(e.target.value); setSel({}); }} style={{ width: "auto", marginLeft: 4 }}><option value="">todos</option>
            {Array.from(new Set(todos.filter(x => !tipo || x.tipo === tipo).map(nomeVend).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")).map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <label className="hint">Consultor <select value={fCons} onChange={e => { setFCons(e.target.value); setSel({}); }} style={{ width: "auto", marginLeft: 4 }}><option value="">todos</option>
            {Array.from(new Set(todos.filter(x => !tipo || x.tipo === tipo).map(nomeCons).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")).map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          {(orig || fVend || fCons) && <button className="btn ghost sm" onClick={() => { setOrig(""); setFVend(""); setFCons(""); }}>limpar filtros</button>}
        </span>
      </div>
      {resCons.length > 0 && <div className="ev-resumo" style={{ marginTop: 10 }}>{resCons.map(([k, x]) => <button key={k} className={"ev-res" + (fCons === k ? " on" : "")} onClick={() => { setFCons(fCons === k ? "" : k); setSel({}); }}>
        <b>{k}</b><span>{x.p} a conferir · {brl(x.vp)}</span><small>{x.v} já validada(s)</small></button>)}</div>}
    </div>
    <div className="kpis" style={{ margin: "6px 0 10px" }}>
      <Kpi n={pend.length} l={"A conferir · " + brl(pend.reduce((s, x) => s + Number(x.valor), 0))} cor="var(--warn)" />
      <Kpi n={pend.filter(x => comoDe(x.como)[1] === "ok").length} l="🟢 Achadas por telefone / nº" cor="var(--st-concluida)" />
      <Kpi n={pend.filter(x => comoDe(x.como)[1] !== "ok").length} l="🟡 Por endereço / nome — conferir" cor="var(--warn)" />
      <Kpi n={validHoje.length} l={"Validadas hoje · " + brl(validHoje.reduce((s, x) => s + Number(x.valor), 0))} cor="var(--st-concluida)" />
    </div>
    {/* quanto está parado em cada mês: venda de mês passado validada agora entra no comissionamento deste mês */}
    {porMes.length > 1 && <div className="ev-resumo" style={{ marginBottom: 10 }}>
      {porMes.map(([k, x]) => <button key={k} className={"ev-res" + (per === "todas" && false ? " on" : "")} onClick={() => { setQ(""); setMetodo(""); setAba("pendente"); setPer("outro"); setPde(k + "-01"); setPate(new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).toISOString().slice(0, 10)); }}>
        <b>{mesNome(k)}</b><span>{x.n} a conferir · {brl(x.v)}</span><small>clique para ver só este mês</small></button>)}
    </div>}
    {pendLancadas.length > 0 && <div className="card" style={{ marginBottom: 10, borderColor: "var(--warn)", background: "var(--st-pendente-bg, #fff8e6)" }}>
      <b>⚠️ {pendLancadas.length} venda(s) fora do "a conferir"</b>
      <div className="hint" style={{ marginTop: 2 }}>
        {pendLancadas.filter(x => jaLancada(x)).length} já estão lançadas no 360 com o mesmo número
        {pendLancadas.some(x => provavelDup(x)) && <> · {pendLancadas.filter(x => provavelDup(x)).length} são de mês anterior e o cliente já tem uma venda efetivada de valor quase igual (provável a mesma venda com outro número)</>}
        . Validar contaria a comissão duas vezes.</div>
      <div style={{ marginTop: 6 }}><button className={"btn sm" + (verLancadas ? " primary" : "")} onClick={() => { setVerLancadas(v => !v); setSel({}); }}>
        {verLancadas ? "← Voltar para as que faltam conferir" : "Ver as já lançadas"}</button></div>
    </div>}

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
          <tbody>{gruposVis.map(g => { const c0 = cli360(g.l[0]); const ja = vendas360(c0); const pg = g.l.filter(x => x.status === "pendente");
            const rcli = resumoCli(g.k); const cab = g.l.length > 1 || ja.length > 0 || rcli.tem;
            return <Fragment key={g.k}>
            {cab && <tr className="cv-grupo"><td colSpan={8}>
              <input type="checkbox" style={{ width: "auto", marginRight: 8 }} title="Marcar todas as vendas deste cliente" checked={g.l.every(x => sel[x.numero])} onChange={e => setSel(s => { const n = { ...s }; g.l.forEach(x => (n[x.numero] = e.target.checked)); return n; })} />
              👥 <b>{c0 ? c0.cliente : g.l[0].ex_cliente}</b>{c0 && <> <a href="#" className="hint" onClick={ev => { ev.preventDefault(); abrirDetalhe(c0.id); }}>{c0.id} · abrir ficha</a></>}
              <span className="hint"> · {g.l.length} venda{g.l.length > 1 ? "s" : ""} aqui{pg.length ? " · " + pg.length + " a conferir (" + brl(pg.reduce((s, x) => s + Number(x.valor), 0)) + ")" : ""}</span>
              {(rcli.tem || rcli.n > 1) && <div className="hint" style={{ marginTop: 4 }}>
                💰 Entrou de fato (efetivadas): <b>{brl(rcli.ef)}</b>{rcli.rs > 0 && <> · Combinado nas reservas: <b>{brl(rcli.rs)}</b> · <span style={{ color: "var(--warn)" }}>Falta receber (sugestão — conferir): <b>{brl(rcli.falta)}</b></span></>}
                <span> · a soma de vendas conta só o que entrou de fato</span></div>}
              {ja.length > 0 && <div className="cv-ja">📌 Já lançado no 360: {ja.map((i: any) => <span key={i.numero + i.status} className={"cv-jai " + i.status}>{i.numero} · {brl(i.valor)} · {i.status === "registrada" ? "a confirmar" : i.status}</span>)}</div>}
              {/* O Exact abre um número por ambiente ou por forma de pagamento. Duas vendas do
                  mesmo cliente no MESMO dia costumam ser a mesma venda partida — validar as duas
                  paga a comissão duas vezes. Em 25/11/2026 eram 33 clientes e R$ 1 mi nessa situação. */}
              {mesmoDia(pg).map(([d, l]) => <div key={d} style={{ marginTop: 4, color: "var(--warn)", fontWeight: 700, fontSize: 12 }}>
                ⚠️ {l.length} vendas deste cliente no mesmo dia ({fmtDate(d)}): {l.map(i => i.numero).join(", ")} · {brl(l.reduce((s, i) => s + Number(i.valor), 0))}
                <span style={{ fontWeight: 400 }}> — confira no Exact se não é a mesma venda dividida em vários números antes de validar as duas</span></div>)}
              {pg.length > 1 && <button className="btn primary sm" style={{ marginLeft: 10 }} onClick={async () => {
                const dup = mesmoDia(pg);
                // validar em lote é justamente onde a venda partida vira comissão dobrada: avisa antes
                const aviso = dup.length ? `\n\nATENÇÃO: ${dup.map(([d, l]) => `${l.length} delas são do mesmo dia (${fmtDate(d)}): ${l.map(i => i.numero).join(", ")}`).join("; ")}.\nSe for a mesma venda dividida em vários números, validar todas paga a comissão mais de uma vez.` : "";
                if (!confirm(`Validar as ${pg.length} vendas de ${c0 ? c0.cliente : g.l[0].ex_cliente} (${brl(pg.reduce((s, x) => s + Number(x.valor), 0))})?${aviso}`)) return;
                for (const x of pg) await decidir(x, "validar"); }}>✅ Validar as {pg.length} deste cliente</button>}
            </td></tr>}
            {g.l.map(x => { const c = chamado(x.chamado_id); const ed = valEd[x.numero]; const mudou = Number(x.valor) !== Number(x.valor_exact);
            const pendente = x.status === "pendente"; const vend = x.vendedor_id ? R.nomeUser(x.vendedor_id) : "";
            const cm = comoDe(x.como);
            const jl = jaLancada(x); // esta venda já está lançada num cliente — não pode validar de novo
            const dup = !jl ? provavelDup(x) : undefined; // mesma venda com outro número
            const provavel = !c ? cli360(x) : null;
            return <Fragment key={x.numero}><tr className={"cv-l " + x.status + (sel[x.numero] ? " sel" : "") + (cab ? " nog" : "")}>
              <td style={td}><input type="checkbox" style={{ width: "auto" }} checked={!!sel[x.numero]} onChange={() => setSel(s => ({ ...s, [x.numero]: !s[x.numero] }))} /></td>
              <td style={td}><b>{x.numero}</b><div className="hint">{x.data ? fmtDate(x.data) : ""}</div>
                <div className="hint" style={{ color: /aguard|promiss/i.test(x.ex_situacao) ? "var(--warn)" : undefined }}>{x.ex_situacao}</div>
                {x.incluido_por ? <div className="hint" title="Quem incluiu a venda no Exact" style={{ color: /^checklist/i.test(x.incluido_por) ? "#6b4fbb" : undefined }}>incluído por {x.incluido_por}</div> : null}
                {x.motivo ? <div className="hint" style={{ whiteSpace: "normal", maxWidth: 120 }}>{x.motivo}</div> : null}
                {lancouVendedor(x) ? <div><span className="pill" style={{ fontSize: 11, background: "#e8f1ff", color: "#284b8f" }}>🧑‍💼 Vendedor lançou</span></div> : <div><span className="pill" style={{ fontSize: 11 }}>🔎 Pelo relatório</span></div>}
                <span className={"cv-tipo " + x.tipo}>{x.tipo === "marketing" ? "🏬 Marketing" : "🧭 Consultor"}</span> <span className="hint">{x.fonte === "minha_visita" ? "Minha Visita" : "360"}</span></td>
              <td style={{ ...td, maxWidth: 210 }}><b>{x.ex_cliente || "—"}</b><div className="hint">{[x.ex_tel1, x.ex_tel2].filter(Boolean).join(" · ")}</div><div className="hint" style={{ maxWidth: 190 }}>{x.ex_end}</div></td>
              <td style={{ ...td, maxWidth: 190 }}>
                {c ? <><a href="#" onClick={e => { e.preventDefault(); abrirDetalhe(c.id); }}><b>{c.cliente}</b></a> <span className="hint">{c.id}</span></>
                  : x.fonte === "minha_visita" ? <><b>{x.mv?.nome || x.cliente_ref}</b> <span className="pill" style={{ fontSize: 11 }}>Minha Visita</span>
                    <div className="hint">{[x.mv?.telefone, x.mv?.status].filter(Boolean).join(" · ")}</div>{pendente && <div className="hint">entra no 360 ao validar</div>}</>
                  : <b>{x.cliente_ref || "—"}</b>}
                {x.como && <div><span className={"cv-como " + cm[1]} title={cm[2]}>{cm[0]}</span></div>}
                {provavel && <div className="hint">no 360: <a href="#" onClick={e => { e.preventDefault(); abrirDetalhe(provavel.id); }}>{provavel.cliente}</a> ({provavel.id}){provavel.consultorId ? " · " + R.nomeUser(provavel.consultorId) : ""}</div>}
                {jl && <div style={{ color: "var(--warn)", fontWeight: 700, fontSize: 12, marginTop: 2 }}>
                  ⚠️ a venda {x.numero} já está lançada em <a href="#" onClick={e => { e.preventDefault(); abrirDetalhe(jl.id); }}>{jl.cliente || jl.id}</a>
                  {jl.status === "efetivada" ? " (efetivada)" : jl.status ? " (" + jl.status + ")" : ""} — validar aqui contaria a comissão duas vezes</div>}
                {dup && <div style={{ color: "var(--warn)", fontWeight: 700, fontSize: 12, marginTop: 2 }}>
                  ⚠️ provável a mesma venda: este cliente já tem a venda {dup.numero} efetivada por {brl(dup.valor)}, e esta é de {brl(Number(x.valor))} — confira no Exact antes de validar</div>}
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
                {pendente && x.fonte !== "vendedor" ? <input className="cv-valor" inputMode="decimal" value={ed !== undefined ? ed : Number(x.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  onChange={e => setValEd(v => ({ ...v, [x.numero]: moedaDigitando(e.target.value) }))} onBlur={() => salvarValor(x)} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                  : <b>{brl(x.valor)}</b>}
                {mudou && <div className="hint">Exact: {brl(x.valor_exact)}</div>}
                {x.forma === "entrada" && <div className="hint">à vista {brl(Number(x.entrada))} · promissória {brl(Number(x.valor) - Number(x.entrada))}</div>}
                {Number(x.ex_total) > 0 && Number(x.ex_recebido) >= 0 && Number(x.ex_total) - Number(x.ex_recebido) > 0.5 && x.status === "pendente" && <div className="hint" style={{ color: "var(--warn)" }}>Exact: total {brl(Number(x.ex_total))}<br />recebido {brl(Number(x.ex_recebido))}</div>}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                {pendente ? <div className="cv-acoes">
                  <button className="btn primary sm" disabled={!!ocup[x.numero]} onClick={() => decidir(x, "validar")}>✅ Validar</button>
                  <button className="btn sm cv-neg" disabled={!!ocup[x.numero]} onClick={() => decidir(x, "negar")}>❌ Negar</button>
                  {x.fonte !== "vendedor" && <button className={"btn sm" + (/promiss/i.test(x.ex_situacao) ? " cv-prom-sug" : "")} disabled={!!ocup[x.numero]} title="Entrada + promissória, ou 100% promissória" onClick={() => prom[x.numero] ? setProm(q => { const n = { ...q }; delete n[x.numero]; return n; }) : abrirProm(x)}>💳 Promissória</button>}
                  {x.fonte !== "vendedor" && <button className="btn sm" disabled={!!ocup[x.numero]} title="Pedido da fábrica de um checklist finalizado — não conta como venda" onClick={() => decidir(x, "checklist")}>📋 Checklist</button>}
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
                <label>Total da venda<input inputMode="decimal" value={p.total} onChange={e => setProm(q => ({ ...q, [x.numero]: { ...p, total: moedaDigitando(e.target.value) } }))} /></label>
                <label>Pago à vista (entrada)<input inputMode="decimal" value={p.entrada} onChange={e => setProm(q => ({ ...q, [x.numero]: { ...p, entrada: moedaDigitando(e.target.value) } }))} /></label>
                <button className="btn ghost sm" type="button" onClick={() => setProm(q => ({ ...q, [x.numero]: { ...p, entrada: "0,00" } }))}>100% promissória</button>
                <div className="cv-prom-res">Promissória: <b>{brl(resto)}</b>{tot > 0 ? " (" + Math.round(resto / tot * 100) + "%)" : ""}<br /><span className="hint">{ent > 0 ? "Fica: Vendido — entrada + promissória" : "Fica: Vendido — 100% promissória (reserva)"}</span></div>
                <button className="btn primary sm" type="button" disabled={!!ocup[x.numero]} onClick={() => confirmarProm(x)}>✅ Confirmar promissória</button>
                <button className="btn ghost sm" type="button" onClick={() => setProm(q => { const n = { ...q }; delete n[x.numero]; return n; })}>cancelar</button>
              </div></td></tr>; })()}
            </Fragment>; })}
            </Fragment>; })}</tbody>
        </table>
        {gruposVis.length < grupos.length && <div style={{ padding: 12, textAlign: "center" }}><button className="btn sm" onClick={() => setLim(l => l + 120)}>Mostrar mais ({grupos.length - gruposVis.length} clientes)</button></div>}
        {!lista.length && <div className="empty" style={{ padding: 24 }}>{aba === "pendente" ? "Nada para conferir. O relatório do Exact é puxado sozinho em Encontrar vendas — o que for achado aparece aqui." : "Nenhuma venda aqui."}</div>}
      </div>}
  </section>;
}
