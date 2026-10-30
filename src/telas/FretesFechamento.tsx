// 🚚 Fechamento de fretes — romaneios do Tático na tela; a menina clica, abre igual ao papel e digita km e valor de cada entrega.
// No fim do mês sai o relatório para o financeiro (freteiro, frete, km, total, conta, descontos, total a pagar).
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { baixarXlsxFormatado } from "../lib/planilha";
import { podeFretes } from "../lib/fretes";
import { apagarDesconto, apagarRom, avisosRom, carregar, contaRom, criarDesconto, importar, lerCsvTatico, salvarFreteiro, salvarPagto, salvarRom, trazerParcelas,
  type Desconto, type Freteiro, type ItemRom, type RomTat } from "../lib/fretesTatico";

const moeda = (n: number) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => { const t = String(s ?? "").trim(); if (!t) return null; const n = Number(/,/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t); return isFinite(n) ? n : null; };
const fmtN = (n: number | null | undefined) => n == null ? "" : String(n).replace(".", ",");
const br = (s?: string | null) => s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "";
const MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const nomeMes = (m: string) => MESES[+m.slice(5, 7) - 1] + " " + m.slice(0, 4);
const somaMes = (m: string, d: number) => { const x = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + d, 1); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0"); };
const mesAtual = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };

export default function FretesFechamento() {
  const { R, toast } = useApp() as any;
  const uid = R.currentUserId;
  const [mes, setMes] = useState(mesAtual());
  const [aba, setAba] = useState<"rom" | "rel" | "fr">("rom");
  const [d, setD] = useState<{ fr: Freteiro[]; rom: RomTat[]; desc: Desconto[]; pagto: string } | null>(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState<number | null>(null);
  const [fFret, setFFret] = useState<number | "todos" | "sem">("todos");
  const [fSit, setFSit] = useState<"todos" | "pend" | "conf">("todos");
  const [busca, setBusca] = useState("");
  const rec = () => carregar(mes).then(x => { setD(x); setErro(""); }).catch(e => setErro(e.message));
  useEffect(() => { setD(null); rec(); }, [mes]);
  if (!podeFretes(uid)) return <section className="view active"><div className="empty">Fechamento de fretes está em teste, só no usuário do Bruno.</div></section>;

  const subir = async (files: FileList | null) => {
    if (!files?.length || !d) return;
    try {
      let novos = 0, atual = 0; const semF = new Set<string>(); const meses = new Set<string>();
      for (const f of Array.from(files)) {
        const lidos = lerCsvTatico(await f.arrayBuffer());
        lidos.forEach(l => meses.add(l.data.slice(0, 7)));
        const r = await importar(lidos, d.fr, uid); novos += r.novos; atual += r.atual; r.semFreteiro.forEach(s => semF.add(s));
      }
      toast?.(`${novos} romaneio(s) novo(s), ${atual} atualizado(s)` + (semF.size ? ` · sem freteiro cadastrado: ${Array.from(semF).join(", ")}` : ""));
      const ms = Array.from(meses).sort(); if (ms.length && !ms.includes(mes)) setMes(ms[ms.length - 1]); else rec();
    } catch (e: any) { toast?.(e.message); }
  };

  return (
    <section className="view active">
      <div className="view-head"><div><h2>🚚 Fechamento de fretes <span className="pill" style={{ background: "#7a3fb0", color: "#fff", fontSize: 12, verticalAlign: 3 }}>TESTE</span></h2>
        <p>Suba o relatório de fretes do Tático. Os romaneios ficam na tela: clique, abra igual ao papel e digite o km e o valor que o freteiro anotou. No fim, gere o relatório para o financeiro.</p></div></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div className="subnav" style={{ margin: 0 }}>
          <button className={aba === "rom" ? "on" : ""} onClick={() => setAba("rom")}>📄 Romaneios</button>
          <button className={aba === "rel" ? "on" : ""} onClick={() => setAba("rel")}>💰 Relatório para o financeiro</button>
          <button className={aba === "fr" ? "on" : ""} onClick={() => setAba("fr")}>👤 Freteiros e contas</button>
        </div>
        <button className="btn sm" onClick={() => setMes(somaMes(mes, -1))}>◀</button>
        <b style={{ minWidth: 150, textAlign: "center" }}>{nomeMes(mes)}</b>
        <button className="btn sm" onClick={() => setMes(somaMes(mes, 1))}>▶</button>
        <label className="btn primary" style={{ marginLeft: "auto", cursor: "pointer" }}>⬆ Importar relatório do Tático (.csv)
          <input type="file" accept=".csv,text/csv" multiple style={{ display: "none" }} onChange={e => { subir(e.target.files); e.target.value = ""; }} /></label>
      </div>
      {erro && <div className="empty" style={{ color: "var(--danger, #b00)" }}>{erro}</div>}
      {!d ? <div className="empty">Carregando…</div> : <>
        {aba === "rom" && <ListaRomaneios d={d} uid={uid} toast={toast} rec={rec} aberto={aberto} setAberto={setAberto} fFret={fFret} setFFret={setFFret} fSit={fSit} setFSit={setFSit} busca={busca} setBusca={setBusca} />}
        {aba === "rel" && <Relatorio d={d} mes={mes} toast={toast} rec={rec} />}
        {aba === "fr" && <Freteiros d={d} toast={toast} rec={rec} />}
      </>}
    </section>
  );
}

// ---------------- lista de romaneios ----------------
function ListaRomaneios({ d, uid, toast, rec, aberto, setAberto, fFret, setFFret, fSit, setFSit, busca, setBusca }: any) {
  const fr: Freteiro[] = d.fr; const rom: RomTat[] = d.rom;
  const nomeF = (id: number | null) => fr.find(f => f.id === id)?.apelido || "";
  const vis = rom.filter(r => (fFret === "todos" || (fFret === "sem" ? !r.freteiro_id : r.freteiro_id === fFret))
    && (fSit === "todos" || (fSit === "conf" ? r.conferido : !r.conferido))
    && (!busca || r.romaneio.includes(busca) || r.itens.some(i => i.cliente.toLowerCase().includes(busca.toLowerCase()) || i.venda.includes(busca))));
  const porF = useMemo(() => {
    const m = new Map<string, { id: number | "sem"; n: number; conf: number; total: number }>();
    for (const r of rom) { const k = r.freteiro_id ? String(r.freteiro_id) : "sem"; const x = m.get(k) || { id: r.freteiro_id || "sem", n: 0, conf: 0, total: 0 }; x.n++; if (r.conferido) x.conf++; x.total += contaRom(r).total; m.set(k, x); }
    return Array.from(m.values());
  }, [rom]);
  const conf = rom.filter(r => r.conferido).length;
  const r = rom.find(x => x.id === aberto);
  if (!rom.length) return <div className="empty">Nenhum romaneio neste mês. Clique em <b>Importar relatório do Tático</b> e escolha o .csv (pode ser um por freteiro ou todos juntos).</div>;
  const proximo = () => { const i = vis.findIndex(x => x.id === aberto); const p = vis.slice(i + 1).find(x => !x.conferido) || vis.find(x => !x.conferido && x.id !== aberto); setAberto(p ? p.id : null); };
  return <>
    <div className="card" style={{ padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}><b>{conf} de {rom.length} romaneios conferidos</b><span className="hint">faltam {rom.length - conf}</span></div>
      <div style={{ height: 8, background: "#e8ebf2", borderRadius: 6, marginTop: 6 }}><div style={{ height: 8, width: (100 * conf / rom.length) + "%", background: "var(--ok, #1f8a4c)", borderRadius: 6 }} /></div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        <button className={"chip" + (fFret === "todos" ? " on" : "")} onClick={() => setFFret("todos")}>Todos</button>
        {porF.map(x => <button key={String(x.id)} className={"chip" + (fFret === x.id ? " on" : "")} onClick={() => setFFret(x.id)}>
          {x.id === "sem" ? "⚠ Sem freteiro" : nomeF(x.id as number)} · {x.conf}/{x.n} · {moeda(x.total)}</button>)}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
        <div className="subnav" style={{ margin: 0 }}>
          <button className={fSit === "todos" ? "on" : ""} onClick={() => setFSit("todos")}>Todos</button>
          <button className={fSit === "pend" ? "on" : ""} onClick={() => setFSit("pend")}>A conferir</button>
          <button className={fSit === "conf" ? "on" : ""} onClick={() => setFSit("conf")}>Conferidos</button>
        </div>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nº do romaneio, venda ou cliente" style={{ flex: 1, minWidth: 200 }} />
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 8 }}>
      {vis.map(x => { const c = contaRom(x); const av = avisosRom(x, rom);
        const cor = x.conferido ? "#1f8a4c" : c.lancado ? "#c98a00" : "#8a94a6";
        return <button key={x.id} className="card" onClick={() => setAberto(x.id)} style={{ textAlign: "left", padding: "10px 12px", borderLeft: "4px solid " + cor, cursor: "pointer", background: aberto === x.id ? "#eef3ff" : undefined }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><b style={{ fontSize: 16 }}>{x.romaneio}</b><span className="hint">{br(x.data).slice(0, 5)}</span></div>
          <div className="hint">{nomeF(x.freteiro_id) || <span style={{ color: "#b00" }}>⚠ {x.transportadora}</span>} · {x.itens.length} entrega{x.itens.length === 1 ? "" : "s"}</div>
          <div style={{ marginTop: 4 }}>{x.conferido ? <b style={{ color: cor }}>✓ {moeda(c.total)}</b> : c.lancado ? <b style={{ color: cor }}>✏ {moeda(c.total)}</b> : <span className="hint">a lançar</span>}
            {c.km > 0 && <span className="hint"> · {fmtN(c.km)} km</span>}</div>
          {av.length > 0 && <div style={{ fontSize: 12, color: "#9a5b00", marginTop: 2 }}>⚠ {av.length} aviso{av.length > 1 ? "s" : ""}</div>}
        </button>; })}
    </div>
    {r && <Romaneio key={r.id} r={r} fr={fr} todos={rom} uid={uid} toast={toast} fechar={() => setAberto(null)} salvo={(ir: boolean) => { rec(); if (ir) proximo(); }} />}
  </>;
}

// ---------------- romaneio aberto (igual ao papel) ----------------
function Romaneio({ r, fr, todos, uid, toast, fechar, salvo }: { r: RomTat; fr: Freteiro[]; todos: RomTat[]; uid: string; toast: any; fechar: () => void; salvo: (ir: boolean) => void }) {
  const [modo, setModo] = useState(r.modo);
  const [itens, setItens] = useState<{ km: string; valor: string }[]>(r.itens.map(i => ({ km: fmtN(i.km), valor: fmtN(i.valor) })));
  const [km, setKm] = useState(fmtN(r.km)); const [ent, setEnt] = useState(fmtN(r.valor_entregas));
  const [vkm, setVkm] = useState(fmtN(r.valor_km)); const [papel, setPapel] = useState(fmtN(r.total_papel)); const [obs, setObs] = useState(r.obs);
  const [fid, setFid] = useState<number | null>(r.freteiro_id);
  const refs = useRef<(HTMLInputElement | null)[]>([]); const caixa = useRef<HTMLDivElement | null>(null);
  useEffect(() => { caixa.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, []);
  const atual: RomTat = { ...r, modo, freteiro_id: fid, km: num(km), valor_entregas: num(ent), valor_km: num(vkm) ?? 0, total_papel: num(papel),
    itens: r.itens.map((i, k) => ({ ...i, km: num(itens[k].km), valor: num(itens[k].valor) })) };
  const c = contaRom(atual); const av = avisosRom(r, todos);
  useEffect(() => { setTimeout(() => refs.current[modo === "linhas" ? 1 : 0]?.focus(), 50); }, [modo]);
  const enter = (e: React.KeyboardEvent, k: number) => { if (e.key === "Enter") { e.preventDefault(); const n = refs.current[k + 1]; if (n) { n.focus(); n.select(); } } };
  const gravar = async (conferido: boolean, ir = false) => {
    if (conferido && !fid) return toast?.("Escolha o freteiro deste romaneio.");
    if (conferido && modo === "linhas" && c.semValor > 0 && !confirm(`${c.semValor} entrega(s) sem valor. Marcar como conferido mesmo assim?`)) return;
    try {
      await salvarRom(r.id, { modo, freteiro_id: fid, km: atual.km, valor_entregas: atual.valor_entregas, valor_km: atual.valor_km, total_papel: atual.total_papel, obs, itens: atual.itens, conferido }, uid);
      toast?.(conferido ? "Romaneio " + r.romaneio + " conferido" : "Salvo"); salvo(ir);
    } catch (e: any) { toast?.(e.message); }
  };
  let idx = 0; const ref = () => { const k = idx++; return { ref: (el: HTMLInputElement | null) => { refs.current[k] = el; }, onKeyDown: (e: React.KeyboardEvent) => enter(e, k) }; };
  const inp = { width: 74, textAlign: "right" as const, padding: "4px 6px" };
  return (
    <div ref={caixa} className="card" style={{ marginTop: 14, padding: 16, borderTop: "4px solid var(--primary)", scrollMarginTop: 70 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
        <div><div style={{ fontSize: 20, fontWeight: 700 }}>Romaneio de Entregas - {r.romaneio}</div>
          <div>{br(r.data)} - {r.transportadora}</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={fid ?? ""} onChange={e => setFid(e.target.value ? +e.target.value : null)}><option value="">— freteiro —</option>{fr.map(f => <option key={f.id} value={f.id}>{f.apelido}</option>)}</select>
          <div className="subnav" style={{ margin: 0 }}>
            <button className={modo === "linhas" ? "on" : ""} onClick={() => setModo("linhas")}>Linha a linha</button>
            <button className={modo === "total" ? "on" : ""} onClick={() => setModo("total")}>Só o total</button>
          </div>
          <button className="btn sm" onClick={fechar}>✕</button>
        </div>
      </div>
      {av.length > 0 && <div style={{ margin: "8px 0", padding: "6px 10px", background: "#FFF4DC", borderRadius: 6, fontSize: 13 }}>⚠ {av.join(" · ")}</div>}
      <div style={{ overflowX: "auto", marginTop: 8 }}>
        <table className="ma-tab" style={{ width: "100%", fontSize: 13.5 }}>
          <thead><tr><th>Venda</th><th>Cliente</th><th>Bairro</th><th>Cidade</th><th>NF</th>{modo === "linhas" && <><th style={{ textAlign: "right" }}>Km</th><th style={{ textAlign: "right" }}>Valor (R$)</th></>}</tr></thead>
          <tbody>{r.itens.map((i: ItemRom, k: number) => <tr key={k} style={{ background: i.transf ? "#f3eefc" : i.assist ? "#eef6ff" : undefined }}>
            <td>{i.venda || (i.transf ? "Transf." : i.assist ? "Assist." : "")}</td><td>{i.cliente}{i.data && i.data !== r.data && <span className="hint"> ({br(i.data).slice(0, 5)})</span>}</td>
            <td>{i.bairro}</td><td>{i.cidade}</td><td>{i.nf}</td>
            {modo === "linhas" && <><td style={{ textAlign: "right" }}><input {...ref()} style={inp} inputMode="decimal" value={itens[k].km} onChange={e => setItens(v => v.map((x, j) => j === k ? { ...x, km: e.target.value } : x))} /></td>
              <td style={{ textAlign: "right" }}><input {...ref()} style={inp} inputMode="decimal" value={itens[k].valor} onChange={e => setItens(v => v.map((x, j) => j === k ? { ...x, valor: e.target.value } : x))} /></td></>}
          </tr>)}</tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
        {modo === "total" && <>
          <div className="field" style={{ margin: 0, width: 110 }}><label>Km total</label><input {...ref()} inputMode="decimal" value={km} onChange={e => setKm(e.target.value)} placeholder="83" /></div>
          <div className="field" style={{ margin: 0, width: 140 }}><label>Valor das entregas</label><input {...ref()} inputMode="decimal" value={ent} onChange={e => setEnt(e.target.value)} placeholder="706,00" /></div>
        </>}
        <div className="field" style={{ margin: 0, width: 90 }}><label>R$ por km</label><input inputMode="decimal" value={vkm} onChange={e => setVkm(e.target.value)} /></div>
        <div className="field" style={{ margin: 0, width: 150 }}><label>Total escrito no papel</label><input {...ref()} inputMode="decimal" value={papel} onChange={e => setPapel(e.target.value)} placeholder="opcional" /></div>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 160 }}><label>Obs.</label><input value={obs} onChange={e => setObs(e.target.value)} placeholder="ex.: desmonte autorizado pelo Tadeu" /></div>
      </div>
      <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--fundo2, #f3f5fa)", borderRadius: 8, fontSize: 16 }}>
        <b>TOTAL</b> Km {fmtN(c.km) || 0} = {moeda(c.vKm)} + Entregas {moeda(c.ent)} = <b style={{ fontSize: 19 }}>{moeda(c.total)}</b>
        {c.difPapel != null && (c.difPapel === 0 ? <span style={{ color: "#1f8a4c", marginLeft: 10 }}>✓ bate com o papel</span>
          : <span style={{ color: "#b00", marginLeft: 10 }}>✗ papel {moeda(atual.total_papel || 0)} — diferença {moeda(c.difPapel)}</span>)}
        {modo === "linhas" && c.semValor > 0 && <span className="hint" style={{ marginLeft: 10 }}>{c.semValor} sem valor</span>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button className="btn primary" onClick={() => gravar(true, true)}>✓ Conferido e próximo</button>
        <button className="btn" onClick={() => gravar(r.conferido)}>💾 Salvar</button>
        {r.conferido && <button className="btn" onClick={() => gravar(false)}>↩ Desmarcar conferido</button>}
        <button className="btn sm" style={{ marginLeft: "auto", color: "#b00" }} onClick={async () => { if (confirm("Tirar o romaneio " + r.romaneio + " da lista?")) { await apagarRom(r.id); toast?.("Removido"); fechar(); salvo(false); } }}>Remover</button>
      </div>
    </div>
  );
}

// ---------------- relatório para o financeiro ----------------
function Relatorio({ d, mes, toast, rec }: any) {
  const fr: Freteiro[] = d.fr; const rom: RomTat[] = d.rom; const desc: Desconto[] = d.desc;
  const [pagto, setPagto] = useState<string>(d.pagto || "");
  const [nd, setNd] = useState({ fid: "", descricao: "", parcela: "", valor: "" });
  const linhas = fr.filter(f => f.ativo || rom.some(r => r.freteiro_id === f.id)).map(f => {
    const rs = rom.filter(r => r.freteiro_id === f.id); const cs = rs.map(contaRom);
    const frete = cs.reduce((s, c) => s + c.ent, 0), km = cs.reduce((s, c) => s + c.vKm, 0);
    const ds = desc.filter(x => x.freteiro_id === f.id); const tDesc = ds.reduce((s, x) => s + x.valor, 0);
    return { f, n: rs.length, pend: rs.filter(r => !r.conferido).length, frete, km, total: frete + km, ds, tDesc, pagar: frete + km - tDesc };
  }).filter(l => l.n > 0 || l.ds.length);
  const T = (k: "frete" | "km" | "total" | "pagar") => linhas.reduce((s, l) => s + l[k], 0);
  const pend = rom.filter(r => !r.conferido).length; const semF = rom.filter(r => !r.freteiro_id).length;
  const conta = (f: Freteiro) => `${f.favorecido} ( ${f.agencia} / ${f.conta} )`;
  const cabConta = "CONTAS" + (pagto ? " - PG " + br(pagto) : "");
  const xlsx = () => baixarXlsxFormatado("FRETE_" + nomeMes(mes).replace(" ", "_") + ".xlsx", "FRETE " + nomeMes(mes),
    [{ titulo: "FRETEIRO", largura: 16 }, { titulo: "Frete (R$)", largura: 15, tipo: "moeda" }, { titulo: "KM (R$)", largura: 15, tipo: "moeda" }, { titulo: "valor total", largura: 15, tipo: "moeda" },
     { titulo: cabConta, largura: 48 }, { titulo: "parcela", largura: 9, alinhar: "center" }, { titulo: "descontos", largura: 12, tipo: "moeda" }, { titulo: "TOTAL PAGAMENTO", largura: 18, tipo: "moeda" }],
    [...linhas.map(l => [l.f.apelido, l.frete, l.km, l.total, conta(l.f), l.ds.map(x => x.parcela).filter(Boolean).join(" + "), l.tDesc || null, l.pagar]),
     ["TOTAL GERAL", T("frete"), T("km"), T("total"), "", "", linhas.reduce((s, l) => s + l.tDesc, 0) || null, T("pagar")]],
    [{ aba: "ROMANEIOS", cols: [{ titulo: "FRETEIRO", largura: 16 }, { titulo: "DATA", largura: 12, tipo: "data", alinhar: "center" }, { titulo: "ROMANEIO", largura: 12, alinhar: "center" }, { titulo: "ENTREGAS", largura: 10, alinhar: "center" },
      { titulo: "KM", largura: 8, alinhar: "center" }, { titulo: "KM (R$)", largura: 13, tipo: "moeda" }, { titulo: "ENTREGAS (R$)", largura: 15, tipo: "moeda" }, { titulo: "TOTAL", largura: 14, tipo: "moeda" }, { titulo: "CONFERIDO", largura: 11, alinhar: "center" }],
      linhas: rom.slice().sort((a, b) => (fr.find(f => f.id === a.freteiro_id)?.apelido || "").localeCompare(fr.find(f => f.id === b.freteiro_id)?.apelido || "") || String(a.data).localeCompare(String(b.data)))
        .map(r => { const c = contaRom(r); return [fr.find(f => f.id === r.freteiro_id)?.apelido || r.transportadora, r.data, r.romaneio, r.itens.length, c.km, c.vKm, c.ent, c.total, r.conferido ? "SIM" : "NÃO"]; }) }]);
  const imprimir = () => {
    const td = (s: string, a = "left", b = false) => `<td style="text-align:${a};${b ? "font-weight:bold;" : ""}">${s}</td>`;
    const html = `<html><head><title>FRETE ${nomeMes(mes)}</title><style>body{font-family:Arial;font-size:11px;margin:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 6px}th{background:#eee}h2{text-align:center}</style></head><body>
      <h2>FRETE ${nomeMes(mes)}</h2><table><tr><th>FRETEIRO</th><th>Frete (R$)</th><th>KM (R$)</th><th>valor total</th><th>${cabConta}</th><th>descontos</th><th>TOTAL PAGAMENTO</th></tr>
      ${linhas.map(l => `<tr>${td(l.f.apelido, "left", true)}${td(moeda(l.frete), "right")}${td(moeda(l.km), "right")}${td(moeda(l.total), "right")}${td(conta(l.f))}${td(l.ds.length ? l.ds.map(x => (x.parcela ? x.parcela + " " : "") + moeda(x.valor)).join(" + ") : "", "right")}${td(moeda(l.pagar), "right", true)}</tr>`).join("")}
      <tr>${td("Total geral", "left", true)}${td(moeda(T("frete")), "right", true)}${td(moeda(T("km")), "right", true)}${td(moeda(T("total")), "right", true)}<td></td><td></td>${td(moeda(T("pagar")), "right", true)}</tr></table></body></html>`;
    const w = window.open("", "_blank"); if (!w) return toast?.("Libere pop-up para imprimir"); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300);
  };
  const addDesc = async () => {
    const v = num(nd.valor); if (!nd.fid || !v) return toast?.("Escolha o freteiro e o valor do desconto");
    try { await criarDesconto({ mes, freteiro_id: +nd.fid, descricao: nd.descricao, parcela: nd.parcela, valor: v }); setNd({ fid: "", descricao: "", parcela: "", valor: "" }); rec(); } catch (e: any) { toast?.(e.message); }
  };
  return <>
    {(pend > 0 || semF > 0) && <div className="card" style={{ padding: "8px 12px", marginBottom: 10, background: "#FFF4DC" }}>⚠ {pend > 0 && <><b>{pend} romaneio(s) ainda não conferido(s)</b> — entram no relatório com o que já foi digitado. </>}{semF > 0 && <b>{semF} romaneio(s) sem freteiro.</b>}</div>}
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
      <div className="field" style={{ margin: 0 }}><label>Data do pagamento</label><input type="date" value={pagto} onChange={e => setPagto(e.target.value)} onBlur={() => salvarPagto(mes, pagto).catch((e: any) => toast?.(e.message))} /></div>
      <button className="btn primary" disabled={!linhas.length} onClick={xlsx}>⬇ Excel para o financeiro</button>
      <button className="btn" disabled={!linhas.length} onClick={imprimir}>🖨 Imprimir / PDF</button>
    </div>
    <div style={{ overflowX: "auto" }}>
      <table className="ma-tab" style={{ width: "100%", fontSize: 13.5 }}>
        <thead><tr><th colSpan={7} style={{ textAlign: "center", fontSize: 15 }}>FRETE {nomeMes(mes)}</th></tr>
          <tr><th>FRETEIRO</th><th style={{ textAlign: "right" }}>Frete (R$)</th><th style={{ textAlign: "right" }}>KM (R$)</th><th style={{ textAlign: "right" }}>valor total</th><th>{cabConta}</th><th style={{ textAlign: "right" }}>descontos</th><th style={{ textAlign: "right" }}>TOTAL PAGAMENTO</th></tr></thead>
        <tbody>{linhas.map(l => <tr key={l.f.id}>
          <td><b>{l.f.apelido}</b>{l.pend > 0 && <div className="hint">{l.pend} a conferir</div>}</td>
          <td style={{ textAlign: "right" }}>{moeda(l.frete)}</td><td style={{ textAlign: "right" }}>{moeda(l.km)}</td><td style={{ textAlign: "right" }}>{moeda(l.total)}</td>
          <td>{conta(l.f)}</td>
          <td style={{ textAlign: "right" }}>{l.ds.map(x => <div key={x.id}>{x.parcela && <span className="hint">{x.parcela} </span>}{moeda(x.valor)} <button className="btn sm" style={{ padding: "0 5px" }} title={x.descricao} onClick={async () => { if (confirm("Apagar este desconto?")) { await apagarDesconto(x.id); rec(); } }}>✕</button></div>)}</td>
          <td style={{ textAlign: "right" }}><b>{moeda(l.pagar)}</b></td></tr>)}
          <tr style={{ fontWeight: 700 }}><td>Total geral</td><td style={{ textAlign: "right" }}>{moeda(T("frete"))}</td><td style={{ textAlign: "right" }}>{moeda(T("km"))}</td><td style={{ textAlign: "right" }}>{moeda(T("total"))}</td><td></td><td></td><td style={{ textAlign: "right" }}>{moeda(T("pagar"))}</td></tr>
        </tbody>
      </table>
    </div>
    <div className="card" style={{ padding: 12, marginTop: 14 }}>
      <b>➖ Descontos do mês</b> <span className="hint">(parcela no formato 2/5 — no mês seguinte use "Trazer parcelas" e ela vira 3/5 sozinha)</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
        <div className="field" style={{ margin: 0 }}><label>Freteiro</label><select value={nd.fid} onChange={e => setNd({ ...nd, fid: e.target.value })}><option value="">—</option>{fr.map(f => <option key={f.id} value={f.id}>{f.apelido}</option>)}</select></div>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 150 }}><label>Descrição</label><input value={nd.descricao} onChange={e => setNd({ ...nd, descricao: e.target.value })} placeholder="ex.: avaria / adiantamento" /></div>
        <div className="field" style={{ margin: 0, width: 80 }}><label>Parcela</label><input value={nd.parcela} onChange={e => setNd({ ...nd, parcela: e.target.value })} placeholder="2/5" /></div>
        <div className="field" style={{ margin: 0, width: 110 }}><label>Valor</label><input inputMode="decimal" value={nd.valor} onChange={e => setNd({ ...nd, valor: e.target.value })} placeholder="106,25" /></div>
        <button className="btn primary" onClick={addDesc}>+ Desconto</button>
        <button className="btn" onClick={async () => { const n = await trazerParcelas(somaMes(mes, -1), mes); toast?.(n ? n + " parcela(s) trazida(s) do mês anterior" : "Nenhuma parcela para trazer"); rec(); }}>↪ Trazer parcelas de {nomeMes(somaMes(mes, -1)).toLowerCase()}</button>
      </div>
    </div>
  </>;
}

// ---------------- freteiros e contas ----------------
function Freteiros({ d, toast, rec }: any) {
  const [ed, setEd] = useState<Partial<Freteiro> | null>(null);
  const campos: [keyof Freteiro, string, number][] = [["apelido", "Nome no relatório", 130], ["nome_tatico", "Nome no Tático", 200], ["cod_transp", "Cód. no Tático", 90], ["favorecido", "Favorecido da conta", 220], ["agencia", "Agência", 70], ["conta", "Conta", 120], ["valor_km", "R$ por km", 70]];
  const gravar = async () => { if (!ed?.apelido) return toast?.("Informe o nome"); try { await salvarFreteiro({ ...ed, apelido: String(ed.apelido).toUpperCase(), valor_km: Number(String(ed.valor_km ?? 3).replace(",", ".")) || 0 }); setEd(null); rec(); toast?.("Salvo"); } catch (e: any) { toast?.(e.message); } };
  return <>
    <div className="hint" style={{ marginBottom: 8 }}>O "Nome no Tático" e o "Cód. no Tático" ligam o relatório importado ao freteiro. A conta sai no relatório do financeiro.</div>
    <div style={{ overflowX: "auto" }}><table className="ma-tab" style={{ width: "100%", fontSize: 13.5 }}>
      <thead><tr>{campos.map(c => <th key={c[0]}>{c[1]}</th>)}<th>Ativo</th><th></th></tr></thead>
      <tbody>{d.fr.map((f: Freteiro) => ed?.id === f.id ? null : <tr key={f.id} style={{ opacity: f.ativo ? 1 : .5 }}>{campos.map(c => <td key={c[0]}>{c[0] === "valor_km" ? moeda(f.valor_km) : String(f[c[0]] ?? "")}</td>)}<td>{f.ativo ? "sim" : "não"}</td>
        <td><button className="btn sm" onClick={() => setEd({ ...f })}>Editar</button></td></tr>)}</tbody>
    </table></div>
    {ed ? <div className="card" style={{ padding: 12, marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      {campos.map(c => <div key={c[0]} className="field" style={{ margin: 0, width: c[2] }}><label>{c[1]}</label><input value={String(ed[c[0]] ?? "")} onChange={e => setEd({ ...ed, [c[0]]: e.target.value })} /></div>)}
      <label style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={ed.ativo !== false} onChange={e => setEd({ ...ed, ativo: e.target.checked })} /> ativo</label>
      <button className="btn primary" onClick={gravar}>Salvar</button><button className="btn" onClick={() => setEd(null)}>Cancelar</button>
    </div> : <button className="btn" style={{ marginTop: 10 }} onClick={() => setEd({ valor_km: 3, ativo: true, ordem: 99 })}>+ Novo freteiro</button>}
  </>;
}
