// Preferências deste aparelho (ficam no navegador de quem usa): tema, tamanho do texto, tela inicial.
export type Tema = "auto" | "claro" | "escuro";
const ler = (k: string, p: string) => { try { return localStorage.getItem(k) || p; } catch { return p; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
export const temaAtual = () => ler("a360-tema", "auto") as Tema;
export const zoomAtual = () => Number(ler("a360-zoom", "1")) || 1;
export const telaInicial = () => ler("a360-inicio", "");
export function aplicarTema(t: Tema = temaAtual()) { const r = document.documentElement; if (t === "auto") delete r.dataset.theme; else r.dataset.theme = t === "escuro" ? "dark" : "light"; }
export function aplicarZoom(z: number = zoomAtual()) { (document.body.style as any).zoom = z === 1 ? "" : String(z); }
export const salvarTema = (t: Tema) => { gravar("a360-tema", t); aplicarTema(t); };
export const salvarZoom = (z: number) => { gravar("a360-zoom", String(z)); aplicarZoom(z); };
export const salvarInicio = (v: string) => gravar("a360-inicio", v);
export function aplicarPreferencias() { aplicarTema(); aplicarZoom(); }
