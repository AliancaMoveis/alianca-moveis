import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { useApp } from "../estado";
import { A } from "../lib/acoes";

async function blobDe(url: string) { const r = await fetch(url); return await r.blob(); }
function salvarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function Overlays({ lb, setLb, gal, setGal }: any) {
  const { st, toast, executar, openImg } = useApp();
  const tx = useRef<number | null>(null);
  const [zipando, setZipando] = useState(false);

  // lightbox com navegação (setas, teclado, swipe, clique nas metades)
  const mover = (d: number) => setLb((x: any) => x && { ...x, i: (x.i + d + x.lista.length) % x.lista.length });
  useEffect(() => {
    if (!lb) return;
    const k = (e: KeyboardEvent) => { if (e.key === "ArrowLeft") mover(-1); else if (e.key === "ArrowRight") mover(1); else if (e.key === "Escape") setLb(null); };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [!!lb]);

  const c = gal ? st.chamados.find((x: any) => x.id === gal.id) : null;
  const imgs = c ? (c.anexos || []).filter((a: any) => a.tipo === "img") : [];
  useEffect(() => { if (gal && !imgs.length) setGal(null); }, [gal, imgs.length]);

  async function baixarUm(a: any) {
    try { salvarBlob(await blobDe(a.url), a.nome || "anexo.jpg"); } catch { toast("Não foi possível baixar este anexo"); }
  }
  async function baixarZip() {
    try {
      setZipando(true);
      const zip = new JSZip();
      const nomePasta = (c.cliente || "cliente").replace(/[^\w\- ]+/g, "").trim() || "cliente";
      const pasta = zip.folder(nomePasta)!;
      const usados = new Set<string>();
      for (const a of imgs) {
        let nome = a.nome || ("anexo-" + Math.random().toString(36).slice(2) + ".jpg");
        while (usados.has(nome)) nome = "1-" + nome; usados.add(nome);
        pasta.file(nome, await blobDe(a.url));
      }
      const conteudo = await zip.generateAsync({ type: "blob" });
      salvarBlob(conteudo, (c.cliente || "cliente").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") + ".zip");
      toast("Download preparado");
    } catch { toast("Não foi possível gerar o .zip"); } finally { setZipando(false); }
  }

  return (
    <>
      <div className={"overlay" + (lb ? " on" : "")} id="imgOverlay" onClick={e => { if (e.target === e.currentTarget) setLb(null); }}>
        {lb && <>
          <button className="lb-seta lb-prev" style={{ display: lb.lista.length > 1 ? "grid" : "none" }} onClick={e => { e.stopPropagation(); mover(-1); }} aria-label="Anterior">‹</button>
          <img id="imgBig" alt="" src={lb.lista[lb.i]}
            onTouchStart={e => { tx.current = e.touches[0].clientX; }}
            onTouchEnd={e => { if (tx.current === null) return; const dx = e.changedTouches[0].clientX - tx.current; if (Math.abs(dx) > 40) mover(dx < 0 ? 1 : -1); tx.current = null; }}
            onClick={e => { if (lb.lista.length < 2) return; const r = (e.target as HTMLElement).getBoundingClientRect(); mover((e.clientX - r.left) > r.width / 2 ? 1 : -1); }} />
          <button className="lb-seta lb-next" style={{ display: lb.lista.length > 1 ? "grid" : "none" }} onClick={e => { e.stopPropagation(); mover(1); }} aria-label="Próxima">›</button>
          {lb.lista.length > 1 && <div className="lb-contador" id="lbContador">{lb.i + 1} / {lb.lista.length}</div>}
        </>}
      </div>
      <div className={"overlay" + (gal && c ? " on" : "")} id="galOverlay" onClick={e => { if (e.target === e.currentTarget) setGal(null); }}>
        {gal && c && (
          <div className="gal-box">
            <div className="gal-head">
              <div><h3 id="galTitulo">Anexos de {c.cliente}</h3><p id="galSub" style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-soft)" }}>{imgs.length} foto(s) · clique para ampliar, ou baixe individualmente</p></div>
              <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                <button className="btn primary sm" id="galBaixarTudo" disabled={zipando} onClick={baixarZip}>{zipando ? "Preparando .zip…" : "Baixar tudo (.zip)"}</button>
                <button className="x" id="galFechar" onClick={() => setGal(null)}>&times;</button>
              </div>
            </div>
            <div className="gal-grid" id="galGrid">
              {imgs.map((a: any, i: number) => (
                <div className="gal-item" key={a.id || i}>
                  <img src={a.url} alt={a.nome || ""} onClick={() => openImg(imgs.map((x: any) => x.url), i)} />
                  <button className="dl" title="Baixar esta foto" onClick={e => { e.stopPropagation(); baixarUm(a); }}>⬇</button>
                  {gal.editavel && a.id && <button className="rm" title="Remover" onClick={e => { e.stopPropagation(); executar(() => A.removerAnexo(a.id)); }}>×</button>}
                  <div className="nm">{a.nome || "foto"}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
