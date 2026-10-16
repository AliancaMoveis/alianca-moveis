// Responsável do marketing pelo cliente (rodízio das meninas): produção, metas e comissão contam para ela.
// No cadastro: sem escolha = quem cadastrou. Depois: quem cadastrou, a Supervisão Marketing ou a Gestão trocam.
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";

export const equipeMkt = (R: any) => R.state.usuarios.filter((u: any) => u.ativo && (u.setores || []).some((x: string) => ["marketing_operadora", "marketing_supervisao"].includes(x)))
  .sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR"));

export function SelRespMkt({ valor, mudar, movel }: { valor: string; mudar: (v: string) => void; movel?: boolean }) {
  const { R } = useApp() as any;
  const eu = R.currentUserId; const ops = equipeMkt(R);
  const sel = <select value={valor} onChange={e => mudar(e.target.value)}>
    <option value="">{ops.some((u: any) => u.id === eu) ? "Eu mesma (" + (R.me()?.nome || "") + ")" : "Quem está cadastrando"}</option>
    {ops.filter((u: any) => u.id !== eu).map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}
  </select>;
  return movel ? <label className="mv-campo">Responsável pelo cliente (rodízio)<span style={{ display: "block" }}>{sel}</span></label>
    : <div className="field"><label>Responsável pelo cliente <span className="hint">(rodízio — conta para ela)</span></label>{sel}</div>;
}

export function RespMktFicha({ c }: { c: any }) {
  const { R, executar: ex } = useApp() as any;
  const [v, setV] = useState("");
  if (!R.domMarketing(c) || R.ehProspeccao?.(c)) return null;
  const pode = R.ehGestao() || R.mySetores().includes("marketing_supervisao") || c.cadastradoPorId === R.currentUserId || c.responsavelMkt === R.currentUserId;
  const resp = c.solicitanteId;
  return <div className="row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13, margin: "4px 0 10px" }}>
    <span className="k" style={{ color: "var(--ink-faint)" }}>Responsável (marketing):</span> <b>{R.nomeUser(resp)}</b>
    {c.cadastradoPorId && c.cadastradoPorId !== resp && <small style={{ color: "var(--ink-faint)" }}>· cadastrado por {R.nomeUser(c.cadastradoPorId)}</small>}
    {pode && !c.venda && <>
      <select value={v} onChange={e => setV(e.target.value)} style={{ maxWidth: 200 }}><option value="">Trocar responsável…</option>{equipeMkt(R).filter((u: any) => u.id !== resp).map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select>
      {v && <button className="btn sm primary" onClick={() => ex(() => A.mktDefinirResponsavel(c.id, v), "Responsável alterado").then((ok: boolean) => ok && setV(""))}>Salvar</button>}
    </>}
  </div>;
}
