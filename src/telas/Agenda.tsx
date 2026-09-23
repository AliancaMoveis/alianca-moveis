import { useEffect, useState } from "react";
import { A } from "../lib/acoes";
import { useApp } from "../estado";
import { fmtDate, hojeISO, isoLocal, parseData } from "../lib/regras";
import { ScBadge } from "../comp/Ticket";

export default function Agenda() {
  const { R, st, abrirDetalhe } = useApp();
  const [dia, setDia] = useState(hojeISO());
  const editar = R.podeEditarAgenda();
  // projetista: vê a agenda de toda a loja (só o essencial) e pode filtrar só os dele
  const ehProjetista = R.mySetores().includes("atendente_cliente") && !R.temMarketing() && !R.ehGestao() && !editar;
  const [escopo, setEscopo] = useState<"loja" | "meus">("loja");
  const [loja, setLoja] = useState<any[] | null>(null);
  useEffect(() => {
    if (!ehProjetista) return;
    let vivo = true;
    A.agendaLoja(dia).then(r => { if (vivo) setLoja(r || []); }).catch(() => { if (vivo) setLoja([]); });
    return () => { vivo = false; };
  }, [ehProjetista, dia, st]);
  const doDia = ehProjetista
    ? (loja || []).map((x: any) => {
        const meu = st.chamados.find(c => c.id === x.id);
        if (meu) return meu;
        return { id: x.id, cliente: x.cliente, telefone: x.telefone, produto: x.produto, dataLoja: String(x.data_loja || "").slice(0, 16),
          atendenteId: x.atendente_id || "", consultorId: x.consultor_id || "", statusCliente: x.status_cliente || "", tipo: x.direto ? "__direto" : "",
          transferencia: x.transf_pendente ? { status: "pendente" } : null, venda: x.venda_numero ? { numero: x.venda_numero } : null, _alheio: true };
      })
    : st.chamados.filter(c => R.domMarketing(c) && c.dataLoja && R.podeVer(c) && String(c.dataLoja).slice(0, 10) === dia);
  const arr = doDia.filter((c: any) => !ehProjetista || escopo === "loja" || c.atendenteId === R.currentUserId)
    .sort((a, b) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  const porHora: Record<string, any[]> = {};
  arr.forEach(c => { const dt = String(c.dataLoja); const h = dt.length > 10 ? dt.slice(11, 16) : "sem hora"; (porHora[h] = porHora[h] || []).push(c); });
  const mover = (n: number) => { const d = parseData(dia); d.setDate(d.getDate() + n); setDia(isoLocal(d)); };
  return (
    <section className="view active" id="view-agenda">
      <div className="view-head"><div><h2>Agendamento loja</h2><p id="agSub">{ehProjetista ? "Agenda de todos os clientes que vêm à loja e quem vai atender cada um. Os seus aparecem destacados e abrem ao clicar." : editar ? "Agenda dos clientes que vêm à loja. Clique para direcionar a um projetista." : "Agenda dos clientes que vêm à loja (somente leitura)."}</p></div></div>
      <div className="ag-nav">
        <button className="btn sm" onClick={() => mover(-1)}>‹ Dia anterior</button>
        <input type="date" value={dia} onChange={e => setDia(e.target.value || dia)} style={{ maxWidth: 180 }} />
        <button className="btn sm" onClick={() => mover(1)}>Próximo dia ›</button>
        <button className="btn ghost sm" onClick={() => setDia(hojeISO())}>Hoje</button>
        {ehProjetista && <span style={{ display: "inline-flex", gap: 6 }}>
          <button className={"btn sm" + (escopo === "loja" ? " primary" : " ghost")} onClick={() => setEscopo("loja")}>Toda a loja</button>
          <button className={"btn sm" + (escopo === "meus" ? " primary" : " ghost")} onClick={() => setEscopo("meus")}>Só os meus</button>
        </span>}
        <span className="ag-total" id="agTotal"><b>{arr.length}</b> agendamento(s) neste dia</span>
      </div>
      <div className="ag-legenda"><span><i style={{ background: "var(--st-concluida)" }}></i>Marketing</span><span><i style={{ background: "var(--accent)" }}></i>Consultor externo</span></div>
      <div id="agGrade">
        {!arr.length ? <div className="empty"><div className="big">Nenhum agendamento</div>{ehProjetista && loja === null ? "Carregando…" : <>Não há clientes marcados {ehProjetista && escopo === "meus" ? "para você " : ""}para {fmtDate(dia)}.</>}</div> :
          Object.keys(porHora).sort().map(h => (
            <div className="ag-hora" key={h}><div className="hr">{h}</div><div className="slots">
              {porHora[h].map(c => {
                const origem = (c.tipo === "__direto" || (R.TIPOS[c.tipo] && R.TIPOS[c.tipo].direto)) ? "marketing" : "externo";
                const alheio = !!c._alheio, meuAtend = ehProjetista && c.atendenteId === R.currentUserId;
                const cons = c.consultorId ? R.nomeUser(c.consultorId) : null, proj = c.atendenteId ? R.nomeUser(c.atendenteId) : null;
                return (
                  <div className="ag-card" key={c.id} data-origem={origem} onClick={alheio ? undefined : () => abrirDetalhe(c.id)} style={alheio ? { cursor: "default", opacity: .85 } : meuAtend ? { boxShadow: "inset 3px 0 0 var(--st-concluida)" } : undefined} title={alheio ? "Cliente de outro projetista" : undefined}>
                    <div><div className="nm">{c.cliente}</div>
                      <div className="dt">{alheio ? "" : (c.telefone || "sem telefone")}{alheio ? null : cons ? <> · consultor <b>{cons}</b></> : <> · <b>Marketing</b></>}{meuAtend ? <>{alheio ? "" : " · "}<b style={{ color: "var(--st-concluida)" }}>seu atendimento</b></> : proj ? <>{alheio ? "" : " · "}projetista <b>{proj}</b></> : <>{alheio ? "" : " · "}<b style={{ color: "var(--warn)" }}>sem projetista</b></>}</div>
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
