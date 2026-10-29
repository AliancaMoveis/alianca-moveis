// RH · Consulta do dia — envia o relatório "Ponto Diário" do Secullum (todo mundo num dia) e mostra quem trabalhou
// naquele dia (ex.: domingo), com batidas e extras. Tudo fica registrado para consultar depois. Só Bruno e Patrícia.
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { baixarXlsx } from "../lib/planilha";
import { guardarDiario, hm, listarDiasGeral, parseDiario, pdfParaItens, podeRh, type DiaGeral } from "../lib/ponto";

const br = (s: string) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—");
const DOW = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const diaSem = (s: string) => DOW[new Date(s + "T12:00:00").getDay()];
// nº ímpar de batidas = faltou uma marcação (esqueceu ou o relógio falhou) — as horas ficam erradas e precisa de correção manual
const faltaBatida = (x: { batidas?: string[] }) => (x.batidas || []).length % 2 === 1;

export default function RhConsultaDia() {
  const { R, toast } = useApp() as any;
  const [tudo, setTudo] = useState<DiaGeral[] | null>(null);
  const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState("");
  const [modo, setModo] = useState<"dia" | "periodo">("dia");
  const [dia, setDia] = useState(""); const [busca, setBusca] = useState(""); const [verTodos, setVerTodos] = useState(false);
  const [de, setDe] = useState(""); const [ate, setAte] = useState("");
  const inp = useRef<HTMLInputElement>(null);
  const rec = () => listarDiasGeral().then(d => {
    setTudo(d);
    if (d.length) { const ds = Array.from(new Set(d.map(x => x.data))).sort(); if (!dia) setDia(ds[ds.length - 1]); if (!de) setDe(ds[0]); if (!ate) setAte(ds[ds.length - 1]); }
  }).catch(e => setErro(e.message));
  useEffect(() => { rec(); }, []);
  if (!podeRh(R.currentUserId)) return <section className="view active"><div className="empty">Só o Bruno e a Patrícia (RH) veem esta tela.</div></section>;

  const subir = async (fs: FileList) => {
    const files = Array.from(fs); let ok = 0; const probs: string[] = []; let ultimo = "";
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setEnviando("Lendo " + (i + 1) + " de " + files.length + "…");
      try { const d = parseDiario(await pdfParaItens(await f.arrayBuffer()), f.name); await guardarDiario(d, R.currentUserId); ok++; ultimo = d.data; }
      catch (e: any) { probs.push(f.name + ": " + (e.message || "não deu para ler")); }
    }
    setEnviando("");
    toast(ok + " dia(s) registrado(s)" + (probs.length ? " · " + probs.length + " com problema" : ""));
    if (probs.length) alert(probs.join("\n"));
    await rec(); if (ultimo) setDia(ultimo);
  };

  const datas = useMemo(() => Array.from(new Set((tudo || []).map(x => x.data))).sort().reverse(), [tudo]);
  const doDia = useMemo(() => (tudo || []).filter(x => x.data === dia), [tudo, dia]);
  const trab = doDia.filter(x => (x.batidas || []).length).filter(x => !busca.trim() || x.nome.toLowerCase().includes(busca.toLowerCase()));
  const resto = doDia.filter(x => !(x.batidas || []).length);
  const marc = resto.filter(x => x.marcador);
  const noPer = useMemo(() => (tudo || []).filter(x => x.data >= de && x.data <= ate && (x.batidas || []).length), [tudo, de, ate]);
  const porPessoa = useMemo(() => {
    const m = new Map<string, { folha: string; nome: string; dias: DiaGeral[]; extras: number; faltas: number }>();
    for (const x of noPer) {
      const k = x.folha + "¦" + x.nome;
      const g = m.get(k) || { folha: x.folha, nome: x.nome, dias: [], extras: 0, faltas: 0 };
      g.dias.push(x); g.extras += x.extras || 0; g.faltas += x.faltas || 0; m.set(k, g);
    }
    return Array.from(m.values()).filter(g => !busca.trim() || g.nome.toLowerCase().includes(busca.toLowerCase()))
      .sort((a, b) => b.dias.length - a.dias.length || a.nome.localeCompare(b.nome));
  }, [noPer, busca]);
  const datasPer = useMemo(() => Array.from(new Set((tudo || []).filter(x => x.data >= de && x.data <= ate).map(x => x.data))).sort(), [tudo, de, ate]);
  const exportarPer = () => baixarXlsx("trabalharam_" + de + "_a_" + ate + ".xlsx",
    ["Nº folha", "Nome", "Dias trabalhados", "Quais dias", "Domingos", "Dias com batida faltando (corrigir)", "Extras no período", "Faltas no período"],
    porPessoa.map(g => [g.folha, g.nome, g.dias.length, g.dias.map(d => br(d.data).slice(0, 5)).join(", "),
      g.dias.filter(d => new Date(d.data + "T12:00").getDay() === 0).length,
      g.dias.filter(faltaBatida).map(d => br(d.data).slice(0, 5)).join(", "), g.extras ? hm(g.extras) : "", g.faltas ? hm(g.faltas) : ""]),
    br(de) + " a " + br(ate));
  const exportar = () => baixarXlsx("trabalharam_" + dia + ".xlsx",
    ["Nº folha", "Nome", "Batidas", "Falta batida?", "Extras", "Faltas", "Dia"],
    trab.map(x => [x.folha, x.nome, (x.batidas || []).join(" "), faltaBatida(x) ? "SIM — corrigir manualmente" : "", x.extras ? hm(x.extras) : "", x.faltas ? hm(x.faltas) : "", br(dia) + " (" + diaSem(dia) + ")"]),
    br(dia));

  return (
    <section className="view active">
      <div className="view-head"><div><h2>📅 RH · Consulta do dia</h2><p>Envie o relatório <b>Ponto Diário</b> do Secullum (um PDF por dia, pode vários de uma vez) e veja quem trabalhou no dia — domingos, feriados, qualquer data. Fica tudo registrado para consultar quando quiser.</p></div></div>
      <div className="card ma-topo">
        <div className="ma-envio">
          <input ref={inp} type="file" accept=".pdf" multiple style={{ display: "none" }} onChange={e => { if (e.target.files?.length) subir(e.target.files).finally(() => { if (inp.current) inp.current.value = ""; }); }} />
          <button className="btn primary" disabled={!!enviando} onClick={() => inp.current?.click()}>{enviando || "📤 Enviar Ponto Diário (PDF)"}</button>
          <span className="hint">{tudo ? datas.length + " dia(s) registrado(s)" : erro || "Carregando…"}{dia ? " · reenviar o mesmo dia atualiza" : ""}</span>
        </div>
        <div className="ma-filtros">
          <div className="field"><label>Consulta</label><div className="subnav" style={{ margin: 0 }}><button className={modo === "dia" ? "on" : ""} onClick={() => setModo("dia")}>Um dia</button><button className={modo === "periodo" ? "on" : ""} onClick={() => setModo("periodo")}>Período</button></div></div>
          {modo === "dia" ? <div className="field"><label>Dia</label><select value={dia} onChange={e => setDia(e.target.value)}>{!datas.length && <option value="">—</option>}{datas.map(d => <option key={d} value={d}>{br(d)} · {diaSem(d)}</option>)}</select></div>
            : <><div className="field"><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
              <div className="field"><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div></>}
          <div className="field" style={{ flex: "1 1 180px" }}><label>Buscar nome</label><input value={busca} onChange={e => setBusca(e.target.value)} /></div>
        </div>
      </div>
      {modo === "periodo" ? (!datasPer.length ? <div className="empty" style={{ padding: 24 }}>Nenhum dia registrado entre {br(de)} e {br(ate)} — envie os Pontos Diários desses dias.</div> : <>
        <div className="kpis" style={{ marginTop: 14 }}>
          <div className="card" style={{ padding: "12px 14px", flex: "1 1 160px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{porPessoa.length}</div><div className="hint">pessoas trabalharam no período</div></div>
          <div className="card" style={{ padding: "12px 14px", flex: "1 1 160px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{datasPer.length}</div><div className="hint">dias registrados de {br(de)} a {br(ate)}</div></div>
          <div className="card" style={{ padding: "12px 14px", flex: "1 1 160px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{hm(porPessoa.reduce((s2, g) => s2 + g.extras, 0))}</div><div className="hint">extras no período (total)</div></div>
        </div>
        {datasPer.length < Math.round((+new Date(ate) - +new Date(de)) / 86400000) + 1 && <p className="hint" style={{ marginTop: 8 }}>⚠ O período tem {Math.round((+new Date(ate) - +new Date(de)) / 86400000) + 1} dias, mas só {datasPer.length} foram enviados ({datasPer.map(d => br(d).slice(0, 5)).join(", ")}) — a consulta conta só o que foi enviado.</p>}
        <div className="card" style={{ padding: 0, marginTop: 14, overflowX: "auto" }}>
          <div className="ma-cab"><b>✅ Quem trabalhou de {br(de)} a {br(ate)}</b><button className="btn primary sm" disabled={!porPessoa.length} onClick={exportarPer}>⬇ Excel</button></div>
          {!porPessoa.length ? <div className="empty" style={{ padding: 24 }}>Ninguém com batida{busca ? " com essa busca" : ""}.</div> :
            <table className="ma-tab" style={{ minWidth: 820 }}>
              <thead><tr><th>Nº folha</th><th>Nome</th><th className="n">Dias trab.</th><th className="n">Domingos</th><th>Quais dias</th><th>⚠ Batida faltando</th><th className="n">Extras</th><th className="n">Faltas</th></tr></thead>
              <tbody>{porPessoa.map(g => <tr key={g.folha + g.nome} style={g.dias.some(faltaBatida) ? { background: "rgba(214,60,60,.10)" } : undefined}>
                <td>{g.folha}</td><td><b>{g.nome}</b></td>
                <td className="n"><b>{g.dias.length}</b></td>
                <td className="n">{(() => { const n = g.dias.filter(d => new Date(d.data + "T12:00").getDay() === 0).length; return n ? <b style={{ color: "var(--warn)" }}>{n}</b> : "–"; })()}</td>
                <td style={{ maxWidth: 360 }}>{g.dias.map(d => br(d.data).slice(0, 5)).join(", ")}</td>
                <td>{(() => { const f = g.dias.filter(faltaBatida); return f.length ? <b style={{ color: "var(--danger)" }}>{f.map(d => br(d.data).slice(0, 5)).join(", ")} — corrigir</b> : "–"; })()}</td>
                <td className="n">{g.extras ? <b>{hm(g.extras)}</b> : "–"}</td><td className="n">{g.faltas ? hm(g.faltas) : "–"}</td>
              </tr>)}</tbody>
            </table>}
        </div>
      </>) : !dia ? <div className="empty" style={{ padding: 24 }}>Envie um Ponto Diário para começar.</div> : <>
        <div className="kpis" style={{ marginTop: 14 }}>
          <div className="card" style={{ padding: "12px 14px", flex: "1 1 160px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{doDia.filter(x => (x.batidas || []).length).length}</div><div className="hint">trabalharam em {br(dia)} ({diaSem(dia)})</div></div>
          <div className="card" style={{ padding: "12px 14px", flex: "1 1 160px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{hm(doDia.reduce((s, x) => s + (x.extras || 0), 0))}</div><div className="hint">extras no dia (total)</div></div>
          <div className="card" style={{ padding: "12px 14px", flex: "1 1 160px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{doDia.length}</div><div className="hint">funcionários no relatório</div></div>
          <div className="card" style={{ padding: "12px 14px", flex: "1 1 160px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{marc.length}</div><div className="hint">férias / atestado / afastados</div></div>
          {doDia.filter(faltaBatida).length > 0 && <div className="card" style={{ padding: "12px 14px", flex: "1 1 160px", borderLeft: "4px solid var(--danger)" }}><div style={{ fontSize: 22, fontWeight: 800, color: "var(--danger)" }}>{doDia.filter(faltaBatida).length}</div><div className="hint"><b>batida faltando</b> — corrigir manual</div></div>}
        </div>
        <div className="card" style={{ padding: 0, marginTop: 14, overflowX: "auto" }}>
          <div className="ma-cab"><b>✅ Trabalharam em {br(dia)} · {diaSem(dia)}</b><button className="btn primary sm" disabled={!trab.length} onClick={exportar}>⬇ Excel</button></div>
          {!trab.length ? <div className="empty" style={{ padding: 24 }}>Ninguém com batida neste dia{busca ? " com essa busca" : ""}.</div> :
            <table className="ma-tab" style={{ minWidth: 720 }}>
              <thead><tr><th>Nº folha</th><th>Nome</th><th>Batidas</th><th className="n">Extras</th><th className="n">Faltas</th></tr></thead>
              <tbody>{trab.map(x => <tr key={x.id} style={faltaBatida(x) ? { background: "rgba(214,60,60,.10)" } : undefined}>
                <td>{x.folha}</td><td><b>{x.nome}</b></td>
                <td>{(x.batidas || []).join(" → ")}{faltaBatida(x) && <div style={{ color: "var(--danger)", fontWeight: 800, fontSize: 12.5 }}>⚠ FALTOU BATIDA ({(x.batidas || []).length} marcações) — as horas ficam erradas, corrigir manualmente</div>}</td>
                <td className="n">{x.extras ? <b style={faltaBatida(x) ? { color: "var(--danger)" } : undefined}>{hm(x.extras)}{faltaBatida(x) ? "*" : ""}</b> : "–"}</td><td className="n">{x.faltas ? hm(x.faltas) : "–"}</td>
              </tr>)}</tbody>
            </table>}
        </div>
        <div className="card" style={{ padding: 12, marginTop: 14 }}>
          <b>Não trabalharam ({resto.length})</b>{marc.length > 0 && <span className="hint"> · com situação: {Object.entries(marc.reduce((m: any, x) => { m[x.marcador] = (m[x.marcador] || 0) + 1; return m; }, {})).map(([k, v]) => k + " " + v).join(" · ")}</span>}
          <button className="btn sm" style={{ marginLeft: 10 }} onClick={() => setVerTodos(!verTodos)}>{verTodos ? "Esconder" : "Ver lista"}</button>
          {verTodos && <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 4, fontSize: 13.5 }}>
            {resto.map(x => <div key={x.id}>{x.nome}{x.marcador ? <b> · {x.marcador}</b> : ""}</div>)}
          </div>}
        </div>
      </>}
    </section>
  );
}
