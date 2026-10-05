// Setor de Medidas — cruzamento Minha Visita (customers) × Exact (tickets "aguardando medição") pelo telefone.
// Cliente comprador que foi visitado por um consultor do Minha Visita = medidas oficiais ok; sem visita = sem medidas.
// O resultado fica gravado por nº de venda e aparece nos clientes do Checklist.
import { useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { lerXlsx } from "../lib/planilha";
import { fmtDateTime } from "../lib/regras";

type Linha = Record<string, string>;
type Arq = { nome: string; linhas: Linha[] };
type Res = { venda: string; comprador: string; telefone: string; visitado: string; consultor: string; statusMv: string; visitaEm: string; medidor: string; situacao: string; resultado: "ok" | "sem"; outros: number };

const so = (s: string) => (s || "").replace(/\D/g, "");
/** chave do telefone: os 8 últimos dígitos (ignora +55, DDD e o 9 da frente) */
const chave = (s: string) => { const d = so(s); return d.length >= 8 ? d.slice(-8) : ""; };
const fmtTel = (s: string) => { let d = so(s); if (d.length > 11 && d.startsWith("55")) d = d.slice(2); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : s; };
const tira = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** CSV do Minha Visita (separado por ; ou ,, com aspas) */
function lerCsv(txt: string): Linha[] {
  txt = txt.replace(/^﻿/, "");
  const sep = (txt.split("\n")[0].match(/;/g) || []).length >= (txt.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const linhas: string[][] = []; let campo = "", lin: string[] = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (aspas) { if (ch === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += ch; }
    else if (ch === '"') aspas = true;
    else if (ch === sep) { lin.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && txt[i + 1] === "\n") i++; lin.push(campo); campo = ""; if (lin.some(x => x.trim())) linhas.push(lin); lin = []; }
    else campo += ch;
  }
  lin.push(campo); if (lin.some(x => x.trim())) linhas.push(lin);
  const cab = (linhas.shift() || []).map(h => h.trim());
  return linhas.map(l => Object.fromEntries(cab.map((h, i) => [h, (l[i] || "").trim()])));
}
async function lerArquivo(f: File): Promise<Linha[]> {
  if (/\.xlsx$/i.test(f.name)) return lerXlsx(f);
  const buf = await f.arrayBuffer();
  let txt = new TextDecoder("utf-8").decode(buf);
  if (txt.includes("�")) txt = new TextDecoder("windows-1252").decode(buf);
  return lerCsv(txt);
}
const col = (l: Linha, ...nomes: string[]) => { for (const n of nomes) { const k = Object.keys(l).find(x => tira(x) === tira(n)); if (k && l[k]) return l[k]; } return ""; };

/** nº da venda: "1296255 / NOME", "Venda 1139444" ou citado na descrição ("conf a venda 1285168") */
function vendaDe(l: Linha) {
  const t = col(l, "Título"), d = col(l, "Descrição");
  const m = t.match(/^\s*(\d{6,})/) || t.match(/venda\s*(\d{6,})/i) || d.match(/(?:venda|vd)\D{0,6}(1\d{6})/i) || (t + " " + d).match(/\b(1\d{6})\b/);
  return m ? m[1] : "";
}
function telefonesDe(l: Linha) {
  const d = col(l, "Descrição");
  return [col(l, "Telefone 1"), col(l, "Telefone 2"), ...(d.match(/\(?\d{2}\)?\s?9?[\s-]?\d{4}[\s-]?\d{4}/g) || [])];
}

function cruzar(mv: Linha[], ex: Linha[]): Res[] {
  const idx: Record<string, Linha[]> = {};
  mv.forEach(c => { const k = chave(col(c, "Celular", "Telefone", "Whatsapp")); if (k) (idx[k] = idx[k] || []).push(c); });
  const vistos = new Set<string>();
  return ex.map(t => {
    const tels = telefonesDe(t);
    const achados: Linha[] = []; tels.forEach(x => (idx[chave(x)] || []).forEach(c => { if (!achados.includes(c)) achados.push(c); }));
    // mais recente primeiro (último check / atualização)
    achados.sort((a, b) => (col(b, "Data de atualização") || "").localeCompare(col(a, "Data de atualização") || ""));
    const c = achados[0];
    const uc = c ? col(c, "Último Check") : "";
    return {
      venda: vendaDe(t), comprador: col(t, "Contato"), telefone: fmtTel(tels.find(x => so(x).length >= 8) || ""),
      visitado: c ? col(c, "Nome") : "", consultor: c ? col(c, "Contato de") || uc.split("|")[0].trim() : "",
      statusMv: c ? col(c, "Status") : "", visitaEm: c ? (uc.split("|")[2] || col(c, "Data de cadastro")).trim() : "",
      medidor: col(t, "Medidor"), situacao: col(t, "Situação"), resultado: c ? "ok" : "sem", outros: Math.max(0, achados.length - 1),
    } as Res;
  }).filter(r => { const k = r.venda || r.comprador; if (vistos.has(k)) return false; vistos.add(k); return true; });
}

const TRATATIVAS = ["", "Medidas oficiais conferidas", "Agendar medição", "Pedir medidas ao consultor", "Conferir com o vendedor", "Medida feita pelo medidor", "Outro"];

export default function Medidas({ aba = "cruzar" }: { aba?: string }) {
  return aba === "resultados" ? <Resultados /> : <Cruzar />;
}

function Cruzar() {
  const { st, toast, recarregar } = useApp() as any;
  const [mvs, setMvs] = useState<Arq[]>([]);
  const [ex, setEx] = useState<Arq | null>(null);
  const [res, setRes] = useState<Res[] | null>(null);
  const [f, setF] = useState<"todos" | "ok" | "sem">("todos");
  const [salvando, setSalvando] = useState(false);
  const inMv = useRef<HTMLInputElement>(null), inEx = useRef<HTMLInputElement>(null);
  const totalMv = mvs.reduce((a, b) => a + b.linhas.length, 0);

  async function addMv(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const l = await lerArquivo(file);
        if (!l.length || !Object.keys(l[0]).some(k => /celular|telefone/i.test(k))) { toast(file.name + ": não achei a coluna de celular — é a planilha do Minha Visita (customers)?"); continue; }
        setMvs(x => [...x, { nome: file.name, linhas: l }]); setRes(null);
      } catch (e: any) { toast(file.name + ": " + (e.message || "não consegui ler")); }
    }
    if (inMv.current) inMv.current.value = "";
  }
  async function addEx(file: File | undefined) {
    if (!file) return;
    try {
      const l = await lerArquivo(file);
      if (!l.length || !("Título" in l[0] || "Contato" in l[0])) throw new Error("não reconheci — preciso das colunas Título e Contato (planilha Tickets do Exact)");
      setEx({ nome: file.name, linhas: l }); setRes(null);
    } catch (e: any) { toast(file.name + ": " + (e.message || "não consegui ler")); }
    if (inEx.current) inEx.current.value = "";
  }
  async function gravar() {
    if (!res) return;
    const l = res.filter(r => r.venda);
    if (!l.length) { toast("Nenhuma linha com nº de venda para gravar"); return; }
    setSalvando(true);
    try { const r = await A.medidasCruzSalvar(l); await recarregar(); toast(`Gravado: ${r.novos} nova(s) venda(s) · ${r.atualizados} atualizada(s) — já aparece no Checklist`); }
    catch (e: any) { toast(e.message); } finally { setSalvando(false); }
  }
  const lista = (res || []).filter(r => f === "todos" || r.resultado === f);
  const nOk = (res || []).filter(r => r.resultado === "ok").length, nSem = (res || []).length - nOk;
  const caixa: React.CSSProperties = { flex: 1, minWidth: 280, border: "2px dashed var(--line)", borderRadius: 12, padding: 14, background: "var(--surface-2)" };

  return (
    <section className="view active">
      <div className="view-head"><div><h2>Cruzar Minha Visita × Exact</h2>
        <p>Anexe as planilhas do Minha Visita (customers — quantas precisar) e a do Exact (Tickets aguardando medição). O cruzamento é pelo telefone: comprador que foi visitado por consultor = <b>medidas oficiais ok</b>; sem visita = <b>sem medidas</b>.</p></div></div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "10px 0" }}>
        <div style={caixa}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>🏠 Minha Visita (customers) <span className="pill">{totalMv} clientes</span></div>
          {mvs.map((a, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "4px 0" }}>📄 <span style={{ flex: 1 }}>{a.nome}</span><span className="pill">{a.linhas.length}</span>
            <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => { setMvs(x => x.filter((_, j) => j !== i)); setRes(null); }}>✕</button></div>)}
          <input ref={inMv} type="file" accept=".csv,.xlsx" multiple style={{ display: "none" }} onChange={e => addMv(e.target.files)} />
          <button className="btn sm" style={{ marginTop: 6 }} onClick={() => inMv.current?.click()}>＋ {mvs.length ? "Adicionar outra planilha" : "Adicionar planilha"}</button>
        </div>
        <div style={caixa}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>🧾 Exact (Tickets) {ex && <span className="pill">{ex.linhas.length} compradores</span>}</div>
          {ex ? <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>📄 <span style={{ flex: 1 }}>{ex.nome}</span>
            <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => { setEx(null); setRes(null); }}>✕</button></div> : <div className="hint">Nenhuma planilha ainda.</div>}
          <input ref={inEx} type="file" accept=".xlsx,.csv" style={{ display: "none" }} onChange={e => addEx(e.target.files?.[0])} />
          <button className="btn sm" style={{ marginTop: 6 }} onClick={() => inEx.current?.click()}>{ex ? "Trocar planilha" : "＋ Adicionar planilha"}</button>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button className="btn primary" disabled={!mvs.length || !ex} onClick={() => { setRes(cruzar(mvs.flatMap(a => a.linhas), ex!.linhas)); setF("todos"); }}>🔀 Cruzar</button>
        </div>
      </div>

      {res && <>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "14px 0 8px" }}>
          <div className="chips">
            <button className={"chip" + (f === "todos" ? " on" : "")} onClick={() => setF("todos")}>Todos<span className="n">{res.length}</span></button>
            <button className={"chip" + (f === "ok" ? " on" : "")} onClick={() => setF("ok")}>✅ Medidas oficiais ok<span className="n">{nOk}</span></button>
            <button className={"chip" + (f === "sem" ? " on" : "")} onClick={() => setF("sem")}>⚠️ Sem medidas<span className="n">{nSem}</span></button>
          </div>
          <button className="btn primary" style={{ marginLeft: "auto" }} disabled={salvando} onClick={gravar}>{salvando ? "Gravando…" : "💾 Gravar resultado (vai para o Checklist)"}</button>
        </div>
        <Tabela linhas={lista.map(r => ({ ...r, salvo: (st.medidasCruz || {})[r.venda] }))} />
      </>}
    </section>
  );
}

function Tabela({ linhas }: { linhas: any[] }) {
  const th: React.CSSProperties = { textAlign: "left", padding: "8px 8px", fontSize: 12, color: "var(--ink-soft)", borderBottom: "2px solid var(--line)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--surface)" };
  const td: React.CSSProperties = { padding: "7px 8px", fontSize: 13, borderBottom: "1px solid var(--line-soft)", verticalAlign: "top" };
  if (!linhas.length) return <div className="card" style={{ padding: 20, textAlign: "center", color: "var(--ink-faint)" }}>Nenhum cliente neste filtro.</div>;
  return (
    <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: "70vh" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={th}>Cliente comprador (Exact)</th><th style={th}>Venda</th><th style={th}>Telefone</th><th style={th}>Cliente visitado (Minha Visita)</th><th style={th}>Consultor</th><th style={th}>Medidas</th><th style={th}>Tratativa</th></tr></thead>
        <tbody>{linhas.map((r, i) => (
          <tr key={(r.venda || r.comprador) + i}>
            <td style={td}><b>{r.comprador}</b>{r.medidor ? <div className="hint">medidor: {r.medidor}</div> : null}</td>
            <td style={td}>{r.venda || <span className="hint">sem nº</span>}</td>
            <td style={{ ...td, whiteSpace: "nowrap" }}>{r.telefone}</td>
            <td style={td}>{r.visitado || <span className="hint">—</span>}{r.statusMv ? <div className="hint">{r.statusMv}{r.visitaEm ? " · " + r.visitaEm : ""}</div> : null}{r.outros ? <div className="hint">+{r.outros} cadastro(s) com o mesmo telefone</div> : null}</td>
            <td style={td}>{r.consultor || <span className="hint">—</span>}</td>
            <td style={td}><SeloMedidas resultado={(r.salvo?.resultado) || r.resultado} /></td>
            <td style={{ ...td, minWidth: 230 }}>{r.venda ? (r.salvo ? <Tratar m={r.salvo} /> : <span className="hint">grave o resultado para registrar a tratativa</span>) : <span className="hint">sem nº de venda</span>}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

export function SeloMedidas({ resultado, peq }: { resultado?: string; peq?: boolean }) {
  if (!resultado) return null;
  const ok = resultado === "ok";
  return <span className="pill" style={{ background: ok ? "var(--st-concluida, #0f8a5f)" : "var(--danger)", color: "#fff", fontWeight: 700, fontSize: peq ? 11.5 : 12.5, whiteSpace: "nowrap" }}>{ok ? "📐 Medidas oficiais ok" : "📐 Sem medidas"}</span>;
}

function Tratar({ m }: { m: any }) {
  const { toast, recarregar } = useApp() as any;
  const [t, setT] = useState(m.tratativa || ""); const [o, setO] = useState(m.obs || ""); const [sal, setSal] = useState(false);
  const mudou = t !== (m.tratativa || "") || o !== (m.obs || "");
  async function salvar(res?: string) {
    setSal(true);
    try { await A.medidasCruzTratar(m.venda, t, o, res); await recarregar(); toast("Tratativa salva"); } catch (e: any) { toast(e.message); } finally { setSal(false); }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <select value={t} onChange={e => setT(e.target.value)} style={{ padding: "4px 6px", fontSize: 12.5 }}>{TRATATIVAS.map(x => <option key={x} value={x}>{x || "— escolha —"}</option>)}</select>
      <input value={o} onChange={e => setO(e.target.value)} placeholder="observação" style={{ padding: "4px 6px", fontSize: 12.5 }} />
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {mudou && <button className="btn primary sm" disabled={sal} onClick={() => salvar()}>Salvar</button>}
        <button className="btn ghost sm" disabled={sal} title="Corrigir o resultado manualmente" onClick={() => salvar(m.resultado === "ok" ? "sem" : "ok")}>{m.resultado === "ok" ? "marcar sem medidas" : "marcar medidas ok"}</button>
      </div>
      {m.atualizadoPor && <span className="hint" style={{ fontSize: 11 }}>{m.atualizadoPor} · {fmtDateTime(m.atualizadoEm)}</span>}
    </div>
  );
}

function Resultados() {
  const { st } = useApp() as any;
  const [f, setF] = useState<"todos" | "ok" | "sem" | "pendente">("todos"); const [q, setQ] = useState("");
  const todos: any[] = useMemo(() => Object.values(st.medidasCruz || {}).sort((a: any, b: any) => String(b.cruzadoEm).localeCompare(String(a.cruzadoEm))), [st.medidasCruz]);
  const ck = new Set(st.chamados.filter((c: any) => c.tipo === "checklist").map((c: any) => c.pedido));
  const busca = tira(q), dig = so(q);
  const lista = todos.filter(m => (f === "todos" || (f === "pendente" ? m.resultado === "sem" && !m.tratativa : m.resultado === f))
    && (!q || tira(m.comprador + m.visitado + m.consultor).includes(busca) || (dig.length >= 3 && (m.venda.includes(dig) || so(m.telefone).includes(dig)))));
  return (
    <section className="view active">
      <div className="view-head"><div><h2>Medidas oficiais</h2>
        <p>Resultado gravado dos cruzamentos, por nº de venda. É isso que aparece nos clientes do Checklist (📐 Medidas oficiais ok / 📐 Sem medidas).</p></div></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "10px 0" }}>
        <div className="chips">
          {([["todos", "Todos", todos.length], ["ok", "✅ Medidas oficiais ok", todos.filter(m => m.resultado === "ok").length], ["sem", "⚠️ Sem medidas", todos.filter(m => m.resultado === "sem").length], ["pendente", "Sem medidas e sem tratativa", todos.filter(m => m.resultado === "sem" && !m.tratativa).length]] as [any, string, number][])
            .map(([k, l, n]) => <button key={k} className={"chip" + (f === k ? " on" : "")} onClick={() => setF(k)}>{l}<span className="n">{n}</span></button>)}
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nome, venda, telefone ou consultor" style={{ marginLeft: "auto", maxWidth: 320 }} />
      </div>
      <div className="hint" style={{ marginBottom: 6 }}>{todos.filter(m => ck.has(m.venda)).length} dessas vendas estão no Checklist.</div>
      <Tabela linhas={lista.map(m => ({ ...m, salvo: m }))} />
    </section>
  );
}
