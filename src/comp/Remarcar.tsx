// Alterar data da visita / da vinda à loja, e editar os dados do cliente
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtDateTime, telefonesInvalidos } from "../lib/regras";
import { CampoTelefones } from "./Whats";

export function RemarcarData({ c, tipo, movel }: { c: any; tipo: "visita" | "loja"; movel?: boolean }) {
  const { R, executar: ex, toast } = useApp() as any;
  const atual = tipo === "visita" ? c.dataVisita : c.dataLoja;
  const val = atual ? String(atual).slice(0, 16) : "";
  const [aberto, setAberto] = useState(false);
  const [nova, setNova] = useState(val); const [mot, setMot] = useState("");
  const pode = tipo === "visita" ? R.podeMudarDataVisita(c) : (!!c.dataLoja && R.podeMudarDataLoja(c));
  if (!pode) return null;
  const agoraL = (() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); })();
  const salvar = () => {
    if (!nova || nova.length < 16) { toast("Escolha o dia e a hora da nova data"); return; }
    if (nova === val) { toast("A data já é essa"); return; }
    if (nova < agoraL) { toast("Essa data já passou — escolha uma data a partir de hoje (confira o dia e o mês)"); return; }
    const f = tipo === "visita" ? A.reagendarVisita : A.reagendarLoja;
    ex(() => f(c.id, nova, mot.trim()), tipo === "visita" ? "Visita remarcada" : "Vinda à loja reagendada").then((ok: boolean) => { if (ok) { setAberto(false); setMot(""); } });
  };
  const rot = tipo === "visita" ? (atual ? "📅 Alterar data da visita" : "📅 Definir data da visita") : "📅 Alterar data na loja";
  if (!aberto) return <button className={movel ? "mv-op" : "btn sm"} style={movel ? { width: "100%", marginTop: 8 } : undefined} onClick={() => { setNova(val && val >= agoraL ? val : ""); setAberto(true); }}>{rot}</button>;
  return (
    <div className={movel ? "mv-bloco" : "resp-box"} style={movel ? undefined : { marginTop: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{tipo === "visita" ? "Nova data da visita" : "Nova data na loja"}</div>
      {atual && <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 6 }}>Atual: {fmtDateTime(atual)}{val < agoraL ? " (já passou)" : ""}</div>}
      {nova && <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: nova < agoraL ? "var(--danger)" : "var(--st-concluida)" }}>{nova < agoraL ? "⚠ Data no passado: " : "Nova data: "}{fmtDateTime(nova)}</div>}
      {/* dia e hora separados: o seletor de data+hora junto do iPhone confunde (mudava só a hora e mantinha o dia antigo) */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>{[0, 1, 2, 3].map(k => { const d0 = new Date(); d0.setDate(d0.getDate() + k); const iso = d0.getFullYear() + "-" + String(d0.getMonth() + 1).padStart(2, "0") + "-" + String(d0.getDate()).padStart(2, "0");
        return <button key={k} type="button" className="btn sm" style={nova.slice(0, 10) === iso ? { background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" } : undefined} onClick={() => setNova(iso + "T" + (nova.slice(11, 16) || "09:00"))}>{k === 0 ? "Hoje" : k === 1 ? "Amanhã" : String(d0.getDate()).padStart(2, "0") + "/" + String(d0.getMonth() + 1).padStart(2, "0")}</button>; })}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 8 }}>
        <label style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Dia<input type="date" value={nova.slice(0, 10)} min={agoraL.slice(0, 10)} onChange={e => setNova(e.target.value ? e.target.value + "T" + (nova.slice(11, 16) || "09:00") : "")} style={{ width: "100%", boxSizing: "border-box", fontSize: 16, display: "block" }} /></label>
        <label style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Hora<input type="time" step={900} value={nova.slice(11, 16)} onChange={e => setNova((nova.slice(0, 10) || agoraL.slice(0, 10)) + "T" + (e.target.value || "09:00"))} style={{ width: "100%", boxSizing: "border-box", fontSize: 16, display: "block" }} /></label>
      </div>
      <input placeholder="Motivo (ex.: cliente pediu outro dia)" value={mot} onChange={e => setMot(e.target.value)} style={{ width: "100%", marginTop: 8 }} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button className={movel ? "mv-principal" : "btn primary sm"} onClick={salvar}>Salvar nova data</button><button className="btn ghost sm" onClick={() => setAberto(false)}>Cancelar</button></div>
      <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 6 }}>Fica no histórico e {tipo === "visita" ? "o consultor / a supervisão do marketing são avisados" : "o vendedor e o consultor são avisados"}.</div>
    </div>
  );
}

export function EditarCliente({ c }: { c: any }) {
  const { R, executar: ex, toast } = useApp() as any;
  const ini = () => ({ cliente: c.cliente || "", clienteDoc: c.clienteDoc || "", telefone: c.telefone || "", email: c.email || "", endereco: c.endereco || "" });
  const [f, setF] = useState<any>(ini); const [aberto, setAberto] = useState(false);
  if (!R.podeEditarCliente()) return null;
  const s = (k: string) => (e: any) => setF((x: any) => ({ ...x, [k]: e.target.value }));
  const salvar = () => {
    if (!f.cliente.trim()) { toast("Informe o nome do cliente"); return; }
    if (String(f.telefone).replace(/\D/g, "").length < 10) { toast("Informe o telefone com DDD"); return; }
    if (telefonesInvalidos(f.telefone).length) { toast("Telefone incompleto: " + telefonesInvalidos(f.telefone)[0]); return; }
    ex(() => A.editarCliente(c.id, f), "Dados do cliente atualizados").then((ok: boolean) => ok && setAberto(false));
  };
  if (!aberto) return <button className="btn sm" onClick={() => { setF(ini()); setAberto(true); }}>✏️ Editar dados do cliente</button>;
  return (
    <div className="resp-box" style={{ marginTop: 10, width: "100%" }}><h4>Editar dados do cliente</h4>
      <div className="grid">
        <div className="field"><label>Nome <span className="req-star">*</span></label><input value={f.cliente} onChange={s("cliente")} /></div>
        <div className="field"><label>CPF / CNPJ</label><input value={f.clienteDoc} onChange={s("clienteDoc")} placeholder="000.000.000-00" /></div>
        <div className="field"><label>Telefone <span className="req-star">*</span></label><CampoTelefones valor={f.telefone} onChange={v => setF((x: any) => ({ ...x, telefone: v }))} onAviso={toast} /></div>
        <div className="field"><label>E-mail</label><input value={f.email} onChange={s("email")} /></div>
        <div className="field full"><label>Endereço</label><input value={f.endereco} onChange={s("endereco")} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button className="btn primary sm" onClick={salvar}>Salvar</button><button className="btn ghost sm" onClick={() => setAberto(false)}>Cancelar</button></div>
      <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 6 }}>A alteração (antes → depois) fica registrada no histórico.</div>
    </div>
  );
}
