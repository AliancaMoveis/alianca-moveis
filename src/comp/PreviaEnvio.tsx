// Confirmação antes de enviar anexos: mostra as fotos/vídeos/PDFs escolhidos, deixa tirar o que veio errado
// e só envia quando a pessoa toca em "Enviar". (Antes subia direto ao selecionar e entravam imagens erradas.)
import { useEffect, useMemo } from "react";

export type Pendente = { nome: string; blob: Blob; tipo: "img" | "video" | "pdf" };
export const juntarPendentes = (atual: Pendente[], fotos: { nome: string; blob: Blob }[], outros: { nome: string; blob: Blob; tipo: "video" | "pdf" }[]): Pendente[] =>
  [...atual, ...fotos.map(f => ({ ...f, tipo: "img" as const })), ...outros];
export const separarPendentes = (p: Pendente[]) => ({ fotos: p.filter(x => x.tipo === "img").map(({ nome, blob }) => ({ nome, blob })), outros: p.filter(x => x.tipo !== "img") as { nome: string; blob: Blob; tipo: "video" | "pdf" }[] });

export function PreviaEnvio({ itens, remover, enviar, cancelar, mais, aceita, movel }: { itens: Pendente[]; remover: (i: number) => void; enviar: () => void; cancelar: () => void; mais: (f: FileList | null) => void; aceita: string; movel?: boolean }) {
  const urls = useMemo(() => itens.map(x => x.tipo === "img" ? URL.createObjectURL(x.blob) : ""), [itens]);
  useEffect(() => () => urls.forEach(u => u && URL.revokeObjectURL(u)), [urls]);
  return (
    <div className={"pv-envio" + (movel ? " movel" : "")}>
      <div className="pv-envio-t">Confira antes de enviar · {itens.length} arquivo{itens.length > 1 ? "s" : ""} <small>toque no ✕ para tirar o que não é deste cliente</small></div>
      <div className="pv-envio-g">
        {itens.map((x, i) => <div key={i} className="pv-envio-i">
          {x.tipo === "img" ? <img src={urls[i]} alt={x.nome} /> : <div className="pv-envio-arq">{x.tipo === "pdf" ? "📄" : "🎬"}<span>{x.nome}</span></div>}
          <button type="button" className="pv-envio-x" title="Tirar" onClick={() => remover(i)}>✕</button>
        </div>)}
        <label className="pv-envio-mais">＋<span>Adicionar mais</span><input type="file" accept={aceita} multiple hidden onChange={e => { mais(e.target.files); e.target.value = ""; }} /></label>
      </div>
      <div className="pv-envio-b">
        <button type="button" className={movel ? "mv-principal" : "btn primary"} disabled={!itens.length} onClick={enviar}>✅ Enviar {itens.length} arquivo{itens.length > 1 ? "s" : ""}</button>
        <button type="button" className={movel ? "mv-mais" : "btn ghost"} onClick={cancelar}>Cancelar</button>
      </div>
    </div>
  );
}
