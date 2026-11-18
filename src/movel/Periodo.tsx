// Filtro de período das listas de clientes do app (consultor, vendedor, marketing):
// vendidos, resultados e "todos" deixam de misturar meses — padrão: este mês.
import { useState } from "react";
import { clienteNoPeriodo, dataRefCliente, hojeISO, isoLocal, parseData } from "../lib/regras";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export type Periodo = { tipo: "mes" | "ant" | "datas" | "tudo"; de: string; ate: string };

function mes(off: number) {
  const h = parseData(hojeISO() + "T12:00");
  const ini = new Date(h.getFullYear(), h.getMonth() - off, 1), fim = new Date(h.getFullYear(), h.getMonth() - off + 1, 0);
  return { de: isoLocal(ini), ate: isoLocal(fim), nome: MESES[ini.getMonth()] };
}

export function usePeriodo() {
  const m = mes(0);
  const [p, setP] = useState<Periodo>({ tipo: "mes", de: m.de, ate: m.ate });
  return [p, setP] as const;
}

export const dataRef = dataRefCliente;
export const noPeriodo = (p: Periodo, c: any) => p.tipo === "tudo" || clienteNoPeriodo(c, p.de, p.ate);

/** Filtro por data de uma lista (de–até, sem período fechado).
 *  Antes o rótulo, os dois campos e a palavra "até" ficavam todos na mesma linha: no celular isso quebrava
 *  no meio e metade do filtro caía embaixo. Agora cada campo leva o rótulo em cima e os dois dividem a largura. */
export function FiltroData({ titulo, de, ate, setDe, setAte }: { titulo: string; de: string; ate: string; setDe: (v: string) => void; setAte: (v: string) => void }) {
  return <div className="mv-periodo">
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 5px" }}>
      <b style={{ fontSize: 12.5 }}>📅 {titulo}</b>
      {(de || ate) && <button type="button" className="mv-mini" style={{ marginLeft: "auto" }} onClick={() => { setDe(""); setAte(""); }}>limpar</button>}
    </div>
    <div className="mv-datas">
      <label>De<input type="date" value={de} max={ate || undefined} onChange={e => setDe(e.target.value)} /></label>
      <label>Até<input type="date" value={ate} min={de || undefined} onChange={e => setAte(e.target.value)} /></label>
    </div>
  </div>;
}

export function FiltroPeriodo({ p, setP }: { p: Periodo; setP: (p: Periodo) => void }) {
  const m0 = mes(0), m1 = mes(1);
  return <div className="mv-periodo">
    <div className="mv-seg">
      <button className={p.tipo === "mes" ? "on" : ""} onClick={() => setP({ tipo: "mes", de: m0.de, ate: m0.ate })}>Este mês</button>
      <button className={p.tipo === "ant" ? "on" : ""} onClick={() => setP({ tipo: "ant", de: m1.de, ate: m1.ate })} style={{ textTransform: "capitalize" }}>{m1.nome}</button>
      <button className={p.tipo === "datas" ? "on" : ""} onClick={() => setP({ ...p, tipo: "datas" })}>📅 Datas</button>
      <button className={p.tipo === "tudo" ? "on" : ""} onClick={() => setP({ ...p, tipo: "tudo" })}>Tudo</button>
    </div>
    {p.tipo === "datas" && <div className="mv-datas">
      <label>De<input type="date" value={p.de} max={p.ate} onChange={e => e.target.value && setP({ ...p, de: e.target.value })} /></label>
      <label>Até<input type="date" value={p.ate} min={p.de} onChange={e => e.target.value && setP({ ...p, ate: e.target.value })} /></label>
    </div>}
  </div>;
}
