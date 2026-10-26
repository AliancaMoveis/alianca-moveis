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
