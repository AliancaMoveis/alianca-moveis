// Encontrar vendas do 360: cruza o relatório de vendas do Exact com os clientes do ALIANÇA 360 (consultores e marketing).
// Cruza pelo nº da venda já lançado, pelo telefone (8 últimos dígitos) e pelo nome. O que vale é o Exact: nº, valor,
// situação e VENDEDOR — ao confirmar, a venda entra no 360 já efetivada pela Gestão e o vendedor do cliente é corrigido.
import { useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { Kpi } from "./Dashboard";
import { col, lerArquivo, mesmoNome, tira } from "./Medidas";
import { tipoPlanilha, type Linha } from "../lib/cruzarVendas";
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
  const vendDif = (r: Res) => { const c = alvo(r); return !!(c && r.vendU && c.atendenteId && r.vendU.id !== c.atendenteId); };
  const aConfirmar = (r: Res) => estado(r) !== "ok" || vendDif(r);

  const daAba = res.filter(r => origem(r) === aba);
  const busca = tira(q), dig = so(q);
  const lista = daAba.filter(r => (aba === "nada" || f === "todas" || (f === "confirmar" ? aConfirmar(r) : f === "ok" ? !aConfirmar(r) : vendDif(r)))
    && (!q || tira([col(r.ex, "Cliente"), r.vend, alvo(r)?.cliente || "", alvo(r) ? R.nomeUser(alvo(r).consultorId || alvo(r).solicitanteId) : ""].join(" ")).includes(busca) || (dig.length >= 3 && (r.n.includes(dig) || so(col(r.ex, "ClienteTel1") + col(r.ex, "ClienteTel2")).includes(dig)))));
  const cnt = (o: string) => res.filter(r => origem(r) === o).length;
  const quem = (c: any) => c ? (R.ehDireto(c) ? R.nomeUser(c.solicitanteId) : R.nomeUser(c.consultorId)) : "";
  const efet = (r: Res) => !/aguard/i.test(r.sit);
  // resumo por consultor (aba consultores) ou responsável do marketing
  const resumo = useMemo(() => {
    const m: Record<string, { n: number; v: number; conf: number }> = {};
    daAba.filter(efet).forEach(r => { const k = quem(alvo(r)) || "—"; m[k] = m[k] || { n: 0, v: 0, conf: 0 }; m[k].n++; m[k].v += r.valor; if (!aConfirmar(r)) m[k].conf++; });
    return Object.entries(m).sort((a, b) => b[1].v - a[1].v);
  }, [daAba, escolha, st.chamados]);

  async function confirmar(lst: Res[]) {
    const ok = lst.filter(r => alvo(r) && aConfirmar(r));
    if (!ok.length) { toast("Nada para confirmar"); return; }
    const tot = ok.reduce((s, r) => s + r.valor, 0);
    if (!confirm(`Confirmar ${ok.length} venda(s) do Exact no 360 · ${fmtMoeda(tot)}?\n\nVale o que está no Exact: nº, valor, situação e o VENDEDOR (o vendedor do cliente é corrigido quando for diferente).\n\n${ok.slice(0, 15).map(r => "• " + r.n + " · " + alvo(r).cliente + " · " + fmtMoeda(r.valor) + " · " + r.vend).join("\n")}${ok.length > 15 ? "\n…" : ""}`)) return;
    let feitas = 0; const erros: string[] = [];
    for (const r of ok) {
      setRodando(`Confirmando ${feitas + 1} de ${ok.length}…`);
      try { await A.exactConfirmarVenda(alvo(r).id, r.n, r.valor, r.data || null, r.vend, r.sit, vendDif(r) || (!alvo(r).atendenteId && r.vendU) ? r.vendU.id : null); feitas++; }
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
  const valEnc = res.filter(r => origem(r) !== "nada" && efet(r)).reduce((s, r) => s + r.valor, 0);

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
          <Kpi n={fmtMoeda(valEnc)} l="Valor encontrado (sem aguardando)" cor="var(--st-concluida)" />
        </div>
        <div className="subnav" style={{ marginBottom: 10 }}>
          <button className={aba === "cons" ? "on" : ""} onClick={() => { setAba("cons"); setSel({}); }}>🧭 Consultores <i>{cnt("cons")}</i></button>
          <button className={aba === "mkt" ? "on" : ""} onClick={() => { setAba("mkt"); setSel({}); }}>🏬 Marketing <i>{cnt("mkt")}</i></button>
          <button className={aba === "nada" ? "on" : ""} onClick={() => { setAba("nada"); setSel({}); }}>Não encontradas no 360 <i>{cnt("nada")}</i></button>
        </div>
        {aba !== "nada" && resumo.length > 0 && <div className="ev-resumo">{resumo.map(([k, x]) => <button key={k} className={"ev-res" + (q === k ? " on" : "")} onClick={() => setQ(q === k ? "" : k)}><b>{k}</b><span>{x.n} venda(s) · {fmtMoeda(x.v)}</span><small>{x.conf} confirmada(s)</small></button>)}</div>}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "6px 0 10px" }}>
          {aba !== "nada" && <div className="chips" style={{ margin: 0 }}>{([["confirmar", "A confirmar"], ["vend", "⚠️ Vendedor diferente"], ["ok", "✔ Já confirmadas"], ["todas", "Todas"]] as any[]).map(([k, l]) => <button key={k} className={"chip" + (f === k ? " on" : "")} onClick={() => setF(k)}>{l}<span className="n">{daAba.filter(r => k === "todas" || (k === "confirmar" ? aConfirmar(r) : k === "ok" ? !aConfirmar(r) : vendDif(r))).length}</span></button>)}</div>}
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
            <tbody>{lista.slice(0, 500).map(r => { const c = alvo(r), cm = r.cands[escolha[r.n] ?? 0], est = estado(r), dif = vendDif(r); return (
              <tr key={r.n} style={{ background: sel[r.n] ? "var(--primary-soft)" : undefined }}>
                {gestao && aba !== "nada" && <td style={td}>{aConfirmar(r) && <input type="checkbox" style={{ width: "auto" }} checked={!!sel[r.n]} onChange={() => setSel({ ...sel, [r.n]: !sel[r.n] })} />}</td>}
                <td style={{ ...td, whiteSpace: "nowrap" }}><b>{r.n}</b><div className="hint">{r.data ? fmtDate(r.data) : ""}</div><div className="hint" style={{ color: /aguard/i.test(r.sit) ? "var(--warn)" : undefined }}>{r.sit}</div><div><b>{fmtMoeda(r.valor)}</b></div></td>
                <td style={td}><b>{col(r.ex, "Cliente")}</b><div className="hint">{[col(r.ex, "ClienteTel1"), col(r.ex, "ClienteTel2")].filter(Boolean).join(" · ")}</div><div className="hint" style={{ maxWidth: 260 }}>{col(r.ex, "Orçamento")}</div></td>
                {aba !== "nada" && c && <>
                  <td style={td}><span className="pill" style={{ background: COMO[cm.como][1], color: "#fff", fontSize: 11 }}>{COMO[cm.como][0]}</span>
                    <div><a href="#" onClick={e => { e.preventDefault(); abrirDetalhe(c.id); }}><b>{c.cliente}</b></a> <span className="hint">{c.id}</span></div>
                    <div className="hint">{c.telefone || ""} · {STATUS_CLIENTE[R.statusClienteDe(c)] || ""}{c.dataLoja ? " · loja " + fmtDate(c.dataLoja) : c.dataVisita ? " · visita " + fmtDate(c.dataVisita) : ""}</div>
                    {cm.como !== "nome" && !mesmoNome(col(r.ex, "Cliente"), c.cliente) && <div style={{ color: "var(--warn)", fontWeight: 700, fontSize: 12 }}>⚠️ nome diferente de quem comprou — validar</div>}
                    {r.data && String(c.criadoEm || "").slice(0, 10) > r.data && <div className="hint" style={{ color: "var(--warn)" }}>⚠️ cadastrado no 360 depois da venda ({fmtDate(c.criadoEm)})</div>}
                    {r.cands.length > 1 && <select style={{ fontSize: 12, marginTop: 4, maxWidth: 240 }} value={escolha[r.n] ?? 0} onChange={e => setEscolha({ ...escolha, [r.n]: Number(e.target.value) })}>{r.cands.map((x, i) => <option key={x.c.id} value={i}>{COMO[x.como][0]} · {x.c.cliente} ({x.c.id})</option>)}</select>}
                  </td>
                  <td style={td}>{quem(c)}</td>
                  <td style={td}><div>Exact: <b>{r.vend || "—"}</b></div><div className="hint">360: {c.atendenteId ? R.nomeUser(c.atendenteId) : "sem vendedor"}</div>
                    {dif && <div style={{ color: "var(--warn)", fontWeight: 700, fontSize: 12 }}>⚠️ outro vendedor vendeu — ao confirmar passa para {r.vendU.nome}</div>}
                    {!r.vendU && r.vend && <div className="hint" style={{ color: "var(--warn)" }}>vendedor do Exact não achado no 360</div>}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{est === "ok" ? <span className="pill" style={{ background: "var(--st-concluida)", color: "#fff" }}>✔ confirmada</span> : est === "lancada" ? <span className="pill" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>lançada · a confirmar</span> : <span className="pill">não lançada</span>}
                    {gestao && aConfirmar(r) && <div style={{ marginTop: 6 }}><button className="btn primary sm" disabled={!!rodando} onClick={() => confirmar([r])}>✅ Confirmar</button></div>}</td>
                </>}
              </tr>); })}</tbody>
          </table>
          {!lista.length && <div style={{ padding: 20, textAlign: "center", color: "var(--ink-faint)" }}>Nenhuma venda aqui.</div>}
        </div>
        {lista.length > 500 && <div className="hint">Mostrando 500 de {lista.length}. Use a busca ou o Excel.</div>}
      </>}
    </section>
  );
}
