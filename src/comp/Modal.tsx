import React, { useState } from "react";
import { useApp } from "../estado";
import { sb } from "../lib/supabase";

export function Modal({ titulo, onFechar, children, tituloNode }: { titulo?: string; tituloNode?: React.ReactNode; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="overlay on" id="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal" id="modal">
        <div className="mh">{tituloNode || <div className="tid">{titulo}</div>}<button className="x" id="fechar" onClick={onFechar}>&times;</button></div>
        <div className="mb">{children}</div>
      </div>
    </div>
  );
}

export function AlterarSenha() {
  const { setModal, toast } = useApp();
  const [s1, setS1] = useState(""); const [s2, setS2] = useState("");
  const fechar = () => setModal(null);
  async function salvar() {
    if (s1.length < 8) { toast("A senha precisa ter pelo menos 8 caracteres"); return; }
    if (s1 !== s2) { toast("As senhas não conferem"); return; }
    const { error } = await sb.auth.updateUser({ password: s1 });
    if (error) { toast(error.message); return; }
    fechar(); toast("Senha alterada");
  }
  return (
    <Modal titulo="Alterar minha senha" onFechar={fechar}>
      <div className="field" style={{ marginBottom: 14 }}><label>Nova senha <span className="hint">(mínimo 8 caracteres)</span></label><input type="password" value={s1} onChange={e => setS1(e.target.value)} autoComplete="new-password" /></div>
      <div className="field" style={{ marginBottom: 20 }}><label>Repita a nova senha</label><input type="password" value={s2} onChange={e => setS2(e.target.value)} autoComplete="new-password" /></div>
      <button className="btn primary" onClick={salvar}>Salvar</button>
    </Modal>
  );
}
