// Clientes → Base de clientes: busca por CPF/CNPJ, telefone ou nome; ficha com cadastro editável, resumo e histórico de vendas.
// Importação (só Gestão): planilha .xlsx do cruzamento Tático/Exact (abas "Base de Clientes" + "Vendas + CPF") ou .csv de clientes.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../estado";
import { Modal } from "../comp/Modal";
import { Kpi } from "./Dashboard";
import { BC, docValido, enderecoTxt, fmtDoc, fmtTel, lerArquivoBase, soDig } from "../lib/baseClientes";

const brl = (n: any) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (v: any) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

export default function BaseClientes() {
  const { R, setModal } = useApp() as any;
  const [q, setQ] = useState(""); const [lst, setLst] = useState<any[] | null>(null); const [busy, setBusy] = useState(false);
  const t = useRef<any>();
  useEffect(() => {
    clearTimeout(t.current);
    if (q.trim().length < 3) { setLst(null); return; }
    t.current = setTimeout(async () => { setBusy(true); try { setLst(await BC.buscar(q.trim())); } catch (e: any) { setLst([]); } finally { setBusy(false); } }, 350);
  }, [q]);
  const abrir = (id: string) => setModal(<FichaCliente id={id} onSalvo={() => setQ(x => x + " ")} />);
  return (
    <section className="view active">
      <div className="view-head"><div><h2>📇 Base de clientes</h2><p>Cadastro único por CPF/CNPJ (Tático + Exact) com o histórico de compras. Busque por CPF/CNPJ, telefone ou nome.</p></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setModal(<FichaCliente id={null} onSalvo={() => {}} />)}>+ Novo cliente</button>
          {R.ehGestao() && <button className="btn primary" onClick={() => setModal(<Importar />)}>⬆ Importar base</button>}
        </div></div>
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="CPF/CNPJ, telefone (com DDD) ou nome do cliente" style={{ fontSize: 16 }} />
        <div className="hint" style={{ marginTop: 6 }}>{busy ? "Buscando…" : q.trim().length < 3 ? "Digite pelo menos 3 caracteres." : lst ? lst.length + (lst.length >= 60 ? "+ " : " ") + "cliente(s)" : ""}</div>
      </div>
      {lst && (lst.length ? <div className="card" style={{ padding: 0, overflowX: "auto" }}><table className="dl-tab" style={{ width: "100%" }}>
        <thead><tr><th>Cliente</th><th>CPF/CNPJ</th><th>Telefone</th><th>Bairro / cidade</th><th>Compras</th><th>Última</th></tr></thead>
        <tbody>{lst.map(c => <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => abrir(c.id)}>
          <td><b>{c.nome}</b></td><td>{fmtDoc(c.cpf_cnpj)}</td><td>{fmtTel(c.telefone1)}{c.telefone2 ? <><br /><span className="hint">{fmtTel(c.telefone2)}</span></> : null}</td>
          <td>{[c.bairro, c.cidade].filter(Boolean).join(" · ")}</td><td>{c.compras}</td><td>{dt(c.ultima)}</td></tr>)}</tbody></table></div>
        : <div className="card" style={{ padding: 16 }}>Nenhum cliente encontrado. <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => setModal(<FichaCliente id={null} doc={soDig(q).length >= 11 ? soDig(q) : ""} onSalvo={() => {}} />)}>+ Cadastrar</button></div>)}
    </section>
  );
}

const CAMPOS: [string, string, string?][] = [["nome", "Nome", "full"], ["cpf_cnpj", "CPF / CNPJ"], ["telefone1", "Telefone 1"], ["telefone2", "Telefone 2"], ["logradouro", "Rua / logradouro", "full"],
  ["numero", "Número"], ["complemento", "Complemento"], ["bairro", "Bairro"], ["cidade", "Cidade"], ["uf", "UF"], ["observacao", "Observação", "full"]];

export function FichaCliente({ id, doc, onSalvo }: { id: string | null; doc?: string; onSalvo: () => void }) {
  const { setModal, toast } = useApp() as any;
  const [d, setD] = useState<{ cliente: any; vendas: any[] } | null>(id ? null : { cliente: { cpf_cnpj: doc || "" }, vendas: [] });
  const [f, setF] = useState<any>({ cpf_cnpj: doc || "" }); const [edit, setEdit] = useState(!id); const [salv, setSalv] = useState(false);
  useEffect(() => { if (id) BC.ficha(id).then(x => { setD(x); setF({ ...x.cliente, telefone1: fmtTel(x.cliente?.telefone1), telefone2: fmtTel(x.cliente?.telefone2), cpf_cnpj: fmtDoc(x.cliente?.cpf_cnpj) }); }).catch(e => toast(e.message)); }, [id]);
  const fechar = () => setModal(null);
  async function salvar() {
    if (!docValido(f.cpf_cnpj)) { toast("CPF/CNPJ inválido"); return; }
    if (!String(f.nome || "").trim()) { toast("Informe o nome"); return; }
    setSalv(true);
    try { await BC.salvar({ ...f, id: id || undefined }); toast("Cliente salvo"); onSalvo(); fechar(); } catch (e: any) { toast(e.message); } finally { setSalv(false); }
  }
  if (!d) return <Modal titulo="Cliente" onFechar={fechar}><div className="hint">Carregando…</div></Modal>;
  const c = d.cliente || {}, vs = d.vendas;
  const total = vs.reduce((s, v) => s + Number(v.valor_total || 0), 0), receb = vs.reduce((s, v) => s + Number(v.valor_recebido || 0), 0);
  const ult = vs[0];
  return (
    <Modal titulo={id ? c.nome : "Novo cliente"} onFechar={fechar}>
      {id && <div className="kpis" style={{ marginBottom: 12 }}>
        <Kpi n={vs.length} l="Compras" />
        <Kpi n={brl(total)} l="Total comprado" fs={17} />
        <Kpi n={brl(receb)} l="Recebido" fs={17} />
        <Kpi n={ult ? ult.vendedor || "—" : "—"} l={"Último vendedor" + (ult ? " · " + dt(ult.data_venda) : "")} fs={16} />
      </div>}
      {edit ? <>
        <div className="grid">{CAMPOS.map(([k, l, cls]) => <div key={k} className={"field" + (cls ? " " + cls : "")}><label>{l}{k === "nome" || k === "cpf_cnpj" ? <span className="req-star"> *</span> : null}</label>
          <input value={f[k] || ""} onChange={e => setF((x: any) => ({ ...x, [k]: e.target.value }))} /></div>)}</div>
        {id && <div className="hint" style={{ marginTop: 8 }}>O que você corrigir aqui fica marcado e as próximas importações do Tático não passam por cima.</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn primary" disabled={salv} onClick={salvar}>{salv ? "Salvando…" : "Salvar"}</button>
          <button className="btn ghost" onClick={() => id ? setEdit(false) : fechar()}>Cancelar</button>
        </div>
      </> : <>
        <div className="card" style={{ padding: "10px 14px", marginBottom: 12, fontSize: 14, lineHeight: 1.7 }}>
          <div><b>CPF/CNPJ:</b> {fmtDoc(c.cpf_cnpj)}{c.cod_tatico ? <span className="hint"> · cód. Tático {c.cod_tatico}</span> : null}</div>
          <div><b>Telefones:</b> {[c.telefone1, c.telefone2].filter(Boolean).map(fmtTel).join(" · ") || "—"}</div>
          <div><b>Endereço:</b> {enderecoTxt(c) || "—"}</div>
          {c.observacao ? <div><b>Obs.:</b> {c.observacao}</div> : null}
          {(c.editado_manual || []).length ? <div className="hint">Corrigido à mão: {(c.editado_manual || []).join(", ")}{c.atualizado_por ? " · por " + c.atualizado_por : ""}</div> : null}
          <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setEdit(true)}>✏️ Editar cadastro</button>
        </div>
        <div className="sec-label">Histórico de compras</div>
        {vs.length ? <div style={{ overflowX: "auto" }}><table className="dl-tab" style={{ width: "100%" }}><thead><tr><th>Data</th><th>Venda</th><th>Situação</th><th>Vendedor</th><th>Valor</th><th>Recebido</th></tr></thead>
          <tbody>{vs.map(v => <tr key={v.id}><td>{dt(v.data_venda)}</td><td><b>{v.num_venda}</b></td><td>{v.situacao}</td><td>{v.vendedor}</td><td>{brl(v.valor_total)}</td><td>{brl(v.valor_recebido)}</td></tr>)}</tbody></table></div>
          : <div className="hint">Nenhuma venda registrada para este cliente.</div>}
      </>}
    </Modal>
  );
}

function Importar() {
  const { setModal, toast } = useApp() as any;
  const [arq, setArq] = useState<File | null>(null); const [dados, setDados] = useState<{ clientes: any[]; vendas: any[] } | null>(null);
  const [prog, setProg] = useState(""); const [res, setRes] = useState<any>(null); const [rodando, setRodando] = useState(false);
  async function ler(f: File | null) {
    setArq(f); setDados(null); setRes(null); if (!f) return;
    setProg("Lendo a planilha…");
    try { setDados(await lerArquivoBase(f)); setProg(""); } catch (e: any) { setProg(""); toast(e.message); }
  }
  async function importar() {
    if (!dados) return; setRodando(true);
    const tot: any = { clientesNovos: 0, clientesAtualizados: 0, invalidos: 0, vendas: 0, vendasNovas: 0, vendasSemCliente: 0 };
    const soma = (r: any) => Object.keys(tot).forEach(k => tot[k] += Number(r?.[k] || 0));
    try {
      const L = 800;
      for (let i = 0; i < dados.clientes.length; i += L) { setProg(`Clientes ${Math.min(i + L, dados.clientes.length)} de ${dados.clientes.length}…`); soma(await BC.importar(dados.clientes.slice(i, i + L), [])); }
      for (let i = 0; i < dados.vendas.length; i += L) { setProg(`Vendas ${Math.min(i + L, dados.vendas.length)} de ${dados.vendas.length}…`); soma(await BC.importar([], dados.vendas.slice(i, i + L))); }
      setRes(tot); setProg(""); toast("Base importada");
    } catch (e: any) { setProg(""); setRes(tot); toast("Parou no meio: " + e.message + " — pode importar de novo, nada se duplica"); }
    finally { setRodando(false); }
  }
  return (
    <Modal titulo="Importar base de clientes" onFechar={() => setModal(null)}>
      <p style={{ marginTop: 0 }}>Envie a planilha <b>.xlsx</b> do cruzamento Tático/Exact (abas <b>“Base de Clientes”</b> e <b>“Vendas + CPF”</b>) ou um <b>.csv</b> só de clientes.</p>
      <ul className="hint" style={{ marginTop: 0 }}>
        <li>Clientes novos entram; os que já existem são atualizados.</li>
        <li>Telefone e endereço corrigidos à mão no 360 <b>não</b> são substituídos, e campo vazio na planilha não apaga o que já existe.</li>
        <li>Vendas entram pelo nº da venda (sem duplicar); se a venda já existe, atualiza situação e valores.</li>
      </ul>
      <input type="file" accept=".xlsx,.csv" disabled={rodando} onChange={e => ler(e.target.files?.[0] || null)} />
      {dados && !res && <div className="card" style={{ padding: "10px 14px", marginTop: 12 }}>
        <b>{arq?.name}</b>: {dados.clientes.length.toLocaleString("pt-BR")} clientes · {dados.vendas.length.toLocaleString("pt-BR")} vendas
        <div style={{ marginTop: 10 }}><button className="btn primary" disabled={rodando} onClick={importar}>{rodando ? "Importando…" : "Importar"}</button></div></div>}
      {prog && <div className="hint" style={{ marginTop: 10, fontWeight: 600 }}>{prog}</div>}
      {res && <div className="card" style={{ padding: "10px 14px", marginTop: 12, lineHeight: 1.7 }}>
        <div>✅ Clientes novos: <b>{res.clientesNovos}</b> · atualizados: <b>{res.clientesAtualizados}</b>{res.invalidos ? <> · ignorados (sem CPF/nome): <b>{res.invalidos}</b></> : null}</div>
        <div>🧾 Vendas: <b>{res.vendas}</b> ({res.vendasNovas} novas){res.vendasSemCliente ? <> · sem cliente na base: <b>{res.vendasSemCliente}</b></> : null}</div>
      </div>}
    </Modal>
  );
}
