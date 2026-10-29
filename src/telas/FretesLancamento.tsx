// Lançamento de fretes pelo ESCRITÓRIO (SIMULAÇÃO, só o Bruno) — sem o freteiro usar nada.
// As meninas lançam como na planilha de hoje: freteiro + nº do romaneio + valor (um a um), ou só o valor total conferido.
// Depois enviam para aprovação; a Gestão confere (um a um × total informado), aprova por freteiro e vê o total a pagar.
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { apagarLanc, criarLanc, listarLanc, moeda, mudarLanc, podeFretes, type Lanc } from "../lib/fretes";

const FRETEIROS = ["José Elias da Silva", "Carlos (exemplo)", "Marcos (exemplo)"];
const num = (s: string) => { const t = String(s || "").replace(/[^\d,.-]/g, ""); const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "")); return isFinite(n) ? n : 0; };
const br = (s: string) => s ? s.slice(8, 10) + "/" + s.slice(5, 7) : "";
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const ST: Record<string, [string, string, string]> = { lancado: ["Em digitação", "#EEF1F6", "#3B4558"], enviado: ["Aguardando aprovação", "#FFF4DC", "#7A4F00"], aprovado: ["Aprovado", "#E8F3EC", "#1F6B3E"] };

export default function FretesLancamento() {
  const { R, toast } = useApp() as any;
  const [lancs, setLancs] = useState<Lanc[] | null>(null); const [erro, setErro] = useState("");
  const [aba, setAba] = useState<"lancar" | "aprovar">("lancar");
  const [de, setDe] = useState("2026-10-01"); const [ate, setAte] = useState(hoje());
  const rec = () => listarLanc().then(setLancs).catch(e => setErro(e.message));
  useEffect(() => { rec(); }, []);
  if (!podeFretes(R.currentUserId)) return <section className="view active"><div className="empty">Fretes está em simulação, só no usuário do Bruno.</div></section>;
  const vis = (lancs || []).filter(l => l.data >= de && l.data <= ate);
  return (
    <section className="view active">
      <div className="view-head"><div><h2>🚚 Lançamento de fretes <span className="pill" style={{ background: "#7a3fb0", color: "#fff", fontSize: 12, verticalAlign: 3 }}>SIMULAÇÃO</span></h2>
        <p>O escritório lança os romaneios como na planilha de hoje — freteiro, nº e valor — ou só o valor total conferido do freteiro. Depois envia para aprovação e a Gestão contabiliza o total a pagar. O freteiro não precisa usar nada.</p></div></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div className="subnav" style={{ margin: 0 }}>
          <button className={aba === "lancar" ? "on" : ""} onClick={() => setAba("lancar")}>✏️ Lançar (as meninas)</button>
          <button className={aba === "aprovar" ? "on" : ""} onClick={() => setAba("aprovar")}>✅ Aprovar e contabilizar (Gestão)</button>
        </div>
        <div className="field" style={{ margin: 0 }}><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={rec}>↻ Atualizar</button>
      </div>
      {erro ? <div className="empty">{erro}</div> : !lancs ? <div className="empty">Carregando…</div>
        : aba === "lancar" ? <Lancar lancs={vis} rec={rec} toast={toast} nome={R.nomeUser(R.currentUserId)} />
        : <Aprovar lancs={vis} rec={rec} toast={toast} />}
    </section>
  );
}

// ---------- aba 1: lançar (um a um como na planilha, ou só o total) ----------
function Lancar({ lancs, rec, toast, nome }: { lancs: Lanc[]; rec: () => any; toast: (m: string) => void; nome: string }) {
  const [fret, setFret] = useState(FRETEIROS[0]); const [outro, setOutro] = useState("");
  const [data, setData] = useState(hoje());
  const [rom, setRom] = useState(""); const [val, setVal] = useState("");
  const [tVal, setTVal] = useState(""); const [tQtd, setTQtd] = useState(""); const [tObs, setTObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const romRef = useRef<HTMLInputElement>(null);
  const freteiro = fret === "__outro" ? outro.trim() : fret;
  const addLinha = async () => {
    if (!freteiro) { toast("Escolha o freteiro"); return; }
    if (!rom.trim()) { toast("Informe o nº do romaneio"); romRef.current?.focus(); return; }
    const v = num(val); if (!v) { toast("Informe o valor"); return; }
    if (lancs.some(l => l.tipo === "romaneio" && l.romaneio === rom.trim() && l.freteiro === freteiro)) { toast("O romaneio " + rom.trim() + " já foi lançado para " + freteiro); return; }
    setSalvando(true);
    try { await criarLanc({ freteiro, data, romaneio: rom.trim(), valor: v, tipo: "romaneio", lancado_por: nome }); setRom(""); setVal(""); await rec(); romRef.current?.focus(); }
    catch (e: any) { toast(e.message); } finally { setSalvando(false); }
  };
  const addTotal = async () => {
    if (!freteiro) { toast("Escolha o freteiro"); return; }
    const v = num(tVal); if (!v) { toast("Informe o valor total conferido"); return; }
    setSalvando(true);
    try { await criarLanc({ freteiro, data, romaneio: "", valor: v, tipo: "total", obs: (tQtd ? tQtd + " romaneio(s)" : "") + (tObs ? (tQtd ? " · " : "") + tObs : ""), lancado_por: nome }); setTVal(""); setTQtd(""); setTObs(""); await rec(); toast("Total conferido lançado"); }
    catch (e: any) { toast(e.message); } finally { setSalvando(false); }
  };
  const enviar = async (f: string, ids: number[]) => {
    if (!confirm("Enviar os lançamentos de " + f + " para aprovação? Depois disso só a Gestão mexe.")) return;
    try { await mudarLanc(ids, { status: "enviado", enviado_em: new Date().toISOString() } as any); await rec(); toast("Enviado para aprovação"); } catch (e: any) { toast(e.message); }
  };
  const grupos = agrupar(lancs);
  return <>
    <div className="card" style={{ padding: 14, marginBottom: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ margin: 0, minWidth: 220 }}><label>Freteiro</label>
          <select value={fret} onChange={e => setFret(e.target.value)}>{FRETEIROS.map(f => <option key={f} value={f}>{f}</option>)}<option value="__outro">Outro…</option></select></div>
        {fret === "__outro" && <div className="field" style={{ margin: 0 }}><label>Nome do freteiro</label><input value={outro} onChange={e => setOutro(e.target.value)} placeholder="Nome" /></div>}
        <div className="field" style={{ margin: 0 }}><label>Data</label><input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 340px", border: "2px solid var(--primary)", borderRadius: 12, padding: "10px 12px" }}>
          <b>Teste 1 · romaneio a romaneio (como na planilha)</b>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
            <div className="field" style={{ margin: 0, width: 140 }}><label>Nº do romaneio</label><input ref={romRef} value={rom} onChange={e => setRom(e.target.value.replace(/\D/g, ""))} onKeyDown={e => e.key === "Enter" && addLinha()} inputMode="numeric" placeholder="104951" /></div>
            <div className="field" style={{ margin: 0, width: 130 }}><label>Valor (R$)</label><input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === "Enter" && addLinha()} inputMode="decimal" placeholder="1.231,00" /></div>
            <button className="btn primary" disabled={salvando} onClick={addLinha}>＋ Adicionar (Enter)</button>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>Digite nº → Tab → valor → Enter. O cursor volta sozinho para o próximo romaneio — bem mais rápido que a planilha.</div>
        </div>
        <div style={{ flex: "1 1 340px", border: "2px dashed var(--line)", borderRadius: 12, padding: "10px 12px" }}>
          <b>Teste 2 · só o valor total conferido</b>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
            <div className="field" style={{ margin: 0, width: 140 }}><label>Valor total (R$)</label><input value={tVal} onChange={e => setTVal(e.target.value)} inputMode="decimal" placeholder="9.056,00" /></div>
            <div className="field" style={{ margin: 0, width: 110 }}><label>Qtde romaneios</label><input value={tQtd} onChange={e => setTQtd(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="21" /></div>
            <div className="field" style={{ margin: 0, flex: 1, minWidth: 140 }}><label>Obs.</label><input value={tObs} onChange={e => setTObs(e.target.value)} placeholder="Fechamento de outubro" /></div>
            <button className="btn" disabled={salvando} onClick={addTotal}>Lançar total</button>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>Para quando o papel do freteiro já foi conferido e só o total importa. Se os dois testes forem usados, a aprovação compara um com o outro.</div>
        </div>
      </div>
    </div>
    {!grupos.length ? <div className="empty" style={{ padding: 20 }}>Nenhum lançamento no período.</div> : grupos.map(g => <GrupoFreteiro key={g.freteiro} g={g} rec={rec} toast={toast} podeEditar enviar={enviar} />)}
  </>;
}

// ---------- aba 2: aprovação e contabilização ----------
function Aprovar({ lancs, rec, toast }: { lancs: Lanc[]; rec: () => any; toast: (m: string) => void }) {
  const grupos = agrupar(lancs);
  const env = grupos.filter(g => g.linhas.some(l => l.status === "enviado"));
  const totEnv = env.reduce((s, g) => s + g.aPagar.filter(l => l.status === "enviado").reduce((x, l) => x + l.valor, 0), 0);
  const totApr = lancs.filter(l => l.status === "aprovado" && contaPagar(l, lancs)).reduce((s, l) => s + l.valor, 0);
  const aprovar = async (g: Grupo) => {
    const ids = g.linhas.filter(l => l.status === "enviado").map(l => l.id);
    if (!ids.length) return;
    if (g.dif != null && Math.abs(g.dif) > 0.5 && !confirm("A soma dos romaneios (" + moeda(g.somaRom) + ") é DIFERENTE do total conferido (" + moeda(g.somaTot) + ") — diferença de " + moeda(g.dif) + ".\n\nAprovar mesmo assim?")) return;
    if (!confirm("Aprovar " + g.freteiro + ": " + moeda(g.pagar) + "?")) return;
    try { await mudarLanc(ids, { status: "aprovado", aprovado_em: new Date().toISOString(), aprovado_por: "Bruno" } as any); await rec(); toast(g.freteiro + " aprovado ✅"); } catch (e: any) { toast(e.message); }
  };
  const devolver = async (g: Grupo) => {
    const m = prompt("Motivo da devolução (volta para a digitação):"); if (!m) return;
    const ids = g.linhas.filter(l => l.status === "enviado").map(l => l.id);
    try { await mudarLanc(ids, { status: "lancado", devolvido_motivo: m } as any); await rec(); toast("Devolvido para a digitação"); } catch (e: any) { toast(e.message); }
  };
  return <>
    <div className="kpis" style={{ marginBottom: 14 }}>
      <div className="kpi"><div className="n">{env.length}</div><div className="l">freteiro(s) aguardando aprovação · {moeda(totEnv)}</div></div>
      <div className="kpi"><div className="n">{moeda(totApr)}</div><div className="l">✅ aprovado no período — total a pagar</div></div>
      <div className="kpi"><div className="n">{moeda(totEnv + totApr)}</div><div className="l">contabilização do período (aprovado + aguardando)</div></div>
    </div>
    {!grupos.length ? <div className="empty" style={{ padding: 20 }}>Nenhum lançamento no período.</div>
      : grupos.map(g => <GrupoFreteiro key={g.freteiro} g={g} rec={rec} toast={toast} aprovacao aprovar={() => aprovar(g)} devolver={() => devolver(g)} />)}
  </>;
}

// ---------- grupo por freteiro (usado nas duas abas) ----------
type Grupo = { freteiro: string; linhas: Lanc[]; roms: Lanc[]; tots: Lanc[]; somaRom: number; somaTot: number; dif: number | null; pagar: number; aPagar: Lanc[]; status: string };
const contaPagar = (l: Lanc, todos: Lanc[]) => l.tipo === "romaneio" || !todos.some(x => x.freteiro === l.freteiro && x.tipo === "romaneio");
function agrupar(lancs: Lanc[]): Grupo[] {
  const m: Record<string, Lanc[]> = {};
  lancs.forEach(l => (m[l.freteiro] = m[l.freteiro] || []).push(l));
  return Object.entries(m).map(([freteiro, linhas]) => {
    const roms = linhas.filter(l => l.tipo === "romaneio"), tots = linhas.filter(l => l.tipo === "total");
    const somaRom = roms.reduce((s, l) => s + l.valor, 0), somaTot = tots.reduce((s, l) => s + l.valor, 0);
    // o que vale para pagar: os romaneios um a um; se o freteiro só tem "total", vale o total
    const aPagar = roms.length ? roms : tots;
    const ordem = ["lancado", "enviado", "aprovado"];
    const status = linhas.map(l => l.status).sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b))[0];
    return { freteiro, linhas, roms, tots, somaRom, somaTot, dif: roms.length && tots.length ? somaRom - somaTot : null, pagar: aPagar.reduce((s, l) => s + l.valor, 0), aPagar, status };
  }).sort((a, b) => a.freteiro.localeCompare(b.freteiro, "pt-BR"));
}
function GrupoFreteiro({ g, rec, toast, podeEditar, enviar, aprovacao, aprovar, devolver }: any) {
  const { } = {} as any;
  const [st, bg, cor] = ST[g.status] || ST.lancado;
  const pend = g.linhas.filter((l: Lanc) => l.status === "lancado");
  const excluir = async (l: Lanc) => {
    if (l.status !== "lancado") { toast("Já foi enviado — só a Gestão devolve"); return; }
    if (!confirm("Excluir " + (l.tipo === "total" ? "o total conferido" : "o romaneio " + l.romaneio) + " de " + moeda(l.valor) + "?")) return;
    try { await apagarLanc(l.id); await rec(); toast("Excluído"); } catch (e: any) { toast(e.message); }
  };
  const batido = g.dif != null && Math.abs(g.dif) <= 0.5;
  return (
    <div className="card" style={{ padding: 0, marginBottom: 14, overflow: "hidden" }}>
      <div className="ma-cab" style={{ flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>{g.freteiro}</b>
        <span className="pill" style={{ background: bg, color: cor, fontWeight: 800 }}>{st}</span>
        {g.dif != null && (batido
          ? <span className="pill" style={{ background: "#E8F3EC", color: "#1F6B3E", fontWeight: 800 }}>✓ conferência bateu: romaneios = total informado</span>
          : <span className="pill" style={{ background: "#FDECEC", color: "#8A1C1C", fontWeight: 800 }}>⚠ diferença de {moeda(Math.abs(g.dif))} entre os romaneios ({moeda(g.somaRom)}) e o total informado ({moeda(g.somaTot)})</span>)}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <b style={{ fontSize: 17 }}>{moeda(g.pagar)}</b>
          {podeEditar && pend.length > 0 && <button className="btn sm primary" onClick={() => enviar(g.freteiro, pend.map((l: Lanc) => l.id))}>📤 Enviar para aprovação ({pend.length})</button>}
          {aprovacao && g.linhas.some((l: Lanc) => l.status === "enviado") && <><button className="btn sm primary" onClick={aprovar}>✅ Aprovar freteiro</button><button className="btn sm" onClick={devolver}>Devolver</button></>}
        </span>
      </div>
      <table className="ma-tab">
        <thead><tr><th>Data</th><th>Romaneio</th><th className="n">Valor</th><th>Lançado por</th><th>Situação</th><th></th></tr></thead>
        <tbody>
          {g.linhas.map((l: Lanc) => {
            const [s2, b2, c2] = ST[l.status] || ST.lancado;
            return <tr key={l.id} style={l.tipo === "total" ? { background: "rgba(31,56,100,.05)" } : undefined}>
              <td>{br(l.data)}</td>
              <td>{l.tipo === "total" ? <b>Σ Total conferido{l.obs ? " · " + l.obs : ""}</b> : <b>{l.romaneio}</b>}{l.devolvido_motivo ? <div className="hint" style={{ color: "var(--danger)" }}>devolvido: {l.devolvido_motivo}</div> : null}</td>
              <td className="n"><b>{moeda(l.valor)}</b></td>
              <td><small>{l.lancado_por}</small></td>
              <td><span className="pill" style={{ background: b2, color: c2, fontWeight: 700, fontSize: 11.5 }}>{s2}</span></td>
              <td>{l.status === "lancado" && <a href="#" style={{ color: "var(--danger)", fontSize: 12.5 }} onClick={e => { e.preventDefault(); excluir(l); }}>excluir</a>}</td>
            </tr>;
          })}
          <tr style={{ fontWeight: 800, borderTop: "2px solid var(--line)" }}><td></td><td>Soma dos romaneios ({g.roms.length}){g.tots.length ? " · total informado " + moeda(g.somaTot) : ""}</td><td className="n">{moeda(g.somaRom || g.somaTot)}</td><td colSpan={3}></td></tr>
        </tbody>
      </table>
    </div>
  );
}
