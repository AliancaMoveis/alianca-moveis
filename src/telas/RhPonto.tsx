// RH · Folha ponto — sobe os cartões ponto (PDF do Secullum), separa por funcionário e resume:
// dias trabalhados, domingos e feriados trabalhados, horas extras 50%/100%, faltas. Só Bruno e Patrícia (RH).
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { baixarXlsx } from "../lib/planilha";
import { apagarCartao, guardarCartao, hm, listarCartoes, parseCartao, pdfParaItens, podeRh, type CartaoDb, type DiaPonto } from "../lib/ponto";

const br = (s: string) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "");
const dow = (s: string) => new Date(s + "T12:00:00").getDay();
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

type Dia = DiaPonto & { cartao_id: number };

export default function RhPonto() {
  const { R, toast } = useApp() as any;
  const [dados, setDados] = useState<{ cartoes: CartaoDb[]; dias: Dia[] } | null>(null);
  const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState("");
  const [avisos, setAvisos] = useState<string[]>([]);
  const [de, setDe] = useState(""); const [ate, setAte] = useState("");
  const [aberto, setAberto] = useState("");
  const inp = useRef<HTMLInputElement>(null);
  const rec = () => listarCartoes().then(d => {
    setDados(d);
    if (!de && d.cartoes.length) { setDe(d.cartoes.map(c => c.periodo_de).sort()[0]); setAte(d.cartoes.map(c => c.periodo_ate).sort().pop() || ""); }
  }).catch(e => setErro(e.message));
  useEffect(() => { rec(); }, []);
  if (!podeRh(R.currentUserId)) return <section className="view active"><div className="empty">Só o Bruno e a Patrícia (RH) veem esta tela.</div></section>;

  const subir = async (fs: FileList) => {
    const files = Array.from(fs); const probs: string[] = []; let novos = 0, atualizados = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setEnviando("Lendo " + (i + 1) + " de " + files.length + " — " + f.name + "…");
      try {
        const c = parseCartao(await pdfParaItens(await f.arrayBuffer()), f.name);
        const s50 = c.dias.reduce((s, d) => s + d.ex50, 0), s100 = c.dias.reduce((s, d) => s + d.ex100, 0), sf = c.dias.reduce((s, d) => s + d.faltas, 0);
        if (s50 !== c.tot_ex50 || s100 !== c.tot_ex100 || sf !== c.tot_faltas)
          probs.push("⚠ " + c.nome + ": a soma lida não bateu com o total impresso no cartão (extra 50% " + hm(s50) + "×" + hm(c.tot_ex50) + ", 100% " + hm(s100) + "×" + hm(c.tot_ex100) + ", faltas " + hm(sf) + "×" + hm(c.tot_faltas) + ") — confira este PDF.");
        const r = await guardarCartao(c, f.name, R.currentUserId);
        if (r === "novo") novos++; else atualizados++;
      } catch (e: any) { probs.push("✕ " + f.name + ": " + (e.message || "não foi possível ler")); }
    }
    setEnviando(""); setAvisos(probs);
    toast(novos + " cartão(ões) novo(s) · " + atualizados + " atualizado(s)" + (probs.length ? " · " + probs.length + " aviso(s)" : ""));
    await rec();
  };

  const h = hoje();
  const periodo = (a: string, b: string) => { setDe(a); setAte(b); };
  const mesPassado = () => { const d = new Date(h.slice(0, 8) + "01T12:00:00Z"); d.setUTCDate(0); const fim = d.toISOString().slice(0, 10); periodo(fim.slice(0, 8) + "01", fim); };

  const linhas = useMemo(() => {
    if (!dados) return [];
    const porCpf = new Map<string, { nome: string; departamento: string; funcao: string; cartoes: CartaoDb[]; dias: Dia[]; confere: boolean }>();
    for (const c of dados.cartoes) {
      const g = porCpf.get(c.cpf) || { nome: c.nome, departamento: c.departamento, funcao: c.funcao, cartoes: [], dias: [], confere: true };
      g.cartoes.push(c); porCpf.set(c.cpf, g);
      const ds = dados.dias.filter(d => d.cartao_id === c.id);
      g.dias.push(...ds);
      const s50 = ds.reduce((s, d) => s + d.ex50, 0), s100 = ds.reduce((s, d) => s + d.ex100, 0), sf = ds.reduce((s, d) => s + d.faltas, 0);
      if (s50 !== c.tot_ex50 || s100 !== c.tot_ex100 || sf !== c.tot_faltas) g.confere = false;
    }
    return Array.from(porCpf.entries()).map(([cpf, g]) => {
      const ds = g.dias.filter(d => (!de || d.data >= de) && (!ate || d.data <= ate)).sort((a, b) => a.data.localeCompare(b.data));
      const pres = ds.filter(d => d.batidas.length);
      const doms = pres.filter(d => dow(d.data) === 0), fers = pres.filter(d => d.feriado);
      const faltasDia = ds.filter(d => !d.batidas.length && d.faltas > 0 && !d.folga);
      return { cpf, ...g, ds, pres, doms, fers, faltasDia,
        trab: ds.reduce((s, d) => s + d.trabalhado, 0), e50: ds.reduce((s, d) => s + d.ex50, 0), e100: ds.reduce((s, d) => s + d.ex100, 0), falt: ds.reduce((s, d) => s + d.faltas, 0) };
    }).filter(x => x.ds.length).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [dados, de, ate]);

  const exportar = () => {
    const cab = ["Funcionário", "CPF", "Departamento", "Função", "Dias com presença", "Domingos trabalhados", "Datas dos domingos", "Feriados trabalhados", "Datas dos feriados", "Horas trabalhadas", "Extra 50%", "Extra 100%", "Faltas (horas)", "Faltas (dias cheios)", "Datas das faltas"];
    const ls = linhas.map(x => [x.nome, x.cpf, x.departamento, x.funcao, x.pres.length, x.doms.length, x.doms.map(d => br(d.data)).join(", "), x.fers.length, x.fers.map(d => br(d.data)).join(", "), hm(x.trab), hm(x.e50), hm(x.e100), hm(x.falt), x.faltasDia.length, x.faltasDia.map(d => br(d.data)).join(", ")]);
    baixarXlsx("folha_ponto_" + de + "_a_" + ate + ".xlsx", cab, ls, "Folha ponto");
  };

  const tot = (f: (x: any) => number) => linhas.reduce((s, x) => s + f(x), 0);
  return (
    <section className="view active">
      <div className="view-head"><div><h2>🕐 RH · Folha ponto</h2><p>Envie os cartões ponto em PDF (pode selecionar todos de uma vez — o sistema separa por funcionário pelo nome e CPF do cabeçalho). Reenviar o mesmo período não duplica, só atualiza.</p></div></div>
      <div className="card ma-topo">
        <div className="ma-envio">
          <input ref={inp} type="file" accept=".pdf" multiple style={{ display: "none" }} onChange={e => { if (e.target.files?.length) subir(e.target.files).finally(() => { if (inp.current) inp.current.value = ""; }); }} />
          <button className="btn primary" disabled={!!enviando} onClick={() => inp.current?.click()}>{enviando || "📤 Enviar cartões ponto (PDF — pode vários)"}</button>
          <span className="hint">{dados ? dados.cartoes.length + " cartão(ões) guardado(s)" : erro || "Carregando…"}</span>
        </div>
        <div className="ma-filtros">
          <div className="field"><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
          <div className="field"><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
          <div className="chips" style={{ margin: 0 }}>
            <button className="chip" onClick={() => { if (dados?.cartoes.length) periodo(dados.cartoes.map(c => c.periodo_de).sort()[0], dados.cartoes.map(c => c.periodo_ate).sort().pop() || "") }}>Período dos cartões</button>
            <button className="chip" onClick={() => periodo(h.slice(0, 8) + "01", h)}>Este mês</button>
            <button className="chip" onClick={mesPassado}>Mês passado</button>
          </div>
        </div>
      </div>
      {avisos.length > 0 && <div className="card" style={{ padding: 12, marginTop: 12, borderLeft: "4px solid var(--warn)" }}>{avisos.map((a, i) => <div key={i} style={{ fontSize: 13.5, margin: "2px 0" }}>{a}</div>)}</div>}

      <div className="kpis" style={{ marginTop: 14 }}>
        <div className="card" style={{ padding: "12px 14px", flex: "1 1 150px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{linhas.length}</div><div className="hint">funcionários no período</div></div>
        <div className="card" style={{ padding: "12px 14px", flex: "1 1 150px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{hm(tot(x => x.e50))}</div><div className="hint">extra 50% (total)</div></div>
        <div className="card" style={{ padding: "12px 14px", flex: "1 1 150px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{hm(tot(x => x.e100))}</div><div className="hint">extra 100% (total)</div></div>
        <div className="card" style={{ padding: "12px 14px", flex: "1 1 150px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{tot(x => x.doms.length)}</div><div className="hint">domingos trabalhados</div></div>
        <div className="card" style={{ padding: "12px 14px", flex: "1 1 150px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{hm(tot(x => x.falt))}</div><div className="hint">faltas (horas)</div></div>
      </div>

      <div className="card" style={{ padding: 0, marginTop: 14, overflowX: "auto" }}>
        <div className="ma-cab"><b>Resumo por funcionário · {br(de)} a {br(ate)}</b><button className="btn primary sm" disabled={!linhas.length} onClick={exportar}>⬇ Excel para a folha</button></div>
        {!linhas.length ? <div className="empty" style={{ padding: 24 }}>{dados && dados.cartoes.length ? "Nada neste período." : "Envie os cartões ponto para começar."}</div> :
          <table className="ma-tab" style={{ minWidth: 1050 }}>
            <thead><tr><th>Funcionário</th><th className="n">Dias c/ presença</th><th className="n">Domingos trab.</th><th className="n">Feriados trab.</th><th className="n">Horas trab.</th><th className="n">Extra 50%</th><th className="n">Extra 100%</th><th className="n">Faltas</th><th className="n">Faltas dia cheio</th><th>Leitura</th></tr></thead>
            <tbody>{linhas.map(x => <LinhaFunc key={x.cpf} x={x} aberto={aberto === x.cpf} abrir={() => setAberto(aberto === x.cpf ? "" : x.cpf)} rec={rec} toast={toast} />)}</tbody>
            <tfoot><tr><td>Total</td><td className="n">{tot(x => x.pres.length)}</td><td className="n">{tot(x => x.doms.length)}</td><td className="n">{tot(x => x.fers.length)}</td><td className="n">{hm(tot(x => x.trab))}</td><td className="n">{hm(tot(x => x.e50))}</td><td className="n">{hm(tot(x => x.e100))}</td><td className="n">{hm(tot(x => x.falt))}</td><td className="n">{tot(x => x.faltasDia.length)}</td><td></td></tr></tfoot>
          </table>}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>Os valores de extra 50%, extra 100% e faltas são os calculados pelo relógio ponto (Secullum); o sistema soma, separa domingos e feriados e confere com o total impresso no cartão. Toque num funcionário para ver o mês dia a dia.</p>
    </section>
  );
}

function LinhaFunc({ x, aberto, abrir, rec, toast }: { x: any; aberto: boolean; abrir: () => void; rec: () => any; toast: (m: string) => void }) {
  const apagar = async (e: any, c: CartaoDb) => {
    e.stopPropagation();
    if (!confirm("Apagar o cartão de " + c.nome + " (" + br(c.periodo_de) + " a " + br(c.periodo_ate) + ")?")) return;
    try { await apagarCartao(c.id); await rec(); toast("Cartão apagado"); } catch (er: any) { toast(er.message); }
  };
  return <>
    <tr className={"ma-lin" + (aberto ? " on" : "")} onClick={abrir}>
      <td><b>{x.nome}</b><div className="hint">{[x.departamento, x.funcao].filter(Boolean).join(" · ")}</div></td>
      <td className="n"><b>{x.pres.length}</b></td>
      <td className="n">{x.doms.length ? <b style={{ color: "var(--warn)" }}>{x.doms.length}</b> : 0}</td>
      <td className="n">{x.fers.length ? <b>{x.fers.length}</b> : 0}</td>
      <td className="n">{hm(x.trab)}</td>
      <td className="n"><b>{hm(x.e50)}</b></td>
      <td className="n"><b>{hm(x.e100)}</b></td>
      <td className="n">{x.falt ? hm(x.falt) : "–"}</td>
      <td className="n">{x.faltasDia.length || "–"}</td>
      <td>{x.confere ? <span style={{ color: "var(--st-concluida)", fontWeight: 700 }}>✓ confere</span> : <span style={{ color: "var(--danger)", fontWeight: 700 }}>⚠ divergiu do cartão</span>}</td>
    </tr>
    {aberto && <tr><td colSpan={10} style={{ background: "var(--fundo2, #f7f8fb)", padding: 12 }}>
      {x.doms.length > 0 && <p style={{ margin: "0 0 6px" }}><b>Domingos trabalhados:</b> {x.doms.map((d: Dia) => br(d.data) + " (" + hm(d.trabalhado) + ")").join(" · ")}</p>}
      {x.fers.length > 0 && <p style={{ margin: "0 0 6px" }}><b>Feriados trabalhados:</b> {x.fers.map((d: Dia) => br(d.data) + " (extra 100% " + hm(d.ex100) + ")").join(" · ")}</p>}
      {x.faltasDia.length > 0 && <p style={{ margin: "0 0 10px" }}><b>Faltas de dia cheio:</b> {x.faltasDia.map((d: Dia) => br(d.data)).join(" · ")}</p>}
      <div style={{ overflowX: "auto" }}>
        <table className="ma-tab" style={{ minWidth: 760 }}>
          <thead><tr><th>Dia</th><th>Batidas</th><th className="n">Trabalhado</th><th className="n">Extra 50%</th><th className="n">Extra 100%</th><th className="n">Faltas</th></tr></thead>
          <tbody>{x.ds.map((d: Dia) => {
            const dom = dow(d.data) === 0;
            return <tr key={d.data} style={{ background: dom ? "rgba(214,150,40,.10)" : d.feriado ? "rgba(31,90,214,.07)" : undefined }}>
              <td><b>{br(d.data)}</b> · {dom ? "Dom" : d.rotulo}{d.feriado ? " 🎌 feriado" : ""}{d.folga ? " · folga" : ""}</td>
              <td>{d.batidas.join(" → ") || <span className="hint">—</span>}</td>
              <td className="n">{d.trabalhado ? hm(d.trabalhado) : "–"}</td>
              <td className="n">{d.ex50 ? <b>{hm(d.ex50)}</b> : "–"}</td>
              <td className="n">{d.ex100 ? <b>{hm(d.ex100)}</b> : "–"}</td>
              <td className="n">{d.faltas ? <span style={{ color: "var(--danger)", fontWeight: 700 }}>{hm(d.faltas)}</span> : "–"}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <p className="hint" style={{ margin: "8px 0 0" }}>Cartões deste funcionário: {x.cartoes.map((c: CartaoDb) => <span key={c.id} style={{ marginRight: 10 }}>{br(c.periodo_de)} a {br(c.periodo_ate)} ({c.arquivo || "PDF"}) <button className="btn sm" onClick={e => apagar(e, c)}>🗑</button></span>)}</p>
    </td></tr>}
  </>;
}
