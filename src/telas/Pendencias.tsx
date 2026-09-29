import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { STATUS_CLIENTE, TIPO_REEMBOLSO, VENDA_STATUS, fmtDate, fmtDateTime, fmtMoeda } from "../lib/regras";
import { Kpi } from "./Dashboard";
import { PromissoriasAbertas, ValidarVenda } from "../comp/VendaValidar";
import { promAbertas, TIPO_VENDA_INFORMADO, parseMoeda } from "../lib/regras";

export function Pendencias() {
  const { R, abrirDetalhe } = useApp();
  const { grupos, total } = R.minhasPendencias();
  const u = R.me()!;
  const urgentes = grupos.filter((g: any) => ["visitaatrasada", "semAtualizacaoMkt", "meusatrasados", "criticos", "devolvido"].includes(g.chave)).reduce((s: number, g: any) => s + g.itens.length, 0);
  const aguardando = grupos.filter((g: any) => ["aceite", "apvendas", "appromis", "aptransf", "direcionar", "designar"].includes(g.chave)).reduce((s: number, g: any) => s + g.itens.length, 0);
  return (
    <section className="view active" id="view-pendencias">
      <div className="view-head"><div><h2>Minhas pendências</h2><p id="pdSub">O que depende de você, {u.nome}. O que chega para o seu setor fica em “Minha fila”.</p></div></div>
      <div className="kpis" id="pdKpis">
        <Kpi n={total} l="Pendências" />
        <Kpi n={urgentes} l="Precisam de ação urgente" cls={urgentes ? "alert" : ""} cor={urgentes ? "var(--danger)" : undefined} />
        <Kpi n={aguardando} l="Aguardando sua decisão" />
        <Kpi n={grupos.length} l="Tipos de pendência" />
      </div>
      {!total && <div id="pdVazio" className="empty"><div className="big">Tudo em dia</div>Nenhuma pendência pessoal no momento.</div>}
      <div id="pdSecoes">
        {grupos.map((g: any) => (
          <div className="ap-sec" key={g.chave}>
            <h3>{g.titulo} <span className="badge b-tratativa">{g.itens.length}</span></h3>
            <div className="sub">{g.desc}</div>
            {g.itens.map((c: any) => {
              const dom = R.domMarketing(c);
              const sc = R.statusClienteDe(c);
              const linha = dom
                ? `${sc ? STATUS_CLIENTE[sc] : ""}${c.dataVisita && !c.dataLoja ? " · visita " + fmtDateTime(c.dataVisita) : ""}${c.dataLoja ? " · loja " + fmtDateTime(c.dataLoja) : ""}${c.venda ? " · venda " + c.venda.numero : ""}`
                : `${R.tipoNome(c.tipo)} · ${R.setorNome(c.setorDestino)}${c.pedido ? " · pedido " + c.pedido : ""}`;
              return (
                <div className="ap-item" key={c.id} style={{ borderLeftColor: g.cor }} onClick={() => abrirDetalhe(c.id)}>
                  <div><div className="nm">{c.cliente}</div><div className="meta">{linha}</div></div>
                  <div className="acoes"><span className="pill">{c.id}</span></div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Aprovacoes() {
  const { R, abrirDetalhe, executar } = useApp();
  const p = R.pendenciasGestao();
  const [abrindo, setAbrindo] = useState("");
  const nProm = p.promissorias.reduce((n: number, c: any) => n + promAbertas(c.venda).length, 0);
  const reembPend = (R.state.reembolsos || []).filter((r: any) => r.status === "pendente");
  const decidirVenda = (id: string, ns: string) => executar(() => A.decidirVenda(id, ns, "aprovacoes"), "Venda " + VENDA_STATUS[ns].toLowerCase());
  const decidirTransf = (id: string, aceitar: boolean) => executar(() => A.responderTransferencia(id, aceitar, "aprovacoes"), aceitar ? "Transferência aprovada" : "Transferência recusada");
  const linhaVenda = (c: any, classe: string) => {
    const v = c.venda || {};
    return (
      <div className={"ap-item " + classe} key={c.id}>
        <div><div className="nm" onClick={() => abrirDetalhe(c.id)}>{c.cliente}</div>
          <div className="meta">Venda <b>{v.numero || "—"}</b> · {v.dataVenda ? fmtDate(v.dataVenda) : "—"} · vendedor <b>{v.vendedor || "—"}</b>{c.consultorId ? " · consultor " + R.nomeUser(c.consultorId) : " · origem Marketing"}</div></div>
        <div><div className="val">{v.valor ? "R$ " + v.valor : "—"}</div>
          <div className="acoes">
            {abrindo !== c.id && <button className="btn primary sm" onClick={() => setAbrindo(c.id)}>Validar</button>}
          </div></div>
        {abrindo === c.id && <div style={{ gridColumn: "1/-1", marginTop: 8 }}><ValidarVenda c={c} onFeito={() => setAbrindo("")} /><button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setAbrindo("")}>Fechar</button></div>}
      </div>
    );
  };
  return (
    <section className="view active" id="view-aprovacoes">
      <div className="view-head"><div><h2>Aprovações</h2><p>Tudo que depende de uma decisão sua. Aja direto daqui, sem precisar abrir cada cliente.</p></div></div>
      <div className="kpis" id="apKpis">
        <Kpi n={p.vendasConfirmar.length} l="Pendentes de análise" cls={p.vendasConfirmar.length ? "alert" : ""} cor={p.vendasConfirmar.length ? "var(--warn)" : undefined} />
        <Kpi n={nProm} l="Promissórias em aberto" cor={nProm ? "var(--st-tratativa)" : undefined} />
        <Kpi n={p.transferencias.length} l="Transferências" cor={p.transferencias.length ? "var(--primary)" : undefined} />
        <Kpi n={reembPend.length} l="Reembolsos" cor={reembPend.length ? "var(--warn)" : undefined} />
        <Kpi n={p.total + reembPend.length} l="Total pendente" />
      </div>
      <ReembolsosGestao />
      {!p.total && !reembPend.length && <div id="apVazio" className="empty"><div className="big">Nada pendente</div>Não há nenhuma decisão aguardando você.</div>}
      <div id="apSecoes">
        {p.vendasConfirmar.length > 0 && <VendasLote lista={p.vendasConfirmar} linha={linhaVenda} />}
        <PromissoriasAbertas titulo="Promissórias em aberto — clique no cliente para registrar o pagamento" />
        {p.transferencias.length > 0 && <div className="ap-sec"><h3>Transferências de vendedor <span className="badge b-aberta">{p.transferencias.length}</span></h3>
          <div className="sub">Pedidos feitos <b>entre vendedores</b>. Gestão, Supervisão de Marketing e Suporte trocam direto, sem passar por aqui. Enquanto não houver aceite ou aprovação, o cliente segue com o vendedor atual.</div>
          {p.transferencias.map(c => { const tr = c.transferencia; return (
            <div className="ap-item transf" key={c.id}>
              <div><div className="nm" onClick={() => abrirDetalhe(c.id)}>{c.cliente}</div><div className="meta"><b>{R.nomeUser(tr.de)}</b> → <b>{R.nomeUser(tr.para)}</b> · solicitada por {R.nomeUser(tr.solicitadoPor)} em {fmtDateTime(tr.quando)}</div></div>
              <div className="acoes"><button className="btn primary sm" onClick={() => decidirTransf(c.id, true)}>Aprovar</button><button className="btn danger sm" onClick={() => decidirTransf(c.id, false)}>Recusar</button></div>
            </div>); })}
        </div>}
      </div>
    </section>
  );
}

// Reembolsos (pedágio, estacionamento…) pedidos por consultores e medidores — a Gestão aprova ou recusa
export function ReembolsosGestao() {
  const { R, executar, toast } = useApp() as any;
  const [motivo, setMotivo] = useState<Record<string, string>>({});
  const [ver, setVer] = useState<string>("");
  const [sel, setSel] = useState<Record<string, boolean>>({}); const [quem, setQuem] = useState("");
  const todos = (R.state.reembolsos || []).filter((r: any) => r.status === "pendente").sort((a: any, b: any) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
  if (!todos.length) return null;
  const lista = todos.filter((r: any) => !quem || r.usuarioId === quem);
  const pessoasR = Array.from(new Set(todos.map((r: any) => r.usuarioId))) as string[];
  const marc = lista.filter((r: any) => sel[r.id]);
  const somaR = marc.reduce((s: number, r: any) => s + r.valor, 0);
  const aprovarMarc = () => {
    if (!marc.length) { toast("Marque os reembolsos conferidos"); return; }
    if (!confirm(`Aprovar ${marc.length} reembolso(s) · ${fmtMoeda(somaR)}?`)) return;
    executar(() => A.aprovarReembolsosLote(marc.map((r: any) => r.id)), marc.length + " reembolso(s) aprovado(s)").then((ok: boolean) => ok && setSel({}));
  };
  const abrir = async (r: any) => { const u = await A.urlComprovante(r.path); if (!u) { toast("Não foi possível abrir o comprovante"); return; } if (/\.pdf$/i.test(r.path || "")) window.open(u, "_blank", "noopener"); else setVer(u); };
  return (
    <div className="ap-sec"><h3>Reembolsos <span className="badge b-tratativa">{lista.length}</span></h3>
      <div className="sub">Despesas de consultores e medidores (pedágio, estacionamento…). Aprovado entra no valor a receber do mês da despesa.</div>
      <div className="lote-bar">
        <select value={quem} onChange={e => { setQuem(e.target.value); setSel({}); }}><option value="">Todas as pessoas ({todos.length})</option>{pessoasR.map(u => <option key={u} value={u}>{R.nomeUser(u)} ({todos.filter((r: any) => r.usuarioId === u).length})</option>)}</select>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={lista.length > 0 && lista.every((r: any) => sel[r.id])} onChange={e => { const n = { ...sel }; lista.forEach((r: any) => (n[r.id] = e.target.checked)); setSel(n); }} /> marcar todos</label>
        <div className="lote-res"><b>{marc.length}</b> marcado(s) · <b>{fmtMoeda(somaR)}</b></div>
        <button className="btn primary sm" disabled={!marc.length} onClick={aprovarMarc}>✅ Aprovar marcados</button>
      </div>
      {lista.map((r: any) => (
        <div className="ap-item" key={r.id}>
          <div><div className="nm"><input type="checkbox" checked={!!sel[r.id]} onChange={() => setSel({ ...sel, [r.id]: !sel[r.id] })} style={{ marginRight: 8 }} />{R.nomeUser(r.usuarioId)} · {TIPO_REEMBOLSO[r.tipo] || r.tipo}</div>
            <div className="meta">{fmtDate(r.data)}{r.descricao ? " · " + r.descricao : ""}{r.chamadoId ? " · cliente " + r.chamadoId : ""} · <a href="#" onClick={e => { e.preventDefault(); abrir(r); }}>ver comprovante</a></div></div>
          <div><div className="val">{fmtMoeda(r.valor)}</div>
            <div className="acoes">
              <button className="btn primary sm" onClick={() => executar(() => A.decidirReembolso(r.id, true), "Reembolso aprovado")}>Aprovar</button>
              <input placeholder="Motivo da recusa" value={motivo[r.id] || ""} onChange={e => setMotivo({ ...motivo, [r.id]: e.target.value })} style={{ maxWidth: 160 }} />
              <button className="btn danger sm" onClick={() => { const m = (motivo[r.id] || "").trim(); if (m.length < 3) { toast("Escreva o motivo da recusa"); return; } executar(() => A.decidirReembolso(r.id, false, m), "Reembolso recusado"); }}>Recusar</button>
            </div></div>
        </div>))}
      {ver && <div className="overlay on" onMouseDown={e => { if (e.target === e.currentTarget) setVer(""); }}><div className="modal" style={{ maxWidth: 560 }}><div className="mh"><b>Comprovante</b><button className="x" onClick={() => setVer("")}>&times;</button></div><div className="mb"><img src={ver} alt="comprovante" style={{ width: "100%", borderRadius: 8 }} /></div></div></div>}
    </div>
  );
}

// Vendas pendentes: conferência coletiva com filtro por pessoa e ação em massa
function VendasLote({ lista, linha }: { lista: any[]; linha: (c: any, cl: string) => any }) {
  const { R, executar, abrirDetalhe, toast } = useApp() as any;
  const [quem, setQuem] = useState(""); const [sel, setSel] = useState<Record<string, boolean>>({}); const [modo, setModo] = useState<"tabela" | "cartoes">("tabela");
  const vendedorDe = (c: any) => c.atendenteId ? R.nomeUser(c.atendenteId) : (c.venda.vendedor || "—");
  const pessoas: Record<string, string> = {};
  lista.forEach((c: any) => { pessoas["v:" + vendedorDe(c)] = "Vendedor · " + vendedorDe(c); if (c.consultorId) pessoas["c:" + c.consultorId] = "Consultor · " + R.nomeUser(c.consultorId); if (c.venda.gerenteNome) pessoas["g:" + c.venda.gerenteNome] = "Gerente · " + c.venda.gerenteNome; });
  const filtra = (c: any) => !quem || (quem.startsWith("v:") ? "v:" + vendedorDe(c) === quem : quem.startsWith("c:") ? "c:" + c.consultorId === quem : "g:" + c.venda.gerenteNome === quem);
  const vis = lista.filter(filtra).sort((a: any, b: any) => String(a.venda.dataVenda || a.venda.quando).localeCompare(String(b.venda.dataVenda || b.venda.quando)));
  const individual = (c: any) => ["entrada", "promissoria"].includes(c.venda.tipoInformado);
  const marcados = vis.filter((c: any) => sel[c.id]);
  const val = (c: any) => c.venda.valorNum != null ? Number(c.venda.valorNum) : parseMoeda(c.venda.valor);
  const soma = marcados.reduce((s: number, c: any) => s + val(c), 0);
  const todosOk = vis.filter((c: any) => !individual(c));
  const tudo = todosOk.length > 0 && todosOk.every((c: any) => sel[c.id]);
  const alternarTudo = () => { const n = { ...sel }; todosOk.forEach((c: any) => (n[c.id] = !tudo)); setSel(n); };
  const agir = (status: "efetivada" | "cancelada") => {
    if (!marcados.length) { toast("Marque as vendas conferidas"); return; }
    if (status === "efetivada" && marcados.some(individual)) { toast("Há venda com entrada/promissória marcada — valide essa individualmente"); return; }
    const txt = status === "efetivada" ? "EFETIVAR" : "CANCELAR";
    if (!confirm(`${txt} ${marcados.length} venda(s) · ${fmtMoeda(soma)}?\n\n${marcados.map((c: any) => "• " + c.venda.numero + " · " + c.cliente + " · " + fmtMoeda(val(c))).join("\n")}`)) return;
    executar(() => A.validarVendasLote(marcados.map((c: any) => c.id), status), marcados.length + (status === "efetivada" ? " venda(s) efetivada(s)" : " venda(s) cancelada(s)")).then((ok: boolean) => ok && setSel({}));
  };
  return (
    <div className="ap-sec"><h3>Vendas pendentes de análise <span className="badge b-tratativa">{lista.length}</span></h3>
      <div className="sub">Confira em conjunto (por vendedor, consultor ou gerente), marque as conferidas e efetive de uma vez. <b>Entrada + promissória</b> e <b>100% promissória</b> são validadas uma a uma (botão Validar).</div>
      <div className="lote-bar">
        <select value={quem} onChange={e => { setQuem(e.target.value); setSel({}); }}><option value="">Todas as pessoas ({lista.length})</option>{Object.entries(pessoas).sort((a, b) => a[1].localeCompare(b[1])).map(([k, l]) => <option key={k} value={k}>{l} ({lista.filter((c: any) => (k.startsWith("v:") ? "v:" + vendedorDe(c) === k : k.startsWith("c:") ? "c:" + c.consultorId === k : "g:" + c.venda.gerenteNome === k)).length})</option>)}</select>
        <div className="lote-res"><b>{marcados.length}</b> marcada(s) · <b>{fmtMoeda(soma)}</b></div>
        <button className="btn primary sm" disabled={!marcados.length} onClick={() => agir("efetivada")}>✅ Efetivar marcadas</button>
        <button className="btn danger sm" disabled={!marcados.length} onClick={() => agir("cancelada")}>❌ Cancelar marcadas</button>
        <button className="btn ghost sm" onClick={() => setModo(modo === "tabela" ? "cartoes" : "tabela")}>{modo === "tabela" ? "Ver em cartões" : "Ver em tabela"}</button>
      </div>
      {modo === "cartoes" ? vis.map((c: any) => linha(c, "")) :
        <div style={{ overflowX: "auto" }}><table className="dl-tab lote-tab"><thead><tr><th><input type="checkbox" checked={tudo} onChange={alternarTudo} title="Marcar todas" /></th><th>Venda</th><th>Data</th><th>Cliente</th><th>Vendedor</th><th>Gerente</th><th>Consultor</th><th>Pagamento informado</th><th style={{ textAlign: "right" }}>Valor</th><th></th></tr></thead>
          <tbody>{vis.map((c: any) => { const ind = individual(c); return (
            <tr key={c.id} className={sel[c.id] ? "on" : ""}>
              <td><input type="checkbox" disabled={ind} checked={!!sel[c.id]} onChange={() => setSel({ ...sel, [c.id]: !sel[c.id] })} /></td>
              <td><b>{c.venda.numero}</b></td><td>{fmtDate(c.venda.dataVendaReal || c.venda.dataVenda || c.venda.quando)}{c.venda.dataVendaReal && c.venda.dataVendaReal !== c.venda.dataVenda ? <small title="Venda de mês anterior: conta no mês da aprovação"> ↻</small> : null}</td>
              <td><a href="#" onClick={e => { e.preventDefault(); abrirDetalhe(c.id); }}>{c.cliente}</a>{R.ehProspeccao(c) ? " 🧭" : ""}</td>
              <td>{vendedorDe(c)}</td><td>{c.venda.gerenteNome || "—"}</td><td>{c.consultorId ? R.nomeUser(c.consultorId) : "—"}</td>
              <td>{c.venda.tipoInformado ? TIPO_VENDA_INFORMADO[c.venda.tipoInformado] : "—"}{c.venda.entradaInformada ? " · entrada " + fmtMoeda(c.venda.entradaInformada) : ""}</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>{fmtMoeda(val(c))}</td>
              <td>{ind ? <button className="btn sm" onClick={() => abrirDetalhe(c.id)}>Validar</button> : null}</td>
            </tr>); })}</tbody>
          <tfoot><tr><td colSpan={8}><b>Total na tela ({vis.length})</b></td><td style={{ textAlign: "right" }}><b>{fmtMoeda(vis.reduce((s: number, c: any) => s + val(c), 0))}</b></td><td></td></tr></tfoot>
        </table></div>}
    </div>
  );
}
