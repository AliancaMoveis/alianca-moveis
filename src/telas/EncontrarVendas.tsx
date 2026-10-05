// Encontrar vendas: confere as vendas da loja (relatório de vendas do Exact) com os clientes do Minha Visita (customers).
// Cruza pelo telefone e, para quem não bate pelo telefone, pelo endereço (rua + número + cidade), comparando o complemento.
// Tudo é feito no navegador: as planilhas não são gravadas no banco.
import { useRef, useState } from "react";
import { useApp } from "../estado";
import { Kpi } from "./Dashboard";
import { col, fmtTel, lerArquivo, tira } from "./Medidas";
import { cruzarVendas, type Achado, type Linha, type ResVenda } from "../lib/cruzarVendas";

type Arq = { nome: string; linhas: Linha[] };
type Filtro = "achados" | "telefone" | "end_ok" | "end_sem" | "end_dif" | "nada" | "todos";

const COMO: Record<Achado["como"], [string, string, string]> = {
  telefone: ["📞 Telefone", "var(--st-concluida, #0f8a5f)", "O telefone da venda é o mesmo do cadastro no Minha Visita"],
  end_ok: ["🏠 Endereço + complemento", "var(--st-concluida, #0f8a5f)", "Mesma rua, número e cidade — bloco/apto/casa também conferem"],
  end_sem: ["🏠 Endereço (sem complemento)", "var(--warn)", "Mesma rua, número e cidade — um dos lados não tem bloco/apto/casa para comparar"],
  end_dif: ["⚠️ Endereço, complemento diferente", "var(--danger)", "Mesma rua e número, mas bloco/apto/casa diferentes — provavelmente outro morador do mesmo prédio/condomínio"],
};
const Selo = ({ a }: { a: Achado }) => <span className="pill" title={COMO[a.como][2]} style={{ background: COMO[a.como][1], color: "#fff", fontWeight: 700, fontSize: 11.5, whiteSpace: "nowrap" }}>{COMO[a.como][0]}</span>;
const consultorDe = (c: Linha) => col(c, "Contato de") || (col(c, "Último Check").split("|")[0] || "").trim();
const brl = (v: string) => { const n = Number(String(v || "").replace(",", ".")); return isFinite(n) && v ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : ""; };

export default function EncontrarVendas() {
  const { toast } = useApp() as any;
  const inMv = useRef<HTMLInputElement>(null), inEx = useRef<HTMLInputElement>(null);
  const [mvs, setMvs] = useState<Arq[]>([]), [exs, setExs] = useState<Arq[]>([]);
  const [res, setRes] = useState<ResVenda[] | null>(null);
  const [f, setF] = useState<Filtro>("achados"); const [q, setQ] = useState(""); const [aberto, setAberto] = useState<string>("");

  async function add(files: FileList | null, set: (fn: (x: Arq[]) => Arq[]) => void, tipo: string) {
    for (const file of Array.from(files || [])) {
      try { const l = await lerArquivo(file); if (!l.length) { toast(file.name + ": planilha vazia"); continue; } set(x => [...x, { nome: file.name, linhas: l }]); setRes(null); }
      catch (e: any) { toast(`Não consegui ler ${file.name} (${tipo}): ${e.message}`); }
    }
  }
  const totMv = mvs.reduce((s, a) => s + a.linhas.length, 0), totEx = exs.reduce((s, a) => s + a.linhas.length, 0);
  function rodar() {
    const r = cruzarVendas(mvs.flatMap(a => a.linhas), exs.flatMap(a => a.linhas), col);
    setRes(r); setF("achados"); setAberto("");
    toast(`${r.filter(x => x.melhor).length} de ${r.length} vendas encontradas no Minha Visita`);
  }

  const n = (k: Filtro) => (res || []).filter(x => k === "todos" || (k === "nada" ? !x.melhor : k === "achados" ? !!x.melhor : x.melhor?.como === k)).length;
  const busca = tira(q), dig = q.replace(/\D/g, "");
  const lista = (res || []).filter(x => (f === "todos" || (f === "nada" ? !x.melhor : f === "achados" ? !!x.melhor : x.melhor?.como === f))
    && (!q || tira([col(x.ex, "Cliente"), col(x.ex, "Vendedor"), col(x.ex, "Orçamento"), ...x.achados.flatMap(a => [col(a.mv, "Nome"), consultorDe(a.mv), col(a.mv, "Status")])].join(" ")).includes(busca)
      || (dig.length >= 3 && (col(x.ex, "ID").includes(dig) || [col(x.ex, "ClienteTel1"), col(x.ex, "ClienteTel2")].some(t => t.replace(/\D/g, "").includes(dig))))));

  function exportar() {
    const cab = ["Venda", "Data", "Situação", "Vendedor", "Cliente (Exact)", "Telefone 1", "Telefone 2", "Valor", "Endereço (Exact)", "Encontrado por", "Mesmo nome", "Cliente (Minha Visita)", "Status Minha Visita", "Consultor", "Criado por", "Endereço (Minha Visita)", "Telefone (Minha Visita)", "Último check", "Outros cadastros"];
    const q = (s: any) => '"' + String(s ?? "").replace(/"/g, '""') + '"';
    const linhas = lista.map(x => { const a = x.melhor, c = a?.mv;
      return [col(x.ex, "ID"), col(x.ex, "DataSituação"), col(x.ex, "SituaçãoVenda"), col(x.ex, "Vendedor"), col(x.ex, "Cliente"), col(x.ex, "ClienteTel1"), col(x.ex, "ClienteTel2"), col(x.ex, "ValorTotaRecebido", "ValorTotal"), col(x.ex, "Orçamento"),
        a ? COMO[a.como][0].replace(/^\S+\s/, "") : "não encontrado", a?.mesmoNome ? "sim" : "", c ? col(c, "Nome") : "", c ? col(c, "Status") : "", c ? consultorDe(c) : "", c ? col(c, "Criado por") : "", c ? col(c, "Endereco", "Endereço") : "", c ? col(c, "Celular") : "", c ? col(c, "Último Check") : "", Math.max(0, x.achados.length - 1) || ""].map(q).join(";"); });
    const blob = new Blob(["﻿" + [cab.map(q).join(";"), ...linhas].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = "vendas-x-minha-visita.csv"; el.click(); setTimeout(() => URL.revokeObjectURL(el.href), 2000);
  }

  const caixa: React.CSSProperties = { flex: 1, minWidth: 280, border: "2px dashed var(--line)", borderRadius: 12, padding: 14, background: "var(--surface-2)" };
  const Caixa = ({ titulo, arqs, set, inp }: { titulo: string; arqs: Arq[]; set: (fn: (x: Arq[]) => Arq[]) => void; inp: React.RefObject<HTMLInputElement> }) => (
    <div style={caixa}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{titulo} <span className="pill">{arqs.reduce((s, a) => s + a.linhas.length, 0)} linhas</span></div>
      {arqs.map((a, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "4px 0" }}>📄 <span style={{ flex: 1 }}>{a.nome}</span><span className="pill">{a.linhas.length}</span>
        <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => { set(x => x.filter((_, j) => j !== i)); setRes(null); }}>✕</button></div>)}
      <button className="btn sm" style={{ marginTop: 6 }} onClick={() => inp.current?.click()}>＋ {arqs.length ? "Adicionar outra planilha" : "Adicionar planilha"}</button>
    </div>
  );

  const th: React.CSSProperties = { textAlign: "left", padding: "8px 8px", fontSize: 12, color: "var(--ink-soft)", borderBottom: "2px solid var(--line)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 };
  const td: React.CSSProperties = { padding: "7px 8px", fontSize: 13, borderBottom: "1px solid var(--line-soft)", verticalAlign: "top" };
  const CelMv = ({ a }: { a: Achado }) => (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 2 }}><Selo a={a} />{a.mesmoNome && <span className="pill" style={{ fontSize: 11 }} title="O nome do cadastro é parecido com o do comprador">👤 mesmo nome</span>}</div>
      <b>{col(a.mv, "Nome")}</b> <span className="hint">· {col(a.mv, "Status")}</span>
      <div className="hint">{col(a.mv, "Endereco", "Endereço") || "sem endereço"}{col(a.mv, "Celular") ? " · " + fmtTel(col(a.mv, "Celular")) : ""}</div>
    </div>
  );

  return (
    <section className="view active">
      <div className="view-head"><div><h2>Encontrar vendas</h2>
        <p>Confere as vendas da loja com os clientes do Minha Visita. Anexe o <b>relatório de vendas do Exact</b> e as planilhas <b>customers do Minha Visita</b> (quantas precisar). O cruzamento é pelo <b>telefone</b> e, quando o telefone não bate, pelo <b>endereço</b> (rua, número e cidade) comparando o complemento (bloco, apto, casa). As planilhas ficam só nesta tela — nada é gravado.</p></div></div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "10px 0" }}>
        <Caixa titulo="🧾 Exact · relatório de vendas" arqs={exs} set={setExs} inp={inEx} />
        <Caixa titulo="🏠 Minha Visita · customers" arqs={mvs} set={setMvs} inp={inMv} />
        <input ref={inEx} type="file" accept=".csv,.xlsx" multiple style={{ display: "none" }} onChange={e => { add(e.target.files, setExs, "Exact"); e.target.value = ""; }} />
        <input ref={inMv} type="file" accept=".csv,.xlsx" multiple style={{ display: "none" }} onChange={e => { add(e.target.files, setMvs, "Minha Visita"); e.target.value = ""; }} />
        <div style={{ display: "flex", alignItems: "center" }}><button className="btn primary" disabled={!totMv || !totEx} onClick={rodar}>🔎 Encontrar vendas</button></div>
      </div>

      {res && <>
        <div className="kpis" style={{ margin: "6px 0 10px" }}>
          {([["Vendas no relatório", res.length], ["Encontradas no Minha Visita", n("achados")], ["Pelo telefone", n("telefone")], ["Pelo endereço", n("end_ok") + n("end_sem") + n("end_dif")], ["Não encontradas", n("nada")]] as [string, number][])
            .map(([l, v]) => <Kpi key={l} n={v} l={l} />)}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "0 0 8px" }}>
          <div className="chips">
            {([["achados", "Encontradas"], ["telefone", "📞 Telefone"], ["end_ok", "🏠 Endereço + complemento"], ["end_sem", "🏠 Endereço sem complemento"], ["end_dif", "⚠️ Complemento diferente"], ["nada", "Não encontradas"], ["todos", "Todas"]] as [Filtro, string][])
              .map(([k, l]) => <button key={k} className={"chip" + (f === k ? " on" : "")} onClick={() => setF(k)}>{l}<span className="n">{n(k)}</span></button>)}
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente, venda, telefone, vendedor, consultor" style={{ marginLeft: "auto", maxWidth: 320 }} />
          <button className="btn sm" disabled={!lista.length} onClick={exportar}>⬇️ Baixar planilha</button>
        </div>
        {!lista.length ? <div className="card" style={{ padding: 20, textAlign: "center", color: "var(--ink-faint)" }}>Nenhuma venda neste filtro.</div> :
          <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: "68vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Venda</th><th style={th}>Cliente (Exact)</th><th style={th}>Endereço da venda</th><th style={th}>Vendedor</th><th style={th}>Cliente no Minha Visita</th><th style={th}>Consultor</th></tr></thead>
              <tbody>{lista.map((x, i) => {
                const id = col(x.ex, "ID") || String(i), a = x.melhor, outros = x.achados.slice(1);
                return (
                  <tr key={id}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}><b>{col(x.ex, "ID")}</b><div className="hint">{col(x.ex, "DataSituação").slice(0, 10)}</div><div className="hint">{col(x.ex, "SituaçãoVenda")}</div>{brl(col(x.ex, "ValorTotaRecebido", "ValorTotal")) && <div className="hint">{brl(col(x.ex, "ValorTotaRecebido", "ValorTotal"))}</div>}</td>
                    <td style={td}><b>{col(x.ex, "Cliente")}</b>{[col(x.ex, "ClienteTel1"), col(x.ex, "ClienteTel2")].filter(t => t.replace(/\D/g, "").length >= 8).map((t, j) => <div key={j} className="hint" style={{ whiteSpace: "nowrap" }}>{fmtTel(t)}</div>)}</td>
                    <td style={{ ...td, minWidth: 200 }}>{col(x.ex, "Orçamento", "Endereço") || <span className="hint">—</span>}</td>
                    <td style={td}>{col(x.ex, "Vendedor")}</td>
                    <td style={{ ...td, minWidth: 280 }}>{a ? <>
                      <CelMv a={a} />
                      {outros.length > 0 && <button className="btn ghost sm" style={{ marginTop: 4 }} onClick={() => setAberto(aberto === id ? "" : id)}>{aberto === id ? "esconder" : `+${outros.length} outro(s) cadastro(s)`}</button>}
                      {aberto === id && outros.map((o, j) => <div key={j} style={{ borderTop: "1px dashed var(--line)", marginTop: 6, paddingTop: 6 }}><CelMv a={o} /><div className="hint">Consultor: {consultorDe(o.mv) || "—"}</div></div>)}
                    </> : <span className="hint">não encontrado</span>}</td>
                    <td style={td}>{a ? <>{consultorDe(a.mv) || <span className="hint">—</span>}{col(a.mv, "Criado por") && <div className="hint">cadastro: {col(a.mv, "Criado por")}</div>}{col(a.mv, "Último Check") && <div className="hint">{col(a.mv, "Último Check")}</div>}</> : null}</td>
                  </tr>);
              })}</tbody>
            </table>
          </div>}
      </>}
    </section>
  );
}
