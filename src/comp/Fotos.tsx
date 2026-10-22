// 🖼 Visualizador de fotos em tela cheia: passar para o lado (setas, teclado, arrastar), zoom (roda do mouse, botões,
// duplo clique, pinça no celular), arrastar a foto ampliada, girar, baixar e miniaturas. Aceita ações extras (ex.: Aprovar).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { urlAnexo } from "../lib/dados";
import { baixarFotosZip, blobDe, salvarBlob } from "./Overlays";

export type Foto = { url: string; nome?: string; path?: string; storage_path?: string; legenda?: string };

/** ⬇ todas as fotos de uma vez: no celular abre o "compartilhar" com todas (salvar na galeria / enviar); no computador baixa um .zip */
export async function baixarTodasFotos(fotos: Foto[], nome = "fotos"): Promise<string> {
  const lista = fotos.map((x, k) => ({ ...x, path: x.path || x.storage_path, nome: x.nome || "foto-" + (k + 1) + ".jpg" }));
  try {
    const nav: any = navigator; const celular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (celular && nav.canShare) {
      const arqs: File[] = [];
      for (const x of lista) { try { const b = await blobDe(x); arqs.push(new File([b], /\.\w{2,4}$/.test(x.nome) ? x.nome : x.nome + ".jpg", { type: b.type || "image/jpeg" })); } catch { /* pula */ } }
      if (arqs.length && nav.canShare({ files: arqs })) { await nav.share({ files: arqs, title: "Fotos" }); return arqs.length + " foto(s)"; }
    }
    const r = await baixarFotosZip(nome, [{ pasta: "fotos", anexos: lista }]);
    return r.n + " foto(s) no .zip" + (r.falhas.length ? " · " + r.falhas.length + " não baixaram" : "");
  } catch (e: any) { return e?.name === "AbortError" ? "" : "Não consegui baixar todas"; }
}

export function FotoViewer({ fotos, inicio = 0, onFechar, acoes }: { fotos: Foto[]; inicio?: number; onFechar: () => void; acoes?: ReactNode }) {
  const [i, setI] = useState(Math.min(Math.max(0, inicio), Math.max(0, fotos.length - 1)));
  const [z, setZ] = useState({ s: 1, x: 0, y: 0, r: 0 });
  const [url, setUrl] = useState<Record<number, string>>({});
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const ini = useRef<{ d: number; s: number; x: number; y: number; px: number; py: number; moveu: boolean } | null>(null);
  const tiras = useRef<HTMLDivElement>(null);
  const f = fotos[i] || { url: "" };
  const reset = () => setZ(v => ({ s: 1, x: 0, y: 0, r: v.r }));
  const ir = (d: number) => { if (fotos.length < 2) return; setI(x => (x + d + fotos.length) % fotos.length); setZ({ s: 1, x: 0, y: 0, r: 0 }); };
  const zoom = (fator: number) => setZ(v => { const s = Math.min(8, Math.max(1, v.s * fator)); return s === 1 ? { ...v, s: 1, x: 0, y: 0 } : { ...v, s, x: v.x * s / v.s, y: v.y * s / v.s }; });
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") ir(1); else if (e.key === "ArrowLeft") ir(-1); else if (e.key === "Escape") onFechar();
      else if (e.key === "+" || e.key === "=") zoom(1.4); else if (e.key === "-") zoom(1 / 1.4); else if (e.key === "0") reset();
    };
    document.addEventListener("keydown", k); const ov = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = ov; };
  }, [fotos.length]);
  useEffect(() => { const el = tiras.current?.children[i] as HTMLElement | undefined; el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }, [i]);
  // link vencido: pede um novo para o arquivo
  const falhou = async () => { const p = f.path || f.storage_path; if (!p || url[i]) return; try { const u = await urlAnexo(p); if (u) setUrl(m => ({ ...m, [i]: u })); } catch { /* fica sem */ } };
  const src = url[i] || f.url;

  const down = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const l = Array.from(pts.current.values());
    ini.current = { d: l.length === 2 ? Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y) : 0, s: z.s, x: z.x, y: z.y, px: e.clientX, py: e.clientY, moveu: false };
  };
  const move = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !ini.current) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const l = Array.from(pts.current.values()), o = ini.current;
    if (l.length === 2 && o.d) { const d = Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y); const s = Math.min(8, Math.max(1, o.s * d / o.d)); o.moveu = true; setZ(v => ({ ...v, s, ...(s === 1 ? { x: 0, y: 0 } : {}) })); return; }
    const dx = e.clientX - o.px, dy = e.clientY - o.py;
    if (Math.abs(dx) + Math.abs(dy) > 6) o.moveu = true;
    if (z.s > 1) setZ(v => ({ ...v, x: o.x + dx, y: o.y + dy }));
  };
  const up = (e: React.PointerEvent) => {
    const o = ini.current; pts.current.delete(e.pointerId);
    if (o && z.s === 1 && pts.current.size === 0) { const dx = e.clientX - o.px; if (Math.abs(dx) > 50 && !o.d) ir(dx < 0 ? 1 : -1); }
    if (pts.current.size === 0) ini.current = null;
  };
  const baixar = async () => { try { salvarBlob(await blobDe({ ...f, url: src, path: f.path || f.storage_path }), f.nome || "foto-" + (i + 1) + ".jpg"); } catch { /* sem rede */ } };
  const [todas, setTodas] = useState(false); const [msgT, setMsgT] = useState("");
  const baixarTodas = async () => { setTodas(true); setMsgT(""); try { setMsgT(await baixarTodasFotos(fotos)); } finally { setTodas(false); } };
  if (!fotos.length) return null;
  return createPortal(<div className="fv" role="dialog" aria-label="Fotos">
    <div className="fv-top">
      <span className="fv-cont">{i + 1} / {fotos.length}{f.legenda ? " · " + f.legenda : ""}{msgT ? " · " + msgT : ""}</span>
      <span className="fv-bts">
        <button type="button" onClick={() => zoom(1 / 1.4)} aria-label="Diminuir zoom" title="Diminuir (−)">−</button>
        <b className="fv-pct">{Math.round(z.s * 100)}%</b>
        <button type="button" onClick={() => zoom(1.4)} aria-label="Aumentar zoom" title="Aumentar (+)">+</button>
        <button type="button" onClick={reset} title="Tamanho normal (0)">⤢</button>
        <button type="button" onClick={() => setZ(v => ({ ...v, r: (v.r + 90) % 360 }))} title="Girar">↻</button>
        <button type="button" onClick={baixar} title="Baixar esta foto">⬇</button>
        {fotos.length > 1 && <button type="button" className="fv-todas" onClick={baixarTodas} disabled={todas} title="Baixar todas as fotos de uma vez">{todas ? "…" : "⬇ Todas (" + fotos.length + ")"}</button>}
        <button type="button" className="fv-x" onClick={onFechar} aria-label="Fechar" title="Fechar (Esc)">✕</button>
      </span>
    </div>
    {acoes && <div className="fv-acoes">{acoes}</div>}
    <div className="fv-palco" onWheel={e => zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15)} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onDoubleClick={() => (z.s > 1 ? reset() : setZ(v => ({ ...v, s: 2.5 })))} style={{ cursor: z.s > 1 ? "grab" : "zoom-in" }}>
      <img src={src} alt={f.nome || "foto"} draggable={false} onError={falhou}
        style={{ transform: `translate(${z.x}px, ${z.y}px) scale(${z.s}) rotate(${z.r}deg)`, transition: ini.current ? "none" : "transform .15s" }} />
      {fotos.length > 1 && <>
        <button type="button" className="fv-seta esq" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); ir(-1); }} aria-label="Foto anterior">‹</button>
        <button type="button" className="fv-seta dir" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); ir(1); }} aria-label="Próxima foto">›</button></>}
    </div>
    {fotos.length > 1 && <div className="fv-tiras" ref={tiras}>{fotos.map((x, k) => <img key={k} src={url[k] || x.url} alt="" className={k === i ? "on" : ""} onClick={() => { setI(k); setZ({ s: 1, x: 0, y: 0, r: 0 }); }} loading="lazy" />)}</div>}
    <div className="fv-dica">Arraste ou use ← → para passar · roda do mouse, + / − ou pinça para zoom · duplo clique amplia</div>
  </div>, document.body);
}
