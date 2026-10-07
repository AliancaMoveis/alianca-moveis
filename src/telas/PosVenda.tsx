// Pós-venda Projetados — números de qualidade (ocorrências, custos, montadores e impacto do checklist) e cadastro de montadores.
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { PV_DESC, PV_DESFECHO, PV_ORIGEM, PV_REEMB, PV_RESP, PV_SITUACAO, PV_TIPOS, STATUS, fmtDateTime, fmtMoeda, inicial, pvPrazo } from "../lib/regras";
import { BarRow, Kpi } from "./Dashboard";
import { Modal } from "../comp/Modal";
import { BotaoWhats } from "../comp/Whats";

const Nada = ({ t }: { t: string }) => <div style={{ color: "var(--ink-faint)", fontSize: 13 }}>{t}</div>;

const ABAS_PV: Record<string, [string, string]> = {
  clientes: ["👤 Solicitações de clientes", "Reclamações de clientes — abertas aqui no pós-venda ou pelo call center: prazos, reembolsos e descontos de montadores."],
  montadores: ["🔧 Solicitações de montadores", "Suporte aos montadores na obra (WhatsApp / telefone): montador parado, peça faltante, medida, dúvida de projeto."],
  numeros: ["Números do pós-venda", "Qualidade: responsabilidades, custos, montadores com mais pedidos de suporte, projetistas e medições com erro."],
  cadastro: ["Montadores", "Cadastro de montadores: WhatsApp, região preferencial e conta para pagamento."],
};
export default function PosVenda({ aba = "clientes" }: { aba?: string }) {
  const [t, d] = ABAS_PV[aba] || ABAS_PV.clientes;
  return (
    <section className="view active" id="view-posvenda">
      <div className="view-head"><div><h2>{t}</h2><p>{d}</p></div></div>
      {aba === "montadores" ? <Abertos origem="montador" /> : aba === "numeros" ? <Numeros /> : aba === "cadastro" ? <Montadores /> : <Abertos origem="cliente" />}
    </section>
  );
}

function Numeros() {
  const { R, st, abrirDetalhe, irPara } = useApp() as any;
  const [de, setDe] = useState(""); const [ate, setAte] = useState(""); const [fo, setFo] = useState("");
  let arr = st.chamados.filter((c: any) => c.tipo === "posvenda" && R.podeVer(c) && (!fo || ((c.posvenda || {}).origem || "cliente") === fo));
  if (de) arr = arr.filter((c: any) => new Date(c.criadoEm) >= new Date(de + "T00:00:00"));
  if (ate) arr = arr.filter((c: any) => new Date(c.criadoEm) <= new Date(ate + "T23:59:59"));
  const pv = (c: any) => c.posvenda || { responsabilidade: "analise", custo: 0, descontoMontador: 0 };
  const abertos = arr.filter((c: any) => c.status !== "concluida");
  const emAnalise = arr.filter((c: any) => pv(c).responsabilidade === "analise" && c.status !== "concluida");
  const custo = arr.reduce((t: number, c: any) => t + (pv(c).custo || 0), 0);
  const desconto = arr.reduce((t: number, c: any) => t + (pv(c).descontoMontador || 0), 0);
  const aDescontar = arr.filter((c: any) => pv(c).descontoStatus === "a_descontar").reduce((t: number, c: any) => t + (pv(c).descontoMontador || 0), 0);
  const reemb = arr.filter((c: any) => pv(c).reembolsoStatus);
  const reembPago = reemb.reduce((t: number, c: any) => t + (pv(c).reembolsoValor || 0), 0);
  const definidos = arr.filter((c: any) => pv(c).responsabilidade !== "analise");
  const projeto = definidos.filter((c: any) => ["medida", "checklist"].includes(pv(c).responsabilidade)).length;

  type G = { n: number; custo: number; desc: number; itens: any[] };
  const agrupar = (lista: any[], chave: (c: any) => string) => {
    const m: Record<string, G> = {};
    lista.forEach((c: any) => { const k = chave(c); if (!k) return; const g = (m[k] = m[k] || { n: 0, custo: 0, desc: 0, itens: [] }); g.n++; g.custo += pv(c).custo || 0; g.desc += pv(c).descontoMontador || 0; g.itens.push(c); });
    return Object.entries(m).sort((a, b) => b[1].n - a[1].n);
  };
  const porResp = agrupar(arr, (c: any) => pv(c).responsabilidade);
  const porTipo = agrupar(arr, (c: any) => pv(c).categoria);
  const porMont = agrupar(arr.filter((c: any) => pv(c).responsabilidade === "montador"), (c: any) => pv(c).montadorId);
  const porMed = agrupar(arr.filter((c: any) => pv(c).responsabilidade === "medida"), (c: any) => pv(c).medidorResp);
  const porChk = agrupar(arr.filter((c: any) => pv(c).responsabilidade === "checklist"), (c: any) => pv(c).checklistResp);
  const porFab = agrupar(arr.filter((c: any) => pv(c).responsabilidade === "fabrica"), (c: any) => c.fabrica);
  const mx = (rows: any[]) => Math.max(1, ...rows.map(r => r[1].n));
  const sub = (g: G, extra = "") => <div style={{ fontSize: 11.5, color: "var(--ink-faint)", margin: "-6px 0 8px 0" }}>custo {fmtMoeda(g.custo)}{g.desc ? " · descontos " + fmtMoeda(g.desc) : ""}{extra}</div>;
  const encaminhados = st.chamados.filter((x: any) => x.vinculadoA && arr.some((c: any) => c.id === x.vinculadoA));
  const porEnc: Record<string, number> = {}; encaminhados.forEach((x: any) => (porEnc[x.tipo] = (porEnc[x.tipo] || 0) + 1));
  const COR: Record<string, string> = { analise: "var(--warn)", montador: "var(--danger)", medida: "var(--st-tratativa)", checklist: "var(--st-tratativa)", fabrica: "var(--primary)", transporte: "var(--primary)", cliente: "var(--ink-faint)", nenhum: "var(--ink-faint)" };

  return (
    <>
      <div className="card" style={{ padding: "14px 18px", margin: "14px 0 16px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: 140 }}><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
          <div className="field" style={{ flex: 1, minWidth: 140 }}><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
          <button className="btn ghost sm" onClick={() => { setDe(""); setAte(""); }}>Limpar</button>
          <div className="subnav" style={{ margin: 0, marginLeft: "auto" }}>{([["", "Todas"], ["cliente", "👤 Clientes"], ["montador", "🔧 Montadores"]] as [string, string][]).map(([k, l]) => <button key={k} className={fo === k ? "on" : ""} onClick={() => setFo(k)}>{l}</button>)}</div>
        </div>
      </div>
      <div className="kpis">
        <Kpi n={arr.length} l="Atendimentos" />
        <Kpi n={abertos.length} l="Em aberto" />
        <Kpi n={emAnalise.length} l="Aguardando análise" cls={emAnalise.length ? "alert" : ""} />
        <Kpi n={fmtMoeda(custo)} l="Custo para a loja" fs={20} />
        <Kpi n={fmtMoeda(desconto)} l={"Descontos de montadores" + (aDescontar ? " · " + fmtMoeda(aDescontar) + " a descontar" : "")} fs={20} cls={aDescontar ? "alert" : ""} />
        <Kpi n={fmtMoeda(reembPago)} l={`Reembolsos a clientes (${reemb.filter((c: any) => pv(c).reembolsoStatus === "procedente").length} procedentes · ${reemb.filter((c: any) => pv(c).reembolsoStatus === "improcedente").length} improcedentes)`} fs={20} />
        <Kpi n={definidos.length ? Math.round(projeto / definidos.length * 100) + "%" : "—"} l={`Erros de projeto — medição/checklist (${projeto} de ${definidos.length} analisados)`} cls={projeto ? "alert" : ""} />
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Por responsabilidade</h3>
          {porResp.length ? porResp.map(([k, g]) => <div key={k}><BarRow nm={PV_RESP[k] || k} pct={g.n / mx(porResp) * 100} v={g.n} cor={COR[k]} />{sub(g)}</div>) : <Nada t="Nenhum atendimento no período." />}
        </div>
        <div className="panel"><h3>Por tipo de problema</h3>
          {porTipo.length ? porTipo.map(([k, g]) => <div key={k}><BarRow nm={PV_TIPOS[k] || k} pct={g.n / mx(porTipo) * 100} v={g.n} />{sub(g)}</div>) : <Nada t="Tipo de problema ainda não informado." />}
        </div>
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Montadores responsáveis</h3>
          {porMont.length ? porMont.map(([k, g]) => <div key={k}><BarRow nm={R.nomeMontador(k)} pct={g.n / mx(porMont) * 100} v={g.n} cor="var(--danger)" />{sub(g)}</div>) : <Nada t="Nenhuma ocorrência atribuída a montador." />}
        </div>
        <div className="panel"><h3>Projeto — medição e checklist</h3>
          {porMed.map(([k, g]) => <div key={"m" + k}><BarRow nm={"Medição · " + R.nomeUser(k)} pct={g.n / mx(porMed.concat(porChk)) * 100} v={g.n} cor="var(--st-tratativa)" />{sub(g)}</div>)}
          {porChk.map(([k, g]) => <div key={"c" + k}><BarRow nm={"Checklist · " + R.nomeUser(k)} pct={g.n / mx(porMed.concat(porChk)) * 100} v={g.n} cor="var(--st-tratativa)" />{sub(g)}</div>)}
          {!porMed.length && !porChk.length && <Nada t="Nenhum erro de projeto registrado." />}
        </div>
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Fábricas responsáveis</h3>
          {porFab.length ? porFab.map(([k, g]) => <div key={k}><BarRow nm={R.nomeFab(k)} pct={g.n / mx(porFab) * 100} v={g.n} cor="var(--primary)" />{sub(g)}</div>) : <Nada t="Nenhuma ocorrência atribuída a fábrica." />}
        </div>
        <div className="panel"><h3>Desfecho dos concluídos</h3>
          {(() => { const g = agrupar(arr.filter((c: any) => c.status === "concluida"), (c: any) => pv(c).desfecho || "sem"); return g.length ? g.map(([k, x]) => <div key={k}><BarRow nm={PV_DESFECHO[k] || "Sem desfecho (antigos)"} pct={x.n / mx(g) * 100} v={x.n} />{sub(x)}</div>) : <Nada t="Nenhum atendimento concluído no período." />; })()}
        </div>
        <div className="panel"><h3>Montadores com mais pedidos de suporte</h3>
          {(() => { const g = agrupar(arr.filter((c: any) => pv(c).origem === "montador"), (c: any) => pv(c).montadorId || "?"); return g.length ? g.map(([k, x]) => <BarRow key={k} nm={k === "?" ? "Não informado" : R.nomeMontador(k)} pct={x.n / mx(g) * 100} v={x.n} cor="var(--st-respondida)" />) : <Nada t="Nenhum pedido de suporte de montador." />; })()}
        </div>
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Projetistas do checklist nas ocorrências</h3>
          {(() => { const g = agrupar(arr, (c: any) => pv(c).projetistaChecklist || ""); const erro = (k: string) => arr.filter((c: any) => pv(c).projetistaChecklist === k && pv(c).responsabilidade === "checklist").length;
            return g.length ? g.map(([k, x]) => <div key={k}><BarRow nm={k} pct={x.n / mx(g) * 100} v={x.n} cor="var(--st-tratativa)" /><div style={{ fontSize: 11.5, color: erro(k) ? "var(--danger)" : "var(--ink-faint)", margin: "-6px 0 8px" }}>{erro(k)} com falha no checklist confirmada{x.custo ? " · custo " + fmtMoeda(x.custo) : ""}</div></div>) : <Nada t="Nenhuma ocorrência com projetista informado." />; })()}
        </div>
        <div className="panel"><h3>Situações nas solicitações de montadores</h3>
          {(() => { const g = agrupar(arr.filter((c: any) => pv(c).origem === "montador"), (c: any) => pv(c).situacao || ""); return g.length ? g.map(([k, x]) => <BarRow key={k} nm={(PV_SITUACAO[k] || k).replace(/^🚨 /, "")} pct={x.n / mx(g) * 100} v={x.n} cor={k === "parado" ? "var(--danger)" : "var(--st-respondida)"} />) : <Nada t="Nenhuma solicitação de montador no período." />; })()}
        </div>
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Quem acionou e encaminhamentos</h3>
          {agrupar(arr, (c: any) => pv(c).origem || "cliente").map(([k, g]) => <BarRow key={k} nm={PV_ORIGEM[k] || k} pct={g.n / Math.max(1, arr.length) * 100} v={g.n} cor="var(--st-respondida)" />)}
          <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--ink-soft)" }}>{Object.keys(porEnc).length ? <>Encaminhados a outros setores: {Object.entries(porEnc).map(([t, n]) => `${R.tipoNome(t)} (${n})`).join(" · ")}</> : "Nenhum encaminhamento a outro setor."}</div>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 16 }}><h3>Atendimentos do período</h3>
        {arr.length ? R.ordenar(arr.slice()).map((c: any) => {
          const p = pv(c);
          return (
            <div className="acao" key={c.id} style={{ borderLeftColor: COR[p.responsabilidade] || "var(--line)" }} onClick={() => abrirDetalhe(c.id)}>
              <span>{c.id} · {c.cliente}{p.pecaAfetada ? " · " + p.pecaAfetada : ""} · <b style={p.responsabilidade === "analise" ? { color: "var(--warn)" } : undefined}>{PV_RESP[p.responsabilidade]}</b>{p.categoria ? " · " + PV_TIPOS[p.categoria] : ""}{p.custo ? " · " + fmtMoeda(p.custo) : ""}</span>
              <span className="g">{STATUS[c.status].label}</span>
            </div>
          );
        }) : <Nada t="Nenhum atendimento de pós-venda no período." />}
      </div>
    </>
  );
}

// Painel do dia do Pós-venda: montador parado primeiro, depois prazo vencido, prazo de hoje, sem prazo; e pendências de dinheiro
function Abertos({ origem }: { origem: "cliente" | "montador" }) {
  const { R, st, abrirDetalhe, irPara } = useApp() as any;
  const todos = st.chamados.filter((c: any) => c.tipo === "posvenda" && R.podeVer(c) && ((c.posvenda || {}).origem || "cliente") === origem);
  const pv = (c: any) => c.posvenda || {};
  const [verConc, setVerConc] = useState(false);
  const abertos = todos.filter((c: any) => c.status !== "concluida");
  const concluidos = todos.filter((c: any) => c.status === "concluida").sort((a: any, b: any) => String(b.concluidoEm || b.criadoEm).localeCompare(String(a.concluidoEm || a.criadoEm)));
  const peso = (c: any) => (pv(c).paradoObra ? 0 : pvPrazo(c) === "vencido" ? 1 : pvPrazo(c) === "hoje" ? 2 : !pv(c).prazo ? 3 : 4);
  const lista = abertos.slice().sort((a: any, b: any) => peso(a) - peso(b) || +new Date(pv(a).prazo || a.criadoEm) - +new Date(pv(b).prazo || b.criadoEm));
  const reembAnalise = todos.filter((c: any) => pv(c).reembolsoStatus === "em_analise");
  const reembPagar = todos.filter((c: any) => pv(c).reembolsoStatus === "procedente" && !pv(c).reembolsoPagoEm);
  const aDescontar = todos.filter((c: any) => pv(c).descontoStatus === "a_descontar");
  const dias = (iso: string) => Math.max(0, Math.floor((Date.now() - +new Date(iso)) / 864e5));
  const Linha = ({ c, extra }: any) => {
    const p = pv(c); const pz = pvPrazo(c);
    const cor = p.paradoObra ? "var(--danger)" : pz === "vencido" ? "var(--danger)" : pz === "hoje" ? "var(--warn)" : "var(--line)";
    return (
      <div className="acao" style={{ borderLeftColor: cor }} onClick={() => abrirDetalhe(c.id)}>
        <span>{p.paradoObra && <b style={{ color: "var(--danger)" }}>🚨 PARADO NA OBRA · </b>}{c.id} · <b>{c.cliente}</b>
          {p.origem === "montador" ? " · 🔧 montador " + (p.montadorId ? R.nomeMontador(p.montadorId) : "") : " · 👤 cliente"}
          {p.origem === "montador" && p.situacao ? " · " + (PV_SITUACAO[p.situacao] || "").replace(/^🚨 /, "") : p.categoria ? " · " + PV_TIPOS[p.categoria] : ""}{p.pecaAfetada ? " · " + p.pecaAfetada : ""}{extra}</span>
        {p.origem === "montador" && p.montadorId && (() => { const m = (st.montadores || []).find((x: any) => x.id === p.montadorId); return m && m.telefone ? <BotaoWhats tel={m.telefone} rotulo="" /> : null; })()}
        <span className="g" style={pz === "vencido" ? { color: "var(--danger)", fontWeight: 600 } : { color: pz === "hoje" ? "var(--warn)" : "var(--ink-faint)" }}>
          {p.prazo ? (pz === "vencido" ? "venceu " : "até ") + fmtDateTime(p.prazo) : "sem prazo"} · {dias(c.criadoEm)}d aberto</span>
      </div>
    );
  };
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", margin: "14px 0 0" }}>{R.ehPosvenda() && <button className="btn primary sm" onClick={() => irPara(origem === "montador" ? "novopv_mont" : "novopv_cli")}>{origem === "montador" ? "+ Nova solicitação do montador" : "+ Nova solicitação do cliente"}</button>}</div>
      <div className="kpis" style={{ marginTop: 12 }}>
        <Kpi n={abertos.length} l="Em aberto" />
        {origem === "montador" && <Kpi n={abertos.filter((c: any) => pv(c).paradoObra).length} l="Montador parado na obra" cls={abertos.some((c: any) => pv(c).paradoObra) ? "alert" : ""} />}
        <Kpi n={abertos.filter((c: any) => pvPrazo(c) === "vencido").length} l="Prazo vencido" cls={abertos.some((c: any) => pvPrazo(c) === "vencido") ? "alert" : ""} />
        <Kpi n={abertos.filter((c: any) => !pv(c).prazo).length} l="Sem prazo definido" />
        <Kpi n={reembAnalise.length + reembPagar.length} l="Reembolsos a decidir / pagar" cls={reembAnalise.length + reembPagar.length ? "alert" : ""} />
        <Kpi n={fmtMoeda(aDescontar.reduce((t: number, c: any) => t + (pv(c).descontoMontador || 0), 0))} l={aDescontar.length + " desconto(s) de montador a fazer"} fs={20} />
      </div>
      <div className="panel" style={{ marginTop: 16 }}><h3>{origem === "montador" ? "Fila — solicitações de montadores" : "Fila — solicitações de clientes"}</h3>
        {lista.length ? lista.map((c: any) => <Linha key={c.id} c={c} />) : <Nada t="Nada em aberto. 👏" />}
      </div>
      {concluidos.length > 0 && <div className="panel" style={{ marginTop: 16 }}><h3 style={{ display: "flex", alignItems: "center", gap: 10 }}>Concluídas <span className="pill">{concluidos.length}</span><button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => setVerConc(v => !v)}>{verConc ? "esconder" : "ver"}</button></h3>
        {verConc && concluidos.slice(0, 100).map((c: any) => <Linha key={c.id} c={c} extra={pv(c).desfecho ? <> · <b>{PV_DESFECHO[pv(c).desfecho]}</b></> : null} />)}
      </div>}
      {(reembAnalise.length > 0 || reembPagar.length > 0) && <div className="panel" style={{ marginTop: 16 }}><h3>Reembolsos pedidos por clientes</h3>
        {reembAnalise.map((c: any) => <Linha key={c.id} c={c} extra={<> · <b style={{ color: "var(--warn)" }}>{PV_REEMB.em_analise}</b></>} />)}
        {reembPagar.map((c: any) => <Linha key={c.id} c={c} extra={<> · <b style={{ color: "var(--danger)" }}>a pagar {fmtMoeda(pv(c).reembolsoValor)}</b></>} />)}
      </div>}
      {aDescontar.length > 0 && <div className="panel" style={{ marginTop: 16 }}><h3>Descontos de montador a fazer</h3>
        {aDescontar.map((c: any) => <Linha key={c.id} c={c} extra={<> · <b>{R.nomeMontador(pv(c).montadorId)}</b> · {PV_DESC.a_descontar} {fmtMoeda(pv(c).descontoMontador)}</>} />)}
      </div>}
    </>
  );
}

function Montadores() {
  const { R, st, executar, setModal } = useApp() as any;
  const [q, setQ] = useState("");
  const lista = (st.montadores || []).slice().sort((a: any, b: any) => (a.ativo === b.ativo ? a.nome.localeCompare(b.nome) : a.ativo ? -1 : 1))
    .filter((m: any) => !q || (m.nome + " " + (m.regiao || "")).toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}><button className="btn primary" onClick={() => setModal(<EditMontador id={null} />)}>Adicionar montador</button>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome ou região" style={{ maxWidth: 280 }} /></div>
      {lista.length ? lista.map((m: any) => (
        <div className="fab" key={m.id} style={m.ativo ? undefined : { opacity: .6 }}><div className="fi">{inicial(m.nome)}</div>
          <div><div className="fn">{m.nome}{!m.ativo && <span className="pill" style={{ marginLeft: 6 }}>inativo</span>}</div>
            <div className="fc">{m.telefone || "sem telefone"}{m.regiao ? " · região: " + m.regiao : ""}</div></div>
          <div className="sp"><BotaoWhats tel={m.telefone} /><button className="btn ghost sm" onClick={() => setModal(<EditMontador id={m.id} />)}>Editar</button>
            <button className={"btn sm" + (m.ativo ? " danger" : "")} onClick={() => executar(() => A.ativarMontador(m.id, !m.ativo), m.ativo ? "Montador desativado" : "Montador reativado")}>{m.ativo ? "Desativar" : "Reativar"}</button></div>
        </div>
      )) : <div className="empty">{q ? "Nenhum montador encontrado." : "Nenhum montador cadastrado."}</div>}
    </div>
  );
}

const CONTA_VAZIA = { titular: "", docTitular: "", banco: "", agencia: "", conta: "", tipoConta: "corrente", pixTipo: "", pixChave: "", obs: "" };
function EditMontador({ id }: { id: string | null }) {
  const { st, executar, setModal, toast } = useApp() as any;
  const m = id ? st.montadores.find((x: any) => x.id === id) : { nome: "", telefone: "", regiao: "" };
  const [nome, setNome] = useState(m.nome); const [tel, setTel] = useState(m.telefone || ""); const [reg, setReg] = useState(m.regiao || "");
  const fechar = () => setModal(null);
  const salvar = async () => {
    if (!nome.trim()) { toast("Informe o nome"); return; }
    if (await executar(() => A.montadorSalvar({ id, nome: nome.trim(), telefone: tel.trim(), regiao: reg.trim() }), "Montador salvo")) fechar();
  };
  return (
    <Modal titulo={id ? "Editar montador" : "Novo montador"} onFechar={fechar}>
      <div className="grid">
        <div className="field full"><label>Nome <span className="req-star">*</span></label><input value={nome} onChange={e => setNome(e.target.value)} /></div>
        <div className="field"><label>Telefone / WhatsApp</label><input value={tel} onChange={e => setTel(e.target.value)} placeholder="(41) 99999-9999" /></div>
        <div className="field"><label>Região preferencial <span className="hint">(só para controle)</span></label><input value={reg} onChange={e => setReg(e.target.value)} placeholder="Ex.: Curitiba Sul, São José, Litoral" /></div>
      </div>
      <div className="hint" style={{ marginTop: 10 }}>A conta para pagamento do montador fica na Administração (dado sensível).</div>
      <div style={{ marginTop: 18 }}><button className="btn primary" onClick={salvar}>Salvar</button></div>
    </Modal>
  );
}

/** Administração → contas de pagamento dos montadores (só a Gestão vê e altera — o banco recusa os demais) */
export function ContasMontadores() {
  const { st, setModal } = useApp() as any;
  const [q, setQ] = useState(""); const [f, setF] = useState<"" | "sem" | "semdoc">("");
  const todos = (st.montadores || []).filter((m: any) => m.ativo).slice().sort((a: any, b: any) => a.nome.localeCompare(b.nome));
  const temConta = (m: any) => !!(m.conta && (m.conta.conta || m.conta.pixChave));
  const lista = todos.filter((m: any) => (!q || (m.nome + " " + (m.conta?.titular || "")).toLowerCase().includes(q.toLowerCase()))
    && (f === "" || (f === "sem" ? !temConta(m) : temConta(m) && !m.conta.docTitular)));
  return (
    <div style={{ marginTop: 14 }}>
      <div className="ro-note" style={{ marginBottom: 12 }}>🔒 Dados bancários dos montadores — visíveis e editáveis só pela Gestão. Base para o futuro financeiro de montagem (pagamentos com os dados do Exact).</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div className="chips">{([["", "Todos", todos.length], ["sem", "Sem conta", todos.filter((m: any) => !temConta(m)).length], ["semdoc", "Sem CPF/CNPJ do titular", todos.filter((m: any) => temConta(m) && !m.conta.docTitular).length]] as [any, string, number][])
          .map(([k, l, n]) => <button key={k} className={"chip" + (f === k ? " on" : "")} onClick={() => setF(k)}>{l}<span className="n">{n}</span></button>)}</div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar montador ou titular" style={{ marginLeft: "auto", maxWidth: 280 }} />
      </div>
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>{["Montador", "Titular", "CPF / CNPJ", "Banco", "Agência", "Conta", "Pix", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "8px", fontSize: 12, color: "var(--ink-soft)", borderBottom: "2px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
          <tbody>{lista.map((m: any) => { const c = m.conta || {}; const td: React.CSSProperties = { padding: "7px 8px", borderBottom: "1px solid var(--line-soft)" };
            return <tr key={m.id}><td style={td}><b>{m.nome}</b></td><td style={td}>{c.titular || <span className="hint">—</span>}</td><td style={td}>{c.docTitular || <span className="hint" style={{ color: "var(--warn)" }}>falta</span>}</td>
              <td style={td}>{c.banco || <span className="hint">—</span>}</td><td style={td}>{c.agencia || "—"}</td><td style={{ ...td, whiteSpace: "nowrap" }}>{c.conta || "—"}</td><td style={td}>{c.pixChave ? c.pixTipo + ": " + c.pixChave : "—"}</td>
              <td style={td}><button className="btn ghost sm" onClick={() => setModal(<EditConta id={m.id} />)}>Editar</button></td></tr>; })}</tbody>
        </table>
        {!lista.length && <div className="empty">Nenhum montador neste filtro.</div>}
      </div>
    </div>
  );
}
function EditConta({ id }: { id: string }) {
  const { st, executar, setModal } = useApp() as any;
  const m = st.montadores.find((x: any) => x.id === id);
  const [ct, setCt] = useState<any>({ ...CONTA_VAZIA, ...(m.conta || {}) });
  const c = (k: string) => (e: any) => setCt((x: any) => ({ ...x, [k]: e.target.value }));
  const fechar = () => setModal(null);
  return (
    <Modal titulo={"Conta para pagamento · " + m.nome} onFechar={fechar}>
      <div className="grid">
        <div className="field"><label>Titular da conta</label><input value={ct.titular} onChange={c("titular")} placeholder="Nome do titular" /></div>
        <div className="field"><label>CPF / CNPJ do titular</label><input value={ct.docTitular} onChange={c("docTitular")} /></div>
        <div className="field"><label>Banco</label><input value={ct.banco} onChange={c("banco")} placeholder="Ex.: 748 · Sicredi" /></div>
        <div className="field"><label>Tipo de conta</label><select value={ct.tipoConta} onChange={c("tipoConta")}><option value="corrente">Conta corrente</option><option value="poupanca">Poupança</option><option value="pagamento">Conta de pagamento</option></select></div>
        <div className="field"><label>Agência</label><input value={ct.agencia} onChange={c("agencia")} /></div>
        <div className="field"><label>Conta (com dígito)</label><input value={ct.conta} onChange={c("conta")} /></div>
        <div className="field"><label>Tipo de chave Pix</label><select value={ct.pixTipo} onChange={c("pixTipo")}><option value="">Sem Pix</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="telefone">Telefone</option><option value="email">E-mail</option><option value="aleatoria">Chave aleatória</option></select></div>
        {ct.pixTipo && <div className="field"><label>Chave Pix</label><input value={ct.pixChave} onChange={c("pixChave")} /></div>}
        <div className="field full"><label>Observação</label><input value={ct.obs} onChange={c("obs")} /></div>
      </div>
      {m.conta && m.conta.atualizadoPor && <div className="hint" style={{ marginTop: 6 }}>Atualizada por {m.conta.atualizadoPor} em {fmtDateTime(m.conta.atualizadoEm)}</div>}
      <div style={{ marginTop: 18 }}><button className="btn primary" onClick={async () => { if (await executar(() => A.montadorSalvar({ id, nome: m.nome, telefone: m.telefone, regiao: m.regiao, conta: ct }), "Conta salva")) fechar(); }}>Salvar</button></div>
    </Modal>
  );
}
