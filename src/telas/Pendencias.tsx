import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { STATUS_CLIENTE, TIPO_REEMBOLSO, VENDA_STATUS, fmtDate, fmtDateTime, fmtMoeda } from "../lib/regras";
import { Kpi } from "./Dashboard";

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
            {v.status !== "efetivada" && <button className="btn primary sm" onClick={() => decidirVenda(c.id, "efetivada")}>Efetivar</button>}
            {v.status !== "promissoria" && <button className="btn sm" onClick={() => decidirVenda(c.id, "promissoria")}>Promissória</button>}
            <button className="btn danger sm" onClick={() => decidirVenda(c.id, "cancelada")}>Cancelar</button>
          </div></div>
      </div>
    );
  };
  return (
    <section className="view active" id="view-aprovacoes">
      <div className="view-head"><div><h2>Aprovações</h2><p>Tudo que depende de uma decisão sua. Aja direto daqui, sem precisar abrir cada cliente.</p></div></div>
      <div className="kpis" id="apKpis">
        <Kpi n={p.vendasConfirmar.length} l="Vendas a confirmar" cls={p.vendasConfirmar.length ? "alert" : ""} cor={p.vendasConfirmar.length ? "var(--warn)" : undefined} />
        <Kpi n={p.promissorias.length} l="Promissórias em aberto" cor={p.promissorias.length ? "var(--st-tratativa)" : undefined} />
        <Kpi n={p.transferencias.length} l="Transferências" cor={p.transferencias.length ? "var(--primary)" : undefined} />
        <Kpi n={reembPend.length} l="Reembolsos" cor={reembPend.length ? "var(--warn)" : undefined} />
        <Kpi n={p.total + reembPend.length} l="Total pendente" />
      </div>
      <ReembolsosGestao />
      {!p.total && !reembPend.length && <div id="apVazio" className="empty"><div className="big">Nada pendente</div>Não há nenhuma decisão aguardando você.</div>}
      <div id="apSecoes">
        {p.vendasConfirmar.length > 0 && <div className="ap-sec"><h3>Vendas a confirmar <span className="badge b-tratativa">{p.vendasConfirmar.length}</span></h3><div className="sub">Registradas pelo vendedor. Não contam em nenhum relatório até você decidir.</div>{p.vendasConfirmar.map(c => linhaVenda(c, ""))}</div>}
        {p.promissorias.length > 0 && <div className="ap-sec"><h3>Promissórias em aberto <span className="badge b-tratativa">{p.promissorias.length}</span></h3><div className="sub">Já contam como venda, mas <b>não geram comissão</b> enquanto não forem efetivadas.</div>{p.promissorias.map(c => linhaVenda(c, "prom"))}</div>}
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
  const lista = (R.state.reembolsos || []).filter((r: any) => r.status === "pendente").sort((a: any, b: any) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
  if (!lista.length) return null;
  const abrir = async (r: any) => { const u = await A.urlComprovante(r.path); if (u) { setVer(u); } else toast("Não foi possível abrir o comprovante"); };
  return (
    <div className="ap-sec"><h3>Reembolsos <span className="badge b-tratativa">{lista.length}</span></h3>
      <div className="sub">Despesas de consultores e medidores (pedágio, estacionamento…). Aprovado entra no valor a receber do mês da despesa.</div>
      {lista.map((r: any) => (
        <div className="ap-item" key={r.id}>
          <div><div className="nm">{R.nomeUser(r.usuarioId)} · {TIPO_REEMBOLSO[r.tipo] || r.tipo}</div>
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
