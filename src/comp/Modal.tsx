import React, { useState } from "react";
import { useApp } from "../estado";
import { sb } from "../lib/supabase";
import { A } from "../lib/acoes";
import { fmtTel } from "../lib/baseClientes";
import Senha from "./Senha";
import { temaAtual, zoomAtual, telaInicial, salvarTema, salvarZoom, salvarInicio, type Tema } from "../lib/preferencias";
import { estadoPush, ativarPush, desativarPush, testarPush, type EstadoPush } from "../lib/push";

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
      <div className="field" style={{ marginBottom: 14 }}><label>Nova senha <span className="hint">(mínimo 8 caracteres)</span></label><Senha value={s1} onChange={e => setS1(e.target.value)} autoComplete="new-password" /></div>
      <div className="field" style={{ marginBottom: 20 }}><label>Repita a nova senha</label><Senha value={s2} onChange={e => setS2(e.target.value)} autoComplete="new-password" /></div>
      <button className="btn primary" onClick={salvar}>Salvar</button>
    </Modal>
  );
}

/** cada usuário preenche o próprio nome completo e telefone */
export function MeusDados() {
  const { setModal, toast, recarregar, R } = useApp() as any;
  const u = R.me() || {};
  const [nome, setNome] = useState(u.nomeCompleto || ""); const [tel, setTel] = useState(u.telefone ? fmtTel(u.telefone) : "");
  const [sal, setSal] = useState(false);
  const fechar = () => setModal(null);
  async function salvar() {
    setSal(true);
    try { await A.salvarMeusDados(nome, tel); await recarregar(); fechar(); toast("Seus dados foram salvos"); }
    catch (e: any) { toast(e.message || "Não foi possível salvar"); setSal(false); }
  }
  return (
    <Modal titulo="Meus dados" onFechar={fechar}>
      <div className="field" style={{ marginBottom: 14 }}><label>Nome completo</label><input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome e sobrenome" autoComplete="name" /></div>
      <div className="field" style={{ marginBottom: 20 }}><label>Telefone (WhatsApp) <span className="hint">com DDD</span></label><input value={tel} onChange={e => setTel(e.target.value)} placeholder="(41) 99999-9999" inputMode="tel" autoComplete="tel" /></div>
      <button className="btn primary" disabled={sal} onClick={salvar}>{sal ? "Salvando…" : "Salvar"}</button>
    </Modal>
  );
}

/** ⚙ Configurações deste aparelho: tema, tamanho do texto, tela inicial e notificações */
export function Configuracoes({ telas }: { telas: [string, string][] }) {
  const { setModal, toast } = useApp() as any;
  const [tema, setTema] = useState<Tema>(temaAtual()); const [zoom, setZoom] = useState(zoomAtual()); const [inicio, setInicio] = useState(telaInicial());
  const [push, setPush] = useState<EstadoPush | null>(null);
  React.useEffect(() => { estadoPush().then(setPush).catch(() => setPush("sem-suporte")); }, []);
  const op = (on: boolean) => ({ flex: 1, padding: "10px 8px", borderRadius: 10, border: "1.5px solid " + (on ? "var(--primary)" : "var(--line)"), background: on ? "var(--primary)" : "var(--surface)", color: on ? "var(--primary-ink, #fff)" : "var(--ink)", fontWeight: 700, cursor: "pointer" } as React.CSSProperties);
  const sec = (t: string, d?: string) => <div style={{ margin: "16px 0 6px" }}><b>{t}</b>{d && <div className="hint">{d}</div>}</div>;
  const pushTxt: Record<string, string> = { ligado: "✅ Ligadas neste aparelho", desligado: "Desligadas", bloqueado: "🚫 Bloqueadas no navegador — libere nas permissões do site", "ios-instalar": "No iPhone, instale o app (Compartilhar → Adicionar à Tela de Início) para receber", "sem-suporte": "Este navegador não recebe notificações" };
  return (
    <Modal titulo="⚙ Configurações" onFechar={() => setModal(null)}>
      <div className="hint">Valem para este aparelho (computador ou celular).</div>
      {sec("Aparência")}
      <div style={{ display: "flex", gap: 8 }}>{([["claro", "☀️ Claro"], ["escuro", "🌙 Escuro"], ["auto", "🖥 Automático"]] as [Tema, string][]).map(([k, l]) =>
        <button key={k} type="button" style={op(tema === k)} onClick={() => { setTema(k); salvarTema(k); }}>{l}</button>)}</div>
      <div className="hint" style={{ marginTop: 4 }}>Automático segue o tema do computador/celular.</div>
      {sec("Tamanho do texto", "Para ler melhor no computador da loja ou no celular")}
      <div style={{ display: "flex", gap: 8 }}>{([[0.9, "Menor"], [1, "Normal"], [1.1, "Grande"], [1.2, "Maior"]] as [number, string][]).map(([k, l]) =>
        <button key={k} type="button" style={{ ...op(zoom === k), fontSize: 12 * k }} onClick={() => { setZoom(k); salvarZoom(k); }}>{l}</button>)}</div>
      {telas.length > 0 && sec("Tela inicial", "A tela que abre quando você entra no 360")}
      {telas.length > 0 && <select value={inicio} onChange={e => { setInicio(e.target.value); salvarInicio(e.target.value); }} style={{ width: "100%" }}>
        <option value="">Padrão (início)</option>{telas.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
      {sec("Notificações", "Aviso de mensagens no chat, clientes direcionados e lembretes")}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 180 }}>{push ? pushTxt[push] : "Verificando…"}</span>
        {push === "desligado" && <button className="btn primary sm" onClick={async () => { try { await ativarPush(); setPush(await estadoPush()); toast("Notificações ligadas"); } catch (e: any) { toast(e.message); } }}>Ligar</button>}
        {push === "ligado" && <><button className="btn sm" onClick={() => testarPush().then(() => toast("Enviamos um aviso de teste")).catch((e: any) => toast(e.message))}>Testar</button>
          <button className="btn ghost sm" onClick={async () => { try { await desativarPush(); setPush(await estadoPush()); } catch (e: any) { toast(e.message); } }}>Desligar</button></>}
      </div>
      <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}><button className="btn primary" onClick={() => setModal(null)}>Pronto</button></div>
    </Modal>
  );
}
