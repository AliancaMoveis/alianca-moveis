// 🚚 Fechamento de fretes — romaneios do Tático na tela; a menina clica, abre igual ao papel e digita km e valor de cada entrega.
// No fim do mês sai o relatório para o financeiro (freteiro, frete, km, total, conta, descontos, total a pagar).
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { Modal } from "../comp/Modal";
import { sb } from "../lib/supabase";
import { MOCK } from "../lib/chat";
import { quinzenaDe, quinzenaAntes } from "./MontagemPagamento";
import { baixarXlsxFormatado } from "../lib/planilha";
import { podeFretes } from "../lib/fretes";
import { rotuloTipo, carregarAssist, criarManual, desfazerEnvioAssist, ehAssist, ehManual, enviarAssist, mapsEntrega, numRom, TIPOS_MANUAL } from "../lib/fretesTatico";
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
  const [aba, setAba] = useState<"rom" | "rel" | "assist" | "fr">("rom");
  const [d, setD] = useState<{ fr: Freteiro[]; rom: RomTat[]; desc: Desconto[]; pagto: string } | null>(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState<number | null>(null);
  const [fSit, setFSit] = useState<"todos" | "pend" | "conf">("todos");
  const [busca, setBusca] = useState("");
  const rec = () => carregar(mes).then(x => { setD(x); setErro(""); }).catch(e => setErro(e.message));
  useEffect(() => { setD(null); rec(); }, [mes]);
  if (!podeFretes(uid) && !R.temAcesso?.("fretes")) return <section className="view active"><div className="empty">Fechamento de fretes está em teste, só no usuário do Bruno.</div></section>;

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
          <button className={aba === "assist" ? "on" : ""} onClick={() => setAba("assist")}>🛠 Frete pago na montagem</button>
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
        {aba === "rom" && <ListaRomaneios irAssist={() => setAba("assist")} mes={mes} d={d} uid={uid} toast={toast} rec={rec} aberto={aberto} setAberto={setAberto} fSit={fSit} setFSit={setFSit} busca={busca} setBusca={setBusca} patch={(id: number, p: Partial<RomTat>) => setD(x => x && ({ ...x, rom: x.rom.map(r => r.id === id ? { ...r, ...p } : r) }))} />}
        {aba === "rel" && <Relatorio d={d} mes={mes} toast={toast} rec={rec} />}
        {aba === "assist" && <PagAssist fr={d.fr} uid={uid} toast={toast} />}
        {aba === "fr" && <Freteiros d={d} toast={toast} rec={rec} />}
      </>}
    </section>
  );
}

// ---------------- lista de romaneios: um bloco por entregador, todos os romaneios dele na mesma tela ----------------
function ListaRomaneios({ mes, d, uid, toast, rec, aberto, setAberto, fSit, setFSit, busca, setBusca, patch, irAssist }: any) {
  const { setModal } = useApp() as any;
  const fr: Freteiro[] = d.fr; const rom: RomTat[] = d.rom;
  const [abertos, setAbertos] = useState<Set<string>>(new Set()); const [novoM, setNovoM] = useState<string | null>(null);
  const [fQuem, setFQuem] = useState<"todos" | "entrega" | "montagem">("todos");
  const filtra = (r: RomTat) => (fSit === "todos" || (fSit === "conf" ? r.conferido : !r.conferido))
    && (!busca || r.romaneio.includes(busca) || r.itens.some(i => i.cliente.toLowerCase().includes(busca.toLowerCase()) || i.venda.includes(busca)));
  const grupos = useMemo(() => {
    const m = new Map<string, { k: string; nome: string; ordem: number; rs: RomTat[]; assist: boolean; rot: string }>();
    for (const r of rom) {
      const f = fr.find(x => x.id === r.freteiro_id); const k = f ? String(f.id) : "sem:" + r.transportadora;
      const g = m.get(k) || { k, nome: f ? f.apelido : "⚠ " + r.transportadora + " (sem cadastro)", ordem: f ? f.ordem : 999, rs: [], assist: ehAssist(f), rot: rotuloTipo(f) }; g.rs.push(r); m.set(k, g);
    }
    for (const g of m.values()) g.rs.sort((a, b) => String(a.data).localeCompare(String(b.data)) || a.romaneio.localeCompare(b.romaneio));
    return Array.from(m.values()).sort((a, b) => Number(a.assist) - Number(b.assist) || a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [rom, fr]);
  const conf = rom.filter(r => r.conferido).length;
  if (!rom.length) return <><div style={{ marginBottom: 10 }}>{novoM === "topo" ? <FormManual fr={fr} mes={mes} uid={uid} toast={toast} fechar={() => setNovoM(null)} feito={rec} /> : <button className="btn sm" onClick={() => setNovoM("topo")}>➕ Romaneio manual</button>}</div><div className="empty">Nenhum romaneio neste mês. Clique em <b>Importar relatório do Tático</b> e escolha o .csv (pode ser um por entregador ou o geral, com todos).</div></>;
  const alterna = (k: string) => setAbertos(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  return <>
    <div className="card" style={{ padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}><b>{conf} de {rom.length} romaneios conferidos · {grupos.length} entregadores</b>{rom.some(r => r.mes < mes) && <span style={{ color: "var(--tn-blue-i)" }}>📥 {rom.filter(r => r.mes < mes).length} de meses anteriores ainda a conferir (ao conferir, entram no fechamento de {nomeMes(mes).toLowerCase()})</span>}<span className="hint">faltam {rom.length - conf}</span></div>
      <div style={{ height: 8, background: "var(--tn-grey)", borderRadius: 6, marginTop: 6 }}><div style={{ height: 8, width: (100 * conf / rom.length) + "%", background: "var(--ok, #1f8a4c)", borderRadius: 6 }} /></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
        <div className="subnav" style={{ margin: 0 }}>
          <button className={fSit === "todos" ? "on" : ""} onClick={() => setFSit("todos")}>Todos</button>
          <button className={fSit === "pend" ? "on" : ""} onClick={() => setFSit("pend")}>A conferir</button>
          <button className={fSit === "conf" ? "on" : ""} onClick={() => setFSit("conf")}>Conferidos</button>
        </div>
        <div className="subnav" style={{ margin: 0 }}>
          <button className={fQuem === "todos" ? "on" : ""} onClick={() => setFQuem("todos")}>Todos os freteiros</button>
          <button className={fQuem === "entrega" ? "on" : ""} onClick={() => setFQuem("entrega")}>🚚 Entregadores (financeiro)</button>
          <button className={fQuem === "montagem" ? "on" : ""} onClick={() => setFQuem("montagem")}>🛠🔧 Montadores e assistência</button>
        </div>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nº do romaneio, venda ou cliente" style={{ flex: 1, minWidth: 200 }} />
        <button className="btn sm" onClick={() => setAbertos(new Set(grupos.map(g => g.k)))}>Abrir todos</button>
        <button className="btn sm" onClick={() => setAbertos(new Set())}>Fechar todos</button>
      </div>
      <div style={{ marginTop: 8 }}>{novoM === "topo" ? <FormManual fr={fr} mes={mes} uid={uid} toast={toast} fechar={() => setNovoM(null)} feito={rec} />
        : <button className="btn sm" onClick={() => setNovoM("topo")}>➕ Romaneio manual</button>}</div>
      <div className="hint" style={{ marginTop: 6 }}>Digite direto na linha: <b>Km</b> e <b>valor das entregas</b> do romaneio (Enter vai para o próximo campo). Para lançar cliente por cliente, clique em <b>▸ clientes</b>.</div>
    </div>
    {grupos.filter(g => fQuem === "todos" || (fQuem === "montagem" ? g.assist : !g.assist)).map(g => {
      const rs = g.rs.filter(filtra); if (!rs.length && (busca || fSit !== "todos")) return null;
      const cs = g.rs.map(contaRom); const tot = cs.reduce((s, c) => s + c.total, 0), km = cs.reduce((s, c) => s + c.km, 0);
      const nConf = g.rs.filter(x => x.conferido).length; const ab = abertos.has(g.k) || !!busca;
      return <div key={g.k} className="card" style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
        <button onClick={() => alterna(g.k)} style={{ width: "100%", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", background: nConf === g.rs.length ? "var(--tn-green)" : "var(--surface-2)", border: 0, cursor: "pointer", textAlign: "left" }}>
          <b style={{ fontSize: 16, minWidth: 190 }}>{ab ? "▾" : "▸"} {g.nome}</b>
          {g.assist && <span className="pill" style={{ background: "var(--tn-amber)", color: "#9A4A00", borderColor: "#E8A44A", fontWeight: 700 }}>{g.rot} · pago na quinzena da montagem</span>}
          <span>{nConf}/{g.rs.length} conferidos</span>
          <span className="hint">{g.rs.reduce((s, x) => s + x.itens.length, 0)} entregas</span>
          <span className="hint">{fmtN(km)} km</span>
          <b style={{ marginLeft: "auto" }}>{moeda(tot)}</b>
        </button>
        {g.assist && (() => {
          const f = fr.find(x => String(x.id) === g.k); if (!f) return null;
          const prontos = g.rs.filter(r => r.conferido && !r.envio_chave && contaRom(r).total > 0), enviados = g.rs.filter(r => r.envio_chave), faltam = g.rs.filter(r => !r.conferido && !r.envio_chave);
          const vp = prontos.reduce((s, r) => s + contaRom(r).total, 0), ve = enviados.reduce((s, r) => s + contaRom(r).total, 0);
          return <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "8px 14px", background: "var(--tn-amber)", borderTop: "1px solid #F1D9B5" }}>
            <span>Na montagem: <b>{f.montador_nome || "⚠ sem nome (Freteiros e contas)"}</b></span>
            {enviados.length > 0 && <span style={{ color: "var(--tn-green-i)" }}>✓ {enviados.length} já enviado(s) · {moeda(ve)}</span>}
            {faltam.length > 0 && <span style={{ color: "var(--tn-amber-i)" }}>⚠ {faltam.length} a conferir</span>}
            {faltam.filter(r => contaRom(r).total > 0).length > 0 && <button className="btn sm" style={{ marginLeft: "auto" }} onClick={async () => {
              const l = faltam.filter(r => contaRom(r).total > 0);
              if (!confirm(`Fechar (marcar como conferidos) ${l.length} romaneio(s) de ${f.apelido} com valor lançado?`)) return;
              try { for (const r of l) { const p: Partial<RomTat> = r.mes < mes ? { conferido: true, mes } : { conferido: true }; await salvarRom(r.id, p, uid); patch(r.id, p); } toast?.(l.length + " romaneio(s) fechados — envie na aba 🛠 por quinzena"); } catch (e: any) { toast?.(e.message); rec(); }
            }}>✓ Fechar romaneios com valor ({faltam.filter(r => contaRom(r).total > 0).length})</button>}
            <button className="btn primary sm" style={faltam.filter(r => contaRom(r).total > 0).length ? undefined : { marginLeft: "auto" }} disabled={!prontos.length} onClick={() => setModal(<ModalEnvioAssist f={f} lista={g.rs} uid={uid} toast={toast} pronto={rec} />)}>📤 Enviar para aprovação de pagamento ({prontos.length} romaneio(s) · {moeda(vp)})</button>
            <button className="btn sm ghost" onClick={irAssist}>ver quinzenas →</button>
          </div>;
        })()}
        {ab && <div style={{ overflowX: "auto" }}><table className="ma-tab" style={{ width: "100%", fontSize: 13.5, margin: 0 }}>
          <thead><tr><th>Romaneio</th><th>Data</th><th style={{ textAlign: "center" }}>Entregas</th><th>Avisos</th><th style={{ textAlign: "right" }}>Km</th><th style={{ textAlign: "right" }}>Entregas (R$)</th><th style={{ textAlign: "right" }}>Total</th><th style={{ textAlign: "right" }}>Total no papel</th><th style={{ textAlign: "center" }}>Conferido</th><th></th></tr></thead>
          <tbody>{rs.map(x => <LinhaRom key={x.id} mes={mes} r={x} todos={rom} uid={uid} toast={toast} patch={patch} aberto={aberto === x.id} abrir={() => setAberto(aberto === x.id ? null : x.id)}
            detalhe={aberto === x.id ? <Romaneio key={x.id} mes={mes} r={x} fr={fr} todos={rom} uid={uid} toast={toast} fechar={() => setAberto(null)} salvo={() => { rec(); setAberto(null); }} /> : null} />)}</tbody>
        </table>
          <div style={{ padding: "8px 12px" }}>{novoM === g.k ? <FormManual fr={fr} fixo={fr.find(f => String(f.id) === g.k)} mes={mes} uid={uid} toast={toast} fechar={() => setNovoM(null)} feito={rec} />
            : !g.k.startsWith("sem:") && <button className="btn sm" onClick={() => setNovoM(g.k)}>➕ Romaneio manual de {g.nome}</button>}</div>
        </div>}
      </div>;
    })}
  </>;
}

/** uma linha = um romaneio; km e valores digitados direto, grava ao sair do campo */
function LinhaRom({ mes, r, todos, uid, toast, patch, aberto, abrir, detalhe }: { mes: string; r: RomTat; todos: RomTat[]; uid: string; toast: any; patch: (id: number, p: Partial<RomTat>) => void; aberto: boolean; abrir: () => void; detalhe: React.ReactNode }) {
  const c = contaRom(r); const av = avisosRom(r, todos);
  const porLinha = r.modo === "linhas" && r.itens.some(i => i.valor != null || i.km != null);
  const [km, setKm] = useState(porLinha ? fmtN(c.km) : fmtN(r.km)); const [ent, setEnt] = useState(porLinha ? fmtN(c.ent) : fmtN(r.valor_entregas)); const [papel, setPapel] = useState(fmtN(r.total_papel));
  useEffect(() => { if (porLinha) { setKm(fmtN(c.km)); setEnt(fmtN(c.ent)); } }, [porLinha, c.km, c.ent]);
  const gravar = async (p: Partial<RomTat>) => { patch(r.id, p); try { await salvarRom(r.id, p, uid); } catch (e: any) { toast?.(e.message); } };
  const sair = () => {
    const p: Partial<RomTat> = { total_papel: num(papel) };
    if (!porLinha) { p.modo = "total"; p.km = num(km); p.valor_entregas = num(ent); }
    if (p.total_papel === r.total_papel && (porLinha || (p.km === r.km && p.valor_entregas === r.valor_entregas && (r.modo === "total" || (p.km == null && p.valor_entregas == null))))) return;
    gravar(p);
  };
  const enter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return; e.preventDefault();
    const todosInp = Array.from(document.querySelectorAll<HTMLInputElement>("input.fx:not([disabled])")); const i = todosInp.indexOf(e.currentTarget);
    const n = todosInp[i + 1]; if (n) { n.focus(); n.select(); }
  };
  const inp = { width: 80, textAlign: "right" as const, padding: "3px 6px" };
  const v = porLinha ? c : contaRom({ ...r, modo: "total", km: num(km), valor_entregas: num(ent), total_papel: num(papel) });
  const bate = v.difPapel == null ? null : v.difPapel === 0;
  return <>
    <tr style={{ background: r.conferido ? "var(--tn-green)" : undefined }}>
      <td><b>{numRom(r)}</b>{r.mes < mes && <div style={{ fontSize: 11.5, color: "var(--tn-blue-i)" }}>📥 de {r.mes.slice(5, 7)}/{r.mes.slice(0, 4)}</div>}</td><td>{br(r.data).slice(0, 5)}</td><td style={{ textAlign: "center" }}>{ehManual(r) ? r.itens.map(i => i.tipo).join(", ") : r.itens.length}</td>
      <td style={{ fontSize: 12, color: "var(--tn-amber-i)", maxWidth: 240 }}>{av.join(" · ")}</td>
      <td style={{ textAlign: "right" }}><input className="fx" style={inp} inputMode="decimal" value={km} disabled={porLinha} title={porLinha ? "Lançado cliente por cliente" : ""} onChange={e => setKm(e.target.value)} onBlur={sair} onKeyDown={enter} /></td>
      <td style={{ textAlign: "right" }}><input className="fx" style={inp} inputMode="decimal" value={ent} disabled={porLinha} title={porLinha ? "Lançado cliente por cliente" : ""} onChange={e => setEnt(e.target.value)} onBlur={sair} onKeyDown={enter} /></td>
      <td style={{ textAlign: "right" }}>{v.lancado && <><b>{moeda(v.total)}</b>{v.km > 0 && <div className="hint">{moeda(v.vKm)} de km</div>}</>}</td>
      <td style={{ textAlign: "right" }}><input className="fx" style={{ ...inp, borderColor: bate == null ? undefined : bate ? "#1f8a4c" : "#c00" }} inputMode="decimal" value={papel} placeholder="opcional" onChange={e => setPapel(e.target.value)} onBlur={sair} onKeyDown={enter} />
        {bate === false && <div style={{ color: "#c00", fontSize: 12 }}>dif. {moeda(v.difPapel || 0)}</div>}</td>
      <td style={{ textAlign: "center" }}><input type="checkbox" style={{ width: 20, height: 20 }} checked={r.conferido} disabled={!!r.envio_chave} title={r.envio_chave ? "Já enviado para a montagem — desfaça o envio na aba 🛠 para mexer" : ""} onChange={e => gravar(e.target.checked && r.mes < mes ? { conferido: true, mes } : { conferido: e.target.checked })} />
        {r.envio_chave && <div style={{ fontSize: 11, color: "var(--tn-green-i)" }}>✓ na montagem</div>}</td>
      <td><button className="btn sm" style={{ whiteSpace: "nowrap" }} onClick={abrir}>{aberto ? "▾" : "▸"} clientes</button></td>
    </tr>
    {detalhe && <tr><td colSpan={10} style={{ padding: "0 6px 8px", background: "var(--tn-grey)" }}>{detalhe}</td></tr>}
  </>;
}

// ---------------- romaneio aberto (igual ao papel) ----------------
function Romaneio({ mes, r, fr, todos, uid, toast, fechar, salvo }: { mes: string; r: RomTat; fr: Freteiro[]; todos: RomTat[]; uid: string; toast: any; fechar: () => void; salvo: (ir: boolean) => void }) {
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
      await salvarRom(r.id, { modo, freteiro_id: fid, km: atual.km, valor_entregas: atual.valor_entregas, valor_km: atual.valor_km, total_papel: atual.total_papel, obs, itens: atual.itens, conferido, ...(conferido && r.mes < mes ? { mes } : {}) }, uid);
      toast?.(conferido ? "Romaneio " + r.romaneio + " conferido" : "Salvo"); salvo(ir);
    } catch (e: any) { toast?.(e.message); }
  };
  let idx = 0; const ref = () => { const k = idx++; return { ref: (el: HTMLInputElement | null) => { refs.current[k] = el; }, onKeyDown: (e: React.KeyboardEvent) => enter(e, k) }; };
  const inp = { width: 74, textAlign: "right" as const, padding: "4px 6px" };
  return (
    <div ref={caixa} className="card" style={{ marginTop: 14, padding: 16, borderTop: "4px solid var(--primary)", scrollMarginTop: 70 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
        <div><div style={{ fontSize: 20, fontWeight: 700 }}>Romaneio de Entregas - {numRom(r)}</div>
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
      {av.length > 0 && <div style={{ margin: "8px 0", padding: "6px 10px", background: "var(--tn-amber)", borderRadius: 6, fontSize: 13 }}>⚠ {av.join(" · ")}</div>}
      <div style={{ overflowX: "auto", marginTop: 8 }}>
        <table className="ma-tab" style={{ width: "100%", fontSize: 13.5 }}>
          <thead><tr><th>Venda</th><th>Cliente</th><th>Endereço</th><th>Cidade</th><th>NF</th>{modo === "linhas" && <><th style={{ textAlign: "right" }}>Km</th><th style={{ textAlign: "right" }}>Valor (R$)</th></>}</tr></thead>
          <tbody>{r.itens.map((i: ItemRom, k: number) => <tr key={k} style={{ background: i.transf ? "var(--tn-purple)" : i.assist ? "var(--tn-blue)" : undefined }}>
            <td>{i.tipo || i.venda || (i.transf ? "Transf." : i.assist ? "Assist." : "")}</td><td>{i.cliente}{i.data && i.data !== r.data && <span className="hint"> ({br(i.data).slice(0, 5)})</span>}</td>
            <td style={{ minWidth: 220 }}>{i.endereco || i.bairro}{i.endereco ? null : <span className="hint"> (só o bairro)</span>}
              {(i.endereco || i.bairro) && <a className="btn sm" style={{ marginLeft: 6, padding: "1px 7px", whiteSpace: "nowrap" }} href={mapsEntrega(i)} target="_blank" rel="noopener" title="Abrir no Google Maps — arraste o boneco amarelo (ou clique na foto) para ver o Street View">📍 Maps</a>}</td>
            <td>{i.cidade}</td><td>{i.nf}</td>
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
      <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8, fontSize: 16 }}>
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
  const fr: Freteiro[] = d.fr; const desc: Desconto[] = d.desc;
  // só os romaneios fechados neste mês; os de meses anteriores ainda não conferidos entram quando forem conferidos aqui
  const rom: RomTat[] = d.rom.filter((r: RomTat) => r.mes === mes); const atrasados = d.rom.filter((r: RomTat) => r.mes < mes).length;
  const [pagto, setPagto] = useState<string>(d.pagto || "");
  const [nd, setNd] = useState({ fid: "", descricao: "", parcela: "", valor: "" });
  // frete de assistência não vai para o financeiro: é pago na quinzena da montagem (aba 🛠)
  const assistRom = rom.filter(r => ehAssist(fr.find(f => f.id === r.freteiro_id))); const assistTot = assistRom.reduce((s, r) => s + contaRom(r).total, 0);
  const linhas = fr.filter(f => !ehAssist(f) && (f.ativo || rom.some(r => r.freteiro_id === f.id))).map(f => {
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
      linhas: rom.filter(r => !ehAssist(fr.find(f => f.id === r.freteiro_id))).sort((a, b) => (fr.find(f => f.id === a.freteiro_id)?.apelido || "").localeCompare(fr.find(f => f.id === b.freteiro_id)?.apelido || "") || String(a.data).localeCompare(String(b.data)))
        .map(r => { const c = contaRom(r); return [fr.find(f => f.id === r.freteiro_id)?.apelido || r.transportadora, r.data, numRom(r), r.itens.length, c.km, c.vKm, c.ent, c.total, r.conferido ? "SIM" : "NÃO"]; }) }]);
  const imprimir = () => {
    const td = (s: string, a = "left", b = false) => `<td style="text-align:${a};${b ? "font-weight:bold;" : ""}">${s}</td>`;
    const html = `<html><head><title>FRETE ${nomeMes(mes)}</title><style>body{font-family:Arial;font-size:11px;margin:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 6px}th{background:#eee}h2{text-align:center}</style></head><body>
      <h2>FRETE ${nomeMes(mes)}</h2><table><tr><th>FRETEIRO</th><th>Frete (R$)</th><th>KM (R$)</th><th>valor total</th><th>${cabConta}</th><th>descontos</th><th>TOTAL PAGAMENTO</th></tr>
      ${linhas.map(l => `<tr>${td(l.f.apelido, "left", true)}${td(moeda(l.frete), "right")}${td(moeda(l.km), "right")}${td(moeda(l.total), "right")}${td(conta(l.f))}${td(l.ds.length ? l.ds.map(x => (x.parcela ? x.parcela + " " : "") + moeda(x.valor)).join(" + ") : "", "right")}${td(moeda(l.pagar), "right", true)}</tr>`).join("")}
      <tr>${td("Total geral", "left", true)}${td(moeda(T("frete")), "right", true)}${td(moeda(T("km")), "right", true)}${td(moeda(T("total")), "right", true)}<td></td><td></td>${td(moeda(T("pagar")), "right", true)}</tr></table></body></html>`;
    const w = window.open("", "_blank"); if (!w) return toast?.("Libere pop-up para imprimir"); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300);
  };
  // PDF para o financeiro: freteiro, valores, conta para o pagamento, descontos e total a pagar (o financeiro paga direto pelo PDF)
  const pdf = async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const tDesc = linhas.reduce((s, l) => s + l.tDesc, 0);
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("Aliança Móveis — Pagamento de fretes", 14, 15);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    doc.text("FRETE " + nomeMes(mes) + (pagto ? "  ·  pagamento em " + br(pagto) : ""), 14, 22);
    doc.setFont("helvetica", "bold"); doc.text("Total a pagar: " + moeda(T("pagar")) + "  ·  " + linhas.length + " freteiro(s)", 14, 28); doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: 33,
      head: [["Freteiro", "Frete (R$)", "KM (R$)", "Valor total", "Favorecido · agência / conta", "Descontos", "TOTAL A PAGAR"]],
      body: linhas.map(l => [l.f.apelido, moeda(l.frete), moeda(l.km), moeda(l.total),
        l.f.favorecido || l.f.conta ? `${l.f.favorecido || ""}\nAg. ${l.f.agencia || "—"} / Conta ${l.f.conta || "—"}` : "SEM CONTA CADASTRADA",
        l.ds.length ? l.ds.map(x => (x.parcela ? x.parcela + " " : "") + moeda(x.valor) + (x.descricao ? " (" + x.descricao + ")" : "")).join("\n") : "", moeda(l.pagar)]),
      foot: [["TOTAL GERAL", moeda(T("frete")), moeda(T("km")), moeda(T("total")), "", tDesc ? moeda(tDesc) : "", moeda(T("pagar"))]],
      styles: { fontSize: 9.5, cellPadding: 2.2, valign: "middle" },
      headStyles: { fillColor: [31, 56, 100], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [230, 236, 245], textColor: 0, fontStyle: "bold" },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 34 }, 1: { halign: "right", cellWidth: 27 }, 2: { halign: "right", cellWidth: 25 }, 3: { halign: "right", cellWidth: 28 }, 4: { cellWidth: 82 }, 5: { halign: "right", cellWidth: 38 }, 6: { halign: "right", fontStyle: "bold", cellWidth: 33 } },
      didParseCell: (c: any) => { if (c.section === "body" && c.column.index === 4 && c.cell.raw === "SEM CONTA CADASTRADA") { c.cell.styles.textColor = [180, 0, 0]; c.cell.styles.fontStyle = "bold"; } },
    });
    const h = doc.internal.pageSize.getHeight(); const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text("Gerado em " + new Date().toLocaleString("pt-BR").slice(0, 17) + " · ALIANÇA 360 · página " + i + " de " + n, 14, h - 6); }
    doc.save("FRETE_" + nomeMes(mes).replace(" ", "_") + ".pdf");
  };
  const novoDesc = (fid: number) => { setNd({ fid: String(fid), descricao: "", parcela: "", valor: "" }); setTimeout(() => document.getElementById("form-desc-frete")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); };
  const addDesc = async () => {
    const v = num(nd.valor); if (!nd.fid || !v) return toast?.("Escolha o freteiro e o valor do desconto");
    try { await criarDesconto({ mes, freteiro_id: +nd.fid, descricao: nd.descricao, parcela: nd.parcela, valor: v }); setNd({ fid: "", descricao: "", parcela: "", valor: "" }); rec(); } catch (e: any) { toast?.(e.message); }
  };
  return <>
    {assistRom.length > 0 && <div className="card" style={{ padding: "8px 12px", marginBottom: 10, background: "var(--tn-amber)" }}>🛠 <b>Frete de assistência e de montadores: {assistRom.length} romaneio(s) · {moeda(assistTot)}</b> — <u>não entra</u> neste relatório. É enviado para o pagamento quinzenal da montagem na aba <b>🛠 Frete pago na montagem</b>.</div>}
    {atrasados > 0 && <div className="card" style={{ padding: "8px 12px", marginBottom: 10, background: "var(--tn-blue)" }}>📥 <b>{atrasados} romaneio(s) de meses anteriores</b> ainda a conferir — aparecem na aba Romaneios e entram neste relatório quando forem conferidos.</div>}
    {(pend > 0 || semF > 0) && <div className="card" style={{ padding: "8px 12px", marginBottom: 10, background: "var(--tn-amber)" }}>⚠ {pend > 0 && <><b>{pend} romaneio(s) ainda não conferido(s)</b> — entram no relatório com o que já foi digitado. </>}{semF > 0 && <b>{semF} romaneio(s) sem freteiro.</b>}</div>}
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
      <div className="field" style={{ margin: 0 }}><label>Data do pagamento</label><input type="date" value={pagto} onChange={e => setPagto(e.target.value)} onBlur={() => salvarPagto(mes, pagto).catch((e: any) => toast?.(e.message))} /></div>
      <button className="btn primary" disabled={!linhas.length} onClick={() => pdf().catch((e: any) => toast?.(e.message))}>📄 PDF para o financeiro</button>
      <button className="btn ghost sm" disabled={!linhas.length} onClick={xlsx} title="Planilha com os romaneios, para conferência">Excel (conferência)</button>
    </div>
    <div style={{ overflowX: "auto" }}>
      <table className="ma-tab" style={{ width: "100%", fontSize: 13.5 }}>
        <thead><tr><th colSpan={7} style={{ textAlign: "center", fontSize: 15 }}>FRETE {nomeMes(mes)}</th></tr>
          <tr><th>FRETEIRO</th><th style={{ textAlign: "right" }}>Frete (R$)</th><th style={{ textAlign: "right" }}>KM (R$)</th><th style={{ textAlign: "right" }}>valor total</th><th>{cabConta}</th><th style={{ textAlign: "right" }}>descontos</th><th style={{ textAlign: "right" }}>TOTAL PAGAMENTO</th></tr></thead>
        <tbody>{linhas.map(l => <tr key={l.f.id}>
          <td><b>{l.f.apelido}</b>{l.pend > 0 && <div className="hint">{l.pend} a conferir</div>}</td>
          <td style={{ textAlign: "right" }}>{moeda(l.frete)}</td><td style={{ textAlign: "right" }}>{moeda(l.km)}</td><td style={{ textAlign: "right" }}>{moeda(l.total)}</td>
          <td>{conta(l.f)}</td>
          <td style={{ textAlign: "right" }}>{l.ds.map(x => <div key={x.id}>{x.parcela && <span className="hint">{x.parcela} </span>}{moeda(x.valor)} <button className="btn sm" style={{ padding: "0 5px" }} title={x.descricao} onClick={async () => { if (confirm("Apagar este desconto?")) { await apagarDesconto(x.id); rec(); } }}>✕</button></div>)}
            <button className="btn sm" style={{ padding: "1px 7px", marginTop: 2 }} onClick={() => novoDesc(l.f.id)}>➖ desconto</button></td>
          <td style={{ textAlign: "right" }}><b>{moeda(l.pagar)}</b></td></tr>)}
          <tr style={{ fontWeight: 700 }}><td>Total geral</td><td style={{ textAlign: "right" }}>{moeda(T("frete"))}</td><td style={{ textAlign: "right" }}>{moeda(T("km"))}</td><td style={{ textAlign: "right" }}>{moeda(T("total"))}</td><td></td><td></td><td style={{ textAlign: "right" }}>{moeda(T("pagar"))}</td></tr>
        </tbody>
      </table>
    </div>
    <div id="form-desc-frete" className="card" style={{ padding: 12, marginTop: 14, border: nd.fid ? "2px solid var(--primary)" : undefined }}>
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
  const gravar = async () => { if (!ed?.apelido) return toast?.("Informe o nome"); try { await salvarFreteiro({ ...ed, tipo: ed.tipo || "entrega", montador_nome: ed.tipo === "assistencia" || ed.tipo === "montador" ? (ed.montador_nome || "") : "", apelido: String(ed.apelido).toUpperCase(), valor_km: Number(String(ed.valor_km ?? 3).replace(",", ".")) || 0 }); setEd(null); rec(); toast?.("Salvo"); } catch (e: any) { toast?.(e.message); } };
  return <>
    <div className="hint" style={{ marginBottom: 8 }}>O "Nome no Tático" e o "Cód. no Tático" ligam o relatório importado ao freteiro. A conta sai no relatório do financeiro.</div>
    <div style={{ overflowX: "auto" }}><table className="ma-tab" style={{ width: "100%", fontSize: 13.5 }}>
      <thead><tr>{campos.map(c => <th key={c[0]}>{c[1]}</th>)}<th>Tipo</th><th>Ativo</th><th></th></tr></thead>
      <tbody>{d.fr.map((f: Freteiro) => ed?.id === f.id ? null : <tr key={f.id} style={{ opacity: f.ativo ? 1 : .5 }}>{campos.map(c => <td key={c[0]}>{c[0] === "valor_km" ? moeda(f.valor_km) : String(f[c[0]] ?? "")}</td>)}<td>{ehAssist(f) ? <b style={{ color: "#9A4A00" }}>{f.tipo === "montador" ? "🔧 Montador" : "🛠 Assistência"} → {f.montador_nome || "?"}</b> : "Entrega"}</td><td>{f.ativo ? "sim" : "não"}</td>
        <td><button className="btn sm" onClick={() => setEd({ ...f })}>Editar</button></td></tr>)}</tbody>
    </table></div>
    {ed ? <div className="card" style={{ padding: 12, marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      {campos.map(c => <div key={c[0]} className="field" style={{ margin: 0, width: c[2] }}><label>{c[1]}</label><input value={String(ed[c[0]] ?? "")} onChange={e => setEd({ ...ed, [c[0]]: e.target.value })} /></div>)}
      <div className="field" style={{ margin: 0 }}><label>Tipo</label><select value={ed.tipo || "entrega"} onChange={e => setEd({ ...ed, tipo: e.target.value })}><option value="entrega">Entrega (relatório do financeiro)</option><option value="assistencia">🛠 Frete de assistência (pagamento da montagem)</option><option value="montador">🔧 Montador que faz frete (pagamento da montagem)</option></select></div>
      {(ed.tipo === "assistencia" || ed.tipo === "montador") && <div className="field" style={{ margin: 0, width: 200 }}><label>Nome dele na montagem</label><input value={ed.montador_nome || ""} onChange={e => setEd({ ...ed, montador_nome: e.target.value })} placeholder="ex.: Costa (Assistência)" /></div>}
      <label style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={ed.ativo !== false} onChange={e => setEd({ ...ed, ativo: e.target.checked })} /> ativo</label>
      <button className="btn primary" onClick={gravar}>Salvar</button><button className="btn" onClick={() => setEd(null)}>Cancelar</button>
    </div> : <button className="btn" style={{ marginTop: 10 }} onClick={() => setEd({ valor_km: 3, ativo: true, ordem: 99 })}>+ Novo freteiro</button>}
  </>;
}

// ---------------- romaneio manual: nº, data e linhas (entrega / recolha / retorno, cliente, km, valor) ----------------
function FormManual({ fr, fixo, mes, uid, toast, fechar, feito }: { fr: Freteiro[]; fixo?: Freteiro; mes: string; uid: string; toast: any; fechar: () => void; feito: () => void }) {
  const hojeIso = new Date().toISOString().slice(0, 10);
  const [fid, setFid] = useState<string>(fixo ? String(fixo.id) : "");
  const [numero, setNumero] = useState(""); const [data, setData] = useState(hojeIso.slice(0, 7) === mes ? hojeIso : mes + "-01");
  const vazia = () => ({ tipo: "Entrega", cliente: "", km: "", valor: "" });
  const [ls, setLs] = useState([vazia()]);
  const total = ls.reduce((s, l) => s + (num(l.valor) || 0), 0), km = ls.reduce((s, l) => s + (num(l.km) || 0), 0);
  const f = fr.find(x => String(x.id) === fid); const vkm = f?.valor_km ?? 3;
  const gravar = async () => {
    if (!f) return toast?.("Escolha o entregador"); if (!numero.trim()) return toast?.("Informe o nº do romaneio manual");
    const linhas = ls.filter(l => l.cliente.trim() || num(l.valor) != null || num(l.km) != null).map(l => ({ tipo: l.tipo, cliente: l.cliente.trim(), km: num(l.km), valor: num(l.valor) }));
    if (!linhas.length) return toast?.("Inclua ao menos uma linha com valor");
    try { await criarManual(f, numero, data, linhas, uid); toast?.("Romaneio manual " + numero + " incluído"); fechar(); feito(); } catch (e: any) { toast?.(e.message); }
  };
  const set = (k: number, c: string, v: string) => setLs(x => x.map((l, j) => j === k ? { ...l, [c]: v } : l));
  return <div className="card" style={{ padding: 12, border: "2px dashed var(--primary)" }}>
    <b>➕ Romaneio manual</b> <span className="hint">(o que não vem no relatório do Tático)</span>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
      <div className="field" style={{ margin: 0 }}><label>Entregador</label><select value={fid} disabled={!!fixo} onChange={e => setFid(e.target.value)}><option value="">—</option>{fr.filter(x => x.ativo).map(x => <option key={x.id} value={x.id}>{x.apelido}</option>)}</select></div>
      <div className="field" style={{ margin: 0, width: 140 }}><label>Nº do romaneio manual</label><input value={numero} onChange={e => setNumero(e.target.value)} placeholder="ex.: 2345" /></div>
      <div className="field" style={{ margin: 0 }}><label>Data</label><input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
    </div>
    <table className="ma-tab" style={{ width: "100%", fontSize: 13.5, marginTop: 8 }}>
      <thead><tr><th>Tipo</th><th>Cliente / observação</th><th style={{ textAlign: "right" }}>Km</th><th style={{ textAlign: "right" }}>Valor (R$)</th><th></th></tr></thead>
      <tbody>{ls.map((l, k) => <tr key={k}>
        <td><select value={l.tipo} onChange={e => set(k, "tipo", e.target.value)}>{TIPOS_MANUAL.map(t => <option key={t}>{t}</option>)}</select></td>
        <td><input value={l.cliente} onChange={e => set(k, "cliente", e.target.value)} placeholder="nome do cliente" style={{ width: "100%" }} /></td>
        <td style={{ textAlign: "right" }}><input value={l.km} inputMode="decimal" onChange={e => set(k, "km", e.target.value)} style={{ width: 70, textAlign: "right" }} /></td>
        <td style={{ textAlign: "right" }}><input value={l.valor} inputMode="decimal" onChange={e => set(k, "valor", e.target.value)} onKeyDown={e => { if (e.key === "Enter" && k === ls.length - 1) setLs(x => [...x, vazia()]); }} style={{ width: 90, textAlign: "right" }} /></td>
        <td>{ls.length > 1 && <button className="btn sm" onClick={() => setLs(x => x.filter((_, j) => j !== k))}>✕</button>}</td>
      </tr>)}</tbody>
    </table>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
      <button className="btn sm" onClick={() => setLs(x => [...x, vazia()])}>+ linha</button>
      <span style={{ marginLeft: "auto" }}>Km {fmtN(km) || 0} × {moeda(vkm)} = {moeda(km * vkm)} + {moeda(total)} = <b>{moeda(total + km * vkm)}</b></span>
      <button className="btn primary" onClick={gravar}>Incluir</button><button className="btn" onClick={fechar}>Cancelar</button>
    </div>
  </div>;
}

// ---------------- modal: enviar UM freteiro de assistência/montador para o pagamento da montagem ----------------
const ddmmQ = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
/** dia do pagamento da quinzena da montagem: 1ª (10 a 24) paga dia 10 do mês seguinte · 2ª (25 a 09) paga dia 25 do mês seguinte */
export const pagaEmQ = (q: { de: string; ref: string }) => { const [y, m] = q.de.split("-").map(Number); const x = new Date(y, m, 1); return (q.ref.endsWith("-1") ? "10/" : "25/") + String(x.getMonth() + 1).padStart(2, "0") + "/" + x.getFullYear(); };
const rotQ = (q: { de: string; ate: string; ref: string }) => (q.ref.endsWith("-1") ? "1ª" : "2ª") + " quinzena (" + ddmmQ(q.de) + " a " + ddmmQ(q.ate) + ")";
function ModalEnvioAssist({ f, lista, so, uid, toast, pronto }: { f: Freteiro; lista: RomTat[]; so?: number; uid: string; toast: any; pronto: () => void }) {
  const { setModal } = useApp() as any;
  const hoje = new Date(); const hojeIso = hoje.getFullYear() + "-" + String(hoje.getMonth() + 1).padStart(2, "0") + "-" + String(hoje.getDate()).padStart(2, "0");
  const qAtual = quinzenaDe(hojeIso);
  const prontos = lista.filter(r => r.conferido && !r.envio_chave && contaRom(r).total > 0 && r.data).sort((a, b) => (a.data || "").localeCompare(b.data || ""));
  const [fech, setFech] = useState<Map<string, string> | null>(null); // referência da quinzena → quando o pagamento dela foi fechado na montagem
  useEffect(() => { if (MOCK) { setFech(new Map()); return; }
    sb.from("montagem_fechamentos").select("referencia,criado_em").eq("ativo", true).then(({ data }) => setFech(new Map((data || []).map((x: any) => [x.referencia, x.criado_em]))), () => setFech(new Map())); }, []);
  // opções: 3 quinzenas antes da atual, a atual (em aberto) e a próxima
  const opcoes = useMemo(() => { const l = [qAtual]; for (let i = 0; i < 3; i++) l.unshift(quinzenaAntes(l[0])); l.push(quinzenaDe(somaD(qAtual.ate, 1))); return l; }, []);
  const fechada = (q: { ref: string }) => !!fech?.has(q.ref);
  const [qSel, setQSel] = useState<string>("");
  useEffect(() => { if (!fech || qSel) return;
    // padrão: a quinzena do romaneio mais antigo, se ainda estiver aberta; senão a primeira quinzena em aberto depois dela
    // padrão: o próximo pagamento (a data do romaneio não importa — vale o fechamento que vocês fazem do frete)
    setQSel(quinzenaAntes(qAtual).de); }, [fech]);
  const q = opcoes.find(o => o.de === qSel);
  const [marc, setMarc] = useState<Set<number>>(() => new Set(so ? [so] : prontos.map(r => r.id)));
  const [ok, setOk] = useState(false); const [sal, setSal] = useState(false);
  const podeEntrar = (_r: RomTat) => !!q; // todo romaneio fechado do freteiro entra no pagamento escolhido (inclusive os de datas atrasadas)
  const vai = prontos.filter(r => marc.has(r.id) && podeEntrar(r));
  const tot = vai.reduce((s, r) => s + contaRom(r).total, 0);
  const dataPara = (_r: RomTat) => q!.de; // a ordem avulsa entra na quinzena escolhida, qualquer que seja a data do romaneio
  const ir = async () => {
    if (!q || !vai.length || !ok) return; setSal(true);
    try { const n = await enviarAssist(vai, f, uid, dataPara); toast?.(`${n} romaneio(s) de ${f.apelido} enviados para o pagamento de ${pagaEmQ(q)} · ${f.montador_nome}`); setModal(null); pronto(); }
    catch (e: any) { toast?.(e.message); setSal(false); }
  };
  return <Modal titulo={"🛠 Enviar " + f.apelido + " para o pagamento da montagem"} onFechar={() => setModal(null)}>
    <div className="hint" style={{ marginBottom: 8 }}>Só os romaneios <b>deste freteiro</b>. Entram como ordem avulsa de {f.tipo === "montador" ? "frete" : "frete de assistência"} no pagamento do montador <b>{f.montador_nome || "⚠ sem nome — cadastre em Freteiros e contas"}</b>.</div>
    <div className="field"><label>Para qual pagamento? *</label>
      {!fech ? <div className="hint">Carregando quinzenas…</div> : <div style={{ display: "grid", gap: 6 }}>{opcoes.map(o => { const fe = fechada(o); return <label key={o.de} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: qSel === o.de ? "var(--tn-green)" : undefined, cursor: "pointer" }}>
        <input type="radio" name="qenv" checked={qSel === o.de} onChange={() => { setQSel(o.de); setOk(false); }} />
        <span><b>Pagamento do dia {pagaEmQ(o)}</b> · {rotQ(o)}{o.de === qAtual.de ? " · em aberto" : ""}{fe ? " · fechamento já gerado em " + br(String(fech!.get(o.ref)).slice(0, 10)).slice(0, 5) : ""}</span></label>; })}</div>}
      {q && fechada(q) && <div className="hint" style={{ marginTop: 6, color: "var(--tn-amber-i)" }}>⚠ O pagamento desta quinzena já foi fechado na Montagem. Depois de enviar, abra 💰 Montagem → filtre a quinzena {rotQ(q)} → <b>🔒 Fechar pagamento da quinzena</b> de novo (o fechamento anterior fica guardado no histórico) para o frete entrar no relatório do financeiro.</div>}
    </div>
    <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8 }}><table className="ma-tab" style={{ width: "100%", fontSize: 13, margin: 0 }}>
      <thead><tr><th></th><th>Romaneio</th><th>Data</th><th style={{ textAlign: "center" }}>Entregas</th><th style={{ textAlign: "right" }}>Total</th><th>Observação</th></tr></thead>
      <tbody>{prontos.map(r => { const pe = podeEntrar(r), dentro = q && r.data! >= q.de && r.data! <= q.ate; return <tr key={r.id} style={{ opacity: pe ? 1 : .5 }}>
        <td><input type="checkbox" disabled={!pe} checked={pe && marc.has(r.id)} onChange={e => setMarc(s => { const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); setOk(false); return n; })} /></td>
        <td><b>{numRom(r)}</b></td><td>{br(r.data).slice(0, 5)}</td><td style={{ textAlign: "center" }}>{r.itens.length}</td><td style={{ textAlign: "right" }}>{moeda(contaRom(r).total)}</td>
        <td className="hint">{!q ? "" : !pe ? "" : dentro ? "" : <span className="hint">entra neste pagamento</span>}</td></tr>; })}
        {!prontos.length && <tr><td colSpan={6} className="hint" style={{ padding: 12 }}>Nenhum romaneio conferido com valor para enviar. Confira os romaneios antes.</td></tr>}</tbody>
    </table></div>
    {q && <div className="card" style={{ padding: 10, marginTop: 10, background: "var(--tn-amber)" }}>
      <div><b>{vai.length} romaneio(s) · {moeda(tot)}</b> vão para o pagamento de <b>{f.montador_nome}</b> do dia <b>{pagaEmQ(q)}</b> ({rotQ(q)}).</div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontWeight: 600 }}><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> Autorizo enviar estes valores para o pagamento do dia {pagaEmQ(q)}</label>
    </div>}
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      <button className="btn primary" disabled={sal || !ok || !vai.length || !q || !f.montador_nome} onClick={ir}>{sal ? "Enviando…" : "🔒 Enviar para o pagamento" + (q ? " de " + pagaEmQ(q).slice(0, 5) : "")}</button>
      <button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button>
    </div>
  </Modal>;
}
const somaD = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
// ---------------- 🛠 pagamento do frete de assistência (quinzena da montagem) ----------------
function PagAssist({ fr, uid, toast }: { fr: Freteiro[]; uid: string; toast: any }) {
  const { setModal } = useApp() as any;
  const assist = fr.filter(ehAssist);
  const hoje = new Date(); const ym = hoje.getFullYear() + "-" + String(hoje.getMonth() + 1).padStart(2, "0");
  const hojeIso = ym + "-" + String(hoje.getDate()).padStart(2, "0");
  // mesmas quinzenas do pagamento da montagem: 1ª = 10 a 24 (paga dia 10 do mês seguinte) · 2ª = 25 a 09 (paga dia 25 do mês seguinte)
  const qAtual = quinzenaDe(hojeIso), qPagar = quinzenaAntes(qAtual);
  const [de, setDe] = useState(qPagar.de); const [ate, setAte] = useState(qPagar.ate);
  const [rs, setRs] = useState<RomTat[] | null>(null); const [ocup, setOcup] = useState(false);
  const [sel, setSel] = useState<number | "todos">("todos");
  const rec = () => carregarAssist(de, ate, assist.map(f => f.id)).then(setRs).catch(e => toast?.(e.message));
  useEffect(() => { setRs(null); rec(); }, [de, ate, fr]);
  const ddmm = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const pagaEm = (q: { de: string; ref: string }) => { const [y, m] = q.de.split("-").map(Number); const x = new Date(y, m, 1); return (q.ref.endsWith("-1") ? "10/" : "25/") + String(x.getMonth() + 1).padStart(2, "0"); };
  const quinzenas = (() => { const l = [qAtual]; for (let i = 0; i < 3; i++) l.push(quinzenaAntes(l[l.length - 1])); return l.reverse(); })();
  const enviar = async (f: Freteiro, lista: RomTat[], sem = false) => {
    if (!lista.length) return;
    if (!sem && !confirm(`Fechar e enviar ${lista.length} romaneio(s) de ${f.apelido} (${moeda(lista.reduce((s, r) => s + contaRom(r).total, 0))}) para o pagamento da montagem, em "${f.montador_nome}"?`)) return;
    setOcup(true);
    try { const n = await enviarAssist(lista, f, uid); toast?.(n + " romaneio(s) de " + f.apelido + " fechados e enviados para a montagem (" + f.montador_nome + ")"); if (!sem) rec(); } catch (e: any) { toast?.(e.message); rec(); } finally { setOcup(false); }
  };
  if (!assist.length) return <div className="empty">Nenhum freteiro marcado como frete de assistência ou montador (aba Freteiros e contas → Tipo).</div>;
  const vis = assist.filter(f => sel === "todos" || f.id === sel);
  // só os romaneios com data DENTRO da quinzena escolhida — os de antes ficam para a quinzena deles (evita cair em quinzena já fechada)
  const noPer = (r: RomTat) => !!r.data && r.data >= de && r.data <= ate;
  const prontosDe = (f: Freteiro) => (rs || []).filter(r => r.freteiro_id === f.id && noPer(r) && r.conferido && !r.envio_chave && contaRom(r).total > 0);
  const totProntos = vis.reduce((s, f) => s + prontosDe(f).reduce((a, r) => a + contaRom(r).total, 0), 0);
  const nProntos = vis.reduce((s, f) => s + prontosDe(f).length, 0);
  const abrirEnvio = (f: Freteiro, l: RomTat[], so?: number) => setModal(<ModalEnvioAssist f={f} lista={l} so={so} uid={uid} toast={toast} pronto={rec} />);
  const xlsx = () => baixarXlsxFormatado("FRETE_MONTAGEM_" + de + "_a_" + ate + ".xlsx", "FRETE PAGO NA MONTAGEM",
    [{ titulo: "FRETEIRO", largura: 22 }, { titulo: "NA MONTAGEM", largura: 22 }, { titulo: "ROMANEIO", largura: 14, alinhar: "center" }, { titulo: "DATA", largura: 12, tipo: "data", alinhar: "center" }, { titulo: "ENTREGAS", largura: 10, alinhar: "center" },
     { titulo: "KM", largura: 8, alinhar: "center" }, { titulo: "ENTREGAS (R$)", largura: 15, tipo: "moeda" }, { titulo: "KM (R$)", largura: 13, tipo: "moeda" }, { titulo: "TOTAL", largura: 14, tipo: "moeda" }, { titulo: "SITUAÇÃO", largura: 18 }],
    vis.flatMap(f => (rs || []).filter(r => r.freteiro_id === f.id).map(r => { const c = contaRom(r); return [f.apelido, f.montador_nome || "", numRom(r), r.data, r.itens.length, c.km, c.ent, c.vKm, c.total, r.envio_chave ? "ENVIADO" : r.conferido ? "CONFERIDO" : "A CONFERIR"]; })));
  return <>
    <div className="card" style={{ padding: 12, marginBottom: 12, background: "var(--tn-amber)" }}>
      <b>🛠 Frete de assistência e de montadores — pago na quinzena junto com a montagem</b>
      <div className="hint" style={{ marginTop: 4 }}>Os romaneios destes freteiros não entram no relatório do financeiro. Confira-os na aba Romaneios, depois envie aqui: cada romaneio vira uma <b>ordem avulsa de frete</b> ("Frete de assistência" ou "Frete") no pagamento do montador ligado a ele (ex.: Costa (Assistência), Julio Silva), e entra no fechamento da quinzena da montagem.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
        {quinzenas.map(q => <button key={q.de} className={"btn sm" + (q.de === de && q.ate === ate ? " primary" : "")} onClick={() => { setDe(q.de); setAte(q.ate); }}>{q.ref.endsWith("-1") ? "1ª" : "2ª"} quinzena ({ddmm(q.de)} a {ddmm(q.ate)}) · paga {pagaEm(q)}{q.de === qAtual.de ? " · em aberto" : ""}</button>)}
        <div className="field" style={{ margin: 0 }}><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
        <button className="btn sm" disabled={!rs || !rs.length} onClick={xlsx}>⬇ Excel do período</button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
        <b style={{ fontSize: 13 }}>Freteiro / montador:</b>
        <button className={"chip" + (sel === "todos" ? " on" : "")} onClick={() => setSel("todos")}>Todos</button>
        {assist.map(f => { const n = (rs || []).filter(r => r.freteiro_id === f.id && !r.envio_chave).length;
          return <button key={f.id} className={"chip" + (sel === f.id ? " on" : "")} onClick={() => setSel(f.id)}>{f.tipo === "montador" ? "🔧" : "🛠"} {f.apelido} → {f.montador_nome || "?"}{n ? " · " + n + " a fechar" : ""}</button>; })}
        <span className="hint" style={{ marginLeft: "auto" }}>Prontos na quinzena: {nProntos} rom. · {moeda(totProntos)} — o envio é feito na aba 📄 Romaneios, no botão “📤 Enviar para aprovação de pagamento” de cada freteiro</span>
      </div>
    </div>
    {!rs ? <div className="empty">Carregando…</div> : vis.map(f => {
      const l = rs.filter(r => r.freteiro_id === f.id); if (!l.length) return null;
      const doPer = l.filter(r => r.data && r.data >= de), ant = l.filter(r => r.data && r.data < de);
      const prontos = prontosDe(f), naoConf = doPer.filter(r => !r.conferido && !r.envio_chave), enviados = doPer.filter(r => r.envio_chave);
      const tot = (x: RomTat[]) => x.reduce((s, r) => s + contaRom(r).total, 0);
      return <div key={f.id} className="card" style={{ padding: 0, marginBottom: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", padding: "10px 14px", background: "var(--tn-amber)" }}>
          <b style={{ fontSize: 16 }}>{f.tipo === "montador" ? "🔧" : "🛠"} {f.apelido}</b><span className="hint">→ na montagem: <b>{f.montador_nome || "⚠ sem nome — cadastre em Freteiros e contas"}</b></span>
          <span>Período: <b>{moeda(tot(doPer))}</b> ({doPer.length} rom.)</span>
          {ant.length > 0 && <span style={{ color: "var(--tn-blue-i)" }}>📥 {ant.length} de quinzena anterior ainda não enviado(s) ({moeda(tot(ant))}) — selecione a quinzena deles para enviar</span>}
          <span style={{ color: "var(--tn-green-i)" }}>✓ enviados {moeda(tot(enviados))}</span>
        </div>
        {naoConf.length > 0 && <div className="hint" style={{ padding: "6px 14px", color: "var(--tn-amber-i)" }}>⚠ {naoConf.length} romaneio(s) ainda não conferido(s) — confira na aba Romaneios antes de enviar.</div>}
        <div style={{ overflowX: "auto" }}><table className="ma-tab" style={{ width: "100%", fontSize: 13.5, margin: 0 }}>
          <thead><tr><th>Romaneio</th><th>Data</th><th style={{ textAlign: "center" }}>Entregas</th><th style={{ textAlign: "right" }}>Km</th><th style={{ textAlign: "right" }}>Entregas (R$)</th><th style={{ textAlign: "right" }}>Km (R$)</th><th style={{ textAlign: "right" }}>Total</th><th>Situação</th><th></th></tr></thead>
          <tbody>{l.map(r => { const c = contaRom(r); return <tr key={r.id} style={{ background: r.envio_chave ? "var(--tn-green)" : undefined }}>
            <td><b>{numRom(r)}</b></td><td>{br(r.data).slice(0, 5)}{r.data && r.data < de && <span style={{ color: "var(--tn-blue-i)" }}> 📥</span>}</td><td style={{ textAlign: "center" }}>{r.itens.length}</td>
            <td style={{ textAlign: "right" }}>{fmtN(c.km) || "—"}</td><td style={{ textAlign: "right" }}>{moeda(c.ent)}</td><td style={{ textAlign: "right" }}>{moeda(c.vKm)}</td><td style={{ textAlign: "right" }}><b>{moeda(c.total)}</b></td>
            <td>{r.envio_chave ? <span style={{ color: "var(--tn-green-i)" }}>✓ enviado {r.envio_em ? br(r.envio_em.slice(0, 10)).slice(0, 5) : ""}</span> : r.conferido ? (c.total > 0 ? "conferido · a enviar" : <span style={{ color: "var(--tn-amber-i)" }}>sem valor</span>) : <span style={{ color: "var(--tn-amber-i)" }}>a conferir</span>}</td>
            <td>{r.envio_chave ? <button className="btn sm" disabled={ocup} onClick={async () => { if (!confirm("Tirar o romaneio " + numRom(r) + " do pagamento da montagem? (a ordem avulsa é excluída)")) return; setOcup(true); try { await desfazerEnvioAssist(r, uid); rec(); } catch (e: any) { toast?.(e.message); } finally { setOcup(false); } }}>↩ desfazer</button>
              : r.conferido && c.total > 0 && noPer(r) ? <span className="hint">envie pela aba Romaneios</span> : r.data && r.data < de ? <span className="hint">quinzena anterior</span> : null}</td>
          </tr>; })}</tbody>
        </table></div>
      </div>;
    })}
    {rs && !rs.length && <div className="empty">Nenhum romaneio de frete de assistência neste período.</div>}
  </>;
}
