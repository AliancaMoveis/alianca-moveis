// Férias do vendedor: gerente de loja, Gestão, Supervisão de marketing e Suporte a consultores marcam o período.
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { Modal } from "./Modal";
import { feriasEm, fmtDate, hojeISO } from "../lib/regras";

export const podeMarcarFerias = (R: any) => R.ehGestao() || R.mySetores().some((x: string) => ["marketing_supervisao", "suporte_consultores", "gerente_loja"].includes(x));

/** texto curto do período: "🏖 férias até 31/10" (em andamento) ou "🏖 férias de 03/11 a 10/11" (marcada) */
export function textoFerias(u: any): string {
  if (!u || !u.feriasAte || u.feriasAte < hojeISO()) return "";
  const agora = feriasEm(u, hojeISO());
  return "🏖 " + (agora || "férias de " + fmtDate(u.feriasDe).slice(0, 5) + " a " + fmtDate(u.feriasAte).slice(0, 5));
}

export function ModalFerias({ u }: { u: any }) {
  const { setModal, toast, recarregar } = useApp() as any;
  const ativa = !!textoFerias(u);
  const [de, setDe] = useState(ativa && u.feriasDe ? u.feriasDe : hojeISO());
  const [ate, setAte] = useState(ativa ? u.feriasAte : "");
  const [sal, setSal] = useState(false);
  const fechar = () => setModal(null);
  const nome = (u.nome || "").replace(/^(Consultora?|Vendedora?)\s+—\s+/, "");
  async function salvar(encerrar = false) {
    if (!encerrar && !ate) { toast("Informe até quando vão as férias"); return; }
    if (encerrar && !confirm("Encerrar as férias de " + nome + "? Ele(a) volta a aparecer como disponível.")) return;
    setSal(true);
    try { await A.vendedorFerias(u.id, encerrar ? null : de, encerrar ? null : ate); await recarregar(); fechar(); toast(encerrar ? "Férias encerradas" : "Férias de " + nome + " marcadas"); }
    catch (e: any) { toast(e.message || "Não foi possível salvar"); setSal(false); }
  }
  return (
    <Modal titulo={"🏖 Férias · " + nome} onFechar={fechar}>
      <p className="hint" style={{ marginTop: 0 }}>Durante as férias o vendedor aparece como indisponível: não entra no “chamar todos” e aparece o aviso ao designar cliente. Ainda dá para chamar ele individualmente (ex.: freelance).</p>
      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="field"><label>Início</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
        <div className="field"><label>Até (último dia de férias)</label><input type="date" value={ate} min={de} onChange={e => setAte(e.target.value)} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn primary" disabled={sal} onClick={() => salvar()}>{sal ? "Salvando…" : "Salvar férias"}</button>
        {ativa && <button className="btn" disabled={sal} onClick={() => salvar(true)}>Encerrar férias</button>}
      </div>
    </Modal>
  );
}
