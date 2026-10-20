// Cruzamento com as visitas dos consultores feitas no ALIANÇA 360 (substitui aos poucos o Minha Visita):
// para cada cliente de medida / checklist, procura pelo telefone (8 últimos dígitos), CPF ou nome o cliente do marketing
// que o consultor visitou, e mostra as fotos/planta que ele anexou.
import { useState } from "react";
import { useApp } from "../estado";
import { Modal } from "./Modal";
import { fmtDate } from "../lib/regras";
import { baixarFotosZip } from "./Overlays";
import { FotoViewer } from "./Fotos";
import { A } from "../lib/acoes";

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

/** selo na linha: "📷 Visita do consultor · 6 fotos" — clica e abre as imagens (com aprovar, quando vem de uma medida) */
export function Selo360({ c, lista }: { c?: any; lista?: any[] }) {
  const { R, st, setModal } = useApp() as any;
  const m = lista || achar360(R, st, c);
  if (!m.length) return null;
  const nImg = m.reduce((s: number, x: any) => s + imgs(x).length, 0);
  return <span className="pill sel360" title="Cliente visitado por consultor no ALIANÇA 360 — clique para ver as fotos"
    onClick={e => { e.stopPropagation(); setModal(<Galeria360 lista={m} titulo={c ? c.cliente : m[0].cliente} medida={c && c.tipo === "medidas" ? c : undefined} />); }}>
    📷 Visita do consultor (antes da venda){nImg ? " · " + nImg + " foto" + (nImg > 1 ? "s" : "") : " · sem fotos"}</span>;
}

/** botão de aprovar a medida (Supervisão de Medidas): em análise aprova a medida; pendente/aguardando medição aprova pelas fotos da visita */
export function AprovarMedida({ medida, visita, depois }: { medida: any; visita?: any; depois?: () => void }) {
  const { R, st, executar: ex } = useApp() as any;
  const atual = st.chamados.find((x: any) => x.id === medida.id) || medida;
  const etapa = R.etapaMedida(atual);
  if (!R.ehSupMedidas() || ["liberada", "em_obra"].includes(etapa)) return etapa === "liberada" ? <span className="pill" style={{ background: "var(--st-concluida)", color: "#fff" }}>✔ Medida aprovada</span> : null;
  const analise = ["validar", "realizada"].includes(etapa);
  if (!analise && !(visita && imgs(visita).length + arqs(visita).length)) return null;
  const ok = async () => {
    const txt = analise ? "Aprovar a medida de " + atual.cliente + " (venda " + (atual.pedido || "—") + ") como medida oficial?"
      : "Aprovar a medida de " + atual.cliente + " usando as fotos da visita do consultor " + R.nomeUser(visita.consultorId) + " (antes da venda)?" + (etapa === "agendada" ? "\n\nA medição que estava agendada deixa de ser necessária." : "");
    if (!confirm(txt)) return;
    if (await ex(() => analise ? A.medidaLiberar(atual.id, "") : A.medidaAprovarVisita360(atual.id, visita.id), "Medida aprovada — medida oficial")) depois?.();
  };
  return <button type="button" className="btn primary" onClick={ok}>✅ {analise ? "Aprovar medida" : "Aprovar com estas fotos"}</button>;
}

export function Galeria360({ lista, titulo, medida }: { lista: any[]; titulo: string; medida?: any }) {
  const { R, setModal, abrirDetalhe, toast } = useApp() as any;
  const [ver, setVer] = useState<number | null>(null); const [zip, setZip] = useState(false);
  const total = lista.reduce((s: number, v: any) => s + (v.anexos || []).length, 0);
  // todas as fotos das visitas, em sequência, para passar de uma para outra
  const fotos = lista.flatMap((v: any) => imgs(v).map((a: any, k: number) => ({ ...a, legenda: v.cliente + " · consultor " + R.nomeUser(v.consultorId) + " · " + (k + 1) + "/" + imgs(v).length })));
  const idx = (v: any, a: any) => fotos.findIndex((f: any) => f.id === a.id);
  const melhor = lista[0];
  const baixar = async () => { setZip(true);
    try { const r = await baixarFotosZip(titulo + " - fotos consultor", lista.map((v: any) => ({ pasta: v.cliente + " " + v.id, anexos: v.anexos || [] })));
      toast(r.n + " arquivo(s) baixado(s)" + (r.falhas.length ? " · " + r.falhas.length + " não baixaram" : "") + " — é só salvar no cliente do Exact"); }
    catch (e: any) { toast(e.message || "Não foi possível baixar"); } finally { setZip(false); } };
  const fechar = () => setModal(null);
  const aprovar = medida ? <AprovarMedida medida={medida} visita={melhor} depois={fechar} /> : null;
  return (
    <Modal titulo={"📷 Visita do consultor · " + titulo} onFechar={fechar}>
      <div className="hint" style={{ marginBottom: 8 }}>Visita feita pelo consultor <b>antes da venda</b>, registrada no ALIANÇA 360. Toque numa foto para ver grande, passar para o lado e dar zoom.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {aprovar}
        {total > 0 && <button className="btn" disabled={zip} onClick={baixar}>{zip ? "Preparando…" : "⬇ Baixar todas (" + total + ") — para o Exact"}</button>}
        {medida && <button className="btn ghost" onClick={() => { fechar(); abrirDetalhe(medida.id); }}>Abrir a ficha da medida</button>}
      </div>
      {lista.map((v: any) => { const t = v.tratativa || {}; return (
        <div key={v.id} className="g360">
          <div className="g360-h"><b>{v.cliente}</b> <span className="pill">{v.id}</span>
            <small>consultor {R.nomeUser(v.consultorId)}{v.dataVisita ? " · visita " + fmtDate(v.dataVisita) : ""}{v.telefone ? " · " + v.telefone : ""}{v.produto ? " · " + v.produto : ""}</small></div>
          {t.medidas && <div className="g360-t"><b>Medidas anotadas:</b> {t.medidas}</div>}
          {t.obs && <div className="g360-t"><b>Obs. do consultor:</b> {t.obs}</div>}
          {imgs(v).length ? <div className="g360-fotos">{imgs(v).map((a: any) => <img key={a.id} src={a.url} alt={a.nome} loading="lazy" onClick={() => setVer(idx(v, a))} />)}</div>
            : <div className="hint">Nenhuma foto anexada nesta visita.</div>}
          {arqs(v).length > 0 && <div className="g360-arqs">{arqs(v).map((a: any) => <a key={a.id} href={a.url} target="_blank" rel="noopener">{a.tipo === "pdf" ? "📄" : a.tipo === "video" ? "🎬" : "🔗"} {a.nome || "arquivo"}</a>)}</div>}
          <button className="btn ghost sm" onClick={() => { fechar(); abrirDetalhe(v.id); }}>Abrir a ficha da visita</button>
        </div>); })}
      {ver !== null && <FotoViewer fotos={fotos} inicio={ver} onFechar={() => setVer(null)} acoes={aprovar} />}
    </Modal>
  );
}
