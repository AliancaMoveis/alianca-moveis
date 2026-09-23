// Treinamento do call center: situações simuladas com resposta sugerida, o que fazer no sistema e o que evitar.
// Acesso (garantido no banco): call center, Supervisão e Gestão. Supervisão/Gestão publicam; o call center sugere.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { Modal } from "../comp/Modal";

export const CATEGORIAS: Record<string, string> = {
  entrega: "Entrega", atraso: "Atraso e prazo", montagem: "Montagem", defeito: "Defeito e avaria",
  cancelamento: "Cancelamento e dinheiro", reclamacao_externa: "Reclame Aqui, Procon e redes", retorno: "Retorno ao cliente", geral: "Cliente exaltado e geral",
};
type Roteiro = { id: string; categoria: string; situacao: string; cliente_diz: string; resposta: string; no_sistema: string; evitar: string; status: string; autor_id: string; autor_nome: string };

export default function Treino() {
  const { R, toast, setModal } = useApp() as any;
  const [lista, setLista] = useState<Roteiro[] | null>(null);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [aba, setAba] = useState<"roteiros" | "simular" | "sugestoes">("roteiros");
  const gestor = R.ehGestao() || R.mySetores().includes("supervisao");
  const carregar = () => A.listarRoteiros().then(setLista).catch((e: any) => { setLista([]); toast(e.message); });
  useEffect(() => { carregar(); }, []);

  const aprovados = (lista || []).filter(r => r.status === "aprovado");
  const sugestoes = (lista || []).filter(r => r.status === "sugestao");
  const t = q.trim().toLowerCase();
  const filtrados = aprovados.filter(r => (!cat || r.categoria === cat) && (!t || (r.situacao + " " + r.cliente_diz + " " + r.resposta).toLowerCase().includes(t)));
  const editar = (r: Roteiro | null) => setModal(<EditRoteiro r={r} gestor={gestor} aoSalvar={carregar} />);

  return (
    <section className="view active" id="view-treino">
      <div className="view-head"><div><h2>Treinamento</h2>
        <p>Situações do dia a dia com respostas sugeridas: o que dizer, o que fazer no sistema e o que evitar. Use como base e fale do seu jeito.</p></div>
        <button className="btn primary" onClick={() => editar(null)}>{gestor ? "Novo roteiro" : "Sugerir roteiro"}</button></div>
      <div className="subnav" style={{ marginBottom: 14 }}>
        <button className={aba === "roteiros" ? "on" : ""} onClick={() => setAba("roteiros")}>Roteiros</button>
        <button className={aba === "simular" ? "on" : ""} onClick={() => setAba("simular")}>Simular atendimento</button>
        <button className={aba === "sugestoes" ? "on" : ""} onClick={() => setAba("sugestoes")}>{gestor ? "Sugestões do time" : "Minhas sugestões"}{sugestoes.length ? ` (${sugestoes.length})` : ""}</button>
      </div>
      {lista === null ? <div className="empty">Carregando…</div> : aba === "simular" ? <Simular lista={aprovados} /> : aba === "sugestoes" ? (
        sugestoes.length ? <div className="list">{sugestoes.map(r => <Cartao key={r.id} r={r} gestor={gestor} editar={editar} recarregar={carregar} />)}</div>
          : <div className="empty"><div className="big">Nenhuma sugestão pendente</div>{gestor ? "Quando alguém do call center sugerir um roteiro, ele aparece aqui para você aprovar." : "Sugira um roteiro que funcionou com um cliente: a Supervisão revisa e publica para todo o time."}</div>
      ) : (
        <>
          <div className="toolbar">
            <div className="search"><input placeholder="Buscar: prazo, Procon, montador, cancelar…" value={q} onChange={e => setQ(e.target.value)} /></div>
          </div>
          <div className="chips">
            <button className={"chip" + (!cat ? " on" : "")} onClick={() => setCat("")}>Todas<span className="n">{aprovados.length}</span></button>
            {Object.entries(CATEGORIAS).map(([k, l]) => { const n = aprovados.filter(r => r.categoria === k).length; return n ? <button key={k} className={"chip" + (cat === k ? " on" : "")} onClick={() => setCat(k)}>{l}<span className="n">{n}</span></button> : null; })}
          </div>
          <div className="list">{filtrados.length ? filtrados.map(r => <Cartao key={r.id} r={r} gestor={gestor} editar={editar} recarregar={carregar} />) : <div className="empty">Nenhum roteiro para este filtro.</div>}</div>
        </>
      )}
    </section>
  );
}

function Bloco({ t, cor, children }: any) {
  if (!children) return null;
  return <div style={{ marginTop: 10 }}><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: cor || "var(--ink-faint)", marginBottom: 3 }}>{t}</div><div style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{children}</div></div>;
}

function Cartao({ r, gestor, editar, recarregar }: any) {
  const { R, executar } = useApp() as any;
  const [aberto, setAberto] = useState(false);
  const meu = r.autor_id === R.currentUserId;
  return (
    <div className="card" style={{ padding: "14px 18px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }} onClick={() => setAberto(a => !a)}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11.5, color: "var(--ink-faint)", fontWeight: 600 }}>{CATEGORIAS[r.categoria] || r.categoria}{r.status === "sugestao" ? " · sugestão de " + r.autor_nome : ""}</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>{r.situacao}</div>
          {r.cliente_diz && <div style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 4, fontStyle: "italic" }}>“{r.cliente_diz}”</div>}
        </div>
        <span style={{ color: "var(--ink-faint)", fontSize: 12 }}>{aberto ? "▲" : "▼"}</span>
      </div>
      {aberto && <>
        <Bloco t="Resposta sugerida" cor="var(--st-concluida)">{r.resposta}</Bloco>
        <Bloco t="No sistema" cor="var(--primary)">{r.no_sistema}</Bloco>
        <Bloco t="Evite" cor="var(--danger)">{r.evitar}</Bloco>
        {(gestor || (meu && r.status === "sugestao")) && (
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {gestor && r.status === "sugestao" && <button className="btn primary sm" onClick={() => executar(() => A.aprovarRoteiro(r.id).then(recarregar), "Roteiro publicado para o time")}>Aprovar e publicar</button>}
            <button className="btn ghost sm" onClick={() => editar(r)}>Editar</button>
            <button className="btn danger sm" onClick={() => executar(() => A.removerRoteiro(r.id).then(recarregar), "Roteiro removido")}>Remover</button>
          </div>
        )}
      </>}
    </div>
  );
}

// treino: mostra a fala do cliente, a pessoa pensa na resposta e só depois vê a sugerida
function Simular({ lista }: { lista: Roteiro[] }) {
  const [cat, setCat] = useState("");
  const [i, setI] = useState(0);
  const [ver, setVer] = useState(false);
  const pool = lista.filter(r => !cat || r.categoria === cat);
  const r = pool.length ? pool[i % pool.length] : null;
  const proximo = () => { setVer(false); setI(x => pool.length > 1 ? (x + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length : x); };
  return (
    <div>
      <div className="toolbar"><select value={cat} onChange={e => { setCat(e.target.value); setI(0); setVer(false); }}><option value="">Todas as situações</option>{Object.entries(CATEGORIAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      {!r ? <div className="empty">Nenhum roteiro nesta categoria.</div> : (
        <div className="card" style={{ padding: "22px 24px", maxWidth: 760 }}>
          <div style={{ fontSize: 12, color: "var(--ink-faint)", fontWeight: 600 }}>{CATEGORIAS[r.categoria]} · {r.situacao}</div>
          <div style={{ fontSize: 20, fontWeight: 700, margin: "10px 0 6px", lineHeight: 1.35 }}>“{r.cliente_diz || r.situacao}”</div>
          <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>Como você responderia? Pense ou fale em voz alta antes de ver a sugestão.</div>
          {ver ? <>
            <Bloco t="Resposta sugerida" cor="var(--st-concluida)">{r.resposta}</Bloco>
            <Bloco t="No sistema" cor="var(--primary)">{r.no_sistema}</Bloco>
            <Bloco t="Evite" cor="var(--danger)">{r.evitar}</Bloco>
          </> : null}
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            {!ver && <button className="btn primary" onClick={() => setVer(true)}>Ver resposta sugerida</button>}
            <button className="btn" onClick={proximo}>Próxima situação</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditRoteiro({ r, gestor, aoSalvar }: { r: Roteiro | null; gestor: boolean; aoSalvar: () => void }) {
  const { executar, setModal, toast } = useApp() as any;
  const [f, setF] = useState({ categoria: r?.categoria || "geral", situacao: r?.situacao || "", clienteDiz: r?.cliente_diz || "", resposta: r?.resposta || "", noSistema: r?.no_sistema || "", evitar: r?.evitar || "" });
  const s = (k: string) => (e: any) => setF(x => ({ ...x, [k]: e.target.value }));
  const fechar = () => setModal(null);
  return (
    <Modal titulo={r ? "Editar roteiro" : gestor ? "Novo roteiro" : "Sugerir roteiro"} onFechar={fechar}>
      {!gestor && !r && <div className="ro-note" style={{ marginBottom: 14 }}>Sua sugestão vai para a Supervisão, que revisa e publica para todo o time.</div>}
      <div className="grid">
        <div className="field"><label>Categoria</label><select id="rtCat" value={f.categoria} onChange={s("categoria")}>{Object.entries(CATEGORIAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label>Situação <span className="req-star">*</span></label><input id="rtSit" value={f.situacao} onChange={s("situacao")} placeholder="Ex.: Cliente ameaça o Reclame Aqui" /></div>
        <div className="field full"><label>O cliente diz</label><textarea id="rtCli" value={f.clienteDiz} onChange={s("clienteDiz")} placeholder="A fala do cliente, como ele diria" /></div>
        <div className="field full"><label>Resposta sugerida <span className="req-star">*</span></label><textarea id="rtResp" value={f.resposta} onChange={s("resposta")} style={{ minHeight: 110 }} /></div>
        <div className="field full"><label>No sistema</label><textarea id="rtSis" value={f.noSistema} onChange={s("noSistema")} placeholder="O que registrar, que motivo abrir, se marca urgente…" /></div>
        <div className="field full"><label>Evite</label><textarea id="rtEvi" value={f.evitar} onChange={s("evitar")} placeholder="Frases ou atitudes que pioram" /></div>
      </div>
      <div style={{ marginTop: 16 }}><button className="btn primary" onClick={async () => {
        if (!f.situacao.trim() || !f.resposta.trim()) { toast("Preencha a situação e a resposta sugerida"); return; }
        if (await executar(() => A.salvarRoteiro(r ? r.id : null, f), r ? "Roteiro salvo" : gestor ? "Roteiro publicado" : "Sugestão enviada à Supervisão")) { fechar(); aoSalvar(); }
      }}>{gestor || r ? "Salvar" : "Enviar sugestão"}</button></div>
    </Modal>
  );
}
