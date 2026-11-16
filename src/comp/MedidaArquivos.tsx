// Medidas · o que quem vai medir precisa ver: a imagem do projeto da venda e, na confirmação, as fotos e medidas anteriores.
// Todas as fotos (desta medida, da medição no Exact e da visita do consultor) abrem no mesmo visualizador de tela cheia:
// passar para o lado, zoom, girar e baixar — sem precisar fechar uma para ver a outra.
import { useEffect, useState } from "react";
import { A } from "../lib/acoes";
import { fmtDateTime } from "../lib/regras";
import { FotoViewer } from "./Fotos";

const cache = new Map<string, Promise<string>>();
const urlDe = (c: any, x: any) => {
  if (x.url) return Promise.resolve(x.url);
  const k = c.id + ":" + x.id;
  if (!cache.has(k)) cache.set(k, A.medidaBaixar(c.id, x.id).then(b => URL.createObjectURL(b)).catch(e => { cache.delete(k); throw e; }));
  return cache.get(k)!;
};

function Foto({ c, x, abrir, inteira, onSrc }: { c: any; x: any; abrir: () => void; inteira?: boolean; onSrc?: (s: string) => void }) {
  const [src, setSrc] = useState(""); const [erro, setErro] = useState(false);
  useEffect(() => { let vivo = true; urlDe(c, x).then(u => { if (vivo) { setSrc(u); onSrc?.(u); } }).catch(() => vivo && setErro(true)); return () => { vivo = false; }; }, [x.id, x.url]);
  return <button type="button" onClick={() => src && abrir()} title={x.nome}
    style={{ border: "1px solid rgba(128,140,160,.4)", borderRadius: 10, padding: 0, overflow: "hidden", background: "#fff", aspectRatio: "4/3", position: "relative", cursor: src ? "zoom-in" : "default" }}>
    {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: inteira ? "contain" : "cover", display: "block" }} /> : <span style={{ fontSize: 12, color: "#667" }}>{erro ? "não abriu" : "carregando…"}</span>}
    {src && inteira && <span style={{ position: "absolute", right: 6, bottom: 6, background: "rgba(20,24,32,.72)", color: "#fff", fontSize: 11.5, fontWeight: 700, borderRadius: 6, padding: "3px 7px" }}>🔍 toque para ampliar</span>}
  </button>;
}
const grade: any = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8, margin: "6px 0" };
const titulo: any = { fontWeight: 900, fontSize: 14.5, margin: "4px 0" };
type Item = { key: string; x: any; nome?: string };

/** imagem do projeto da venda (só imagens: sem orçamento, valores ou outros documentos) */
export function ImagensVenda({ c }: { c: any }) {
  const [l, setL] = useState<any[] | null>(null); const [erro, setErro] = useState("");
  const [ver, setVer] = useState<number | null>(null); const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => { A.medidaImagens(c.id).then(r => setL(r.imagens || [])).catch(e => { setErro(e.message); setL([]); }); }, [c.id]);
  const itens: Item[] = (l || []).map((x: any, i: number) => ({ key: x.fonte + x.id + i, x, nome: x.nome }));
  return <div style={{ border: "1.5px solid rgba(128,140,160,.35)", borderRadius: 12, padding: "10px 12px", margin: "8px 0 12px" }}>
    <div style={titulo}>🖼 Imagem da venda <span style={{ fontWeight: 600, fontSize: 12, opacity: .75 }}>· projeto que o cliente comprou</span></div>
    {l === null ? <div style={{ fontSize: 13, opacity: .7 }}>Buscando no Exact…</div>
      : itens.length ? <div style={itens.length === 1 ? { margin: "6px 0" } : grade}>{itens.map((f, i) =>
        <Foto key={f.key} c={c} x={f.x} inteira abrir={() => setVer(i)} onSrc={u => setUrls(p => p[f.key] === u ? p : { ...p, [f.key]: u })} />)}</div>
      : <div style={{ fontSize: 13, opacity: .75 }}>{erro || "Nenhuma imagem anexada na venda."}</div>}
    {ver !== null && <FotoViewer fotos={itens.map(f => ({ url: urls[f.key] || f.x.url || "", nome: f.nome }))} inicio={ver} onFechar={() => setVer(null)} />}
  </div>;
}

/** confirmação de medida: o que já foi enviado antes (medidas, fotos desta ficha, fotos da medição no Exact e da visita do consultor) */
export function Anteriores({ c }: { c: any }) {
  const m = (c.tratativa && c.tratativa.medida) || {};
  const [d, setD] = useState<any>(null);
  const [ver, setVer] = useState<number | null>(null); const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => { A.medidaAnteriores(c.id).then(setD).catch(e => setD({ exact: { fotos: [], notas: "" }, visita: [], avisos: [e.message] })); }, [c.id]);
  const minhas = (c.anexos || []).filter((a: any) => a.url);
  const ant: any[] = m.anteriores || [];
  const caixa: any = { border: "1.5px solid rgba(128,140,160,.35)", borderRadius: 12, padding: "10px 12px", margin: "8px 0" };

  // uma lista só com TODAS as fotos, na ordem em que aparecem: assim as setas do visualizador passam de um grupo para o outro
  const fotosMinhas: Item[] = minhas.filter((a: any) => a.tipo === "img").map((a: any, i: number) => ({ key: "m" + i, x: { id: "m" + i, url: a.url, nome: a.nome }, nome: a.nome }));
  // as fotos da medição no Exact já vêm para a ficha (viram anexo da medida): aqui só aparece o que ainda não veio,
  // senão a mesma foto apareceria duas vezes na tela
  const jaNaFicha = new Set(minhas.map((a: any) => a.url));
  const soNoExact = ((d?.exact?.fotos || []) as any[]).filter(x => x.img && !jaNaFicha.has(x.url));
  const fotosExact: Item[] = soNoExact.map((x, i) => ({ key: "e" + i, x: { id: "e" + i, url: x.url, nome: x.nome }, nome: x.nome }));
  const fotosVisita: Record<string, Item[]> = {};
  ((d?.visita || []) as any[]).forEach(v => { fotosVisita[v.id] = (v.fotos || []).filter((x: any) => x.img).map((x: any, i: number) => ({ key: v.id + i, x: { id: v.id + i, url: x.url, nome: x.nome }, nome: x.nome })); });
  const todas: Item[] = [...fotosMinhas, ...fotosExact, ...Object.values(fotosVisita).flat()];
  const idx = (f: Item) => todas.findIndex(t => t.key === f.key);
  const abrirFoto = (f: Item) => setVer(Math.max(0, idx(f)));
  const aoResolver = (f: Item) => (u: string) => setUrls(p => p[f.key] === u ? p : { ...p, [f.key]: u });

  return <div>
    {ant.length > 0 && <div style={caixa}><div style={titulo}>📝 Medidas enviadas antes</div>
      {ant.slice().reverse().map((x, i) => <div key={i} style={{ fontSize: 13.5, padding: "6px 0", borderTop: i ? "1px solid rgba(128,140,160,.25)" : 0 }}>
        <div style={{ opacity: .75, fontSize: 12 }}>{x.realizadaEm ? "Enviada " + fmtDateTime(x.realizadaEm) : "Enviada"}{x.devolvidaEm ? " · devolvida " + fmtDateTime(x.devolvidaEm) : ""}{x.fotos ? " · " + x.fotos + " foto(s)" : ""}</div>
        {x.medidas && <div><b>Medidas:</b> {x.medidas}</div>}{x.obs && <div><b>Obs.:</b> {x.obs}</div>}
        {x.faltando && <div style={{ color: "#1d6fd1" }}><b>Faltou:</b> {x.faltando}</div>}</div>)}</div>}
    {(m.medidas || m.obs) && !ant.length && <div style={caixa}><div style={titulo}>📝 Medidas enviadas</div>{m.medidas && <div><b>Medidas:</b> {m.medidas}</div>}{m.obs && <div><b>Obs.:</b> {m.obs}</div>}</div>}

    <div style={caixa}><div style={titulo}>📷 Fotos desta medida <span style={{ fontWeight: 600, fontSize: 12, opacity: .75 }}>· {minhas.length}{m.fotosExact ? " · " + m.fotosExact + " da medição no Exact" : ""}</span></div>
      {minhas.length ? <div style={grade}>{minhas.map((a: any, i: number) => { const f = fotosMinhas.find(z => z.x.url === a.url && z.nome === a.nome);
        return a.tipo === "img" && f ? <Foto key={i} c={c} x={f.x} abrir={() => abrirFoto(f)} onSrc={aoResolver(f)} />
          : <a key={i} href={a.url} target="_blank" rel="noopener" style={{ fontSize: 12.5 }}>📄 {a.nome || "arquivo"}</a>; })}</div>
        : <div style={{ fontSize: 13, opacity: .75 }}>Nenhuma foto anexada ainda.</div>}</div>

    {(!d || soNoExact.length > 0 || !!d.exact.notas) && <div style={caixa}><div style={titulo}>🗂 Medição no Exact</div>
      {!d ? <div style={{ fontSize: 13, opacity: .7 }}>Buscando…</div> : <>
        {soNoExact.length ? <div style={grade}>{soNoExact.map((x, i) => { const f = fotosExact.find(z => z.x.url === x.url);
          return f ? <Foto key={i} c={c} x={f.x} abrir={() => abrirFoto(f)} onSrc={aoResolver(f)} /> : null; })}</div>
          : <div style={{ fontSize: 13, opacity: .75 }}>{m.fotosExact ? "As fotos da medição no Exact já estão acima, nesta ficha." : "Sem fotos da medição no Exact."}</div>}
        {d.exact.notas && <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap", marginTop: 6, opacity: .9 }}>{d.exact.notas}</div>}</>}</div>}

    {d && (d.visita as any[]).map((v: any) => <div key={v.id} style={caixa}><div style={titulo}>🏠 Visita do consultor antes da venda <span style={{ fontWeight: 600, fontSize: 12, opacity: .75 }}>· {v.data ? fmtDateTime(v.data) : ""}</span></div>
      {v.medidas && <div style={{ fontSize: 13.5 }}><b>Medidas:</b> {v.medidas}</div>}{v.obs && <div style={{ fontSize: 13.5 }}><b>Obs.:</b> {v.obs}</div>}
      {(v.fotos || []).length ? <div style={grade}>{(v.fotos as any[]).map((x, i) => { const f = (fotosVisita[v.id] || []).find(z => z.x.url === x.url);
        return x.img && f ? <Foto key={i} c={c} x={f.x} abrir={() => abrirFoto(f)} onSrc={aoResolver(f)} />
          : <a key={i} href={x.url} target="_blank" rel="noopener" style={{ fontSize: 12.5 }}>📄 {x.nome}</a>; })}</div>
        : <div style={{ fontSize: 13, opacity: .75 }}>Sem fotos da visita.</div>}</div>)}

    {d && d.avisos && d.avisos.length > 0 && <div style={{ fontSize: 12, opacity: .7 }}>{d.avisos.join(" · ")}</div>}
    {ver !== null && <FotoViewer fotos={todas.map(f => ({ url: urls[f.key] || f.x.url || "", nome: f.nome }))} inicio={ver} onFechar={() => setVer(null)} />}
  </div>;
}
