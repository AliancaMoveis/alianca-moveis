import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";

function Cena({ children }: { children: React.ReactNode }) {
  return (
    <div id="telaLogin">
      <div className="lg-cena">
        <div className="lg-esq">
          <div className="lg-logo">
            <img src="/logo.png" alt="Aliança Móveis" />
            <div className="lg-nome">
              <div><span className="ali">ALIANÇA</span><span className="trs"> 360</span></div>
              <div className="tag">Central de Gestão</div>
            </div>
          </div>
          <div className="lg-hero">
            <h2>Visibilidade total.<br />Do contato à venda.</h2>
            <p>Call center, marketing, consultores externos, vendedores e resultados — em tempo real, num único lugar.</p>
          </div>
          <div className="lg-pills">
            {["Call center", "Marketing", "Consultores externos", "Agendamento loja", "Financeiro", "Relatórios"].map(p => <span key={p} className="lg-pill">{p}</span>)}
          </div>
        </div>
        <div className="lg-card">{children}</div>
      </div>
    </div>
  );
}

export default function Login({ aviso, carregando, sairAntes }: { aviso?: string; carregando?: boolean; sairAntes?: boolean }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [info, setInfo] = useState("");

  useEffect(() => { if (sairAntes) { /* usuário sem perfil: mantém a mensagem, oferece sair */ } }, [sairAntes]);

  async function entrar(e?: React.FormEvent) {
    e?.preventDefault();
    setErro(""); setInfo("");
    if (!email || !senha) { setErro("Informe e-mail e senha."); return; }
    setOcupado(true);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    setOcupado(false);
    if (error) setErro(error.message.includes("Invalid login") ? "E-mail ou senha incorretos." : error.message);
  }
  async function esqueci() {
    setErro(""); setInfo("");
    if (!email.includes("@")) { setErro("Digite seu e-mail acima para receber o link de nova senha."); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (error) setErro(error.message); else setInfo("Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.");
  }

  return (
    <Cena>
      <div className="lg-badge"><i></i> Sistema operacional</div>
      <h1>Bem-vindo ao ALIANÇA 360</h1>
      {carregando ? <p>Carregando…</p> : aviso ? (
        <>
          <p>{aviso}</p>
          {sairAntes && <button className="lg-btn" onClick={() => sb.auth.signOut()}>Sair</button>}
        </>
      ) : (
        <form onSubmit={entrar}>
          <p>Entre com seu e-mail e senha.</p>
          <div className="lg-field">
            <label>E-mail</label>
            <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" />
          </div>
          <div className="lg-field">
            <label>Senha</label>
            <input type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••" />
          </div>
          {erro && <div className="lg-info" style={{ borderColor: "rgba(194,59,59,.5)", color: "#f0b4b4" }}>{erro}</div>}
          {info && <div className="lg-info">{info}</div>}
          <button className="lg-btn" type="submit" disabled={ocupado}>{ocupado ? "Carregando…" : "Entrar no ALIANÇA 360"}</button>
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <button type="button" onClick={esqueci} style={{ background: "none", border: 0, color: "#9fb8a6", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>Esqueci minha senha</button>
          </div>
        </form>
      )}
      <div className="lg-aviso">Acesso restrito · Toda atividade é registrada pelo sistema.</div>
    </Cena>
  );
}

export function NovaSenha({ aoConcluir }: { aoConcluir: () => void }) {
  const [s1, setS1] = useState(""); const [s2, setS2] = useState(""); const [erro, setErro] = useState(""); const [ok, setOk] = useState(false);
  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErro("");
    if (s1.length < 8) { setErro("A senha precisa ter pelo menos 8 caracteres."); return; }
    if (s1 !== s2) { setErro("As senhas não conferem."); return; }
    const { error } = await sb.auth.updateUser({ password: s1 });
    if (error) setErro(error.message); else { setOk(true); setTimeout(aoConcluir, 1200); }
  }
  return (
    <Cena>
      <h1>Criar nova senha</h1>
      <form onSubmit={salvar}>
        <div className="lg-field"><label>Nova senha</label><input type="password" value={s1} onChange={e => setS1(e.target.value)} autoComplete="new-password" /></div>
        <div className="lg-field"><label>Repita a nova senha</label><input type="password" value={s2} onChange={e => setS2(e.target.value)} autoComplete="new-password" /></div>
        {erro && <div className="lg-info" style={{ color: "#f0b4b4" }}>{erro}</div>}
        {ok && <div className="lg-info">Senha alterada.</div>}
        <button className="lg-btn" type="submit">Salvar senha</button>
      </form>
    </Cena>
  );
}
