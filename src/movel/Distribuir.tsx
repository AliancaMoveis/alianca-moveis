// App do celular — distribuição: direcionar consultor externo e definir vendedor (Gestão, Supervisão Marketing e Suporte).
import { useState } from "react";
import { confirmarConsultor, conflitosConsultor, sugestaoConsultor, textoConflito } from "../lib/agendaConsultor";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { SelVendedor, confirmarDisp, registrarIndisp } from "../comp/SelVendedor";
import { SeloLitoral } from "../comp/Ticket";
import { fmtTel } from "../lib/baseClientes";
import { hojeISO, isoLocal, parseData } from "../lib/regras";

const MARCO = "2026-10-14";
const dia = (v: any) => String(v || "").slice(0, 10);
const hora = (v: any) => { const s = String(v || ""); return s.length > 10 ? s.slice(11, 16) : ""; };
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const rotulo = (iso: string) => { if (!iso) return "sem data"; const h = hojeISO(); const d = parseData(iso.slice(0, 10) + "T12:00"); const am = new Date(parseData(h + "T12:00")); am.setDate(am.getDate() + 1);
  return iso.slice(0, 10) === h ? "hoje" : iso.slice(0, 10) === isoLocal(am) ? "amanhã" : DIAS[d.getDay()] + " " + d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); };

export const podeDistribuir = (R: any) => R.ehGestao() || R.mySetores().some((x: string) => ["marketing_supervisao", "suporte_consultores"].includes(x));

export function Distribuir({ soVend }: { soVend?: boolean } = {}) {
  const { R, st } = useApp() as any;
  const hoje = hojeISO();
  const semCons = R.ordenar(R.pendentesDirecionamento().slice());
  const mkt = st.chamados.filter((c: any) => R.domMarketing(c) && R.podeVer(c));
  const valida = (c: any) => c.dataLoja ? dia(c.dataLoja) >= MARCO : dia(c.criadoEm) >= MARCO;
  const semTodos = mkt.filter((c: any) => c.setorDestino === "suporte_consultores" && !c.atendenteId && valida(c) && R.statusClienteDe(c) === "agendado_loja" && R.precisaDefinirVendedor(c));
  const passaram = semTodos.filter((c: any) => c.dataLoja && dia(c.dataLoja) < hoje).sort((a: any, b: any) => String(b.dataLoja).localeCompare(String(a.dataLoja)));
  const semVend = semTodos.filter((c: any) => !(c.dataLoja && dia(c.dataLoja) < hoje)).sort((a: any, b: any) => String(a.dataLoja || "9").localeCompare(String(b.dataLoja || "9")));
  const comVend = mkt.filter((c: any) => c.atendenteId && c.dataLoja && dia(c.dataLoja) >= hoje && !c.venda && R.statusClienteDe(c) !== "nao_compareceu");
  const [aba, setAba] = useState<"cons" | "vend" | "pass">(!soVend && (semCons.length || !semVend.length) ? "cons" : "vend");
  const lista = aba === "cons" ? semCons : aba === "vend" ? semVend : passaram;
  return <>
    <div className="mv-seg">
      {!soVend && <button className={aba === "cons" ? "on" : ""} onClick={() => setAba("cons")}>🧭 Consultor<i>{semCons.length}</i></button>}
      <button className={aba === "vend" ? "on" : ""} onClick={() => setAba("vend")}>🛒 Vendedor<i>{semVend.length}</i></button>
      <button className={aba === "pass" ? "on" : ""} onClick={() => setAba("pass")}>⛔ Já passaram<i>{passaram.length}</i></button>
    </div>
    <div className="mv-dica" style={{ marginBottom: 10 }}>{aba === "cons" ? "Clientes que pediram visita e ainda não têm consultor externo." : aba === "vend" ? "Clientes com vinda à loja e sem vendedor. Do marketing, só quem quer projeto pronto (o resto vai para a fila automática)." : "A data da loja já passou e ninguém foi definido."}</div>
    {!lista.length ? <div className="mv-vazio">Nada para distribuir aqui. 👍</div>
      : lista.map((c: any) => aba === "cons" ? <CartaoCons key={c.id} c={c} /> : <CartaoVend key={c.id} c={c} comVend={comVend} />)}
  </>;
}

function CartaoCons({ c }: any) {
  const { R, executar: ex, toast, abrirDetalhe } = useApp() as any;
  const [cons, setCons] = useState("");
  const [dv, setDv] = useState(c.dataVisita ? String(c.dataVisita).slice(0, 16) : "");
  const hoje = hojeISO();
  const consultores = R.consultores();
  const doDia = (uid: string) => dv ? R.state.chamados.filter((x: any) => x.consultorId === uid && dia(x.dataVisita) === dia(dv) && !(x.tratativa && x.tratativa.realizada)).length : 0;
  const pend = (uid: string) => R.state.chamados.filter((x: any) => x.consultorId === uid && x.setorDestino === "consultor_externo" && !(x.tratativa && x.tratativa.realizada)).length;
  const ir = () => {
    if (!cons) { toast("Escolha o consultor"); return; }
    const mudouData = dv && dv !== String(c.dataVisita || "").slice(0, 16);
    if (!confirmarConsultor(R, cons, dv || c.dataVisita, c.id)) return;
    ex(() => A.direcionarConsultor(c.id, cons, mudouData ? dv : "", ""), "Direcionado — o consultor recebe no app");
  };
  return <div className="ds-card">
    <div className="ds-top" onClick={() => abrirDetalhe(c.id)}>
      <div className="ds-hora"><b>{hora(c.dataVisita) || "—"}</b><span>{c.dataVisita ? rotulo(c.dataVisita) : "sem data"}</span></div>
      <div className="ds-info"><b>{c.cliente} <SeloLitoral c={c} /></b><span>{c.endereco || "sem endereço"}</span><span>{c.produto || "—"}{c.telefone ? " · " + fmtTel(c.telefone) : ""}</span></div>
    </div>
    <div className="ds-acao">
      <select value={cons} onChange={e => setCons(e.target.value)}>
        <option value="">Escolher consultor…</option>
        {consultores.map((u: any) => <option key={u.id} value={u.id}>{u.nome}{dv ? ` · ${doDia(u.id)} no dia` : ""} · {pend(u.id)} a fazer{dv && conflitosConsultor(R, u.id, dv, c.id).length ? " · ⚠️ ocupado no horário" : ""}</option>)}
      </select>
      {cons && dv && (() => { const t = textoConflito(R, cons, dv, c.id); if (!t) return null; const s = sugestaoConsultor(R, dv, cons, c.id);
        return <div className="mv-dica" style={{ borderColor: "var(--warn)", color: "#8a5a00" }}>⚠️ {t}{s ? <> Sugestão: <a href="#" onClick={e => { e.preventDefault(); setCons(s.id); }}><b>{s.nome}</b></a> (livre).</> : " Nenhum outro livre nesse horário."}</div>; })()}
      <label className="ds-data">Visita<input type="datetime-local" value={dv} min={hoje + "T07:00"} onChange={e => setDv(e.target.value)} /></label>
      <button className="mv-principal" onClick={ir}>Direcionar</button>
    </div>
  </div>;
}

function CartaoVend({ c, comVend }: any) {
  const { R, executar: ex, toast, abrirDetalhe } = useApp() as any;
  const [v, setV] = useState("");
  const t = c.tratativa || {};
  const vendedores = R.vendAgenda();
  const noDia = (uid: string) => comVend.filter((x: any) => x.atendenteId === uid && x.id !== c.id && dia(x.dataLoja) === dia(c.dataLoja)).length;
  const sug = c.dataLoja ? vendedores.filter((a: any) => !R.dispVendedor(a.id, c.dataLoja, c).length).sort((a: any, b: any) => noDia(a.id) - noDia(b.id))[0] || null : null;
  const definir = async () => {
    if (!v) { toast("Escolha o vendedor"); return; }
    const d = confirmarDisp(R, v, c.dataLoja, c); if (!d.ok) return;
    if (await ex(() => A.designarProjetista(c.id, v), "Vendedor definido — avisado no app")) registrarIndisp(c.id, v, d.motivo);
  };
  return <div className="ds-card">
    <div className="ds-top" onClick={() => abrirDetalhe(c.id)}>
      <div className="ds-hora"><b>{hora(c.dataLoja) || "—"}</b><span>{rotulo(c.dataLoja)}</span></div>
      <div className="ds-info"><b><span className={"origem " + R.origemLoja(c)}>{R.origemLoja(c) === "marketing" ? "Mkt" : "Ext"}</span> {c.cliente} <SeloLitoral c={c} /></b>
        <span>{c.produto || "—"}{c.consultorId ? " · cons. " + R.nomeUser(c.consultorId).split(" ")[0] : ""}{c.telefone ? " · " + fmtTel(c.telefone) : ""}</span>
        {(R.semAnexo(c) || t.querProjeto === "sim" || t.pedeVendedor) && <span>{R.semAnexo(c) ? "⚠️ sem anexo " : ""}{t.querProjeto === "sim" ? "📐 quer projeto " : ""}{t.pedeVendedor ? "🙋 pediu vendedor" : ""}</span>}</div>
    </div>
    {t.pedidoAtend && <div className="ds-pedido">🙋 <b>{t.pedidoAtendNome || R.nomeUser(t.pedidoAtend)}</b> está atendendo — aprovar?
      <div><button className="btn primary sm" onClick={() => ex(() => A.responderPedidoAtendimento(c.id, true), "Aprovado")}>Aprovar</button>
        <button className="btn ghost sm" onClick={() => ex(() => A.responderPedidoAtendimento(c.id, false), "Pedido recusado")}>Recusar</button></div></div>}
    <div className="ds-acao">
      <SelVendedor value={v} onChange={setV} quando={c.dataLoja} c={c} lista={vendedores} placeholder="Escolher vendedor…" extra={(x: any) => (c.dataLoja ? ` (${noDia(x.id)} no dia)` : "") + (sug && sug.id === x.id ? " ⭐" : "")} />
      {sug && !v && <button className="btn sm" onClick={() => setV(sug.id)}>⭐ Sugerido: {sug.nome}</button>}
      <button className="mv-principal" onClick={definir}>Definir vendedor</button>
    </div>
  </div>;
}
