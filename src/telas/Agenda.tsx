import { useEffect, useState } from "react";
import { A } from "../lib/acoes";
import { useApp } from "../estado";
import { fmtDate, hojeISO, isoLocal, parseData } from "../lib/regras";
import { ScBadge } from "../comp/Ticket";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const maisDias = (iso: string, n: number) => { const d = parseData(iso + "T12:00"); d.setDate(d.getDate() + n); return isoLocal(d); };

export default function Agenda() {
  const { R } = useApp();
  const [dia, setDia] = useState(hojeISO());
  const editar = R.podeEditarAgenda();
  // vendedor: vê a agenda de toda a loja (só o essencial) e pode filtrar só os dele. Consultor: só os próprios clientes.
  const ehVendedor = R.mySetores().includes("atendente_cliente") && !R.temMarketing() && !R.ehGestao() && !editar;
  const [escopo, setEscopo] = useState<"loja" | "meus">("loja");
  const amanha = maisDias(dia, 1);
  return (
    <section className="view active" id="view-agenda">
      <div className="view-head"><div><h2>Agendamento loja</h2><p id="agSub">{ehVendedor ? "Todos os clientes que vêm à loja e quem vai atender cada um. Os seus aparecem destacados e abrem ao clicar." : editar ? "Clientes que vêm à loja no dia (e no dia seguinte, quando já houver). Clique para abrir a ficha e definir o vendedor." : "Seus clientes agendados na loja."}</p></div></div>
      <div className="ag-nav">
        <button className="btn sm" onClick={() => setDia(maisDias(dia, -1))}>‹ Dia anterior</button>
        <input type="date" value={dia} onChange={e => setDia(e.target.value || dia)} style={{ maxWidth: 180 }} />
        <button className="btn sm" onClick={() => setDia(maisDias(dia, 1))}>Próximo dia ›</button>
        <button className="btn ghost sm" onClick={() => setDia(hojeISO())}>Hoje</button>
        {ehVendedor && <span style={{ display: "inline-flex", gap: 6 }}>
          <button className={"btn sm" + (escopo === "loja" ? " primary" : " ghost")} onClick={() => setEscopo("loja")}>Toda a loja</button>
          <button className={"btn sm" + (escopo === "meus" ? " primary" : " ghost")} onClick={() => setEscopo("meus")}>Só os meus</button>
        </span>}
      </div>
      <div className="ag-legenda"><span><span className="origem marketing">Marketing</span> agendado pelo marketing</span><span><span className="origem externo">Externo</span> veio do consultor externo</span><span><span className="badge b-semanexo">⚠️ Sem anexo</span> sem planta/fotos</span></div>
      <Dia iso={dia} ehVendedor={ehVendedor} escopo={escopo} principal />
      <Dia iso={amanha} ehVendedor={ehVendedor} escopo={escopo} />
    </section>
  );
}

function Dia({ iso, ehVendedor, escopo, principal }: { iso: string; ehVendedor: boolean; escopo: string; principal?: boolean }) {
  const { R, st, abrirDetalhe } = useApp();
  const [loja, setLoja] = useState<any[] | null>(null);
  useEffect(() => {
    if (!ehVendedor) return;
    let vivo = true; setLoja(null);
    A.agendaLoja(iso).then(r => { if (vivo) setLoja(r || []); }).catch(() => { if (vivo) setLoja([]); });
    return () => { vivo = false; };
  }, [ehVendedor, iso, st]);
  const doDia = ehVendedor
    ? (loja || []).map((x: any) => {
        const meu = st.chamados.find(c => c.id === x.id);
        if (meu) return meu;
        return { id: x.id, cliente: x.cliente, telefone: x.telefone, produto: x.produto, dataLoja: String(x.data_loja || "").slice(0, 16),
          atendenteId: x.atendente_id || "", consultorId: x.consultor_id || "", statusCliente: x.status_cliente || "", tipo: x.direto ? "__direto" : "",
          transferencia: x.transf_pendente ? { status: "pendente" } : null, venda: x.venda_numero ? { numero: x.venda_numero } : null, _alheio: true };
      })
    : st.chamados.filter(c => R.domMarketing(c) && c.dataLoja && R.podeVer(c) && String(c.dataLoja).slice(0, 10) === iso);
  const arr = doDia.filter((c: any) => !ehVendedor || escopo === "loja" || c.atendenteId === R.currentUserId)
    .sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  if (!principal && !arr.length) return null;
  const origem = (c: any) => (c.tipo === "__direto" || R.ehDireto(c)) ? "marketing" : "externo";
  const nMkt = arr.filter((c: any) => origem(c) === "marketing").length, nExt = arr.length - nMkt;
  const semVend = arr.filter((c: any) => !c.atendenteId).length, semAnexo = arr.filter((c: any) => !c._alheio && R.semAnexo(c)).length;
  const porHora: Record<string, any[]> = {};
  arr.forEach((c: any) => { const dt = String(c.dataLoja); const h = dt.length > 10 ? dt.slice(11, 16) : "sem hora"; (porHora[h] = porHora[h] || []).push(c); });
  const hoje = hojeISO();
  const d = parseData(iso + "T12:00");
  const titulo = (iso === hoje ? "Hoje · " : iso === maisDias(hoje, 1) ? "Amanhã · " : "") + DIAS[d.getDay()] + ", " + fmtDate(iso);
  return (
    <div className="ag-dia">
      <div className="ag-dia-cab">
        <div><div className="ag-dia-tit">{titulo}</div>
          <div className="ag-dia-sub">{nMkt} marketing · {nExt} externos{semVend ? <> · <b style={{ color: "var(--warn)" }}>{semVend} sem vendedor</b></> : null}{semAnexo ? <> · <b style={{ color: "#b07a00" }}>{semAnexo} sem anexo</b></> : null}</div></div>
        <div className="ag-dia-total"><b>{arr.length}</b><span>agendado{arr.length === 1 ? "" : "s"}</span></div>
      </div>
      {!arr.length ? <div className="empty" style={{ padding: "20px 10px" }}>{ehVendedor && loja === null ? "Carregando…" : <>Nenhum cliente marcado {ehVendedor && escopo === "meus" ? "para você " : ""}neste dia.</>}</div> :
        Object.keys(porHora).sort().map(h => (
          <div className="ag-hora" key={h}><div className="hr">{h}</div><div className="slots">
            {porHora[h].map((c: any) => {
              const og = origem(c);
              const alheio = !!c._alheio, meuAtend = ehVendedor && c.atendenteId === R.currentUserId;
              const cons = c.consultorId ? R.nomeUser(c.consultorId) : null, vend = c.atendenteId ? R.nomeUser(c.atendenteId) : null;
              const t = c.tratativa || {};
              return (
                <div className="ag-card" key={c.id} data-origem={og} onClick={alheio ? undefined : () => abrirDetalhe(c.id)} style={alheio ? { cursor: "default", opacity: .85 } : meuAtend ? { boxShadow: "inset 3px 0 0 var(--st-concluida)" } : undefined} title={alheio ? "Cliente de outro vendedor" : undefined}>
                  <div><div className="nm"><span className={"origem " + og}>{og === "marketing" ? "Marketing" : "Externo"}</span> {c.cliente}
                    {!alheio && R.semAnexo(c) && <> <span className="badge b-semanexo">⚠️ Sem anexo</span></>}
                    {t.querProjeto === "sim" && <> <span className="marca-loja sim">📐 Quer projeto</span></>}</div>
                    <div className="dt">{alheio ? "" : (c.telefone || "sem telefone")}{alheio ? null : cons ? <> · consultor <b>{cons}</b></> : null}{meuAtend ? <>{alheio ? "" : " · "}<b style={{ color: "var(--st-concluida)" }}>seu atendimento</b></> : vend ? <>{alheio ? "" : " · "}vendedor <b>{vend}</b></> : <>{alheio ? "" : " · "}<b style={{ color: "var(--warn)" }}>sem vendedor</b></>}</div>
                    {c.produto && <div className="dt">{c.produto}</div>}</div>
                  <div className="rt"><ScBadge c={c} />{c.transferencia && c.transferencia.status === "pendente" && <span className="pill" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>transf. pendente</span>}{c.venda && <span className="pill">venda {c.venda.numero}</span>}</div>
                </div>
              );
            })}
          </div></div>
        ))}
    </div>
  );
}
