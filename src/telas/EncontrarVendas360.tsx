// Encontrar vendas do 360: cruza o relatório de vendas do Exact com os clientes do ALIANÇA 360 (consultores e marketing).
// Cruza pelo nº da venda já lançado, pelo telefone (8 últimos dígitos) e pelo nome. O que vale é o Exact: nº, valor,
// situação e VENDEDOR — ao confirmar, a venda entra no 360 já efetivada pela Gestão e o vendedor do cliente é corrigido.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { Kpi } from "./Dashboard";
import { col, lerArquivo, mesmoNome, tira } from "./Medidas";
import { tipoPlanilha, type Linha } from "../lib/cruzarVendas";
import { camposExact } from "../lib/vendaExact";
import { baixarXlsx } from "../lib/planilha";
import { STATUS_CLIENTE, fmtDate, fmtMoeda, itensVenda } from "../lib/regras";

const so = (s: string) => (s || "").replace(/\D/g, "");
const k8 = (s: string) => { const d = so(s); return d.length >= 8 ? d.slice(-8) : ""; };
const SEM = new Set(["DA", "DE", "DO", "DAS", "DOS", "E"]);
const toks = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s*[-–(].*$/, "").replace(/[^A-Z ]/g, " ").split(/\s+/).filter(t => t.length > 1 && !SEM.has(t));
const nomeK = (s: string) => { const t = toks(s); return t.length >= 2 ? t[0] + " " + t[t.length - 1] : ""; };
const num = (s: string) => { const n = Number(String(s || "").replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return isFinite(n) ? n : 0; };
const isoBr = (s: string) => { const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + "-" + m[2] + "-" + m[1] : ""; };

type Como = "venda" | "telefone" | "nome";
const COMO: Record<Como, [string, string]> = { venda: ["🧾 nº da venda", "#0f8a5f"], telefone: ["📞 telefone", "#0f8a5f"], nome: ["👤 só o nome", "#b8802a"] };
type Res = { ex: Linha; n: string; data: string; sit: string; vend: string; valor: number; cands: { c: any; como: Como }[]; sel: number; vendU: any | null };

export default function EncontrarVendas360() {
  const { R, st, toast, abrirDetalhe, executar, recarregar } = useApp() as any;
  const inp = useRef<HTMLInputElement>(null);
  const [arqs, setArqs] = useState<{ nome: string; linhas: Linha[] }[]>([]);
  const [escolha, setEscolha] = useState<Record<string, number>>({});
  const [aba, setAba] = useState<"cons" | "mkt" | "nada">("cons");
  const [f, setF] = useState<"todas" | "confirmar" | "ok" | "vend">("confirmar");
  const [q, setQ] = useState(""); const [sel, setSel] = useState<Record<string, boolean>>({}); const [rodando, setRodando] = useState("");
  const gestao = R.ehGestao();
  // vendas do Exact que são de CHECKLIST finalizado (pedido da fábrica, outro nº): não são venda nova, ficam guardadas à parte
  const [ckl, setCkl] = useState<Record<string, any>>({});
  const lerCkl = async () => { try { const l = await A.exactChecklistLista(); setCkl(Object.fromEntries((l || []).map((x: any) => [String(x.numero), x]))); } catch { /* sem acesso */ } };
  useEffect(() => { if (gestao) lerCkl(); }, [gestao]);
  // vendedor escolhido à mão quando o nome do Exact não bate com ninguém do 360
  const [vendMan, setVendMan] = useState<Record<string, string>>({});

  async function add(files: FileList | null) {
    for (const file of Array.from(files || [])) {
      try {
        const l = await lerArquivo(file);
        if (!l.length) { toast(file.name + ": planilha vazia"); continue; }
        if (tipoPlanilha(l) !== "exact") { toast(file.name + ": não é o relatório de vendas do Exact (colunas ID, SituaçãoVenda, Vendedor, ClienteTel1…)"); continue; }
        setArqs(x => x.some(a => a.nome === file.name && a.linhas.length === l.length) ? x : [...x, { nome: file.name, linhas: l }]);
      } catch (e: any) { toast("Não consegui ler " + file.name + ": " + e.message); }
    }
  }

  // vendedores do 360 (pelo nome do Exact: 1º nome + outro nome igual; ou só o 1º nome, se for único)
  const vendedores = useMemo(() => st.usuarios.filter((u: any) => (u.setores || []).includes("atendente_cliente")), [st.usuarios]);
  const acharVend = (nomeEx: string) => {
    const t = toks(nomeEx); if (!t.length) return null;
    const cand = vendedores.map((u: any) => ({ u, t: toks((u.nomeCompleto || "") + " " + u.nome), n: toks(u.nome) })).filter((x: any) => x.n.length && (
      x.n[0] === t[0] || (x.n[0].length >= 4 && x.n[0].slice(0, 4) === t[0].slice(0, 4)) || (x.n[0].slice(0, 2) === t[0].slice(0, 2) && x.t.slice(1).some((y: string) => t.includes(y))))
      && x.n.slice(1).every((y: string) => t.includes(y))); // "Leandro Barreto" não é "Leandro Lopes"
    const exato = cand.filter((x: any) => x.n[0] === t[0]); const base = exato.length ? exato : cand;
    const forte = base.filter((x: any) => x.t.slice(1).some((y: string) => t.slice(1).includes(y)));
    const pool = forte.length ? forte : base;
    const ativos = pool.filter((x: any) => x.u.ativo);
    const fim = ativos.length ? ativos : pool;
    return fim.length === 1 ? fim[0].u : null;
  };

  const res: Res[] = useMemo(() => {
    const linhas = arqs.flatMap(a => a.linhas); if (!linhas.length) return [];
    const base = st.chamados.filter((c: any) => R.domMarketing(c));
    const porTel: Record<string, any[]> = {}, porNum: Record<string, any[]> = {}, porNome: Record<string, any[]> = {};
    const add = (m: Record<string, any[]>, k: string, c: any) => { if (k && !(m[k] || []).includes(c)) (m[k] = m[k] || []).push(c); };
    base.forEach((c: any) => {
      String(c.telefone || "").split(/[\/,;]| e /).forEach((t: string) => add(porTel, k8(t), c));
      if (c.venda) [c.venda.numero, ...itensVenda(c.venda).map((i: any) => i.numero)].forEach((n: any) => add(porNum, so(String(n || "")), c));
      add(porNome, nomeK(c.cliente), c);
    });
    const vistos = new Set<string>(); const out: Res[] = [];
    linhas.forEach(ex => {
      const n = so(col(ex, "ID")); if (!n || vistos.has(n)) return; vistos.add(n);
      const cands: { c: any; como: Como }[] = [];
      const push = (c: any, como: Como) => { if (!cands.some(x => x.c.id === c.id)) cands.push({ c, como }); };
      (porNum[n] || []).forEach(c => push(c, "venda"));
      [col(ex, "ClienteTel1"), col(ex, "ClienteTel2")].forEach(t => (porTel[k8(t)] || []).forEach(c => push(c, "telefone")));
      (porNome[nomeK(col(ex, "Cliente"))] || []).forEach(c => push(c, "nome"));
      const data = isoBr(col(ex, "DataSituação", "IncluidaEm"));
      const ord = { venda: 0, telefone: 1, nome: 2 } as const;
      cands.sort((a, b) => ord[a.como] - ord[b.como] || Number(!!b.c.venda) - Number(!!a.c.venda) || String(b.c.dataLoja || b.c.criadoEm).localeCompare(String(a.c.dataLoja || a.c.criadoEm)));
      const vend = col(ex, "Vendedor").trim();
      out.push({ ex, n, data, sit: col(ex, "SituaçãoVenda").trim(), vend, valor: num(col(ex, "ValorTotaRecebido")) || num(col(ex, "ValorTotal")), cands, sel: 0, vendU: acharVend(vend) });
    });
    return out.sort((a, b) => b.data.localeCompare(a.data));
  }, [arqs, st.chamados, vendedores]);

  const alvo = (r: Res) => r.cands[escolha[r.n] ?? 0]?.c || null;
  const origem = (r: Res) => { const c = alvo(r); return !c ? "nada" : R.ehDireto(c) ? "mkt" : "cons"; };
  const itemDe = (r: Res) => { const c = alvo(r); return c && c.venda ? itensVenda(c.venda).find((i: any) => so(String(i.numero)) === r.n && i.status !== "cancelada") || (so(String(c.venda.numero)) === r.n && c.venda.status !== "cancelada" ? { status: c.venda.status === "registrada" ? "registrada" : "efetivada" } : null) : null; };
  const estado = (r: Res): "ok" | "lancada" | "nova" => { const i: any = itemDe(r); return !i ? "nova" : i.status === "registrada" ? "lancada" : "ok"; };
  const ehCk = (r: Res) => !!ckl[r.n];
  const vendEf = (r: Res) => r.vendU || (vendMan[r.n] ? vendedores.find((u: any) => u.id === vendMan[r.n]) || null : null);
  const vendDif = (r: Res) => { const c = alvo(r), v = vendEf(r); return !!(c && v && c.atendenteId && v.id !== c.atendenteId); };
  // quem comprou é outra pessoa (ex.: orçamento com a Maria, compra no nome do João): ao confirmar, ela vira o "cliente pagador"
  // da venda e o cliente do 360 (quem foi atendido) continua o mesmo
  const nomeDif = (r: Res) => { const c = alvo(r), cm = r.cands[escolha[r.n] ?? 0]; return !!(c && cm && cm.como !== "nome" && !mesmoNome(col(r.ex, "Cliente"), c.cliente)); };
  const pagadorSalvo = (r: Res) => { const p = ((alvo(r)?.tratativa || {}).pagadores || {})[r.n]; return p && mesmoNome(p.nome, col(r.ex, "Cliente")); };
  const faltaPagador = (r: Res) => nomeDif(r) && !pagadorSalvo(r);
  // toda venda confirmada guarda quem comprou no Exact (cliente comprador), mesmo quando o nome é igual
  const semComprador = (r: Res) => !!alvo(r) && !!col(r.ex, "Cliente").trim() && !pagadorSalvo(r);
  const aConfirmar = (r: Res) => !ehCk(r) && (estado(r) !== "ok" || vendDif(r) || faltaPagador(r));
  const passa = (r: Res, k: string) => k === "ck" ? ehCk(r) : k === "todas" ? true : ehCk(r) ? false : k === "confirmar" ? aConfirmar(r) : k === "ok" ? !aConfirmar(r) : vendDif(r);

  const daAba = res.filter(r => origem(r) === aba);
  const busca = tira(q), dig = so(q);
  const filtrada = daAba.filter(r => (aba === "nada" || passa(r, f))
    && (!q || tira([col(r.ex, "Cliente"), r.vend, alvo(r)?.cliente || "", alvo(r) ? R.nomeUser(alvo(r).consultorId || alvo(r).solicitanteId) : ""].join(" ")).includes(busca) || (dig.length >= 3 && (r.n.includes(dig) || so(col(r.ex, "ClienteTel1") + col(r.ex, "ClienteTel2")).includes(dig)))));
  // ordem alfabética pelo cliente do Exact; vendas do MESMO cliente do 360 ficam juntas, como um grupo
  const gk = (r: Res) => alvo(r)?.id || "x:" + tira(col(r.ex, "Cliente"));
  const grupos = useMemo(() => {
    const m = new Map<string, Res[]>(); filtrada.forEach(r => { const k = gk(r); m.set(k, [...(m.get(k) || []), r]); });
    const nomeG = (l: Res[]) => l.map(r => tira(col(r.ex, "Cliente")).trim()).sort()[0] || "";
    return Array.from(m.entries()).map(([k, l]) => ({ k, l: l.sort((a, b) => a.data.localeCompare(b.data) || a.n.localeCompare(b.n)), nome: nomeG(l) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [filtrada, escolha, st.chamados]);
  const lista = grupos.flatMap(g => g.l);
  const tamG = Object.fromEntries(grupos.map(g => [g.k, g.l.length]));
  const cnt = (o: string) => res.filter(r => origem(r) === o).length;
  const quem = (c: any) => c ? (R.ehDireto(c) ? R.nomeUser(c.solicitanteId) : R.nomeUser(c.consultorId)) : "";
  const efet = (r: Res) => !/aguard/i.test(r.sit);
  // resumo por consultor (aba consultores) ou responsável do marketing
  const resumo = useMemo(() => {
    const m: Record<string, { n: number; v: number; conf: number }> = {};
    daAba.filter(r => efet(r) && !ehCk(r)).forEach(r => { const k = quem(alvo(r)) || "—"; m[k] = m[k] || { n: 0, v: 0, conf: 0 }; m[k].n++; m[k].v += r.valor; if (!aConfirmar(r)) m[k].conf++; });
    return Object.entries(m).sort((a, b) => b[1].v - a[1].v);
  }, [daAba, escolha, st.chamados, ckl]);

  // tudo o que foi achado e ainda falta confirmar vai para a fila de Confirmação de vendas (sem apagar o que já estava lá)
  const enviados = useRef(new Set<string>());
  useEffect(() => {
    if (!gestao || !res.length) return;
    const l = res.filter(r => alvo(r) && aConfirmar(r) && !ehCk(r) && !enviados.current.has(r.n));
    if (!l.length) return;
    l.forEach(r => enviados.current.add(r.n));
    const linhas = l.map(r => { const c = alvo(r), cm = r.cands[escolha[r.n] ?? 0], v = vendEf(r);
      return { ...camposExact(r.ex), numero: r.n, valor: r.valor, data: r.data, ex_situacao: r.sit, ex_vendedor: r.vend, fonte: "360", tipo: origem(r) === "mkt" ? "marketing" : "consultor",
        chamado_id: c.id, cands: r.cands.map(x => ({ id: x.c.id, cliente: x.c.cliente, como: x.como })), cliente_ref: c.cliente, como: cm?.como || "",
        consultor_id: (R.ehDireto(c) ? c.solicitanteId : c.consultorId) || "", consultor_nome: quem(c), vendedor_id: v?.id || "" }; });
    A.vendaConfEnviar(linhas).then(n => { if (n) toast(n + " venda(s) nova(s) na ✅ Confirmação de vendas"); }).catch(() => l.forEach(r => enviados.current.delete(r.n)));
  }, [res, ckl]);

  async function marcarCk(r: Res, desfazer = false) {
    const c = alvo(r);
    if (!desfazer && !confirm(`Marcar a venda ${r.n} (${col(r.ex, "Cliente")} · ${fmtMoeda(r.valor)}) como CHECKLIST?\n\nÉ o pedido da fábrica de um checklist finalizado: não entra como venda nova nem soma nas vendas — fica guardada como checklist${c ? " do cliente " + c.cliente : ""} (vai para a montagem depois).`)) return;
    if (await executar(() => A.exactChecklistMarcar(r.n, c?.id || null, { cliente: col(r.ex, "Cliente").trim(), telefone: col(r.ex, "ClienteTel1"), valor: r.valor, data: r.data || "", vendedor: r.vend, situacao: r.sit }, desfazer),
      desfazer ? "Venda " + r.n + " voltou para a lista" : "Venda " + r.n + " marcada como checklist")) { setSel(s => ({ ...s, [r.n]: false })); await lerCkl(); }
  }

  async function confirmar(lst: Res[]) {
    const ok = lst.filter(r => alvo(r) && aConfirmar(r));
    if (!ok.length) { toast("Nada para confirmar"); return; }
    const tot = ok.reduce((s, r) => s + r.valor, 0);
    if (!confirm(`Confirmar ${ok.length} venda(s) do Exact no 360 · ${fmtMoeda(tot)}?\n\nVale o que está no Exact: nº, valor, situação e o VENDEDOR (o vendedor do cliente é corrigido quando for diferente).\n\n${ok.filter(faltaPagador).length ? "\n\nNome diferente: em " + ok.filter(faltaPagador).length + " venda(s) quem comprou entra como CLIENTE COMPRADOR; o cliente do 360 continua o mesmo.\n" : "\n"}${ok.slice(0, 15).map(r => "• " + r.n + " · " + alvo(r).cliente + (faltaPagador(r) ? " (comprador: " + col(r.ex, "Cliente") + ")" : "") + " · " + fmtMoeda(r.valor) + " · vendedor " + (vendEf(r)?.nome || r.vend)).join("\n")}${ok.length > 15 ? "\n…" : ""}`)) return;
    let feitas = 0; const erros: string[] = [];
    for (const r of ok) {
      setRodando(`Confirmando ${feitas + 1} de ${ok.length}…`);
      try {
        if (estado(r) !== "ok" || vendDif(r)) await A.exactConfirmarVenda(alvo(r).id, r.n, r.valor, r.data || null, r.vend, r.sit, vendDif(r) || (!alvo(r).atendenteId && vendEf(r)) ? vendEf(r).id : null);
        if (semComprador(r)) await A.clientePagadorSalvar(alvo(r).id, r.n, { nome: col(r.ex, "Cliente").trim(), telefone1: col(r.ex, "ClienteTel1"), telefone2: col(r.ex, "ClienteTel2"), endereco: col(r.ex, "Orçamento"), idTatico: col(r.ex, "IDPessoaCli") });
        feitas++;
      }
      catch (e: any) { erros.push(r.n + ": " + (e.message || "erro")); }
    }
    setRodando(""); setSel({}); await recarregar();
    toast(`${feitas} venda(s) confirmada(s)` + (erros.length ? ` · ${erros.length} com erro: ${erros.slice(0, 3).join(" | ")}` : ""));
  }

  function exportar() {
    baixarXlsx("vendas-exact-x-360-" + aba, ["Venda", "Data", "Situação Exact", "Valor", "Vendedor Exact", "Cliente Exact", "Telefone Exact", "Cliente 360", "Nº 360", "Achado por", aba === "mkt" ? "Responsável marketing" : "Consultor", "Vendedor no 360", "Status no 360", "No 360"],
      lista.map(r => { const c = alvo(r), cm = r.cands[escolha[r.n] ?? 0]; return [r.n, r.data ? fmtDate(r.data) : "", r.sit, r.valor, r.vend, col(r.ex, "Cliente"), col(r.ex, "ClienteTel1"), c?.cliente || "não encontrado", c?.id || "", cm ? COMO[cm.como][0] : "", quem(c), c?.atendenteId ? R.nomeUser(c.atendenteId) : "", c ? STATUS_CLIENTE[R.statusClienteDe(c)] || "" : "", c ? { ok: "confirmada", lancada: "lançada, a confirmar", nova: "não lançada" }[estado(r)] : ""]; }), "Vendas");
  }

  const totLinhas = arqs.reduce((s, a) => s + a.linhas.length, 0);
  const marcadas = lista.filter(r => sel[r.n]);
  const th: React.CSSProperties = { textAlign: "left", padding: "8px", fontSize: 12, color: "var(--ink-soft)", borderBottom: "2px solid var(--line)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 };
  const td: React.CSSProperties = { padding: "7px 8px", fontSize: 13, borderBottom: "1px solid var(--line-soft)", verticalAlign: "top" };
  const valEnc = res.filter(r => origem(r) !== "nada" && efet(r) && !ehCk(r)).reduce((s, r) => s + r.valor, 0);

  return (
    <section className="view active">
      <div className="view-head"><div><h2>Encontrar vendas do 360</h2>
        <p>Anexe o <b>relatório de vendas do Exact</b>. O sistema procura cada venda nos clientes do ALIANÇA 360 — <b>consultores</b> e <b>marketing</b> — pelo nº da venda, pelo <b>telefone</b> e pelo nome. Vale o que está no Exact: nº, valor, situação e <b>vendedor</b>. Ao confirmar, a venda entra no 360 já validada pela Gestão e o vendedor do cliente é corrigido quando for diferente.</p></div></div>
      <div className="ev-caixa">
        <div style={{ fontWeight: 800 }}>🧾 Exact · relatório de vendas <span className="pill">{totLinhas} linhas</span></div>
        {arqs.map((a, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>📄 <span style={{ flex: 1 }}>{a.nome}</span><span className="pill">{a.linhas.length}</span><button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => setArqs(x => x.filter((_, j) => j !== i))}>✕</button></div>)}
        <div><button className="btn sm" onClick={() => inp.current?.click()}>＋ {arqs.length ? "Adicionar outro relatório" : "Adicionar relatório"}</button></div>
        <input ref={inp} type="file" accept=".csv,.xlsx" multiple style={{ display: "none" }} onChange={e => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {res.length > 0 && <>
        <div className="kpis" style={{ margin: "10px 0" }}>
          <Kpi n={res.length} l="Vendas no relatório" />
          <Kpi n={cnt("cons")} l="De consultores" cor="var(--primary)" />
          <Kpi n={cnt("mkt")} l="Do marketing" cor="var(--primary)" />
          <Kpi n={res.filter(r => origem(r) !== "nada" && aConfirmar(r)).length} l="A confirmar" cor="var(--warn)" />
          <Kpi n={res.filter(ehCk).length} l="📋 Checklist (fábrica)" />
          <Kpi n={fmtMoeda(valEnc)} l="Valor encontrado (sem aguardando)" cor="var(--st-concluida)" />
        </div>
        <div className="subnav" style={{ marginBottom: 10 }}>
          <button className={aba === "cons" ? "on" : ""} onClick={() => { setAba("cons"); setSel({}); }}>🧭 Consultores <i>{cnt("cons")}</i></button>
          <button className={aba === "mkt" ? "on" : ""} onClick={() => { setAba("mkt"); setSel({}); }}>🏬 Marketing <i>{cnt("mkt")}</i></button>
          <button className={aba === "nada" ? "on" : ""} onClick={() => { setAba("nada"); setSel({}); }}>Não encontradas no 360 <i>{cnt("nada")}</i></button>
        </div>
        {aba !== "nada" && resumo.length > 0 && <div className="ev-resumo">{resumo.map(([k, x]) => <button key={k} className={"ev-res" + (q === k ? " on" : "")} onClick={() => setQ(q === k ? "" : k)}><b>{k}</b><span>{x.n} venda(s) · {fmtMoeda(x.v)}</span><small>{x.conf} confirmada(s)</small></button>)}</div>}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "6px 0 10px" }}>
          {aba !== "nada" && <div className="chips" style={{ margin: 0 }}>{([["confirmar", "A confirmar"], ["vend", "⚠️ Vendedor diferente"], ["ok", "✔ Já confirmadas"], ["ck", "📋 Checklist"], ["todas", "Todas"]] as any[]).map(([k, l]) => <button key={k} className={"chip" + (f === k ? " on" : "")} onClick={() => setF(k)}>{l}<span className="n">{daAba.filter(r => passa(r, k)).length}</span></button>)}</div>}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente, vendedor, consultor, nº ou telefone" style={{ marginLeft: "auto", maxWidth: 320 }} />
          <button className="btn sm" onClick={exportar}>⬇ Excel ({lista.length})</button>
          {gestao && aba !== "nada" && <button className="btn primary sm" disabled={!!rodando || !marcadas.length} onClick={() => confirmar(marcadas)}>{rodando || `✅ Confirmar marcadas (${marcadas.length})`}</button>}
        </div>
        <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: "70vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {gestao && aba !== "nada" && <th style={th}><input type="checkbox" style={{ width: "auto" }} checked={lista.filter(aConfirmar).length > 0 && lista.filter(aConfirmar).every(r => sel[r.n])} onChange={e => { const n = { ...sel }; lista.filter(aConfirmar).forEach(r => (n[r.n] = e.target.checked)); setSel(n); }} /></th>}
              <th style={th}>Venda (Exact)</th><th style={th}>Cliente no Exact</th>{aba !== "nada" && <><th style={th}>Cliente no 360</th><th style={th}>{aba === "mkt" ? "Responsável" : "Consultor"}</th><th style={th}>Vendedor</th><th style={th}>No 360</th></>}
            </tr></thead>
            <tbody>{lista.slice(0, 500).map((r, idx) => { const c = alvo(r), cm = r.cands[escolha[r.n] ?? 0], est = estado(r), dif = vendDif(r), ck = ehCk(r);
              const k = gk(r), emG = tamG[k] > 1, primeiro = emG && (idx === 0 || gk(lista[idx - 1]) !== k);
              const doG = emG ? lista.filter(x => gk(x) === k) : [];
              return (<Fragment key={r.n}>
              {primeiro && <tr className="ev-grupo"><td colSpan={9}>👥 <b>Mesmo cliente {c ? "no 360: " + c.cliente : "no Exact: " + col(r.ex, "Cliente")}</b> · {doG.length} vendas · {fmtMoeda(doG.reduce((s, x) => s + x.valor, 0))}
                <span className="hint"> — pode ter cupom, venda não efetivada ou checklist da fábrica; confira uma por uma</span></td></tr>}
              <tr className={emG ? "ev-nog" : ""} style={{ background: sel[r.n] ? "var(--primary-soft)" : ck ? "var(--surface-2, #f4f4f6)" : undefined, opacity: ck ? 0.75 : undefined }}>
                {gestao && aba !== "nada" && <td style={td}>{aConfirmar(r) && <input type="checkbox" style={{ width: "auto" }} checked={!!sel[r.n]} onChange={() => setSel({ ...sel, [r.n]: !sel[r.n] })} />}</td>}
                <td style={{ ...td, whiteSpace: "nowrap" }}><b>{r.n}</b><div className="hint">{r.data ? fmtDate(r.data) : ""}</div><div className="hint" style={{ color: /aguard/i.test(r.sit) ? "var(--warn)" : undefined }}>{r.sit}</div><div><b>{fmtMoeda(r.valor)}</b></div>
                  {ck ? <div style={{ marginTop: 4 }}><span className="pill" style={{ background: "#6b4fbb", color: "#fff" }}>📋 Checklist</span>{gestao && <button className="btn ghost sm" onClick={() => marcarCk(r, true)}>desfazer</button>}</div>
                    : gestao && est !== "ok" && <div style={{ marginTop: 4 }}><button className="btn sm" disabled={!!rodando} title="É o pedido da fábrica de um checklist finalizado — não é venda nova" onClick={() => marcarCk(r)}>📋 Checklist</button></div>}</td>
                <td style={td}><b>{col(r.ex, "Cliente")}</b><div className="hint">{[col(r.ex, "ClienteTel1"), col(r.ex, "ClienteTel2")].filter(Boolean).join(" · ")}</div><div className="hint" style={{ maxWidth: 260 }}>{col(r.ex, "Orçamento")}</div></td>
                {aba !== "nada" && c && <>
                  <td style={td}><span className="pill" style={{ background: COMO[cm.como][1], color: "#fff", fontSize: 11 }}>{COMO[cm.como][0]}</span>
                    <div><a href="#" onClick={e => { e.preventDefault(); abrirDetalhe(c.id); }}><b>{c.cliente}</b></a> <span className="hint">{c.id}</span></div>
                    <div className="hint">{c.telefone || ""} · {STATUS_CLIENTE[R.statusClienteDe(c)] || ""}{c.dataLoja ? " · loja " + fmtDate(c.dataLoja) : c.dataVisita ? " · visita " + fmtDate(c.dataVisita) : ""}</div>
                    {pagadorSalvo(r) ? <div className="hint" style={{ color: "var(--st-concluida)", fontWeight: 700 }}>🧾 cliente comprador: {col(r.ex, "Cliente")}</div> : nomeDif(r) && (
                      <div style={{ color: "var(--warn)", fontWeight: 700, fontSize: 12 }}>⚠️ nome diferente de quem comprou — ao confirmar, {col(r.ex, "Cliente")} entra como cliente comprador (o cliente do 360 continua {c.cliente})</div>)}
                    {r.data && String(c.criadoEm || "").slice(0, 10) > r.data && <div className="hint" style={{ color: "var(--warn)" }}>⚠️ cadastrado no 360 depois da venda ({fmtDate(c.criadoEm)})</div>}
                    {r.cands.length > 1 && <select style={{ fontSize: 12, marginTop: 4, maxWidth: 240 }} value={escolha[r.n] ?? 0} onChange={e => setEscolha({ ...escolha, [r.n]: Number(e.target.value) })}>{r.cands.map((x, i) => <option key={x.c.id} value={i}>{COMO[x.como][0]} · {x.c.cliente} ({x.c.id})</option>)}</select>}
                  </td>
                  <td style={td}><b>{quem(c)}</b></td>
                  <td style={td}><div>Exact: <b>{r.vend || "—"}</b></div><div className="hint">360: {c.atendenteId ? R.nomeUser(c.atendenteId) : "sem vendedor"}</div>
                    {dif && <div style={{ color: "var(--warn)", fontWeight: 700, fontSize: 12 }}>⚠️ outro vendedor vendeu — ao confirmar passa para {vendEf(r).nome}</div>}
                    {!r.vendU && r.vend && <div><div className="hint" style={{ color: "var(--warn)" }}>vendedor do Exact não achado no 360 — escolha:</div>
                      <select style={{ fontSize: 12, maxWidth: 200 }} value={vendMan[r.n] || ""} onChange={e => setVendMan({ ...vendMan, [r.n]: e.target.value })}>
                        <option value="">— manter {c.atendenteId ? R.nomeUser(c.atendenteId) : "sem vendedor"} —</option>
                        {vendedores.filter((u: any) => u.ativo).sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR")).map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{ck ? <span className="pill" style={{ color: "#6b4fbb", borderColor: "#6b4fbb" }}>checklist · não é venda</span> : est === "ok" ? <span className="pill" style={{ background: "var(--st-concluida)", color: "#fff" }}>✔ confirmada</span> : est === "lancada" ? <span className="pill" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>lançada · a confirmar</span> : <span className="pill">não lançada</span>}
                    {gestao && aConfirmar(r) && <div style={{ marginTop: 6 }}><button className="btn primary sm" disabled={!!rodando} onClick={() => confirmar([r])}>✅ Confirmar</button></div>}</td>
                </>}
              </tr></Fragment>); })}</tbody>
          </table>
          {!lista.length && <div style={{ padding: 20, textAlign: "center", color: "var(--ink-faint)" }}>Nenhuma venda aqui.</div>}
        </div>
        {lista.length > 500 && <div className="hint">Mostrando 500 de {lista.length}. Use a busca ou o Excel.</div>}
      </>}
    </section>
  );
}
