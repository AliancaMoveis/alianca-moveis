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
      {sel && sel !== "normal" && <textarea rows={2} style={{ width: "100%", marginTop: 8 }} placeholder={sel === "ausente_endereco" ? "Ex.: fui às 14h, ninguém atendeu; liguei e não atendeu" : "O que aconteceu, previsão de retorno…"} value={obs} onChange={e => setObs(e.target.value)} />}
      {sel && <button className={movel ? "mv-principal" : "btn primary sm"} style={{ marginTop: 8 }} onClick={salvar}>Salvar situação</button>}
      {sel === "ausente_endereco" && <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>A supervisão do marketing e a operadora que agendou serão avisadas para reagendar.</div>}
    </div>
  );
}
