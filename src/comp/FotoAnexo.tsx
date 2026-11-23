// Foto de anexo que só pede a URL assinada quando chega perto da tela.
//
// Por que existe: o 360 assinava a URL de todas as fotos de todos os tickets a cada
// carregamento (quase 10 mil), e o Storage confere permissão foto por foto. Isso travava
// o sistema inteiro — principalmente em Medidas, que é tela de foto. Agora cada foto é
// assinada quando aparece, e a URL fica guardada no navegador para o próximo F5.
//
// onSrc avisa quem está em volta da URL que foi resolvida, para imprimir e baixar .zip
// continuarem funcionando (quem imprime precisa da URL de verdade, não do espaço vazio).
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { urlAnexo } from "../lib/dados";

/** 1x1 transparente: segura o lugar da foto sem pedir nada à rede */
const VAZIO = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

type Props = {
  a: any;                      // o anexo: { path, url?, nome? }
  className?: string;
  style?: CSSProperties;
  alt?: string;
  title?: string;
  onClick?: () => void;
  onSrc?: (u: string) => void; // devolve a URL assinada (impressão / download)
};

export function FotoAnexo({ a, className, style, alt, title, onClick, onSrc }: Props) {
  const [src, setSrc] = useState<string>(a?.url || "");
  const ref = useRef<HTMLImageElement | null>(null);
  const pedido = useRef(false);

  useEffect(() => { if (a?.url && a.url !== src) { setSrc(a.url); onSrc?.(a.url); } }, [a?.url]);

  useEffect(() => {
    if (src || !a?.path || pedido.current) return;
    const el = ref.current;
    let vivo = true;
    const pegar = () => {
      if (pedido.current) return; pedido.current = true;
      urlAnexo(a.path).then(u => { if (vivo && u) { setSrc(u); onSrc?.(u); } else pedido.current = false; })
        .catch(() => { pedido.current = false; });
    };
    // sem IntersectionObserver (navegador antigo): pede na hora, como era antes
    if (!el || typeof IntersectionObserver === "undefined") { pegar(); return () => { vivo = false; }; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); pegar(); } },
      { rootMargin: "400px" });   // começa a carregar um pouco antes de aparecer, para não piscar
    io.observe(el);
    return () => { vivo = false; io.disconnect(); };
  }, [a?.path, src]);

  return <img ref={ref} className={className} style={style} src={src || VAZIO} alt={alt ?? (a?.nome || "")}
    title={title} onClick={onClick} data-carregando={src ? undefined : "1"} />;
}

/** URLs assinadas de uma lista de anexos — para imprimir ou baixar o que ainda não apareceu na tela */
export async function urlsDeAnexos(anexos: any[]): Promise<Record<string, string>> {
  const r: Record<string, string> = {};
  const l = anexos.filter(a => a?.path || a?.url);
  for (let i = 0; i < l.length; i += 8) {
    await Promise.all(l.slice(i, i + 8).map(async a => {
      if (a.url) { r[a.path || a.url] = a.url; return; }
      try { const u = await urlAnexo(a.path); if (u) r[a.path] = u; } catch { /* pula a que não abriu */ }
    }));
  }
  return r;
}
