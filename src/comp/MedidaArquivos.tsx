// Medidas · o que quem vai medir precisa ver: a imagem do projeto da venda e, na confirmação, as fotos e medidas anteriores.
import { useEffect, useState } from "react";
import { A } from "../lib/acoes";
import { fmtDateTime } from "../lib/regras";

const cache = new Map<string, Promise<string>>();
const urlDe = (c: any, x: any) => {
  if (x.url) return Promise.resolve(x.url);
  const k = c.id + ":" + x.id;
  if (!cache.has(k)) cache.set(k, A.medidaBaixar(c.id, x.id).then(b => URL.createObjectURL(b)).catch(e => { cache.delete(k); throw e; }));
  return cache.get(k)!;
};

function Ampliar({ src, fechar }: { src: string; fechar: () => void }) {
  return <div onClick={fechar} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(8,12,18,.94)", display: "flex", alignItems: "center", justifyContent: "center", padding: 6 }}>
    <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", background: "#fff" }} />
    <div style={{ position: "absolute", top: 10, right: 14, color: "#fff", fontWeight: 800 }}>✕ fechar</div></div>;
}
function Foto({ c, x, abrir, inteira }: { c: any; x: any; abrir: (s: string) => void; inteira?: boolean }) {
  const [src, setSrc] = useState(""); const [erro, setErro] = useState(false);
  useEffect(() => { let vivo = true; urlDe(c, x).then(u => vivo && setSrc(u)).catch(() => vivo && setErro(true)); return () => { vivo = false; }; }, [x.id, x.url]);
  return <button type="button" onClick={() => src && abrir(src)} title={x.nome}
    style={{ border: "1px solid rgba(128,140,160,.4)", borderRadius: 10, padding: 0, overflow: "hidden", background: "#fff", aspectRatio: "4/3", position: "relative", cursor: src ? "zoom-in" : "default" }}>
    {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: inteira ? "contain" : "cover", display: "block" }} /> : <span style={{ fontSize: 12, color: "#667" }}>{erro ? "não abriu" : "carregando…"}</span>}
    {src && inteira && <span style={{ position: "absolute", right: 6, bottom: 6, background: "rgba(20,24,32,.72)", color: "#fff", fontSize: 11.5, fontWeight: 700, borderRadius: 6, padding: "3px 7px" }}>🔍 toque para ampliar</span>}
  </button>;
}
const grade: any = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8, margin: "6px 0" };
const titulo: any = { fontWeight: 900, fontSize: 14.5, margin: "4px 0" };

/** imagem do projeto da venda (só imagens: sem orçamento, valores ou outros documentos) */
export function ImagensVenda({ c }: { c: any }) {
  const [l, setL] = useState<any[] | null>(null); const [erro, setErro] = useState(""); const [zoom, setZoom] = useState("");
  useEffect(() => { A.medidaImagens(c.id).then(r => setL(r.imagens || [])).catch(e => { setErro(e.message); setL([]); }); }, [c.id]);
  return <div style={{ border: "1.5px solid rgba(128,140,160,.35)", borderRadius: 12, padding: "10px 12px", margin: "8px 0 12px" }}>
    <div style={titulo}>🖼 Imagem da venda <span style={{ fontWeight: 600, fontSize: 12, opacity: .75 }}>· projeto que o cliente comprou</span></div>
    {l === null ? <div style={{ fontSize: 13, opacity: .7 }}>Buscando no Exact…</div>
      : l.length ? <div style={l.length === 1 ? { margin: "6px 0" } : grade}>{l.map((x, i) => <Foto key={x.fonte + x.id + i} c={c} x={x} abrir={setZoom} inteira />)}</div>
      : <div style={{ fontSize: 13, opacity: .75 }}>{erro || "Nenhuma imagem anexada na venda."}</div>}
    {zoom && <Ampliar src={zoom} fechar={() => setZoom("")} />}
  </div>;
}

/** confirmação de medida: o que já foi enviado antes (medidas, fotos desta ficha, fotos da medição no Exact e da visita do consultor) */
export function Anteriores({ c }: { c: any }) {
  const m = (c.tratativa && c.tratativa.medida) || {};
  const [d, setD] = useState<any>(null); const [zoom, setZoom] = useState("");
  useEffect(() => { A.medidaAnteriores(c.id).then(setD).catch(e => setD({ exact: { fotos: [], notas: "" }, visita: [], avisos: [e.message] })); }, [c.id]);
  const minhas = (c.anexos || []).filter((a: any) => a.url);
  const ant: any[] = m.anteriores || [];
  const caixa: any = { border: "1.5px solid rgba(128,140,160,.35)", borderRadius: 12, padding: "10px 12px", margin: "8px 0" };
  return <div>
    {ant.length > 0 && <div style={caixa}><div style={titulo}>📝 Medidas enviadas antes</div>
      {ant.slice().reverse().map((x, i) => <div key={i} style={{ fontSize: 13.5, padding: "6px 0", borderTop: i ? "1px solid rgba(128,140,160,.25)" : 0 }}>
        <div style={{ opacity: .75, fontSize: 12 }}>{x.realizadaEm ? "Enviada " + fmtDateTime(x.realizadaEm) : "Enviada"}{x.devolvidaEm ? " · devolvida " + fmtDateTime(x.devolvidaEm) : ""}{x.fotos ? " · " + x.fotos + " foto(s)" : ""}</div>
        {x.medidas && <div><b>Medidas:</b> {x.medidas}</div>}{x.obs && <div><b>Obs.:</b> {x.obs}</div>}
        {x.faltando && <div style={{ color: "#1d6fd1" }}><b>Faltou:</b> {x.faltando}</div>}</div>)}</div>}
    {(m.medidas || m.obs) && !ant.length && <div style={caixa}><div style={titulo}>📝 Medidas enviadas</div>{m.medidas && <div><b>Medidas:</b> {m.medidas}</div>}{m.obs && <div><b>Obs.:</b> {m.obs}</div>}</div>}
    <div style={caixa}><div style={titulo}>📷 Fotos desta medida <span style={{ fontWeight: 600, fontSize: 12, opacity: .75 }}>· {minhas.length}</span></div>
      {minhas.length ? <div style={grade}>{minhas.map((a: any, i: number) => a.tipo === "img" ? <Foto key={i} c={c} x={{ id: "m" + i, url: a.url, nome: a.nome }} abrir={setZoom} />
        : <a key={i} href={a.url} target="_blank" rel="noopener" style={{ fontSize: 12.5 }}>📄 {a.nome || "arquivo"}</a>)}</div> : <div style={{ fontSize: 13, opacity: .75 }}>Nenhuma foto anexada ainda.</div>}</div>
    <div style={caixa}><div style={titulo}>🗂 Medição no Exact</div>
      {!d ? <div style={{ fontSize: 13, opacity: .7 }}>Buscando…</div> : <>
        {d.exact.fotos.length ? <div style={grade}>{d.exact.fotos.map((x: any, i: number) => x.img ? <Foto key={i} c={c} x={{ id: "e" + i, url: x.url, nome: x.nome }} abrir={setZoom} />
          : <a key={i} href={x.url} target="_blank" rel="noopener" style={{ fontSize: 12.5 }}>📄 {x.nome}</a>)}</div> : <div style={{ fontSize: 13, opacity: .75 }}>Sem fotos da medição no Exact.</div>}
        {d.exact.notas && <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap", marginTop: 6, opacity: .9 }}>{d.exact.notas}</div>}</>}</div>
    {d && d.visita.map((v: any) => <div key={v.id} style={caixa}><div style={titulo}>🏠 Visita do consultor antes da venda <span style={{ fontWeight: 600, fontSize: 12, opacity: .75 }}>· {v.data ? fmtDateTime(v.data) : ""}</span></div>
      {v.medidas && <div style={{ fontSize: 13.5 }}><b>Medidas:</b> {v.medidas}</div>}{v.obs && <div style={{ fontSize: 13.5 }}><b>Obs.:</b> {v.obs}</div>}
      {v.fotos.length ? <div style={grade}>{v.fotos.map((x: any, i: number) => x.img ? <Foto key={i} c={c} x={{ id: v.id + i, url: x.url, nome: x.nome }} abrir={setZoom} />
        : <a key={i} href={x.url} target="_blank" rel="noopener" style={{ fontSize: 12.5 }}>📄 {x.nome}</a>)}</div> : <div style={{ fontSize: 13, opacity: .75 }}>Sem fotos da visita.</div>}</div>)}
    {d && d.avisos && d.avisos.length > 0 && <div style={{ fontSize: 12, opacity: .7 }}>{d.avisos.join(" · ")}</div>}
    {zoom && <Ampliar src={zoom} fechar={() => setZoom("")} />}
  </div>;
}
