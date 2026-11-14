// Termo de ciência do material de um ambiente (Estrutura / Portas / Envoltório / Painéis + corrediças e dobradiças).
// Usado pelo projetista (etapa 2) e pelo cliente na assinatura online (que pode corrigir o que veio do sistema).
import { AMORT, AMORT_ROT, LINHAS_TERMO, MAT_ROT, type Amort, type LinhaTermo, type MatT, type TermoAmb } from "../lib/contratoDoc";

const COR = { pri: "#284b8f", l: "#d5dae2", s: "#5a6270", alt: "#9b1c1c", altbg: "#fdf1f1" };

export default function TermoMaterial({ v, orig, onChange, compacto, sugCores }: {
  v: TermoAmb; orig?: TermoAmb; onChange: (t: TermoAmb) => void; compacto?: boolean; sugCores?: string[];
}) {
  const btn = (on: boolean, alterado: boolean): any => ({
    padding: compacto ? "4px 9px" : "8px 11px", fontSize: compacto ? 12.5 : 14, fontWeight: 700, borderRadius: 8, cursor: "pointer",
    border: "1.5px solid " + (on ? COR.pri : compacto ? "rgba(128,140,160,.45)" : COR.l), background: on ? COR.pri : compacto ? "transparent" : "#fff", color: on ? "#fff" : compacto ? "inherit" : "#1a1d21",
    boxShadow: on && alterado ? "0 0 0 2px " + COR.alt : "none",
  });
  const setLinha = (k: keyof TermoAmb, l: LinhaTermo) => onChange({ ...v, [k]: l });
  const lista = "cores-termo";
  return <div style={{ display: "grid", gap: compacto ? 6 : 10 }}>
    {sugCores && sugCores.length > 0 && <datalist id={lista}>{sugCores.map(s => <option key={s} value={s} />)}</datalist>}
    {LINHAS_TERMO.map(([k, rot]) => {
      const l = v[k] as LinhaTermo, o = orig?.[k] as LinhaTermo | undefined;
      const mudouMat = !!o && (o.mat || null) !== (l.mat || null);
      const mudouCor = !!o && String(o.cor || "").trim() !== String(l.cor || "").trim();
      return <div key={k} style={{ display: "grid", gridTemplateColumns: compacto ? "84px auto 1fr" : "1fr", gap: compacto ? 8 : 6, alignItems: "center", paddingBottom: compacto ? 0 : 8, borderBottom: compacto ? 0 : "1px solid #eef0f2" }}>
        <b style={{ fontSize: compacto ? 13 : 15 }}>{rot}{(mudouMat || mudouCor) && !compacto ? <span style={{ color: COR.alt, fontSize: 12, fontWeight: 700 }}> · alterado</span> : null}</b>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["MDP", "MDF", "NAO"] as MatT[]).map(m => <button key={String(m)} type="button" style={btn(l.mat === m, mudouMat)} onClick={() => setLinha(k, { ...l, mat: l.mat === m && compacto ? null : m })}>{MAT_ROT[String(m)]}</button>)}
        </div>
        {l.mat === "NAO" ? <span style={{ color: COR.s, fontSize: 13 }}>—</span>
          : <input value={l.cor} list={sugCores ? lista : undefined} onChange={e => setLinha(k, { ...l, cor: e.target.value })} placeholder={"Cor de " + rot.toLowerCase()}
            style={{ width: "100%", boxSizing: "border-box", fontSize: compacto ? 13 : 16, padding: compacto ? "4px 8px" : "10px 12px", borderRadius: 8, border: "1.5px solid " + (mudouCor ? COR.alt : compacto ? "rgba(128,140,160,.45)" : COR.l), background: compacto ? "transparent" : mudouCor ? COR.altbg : "#fff", color: compacto ? "inherit" : "#1a1d21" }} />}
        {!compacto && o && (mudouMat || mudouCor) && <span style={{ fontSize: 12, color: COR.alt }}>No sistema estava: {MAT_ROT[o.mat || ""] || "em branco"}{o.cor ? " · " + o.cor : ""}</span>}
      </div>;
    })}
    {AMORT.map(([k, rot]) => {
      const a = v[k] as Amort, o = orig?.[k] as Amort | undefined, mudou = orig !== undefined && (o || null) !== (a || null);
      return <div key={k} style={{ display: "grid", gridTemplateColumns: compacto ? "84px 1fr" : "1fr", gap: compacto ? 8 : 6, alignItems: "center" }}>
        <b style={{ fontSize: compacto ? 13 : 15 }}>{rot}{mudou && !compacto ? <span style={{ color: COR.alt, fontSize: 12 }}> · alterado (era: {AMORT_ROT[String(o || "")] || "em branco"})</span> : null}</b>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["com", "sem", "nao"] as Amort[]).map(m => <button key={String(m)} type="button" style={btn(a === m, mudou)} onClick={() => onChange({ ...v, [k]: a === m && compacto ? null : m })}>{AMORT_ROT[String(m)]}</button>)}
        </div>
      </div>;
    })}
  </div>;
}
