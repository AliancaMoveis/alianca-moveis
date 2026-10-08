// Menus por setor (Montagem, Assistência, Solicitação Fábrica, pedidos do call center no Checklist) e o menu Jurídico.
// O cliente é o mesmo chamado do call center: o setor trata aqui; a solução volta para o call center (ou o setor finaliza).
import { useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { SETORES_MENU, fmtDate, hojeISO, isoLocal } from "../lib/regras";
import { Ticket, Vazio } from "../comp/Ticket";

const tira = (t: string) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const bate = (c: any, q: string) => { const t = tira(q.trim()); if (!t) return true; const d = t.replace(/\D/g, ""); const tx = tira([c.id, c.cliente, c.clienteDoc, c.telefone, c.pedido, c.produto].join(" ")); return tx.includes(t) || (d.length >= 4 && tx.replace(/\D/g, "").includes(d)); };

/** quem é "para mim" num setor: direcionado a mim (retorno do montador, vendedor) ou que eu abri */
export const paraMim = (c: any, eu: string) => (c.tratativa?.retorno?.atendenteId === eu) || c.atendenteId === eu || c.solicitanteId === eu || (c.transferencia?.status === "pendente" && c.transferencia?.para === eu);
export function listaSetor(R: any, st: any, setor: string, aba: string) {
  const eu = R.currentUserId;
  if (setor === "checklist" && aba === "cc") return st.chamados.filter((c: any) => c.tipo === "checklist" && /call center/i.test(c.setor || "") && c.status !== "concluida" && R.podeVer(c));
  const doSetor = st.chamados.filter((c: any) => c.setorDestino === setor && R.podeVer(c) && !R.domMarketing(c));
  const aberto = (c: any) => !["concluida", "informar"].includes(c.status);
  if (aba === "mim") return doSetor.filter((c: any) => aberto(c) && paraMim(c, eu));
  if (aba === "resolvidos") { const lim = new Date(); lim.setDate(lim.getDate() - 60); return doSetor.filter((c: any) => !aberto(c) && new Date(c.criadoEm) >= lim); }
  return doSetor.filter(aberto);
}

export function SetorFila({ setor, aba }: { setor: string; aba: string }) {
  const { R, st } = useApp() as any;
  const [q, setQ] = useState(""); const [fTipo, setFTipo] = useState(""); const [pr, setPr] = useState("");
  const nome = setor === "checklist" ? "Checklist" : (SETORES_MENU.find(x => x[0] === setor) || [setor, R.setorNome(setor)])[1];
  const titulo = aba === "cc" ? "📞 Pedidos do call center" : aba === "mim" ? "Para mim" : aba === "resolvidos" ? "Resolvidos" : "Fila do setor";
  const sub = aba === "cc" ? "Clientes que pediram o checklist pelo call center. Trate na ficha (agendar, registrar resultado) e finalize o atendimento — o call center vê a resposta."
    : aba === "mim" ? "Direcionados para você (ex.: retorno do montador) ou que você abriu. Prioridade de atendimento."
    : aba === "resolvidos" ? "Últimos 60 dias: finalizados ou devolvidos ao call center para informar o cliente."
    : "Tudo que chegou do call center para o setor e ainda não foi resolvido. Ordenado por prioridade.";
  let base = listaSetor(R, st, setor, aba).filter((c: any) => (!fTipo || c.tipo === fTipo) && bate(c, q));
  const tipos = Array.from(new Set(listaSetor(R, st, setor, aba).map((c: any) => c.tipo))) as string[];
  const cont = (k: string) => base.filter((c: any) => R.prioridade(c) === k).length;
  if (pr) base = base.filter((c: any) => R.prioridade(c) === pr);
  const arr = aba === "resolvidos" ? base.slice().sort((a: any, b: any) => String(b.criadoEm).localeCompare(String(a.criadoEm))) : R.ordenar(base);
  return (
    <section className="view active">
      <div className="view-head"><div><h2>{nome} · {titulo}</h2><p>{sub}</p></div></div>
      <div className="toolbar">
        <div className="search"><input placeholder="Buscar cliente, CPF, telefone, venda, nº" value={q} onChange={e => setQ(e.target.value)} /></div>
        {tipos.length > 1 && <select value={fTipo} onChange={e => setFTipo(e.target.value)}><option value="">Todos os motivos</option>{tipos.map(k => <option key={k} value={k}>{R.tipoNome(k)}</option>)}</select>}
      </div>
      {aba !== "resolvidos" && <div className="chips">{[["", "Todos", base.length], ["critico", "Críticos (+24h)", cont("critico")], ["atrasado", "Atrasados", cont("atrasado")], ["urgente", "Urgentes", cont("urgente")]].map(([k, l, n]: any) =>
        <button key={k} className={"chip" + (pr === k ? " on" : "")} onClick={() => setPr(k)}>{l}<span className="n">{n}</span></button>)}</div>}
      <div className="list">{arr.length ? arr.map((c: any) => <Ticket key={c.id} c={c} resposta={aba === "resolvidos"} />) : <Vazio big={aba === "resolvidos" ? "Nada resolvido ainda" : "Nada pendente 👍"}>{aba === "mim" ? "Nada direcionado para você agora." : ""}</Vazio>}</div>
    </section>
  );
}

// ================= JURÍDICO =================
export const JUR_CAT: Record<string, string> = { reclame_aqui: "Reclame Aqui", procon: "Procon", processo: "Processo judicial", reclamacao: "Reclamação formal", notificacao: "Notificação extrajudicial", outro: "Outro" };
export const JUR_SIT: Record<string, string> = { andamento: "Em andamento", aguardando_cliente: "Aguardando cliente", aguardando_terceiro: "Aguardando terceiro (órgão/fábrica)", acordo: "Acordo", encerrado: "Encerrado" };
export const jurDe = (c: any) => (c.tratativa && c.tratativa.juridico) || {};

export function Juridico({ aba }: { aba: string }) {
  const { R, st } = useApp() as any;
  const [q, setQ] = useState(""); const [cat, setCat] = useState("");
  if (aba === "novo") return <JurNovo />;
  const todos = st.chamados.filter((c: any) => c.tipo === "juridico" && R.podeVer(c));
  const lim = new Date(); lim.setDate(lim.getDate() + 15); const limIso = isoLocal(lim);
  let l = aba === "encerrados" ? todos.filter((c: any) => c.status === "concluida")
    : aba === "prazos" ? todos.filter((c: any) => c.status !== "concluida" && jurDe(c).prazo && jurDe(c).prazo <= limIso)
    : todos.filter((c: any) => c.status !== "concluida");
  l = l.filter((c: any) => (!cat || jurDe(c).categoria === cat) && bate({ ...c, produto: [jurDe(c).protocolo, jurDe(c).processo, jurDe(c).orgao].join(" ") }, q));
  l = l.slice().sort((a: any, b: any) => String(jurDe(a).prazo || "9999").localeCompare(String(jurDe(b).prazo || "9999")));
  const hoje = hojeISO();
  return (
    <section className="view active">
      <div className="view-head"><div><h2>⚖ Jurídico · {aba === "encerrados" ? "Encerrados" : aba === "prazos" ? "Prazos (próximos 15 dias)" : "Casos em andamento"}</h2>
        <p>Reclamações, Reclame Aqui, Procon e processos. Só o Jurídico e a Gestão veem estes casos.</p></div></div>
      <div className="toolbar">
        <div className="search"><input placeholder="Buscar cliente, protocolo, nº do processo, órgão" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select value={cat} onChange={e => setCat(e.target.value)}><option value="">Todas as categorias</option>{Object.entries(JUR_CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      {!l.length ? <Vazio big="Nenhum caso aqui" /> : <div className="card" style={{ padding: 0 }}>{l.map((c: any) => { const j = jurDe(c); const venc = j.prazo && j.prazo < hoje && c.status !== "concluida"; const perto = j.prazo && !venc && j.prazo <= isoLocal(new Date(Date.now() + 3 * 864e5));
        return <JurLinha key={c.id} c={c} j={j} cor={venc ? "var(--critico)" : perto ? "var(--warn)" : "var(--line)"} />; })}</div>}
    </section>
  );
}
function JurLinha({ c, j, cor }: any) {
  const { abrirDetalhe } = useApp() as any;
  return (
    <div className="acao" style={{ borderLeftColor: cor, margin: 0, borderRadius: 0, borderBottom: "1px solid var(--line-soft)" }} onClick={() => abrirDetalhe(c.id)}>
      <span><b>{c.cliente}</b> · {JUR_CAT[j.categoria] || "Jurídico"}{j.protocolo ? " · protocolo " + j.protocolo : ""}{j.processo ? " · processo " + j.processo : ""}{j.orgao ? " · " + j.orgao : ""}
        <span className="pill" style={{ marginLeft: 6 }}>{JUR_SIT[j.situacao] || (c.status === "concluida" ? "Encerrado" : "Em andamento")}</span></span>
      <span className="g" style={{ color: cor === "var(--line)" ? undefined : cor, fontWeight: 700 }}>{j.prazo ? "prazo " + fmtDate(j.prazo) : "sem prazo"}</span>
    </div>
  );
}
function JurNovo() {
  const { executar, recarregar, abrirDetalhe, irPara } = useApp() as any;
  const V = { cliente: "", clienteDoc: "", telefone: "", pedido: "", categoria: "reclame_aqui", protocolo: "", processo: "", orgao: "", prazo: "", valor: "", parteContraria: "", link: "", motivo: "", resumo: "" };
  const [f, setF] = useState<any>(V);
  const s = (k: string) => (e: any) => setF((x: any) => ({ ...x, [k]: e.target.value }));
  const salvar = async () => {
    let id = "";
    if (await executar(async () => { id = await A.juridicoCriar({ ...f, categoriaNome: JUR_CAT[f.categoria] }); }, "Caso jurídico aberto")) { setF(V); await recarregar(); irPara("jur_andamento"); if (id) abrirDetalhe(id); }
  };
  return (
    <section className="view active">
      <div className="view-head"><div><h2>⚖ Novo caso jurídico</h2><p>Reclamação, Reclame Aqui, Procon ou processo. Fica visível só para o Jurídico e a Gestão.</p></div></div>
      <div className="card" style={{ padding: "18px 20px" }}><div className="grid">
        <div className="field"><label>Categoria</label><select value={f.categoria} onChange={s("categoria")}>{Object.entries(JUR_CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label>Cliente / reclamante <span className="req-star">*</span></label><input value={f.cliente} onChange={s("cliente")} /></div>
        <div className="field"><label>CPF/CNPJ</label><input value={f.clienteDoc} onChange={s("clienteDoc")} /></div>
        <div className="field"><label>Telefone</label><input value={f.telefone} onChange={s("telefone")} /></div>
        <div className="field"><label>Nº da venda</label><input value={f.pedido} onChange={s("pedido")} /></div>
        <div className="field"><label>Protocolo (Reclame Aqui / Procon)</label><input value={f.protocolo} onChange={s("protocolo")} /></div>
        <div className="field"><label>Nº do processo</label><input value={f.processo} onChange={s("processo")} /></div>
        <div className="field"><label>Órgão / vara / plataforma</label><input value={f.orgao} onChange={s("orgao")} placeholder="Ex.: Procon Curitiba, 2º JEC" /></div>
        <div className="field"><label>Prazo</label><input type="date" value={f.prazo} onChange={s("prazo")} /></div>
        <div className="field"><label>Valor envolvido</label><input value={f.valor} onChange={s("valor")} placeholder="R$" /></div>
        <div className="field"><label>Parte contrária / advogado</label><input value={f.parteContraria} onChange={s("parteContraria")} /></div>
        <div className="field"><label>Link (reclamação, processo)</label><input value={f.link} onChange={s("link")} /></div>
        <div className="field full"><label>Resumo do caso <span className="req-star">*</span></label><textarea value={f.motivo} onChange={s("motivo")} placeholder="O que o cliente reclama / do que se trata" /></div>
        <div className="field full"><label>🔒 Informações sensíveis <span className="hint">(só Jurídico e Gestão)</span></label><textarea value={f.resumo} onChange={s("resumo")} placeholder="Detalhes delicados, estratégia, acordos, histórico com o cliente" /></div>
      </div>
      <div style={{ marginTop: 14 }}><button className="btn primary" onClick={salvar}>Abrir caso</button></div></div>
    </section>
  );
}

/** bloco do caso jurídico na ficha (só Jurídico e Gestão chegam a ver) */
export function TratJuridico({ c }: any) {
  const { R, executar } = useApp() as any;
  const j = jurDe(c);
  const ini = () => ({ categoria: j.categoria || "", protocolo: j.protocolo || "", processo: j.processo || "", orgao: j.orgao || "", prazo: j.prazo || "", valor: j.valor || "", situacao: j.situacao || "andamento", parteContraria: j.parteContraria || "", link: j.link || "", resumo: j.resumo || "" });
  const [v, setV] = useState<any>(ini);
  const s = (k: string) => (e: any) => setV((x: any) => ({ ...x, [k]: e.target.value }));
  const pode = R.ehGestao() || R.ehJuridico();
  if (!pode) return null;
  return (
    <div className="resp-box"><h4>⚖ Caso jurídico</h4>
      <div className="grid">
        <div className="field"><label>Categoria</label><select value={v.categoria} onChange={s("categoria")}><option value="">—</option>{Object.entries(JUR_CAT).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></div>
        <div className="field"><label>Situação</label><select value={v.situacao} onChange={s("situacao")}>{Object.entries(JUR_SIT).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></div>
        <div className="field"><label>Protocolo</label><input value={v.protocolo} onChange={s("protocolo")} /></div>
        <div className="field"><label>Nº do processo</label><input value={v.processo} onChange={s("processo")} /></div>
        <div className="field"><label>Órgão / vara / plataforma</label><input value={v.orgao} onChange={s("orgao")} /></div>
        <div className="field"><label>Prazo</label><input type="date" value={v.prazo} onChange={s("prazo")} /></div>
        <div className="field"><label>Valor envolvido</label><input value={v.valor} onChange={s("valor")} /></div>
        <div className="field"><label>Parte contrária / advogado</label><input value={v.parteContraria} onChange={s("parteContraria")} /></div>
        <div className="field full"><label>Link</label><input value={v.link} onChange={s("link")} />{v.link && /^https?:/i.test(v.link) ? <a href={v.link} target="_blank" rel="noopener" style={{ fontSize: 12 }}>abrir link</a> : null}</div>
        <div className="field full"><label>🔒 Informações sensíveis</label><textarea value={v.resumo} onChange={s("resumo")} style={{ minHeight: 110 }} /></div>
      </div>
      <div style={{ marginTop: 10 }}><button className="btn primary sm" onClick={() => executar(() => A.juridicoSalvar(c.id, v), "Caso atualizado")}>Salvar caso</button></div>
      <div className="hint" style={{ marginTop: 6 }}>Para encerrar o caso use “✓ Finalizar atendimento” (fica em Encerrados).</div>
    </div>
  );
}
