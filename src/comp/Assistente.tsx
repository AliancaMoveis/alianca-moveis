// ALIANÇA 360 — Assistente (chat com voz). Só aparece para usuários liberados no servidor (/api/assistente).
// Consultas rodam direto; qualquer alteração vira um cartão de confirmação — nada é gravado sem o toque da pessoa.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../estado";
import { ESCRITAS, executarEscrita, executarLeitura, perguntar, proporEscrita, sistema, statusAssistente, type Cartao, type Proposta } from "../lib/assistente";

type Pend = { id: string; nome: string; args: any; p: Proposta };
type Item =
  | { k: "u"; t: string }
  | { k: "ia"; t: string; cartoes?: Cartao[] }
  | { k: "erro"; t: string }
  | { k: "conf"; pend: Pend[]; estado: "aguardando" | "feito" | "cancelado"; resultado?: string };

const SUGESTOES = ["Quais clientes eu tenho hoje?", "Quais clientes tenho essa semana?", "Quem está sem vendedor?"];
const SR: any = typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

export function Assistente() {
  const app = useApp() as any;
  const appRef = useRef(app); appRef.current = app;
  const [status, setStatus] = useState<{ liberado: boolean; configurado: boolean } | null>(null);
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<Item[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const msgs = useRef<any[]>([]);
  const pendRef = useRef<{ results: any[]; pend: Pend[]; cartoes: Cartao[] } | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const finalRef = useRef("");

  useEffect(() => { let vivo = true; statusAssistente().then(s => vivo && setStatus(s)); return () => { vivo = false; }; }, []);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [itens, pensando, aberto]);

  const ctx = () => { const a = appRef.current; return { R: a.R, st: a.st, uid: a.R.currentUserId, recarregar: a.recarregar }; };
  const add = (i: Item) => setItens(x => [...x, i]);

  async function rodar(cartoes: Cartao[] = []) {
    setPensando(true);
    try {
      for (let volta = 0; volta < 8; volta++) {
        const r = await perguntar(msgs.current, sistema(ctx()));
        msgs.current.push({ role: "assistant", content: r.content });
        const fala = r.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
        const usos = r.content.filter((b: any) => b.type === "tool_use");
        if (!usos.length) { add({ k: "ia", t: fala || "Pronto.", cartoes: dedup(cartoes) }); return; }
        const results: any[] = []; const pend: Pend[] = [];
        for (const u of usos) {
          if (ESCRITAS.includes(u.name)) {
            const v = proporEscrita(u.name, u.input, ctx());
            if (!v.ok) results.push({ type: "tool_result", tool_use_id: u.id, content: v.erro, is_error: true });
            else pend.push({ id: u.id, nome: u.name, args: u.input, p: v.p as Proposta });
          } else {
            const ex = executarLeitura(u.name, u.input, ctx());
            if (ex.cartoes.length) cartoes = ex.cartoes;
            results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(ex.dados) });
          }
        }
        if (pend.length) {
          if (fala) add({ k: "ia", t: fala });
          pendRef.current = { results, pend, cartoes };
          add({ k: "conf", pend, estado: "aguardando" });
          return;
        }
        msgs.current.push({ role: "user", content: results });
      }
      add({ k: "erro", t: "Demorei demais para concluir. Tente pedir de outro jeito." });
    } catch (e: any) {
      // conversa travada por erro: tira a última volta para a próxima pergunta não herdar um pedido sem resposta
      add({ k: "erro", t: e?.message || "Não foi possível falar com o assistente agora." });
      while (msgs.current.length && msgs.current[msgs.current.length - 1].role === "assistant") msgs.current.pop();
    } finally { setPensando(false); }
  }

  async function enviar(t: string) {
    t = t.trim();
    if (!t || pensando || pendRef.current) return;
    if (msgs.current.length > 70) { msgs.current = []; add({ k: "erro", t: "Conversa muito longa: comecei uma nova para não perder o fio." }); }
    setTexto(""); add({ k: "u", t });
    msgs.current.push({ role: "user", content: t });
    await rodar();
  }

  async function decidir(ok: boolean) {
    const p = pendRef.current; if (!p) return;
    pendRef.current = null; setPensando(true);
    const resumo: string[] = [];
    for (const x of p.pend) {
      if (ok) { const r = await executarEscrita(x.nome, x.args, ctx()); p.results.push({ type: "tool_result", tool_use_id: x.id, content: r.texto, is_error: !r.ok }); resumo.push(r.texto); }
      else p.results.push({ type: "tool_result", tool_use_id: x.id, content: "A pessoa cancelou. Nada foi alterado." });
    }
    msgs.current.push({ role: "user", content: p.results });
    setItens(l => l.map(i => (i.k === "conf" && i.estado === "aguardando" ? { ...i, estado: ok ? "feito" : "cancelado", resultado: resumo.join(" ") } as Item : i)));
    await rodar(p.cartoes);
  }

  function falar() {
    if (!SR) { appRef.current.toast("O ditado por voz não funciona neste navegador. Use o microfone do teclado."); return; }
    if (ouvindo) { recRef.current?.stop(); return; }
    const r = new SR(); r.lang = "pt-BR"; r.interimResults = true; r.continuous = false; finalRef.current = "";
    r.onresult = (e: any) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setTexto(t); finalRef.current = t; };
    r.onend = () => { setOuvindo(false); const t = finalRef.current; finalRef.current = ""; if (t.trim()) enviar(t); };
    r.onerror = () => setOuvindo(false);
    recRef.current = r; setOuvindo(true); try { r.start(); } catch { setOuvindo(false); }
  }

  const nova = () => { msgs.current = []; pendRef.current = null; setItens([]); setTexto(""); };
  const abrirFicha = (id: string) => { setAberto(false); appRef.current.abrirDetalhe(id); };

  if (!status || !status.liberado) return null;
  if (!aberto) return <button className="as-fab" aria-label="Abrir o Assistente 360" onClick={() => setAberto(true)}>360</button>;

  return <div className="as-painel" role="dialog" aria-label="Assistente 360">
    <div className="as-topo">
      <div><b>Assistente 360</b><span>em teste · só você vê</span></div>
      <button className="as-mini" onClick={nova} disabled={pensando}>Nova conversa</button>
      <button className="as-x" aria-label="Fechar" onClick={() => setAberto(false)}>✕</button>
    </div>
    <div className="as-msgs">
      {!status.configurado && <div className="as-aviso">A chave do Claude ainda não foi ligada no Vercel (ANTHROPIC_API_KEY). Assim que ligar, o assistente passa a responder.</div>}
      {!itens.length && <div className="as-vazio">
        <p>Pergunte ou peça por voz. Eu consulto o sistema com o seu acesso e, antes de alterar qualquer coisa, peço a sua confirmação.</p>
        <div className="as-sug">{SUGESTOES.map(s => <button key={s} onClick={() => enviar(s)} disabled={!status.configurado}>{s}</button>)}</div>
      </div>}
      {itens.map((i, n) => i.k === "u" ? <div key={n} className="as-u">{i.t}</div>
        : i.k === "erro" ? <div key={n} className="as-erro">{i.t}</div>
        : i.k === "ia" ? <div key={n} className="as-ia">
            <div className="as-txt">{i.t}</div>
            {!!i.cartoes?.length && <div className="as-cards">{i.cartoes.map(c => <div key={c.id} className="as-card">
              <div><b>{c.cliente}</b><span>{c.quando}{c.info ? " · " + c.info : ""}{c.aviso ? " · " : ""}{c.aviso && <em className={c.aviso === "sem anexo" ? "no" : "ok"}>{c.aviso}</em>}</span></div>
              <button onClick={() => abrirFicha(c.id)}>Abrir ficha</button></div>)}</div>}
          </div>
        : <div key={n} className="as-conf">
            <div className="as-conf-t">{i.pend[0].p.titulo}{i.pend.length > 1 ? ` (+${i.pend.length - 1})` : ""}</div>
            {i.pend.map(p => <div key={p.id} className="as-conf-l">{p.p.linhas.map((l, k) => <div key={k}>{l}</div>)}{p.p.avisos.map((a, k) => <div key={"a" + k} className="as-conf-av">⚠️ {a}</div>)}</div>)}
            {i.estado === "aguardando" ? <div className="as-conf-b">
              <button className="btn primary" onClick={() => decidir(true)} disabled={pensando}>Confirmar</button>
              <button className="btn ghost" onClick={() => decidir(false)} disabled={pensando}>Cancelar</button></div>
              : <div className="as-conf-r">{i.estado === "feito" ? "✅ " + (i.resultado || "Confirmado") : "Cancelado — nada foi alterado."}</div>}
          </div>)}
      {pensando && <div className="as-pensa">Consultando…</div>}
      <div ref={fimRef} />
    </div>
    <form className="as-entrada" onSubmit={e => { e.preventDefault(); enviar(texto); }}>
      <input aria-label="Mensagem para o assistente" placeholder={ouvindo ? "Ouvindo…" : "Pergunte ao assistente"} value={texto} onChange={e => setTexto(e.target.value)}
        disabled={pensando || !!pendRef.current || !status.configurado} />
      <button type="button" className={"as-mic" + (ouvindo ? " on" : "")} aria-label={ouvindo ? "Parar de ouvir" : "Falar com o assistente"} onClick={falar}
        disabled={pensando || !!pendRef.current || !status.configurado}>🎤</button>
      <button type="submit" className="as-env" aria-label="Enviar" disabled={pensando || !texto.trim() || !!pendRef.current || !status.configurado}>➤</button>
    </form>
  </div>;
}

function dedup(l: Cartao[]) { const v = new Set<string>(); return l.filter(c => (v.has(c.id) ? false : (v.add(c.id), true))).slice(0, 10); }
