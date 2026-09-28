// Alterar data da visita / da vinda à loja, e editar os dados do cliente
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtDateTime } from "../lib/regras";

export function RemarcarData({ c, tipo, movel }: { c: any; tipo: "visita" | "loja"; movel?: boolean }) {
  const { R, executar: ex, toast } = useApp() as any;
  const atual = tipo === "visita" ? c.dataVisita : c.dataLoja;
  const val = atual ? String(atual).slice(0, 16) : "";
  const [aberto, setAberto] = useState(false);
  const [nova, setNova] = useState(val); const [mot, setMot] = useState("");
  const pode = tipo === "visita" ? R.podeMudarDataVisita(c) : (!!c.dataLoja && R.podeMudarDataLoja(c));
  if (!pode) return null;
  const salvar = () => {
    if (!nova || nova.length < 16) { toast("Informe a nova data e horário"); return; }
    if (nova === val) { toast("A data já é essa"); return; }
    const f = tipo === "visita" ? A.reagendarVisita : A.reagendarLoja;
    ex(() => f(c.id, nova, mot.trim()), tipo === "visita" ? "Visita remarcada" : "Vinda à loja reagendada").then((ok: boolean) => { if (ok) { setAberto(false); setMot(""); } });
  };
  const rot = tipo === "visita" ? (atual ? "📅 Alterar data da visita" : "📅 Definir data da visita") : "📅 Alterar data na loja";
  if (!aberto) return <button className={movel ? "mv-op" : "btn sm"} style={movel ? { width: "100%", marginTop: 8 } : undefined} onClick={() => { setNova(val); setAberto(true); }}>{rot}</button>;
  return (
    <div className={movel ? "mv-bloco" : "resp-box"} style={movel ? undefined : { marginTop: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{tipo === "visita" ? "Nova data da visita" : "Nova data na loja"}</div>
      {atual && <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 6 }}>Atual: {fmtDateTime(atual)}</div>}
      <input type="datetime-local" value={nova} onChange={e => setNova(e.target.value)} style={{ width: "100%" }} />
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
    ex(() => A.editarCliente(c.id, f), "Dados do cliente atualizados").then((ok: boolean) => ok && setAberto(false));
  };
  if (!aberto) return <button className="btn sm" onClick={() => { setF(ini()); setAberto(true); }}>✏️ Editar dados do cliente</button>;
  return (
    <div className="resp-box" style={{ marginTop: 10, width: "100%" }}><h4>Editar dados do cliente</h4>
      <div className="grid">
        <div className="field"><label>Nome <span className="req-star">*</span></label><input value={f.cliente} onChange={s("cliente")} /></div>
        <div className="field"><label>CPF / CNPJ</label><input value={f.clienteDoc} onChange={s("clienteDoc")} placeholder="000.000.000-00" /></div>
        <div className="field"><label>Telefone <span className="req-star">*</span></label><input value={f.telefone} onChange={s("telefone")} inputMode="tel" /></div>
        <div className="field"><label>E-mail</label><input value={f.email} onChange={s("email")} /></div>
        <div className="field full"><label>Endereço</label><input value={f.endereco} onChange={s("endereco")} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button className="btn primary sm" onClick={salvar}>Salvar</button><button className="btn ghost sm" onClick={() => setAberto(false)}>Cancelar</button></div>
      <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 6 }}>A alteração (antes → depois) fica registrada no histórico.</div>
    </div>
  );
}
