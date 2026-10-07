// Escolha de vendedor com destaque de projetista e aviso de disponibilidade (folga, turno, almoço, outro cliente a menos de 2h)
import { useApp } from "../estado";
import { A } from "../lib/acoes";

export function rotuloVend(u: any) { return u.nome + (u.fazProjeto === false ? " · só vendedor" : " · projetista"); }

export function SelVendedor({ value, onChange, quando, c, lista, placeholder = "Selecione…", extra }: { value: string; onChange: (v: string) => void; quando?: string | null; c?: any; lista?: any[]; placeholder?: string; extra?: (u: any) => string }) {
  const { R } = useApp() as any;
  const vs = lista || R.projetistas();
  const proj = vs.filter((u: any) => u.fazProjeto !== false), so = vs.filter((u: any) => u.fazProjeto === false);
  const opt = (u: any) => { const m = R.dispVendedor(u.id, quando, c); return <option key={u.id} value={u.id}>{(m.length ? "⛔ " : "") + u.nome + (extra ? extra(u) : "") + (m.length ? " — " + m.join(" · ") : "")}</option>; };
  const mot = value ? R.dispVendedor(value, quando, c) : [];
  return <>
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {proj.length > 0 && <optgroup label="📐 Projetistas">{proj.map(opt)}</optgroup>}
      {so.length > 0 && <optgroup label="Só vendedores (não fazem projeto)">{so.map(opt)}</optgroup>}
    </select>
    {mot.length > 0 && <div className="dv-aviso" style={{ marginTop: 6, color: "var(--danger)", fontWeight: 600, fontSize: 12.5 }}>⛔ {R.nomeUser(value)} indisponível: {mot.join(" · ")}</div>}
  </>;
}

/** Antes de indicar: se o vendedor estiver indisponível no horário, pede confirmação. Devolve o motivo (para registrar) ou null se cancelou. */
export function confirmarDisp(R: any, uid: string, quando: string | null | undefined, c?: any): { ok: boolean; motivo: string } {
  const m = R.dispVendedor(uid, quando, c);
  if (!m.length) return { ok: true, motivo: "" };
  const ok = confirm(R.nomeUser(uid) + " está indisponível nesse horário:\n\n• " + m.join("\n• ") + "\n\nIndicar mesmo assim? (fica registrado no histórico)");
  return { ok, motivo: m.join(" · ") };
}
export const registrarIndisp = (id: string, uid: string, motivo: string) => motivo ? A.vendedorIndisponivelCiente(id, uid, motivo).catch(() => {}) : Promise.resolve();
