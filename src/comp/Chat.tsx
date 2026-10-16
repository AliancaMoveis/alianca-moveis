// Chat interno: botão flutuante (computador) / tela cheia (celular), lista de conversas e a conversa.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../estado";
import { chat, abrirChat, EVENTO_CHAT, type Conversa, type Msg, type Anexo } from "../lib/chat";
import { prepararArquivos } from "../lib/acoes";

const hhmm = (iso: string) => { const d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
const quando = (iso: string) => { if (!iso) return ""; const d = new Date(iso), h = new Date(); if (d.toDateString() === h.toDateString()) return hhmm(iso); const o = new Date(); o.setDate(o.getDate() - 1); if (d.toDateString() === o.toDateString()) return "ontem"; return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); };
const diaRot = (iso: string) => { const d = new Date(iso), h = new Date(); if (d.toDateString() === h.toDateString()) return "Hoje"; const o = new Date(); o.setDate(o.getDate() - 1); if (d.toDateString() === o.toDateString()) return "Ontem"; return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }); };
const CORES = ["#2f6fd6", "#8e44ad", "#0f8a8a", "#c2410c", "#1f9c7a", "#b8802a", "#d1478f", "#4b6bd6", "#7a5bb5", "#0e7490"];
const cor = (s: string) => { let h = 0; for (const ch of s || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0; return CORES[h % CORES.length]; };
const ini = (n: string) => (n || "?").replace(/^(Consultora?|Vendedora?)\s+—\s+/, "").trim().charAt(0).toUpperCase();
const ICO_SETOR: Record<string, string> = { checklist: "✓", callcenter: "☎", medidas: "📐", medidas_supervisao: "📐", marketing_operadora: "◎", marketing_supervisao: "◎", gestao: "▣", atendente_cliente: "🛒", consultor_externo: "🧭", suporte_consultores: "🧭", posvenda: "✚", montagem: "🔧", assistencia: "🛠", juridico: "⚖", gerente_loja: "🏬", prazo_fabrica: "🏭", supervisao: "☎", proprietario: "★" };
let bip: AudioContext | null = null;
function tocar() { try { bip = bip || new (window as any).AudioContext(); const o = bip!.createOscillator(), g = bip!.createGain(); o.frequency.value = 880; g.gain.value = 0.04; o.connect(g); g.connect(bip!.destination); o.start(); o.stop(bip!.currentTime + 0.12); } catch { /* sem som */ } }

/** estado do chat compartilhado entre o botão e a janela */
function useChat() {
  const { R } = useApp() as any;
  const eu = R.currentUserId;
  const [convs, setConvs] = useState<Conversa[]>([]);
  const carregar = () => chat.minhas(eu).then(setConvs).catch(() => null);
  useEffect(() => { (window as any).__eu = eu; carregar(); const t = setInterval(() => { if (document.visibilityState === "visible") carregar(); }, 60000); return () => clearInterval(t); }, [eu]);
  return { convs, setConvs, carregar, eu };
}

export function ChatFlutuante() {
  const { R } = useApp() as any;
  const C = useChat();
  const [modo, setModo] = useState<"" | "mini" | "max">("");
  const [conv, setConv] = useState("");
  const aberta = useRef(""); aberta.current = modo ? conv : "";
  const FECHAR = () => setModo("");
  useEffect(() => {
    const ev = (e: any) => { setModo(m => m || "mini"); if (e.detail) setConv(String(e.detail)); C.carregar(); };
    window.addEventListener(EVENTO_CHAT, ev);
    const fecha = () => FECHAR();
    window.addEventListener("a360-chat-fechar", fecha);
    const off = chat.ouvir(m => { C.carregar(); if (m.autor_id !== C.eu && !m.editado_em && aberta.current !== m.conversa_id) tocar(); });
    return () => { window.removeEventListener(EVENTO_CHAT, ev); window.removeEventListener("a360-chat-fechar", fecha); off(); };
  }, []);
  if (!R.currentUserId) return null;
  const total = C.convs.reduce((s, c) => s + (c.nao_lidas || 0), 0);
  return <>
    {modo && <div className={"chat-pnl " + modo}>
      <ChatApp C={C} conv={conv} setConv={setConv} cab={<>
        <button title={modo === "max" ? "Diminuir" : "Maximizar"} onClick={() => setModo(modo === "max" ? "mini" : "max")}>{modo === "max" ? "⤡" : "⤢"}</button>
        <button title="Minimizar" onClick={() => setModo("")}>—</button></>} />
    </div>}
    {modo !== "max" && <button className="chat-fab" title="Chat" onClick={() => { setModo(modo ? "" : "mini"); C.carregar(); }}>💬{total > 0 && <i>{total > 99 ? "99+" : total}</i>}</button>}
  </>;
}

/** celular: botão no topo + tela cheia */
export function ChatMovel() {
  const C = useChat();
  const [aberto, setAberto] = useState(false); const [conv, setConv] = useState("");
  const aberta = useRef(""); aberta.current = aberto ? conv : "";
  const FECHAR = () => setAberto(false);
  useEffect(() => {
    const ev = (e: any) => { setAberto(true); if (e.detail) setConv(String(e.detail)); C.carregar(); };
    window.addEventListener(EVENTO_CHAT, ev);
    const fecha = () => FECHAR();
    window.addEventListener("a360-chat-fechar", fecha);
    const off = chat.ouvir(m => { C.carregar(); if (m.autor_id !== C.eu && !m.editado_em && aberta.current !== m.conversa_id) tocar(); });
    return () => { window.removeEventListener(EVENTO_CHAT, ev); window.removeEventListener("a360-chat-fechar", fecha); off(); };
  }, []);
  const total = C.convs.reduce((s, c) => s + (c.nao_lidas || 0), 0);
  return <>
    <button className="chat-topo" title="Chat" onClick={() => { setAberto(true); C.carregar(); }}><span>💬</span>{total > 0 && <i>{total > 99 ? "99+" : total}</i>}</button>
    {aberto && createPortal(<div className="chat-pnl movel"><ChatApp C={C} conv={conv} setConv={setConv} cab={<button title="Fechar" onClick={() => { setAberto(false); setConv(""); }}>✕</button>} /></div>, document.body)}
  </>;
}

function ChatApp({ C, conv, setConv, cab }: any) {
  const { R, st } = useApp() as any;
  const [aba, setAba] = useState<"todas" | "privada" | "setor">("todas");
  const [q, setQ] = useState(""); const [nova, setNova] = useState(false);
  const c: Conversa | undefined = C.convs.find((x: Conversa) => x.id === conv);
  if (conv) return <Conversa_ c={c} id={conv} voltar={() => { setConv(""); C.carregar(); }} cab={cab} C={C} />;
  if (nova) return <NovaConversa voltar={() => setNova(false)} abrir={(id: string) => { setNova(false); C.carregar(); setConv(id); }} cab={cab} />;
  const t = q.trim().toLowerCase();
  const lista = C.convs.filter((x: Conversa) => (aba === "todas" || (aba === "privada" ? x.tipo === "privada" || x.tipo === "grupo" : x.tipo === "setor" || x.tipo === "contato_setor")) && (!t || (x.nome + " " + x.ultima_txt).toLowerCase().includes(t)));
  const n = (k: string) => C.convs.filter((x: Conversa) => k === "privada" ? x.tipo === "privada" || x.tipo === "grupo" : x.tipo === "setor" || x.tipo === "contato_setor").reduce((s: number, x: Conversa) => s + (x.nao_lidas || 0), 0);
  return <>
    <div className="chat-cab"><span>💬</span><b>Chat</b>{cab}</div>
    <div className="chat-abas">{([["todas", "Todas"], ["privada", "Privadas"], ["setor", "Setores"]] as any[]).map(([k, l]) => <button key={k} className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{l}{k !== "todas" && n(k) > 0 ? <i>{n(k)}</i> : null}</button>)}</div>
    <div className="chat-busca"><input placeholder="🔎 Buscar conversa" value={q} onChange={e => setQ(e.target.value)} /><button className="btn primary sm" onClick={() => setNova(true)}>＋ Nova</button></div>
    <div className="chat-lista">
      {lista.map((x: Conversa) => { const nm = x.nome || (x.outro_id ? R.nomeUser(x.outro_id) : "Conversa"); const set = x.tipo === "setor" || x.tipo === "contato_setor"; return (
        <button key={x.id} className={"chat-item" + (x.nao_lidas ? " nl" : "")} onClick={() => setConv(x.id)}>
          <span className="chat-av" style={{ background: set ? "#5b6b8c" : cor(nm) }}>{set ? (ICO_SETOR[x.setor_id || ""] || "#") : ini(nm)}</span>
          <span className="chat-it"><b>{set && x.tipo === "setor" ? "# " : ""}{nm}</b><small>{x.ultima_autor && x.ultima_autor === C.eu ? "Você: " : x.ultima_autor && x.tipo !== "privada" && R.getUser(x.ultima_autor) ? R.nomeUser(x.ultima_autor).split(" ")[0] + ": " : ""}{x.ultima_txt || (x.tipo === "setor" ? "Canal do setor — todos do setor participam" : "Sem mensagens")}</small></span>
          <span className="chat-q">{x.ultima_txt ? quando(x.ultima_em) : ""}{x.nao_lidas > 0 && <i>{x.nao_lidas}</i>}</span>
        </button>); })}
      {!lista.length && <div className="chat-vazio">{C.convs.length ? "Nada encontrado." : "Nenhuma conversa ainda. Toque em “＋ Nova” para falar com uma pessoa ou um setor."}</div>}
      {st.usuarios && aba !== "setor" && <div className="chat-dica">Privado é privado: só quem está na conversa lê.</div>}
    </div>
  </>;
}

function NovaConversa({ voltar, abrir, cab }: any) {
  const { R, st, toast } = useApp() as any;
  const [q, setQ] = useState(""); const [tab, setTab] = useState<"pessoas" | "setores">("pessoas");
  const eu = R.currentUserId; const t = q.trim().toLowerCase();
  const pessoas = st.usuarios.filter((u: any) => u.ativo && u.id !== eu && (!t || (u.nome + " " + (u.setores || []).map((s: string) => R.setorNome(s)).join(" ")).toLowerCase().includes(t))).sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR"));
  const setores = st.setores.filter((s: any) => s.id !== "proprietario" && (!t || s.nome.toLowerCase().includes(t)));
  const ir = (p: Promise<string>) => p.then(abrir).catch((e: any) => toast(e.message || "Não foi possível abrir"));
  return <>
    <div className="chat-cab"><button onClick={voltar}>‹</button><b>Nova conversa</b>{cab}</div>
    <div className="chat-abas"><button className={tab === "pessoas" ? "on" : ""} onClick={() => setTab("pessoas")}>👤 Pessoa</button><button className={tab === "setores" ? "on" : ""} onClick={() => setTab("setores")}># Setor</button></div>
    <div className="chat-busca"><input autoFocus placeholder={tab === "pessoas" ? "🔎 Nome ou setor da pessoa" : "🔎 Nome do setor"} value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="chat-lista">
      {tab === "pessoas" ? pessoas.map((u: any) => <button key={u.id} className="chat-item" onClick={() => ir(chat.abrirPrivada(u.id))}>
        <span className="chat-av" style={{ background: cor(u.nome) }}>{ini(u.nome)}</span>
        <span className="chat-it"><b>{u.nome}</b><small>{(u.setores || []).map((s: string) => R.setorNome(s)).join(", ")}</small></span></button>)
        : setores.map((s: any) => { const meu = R.mySetores().includes(s.id); return <button key={s.id} className="chat-item" onClick={() => ir(chat.abrirSetor(s.id))}>
          <span className="chat-av" style={{ background: "#5b6b8c" }}>{ICO_SETOR[s.id] || "#"}</span>
          <span className="chat-it"><b>{meu ? "# " : ""}{s.nome}</b><small>{meu ? "Canal do seu setor — todos do setor participam" : "Falar com o setor — quem estiver livre responde"}</small></span></button>; })}
    </div>
  </>;
}

function Conversa_({ c, id, voltar, cab, C }: { c?: Conversa; id: string; voltar: () => void; cab: any; C: any }) {
  const { R, st, toast, abrirDetalhe } = useApp() as any;
  const eu = R.currentUserId;
  const [msgs, setMsgs] = useState<Msg[]>([]); const [urls, setUrls] = useState<Record<string, string>>({});
  const [txt, setTxt] = useState(""); const [env, setEnv] = useState(false); const [fim, setFim] = useState(false);
  const [editando, setEditando] = useState<Msg | null>(null); const [menu, setMenu] = useState(0); const [ver, setVer] = useState("");
  const [pend, setPend] = useState<{ nome: string; blob: Blob; url: string }[]>([]);
  const box = useRef<HTMLDivElement>(null); const arq = useRef<HTMLInputElement>(null); const ta = useRef<HTMLTextAreaElement>(null);
  const descer = () => setTimeout(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, 30);
  const assinar = async (l: Msg[]) => { const ps = l.flatMap(m => (m.anexos || []).map(a => a.path)).filter(p => !urls[p]); if (ps.length) { const u = await chat.urls(ps); setUrls(x => ({ ...x, ...u })); } };
  useEffect(() => {
    let vivo = true;
    chat.mensagens(id).then(l => { if (!vivo) return; setMsgs(l); setFim(l.length < 60); assinar(l); descer(); chat.lido(id).then(() => C.carregar()); }).catch(e => toast(e.message));
    const off = chat.ouvir(m => {
      if (m.conversa_id !== id) return;
      setMsgs(l => { const i = l.findIndex(x => x.id === m.id); if (i >= 0) { const n = l.slice(); n[i] = m; return n; } return [...l, m]; });
      assinar([m]); descer(); if (m.autor_id !== eu) chat.lido(id);
    });
    return () => { vivo = false; off(); };
  }, [id]);
  const mais = async () => { if (!msgs.length) return; const l = await chat.mensagens(id, msgs[0].id); setFim(l.length < 60); setMsgs(x => [...l, ...x]); assinar(l); };
  const nome = c ? (c.nome || (c.outro_id ? R.nomeUser(c.outro_id) : "")) : "Conversa";
  const ehSetor = c && (c.tipo === "setor" || c.tipo === "contato_setor");
  const sub = !c ? "" : c.tipo === "privada" ? "conversa privada" : c.tipo === "setor" ? "canal do setor · " + R.state.usuarios.filter((u: any) => u.ativo && (u.setores || []).includes(c.setor_id)).length + " pessoas" : c.tipo === "contato_setor" ? (c.pessoa_id === eu ? "você fala com o setor · quem estiver livre responde" : "pedido de " + R.nomeUser(c.pessoa_id)) : "grupo";
  async function addArq(files: FileList | null) {
    if (!files || !files.length) return;
    try { const { fotos, outros, recusados } = await prepararArquivos(Array.from(files)); if (recusados.length) toast("Não anexado: " + recusados.join(", "));
      setPend(p => [...p, ...fotos.map((x: any) => ({ nome: x.nome, blob: x.blob, url: URL.createObjectURL(x.blob) })), ...outros.map((x: any) => ({ nome: x.nome, blob: x.blob, url: "" }))]); }
    catch (e: any) { toast(e.message || "Não foi possível preparar o arquivo"); }
  }
  async function enviar() {
    const t = txt.trim(); if (!t && !pend.length) return;
    setEnv(true);
    try {
      if (editando) { await chat.editar(editando.id, t); setEditando(null); setTxt(""); return; }
      const an: Anexo[] = []; for (const p of pend) an.push(await chat.subir(id, p.blob, p.nome));
      await chat.enviar(id, t, an); setTxt(""); setPend([]); C.carregar();
      if (ta.current) ta.current.style.height = "";
    } catch (e: any) { toast(e.message || "Não foi possível enviar"); } finally { setEnv(false); ta.current?.focus(); }
  }
  const podeAlterar = (m: Msg) => m.autor_id === eu && !m.apagado && Date.now() - +new Date(m.criado_em) < 15 * 60000;
  const nomesUsuarios = useMemo(() => st.usuarios.filter((u: any) => u.ativo).map((u: any) => u.nome.split(" ")[0]).filter((n: string) => n.length >= 3), [st.usuarios]);
  const renderTxt = (s: string) => s.split(/(ALM-\d{4,}|@[A-Za-zÀ-ú]+)/g).map((p, i) => {
    if (/^ALM-\d{4,}$/.test(p)) { const cli = st.chamados.find((x: any) => x.id === p);
      return cli ? <button key={i} className="chat-cli" onClick={() => { window.dispatchEvent(new Event("a360-chat-fechar")); abrirDetalhe(p); }}>🔗 {p} · {cli.cliente}<small>{cli.pedido ? "venda " + cli.pedido + " · " : ""}{R.setorNome(cli.setorDestino)}</small></button> : <b key={i}>{p}</b>; }
    if (/^@/.test(p) && nomesUsuarios.some((n: string) => n.toLowerCase() === p.slice(1).toLowerCase())) return <b key={i} className="chat-men">{p}</b>;
    return <span key={i}>{p}</span>;
  });
  let ultDia = "";
  return <>
    <div className="chat-cab"><button onClick={voltar} title="Voltar">‹</button>
      <span className="chat-av pq" style={{ background: ehSetor ? "#5b6b8c" : cor(nome) }}>{ehSetor ? (ICO_SETOR[c?.setor_id || ""] || "#") : ini(nome)}</span>
      <span className="chat-tt"><b>{c?.tipo === "setor" ? "# " : ""}{nome}</b><small>{sub}</small></span>{cab}</div>
    <div className="chat-msgs" ref={box} onClick={() => setMenu(0)}>
      {!fim && msgs.length > 0 && <button className="chat-mais" onClick={mais}>Carregar mensagens anteriores</button>}
      {!msgs.length && <div className="chat-vazio">{c?.tipo === "contato_setor" && c.pessoa_id === eu ? "Escreva sua mensagem para o setor. Todos do setor recebem, e quem estiver livre responde." : "Nenhuma mensagem ainda. Diga oi 👋"}</div>}
      {msgs.map(m => { const meu = m.autor_id === eu; const d = new Date(m.criado_em).toDateString(); const sep = d !== ultDia; ultDia = d; return <div key={m.id}>
        {sep && <div className="chat-dia">{diaRot(m.criado_em)}</div>}
        <div className={"chat-m" + (meu ? " eu" : "") + (m.apagado ? " apg" : "")} onContextMenu={e => { if (podeAlterar(m)) { e.preventDefault(); setMenu(m.id); } }}>
          {!meu && c?.tipo !== "privada" && <div className="chat-au" style={{ color: cor(R.nomeUser(m.autor_id)) }}>{R.nomeUser(m.autor_id)}</div>}
          {m.apagado ? <i>🚫 mensagem apagada</i> : <>
            {(m.anexos || []).map((a, i) => a.tipo === "img" ? <img key={i} className="chat-img" src={urls[a.path] || a.url} alt={a.nome} onClick={() => setVer(urls[a.path] || a.url || "")} /> :
              <a key={i} className="chat-arq" href={urls[a.path] || a.url} target="_blank" rel="noopener">{a.tipo === "pdf" ? "📄" : a.tipo === "video" ? "🎬" : a.tipo === "audio" ? "🎧" : "📎"} {a.nome}</a>)}
            {m.texto && <div className="chat-tx">{renderTxt(m.texto)}</div>}</>}
          <div className="chat-h">{m.editado_em && !m.apagado ? "editada · " : ""}{hhmm(m.criado_em)}{podeAlterar(m) && <button className="chat-op" onClick={e => { e.stopPropagation(); setMenu(menu === m.id ? 0 : m.id); }}>⋯</button>}</div>
          {menu === m.id && <div className="chat-menu" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setEditando(m); setTxt(m.texto); setMenu(0); ta.current?.focus(); }}>✏️ Editar</button>
            <button onClick={() => { setMenu(0); if (confirm("Apagar esta mensagem? Para todos aparece “mensagem apagada”.")) chat.editar(m.id, "", true).catch((e: any) => toast(e.message)); }}>🗑 Apagar</button>
            <small>até 15 min depois de enviar</small></div>}
        </div></div>; })}
    </div>
    {pend.length > 0 && <div className="chat-pend">{pend.map((p, i) => <span key={i}>{p.url ? <img src={p.url} alt="" /> : "📎"} {p.nome.slice(0, 18)}<button onClick={() => setPend(x => x.filter((_, j) => j !== i))}>✕</button></span>)}</div>}
    {editando && <div className="chat-edit">✏️ Editando mensagem <button onClick={() => { setEditando(null); setTxt(""); }}>cancelar</button></div>}
    <div className="chat-comp">
      {!editando && <button title="Anexar foto, PDF ou vídeo" onClick={() => arq.current?.click()}>📎</button>}
      <input ref={arq} type="file" multiple accept="image/*,application/pdf,video/*" style={{ display: "none" }} onChange={e => { addArq(e.target.files); e.target.value = ""; }} />
      <textarea ref={ta} rows={1} value={txt} placeholder="Mensagem… (ALM-1234 cita o cliente, @nome chama a pessoa)"
        onChange={e => { setTxt(e.target.value); e.target.style.height = ""; e.target.style.height = Math.min(120, e.target.scrollHeight) + "px"; }}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !(window.innerWidth < 700)) { e.preventDefault(); enviar(); } }} />
      <button className="chat-env" disabled={env || (!txt.trim() && !pend.length)} onClick={enviar}>{env ? "…" : "➤"}</button>
    </div>
    {ver && <div className="chat-ver" onClick={() => setVer("")}><img src={ver} alt="" /></div>}
  </>;
}

export { abrirChat };
