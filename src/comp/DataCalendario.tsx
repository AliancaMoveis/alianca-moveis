// Campo de data e hora com um calendário em quadradinhos ao lado (para escolher o dia junto com o cliente).
// O campo normal (giratório do celular) continua; o 📅 abre o mês, toca no dia e depois no horário.
import { useState } from "react";
import { createPortal } from "react-dom";

const DS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const p2 = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
const HORAS = Array.from({ length: 21 }, (_, i) => p2(9 + Math.floor(i / 2)) + ":" + (i % 2 ? "30" : "00")); // 09:00 … 19:00

export function DataCalendario({ value, onChange, min, className, horas = HORAS }: { value: string; onChange: (v: string) => void; min?: string; className?: string; horas?: string[] }) {
  const [aberto, setAberto] = useState(false);
  return <div className="dcal-campo">
    <input type="datetime-local" className={className} value={value} min={min} onChange={e => onChange(e.target.value)} />
    <button type="button" className="dcal-bt" title="Escolher no calendário" onClick={() => setAberto(true)}>📅</button>
    {aberto && createPortal(<Calendario value={value} min={min} horas={horas} fechar={() => setAberto(false)} escolher={v => { onChange(v); setAberto(false); }} />, document.body)}
  </div>;
}

function Calendario({ value, min, horas, fechar, escolher }: { value: string; min?: string; horas: string[]; fechar: () => void; escolher: (v: string) => void }) {
  const hoje = iso(new Date());
  const minDia = (min || hoje).slice(0, 10);
  const ini = value ? new Date(value.slice(0, 10) + "T12:00") : new Date();
  const [mes, setMes] = useState(new Date(ini.getFullYear(), ini.getMonth(), 1));
  const [dia, setDia] = useState(value ? value.slice(0, 10) : "");
  const [hora, setHora] = useState(value ? value.slice(11, 16) : "");
  const primeiro = (mes.getDay() + 6) % 7; // segunda = 0
  const nDias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const cel: (Date | null)[] = [...Array(primeiro).fill(null), ...Array.from({ length: nDias }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1))];
  while (cel.length % 7) cel.push(null);
  const mudarMes = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1));
  return <div className="dcal-fundo" onMouseDown={e => { if (e.target === e.currentTarget) fechar(); }}>
    <div className="dcal">
      <div className="dcal-h"><button type="button" onClick={() => mudarMes(-1)}>‹</button><b>{MESES[mes.getMonth()]} {mes.getFullYear()}</b><button type="button" onClick={() => mudarMes(1)}>›</button></div>
      <div className="dcal-g">{DS.map(d => <span key={d} className="dcal-ds">{d}</span>)}
        {cel.map((d, i) => { if (!d) return <span key={i} />; const k = iso(d); const off = k < minDia;
          return <button type="button" key={i} disabled={off} className={"dcal-d" + (k === dia ? " on" : "") + (k === hoje ? " hoje" : "") + (d.getDay() === 0 || d.getDay() === 6 ? " fds" : "")} onClick={() => setDia(k)}>{d.getDate()}</button>; })}
      </div>
      {dia && <><div className="dcal-sub">Horário em {dia.slice(8, 10)}/{dia.slice(5, 7)}</div>
        <div className="dcal-hs">{horas.map(h => <button type="button" key={h} className={h === hora ? "on" : ""} onClick={() => setHora(h)}>{h}</button>)}</div></>}
      <div className="dcal-b"><button type="button" className="btn primary" disabled={!dia || !hora} onClick={() => escolher(dia + "T" + hora)}>{dia && hora ? "Usar " + dia.slice(8, 10) + "/" + dia.slice(5, 7) + " às " + hora : "Escolha o dia e o horário"}</button><button type="button" className="btn ghost" onClick={fechar}>Cancelar</button></div>
    </div>
  </div>;
}
