import { useState } from "react";
import { useApp } from "../estado";
import { fmtDate, hojeISO, isoLocal, parseData } from "../lib/regras";
import { ScBadge } from "../comp/Ticket";

export default function Agenda() {
  const { R, st, abrirDetalhe } = useApp();
  const [dia, setDia] = useState(hojeISO());
  const editar = R.podeEditarAgenda();
  const arr = st.chamados.filter(c => R.domMarketing(c) && c.dataLoja && R.podeVer(c) && String(c.dataLoja).slice(0, 10) === dia)
    .sort((a, b) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  const porHora: Record<string, any[]> = {};
  arr.forEach(c => { const dt = String(c.dataLoja); const h = dt.length > 10 ? dt.slice(11, 16) : "sem hora"; (porHora[h] = porHora[h] || []).push(c); });
  const mover = (n: number) => { const d = parseData(dia); d.setDate(d.getDate() + n); setDia(isoLocal(d)); };
  return (
    <section className="view active" id="view-agenda">
      <div className="view-head"><div><h2>Agendamento loja</h2><p id="agSub">{editar ? "Agenda dos clientes que vêm à loja. Clique para direcionar a um projetista." : "Agenda dos clientes que vêm à loja (somente leitura)."}</p></div></div>
      <div className="ag-nav">
        <button className="btn sm" onClick={() => mover(-1)}>‹ Dia anterior</button>
        <input type="date" value={dia} onChange={e => setDia(e.target.value || dia)} style={{ maxWidth: 180 }} />
        <button className="btn sm" onClick={() => mover(1)}>Próximo dia ›</button>
        <button className="btn ghost sm" onClick={() => setDia(hojeISO())}>Hoje</button>
        <span className="ag-total" id="agTotal"><b>{arr.length}</b> agendamento(s) neste dia</span>
      </div>
      <div className="ag-legenda"><span><i style={{ background: "var(--st-concluida)" }}></i>Marketing</span><span><i style={{ background: "var(--accent)" }}></i>Consultor externo</span></div>
      <div id="agGrade">
        {!arr.length ? <div className="empty"><div className="big">Nenhum agendamento</div>Não há clientes marcados para {fmtDate(dia)}.</div> :
          Object.keys(porHora).sort().map(h => (
            <div className="ag-hora" key={h}><div className="hr">{h}</div><div className="slots">
              {porHora[h].map(c => {
                const origem = (R.TIPOS[c.tipo] && R.TIPOS[c.tipo].direto) ? "marketing" : "externo";
                const cons = c.consultorId ? R.nomeUser(c.consultorId) : null, proj = c.atendenteId ? R.nomeUser(c.atendenteId) : null;
                return (
                  <div className="ag-card" key={c.id} data-origem={origem} onClick={() => abrirDetalhe(c.id)}>
                    <div><div className="nm">{c.cliente}</div>
                      <div className="dt">{c.telefone || "sem telefone"}{cons ? <> · consultor <b>{cons}</b></> : <> · <b>Marketing</b></>}{proj ? <> · projetista <b>{proj}</b></> : <> · <b style={{ color: "var(--warn)" }}>sem projetista</b></>}</div>
                      {c.produto && <div className="dt">{c.produto}</div>}</div>
                    <div className="rt"><ScBadge c={c} />{c.transferencia && c.transferencia.status === "pendente" && <span className="pill" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>transf. pendente</span>}{c.venda && <span className="pill">venda {c.venda.numero}</span>}</div>
                  </div>
                );
              })}
            </div></div>
          ))}
      </div>
    </section>
  );
}
