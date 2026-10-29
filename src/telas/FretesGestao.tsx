// Gestão de fretes (SIMULAÇÃO, só o Bruno): freteiros separados por dia, com aprovação individual por freteiro.
import { Fragment, useEffect, useMemo, useState } from "react";
import { useApp } from "../estado";
import { carregarFretes, moeda, podeFretes, reiniciarSimulacao, resumo, salvarRomaneio, STATUS_ROM, type Entrega, type Romaneio } from "../lib/fretes";
import { CartaoRomaneio } from "./Fretes";
import { Kpi } from "./Dashboard";

const corSt: Record<string, [string, string]> = { conferido: ["#EEF1F6", "#3B4558"], em_rota: ["#E8EEF8", "#1F3864"], enviado: ["#FFF4DC", "#7A4F00"], devolvido: ["#FDECEC", "#8A1C1C"], aprovado: ["#E8F3EC", "#1F6B3E"] };
const dataBr = (d: string) => new Date(d + "T12:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

type Linha = { chave: string; dia: string; freteiro: string; placa: string; rom: Romaneio[]; n: number; feitas: number; vol: number; km: number; vEnt: number; vKm: number; total: number; alertas: number; extras: number; status: string };

export default function FretesGestao() {
  const { R, toast } = useApp() as any;
  const [d, setD] = useState<{ rom: Romaneio[]; ent: Entrega[] } | null>(null); const [erro, setErro] = useState("");
  const [fFret, setFFret] = useState(""); const [fSt, setFSt] = useState<"" | "aprovar" | "aprovado" | "andamento">("");
  const [aberto, setAberto] = useState(""); const [aba, setAba] = useState<"dia" | "freteiro">("dia");
  const rec = () => carregarFretes().then(setD).catch(e => setErro(e.message));
  useEffect(() => { rec(); const t = setInterval(rec, 20000); return () => clearInterval(t); }, []);

  const linhas: Linha[] = useMemo(() => {
    if (!d) return [];
    const m: Record<string, Linha> = {};
    d.rom.forEach(r => {
      const k = r.data + "|" + r.freteiro, s = resumo(r, d.ent);
      const l = (m[k] = m[k] || { chave: k, dia: r.data, freteiro: r.freteiro, placa: r.placa, rom: [], n: 0, feitas: 0, vol: 0, km: 0, vEnt: 0, vKm: 0, total: 0, alertas: 0, extras: 0, status: "" });
      l.rom.push(r); l.n += s.normais.length; l.feitas += s.feitas; l.vol += s.volEnt; l.km += s.km || 0; l.vEnt += s.vEnt; l.vKm += s.vKm; l.total += s.total;
      l.alertas += s.difVol.length + s.difValor.length + s.semCanhoto + s.normais.filter(e => ["parcial", "nao_entregue"].includes(e.situacao)).length;
      l.extras += s.extrasPend.length;
    });
    // status do freteiro no dia: o "menos avançado" dos romaneios dele
    const ordem = ["conferido", "em_rota", "devolvido", "enviado", "aprovado"];
    Object.values(m).forEach(l => { l.status = l.rom.map(r => r.status).sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b))[0]; });
    return Object.values(m).sort((a, b) => b.dia.localeCompare(a.dia) || a.freteiro.localeCompare(b.freteiro, "pt-BR"));
  }, [d]);

  if (!podeFretes(R.currentUserId)) return <section className="view active"><div className="empty">Fretes está em simulação, só no usuário do Bruno.</div></section>;
  const freteiros = Array.from(new Set(linhas.map(l => l.freteiro))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const okSt = (l: Linha) => !fSt || (fSt === "aprovar" ? l.status === "enviado" : fSt === "aprovado" ? l.status === "aprovado" : ["conferido", "em_rota", "devolvido"].includes(l.status));
  const vis = linhas.filter(l => (!fFret || l.freteiro === fFret) && okSt(l));
  const dias = Array.from(new Set(vis.map(l => l.dia)));
  const soma = (L: Linha[], f: (l: Linha) => number) => L.reduce((s, l) => s + f(l), 0);
  const paraAprovar = linhas.filter(l => l.status === "enviado");

  const aprovar = async (l: Linha) => {
    if (l.extras) { toast("Há parada extra para autorizar ou recusar: abra o detalhe"); setAberto(l.chave); return; }
    const env = l.rom.filter(r => r.status === "enviado");
    if (!env.length) return;
    if (!confirm("Aprovar " + l.freteiro + " em " + dataBr(l.dia) + ": " + env.length + " romaneio(s), " + moeda(l.total) + (l.alertas ? "\n\n⚠️ " + l.alertas + " ponto(s) de conferência (volume, valor, canhoto ou não entregue)." : "") + "?")) return;
    try { for (const r of env) await salvarRomaneio(r.id, { status: "aprovado", aprovado_em: new Date().toISOString(), aprovado_por: "Bruno" }); await rec(); toast(l.freteiro + " aprovado ✅"); } catch (e: any) { toast(e.message); }
  };
  const devolver = async (l: Linha) => {
    const mot = prompt("Motivo da devolução para " + l.freteiro + " (ele vê no celular):"); if (!mot) return;
    try { for (const r of l.rom.filter(r => r.status === "enviado")) await salvarRomaneio(r.id, { status: "devolvido", devolvido_motivo: mot }); await rec(); toast("Devolvido a " + l.freteiro); } catch (e: any) { toast(e.message); }
  };
  const reiniciar = async () => { if (!confirm("Reiniciar a simulação? Todos os romaneios de teste voltam ao início.")) return; try { await reiniciarSimulacao(); await rec(); toast("Simulação reiniciada"); } catch (e: any) { toast(e.message); } };

  const Pill = ({ st }: { st: string }) => { const [b, c] = corSt[st] || corSt.conferido; return <span className="pill" style={{ background: b, color: c, fontWeight: 800 }}>{st === "enviado" ? "Para aprovar" : STATUS_ROM[st] || st}</span>; };
  const linhaTab = (l: Linha, porDia = true) => <Fragment key={l.chave}>
    <tr className={"ma-lin" + (aberto === l.chave ? " on" : "")} onClick={() => setAberto(aberto === l.chave ? "" : l.chave)}>
      {porDia ? <td><b>{l.freteiro}</b><div className="hint">{l.placa} · romaneio {l.rom.map(r => r.numero).join(", ")}</div></td>
        : <td><b style={{ textTransform: "capitalize" }}>{dataBr(l.dia)}</b><div className="hint">romaneio {l.rom.map(r => r.numero).join(", ")}</div></td>}
      <td className="n">{l.feitas}/{l.n}</td><td className="n">{l.vol}</td><td className="n">{l.km || "—"}</td>
      <td className="n">{moeda(l.vEnt)}</td><td className="n">{moeda(l.vKm)}</td><td className="n"><b>{moeda(l.total)}</b></td>
      <td>{l.alertas ? <span style={{ color: "var(--warn)", fontWeight: 700 }}>⚠️ {l.alertas}</span> : <span style={{ color: "var(--st-concluida)", fontWeight: 700 }}>OK</span>}{l.extras ? <div style={{ color: "#7A4F00", fontWeight: 700, fontSize: 12 }}>+{l.extras} extra p/ autorizar</div> : null}</td>
      <td><Pill st={l.status} /></td>
      <td onClick={e => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
        {l.status === "enviado" ? <><button className="btn sm primary" onClick={() => aprovar(l)}>✅ Aprovar</button> <button className="btn sm" onClick={() => devolver(l)}>Devolver</button></>
          : l.status === "aprovado" ? <span className="hint">aprovado{l.rom[0]?.aprovado_em ? " " + new Date(l.rom[0].aprovado_em).toLocaleDateString("pt-BR").slice(0, 5) : ""}</span>
          : <span className="hint">aguardando o freteiro</span>}
      </td>
    </tr>
    {aberto === l.chave && d && <tr><td colSpan={10} style={{ background: "var(--surface-2)", padding: 12 }}>{l.rom.map(r => <CartaoRomaneio key={r.id} r={r} ent={d.ent} rec={rec} />)}</td></tr>}
  </Fragment>;
  const cab = <thead><tr><th>Freteiro</th><th className="n">Entregas</th><th className="n">Volumes</th><th className="n">Km</th><th className="n">Entregas R$</th><th className="n">Km R$</th><th className="n">Total</th><th>Conferência</th><th>Situação</th><th></th></tr></thead>;

  return (
    <section className="view active">
      <div className="view-head"><div><h2>🚚 Gestão de fretes <span className="pill" style={{ background: "#7a3fb0", color: "#fff", fontSize: 12, verticalAlign: 3 }}>SIMULAÇÃO</span></h2>
        <p>Os freteiros separados por dia. Aprove cada freteiro individualmente depois de conferir: toque na linha para ver as entregas. Carlos e Marcos são freteiros de exemplo.</p></div></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <div className="subnav" style={{ margin: 0 }}><button className={aba === "dia" ? "on" : ""} onClick={() => setAba("dia")}>📅 Por dia</button><button className={aba === "freteiro" ? "on" : ""} onClick={() => setAba("freteiro")}>🚚 Por freteiro</button></div>
        <select value={fFret} onChange={e => setFFret(e.target.value)} style={{ maxWidth: 220 }}><option value="">Todos os freteiros</option>{freteiros.map(f => <option key={f} value={f}>{f}</option>)}</select>
        <div className="chips" style={{ margin: 0 }}>{([["", "Todos"], ["aprovar", "Para aprovar (" + paraAprovar.length + ")"], ["andamento", "Em andamento"], ["aprovado", "Aprovados"]] as [any, string][]).map(([k, l]) => <button key={k} className={"chip" + (fSt === k ? " on" : "")} onClick={() => setFSt(k)}>{l}</button>)}</div>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}><a className="btn sm" href="/frete" target="_blank" rel="noopener">📱 Modo freteiro</a><button className="btn sm" onClick={rec}>↻</button><button className="btn sm" onClick={reiniciar}>↺ Reiniciar simulação</button></span>
      </div>
      {erro ? <div className="empty">{erro}</div> : !d ? <div className="empty">Carregando…</div> : <>
        <div className="kpis" style={{ marginBottom: 14 }}>
          <Kpi n={paraAprovar.length} l={"freteiro(s)/dia para aprovar · " + moeda(soma(paraAprovar, l => l.total))} cls={paraAprovar.length ? "alert" : ""} />
          <Kpi n={moeda(soma(vis.filter(l => l.status === "aprovado"), l => l.total))} l="aprovado no filtro" fs={20} />
          <Kpi n={moeda(soma(vis, l => l.total))} l={"total no filtro · " + soma(vis, l => l.km) + " km"} fs={20} />
        </div>
        {aba === "dia" ? (!dias.length ? <div className="empty">Nada neste filtro.</div> : dias.map(dia => {
          const L = vis.filter(l => l.dia === dia);
          return <div key={dia} className="card" style={{ padding: 0, marginBottom: 14, overflowX: "auto" }}>
            <div className="ma-cab"><b style={{ textTransform: "capitalize" }}>{dataBr(dia)}</b><span className="hint">{L.length} freteiro(s) · {soma(L, l => l.feitas)} entregas · {soma(L, l => l.km)} km</span><b style={{ marginLeft: "auto" }}>{moeda(soma(L, l => l.total))}</b></div>
            <table className="ma-tab" style={{ minWidth: 980 }}>{cab}<tbody>{L.map(l => linhaTab(l))}</tbody></table>
          </div>;
        })) : (freteiros.filter(f => !fFret || f === fFret).map(f => {
          const L = vis.filter(l => l.freteiro === f); if (!L.length) return null;
          return <div key={f} className="card" style={{ padding: 0, marginBottom: 14, overflowX: "auto" }}>
            <div className="ma-cab"><b>{f}</b><span className="hint">{L.length} dia(s) · {soma(L, l => l.feitas)} entregas · {soma(L, l => l.km)} km · aprovado {moeda(soma(L.filter(l => l.status === "aprovado"), l => l.total))} · para aprovar {moeda(soma(L.filter(l => l.status === "enviado"), l => l.total))}</span><b style={{ marginLeft: "auto" }}>{moeda(soma(L, l => l.total))}</b></div>
            <table className="ma-tab" style={{ minWidth: 980 }}><thead><tr><th>Dia</th><th className="n">Entregas</th><th className="n">Volumes</th><th className="n">Km</th><th className="n">Entregas R$</th><th className="n">Km R$</th><th className="n">Total</th><th>Conferência</th><th>Situação</th><th></th></tr></thead>
              <tbody>{L.map(l => linhaTab(l, false))}</tbody></table>
          </div>;
        }))}
      </>}
    </section>
  );
}
