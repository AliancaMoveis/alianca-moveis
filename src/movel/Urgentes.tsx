// App do vendedor: aba "Urgente" — erros de venda registrados pelo call center para ele tratar.
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtDateTime } from "../lib/regras";

export function urgentesDe(R: any) {
  return R.state.chamados.filter((c: any) => c.tipo === "erro_venda" && c.tratativa && c.tratativa.erroVenda && c.tratativa.erroVenda.vendedorId === R.currentUserId)
    .sort((a: any, b: any) => (a.status === "concluida" ? 1 : 0) - (b.status === "concluida" ? 1 : 0) || String(b.criadoEm).localeCompare(String(a.criadoEm)));
}
export const pendUrgentes = (R: any) => urgentesDe(R).filter((c: any) => c.status !== "concluida" && !(c.tratativa.erroVenda.respostas || []).length).length;

function CartaoUrgente({ c }: any) {
  const { executar } = useApp() as any;
  const e = c.tratativa.erroVenda; const resp: any[] = e.respostas || [];
  const [tx, setTx] = useState("");
  const fim = c.status === "concluida";
  return (
    <div className="mv-card" style={{ display: "block", textAlign: "left", borderLeft: "4px solid " + (fim ? "var(--st-concluida)" : resp.length ? "var(--primary)" : "var(--danger)") }}>
      <div style={{ fontWeight: 800 }}>🚨 {c.cliente}</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{c.pedido ? "Venda " + c.pedido + " · " : ""}{c.id} · {fmtDateTime(c.criadoEm)}</div>
      <div style={{ marginTop: 8, fontSize: 13 }}><b>Cliente comprou:</b> {e.comprado}</div>
      <div style={{ fontSize: 13 }}><b>Foi lançado/enviado:</b> {e.lancado}</div>
      {c.motivo ? <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>{String(c.motivo).slice(0, 300)}</div> : null}
      {resp.map((r: any, i: number) => <div key={i} style={{ marginTop: 6, padding: "7px 9px", background: "var(--surface-2)", borderRadius: 8, fontSize: 12.5 }}>💬 {r.texto} <span style={{ color: "var(--ink-faint)" }}>· {fmtDateTime(r.em)}</span></div>)}
      {fim ? <div style={{ marginTop: 8, fontWeight: 700, color: "var(--st-concluida)" }}>✓ Finalizado pela supervisão</div> : <>
        <textarea style={{ width: "100%", marginTop: 8, minHeight: 70 }} value={tx} onChange={x => setTx(x.target.value)} placeholder="O que você fez para corrigir? (ex.: pedido corrigido no Tático, cliente avisado)" />
        <button className="btn primary sm" style={{ marginTop: 6 }} onClick={async () => { if (tx.trim().length < 3) return; if (await executar(() => A.erroVendaResponder(c.id, tx.trim()), "Tratativa enviada para a supervisão")) setTx(""); }}>Enviar tratativa</button>
      </>}
    </div>
  );
}

export function VendUrgentes() {
  const { R } = useApp() as any;
  const l = urgentesDe(R);
  const abertos = l.filter((c: any) => c.status !== "concluida"), fechados = l.filter((c: any) => c.status === "concluida").slice(0, 10);
  return <>
    <div className="mv-sec">Erros de venda para tratar</div>
    {abertos.length ? abertos.map((c: any) => <CartaoUrgente key={c.id} c={c} />) : <div className="mv-vazio">Nada urgente. 👍</div>}
    {fechados.length > 0 && <><div className="mv-sec">Finalizados</div>{fechados.map((c: any) => <CartaoUrgente key={c.id} c={c} />)}</>}
  </>;
}
