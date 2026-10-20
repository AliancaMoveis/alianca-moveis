// Cruzamento com as visitas dos consultores feitas no ALIANÇA 360 (substitui aos poucos o Minha Visita):
// para cada cliente de medida / checklist, procura pelo telefone (8 últimos dígitos), CPF ou nome o cliente do marketing
// que o consultor visitou, e mostra as fotos/planta que ele anexou.
import { useState } from "react";
import { useApp } from "../estado";
import { Modal } from "./Modal";
import { fmtDate } from "../lib/regras";
import { baixarFotosZip } from "./Overlays";

const so = (s: string) => (s || "").replace(/\D/g, "");
const chaveTel = (s: string) => { const d = so(s); return d.length >= 8 ? d.slice(-8) : ""; };
const nomeK = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s*[-–(].*$/, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const imgs = (c: any) => (c.anexos || []).filter((a: any) => a.tipo === "img");
const arqs = (c: any) => (c.anexos || []).filter((a: any) => a.tipo !== "img");

/** clientes do marketing visitados pelo consultor (visita realizada ou com anexos) */
export function visitados360(R: any, st: any) {
  return st.chamados.filter((c: any) => R.domMarketing(c) && c.consultorId && ((c.tratativa && c.tratativa.realizada) || (c.anexos || []).length > 0));
}

let cacheK = ""; let cacheIdx: { tel: Record<string, any[]>; doc: Record<string, any[]>; nome: Record<string, any[]> } | null = null;
function indice(R: any, st: any) {
  const k = st.chamados.length + ":" + (st.chamados[0]?.id || "");
  if (cacheIdx && cacheK === k) return cacheIdx;
  const idx = { tel: {} as Record<string, any[]>, doc: {} as Record<string, any[]>, nome: {} as Record<string, any[]> };
  const add = (m: Record<string, any[]>, key: string, c: any) => { if (key) (m[key] = m[key] || []).push(c); };
  visitados360(R, st).forEach((c: any) => {
    String(c.telefone || "").split(/[\/,;]| e /).forEach((t: string) => add(idx.tel, chaveTel(t), c));
    const d = so(c.clienteDoc || ""); if (d.length >= 11) add(idx.doc, d, c);
    const n = nomeK(c.cliente); if (n.split(" ").length >= 2) add(idx.nome, n, c);
  });
  cacheK = k; cacheIdx = idx; return idx;
}

/** visitas do consultor (360) que batem com este cliente de medida/checklist */
export function achar360(R: any, st: any, c: any): any[] {
  if (!c) return [];
  const idx = indice(R, st); const out = new Map<string, any>();
  String(c.telefone || "").split(/[\/,;]| e /).forEach((t: string) => (idx.tel[chaveTel(t)] || []).forEach(x => out.set(x.id, x)));
  const d = so(c.clienteDoc || ""); if (d.length >= 11) (idx.doc[d] || []).forEach(x => out.set(x.id, x));
  const n = nomeK(c.cliente); if (n.split(" ").length >= 2) (idx.nome[n] || []).forEach(x => out.set(x.id, x));
  out.delete(c.id);
  return Array.from(out.values()).sort((a, b) => imgs(b).length - imgs(a).length);
}

/** selo na linha: "📷 Consultor 360 · 6 fotos" — clica e abre as imagens */
export function Selo360({ c, lista }: { c?: any; lista?: any[] }) {
  const { R, st, setModal } = useApp() as any;
  const m = lista || achar360(R, st, c);
  if (!m.length) return null;
  const nImg = m.reduce((s: number, x: any) => s + imgs(x).length, 0);
  return <span className="pill sel360" title="Cliente visitado por consultor no ALIANÇA 360 — clique para ver as imagens"
    onClick={e => { e.stopPropagation(); setModal(<Galeria360 lista={m} titulo={c ? c.cliente : m[0].cliente} />); }}>
    📷 Visita do consultor (antes da venda){nImg ? " · " + nImg + " foto" + (nImg > 1 ? "s" : "") : " · sem fotos"}</span>;
}

export function Galeria360({ lista, titulo }: { lista: any[]; titulo: string }) {
  const { R, setModal, abrirDetalhe, toast } = useApp() as any;
  const [grande, setGrande] = useState(""); const [zip, setZip] = useState(false);
  const total = lista.reduce((s: number, v: any) => s + (v.anexos || []).length, 0);
  const baixar = async () => { setZip(true);
    try { const r = await baixarFotosZip(titulo + " - fotos consultor", lista.map((v: any) => ({ pasta: v.cliente + " " + v.id, anexos: v.anexos || [] })));
      toast(r.n + " arquivo(s) baixado(s)" + (r.falhas.length ? " · " + r.falhas.length + " não baixaram" : "") + " — é só salvar no cliente do Exact"); }
    catch (e: any) { toast(e.message || "Não foi possível baixar"); } finally { setZip(false); } };
  const fechar = () => setModal(null);
  return (
    <Modal titulo={"📷 Visita do consultor · " + titulo} onFechar={fechar}>
      <div className="hint" style={{ marginBottom: 8 }}>Visita feita pelo consultor <b>antes da venda</b>, registrada no ALIANÇA 360.</div>
      {total > 0 && <button className="btn primary" style={{ marginBottom: 12 }} disabled={zip} onClick={baixar}>{zip ? "Preparando…" : "⬇ Baixar todas as fotos e arquivos (" + total + ") — para o Exact"}</button>}
      {lista.map((v: any) => { const t = v.tratativa || {}; return (
        <div key={v.id} className="g360">
          <div className="g360-h"><b>{v.cliente}</b> <span className="pill">{v.id}</span>
            <small>consultor {R.nomeUser(v.consultorId)}{v.dataVisita ? " · visita " + fmtDate(v.dataVisita) : ""}{v.telefone ? " · " + v.telefone : ""}{v.produto ? " · " + v.produto : ""}</small></div>
          {t.medidas && <div className="g360-t"><b>Medidas anotadas:</b> {t.medidas}</div>}
          {t.obs && <div className="g360-t"><b>Obs. do consultor:</b> {t.obs}</div>}
          {imgs(v).length ? <div className="g360-fotos">{imgs(v).map((a: any) => <img key={a.id} src={a.url} alt={a.nome} loading="lazy" onClick={() => setGrande(a.url)} />)}</div>
            : <div className="hint">Nenhuma foto anexada nesta visita.</div>}
          {arqs(v).length > 0 && <div className="g360-arqs">{arqs(v).map((a: any) => <a key={a.id} href={a.url} target="_blank" rel="noopener">{a.tipo === "pdf" ? "📄" : a.tipo === "video" ? "🎬" : "🔗"} {a.nome || "arquivo"}</a>)}</div>}
          <button className="btn ghost sm" onClick={() => { fechar(); abrirDetalhe(v.id); }}>Abrir a ficha do cliente</button>
        </div>); })}
      {grande && <div className="overlay on" style={{ zIndex: 400 }} onMouseDown={() => setGrande("")}><img src={grande} alt="" style={{ maxWidth: "94vw", maxHeight: "92vh", borderRadius: 8, margin: "auto" }} /></div>}
    </Modal>
  );
}
