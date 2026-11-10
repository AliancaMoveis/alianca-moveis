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
export const somLigado = () => ler("a360-som", "1") === "1";
export const salvarSom = (on: boolean) => gravar("a360-som", on ? "1" : "0");
export const menuRecolhido = () => ler("a360-mini", "0") === "1";
export const salvarMenuRecolhido = (on: boolean) => gravar("a360-mini", on ? "1" : "0");
export const listasCompactas = () => ler("a360-compacto", "0") === "1";
export function aplicarCompacto(on: boolean = listasCompactas()) { document.documentElement.classList.toggle("compacto", on); }
export const salvarCompacto = (on: boolean) => { gravar("a360-compacto", on ? "1" : "0"); aplicarCompacto(on); };
export type PerPadrao = "hoje" | "semana" | "mes" | "mesant";
export const periodoPadrao = () => ler("a360-periodo", "mes") as PerPadrao;
export const salvarPeriodo = (p: PerPadrao) => gravar("a360-periodo", p);
/** grupos de avisos que cada pessoa pode desligar (pela chave do aviso); os importantes (cliente direcionado, chegou, urgente, chat) ficam sempre ligados */
export const GRUPOS_AVISO: [string, string, string[]][] = [
  ["fila", "Clientes sem vendedor / fila da loja", ["semvend", "fila", "assumiu"]],
  ["parados", "Clientes parados e prazos (SLA, inatividade, espera)", ["inativo", "parados", "sla", "espera"]],
  ["anexo", "Clientes sem anexo", ["semanexo"]],
  ["parecer", "Cobrança de parecer e registro de visita", ["vendsempar", "cobrado", "visitasemreg"]],
  ["lembretes", "Lembretes de visita e do dia", ["lembrete", "visita1h", "visitahoje", "consdia", "chkdia"]],
  ["resumos", "Resumos diários e abertura/fechamento da loja", ["resumo", "resumodono", "lojaabre", "lojafecha"]],
];
export function aplicarPreferencias() { aplicarTema(); aplicarZoom(); aplicarCompacto(); }
