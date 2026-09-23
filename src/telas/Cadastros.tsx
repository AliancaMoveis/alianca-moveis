import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { LIBS, inicial } from "../lib/regras";
import { Modal } from "../comp/Modal";

// ================= Fábricas e representantes =================
export function Cadastros() {
  const { st, executar, setModal } = useApp();
  const [sub, setSub] = useState("fabricas");
  return (
    <section className="view active" id="view-cadastros">
      <div className="view-head"><div><h2>Fábricas</h2><p>Fábricas e representantes. O representante pode atender várias fábricas e é dele que sai o botão de WhatsApp no chamado. Visível apenas para Supervisão e Gestão.</p></div></div>
      <div className="subnav" id="subnav"><button className={sub === "fabricas" ? "on" : ""} onClick={() => setSub("fabricas")}>Fábricas</button><button className={sub === "reps" ? "on" : ""} onClick={() => setSub("reps")}>Representantes</button></div>
      {sub === "fabricas" && <div id="subFabricas"><div style={{ marginBottom: 14 }}><button className="btn primary" onClick={() => setModal(<EditFab id={null} />)}>Adicionar fábrica</button></div>
        <div id="listaFab">{st.fabricas.length ? st.fabricas.map(f => { const r = st.representantes.find(x => x.id === f.repId); return (
          <div className="fab" key={f.id}><div className="fi">{inicial(f.nome)}</div><div><div className="fn">{f.nome}</div><div className="fc">{f.emails || "sem e-mail"} · Rep.: {r ? r.nome : "—"}</div></div>
            <div className="sp"><button className="btn ghost sm" onClick={() => setModal(<EditFab id={f.id} />)}>Editar</button><button className="btn danger sm" onClick={() => executar(() => A.removerFabrica(f.id), "Fábrica removida")}>Remover</button></div></div>); })
          : <div className="empty">Nenhuma fábrica.</div>}</div></div>}
      {sub === "reps" && <div id="subReps"><div style={{ marginBottom: 14 }}><button className="btn primary" onClick={() => setModal(<EditRep id={null} />)}>Adicionar representante</button></div>
        <div id="listaRep">{st.representantes.length ? st.representantes.map(r => { const nf = st.fabricas.filter(f => f.repId === r.id).length; return (
          <div className="fab" key={r.id}><div className="fi">{inicial(r.nome)}</div><div><div className="fn">{r.nome}</div><div className="fc">{r.whats ? "WhatsApp " + r.whats : "sem WhatsApp"}{r.email ? " · " + r.email : ""} · {nf} fábrica(s)</div></div>
            <div className="sp"><button className="btn ghost sm" onClick={() => setModal(<EditRep id={r.id} />)}>Editar</button><button className="btn danger sm" onClick={() => executar(() => A.removerRepresentante(r.id), "Representante removido")}>Remover</button></div></div>); })
          : <div className="empty">Nenhum representante.</div>}</div></div>}
    </section>
  );
}

function EditFab({ id }: { id: string | null }) {
  const { st, executar, setModal, toast } = useApp();
  const f = id ? st.fabricas.find(x => x.id === id) : { nome: "", emails: "", repId: "" };
  const [nome, setNome] = useState(f.nome); const [emails, setEmails] = useState(f.emails || ""); const [rep, setRep] = useState(f.repId || "");
  const fechar = () => setModal(null);
  return (
    <Modal titulo={id ? "Editar fábrica" : "Nova fábrica"} onFechar={fechar}>
      <div className="field" style={{ marginBottom: 14 }}><label>Nome <span className="req-star">*</span></label><input value={nome} onChange={e => setNome(e.target.value)} /></div>
      <div className="field" style={{ marginBottom: 14 }}><label>E-mails <span className="hint">(vírgula)</span></label><input value={emails} onChange={e => setEmails(e.target.value)} /></div>
      <div className="field" style={{ marginBottom: 20 }}><label>Representante</label><select value={rep} onChange={e => setRep(e.target.value)}><option value="">Sem representante</option>{st.representantes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></div>
      <button className="btn primary" onClick={async () => { if (!nome.trim()) { toast("Informe o nome"); return; } if (await executar(() => A.salvarFabrica(id, nome, emails, rep), "Fábrica salva")) fechar(); }}>Salvar</button>
    </Modal>
  );
}
function EditRep({ id }: { id: string | null }) {
  const { st, executar, setModal, toast } = useApp();
  const r = id ? st.representantes.find(x => x.id === id) : { nome: "", whats: "", email: "" };
  const [nome, setNome] = useState(r.nome); const [whats, setWhats] = useState(r.whats || ""); const [email, setEmail] = useState(r.email || "");
  const fechar = () => setModal(null);
  return (
    <Modal titulo={id ? "Editar representante" : "Novo representante"} onFechar={fechar}>
      <div className="field" style={{ marginBottom: 14 }}><label>Nome <span className="req-star">*</span></label><input value={nome} onChange={e => setNome(e.target.value)} /></div>
      <div className="field" style={{ marginBottom: 14 }}><label>WhatsApp <span className="hint">(com DDD)</span></label><input value={whats} onChange={e => setWhats(e.target.value)} /></div>
      <div className="field" style={{ marginBottom: 20 }}><label>E-mail</label><input value={email} onChange={e => setEmail(e.target.value)} /></div>
      <button className="btn primary" onClick={async () => { if (!nome.trim()) { toast("Informe o nome"); return; } if (await executar(() => A.salvarRepresentante(id, nome, whats, email), "Representante salvo")) fechar(); }}>Salvar</button>
    </Modal>
  );
}

// ================= Administração =================
export function Admin() {
  const { R, st, executar, setModal, toast } = useApp();
  const [sub, setSub] = useState("usuarios");
  const [pct, setPct] = useState(String(st.config.comissaoPct)); const [pag, setPag] = useState(String(st.config.pagamentoVisita));
  const ativos = st.usuarios.filter(u => u.ativo), inativos = st.usuarios.filter(u => !u.ativo);
  const linhaUser = (u: any) => (
    <div className="fab" key={u.id} style={u.ativo ? undefined : { opacity: .6 }}><div className="fi">{inicial(u.nome)}</div>
      <div><div className="fn">{u.nome} {u.id === R.currentUserId && <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>(logado)</span>}{!u.ativo && <span className="pill" style={{ marginLeft: 6 }}>desativado</span>}</div>
        <div className="fc">{(u.setores || []).length ? u.setores.map((id: string) => <span key={id} className="perfil-tag" style={{ marginRight: 4 }}>{R.setorNome(id)}</span>) : "sem setor"}{u.somenteAtribuidos && <span className="pill" style={{ marginLeft: 4 }}>consultor externo</span>}{u.email ? <span style={{ marginLeft: 6 }}>{u.email}</span> : null}</div></div>
      <div className="sp">
        {u.ativo ? <>
          <button className="btn ghost sm" onClick={() => setModal(<EditUser id={u.id} />)}>Editar</button>
          <button className="btn danger sm" onClick={() => { if (confirm("Remover o acesso de " + u.nome + "? O histórico dele continua no sistema.")) executar(() => A.desativarUsuario(u.id), "Usuário removido"); }}>Remover</button>
        </> : <button className="btn sm" onClick={() => executar(() => A.reativarUsuario(u.id), "Usuário reativado")}>Reativar</button>}
      </div></div>
  );
  return (
    <section className="view active" id="view-admin">
      <div className="view-head"><div><h2>Administração</h2><p>Usuários, setores e roteamento. Acesso restrito a quem tem a liberação de Administração.</p></div></div>
      <div className="subnav" id="subnavAdm">{[["usuarios", "Usuários"], ["setores", "Setores e liberações"], ["rotas", "Roteamento"], ["comissoes", "Comissões e testes"]].map(([k, l]) => <button key={k} className={sub === k ? "on" : ""} onClick={() => setSub(k)}>{l}</button>)}</div>
      {sub === "usuarios" && <div id="subUsuarios"><div style={{ marginBottom: 14 }}><button className="btn primary" onClick={() => setModal(<EditUser id={null} />)}>Adicionar usuário</button></div>
        <div id="listaUser">{ativos.length ? ativos.map(linhaUser) : <div className="empty">Ninguém cadastrado.</div>}{inativos.length > 0 && <><div className="sec-label" style={{ marginTop: 18 }}>Desativados</div>{inativos.map(linhaUser)}</>}</div></div>}
      {sub === "setores" && <div id="subSetores"><div style={{ marginBottom: 14 }}><button className="btn primary" onClick={() => setModal(<EditSetor id={null} />)}>Adicionar setor</button></div>
        <div id="listaSetores">{st.setores.map(s => {
          const n = ativos.filter(u => (u.setores || []).includes(s.id)).length;
          const libs = Object.keys(LIBS).filter(k => s.liberacoes && s.liberacoes[k]).map(k => LIBS[k]);
          return (
            <div className="fab" key={s.id}><div className="fi">{inicial(s.nome)}</div><div><div className="fn">{s.nome} <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>· {n} usuário(s)</span></div><div className="fc">{libs.length ? libs.join(" · ") : "Sem liberações especiais (fila operacional padrão)"}</div></div>
              <div className="sp"><button className="btn ghost sm" onClick={() => setModal(<EditSetor id={s.id} />)}>Editar</button><button className="btn danger sm" onClick={() => executar(() => A.removerSetor(s.id), "Setor removido")}>Remover</button></div></div>);
        })}</div></div>}
      {sub === "rotas" && <div id="subRotas"><div className="rota-map" id="rotaMap">{Object.entries(R.TIPOS).map(([k, t]: any) => (
        <div className="rota-item" key={k}><span>{t.nome}</span><span className="ar">→</span>
          <select style={{ width: "auto", padding: "6px 9px" }} value={t.destino} onChange={e => { const v = e.target.value; executar(() => A.salvarRoteamento(k, v), "Roteamento de \"" + t.nome + "\" atualizado para " + R.setorNome(v)); }}>
            {R.operacionais().map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>{t.anexos && <span className="pill" style={{ marginLeft: "auto" }}>com anexos</span>}</div>))}</div></div>}
      {sub === "comissoes" && <div id="subComissoes"><div className="card" style={{ padding: "18px 20px", maxWidth: 480 }}><div className="grid">
        <div className="field"><label>Comissão do consultor sobre a venda</label><div className="inline-2"><input type="number" step="0.1" style={{ maxWidth: 100 }} value={pct} onChange={e => setPct(e.target.value)} /><span>%</span></div></div>
        <div className="field"><label>Pagamento fixo por visita realizada + agendada</label><div className="inline-2"><span>R$</span><input type="number" step="1" style={{ maxWidth: 120 }} value={pag} onChange={e => setPag(e.target.value)} /></div></div>
      </div><div style={{ marginTop: 14 }}><button className="btn primary sm" onClick={() => { const a = parseFloat(pct), b = parseFloat(pag); if (isNaN(a) || isNaN(b)) { toast("Informe valores válidos"); return; } executar(() => A.salvarConfig(a, b), "Configuração salva"); }}>Salvar</button></div></div>
        <div className="card" style={{ padding: "18px 20px", maxWidth: 480, marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Modo de teste</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>Com o modo de teste ligado, a Gestão pode usar “Entrar como… (teste)” no menu lateral para ver o sistema exatamente como cada usuário vê. Desligue quando o sistema entrar em uso real.</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" style={{ width: "auto" }} checked={st.config.modoTeste !== false} onChange={e => { const v = e.target.checked; executar(() => A.salvarModoTeste(v), v ? "Modo de teste ligado" : "Modo de teste desligado"); }} /> Modo de teste ligado</label>
        </div></div>}
    </section>
  );
}

function EditUser({ id }: { id: string | null }) {
  const { st, executar, setModal, toast } = useApp();
  const u: any = id ? st.usuarios.find(x => x.id === id) : { nome: "", setores: [], somenteAtribuidos: false, email: "" };
  const [nome, setNome] = useState(u.nome); const [setores, setSetores] = useState<string[]>(u.setores || []); const [ext, setExt] = useState(!!u.somenteAtribuidos);
  const [email, setEmail] = useState(u.email || ""); const [senha, setSenha] = useState("");
  const fechar = () => setModal(null);
  const toggle = (s: string) => setSetores(x => x.includes(s) ? x.filter(y => y !== s) : [...x, s]);
  async function salvar() {
    if (!nome.trim()) { toast("Informe o nome"); return; }
    if (!setores.length) { toast("Marque ao menos um setor"); return; }
    const ordenados = st.setores.map(s => s.id).filter(s => setores.includes(s));
    if (!id) {
      if (!email.includes("@")) { toast("Informe o e-mail de acesso"); return; }
      if (senha.length < 8) { toast("A senha inicial precisa ter pelo menos 8 caracteres"); return; }
      if (await executar(() => A.adminUsuarios({ acao: "criar", nome, email, senha, setores: ordenados, somenteAtribuidos: ext }), "Usuário salvo")) fechar();
      return;
    }
    const ok = await executar(async () => {
      await A.salvarUsuario(id, nome, ordenados, ext);
      if (email.trim() && email.trim().toLowerCase() !== (u.email || "").toLowerCase()) await A.adminUsuarios({ acao: "email", id, email });
      if (senha) await A.adminUsuarios({ acao: "senha", id, senha });
    }, "Usuário salvo");
    if (ok) fechar();
  }
  return (
    <Modal titulo={id ? "Editar usuário" : "Novo usuário"} onFechar={fechar}>
      <div className="field" style={{ marginBottom: 14 }}><label>Nome <span className="req-star">*</span></label><input value={nome} onChange={e => setNome(e.target.value)} /></div>
      <div className="field" style={{ marginBottom: 14 }}><label>E-mail de acesso {!id && <span className="req-star">*</span>}</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@aliancamoveis.com.br" /></div>
      <div className="field" style={{ marginBottom: 14 }}><label>{id ? <>Nova senha <span className="hint">(deixe vazio para não mudar)</span></> : <>Senha inicial <span className="req-star">*</span> <span className="hint">(mín. 8 caracteres — a pessoa pode trocar depois)</span></>}</label><input type="text" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="off" /></div>
      <div className="field" style={{ marginBottom: 14 }}><label>Setores <span className="req-star">*</span> <span className="hint">(pode marcar mais de um)</span></label>
        <div id="uSetores">{st.setores.map(s => <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--line-soft)" }}><input type="checkbox" checked={setores.includes(s.id)} onChange={() => toggle(s.id)} style={{ width: "auto" }} /> {s.nome}</label>)}</div></div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}><input type="checkbox" checked={ext} onChange={e => setExt(e.target.checked)} style={{ width: "auto" }} /> É consultor externo <span className="hint">(vê e trata apenas o que for atribuído a ele mesmo, mesmo dentro do setor)</span></label>
      <button className="btn primary" onClick={salvar}>Salvar</button>
    </Modal>
  );
}

function EditSetor({ id }: { id: string | null }) {
  const { st, executar, setModal, toast } = useApp();
  const s: any = id ? st.setores.find(x => x.id === id) : { nome: "", liberacoes: {} };
  const [nome, setNome] = useState(s.nome); const [libs, setLibs] = useState<Record<string, boolean>>({ ...(s.liberacoes || {}) });
  const fechar = () => setModal(null);
  return (
    <Modal titulo={id ? "Editar setor" : "Novo setor"} onFechar={fechar}>
      <div className="field" style={{ marginBottom: 14 }}><label>Nome do setor <span className="req-star">*</span></label><input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Trocas e devoluções" /></div>
      <div className="field" style={{ marginBottom: 20 }}><label>Liberações deste setor <span className="hint">(valem para todos os usuários dele)</span></label><div>
        {Object.entries(LIBS).map(([k, l]) => <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--line-soft)" }}><input type="checkbox" checked={!!libs[k]} onChange={e => setLibs(x => ({ ...x, [k]: e.target.checked }))} style={{ width: "auto" }} /> {l}</label>)}
      </div></div>
      <button className="btn primary" onClick={async () => { if (!nome.trim()) { toast("Informe o nome"); return; } if (await executar(() => A.salvarSetor(id, nome, libs), "Setor salvo")) fechar(); }}>Salvar</button>
    </Modal>
  );
}
