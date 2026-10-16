// Situação do cliente na etapa do consultor externo (ausente no endereço, em obras, standby, em análise)
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { STATUS_CLIENTE, SITUACOES_CONSULTOR, fmtDateTime } from "../lib/regras";

export function SituacaoConsultor({ c, movel }: { c: any; movel?: boolean }) {
  const { R, executar: ex, toast } = useApp() as any;
  const [sel, setSel] = useState(""); const [obs, setObs] = useState("");
  if (c.setorDestino !== "consultor_externo" || !R.podeTratar(c)) return null;
  const sc = R.statusClienteDe(c); const t = c.tratativa || {};
  const ativa = SITUACOES_CONSULTOR.includes(sc);
  const salvar = () => {
    if (!sel) { toast("Escolha a situação"); return; }
    if (sel !== "normal" && !obs.trim()) { toast("Escreva uma observação"); return; }
    ex(() => A.consultorSituacao(c.id, sel, obs.trim()), "Situação atualizada").then((ok: boolean) => { if (ok) { setSel(""); setObs(""); } });
  };
  return (
    <div className={movel ? "mv-bloco" : "resp-box"}>
      <div className={movel ? "mv-bloco-t" : ""} style={movel ? undefined : { fontWeight: 700, marginBottom: 8 }}>Situação do cliente</div>
      {ativa && <div className="vv-info"><span className={"sc sc-" + sc}>{STATUS_CLIENTE[sc]}</span>{t.situacaoObs ? " — " + t.situacaoObs : ""}{t.situacaoEm ? <small> · {fmtDateTime(t.situacaoEm)}</small> : null}</div>}
      <select className={movel ? "mv-mais" + (sel ? " on" : "") : ""} value={sel} onChange={e => setSel(e.target.value)}>
        <option value="">{ativa ? "Mudar situação ▾" : "Mais opções ▾"}</option>
        {SITUACOES_CONSULTOR.filter(k => k !== sc).map(k => <option key={k} value={k}>{STATUS_CLIENTE[k]}</option>)}
        {ativa && <option value="normal">Voltar ao normal (seguir com a visita)</option>}
      </select>
      {sel && sel !== "normal" && <textarea rows={2} style={{ width: "100%", marginTop: 8 }} placeholder={sel === "ausente_endereco" ? "Ex.: fui às 14h, ninguém atendeu; liguei e não atendeu" : sel === "visita_cancelada" ? "Motivo: o que o cliente disse (desistiu, comprou em outro lugar, quer outra data…)" : "O que aconteceu, previsão de retorno…"} value={obs} onChange={e => setObs(e.target.value)} />}
      {sel && <button className={movel ? "mv-principal" : "btn primary sm"} style={{ marginTop: 8 }} onClick={salvar}>Salvar situação</button>}
      {sel === "visita_cancelada" && <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>O cliente volta para a Haisla (supervisão do marketing) direcionar de novo. Ela e a operadora que agendou são avisadas.</div>}
      {sel === "ausente_endereco" && <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>A supervisão do marketing e a operadora que agendou serão avisadas para reagendar.</div>}
    </div>
  );
}

// "Cancelou visita na loja": consultor do cliente, vendedor do cliente, Suporte, Supervisão Marketing ou Gestão
export function CancelouLoja({ c, movel }: { c: any; movel?: boolean }) {
  const { R, executar: ex, toast } = useApp() as any;
  const [abre, setAbre] = useState(false); const [obs, setObs] = useState("");
  if (!R.domMarketing(c) || !c.dataLoja || c.venda || !["suporte_consultores", "atendente_cliente"].includes(c.setorDestino)) return null;
  const eu = R.currentUserId;
  const pode = R.ehGestao() || R.mySetores().some((x: string) => ["marketing_supervisao", "suporte_consultores"].includes(x)) || c.consultorId === eu || c.atendenteId === eu;
  if (!pode) return null;
  const sc = R.statusClienteDe(c); const lc = (c.tratativa || {}).lojaCancelada;
  if (sc === "loja_cancelada") return <div className={movel ? "mv-bloco" : "resp-box"}>
    <div className="vv-info"><span className="sc sc-loja_cancelada">{STATUS_CLIENTE.loja_cancelada}</span>{lc?.obs ? " — " + lc.obs : ""}{lc?.em ? <small> · {lc.por} · {fmtDateTime(lc.em)}</small> : null}</div>
    <button className={movel ? "mv-mais" : "btn ghost sm"} style={{ marginTop: 8 }} onClick={() => ex(() => A.cancelouLoja(c.id, "", true), "Cancelamento desfeito")}>Desfazer — o cliente vem à loja</button>
    <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>Para nova data, use “Remarcar loja” / status Reagendado.</div>
  </div>;
  const salvar = () => { if (obs.trim().length < 3) { toast("Escreva o motivo: o que o cliente disse"); return; } ex(() => A.cancelouLoja(c.id, obs.trim()), "Marcado: cancelou visita na loja").then((ok: boolean) => { if (ok) { setAbre(false); setObs(""); } }); };
  return <div className={movel ? "mv-bloco" : "resp-box"} style={abre ? undefined : { padding: movel ? undefined : "10px 14px" }}>
    {!abre ? <button className={movel ? "mv-mais" : "btn ghost sm"} onClick={() => setAbre(true)}>❌ Cliente cancelou a visita na loja</button> : <>
      <div className={movel ? "mv-bloco-t" : ""} style={movel ? undefined : { fontWeight: 700, marginBottom: 8 }}>❌ Cancelou visita na loja</div>
      <textarea rows={2} style={{ width: "100%" }} placeholder="Motivo: o que o cliente disse (desistiu, comprou em outro lugar, quer outra data…)" value={obs} onChange={e => setObs(e.target.value)} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button className={movel ? "mv-principal" : "btn primary sm"} onClick={salvar}>Salvar</button><button className="btn ghost sm" onClick={() => { setAbre(false); setObs(""); }}>Voltar</button></div>
      <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>O Suporte, o consultor e o vendedor do cliente são avisados.</div>
    </>}
  </div>;
}

/** a confirmação vale para a data agendada: se remarcar, volta a "a confirmar" */
export const vindaConfirmada = (c: any) => { const k = (c.tratativa || {}).confirmLoja; return !!(k && c.dataLoja && String(k.para || "").slice(0, 16) === String(c.dataLoja).replace(" ", "T").slice(0, 16)); };
const FECHADOS = ["loja_cancelada", "atendido", "reprovado", "visita_cancelada", "em_obras"];
export const precisaConfirmarVinda = (R: any, c: any) => R.domMarketing(c) && !!c.dataLoja && !c.venda && c.status !== "concluida" && !FECHADOS.includes(R.statusClienteDe(c));

/** selo curto para listas e agenda */
export function SeloVinda({ c }: { c: any }) {
  const { R } = useApp() as any;
  if (!precisaConfirmarVinda(R, c)) return null;
  if (String(c.dataLoja).slice(0, 10) < new Date().toISOString().slice(0, 10)) return null;
  return vindaConfirmada(c) ? <span className="vinda ok" title={"Confirmado por " + c.tratativa.confirmLoja.por}>✅ Vinda confirmada</span> : <span className="vinda pend">⏳ Confirmar vinda</span>;
}

/** ficha: marcar que o cliente confirmou a vinda na loja (marketing, consultor, vendedor, suporte, supervisão, gerente, gestão) */
export function ConfirmarVinda({ c, movel }: { c: any; movel?: boolean }) {
  const { R, executar: ex } = useApp() as any;
  const [abre, setAbre] = useState(false); const [obs, setObs] = useState("");
  if (!precisaConfirmarVinda(R, c)) return null;
  const eu = R.currentUserId;
  const pode = R.ehGestao() || R.mySetores().some((x: string) => ["marketing_supervisao", "suporte_consultores", "gerente_loja"].includes(x)) || [c.consultorId, c.atendenteId, c.solicitanteId, c.cadastradoPorId, c.responsavelMkt].includes(eu);
  const k = (c.tratativa || {}).confirmLoja; const ok = vindaConfirmada(c);
  if (ok) return <div className={movel ? "mv-bloco" : "resp-box"} style={movel ? undefined : { padding: "10px 14px" }}>
    <div className="vv-info"><span className="vinda ok">✅ Cliente confirmou a vinda na loja</span> <small>· {k.por} · {fmtDateTime(k.em)}{k.obs ? " · " + k.obs : ""}</small></div>
    {pode && <button className={movel ? "mv-mais" : "btn ghost sm"} style={{ marginTop: 8 }} onClick={() => { if (confirm("Desfazer a confirmação da vinda?")) ex(() => A.confirmarVinda(c.id, "", true), "Confirmação desfeita"); }}>Desfazer confirmação</button>}
  </div>;
  if (!pode) return <div className={movel ? "mv-bloco" : "resp-box"} style={movel ? undefined : { padding: "10px 14px" }}><span className="vinda pend">⏳ Vinda na loja ainda não confirmada</span></div>;
  return <div className={movel ? "mv-bloco" : "resp-box"} style={movel ? undefined : { padding: "10px 14px" }}>
    {!abre ? <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><span className="vinda pend">⏳ Vinda ainda não confirmada{k ? " (data mudou)" : ""}</span>
      <button className={movel ? "mv-principal" : "btn primary sm"} onClick={() => setAbre(true)}>✅ Cliente confirmou a vinda na loja</button></div> : <>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>✅ Confirmar vinda — {fmtDateTime(c.dataLoja)}</div>
      <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Como confirmou? (opcional — ex.: WhatsApp, ligação, vem com o marido)" style={{ width: "100%" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button className={movel ? "mv-principal" : "btn primary sm"} onClick={() => ex(() => A.confirmarVinda(c.id, obs.trim()), "Vinda confirmada").then((r: boolean) => { if (r) { setAbre(false); setObs(""); } })}>Confirmar</button><button className="btn ghost sm" onClick={() => setAbre(false)}>Voltar</button></div>
      <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>Aparece “✅ Vinda confirmada” para o vendedor e para todos que atendem o cliente. O vendedor é avisado.</div>
    </>}
  </div>;
}
