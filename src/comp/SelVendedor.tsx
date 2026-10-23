// Escolha de vendedor com destaque de projetista e aviso de disponibilidade (folga, turno, almoço, outro cliente a menos de 2h)
import { useApp } from "../estado";
import { A } from "../lib/acoes";

export function rotuloVend(u: any) { return u.nome + (u.fazProjeto === false ? " · só vendedor" : " · projetista"); }

export function SelVendedor({ value, onChange, quando, c, lista, placeholder = "Selecione…", extra }: { value: string; onChange: (v: string) => void; quando?: string | null; c?: any; lista?: any[]; placeholder?: string; extra?: (u: any) => string }) {
  const { R } = useApp() as any;
  const vs = lista || R.vendAgenda();
  const fr = vs.filter((u: any) => u.freelancer), loja = vs.filter((u: any) => !u.freelancer);
  const proj = loja.filter((u: any) => u.fazProjeto !== false), so = loja.filter((u: any) => u.fazProjeto === false);
  const opt = (u: any) => { const m = R.dispVendedor(u.id, quando, c); return <option key={u.id} value={u.id}>{(m.length ? "⛔ " : "") + u.nome + (extra ? extra(u) : "") + (m.length ? " — " + m.join(" · ") : "")}</option>; };
  const mot = value ? R.dispVendedor(value, quando, c) : [];
  return <>
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {proj.length > 0 && <optgroup label="📐 Projetistas">{proj.map(opt)}</optgroup>}
      {so.length > 0 && <optgroup label="Só vendedores (não fazem projeto)">{so.map(opt)}</optgroup>}
      {fr.length > 0 && <optgroup label="Freelancers">{fr.map(opt)}</optgroup>}
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

/** vendedor sugerido para o cliente: livre no horário, com menos clientes no dia; empate → menos clientes nos últimos 7 dias;
 *  ainda empatado → alterna pelo cliente (cada cliente sugere um vendedor diferente, não sempre o primeiro da lista) */
export function sugestaoVendedor(R: any, chamados: any[], c: any, vendedores: any[]) {
  if (!c || !c.dataLoja) return null;
  const dia = String(c.dataLoja).slice(0, 10);
  const d7 = new Date(dia + "T12:00"); d7.setDate(d7.getDate() - 7); const ini = d7.toISOString().slice(0, 10);
  // freelance não entra na sugestão automática (o gerente escolhe à mão quando precisar)
  const livres = vendedores.filter((a: any) => !a.freelancer && !R.dispVendedor(a.id, c.dataLoja, c).length);
  if (!livres.length) return null;
  const cnt: Record<string, { dia: number; sem: number }> = {};
  livres.forEach((a: any) => (cnt[a.id] = { dia: 0, sem: 0 }));
  chamados.forEach((x: any) => { if (!x.atendenteId || x.id === c.id || !cnt[x.atendenteId] || !x.dataLoja) return; const dx = String(x.dataLoja).slice(0, 10);
    if (dx === dia) cnt[x.atendenteId].dia++; if (dx >= ini && dx <= dia) cnt[x.atendenteId].sem++; });
  const h = Array.from(String(c.id)).reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const ord = livres.map((a: any, i: number) => ({ a, k: [cnt[a.id].dia, cnt[a.id].sem, (i + h) % livres.length] }))
    .sort((x: any, y: any) => x.k[0] - y.k[0] || x.k[1] - y.k[1] || x.k[2] - y.k[2]);
  return ord[0].a;
}
