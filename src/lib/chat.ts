// Chat interno do ALIANÇA 360: conversas privadas, canais de setor e "falar com o setor".
// Privado é privado: só quem participa lê (RLS). Edição/remoção até 15 min; o original fica na auditoria (só o desenvolvedor).
import { sb } from "./supabase";

export type Conversa = { id: string; tipo: "privada" | "setor" | "contato_setor" | "grupo"; nome: string; setor_id: string | null; outro_id: string | null; pessoa_id: string | null; ultima_em: string; ultima_txt: string; ultima_autor: string | null; nao_lidas: number };
export type Anexo = { path: string; nome: string; tipo: "img" | "pdf" | "video" | "audio" | "arq"; url?: string };
export type Msg = { id: number; conversa_id: string; autor_id: string; texto: string; anexos: Anexo[]; criado_em: string; editado_em: string | null; apagado: boolean };

export const MOCK = !!(import.meta as any).env?.VITE_MOCK;

// ---------- modo de teste (sem banco) ----------
const mk = { convs: [] as Conversa[], msgs: [] as Msg[], seq: 1, ouvintes: [] as ((m: Msg) => void)[] };
function mockInit(eu: string) {
  if (mk.convs.length) return;
  const agora = Date.now();
  mk.convs = [
    { id: "c-setor", tipo: "setor", nome: "Suporte Checklist", setor_id: "checklist", outro_id: null, pessoa_id: null, ultima_em: new Date(agora - 6e5).toISOString(), ultima_txt: "Pode sim, já reservei para sexta 9h", ultima_autor: "x", nao_lidas: 2 },
    { id: "c-priv", tipo: "privada", nome: "Haisla", setor_id: null, outro_id: "00000000-0000-4000-a000-000000000013", pessoa_id: null, ultima_em: new Date(agora - 3e5).toISOString(), ultima_txt: "Me chama quando puder", ultima_autor: "00000000-0000-4000-a000-000000000013", nao_lidas: 1 },
  ];
  mk.msgs = [
    { id: mk.seq++, conversa_id: "c-setor", autor_id: eu, texto: "Bom dia! Esse cliente pode encaixar essa semana? ALM-0023", anexos: [], criado_em: new Date(agora - 9e5).toISOString(), editado_em: null, apagado: false },
    { id: mk.seq++, conversa_id: "c-setor", autor_id: "00000000-0000-4000-a000-000000000008", texto: "Pode sim, já reservei para sexta 9h 👍", anexos: [], criado_em: new Date(agora - 6e5).toISOString(), editado_em: null, apagado: false },
    { id: mk.seq++, conversa_id: "c-priv", autor_id: "00000000-0000-4000-a000-000000000013", texto: "Me chama quando puder", anexos: [], criado_em: new Date(agora - 3e5).toISOString(), editado_em: null, apagado: false },
  ];
}

export const chat = {
  async minhas(eu: string): Promise<Conversa[]> {
    if (MOCK) { mockInit(eu); return mk.convs.slice().sort((a, b) => b.ultima_em.localeCompare(a.ultima_em)); }
    const { data, error } = await sb.rpc("chat_minhas"); if (error) throw new Error(error.message); return (data || []) as Conversa[];
  },
  async mensagens(conv: string, antesDe?: number): Promise<Msg[]> {
    if (MOCK) return mk.msgs.filter(m => m.conversa_id === conv);
    let q = sb.from("chat_mensagens").select("*").eq("conversa_id", conv).order("id", { ascending: false }).limit(60);
    if (antesDe) q = q.lt("id", antesDe);
    const { data, error } = await q; if (error) throw new Error(error.message);
    return ((data || []) as Msg[]).reverse();
  },
  async enviar(conv: string, texto: string, anexos: Anexo[] = []): Promise<number> {
    if (MOCK) { const m: Msg = { id: mk.seq++, conversa_id: conv, autor_id: (window as any).__eu || "", texto, anexos, criado_em: new Date().toISOString(), editado_em: null, apagado: false }; mk.msgs.push(m); const c = mk.convs.find(x => x.id === conv); if (c) { c.ultima_em = m.criado_em; c.ultima_txt = texto; } mk.ouvintes.forEach(f => f(m)); return m.id; }
    const { data, error } = await sb.rpc("chat_enviar", { p_conv: conv, p_texto: texto, p_anexos: anexos.map(({ url, ...a }) => a) });
    if (error) throw new Error(error.message); return data as number;
  },
  async editar(id: number, texto: string, apagar = false) {
    if (MOCK) { const m = mk.msgs.find(x => x.id === id); if (m) { if (apagar) { m.apagado = true; m.texto = ""; } else m.texto = texto; m.editado_em = new Date().toISOString(); mk.ouvintes.forEach(f => f(m)); } return; }
    const { error } = await sb.rpc("chat_editar", { p_msg: id, p_texto: texto, p_apagar: apagar }); if (error) throw new Error(error.message);
  },
  async lido(conv: string) { if (MOCK) { const c = mk.convs.find(x => x.id === conv); if (c) c.nao_lidas = 0; return; } await sb.rpc("chat_lido", { p_conv: conv }); },
  async abrirPrivada(uid: string): Promise<string> {
    if (MOCK) { let c = mk.convs.find(x => x.tipo === "privada" && x.outro_id === uid); if (!c) { c = { id: "c-" + uid, tipo: "privada", nome: "", setor_id: null, outro_id: uid, pessoa_id: null, ultima_em: new Date().toISOString(), ultima_txt: "", ultima_autor: null, nao_lidas: 0 }; mk.convs.push(c); } return c.id; }
    const { data, error } = await sb.rpc("chat_abrir_privada", { p_uid: uid }); if (error) throw new Error(error.message); return data as string;
  },
  async abrirSetor(setor: string): Promise<string> {
    if (MOCK) { let c = mk.convs.find(x => x.setor_id === setor); if (!c) { c = { id: "c-s-" + setor, tipo: "contato_setor", nome: setor, setor_id: setor, outro_id: null, pessoa_id: (window as any).__eu, ultima_em: new Date().toISOString(), ultima_txt: "", ultima_autor: null, nao_lidas: 0 }; mk.convs.push(c); } return c.id; }
    const { data, error } = await sb.rpc("chat_abrir_setor", { p_setor: setor }); if (error) throw new Error(error.message); return data as string;
  },
  async subir(conv: string, f: File | Blob, nome: string): Promise<Anexo> {
    const tipo: Anexo["tipo"] = /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(nome) ? "img" : /pdf/.test(f.type) || /\.pdf$/i.test(nome) ? "pdf" : /^video\//.test(f.type) ? "video" : /^audio\//.test(f.type) ? "audio" : "arq";
    if (MOCK) return { path: "mock/" + nome, nome, tipo, url: URL.createObjectURL(f) };
    const ext = (nome.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
    const path = conv + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ext;
    const { error } = await sb.storage.from("chat").upload(path, f, { contentType: f.type || undefined, upsert: false });
    if (error) throw new Error("Não foi possível enviar " + nome + ": " + error.message);
    return { path, nome, tipo };
  },
  async urls(paths: string[]): Promise<Record<string, string>> {
    if (MOCK || !paths.length) return {};
    const { data } = await sb.storage.from("chat").createSignedUrls(paths, 3600);
    const r: Record<string, string> = {}; (data || []).forEach((x: any) => { if (x.signedUrl) r[x.path] = x.signedUrl; }); return r;
  },
  /** escuta mensagens novas/alteradas das conversas que a pessoa participa (o banco filtra pelo RLS) */
  ouvir(f: (m: Msg) => void): () => void {
    if (MOCK) { mk.ouvintes.push(f); return () => { mk.ouvintes = mk.ouvintes.filter(x => x !== f); }; }
    const ch = sb.channel("chat-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_mensagens" }, (p: any) => p.new && f(p.new as Msg))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  },
};

export const EVENTO_CHAT = "a360-chat";
/** abre o chat (opcionalmente numa conversa) de qualquer lugar do sistema */
export const abrirChat = (conv?: string) => window.dispatchEvent(new CustomEvent(EVENTO_CHAT, { detail: conv || "" }));
