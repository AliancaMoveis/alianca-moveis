// Checklist · ÁREA DO PROJETISTA
// O projetista vê só a agenda dele (hoje, próximos, a finalizar e feitos). No atendimento, anexa a listagem do Promob (PDF):
// o 360 lê no navegador e fica SÓ com material, espessura, cor, módulos e medidas (nenhum valor é gravado, e o PDF não é guardado).
// Com isso monta o termo de ciência por ambiente para o cliente assinar e finaliza o checklist.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { abrirWhats, fmtDate, fmtDateTime, hojeISO, parseData, primeiroNome, sanitizeWhats } from "../lib/regras";
import { lerListagemArquivo, type LinhaListagem, type Listagem } from "../lib/listagemPromob";
import { ambienteDaListagem, termoHtml, type AmbTermo, type DadosTermo, type Mat } from "../lib/termoChecklist";
import { Kpi } from "./Dashboard";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const NAO_INCLUSOS_PADRAO = ["Eletrodomésticos", "Pedras / granito", "Cubas", "Torneiras e metais"];
const NAO_INCLUSOS_OPCOES = [...NAO_INCLUSOS_PADRAO, "Iluminação / LED", "Vidros e espelhos", "Instalação elétrica e hidráulica", "Rodapé e acabamentos de obra"];
const ESPESSURAS = [6, 15, 18, 25];

const somaDias = (iso: string, n: number) => { const d = parseData(iso + "T12:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const cap = (s: string) => String(s || "").toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase());
const semAcento = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** dias em que ESTE projetista atende o cliente (principal + adicionais que são dele) */
function diasDoProj(c: any, proj: string): { slot: string; dur: number; n: number; total: number }[] {
  const ex: any[] = Array.isArray(c.diasExtras) ? c.diasExtras : [];
  const todos = [{ slot: String(c.agendadoPara || "").slice(0, 16), dur: Number(c.duracaoMin) || 120, proj: c.projetista || "" },
    ...ex.map(e => ({ slot: String(e.data || "").slice(0, 16), dur: Number(e.duracaoMin) || Number(c.duracaoMin) || 120, proj: e.projetista || c.projetista || "" }))]
    .filter(d => d.slot).sort((a, b) => a.slot.localeCompare(b.slot));
  return todos.map((d, i) => ({ ...d, n: i + 1, total: todos.length })).filter(d => d.proj === proj);
}
const cidade = (c: any) => { const l = c.local || {}; return [cap(l.cidade), cap(l.bairro)].filter(Boolean).join(" · "); };
const endereco = (c: any) => { const l = c.local || {}; return [l.endereco || l.rua, cap(l.bairro), cap(l.cidade)].filter(Boolean).join(" · "); };
const termoFinal = (c: any) => !!(c.termo && c.termo.finalizadoEm);
const feito = (c: any) => c.etapa === "realizado" || c.status === "concluida";

/** o que ainda falta conferir num ambiente (vai para o termo, em amarelo) */
export function conferirAmb(a: AmbTermo): string[] {
  const out: string[] = [];
  if (!a.caixa.mat) out.push("material das caixas");
  if (!a.caixa.esp) out.push("espessura das caixas");
  if (!a.porta.naoSeAplica) { if (!a.porta.mat && !a.porta.vidro) out.push("material das portas"); if (!a.porta.esp && !a.porta.vidro) out.push("espessura das portas"); }
  const cor = String(a.cor || "").trim();
  if (!cor) out.push("cor / padrão");
  else if (/^(cód\.\s*\d+\s*(·\s*)?)+$/i.test(cor)) out.push("nome das cores");
  return out;
}

/** abre o termo de ciência pronto para imprimir (A4) */
export function abrirTermo(c: any, termo: any, projetista: string, toast?: (m: string) => void) {
  const dataRef = termo.finalizadoEm || c.agendadoPara || new Date().toISOString();
  const d: DadosTermo = {
    venda: String(c.pedido || ""), cliente: String(c.cliente || ""), endereco: endereco(c) || "—", vendedor: cap(c.vendedor || "") || "—",
    projetista: projetista || "—", data: fmtDate(String(dataRef).slice(0, 10)),
    ambientes: (termo.ambientes || []).map((a: AmbTermo) => ({ ...a, conferir: conferirAmb(a) })),
    naoInclusos: termo.naoInclusos || [], obs: termo.obs || "", ferragens: termo.ferragens || [], arquivoListagem: (termo.arquivos || []).join(", "),
  };
  const w = window.open("", "_blank");
  if (!w) { toast?.("Libere as janelas (pop-up) do navegador para abrir o termo"); return; }
  w.document.write(termoHtml(d)); w.document.close(); setTimeout(() => w.print(), 400);
}

export default function ProjetistaChecklist() {
  const { toast } = useApp() as any;
  const [eu, setEu] = useState<{ projetista: string | null; podeTodos: boolean; projetistas: string[] } | null>(null);
  const [proj, setProj] = useState("");
  const [lista, setLista] = useState<any[] | null>(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<"hoje" | "proximos" | "finalizar" | "feitos">("hoje");
  const [aberto, setAberto] = useState<string | null>(null);
  const hj = hojeISO();

  useEffect(() => {
    A.ckProjetistaEu().then(r => {
      setEu(r);
      let salvo = ""; try { salvo = localStorage.getItem("a360-ck-proj") || ""; } catch { /* */ }
      setProj(r.projetista || (r.projetistas.includes(salvo) ? salvo : r.projetistas[0] || ""));
    }).catch((e: any) => setErro(e.message));
  }, []);
  const carregar = () => {
    if (!proj) return;
    setLista(null); setErro("");
    A.ckProjetistaAgenda(proj, somaDias(hj, -45), somaDias(hj, 60)).then(l => setLista(l || [])).catch((e: any) => { setErro(e.message); setLista([]); });
  };
  useEffect(carregar, [proj]);

  const grupos = useMemo(() => {
    const g: Record<string, any[]> = { hoje: [], proximos: [], finalizar: [], feitos: [] };
    (lista || []).forEach(c => {
      const ds = diasDoProj(c, proj); if (!ds.length) return;
      const dias = ds.map(d => d.slot.slice(0, 10));
      if (feito(c)) { g.feitos.push(c); if (!termoFinal(c)) g.finalizar.push(c); return; }
      if (dias.includes(hj)) g.hoje.push(c);
      else if (dias.some(x => x > hj)) g.proximos.push(c);
      else g.finalizar.push(c);
    });
    const prim = (c: any, futuro: boolean) => { const ds = diasDoProj(c, proj).map(d => d.slot); return (futuro ? ds.find(s => s.slice(0, 10) >= hj) : ds[ds.length - 1]) || ds[0] || ""; };
    g.hoje.sort((a, b) => (diasDoProj(a, proj).find(d => d.slot.startsWith(hj))?.slot || "").localeCompare(diasDoProj(b, proj).find(d => d.slot.startsWith(hj))?.slot || ""));
    g.proximos.sort((a, b) => prim(a, true).localeCompare(prim(b, true)));
    g.finalizar.sort((a, b) => prim(a, false).localeCompare(prim(b, false)));
    g.feitos.sort((a, b) => prim(b, false).localeCompare(prim(a, false)));
    return g;
  }, [lista, proj, hj]);

  if (erro && !eu) return <section className="view active"><div className="empty">{erro}</div></section>;
  if (!eu) return <section className="view active"><div className="empty">Carregando…</div></section>;
  if (!eu.projetista && !eu.podeTodos) return <section className="view active"><div className="view-head"><div><h2>Minha agenda de checklist</h2></div></div>
    <div className="card" style={{ padding: 18 }}>Seu usuário tem o acesso de projetista do checklist, mas o nome dele não bate com nenhum projetista da agenda do checklist. Peça para a Gestão conferir o nome no cadastro (tem que ser igual ao da lista de projetistas da agenda).</div></section>;

  const atual = aberto ? (lista || []).find(c => c.id === aberto) : null;
  if (atual) return <FazerChecklist c={atual} proj={proj} onVoltar={() => { setAberto(null); carregar(); }} />;

  const ABAS: [typeof aba, string][] = [["hoje", "Hoje"], ["proximos", "Próximos"], ["finalizar", "A finalizar"], ["feitos", "Realizados"]];
  const vis = grupos[aba] || [];
  return (
    <section className="view active" id="view-projetista-ck">
      <div className="view-head"><div><h2>{eu.projetista && !eu.podeTodos ? "Minha agenda de checklist" : "Área do projetista"}</h2>
        <p>Os clientes do checklist {eu.projetista && proj === eu.projetista ? "que você atende" : "de " + proj}. No atendimento, anexe a listagem do Promob: o 360 lê o material, as cores e os módulos (sem valores) e monta o termo de ciência para o cliente assinar.</p></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {eu.podeTodos && <select value={proj} onChange={e => { setProj(e.target.value); try { localStorage.setItem("a360-ck-proj", e.target.value); } catch { /* */ } }} style={{ minWidth: 160 }}>
            {eu.projetistas.map(n => <option key={n} value={n}>{n}{n === eu.projetista ? " (eu)" : ""}</option>)}</select>}
          <button className="btn ghost sm" onClick={carregar}>↻ Atualizar</button>
        </div></div>
      <div className="kpis" style={{ marginTop: 6 }}>
        <Kpi n={grupos.hoje.length} l="hoje" />
        <Kpi n={grupos.proximos.length} l="próximos" />
        <Kpi n={grupos.finalizar.length} l="a finalizar" cor={grupos.finalizar.length ? "var(--warn)" : undefined} />
        <Kpi n={grupos.feitos.filter(termoFinal).length} l="realizados com termo" />
      </div>
      <div className="subnav" style={{ margin: "10px 0" }}>{ABAS.map(([k, t]) => <button key={k} className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{t} ({grupos[k].length})</button>)}</div>
      {aba === "finalizar" && <p className="hint" style={{ marginTop: 0 }}>Checklists com data que já passou e ainda sem o termo finalizado. Abra, anexe a listagem e finalize.</p>}
      {lista === null ? <div className="empty">Carregando…</div> : erro ? <div className="empty">{erro}</div>
        : !vis.length ? <div className="empty">{aba === "hoje" ? "Nenhum checklist hoje." : aba === "proximos" ? "Nenhum checklist marcado nos próximos dias." : aba === "finalizar" ? "Nada para finalizar. 👍" : "Nenhum checklist realizado nos últimos 45 dias."}</div>
        : vis.map(c => <CartaoProj key={c.id} c={c} proj={proj} hj={hj} onAbrir={() => setAberto(c.id)} onTermo={() => abrirTermo(c, c.termo, proj, toast)} />)}
    </section>
  );
}

function CaixaData({ slot, hj }: { slot: string; hj: string }) {
  const d = parseData(slot), dia = slot.slice(0, 10), cor = dia < hj ? "var(--ink-faint)" : dia === hj ? "var(--st-concluida)" : "var(--primary)";
  return <div style={{ minWidth: 86, textAlign: "center", borderRadius: 12, padding: "7px 8px", background: cor, color: "#fff", lineHeight: 1.15 }}>
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>{dia === hj ? "HOJE" : DIAS[d.getDay()]}</div>
    <div style={{ fontSize: 22, fontWeight: 800 }}>{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</div>
    <div style={{ fontSize: 16, fontWeight: 700 }}>{d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
  </div>;
}

function CartaoProj({ c, proj, hj, onAbrir, onTermo }: { c: any; proj: string; hj: string; onAbrir: () => void; onTermo: () => void }) {
  const ds = diasDoProj(c, proj);
  const ref = ds.find(d => d.slot.slice(0, 10) >= hj) || ds[ds.length - 1];
  const conf = c.confirmacao === "confirmada" ? ["✅ Presença confirmada", "var(--st-concluida)"] : c.confirmacao === "enviada" ? ["📨 Confirmação enviada", "var(--st-respondida)"] : ["⏳ Presença a confirmar", "var(--warn)"];
  const t = c.termo, tels = [c.telefone, c.telefone2].filter(Boolean);
  return (
    <div className="card" style={{ padding: "12px 16px", marginBottom: 10, borderLeft: `5px solid ${feito(c) ? (termoFinal(c) ? "var(--st-concluida)" : "var(--warn)") : conf[1]}` }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        {ref && <CaixaData slot={ref.slot} hj={hj} />}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, fontSize: 15, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{c.cliente}
            <span style={{ fontWeight: 700, fontSize: 12.5, padding: "1px 8px", borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--line)" }}>Venda {c.pedido}</span>
            {cidade(c) && <span style={{ fontWeight: 800, fontSize: 12.5, padding: "1px 9px", borderRadius: 6, background: "#0f5f8a", color: "#fff" }}>📍 {cidade(c)}</span>}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 3, display: "flex", gap: "3px 14px", flexWrap: "wrap" }}>
            {c.vendedor && <span><span style={{ color: "var(--ink-faint)" }}>Vendedor</span> {cap(c.vendedor)}</span>}
            {c.medidor && <span><span style={{ color: "var(--ink-faint)" }}>Medidor</span> {cap(c.medidor)}</span>}
            {tels.length > 0 && <span><span style={{ color: "var(--ink-faint)" }}>Tel.</span> {tels.join(" / ")}</span>}
            {ref && <span><span style={{ color: "var(--ink-faint)" }}>Duração</span> {ref.dur >= 60 ? Math.floor(ref.dur / 60) + "h" + (ref.dur % 60 ? String(ref.dur % 60).padStart(2, "0") : "") : ref.dur + "min"}</span>}
          </div>
          <div style={{ fontSize: 12.5, marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {!feito(c) && <span className="pill" style={{ background: conf[1], color: "#fff", fontWeight: 700 }}>{conf[0]}</span>}
            {ref && ref.total > 1 && <span className="pill" title={ds.map(d => fmtDateTime(d.slot)).join("\n")}>📆 dia {ref.n} de {ref.total}</span>}
            {c.encaixe && <span className="pill" style={{ background: "var(--danger)", color: "#fff", fontWeight: 800 }}>⚠️ ENCAIXE</span>}
            {c.medidaId && <span className="pill">{c.medidaOk ? "📐 medidas conferidas" : "📐 aguardando Medidas"}</span>}
            {c.minhaVisita && <span className="pill" title="O consultor já esteve no local (medidas feitas na visita)">🏠 Minha Visita</span>}
            {feito(c) && <span className="pill" style={{ background: "var(--st-concluida)", color: "#fff", fontWeight: 700 }}>✅ Realizado{c.realizadoEm ? " " + fmtDate(String(c.realizadoEm).slice(0, 10)) : ""}</span>}
            {t && (termoFinal(c) ? <span className="pill" style={{ fontWeight: 700 }}>📄 Termo · {(t.ambientes || []).length} ambiente(s)</span>
              : <span className="pill" style={{ background: "var(--warn)", color: "#fff", fontWeight: 700 }}>📝 Rascunho salvo {t.salvoEm ? fmtDateTime(t.salvoEm) : ""}</span>)}
            {feito(c) && !termoFinal(c) && <span className="pill" style={{ background: "var(--warn)", color: "#fff", fontWeight: 700 }}>falta o termo</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 340 }}>
          <button className="btn primary sm" onClick={onAbrir}>{termoFinal(c) ? "✏️ Ver / corrigir checklist" : t ? "📋 Continuar checklist" : "📋 Fazer checklist"}</button>
          {t && (t.ambientes || []).length > 0 && <button className="btn sm" onClick={onTermo}>🖨 Termo</button>}
          {tels[0] && <button className="btn sm" style={{ background: "var(--wa)", color: "#fff", borderColor: "var(--wa)" }} onClick={() => abrirWhats("https://wa.me/" + sanitizeWhats(tels[0]))}>💬 WhatsApp</button>}
        </div>
      </div>
    </div>
  );
}

// ---------------- o checklist do cliente ----------------
type Amb = AmbTermo & { _k: string };
const novaChave = () => Math.random().toString(36).slice(2, 9);

function FazerChecklist({ c, proj, onVoltar }: { c: any; proj: string; onVoltar: () => void }) {
  const { toast } = useApp() as any;
  const t0 = c.termo || {};
  const [ambs, setAmbs] = useState<Amb[]>(() => (t0.ambientes || []).map((a: AmbTermo) => ({ ...a, _k: novaChave() })));
  const [naoInc, setNaoInc] = useState<string[]>(t0.naoInclusos || NAO_INCLUSOS_PADRAO);
  const [outroNI, setOutroNI] = useState("");
  const [obs, setObs] = useState<string>(t0.obs || "");
  const [ferragens, setFerragens] = useState<string[]>(t0.ferragens || []);
  const [arquivos, setArquivos] = useState<string[]>(t0.arquivos || []);
  const [meta, setMeta] = useState<any>(t0.listagem || {});
  const [avisos, setAvisos] = useState<string[]>([]);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mudou, setMudou] = useState(false);
  const arq = useRef<HTMLInputElement>(null);
  const fim = termoFinal(c);

  const set = (k: string, fn: (a: Amb) => Amb) => { setAmbs(xs => xs.map(a => (a._k === k ? fn(a) : a))); setMudou(true); };

  async function lerArquivos(fs: FileList | null) {
    const files = Array.from(fs || []).filter(f => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!files.length) { toast("Escolha o PDF da listagem do Promob"); return; }
    setLendo(true);
    const novosAv: string[] = [];
    try {
      for (const f of files) {
        let l: Listagem;
        try { l = await lerListagemArquivo(await f.arrayBuffer()); }
        catch (e: any) { novosAv.push(f.name + ": não consegui abrir o PDF (" + (e?.message || "erro") + ")"); continue; }
        l.avisos.forEach(a => novosAv.push(f.name + ": " + a));
        if (l.cliente && !semAcento(l.cliente).includes(semAcento(primeiroNome(c.cliente))) && !semAcento(c.cliente).includes(semAcento(primeiroNome(l.cliente))))
          novosAv.push(`${f.name}: a listagem é de “${l.cliente}”, e o checklist é de “${c.cliente}” — confira se é o arquivo certo.`);
        if (!l.linhas.length) continue;
        const nome = l.projeto || f.name.replace(/\.pdf$/i, "");
        const a = ambienteDaListagem(nome, l.linhas, l);
        setAmbs(xs => [...xs, { ...a, conferir: conferirAmb(a), _k: novaChave() }]);
        setFerragens(xs => [...new Set([...xs, ...l.resumo.ferragens])]);
        setArquivos(xs => [...new Set([...xs, f.name])]);
        setMeta((m: any) => ({ cliente: m.cliente || l.cliente, projeto: [m.projeto, l.projeto].filter(Boolean).join(" · "), data: m.data || l.data }));
        toast(`${f.name}: ${l.resumo.modulos} módulos e ${l.resumo.pecas} peças lidos (sem valores)`);
      }
      setMudou(true);
    } finally { setAvisos(novosAv); setLendo(false); if (arq.current) arq.current.value = ""; }
  }

  const moverItem = (de: string, item: LinhaListagem, para: string) => {
    if (de === para) return;
    setAmbs(xs => xs.map(a => a._k === de ? { ...a, itens: a.itens.filter(i => i !== item) } : a._k === para ? { ...a, itens: [...a.itens, item].sort((x, y) => x.item - y.item) } : a));
    setMudou(true);
  };
  const dados = () => ({
    ambientes: ambs.map(({ _k, ...a }) => ({ ...a, nome: a.nome.trim(), conferir: conferirAmb(a) })),
    naoInclusos: naoInc, obs, ferragens, arquivos, listagem: meta,
  });
  async function salvar(finalizar: boolean) {
    if (finalizar) {
      if (!ambs.length) { toast("Anexe a listagem do Promob (ou inclua os ambientes) antes de finalizar"); return; }
      if (ambs.some(a => !a.nome.trim())) { toast("Dê nome a todos os ambientes"); return; }
      const falta = ambs.map(a => [a.nome, conferirAmb(a)] as const).filter(([, x]) => x.length);
      const msg = (falta.length ? "Ainda falta conferir:\n" + falta.map(([n, x]) => "• " + n + ": " + x.join(", ")).join("\n") + "\n\n" : "")
        + "Finalizar o checklist de " + c.cliente + "? Ele passa para Realizado e o termo fica salvo na venda " + c.pedido + ".";
      if (!confirm(msg)) return;
    }
    setSalvando(true);
    try {
      await A.ckProjetistaSalvar(c.id, dados(), finalizar);
      setMudou(false);
      toast(finalizar ? "Checklist finalizado ✅" : "Rascunho salvo");
      if (finalizar) { abrirTermo(c, { ...dados(), finalizadoEm: new Date().toISOString() }, proj, toast); onVoltar(); }
    } catch (e: any) { toast(e.message || "Não foi possível salvar"); }
    finally { setSalvando(false); }
  }
  const voltar = () => { if (mudou && !confirm("Sair sem salvar? O que foi preenchido agora se perde.")) return; onVoltar(); };

  const ds = diasDoProj(c, proj);
  return (
    <section className="view active" id="view-projetista-ck-fazer">
      <div className="view-head"><div>
        <button className="btn ghost sm" onClick={voltar} style={{ marginBottom: 6 }}>← Voltar para a agenda</button>
        <h2>Checklist · {c.cliente}</h2>
        <p>Venda <b>{c.pedido}</b>{ds.length ? " · " + ds.map(d => fmtDateTime(d.slot)).join(" + ") : ""}{cidade(c) ? " · 📍 " + cidade(c) : ""}{c.vendedor ? " · vendedor " + cap(c.vendedor) : ""}
          {fim && <> · <b style={{ color: "var(--st-concluida)" }}>finalizado em {fmtDateTime(t0.finalizadoEm)}{t0.finalizadoPor ? " por " + t0.finalizadoPor : ""}</b></>}</p></div></div>

      <div className="card" style={{ padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>1 · Listagem do Promob</div>
        <div className="hint" style={{ marginBottom: 10 }}>Anexe o PDF da listagem/orçamento de cada ambiente (pode escolher vários de uma vez). O 360 lê só o que serve para o checklist: material, espessura, cores, módulos e medidas. <b>Preços, descontos e condições de pagamento são descartados</b> e o PDF não fica salvo.</div>
        <input ref={arq} type="file" accept=".pdf,application/pdf" multiple style={{ display: "none" }} onChange={e => lerArquivos(e.target.files)} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn primary sm" disabled={lendo} onClick={() => arq.current?.click()}>{lendo ? "Lendo a listagem…" : "📎 Anexar listagem (PDF)"}</button>
          <button className="btn sm" onClick={() => { setAmbs(xs => [...xs, { nome: "", caixa: { mat: null, esp: null }, porta: { mat: null, esp: null, vidro: false }, cor: "", itens: [], conferir: [], _k: novaChave() }]); setMudou(true); }}>＋ Ambiente sem listagem</button>
          {arquivos.length > 0 && <span className="hint">Lidos: {arquivos.join(", ")}</span>}
        </div>
        {avisos.length > 0 && <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "var(--st-tratativa-bg)", border: "1px solid var(--warn)", fontSize: 13 }}>
          {avisos.map((a, i) => <div key={i}>⚠️ {a}</div>)}</div>}
      </div>

      {ambs.map((a, i) => <CartaoAmbiente key={a._k} a={a} i={i} todos={ambs} set={fn => set(a._k, fn)} mover={(item, para) => moverItem(a._k, item, para)}
        remover={() => { if (confirm(`Remover o ambiente “${a.nome || i + 1}”${a.itens.length ? " e os " + a.itens.length + " itens dele" : ""}?`)) { setAmbs(xs => xs.filter(x => x._k !== a._k)); setMudou(true); } }} />)}

      <div className="card" style={{ padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{ambs.length + 2} · Não inclusos e observações</div>
        <div className="field"><label>Não estão inclusos <span className="hint">(vai no termo — o cliente assinala)</span></label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[...new Set([...NAO_INCLUSOS_OPCOES, ...naoInc])].map(n => { const on = naoInc.includes(n); return <button key={n} type="button" className="pill" onClick={() => { setNaoInc(xs => on ? xs.filter(x => x !== n) : [...xs, n]); setMudou(true); }}
              style={{ cursor: "pointer", border: on ? "1px solid var(--primary)" : "1px dashed var(--line)", background: on ? "var(--primary)" : "var(--surface-2)", color: on ? "#fff" : "var(--ink-soft)", fontWeight: on ? 700 : 500 }}>{on ? "✓ " : "＋ "}{n}</button>; })}
            <span style={{ display: "inline-flex", gap: 4 }}><input value={outroNI} onChange={e => setOutroNI(e.target.value)} placeholder="Outro…" style={{ width: 140, padding: "3px 8px" }}
              onKeyDown={e => { if (e.key === "Enter" && outroNI.trim()) { setNaoInc(xs => [...new Set([...xs, outroNI.trim()])]); setOutroNI(""); setMudou(true); } }} />
              <button type="button" className="btn ghost sm" disabled={!outroNI.trim()} onClick={() => { setNaoInc(xs => [...new Set([...xs, outroNI.trim()])]); setOutroNI(""); setMudou(true); }}>＋</button></span>
          </div></div>
        {ferragens.length > 0 && <div className="field" style={{ marginTop: 10 }}><label>Ferragens da listagem <span className="hint">(vão nas observações do termo · clique para tirar)</span></label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{ferragens.map(f => <button key={f} type="button" className="pill" style={{ cursor: "pointer" }} onClick={() => { setFerragens(xs => xs.filter(x => x !== f)); setMudou(true); }}>{f} ✕</button>)}</div></div>}
        <div className="field" style={{ marginTop: 10 }}><label>Observações do checklist</label>
          <textarea rows={3} value={obs} onChange={e => { setObs(e.target.value); setMudou(true); }} placeholder="Ex.: cliente vai trocar o puxador da cozinha; tomada da lavanderia muda de lugar; granito por conta do cliente…" /></div>
      </div>

      <div className="card" style={{ padding: "12px 16px", position: "sticky", bottom: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", boxShadow: "0 4px 18px rgba(0,0,0,.12)" }}>
        <button className="btn sm" disabled={salvando} onClick={() => salvar(false)}>💾 Salvar rascunho</button>
        <button className="btn sm" disabled={!ambs.length} onClick={() => abrirTermo(c, dados(), proj, toast)}>🖨 Ver / imprimir termo</button>
        <button className="btn primary sm" disabled={salvando || !ambs.length} onClick={() => salvar(true)}>{salvando ? "Salvando…" : fim ? "✅ Salvar correção do termo" : "✅ Finalizar checklist"}</button>
        <span className="hint" style={{ marginLeft: "auto" }}>{mudou ? "Alterações não salvas" : t0.salvoEm ? "Salvo em " + fmtDateTime(t0.salvoEm) + (t0.salvoPor ? " · " + t0.salvoPor : "") : ""}</span>
      </div>
    </section>
  );
}

function SelMat({ v, on }: { v: Mat; on: (m: Mat) => void }) {
  return <select value={v || ""} onChange={e => on((e.target.value || null) as Mat)} style={{ width: 90 }}><option value="">—</option><option value="MDP">MDP</option><option value="MDF">MDF</option></select>;
}
function SelEsp({ v, on }: { v: number | null; on: (n: number | null) => void }) {
  return <select value={v ?? ""} onChange={e => on(e.target.value ? Number(e.target.value) : null)} style={{ width: 90 }}><option value="">—</option>
    {[...new Set([...ESPESSURAS, ...(v ? [v] : [])])].sort((a, b) => a - b).map(n => <option key={n} value={n}>{n} mm</option>)}</select>;
}

function CartaoAmbiente({ a, i, todos, set, mover, remover }: { a: Amb; i: number; todos: Amb[]; set: (fn: (a: Amb) => Amb) => void; mover: (item: LinhaListagem, para: string) => void; remover: () => void }) {
  const [verItens, setVerItens] = useState(false);
  const falta = conferirAmb(a);
  const visiveis = a.itens.filter(l => l.tipo !== "consumivel");
  const cores = [...new Set(a.itens.filter(l => l.cor && l.tipo !== "consumivel").map(l => `cód. ${l.cor}${l.acabamento ? " (" + l.acabamento + ")" : ""}`))];
  const lbl: CSSProperties = { fontSize: 11.5, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: .4, fontWeight: 700 };
  return (
    <div className="card" style={{ padding: "14px 16px", marginBottom: 12, borderLeft: `5px solid ${falta.length ? "var(--warn)" : "var(--st-concluida)"}` }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <b>{i + 2} · Ambiente</b>
        <input value={a.nome} onChange={e => set(x => ({ ...x, nome: e.target.value }))} placeholder="Nome do ambiente (ex.: Cozinha)" style={{ flex: 1, minWidth: 180, fontWeight: 700 }} />
        <span className="hint">{visiveis.length} itens{a.itens.length - visiveis.length ? " · " + (a.itens.length - visiveis.length) + " consumíveis (fora do termo)" : ""}</span>
        <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={remover} title="Remover ambiente">🗑</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
        <div><div style={lbl}>Caixas / corpo</div>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}><SelMat v={a.caixa.mat} on={m => set(x => ({ ...x, caixa: { ...x.caixa, mat: m } }))} /><SelEsp v={a.caixa.esp} on={n => set(x => ({ ...x, caixa: { ...x.caixa, esp: n } }))} /></div></div>
        <div><div style={lbl}>Portas / frentes</div>
          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
            {!a.porta.naoSeAplica && <><SelMat v={a.porta.mat} on={m => set(x => ({ ...x, porta: { ...x.porta, mat: m } }))} /><SelEsp v={a.porta.esp} on={n => set(x => ({ ...x, porta: { ...x.porta, esp: n } }))} />
              <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 13 }}><input type="checkbox" style={{ width: "auto" }} checked={!!a.porta.vidro} onChange={e => set(x => ({ ...x, porta: { ...x.porta, vidro: e.target.checked } }))} /> vidro</label></>}
            <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 13 }}><input type="checkbox" style={{ width: "auto" }} checked={!!a.porta.naoSeAplica} onChange={e => set(x => ({ ...x, porta: { ...x.porta, naoSeAplica: e.target.checked } }))} /> sem portas</label>
          </div></div>
        <div><div style={lbl}>Cor / padrão</div>
          <input value={a.cor} onChange={e => set(x => ({ ...x, cor: e.target.value }))} placeholder="Ex.: caixas Legno Crema · portas Jade" style={{ marginTop: 4, width: "100%" }} />
          {cores.length > 0 && <div className="hint" style={{ marginTop: 3 }}>Na listagem: {cores.join(" · ")} — escreva o nome da cor que o cliente escolheu.</div>}</div>
      </div>
      {falta.length > 0 && <div style={{ marginTop: 8, fontSize: 12.5, color: "#8a5d00", fontWeight: 600 }}>⚠️ Conferir com o cliente: {falta.join(", ")}</div>}
      {visiveis.length > 0 && <div style={{ marginTop: 10 }}>
        <button className="btn ghost sm" onClick={() => setVerItens(v => !v)}>{verItens ? "▾ Esconder itens" : "▸ Ver os " + visiveis.length + " itens (módulos e peças)"}</button>
        {verItens && <div style={{ overflowX: "auto", marginTop: 6 }}><table className="tabela" style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
          <thead><tr style={{ textAlign: "left", color: "var(--ink-faint)" }}><th style={{ padding: "4px 6px" }}>Item</th><th>Qtd</th><th>Descrição</th><th>Medidas (L × A × P)</th><th>Mat.</th><th>Cor</th>{todos.length > 1 && <th>Ambiente</th>}</tr></thead>
          <tbody>{visiveis.map((l, j) => <tr key={l.item + "-" + j} style={{ borderTop: "1px solid var(--line-soft)" }}>
            <td style={{ padding: "4px 6px", color: "var(--ink-faint)" }}>{l.item}</td><td>{l.qtd}</td><td>{l.descricao}</td><td style={{ whiteSpace: "nowrap" }}>{l.medidas}</td>
            <td>{[l.material, l.espessura ? l.espessura + "mm" : ""].filter(Boolean).join(" ")}</td><td>{l.cor ? "cód. " + l.cor : ""}</td>
            {todos.length > 1 && <td><select value={a._k} onChange={e => mover(l, e.target.value)} style={{ padding: "2px 4px", fontSize: 12 }}>{todos.map((t, k) => <option key={t._k} value={t._k}>{t.nome || "Ambiente " + (k + 1)}</option>)}</select></td>}
          </tr>)}</tbody></table></div>}
      </div>}
    </div>
  );
}
