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
  // quem não coordena a agenda (vendedor, operadora do marketing, consultor) vê toda a loja pela agenda resumida
  // e pode filtrar só os seus clientes. Consultor vê os clientes dos outros só como "Outro cliente".
  const resumida = !editar;
  const [escopo, setEscopo] = useState<"loja" | "meus">("loja");
  const amanha = maisDias(dia, 1);
  return (
    <section className="view active" id="view-agenda">
      <div className="view-head"><div><h2>Agendamento loja</h2><p id="agSub">{editar ? "Todos os clientes que vêm à loja no dia (e no dia seguinte, quando já houver). Clique para abrir a ficha e definir o vendedor. Pedidos de vendedores aparecem para aprovar. Use \"Meus clientes\" para ver só os ligados a você." : "Todos os clientes que vêm à loja e quem vai atender cada um. Use \"Meus clientes\" para ver só os seus."}</p></div></div>
      <div className="ag-nav">
        <button className="btn sm" onClick={() => setDia(maisDias(dia, -1))}>‹ Dia anterior</button>
        <input type="date" value={dia} onChange={e => setDia(e.target.value || dia)} style={{ maxWidth: 180 }} />
        <button className="btn sm" onClick={() => setDia(maisDias(dia, 1))}>Próximo dia ›</button>
        <button className="btn ghost sm" onClick={() => setDia(hojeISO())}>Hoje</button>
        {<span className="subnav" style={{ margin: 0 }}>
          <button className={escopo === "loja" ? "on" : ""} onClick={() => setEscopo("loja")}>Toda a loja</button>
          <button className={escopo === "meus" ? "on" : ""} onClick={() => setEscopo("meus")}>Meus clientes</button>
        </span>}
      </div>
      <div className="ag-legenda"><span><span className="origem marketing">Marketing</span> agendado pelo marketing</span><span><span className="origem externo">Externo</span> veio do consultor externo</span><span><span className="badge b-semanexo">⚠️ Sem anexo</span> sem planta/fotos</span><span><b style={{ color: "var(--warn)" }}>Sem vendedor · fila</b> aguardando definir</span></div>
      <Dia iso={dia} resumida={resumida} escopo={escopo} principal />
      <Dia iso={amanha} resumida={resumida} escopo={escopo} />
    </section>
  );
}

function Dia({ iso, resumida, escopo, principal }: { iso: string; resumida: boolean; escopo: string; principal?: boolean }) {
  const { R, st, abrirDetalhe, executar: ex } = useApp() as any;
  const eu = R.currentUserId;
  const souVendedor = R.mySetores().includes("atendente_cliente");
  const [loja, setLoja] = useState<any[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    if (!resumida) return;
    let vivo = true; setLoja(null); setFalhou(false);
    A.agendaLoja(iso).then(r => { if (vivo) setLoja(r || []); }).catch(() => { if (vivo) { setLoja([]); setFalhou(true); } });
    return () => { vivo = false; };
  }, [resumida, iso, st]);
  const meuCliente = (c: any) => c.atendenteId === eu || c.consultorId === eu || c.solicitanteId === eu || c._pedidoVendedor === eu;
  let doDia: any[];
  if (resumida && !falhou) {
    doDia = (loja || []).map((x: any) => {
      const meu = st.chamados.find((c: any) => c.id === x.id);
      if (meu) return { ...meu, _pedidoVendedor: x.pedido_vendedor || (meu.tratativa && meu.tratativa.pedidoAtend) || "" };
      return { id: x.id, cliente: x.cliente, telefone: x.telefone, produto: x.produto, dataLoja: String(x.data_loja || "").slice(0, 16),
        atendenteId: x.atendente_id || "", consultorId: x.consultor_id || "", solicitanteId: x.solicitante_id || "", statusCliente: x.status_cliente || "",
        tipo: x.direto ? "__direto" : "", _semAnexo: !!x.sem_anexo, _pedidoVendedor: x.pedido_vendedor || "",
        transferencia: x.transf_pendente ? { status: "pendente" } : null, venda: x.venda_numero ? { numero: x.venda_numero } : null, _alheio: true };
    });
  } else {
    doDia = st.chamados.filter((c: any) => R.domMarketing(c) && c.dataLoja && R.podeVer(c) && String(c.dataLoja).slice(0, 10) === iso)
      .map((c: any) => ({ ...c, _pedidoVendedor: (c.tratativa && c.tratativa.pedidoAtend) || "" }));
  }
  const arr = doDia.filter((c: any) => escopo === "loja" || meuCliente(c)).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  if (!principal && !arr.length) return null;
  const origem = (c: any) => (c.tipo === "__direto" || R.ehDireto(c)) ? "marketing" : "externo";
  const semAnexo = (c: any) => c._alheio ? c._semAnexo && !c.venda : R.semAnexo(c);
  const nMkt = arr.filter((c: any) => origem(c) === "marketing").length, nExt = arr.length - nMkt;
  const nFila = arr.filter((c: any) => !c.atendenteId).length, nSemAnexo = arr.filter(semAnexo).length;
  const porHora: Record<string, any[]> = {};
  arr.forEach((c: any) => { const dt = String(c.dataLoja); const h = dt.length > 10 ? dt.slice(11, 16) : "sem hora"; (porHora[h] = porHora[h] || []).push(c); });
  const hoje = hojeISO();
  const d = parseData(iso + "T12:00");
  const titulo = (iso === hoje ? "Hoje · " : iso === maisDias(hoje, 1) ? "Amanhã · " : "") + DIAS[d.getDay()] + ", " + fmtDate(iso);
  const pedir = (c: any) => ex(() => A.solicitarAtendimento(c.id), "Pedido enviado — aguardando aprovação");
  const cancelar = (c: any) => ex(() => A.cancelarPedidoAtendimento(c.id), "Pedido cancelado");
  const responder = (c: any, ok: boolean) => ex(() => A.responderPedidoAtendimento(c.id, ok), ok ? "Aprovado — cliente com o vendedor" : "Pedido recusado");
  return (
    <div className="ag-dia">
      <div className="ag-dia-cab">
        <div><div className="ag-dia-tit">{titulo}</div>
          <div className="ag-dia-sub">{nMkt} marketing · {nExt} externos{nFila ? <> · <b style={{ color: "var(--warn)" }}>{nFila} sem vendedor (fila)</b></> : null}{nSemAnexo ? <> · <b style={{ color: "#b07a00" }}>{nSemAnexo} sem anexo</b></> : null}</div></div>
        <div className="ag-dia-total"><b>{arr.length}</b><span>agendado{arr.length === 1 ? "" : "s"}</span></div>
      </div>
      {!arr.length ? <div className="empty" style={{ padding: "20px 10px" }}>{resumida && loja === null ? "Carregando…" : <>Nenhum cliente {escopo === "meus" ? "seu " : ""}marcado neste dia.</>}</div> :
        Object.keys(porHora).sort().map(h => (
          <div className="ag-hora" key={h}><div className="hr">{h}</div><div className="slots">
            {porHora[h].map((c: any) => {
              const og = origem(c);
              const alheio = !!c._alheio, meu = meuCliente(c), meuAtend = c.atendenteId === eu;
              const cons = c.consultorId ? R.nomeUser(c.consultorId) : null, vend = c.atendenteId ? R.nomeUser(c.atendenteId) : null;
              const pedido = !c.atendenteId && c._pedidoVendedor ? c._pedidoVendedor : "";
              const t = c.tratativa || {};
              return (
                <div className="ag-card" key={c.id} data-origem={og} onClick={alheio ? undefined : () => abrirDetalhe(c.id)} style={alheio ? { cursor: "default" } : meuAtend ? { boxShadow: "inset 3px 0 0 var(--st-concluida)" } : undefined}>
                  <div><div className="nm"><span className={"origem " + og}>{og === "marketing" ? "Marketing" : "Externo"}</span> {c.cliente}
                    {semAnexo(c) && <> <span className="badge b-semanexo">⚠️ Sem anexo</span></>}
                    {t.querProjeto === "sim" && <> <span className="marca-loja sim">📐 Quer projeto</span></>}
                    {meu && <> <span className="marca-loja ok">seu cliente</span></>}</div>
                    <div className="dt">{alheio ? null : <>{c.telefone || "sem telefone"}</>}{cons ? <>{alheio ? "" : " · "}consultor <b>{cons}</b></> : null}
                      {vend ? <>{(alheio && !cons) ? "" : " · "}vendedor <b style={meuAtend ? { color: "var(--st-concluida)" } : undefined}>{meuAtend ? "você" : vend}</b></>
                        : pedido ? <>{(alheio && !cons) ? "" : " · "}<b style={{ color: "var(--primary)" }}>{pedido === eu ? "você pediu" : R.nomeUser(pedido) + " pediu"} — aguardando aprovação</b></>
                        : <>{(alheio && !cons) ? "" : " · "}<b style={{ color: "var(--warn)" }}>Sem vendedor · fila</b></>}</div>
                    {c.produto && <div className="dt">{c.produto}</div>}
                    {/* vendedor pede para assumir um cliente da fila */}
                    {souVendedor && !c.atendenteId && !R.ehGestao() && (!pedido
                      ? <div style={{ marginTop: 6 }}><button className="btn primary sm" onClick={e => { e.stopPropagation(); pedir(c); }}>Estou atendendo este cliente</button></div>
                      : pedido === eu ? <div style={{ marginTop: 6 }}><button className="btn ghost sm" onClick={e => { e.stopPropagation(); cancelar(c); }}>Cancelar meu pedido</button></div> : null)}
                    {/* quem coordena aprova o pedido */}
                    {!resumida && pedido && <div style={{ marginTop: 6, display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                      <button className="btn primary sm" onClick={() => responder(c, true)}>Aprovar {R.nomeUser(pedido)}</button>
                      <button className="btn ghost sm" onClick={() => responder(c, false)}>Recusar</button></div>}</div>
                  <div className="rt"><ScBadge c={c} />{c.transferencia && c.transferencia.status === "pendente" && <span className="pill" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>transf. pendente</span>}{c.venda && <span className="pill">venda {c.venda.numero}</span>}</div>
                </div>
              );
            })}
          </div></div>
        ))}
    </div>
  );
}
