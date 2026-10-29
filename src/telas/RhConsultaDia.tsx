// RH · Consulta do dia — envia o relatório "Ponto Diário" do Secullum (todo mundo num dia) e mostra quem trabalhou
// naquele dia (ex.: domingo), com batidas e extras. Tudo fica registrado para consultar depois. Só Bruno e Patrícia.
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { baixarXlsx } from "../lib/planilha";
import { guardarDiario, hm, listarDiasGeral, parseDiario, pdfParaItens, podeRh, type DiaGeral } from "../lib/ponto";

const br = (s: string) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—");
const DOW = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const diaSem = (s: string) => DOW[new Date(s + "T12:00:00").getDay()];

export default function RhConsultaDia() {
  const { R, toast } = useApp() as any;
  const [tudo, setTudo] = useState<DiaGeral[] | null>(null);
  const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState("");
  const [dia, setDia] = useState(""); const [busca, setBusca] = useState(""); const [verTodos, setVerTodos] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const rec = () => listarDiasGeral().then(d => { setTudo(d); if (d.length && !dia) setDia(d[0].data); }).catch(e => setErro(e.message));
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
  const exportar = () => baixarXlsx("trabalharam_" + dia + ".xlsx",
    ["Nº folha", "Nome", "Batidas", "Extras", "Faltas", "Dia"],
    trab.map(x => [x.folha, x.nome, (x.batidas || []).join(" "), x.extras ? hm(x.extras) : "", x.faltas ? hm(x.faltas) : "", br(dia) + " (" + diaSem(dia) + ")"]),
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
          <div className="field"><label>Dia</label><select value={dia} onChange={e => setDia(e.target.value)}>{!datas.length && <option value="">—</option>}{datas.map(d => <option key={d} value={d}>{br(d)} · {diaSem(d)}</option>)}</select></div>
          <div className="field" style={{ flex: "1 1 180px" }}><label>Buscar nome</label><input value={busca} onChange={e => setBusca(e.target.value)} /></div>
        </div>
      </div>
      {!dia ? <div className="empty" style={{ padding: 24 }}>Envie um Ponto Diário para começar.</div> : <>
        <div className="kpis" style={{ marginTop: 14 }}>
          <div className="card" style={{ padding: "12px 14px", flex: "1 1 160px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{doDia.filter(x => (x.batidas || []).length).length}</div><div className="hint">trabalharam em {br(dia)} ({diaSem(dia)})</div></div>
          <div className="card" style={{ padding: "12px 14px", flex: "1 1 160px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{hm(doDia.reduce((s, x) => s + (x.extras || 0), 0))}</div><div className="hint">extras no dia (total)</div></div>
          <div className="card" style={{ padding: "12px 14px", flex: "1 1 160px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{doDia.length}</div><div className="hint">funcionários no relatório</div></div>
          <div className="card" style={{ padding: "12px 14px", flex: "1 1 160px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{marc.length}</div><div className="hint">férias / atestado / afastados</div></div>
        </div>
        <div className="card" style={{ padding: 0, marginTop: 14, overflowX: "auto" }}>
          <div className="ma-cab"><b>✅ Trabalharam em {br(dia)} · {diaSem(dia)}</b><button className="btn primary sm" disabled={!trab.length} onClick={exportar}>⬇ Excel</button></div>
          {!trab.length ? <div className="empty" style={{ padding: 24 }}>Ninguém com batida neste dia{busca ? " com essa busca" : ""}.</div> :
            <table className="ma-tab" style={{ minWidth: 720 }}>
              <thead><tr><th>Nº folha</th><th>Nome</th><th>Batidas</th><th className="n">Extras</th><th className="n">Faltas</th></tr></thead>
              <tbody>{trab.map(x => <tr key={x.id}>
                <td>{x.folha}</td><td><b>{x.nome}</b></td><td>{(x.batidas || []).join(" → ")}</td>
                <td className="n">{x.extras ? <b>{hm(x.extras)}</b> : "–"}</td><td className="n">{x.faltas ? hm(x.faltas) : "–"}</td>
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
