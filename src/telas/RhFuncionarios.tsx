// RH · Funcionários — cadastro completo, documentos anexados e admissão por link. Só Bruno e Patrícia.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../estado";
import { podeRh } from "../lib/ponto";
import { abrirDoc, apagarDoc, apagarFuncionario, aprovarEnvio, criarLink, fmtCpf, listarDocs, listarFuncionarios, listarLinks, mudarLink, salvarFuncionario, subirDoc, urlAdmissao, STATUS_FUNC, TIPOS_DOC, EMPRESAS, nomeEmpresa, type Doc, type Envio, type Funcionario, type Link } from "../lib/rh";

const br = (s?: string | null) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—");
const stCor: Record<string, string> = { ativo: "#1F6B3E", ferias: "#1F3864", afastado: "#7A4F00", desligado: "#8A1C1C" };

export default function RhFuncionarios({ abaInicial = "func" }: { abaInicial?: string }) {
  const { R, toast } = useApp() as any;
  const [aba, setAba] = useState(abaInicial);
  const [lista, setLista] = useState<Funcionario[] | null>(null);
  const [erro, setErro] = useState(""); const [busca, setBusca] = useState(""); const [fSt, setFSt] = useState("ativos"); const [fEmp, setFEmp] = useState("");
  const [aberto, setAberto] = useState<string | "novo" | "">("");
  const rec = () => listarFuncionarios().then(setLista).catch(e => setErro(e.message));
  useEffect(() => { rec(); }, []);
  if (!podeRh(R.currentUserId)) return <section className="view active"><div className="empty">Só o Bruno e a Patrícia (RH) veem esta tela.</div></section>;

  const l = (lista || []).filter(f => (fSt === "todos" || (fSt === "ativos" ? f.status !== "desligado" : f.status === fSt)))
    .filter(f => !fEmp || f.empresa === fEmp)
    .filter(f => !busca.trim() || (f.nome + " " + f.cpf + " " + f.cargo + " " + f.setor + " " + f.folha + " " + f.pis + " " + nomeEmpresa(f.empresa)).toLowerCase().includes(busca.toLowerCase()));
  return (
    <section className="view active">
      <div className="view-head"><div><h2>👥 RH · Funcionários</h2><p>Cadastro, documentos anexados e admissão por link — só você e a Patrícia têm acesso.</p></div></div>
      <div className="subnav" style={{ margin: "0 0 14px" }}>
        <button className={aba === "func" ? "on" : ""} onClick={() => setAba("func")}>👥 Funcionários</button>
        <button className={aba === "adm" ? "on" : ""} onClick={() => setAba("adm")}>✉ Admissão por link</button>
      </div>
      {aba === "adm" ? <Admissoes rec={rec} /> : <>
        <div className="card ma-topo">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <div className="field" style={{ flex: "1 1 220px" }}><label>Buscar</label><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, CPF, nº folha, PIS, função, departamento…" /></div>
            <div className="field"><label>Empresa</label><select value={fEmp} onChange={e => setFEmp(e.target.value)}><option value="">Todas</option>{EMPRESAS.map(([k, n]) => <option key={k} value={k}>{n} ({(lista || []).filter(f => f.empresa === k && f.status !== "desligado").length})</option>)}</select></div>
            <div className="field"><label>Situação</label><select value={fSt} onChange={e => setFSt(e.target.value)}><option value="ativos">Todos menos desligados</option>{STATUS_FUNC.map(([k, n]) => <option key={k} value={k}>{n}</option>)}<option value="todos">Todos</option></select></div>
            <button className="btn primary" onClick={() => setAberto("novo")}>＋ Novo funcionário</button>
          </div>
        </div>
        {erro ? <div className="empty">{erro}</div> : !lista ? <div className="empty">Carregando…</div> : !l.length ? <div className="empty" style={{ padding: 24 }}>Nenhum funcionário. Cadastre pelo botão acima ou mande o link de admissão.</div> :
          <div className="card" style={{ padding: 0, marginTop: 14, overflowX: "auto" }}>
            <div className="hint" style={{ padding: "8px 12px" }}>{l.length} funcionário{l.length === 1 ? "" : "s"}</div>
            <table className="ma-tab" style={{ minWidth: 900 }}>
              <thead><tr><th>Nº folha</th><th>Funcionário</th><th>Função · departamento</th><th>Empresa</th><th>CPF</th><th>PIS</th><th>Horário</th><th>Admissão</th><th>Situação</th></tr></thead>
              <tbody>{l.map(f => <tr key={f.id} className="ma-lin" onClick={() => setAberto(f.id)}>
                <td>{f.folha || "—"}</td><td><b>{f.nome}</b>{f.origem === "link" ? <span className="pill" style={{ marginLeft: 6 }}>pelo link</span> : null}</td>
                <td>{[f.cargo, f.setor].filter(Boolean).join(" · ") || "—"}</td><td>{nomeEmpresa(f.empresa)}</td><td>{f.cpf || "—"}</td><td>{f.pis || "—"}</td><td style={{ fontSize: 12.5 }}>{f.horario || "—"}</td><td>{br(f.admissao)}</td>
                <td><b style={{ color: stCor[f.status] || "#333" }}>{(STATUS_FUNC.find(x => x[0] === f.status) || ["", f.status])[1]}</b></td>
              </tr>)}</tbody>
            </table>
          </div>}
        {aberto && <Ficha id={aberto === "novo" ? null : aberto} dados={aberto === "novo" ? null : (lista || []).find(f => f.id === aberto) || null} fechar={() => setAberto("")} rec={rec} uid={R.currentUserId} toast={toast} />}
      </>}
    </section>
  );
}

function Ficha({ id, dados, fechar, rec, uid, toast }: { id: string | null; dados: Funcionario | null; fechar: () => void; rec: () => any; uid: string; toast: (m: string) => void }) {
  const [f, setF] = useState<any>(dados || { nome: "", cpf: "", rg: "", nascimento: null, telefone: "", email: "", endereco: "", estado_civil: "", escolaridade: "", pis: "", ctps: "", cargo: "", setor: "", admissao: null, empresa: "", folha: "", identificador: "", horario: "", salario: null, recebe_vt: false, vt_dia: 0, va_dia: 0, banco: "", agencia: "", conta: "", pix: "", emergencia_nome: "", emergencia_tel: "", dependentes: [], status: "ativo", desligamento: null, obs: "" });
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const recDocs = () => { if (id) listarDocs(id).then(setDocs).catch(() => setDocs([])); };
  useEffect(() => { recDocs(); }, [id]);
  const c = (k: string, rotulo: string, props: any = {}) => (
    <div className="field"><label>{rotulo}</label><input value={f[k] ?? ""} onChange={e => setF({ ...f, [k]: k === "cpf" ? fmtCpf(e.target.value) : (props.type === "date" ? (e.target.value || null) : e.target.value) })} {...props} /></div>
  );
  const salvar = async () => {
    if (!f.nome.trim()) { toast("Preencha o nome"); return; }
    setSalvando(true);
    try {
      const p = { ...f, salario: f.salario === "" || f.salario == null ? null : Number(String(f.salario).replace(/\./g, "").replace(",", ".")), vt_dia: Number(String(f.vt_dia || 0).replace(",", ".")), va_dia: Number(String(f.va_dia || 0).replace(",", ".")) };
      delete p.id; delete p.criado_em; delete (p as any).criado_por; delete (p as any).atualizado_em; delete (p as any).origem;
      await salvarFuncionario(id, p, uid); await rec(); toast(id ? "Funcionário atualizado" : "Funcionário cadastrado"); if (!id) fechar();
    } catch (e: any) { toast(e.message); } finally { setSalvando(false); }
  };
  const excluir = async () => { if (!id) return; if (!confirm("Excluir " + f.nome + " e TODOS os documentos anexados? (para quem saiu da empresa, prefira a situação Desligado)")) return; try { await apagarFuncionario(id); await rec(); fechar(); toast("Excluído"); } catch (e: any) { toast(e.message); } };
  return (
    <div className="card" style={{ marginTop: 14, padding: 16 }}>
      <style>{".grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}@media(max-width:760px){.grid3{grid-template-columns:1fr}}"}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0 }}>{id ? "✏️ " + f.nome : "＋ Novo funcionário"}</h3>
        <span style={{ display: "flex", gap: 8 }}>{id && <button className="btn sm" onClick={excluir}>🗑 Excluir</button>}<button className="btn sm" onClick={fechar}>Fechar</button><button className="btn primary sm" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "💾 Salvar"}</button></span>
      </div>
      <h4 style={{ margin: "14px 0 6px" }}>Dados pessoais</h4>
      <div className="grid3">{c("nome", "Nome completo *")}{c("cpf", "CPF", { inputMode: "numeric" })}{c("rg", "RG")}{c("nascimento", "Nascimento", { type: "date" })}{c("telefone", "Telefone / WhatsApp")}{c("email", "E-mail")}</div>
      {c("endereco", "Endereço completo")}
      <div className="grid3">
        <div className="field"><label>Estado civil</label><select value={f.estado_civil} onChange={e => setF({ ...f, estado_civil: e.target.value })}><option value="">—</option>{["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)"].map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>Escolaridade</label><select value={f.escolaridade} onChange={e => setF({ ...f, escolaridade: e.target.value })}><option value="">—</option>{["Fundamental", "Médio incompleto", "Médio completo", "Superior incompleto", "Superior completo", "Pós-graduação"].map(x => <option key={x}>{x}</option>)}</select></div>
        {c("pis", "PIS / NIS")}{c("ctps", "Nº da CTPS")}{c("emergencia_nome", "Emergência · nome")}{c("emergencia_tel", "Emergência · telefone")}
      </div>
      <h4 style={{ margin: "14px 0 6px" }}>Contrato</h4>
      <div className="grid3">
        <div className="field"><label>Empresa (contratado por)</label><select value={f.empresa || ""} onChange={e => setF({ ...f, empresa: e.target.value })}><option value="">—</option>{EMPRESAS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
        {c("folha", "Nº da folha")}{c("identificador", "Nº identificador (ponto)")}
        {c("cargo", "Cargo / função")}{c("setor", "Setor / departamento")}{c("admissao", "Admissão", { type: "date" })}
        {c("horario", "Horário")}
        {c("salario", "Salário (R$) — opcional", { inputMode: "decimal", placeholder: "só você e a Patrícia veem" })}
        {c("va_dia", "Vale-refeição/alimentação por dia (R$)", { inputMode: "decimal" })}
        <div className="field"><label>Vale-transporte</label><div style={{ display: "flex", gap: 8, alignItems: "center" }}><label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!f.recebe_vt} onChange={e => setF({ ...f, recebe_vt: e.target.checked })} /> recebe</label><input style={{ width: 110 }} value={f.vt_dia ?? 0} onChange={e => setF({ ...f, vt_dia: e.target.value })} inputMode="decimal" placeholder="R$ por dia" /></div></div>
        <div className="field"><label>Situação</label><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>{STATUS_FUNC.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
        {f.status === "desligado" ? c("desligamento", "Data do desligamento", { type: "date" }) : null}
      </div>
      <h4 style={{ margin: "14px 0 6px" }}>Pagamento</h4>
      <div className="grid3">{c("banco", "Banco")}{c("agencia", "Agência")}{c("conta", "Conta")}{c("pix", "Chave Pix")}</div>
      <h4 style={{ margin: "14px 0 6px" }}>Dependentes</h4>
      {(f.dependentes || []).map((x: any, i: number) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <input style={{ flex: "1 1 200px" }} value={x.nome} placeholder="Nome" onChange={e => setF({ ...f, dependentes: f.dependentes.map((y: any, j: number) => j === i ? { ...y, nome: e.target.value } : y) })} />
        <input type="date" value={x.nascimento || ""} onChange={e => setF({ ...f, dependentes: f.dependentes.map((y: any, j: number) => j === i ? { ...y, nascimento: e.target.value } : y) })} />
        <button className="btn sm" onClick={() => setF({ ...f, dependentes: f.dependentes.filter((_y: any, j: number) => j !== i) })}>✕</button>
      </div>)}
      <button className="btn sm" onClick={() => setF({ ...f, dependentes: [...(f.dependentes || []), { nome: "", nascimento: "" }] })}>＋ Dependente</button>
      {c("obs", "Observações")}
      {id ? <Documentos id={id} docs={docs} recDocs={recDocs} uid={uid} toast={toast} /> : <p className="hint" style={{ marginTop: 12 }}>Salve o cadastro para poder anexar os documentos.</p>}
    </div>
  );
}

function Documentos({ id, docs, recDocs, uid, toast }: { id: string; docs: Doc[] | null; recDocs: () => void; uid: string; toast: (m: string) => void }) {
  const inp = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState("rg_cpf"); const [dataRef, setDataRef] = useState(""); const [subindo, setSubindo] = useState(false);
  const nomeTipo = (t: string) => (TIPOS_DOC.find(x => x[0] === t) || ["", t])[1];
  const subir = async (fs: FileList) => {
    setSubindo(true);
    try { for (const f of Array.from(fs)) await subirDoc(id, tipo, "", tipo === "atestado" && dataRef ? dataRef : null, f, uid); }
    catch (e: any) { toast(e.message); } finally { setSubindo(false); recDocs(); }
  };
  return (
    <>
      <h4 style={{ margin: "16px 0 6px" }}>📎 Documentos anexados</h4>
      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", marginBottom: 8 }}>
        <div className="field"><label>Tipo</label><select value={tipo} onChange={e => setTipo(e.target.value)}>{TIPOS_DOC.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
        {tipo === "atestado" && <div className="field"><label>Data do atestado</label><input type="date" value={dataRef} onChange={e => setDataRef(e.target.value)} /></div>}
        <input ref={inp} type="file" accept="image/*,.pdf" multiple style={{ display: "none" }} onChange={e => { if (e.target.files?.length) subir(e.target.files); if (inp.current) inp.current.value = ""; }} />
        <button className="btn" disabled={subindo} onClick={() => inp.current?.click()}>{subindo ? "Enviando…" : "📤 Anexar arquivo(s)"}</button>
      </div>
      {!docs ? <p className="hint">Carregando…</p> : !docs.length ? <p className="hint">Nenhum documento ainda.</p> :
        <table className="ma-tab"><thead><tr><th>Tipo</th><th>Arquivo</th><th>Data</th><th>Enviado em</th><th></th></tr></thead>
          <tbody>{docs.map(d => <tr key={d.id}>
            <td><b>{nomeTipo(d.tipo)}</b></td><td>{d.titulo}</td><td>{d.data_ref ? br(d.data_ref) : "—"}</td><td>{new Date(d.criado_em).toLocaleDateString("pt-BR")}</td>
            <td style={{ whiteSpace: "nowrap" }}><button className="btn sm" onClick={() => abrirDoc(d.arquivo).catch((e: any) => toast(e.message))}>👁 Abrir</button> <button className="btn sm" onClick={async () => { if (!confirm("Apagar este documento?")) return; try { await apagarDoc(d); recDocs(); } catch (e: any) { toast(e.message); } }}>🗑</button></td>
          </tr>)}</tbody></table>}
    </>
  );
}

function Admissoes({ rec }: { rec: () => any }) {
  const { R, toast } = useApp() as any;
  const [d, setD] = useState<{ links: Link[]; envios: Envio[] } | null>(null);
  const [nome, setNome] = useState(""); const [cargo, setCargo] = useState(""); const [setor, setSetor] = useState("");
  const [rev, setRev] = useState<Envio | null>(null);
  const recL = () => listarLinks().then(setD).catch(e => toast(e.message));
  useEffect(() => { recL(); }, []);
  const copiar = (t: string) => { navigator.clipboard?.writeText(urlAdmissao(t)).then(() => toast("Link copiado — é só mandar no WhatsApp da pessoa")); };
  const gerar = async () => {
    if (!nome.trim()) { toast("Coloque o nome da pessoa que vai ser contratada"); return; }
    try { const l = await criarLink(nome.trim(), cargo.trim(), setor.trim(), R.currentUserId); setNome(""); setCargo(""); setSetor(""); await recL(); copiar(l.token); } catch (e: any) { toast(e.message); }
  };
  const stL: Record<string, [string, string]> = { aberto: ["Aguardando preencher", "#7A4F00"], preenchido: ["✅ Preenchido — revisar", "#1F6B3E"], aprovado: ["Aprovado e cadastrado", "#1F3864"], cancelado: ["Cancelado", "#8A1C1C"] };
  return (
    <>
      <div className="card" style={{ padding: 14 }}>
        <b>Gerar link de admissão</b>
        <p className="hint" style={{ margin: "4px 0 10px" }}>A pessoa abre o link no celular, preenche os dados e anexa os documentos — tudo chega aqui para a revisão. O link vale 14 dias.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <div className="field" style={{ flex: "1 1 200px" }}><label>Nome da pessoa</label><input value={nome} onChange={e => setNome(e.target.value)} /></div>
          <div className="field"><label>Cargo previsto</label><input value={cargo} onChange={e => setCargo(e.target.value)} /></div>
          <div className="field"><label>Setor previsto</label><input value={setor} onChange={e => setSetor(e.target.value)} /></div>
          <button className="btn primary" onClick={gerar}>🔗 Gerar e copiar o link</button>
        </div>
      </div>
      {!d ? <div className="empty">Carregando…</div> : !d.links.length ? <div className="empty" style={{ padding: 24 }}>Nenhum link gerado ainda.</div> :
        <div className="card" style={{ padding: 0, marginTop: 14, overflowX: "auto" }}>
          <table className="ma-tab" style={{ minWidth: 700 }}>
            <thead><tr><th>Pessoa</th><th>Cargo · setor</th><th>Criado em</th><th>Situação</th><th></th></tr></thead>
            <tbody>{d.links.map(l => {
              const envio = d.envios.find(e => e.token === l.token && !e.revisado_em);
              const [sn, sc] = stL[l.status] || [l.status, "#333"];
              return <tr key={l.token}>
                <td><b>{l.nome || "—"}</b></td><td>{[l.cargo, l.setor].filter(Boolean).join(" · ") || "—"}</td>
                <td>{new Date(l.criado_em).toLocaleDateString("pt-BR")}</td>
                <td><b style={{ color: sc }}>{sn}</b></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {l.status === "aberto" && <><button className="btn sm" onClick={() => copiar(l.token)}>📋 Copiar link</button> <button className="btn sm" onClick={async () => { await mudarLink(l.token, { status: "cancelado" }); recL(); }}>✕ Cancelar</button></>}
                  {l.status === "preenchido" && envio && <button className="btn primary sm" onClick={() => setRev(envio)}>👁 Revisar e aprovar</button>}
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      {rev && <Revisao envio={rev} link={d?.links.find(l => l.token === rev.token)} fechar={() => setRev(null)} depois={() => { setRev(null); recL(); rec(); }} uid={R.currentUserId} toast={toast} />}
    </>
  );
}

function Revisao({ envio, link, fechar, depois, uid, toast }: { envio: Envio; link?: Link; fechar: () => void; depois: () => void; uid: string; toast: (m: string) => void }) {
  const d = envio.dados || {};
  const [cargo, setCargo] = useState(link?.cargo || ""); const [setor, setSetor] = useState(link?.setor || ""); const [admissao, setAdmissao] = useState(""); const [empresa, setEmpresa] = useState("");
  const [ok, setOk] = useState(false);
  const campo = (r: string, v: any) => v ? <div><span className="hint">{r}:</span> <b>{String(v)}</b></div> : null;
  const aprovar = async () => {
    setOk(true);
    try { await aprovarEnvio(envio, link, { cargo, setor, admissao: admissao || null, empresa }, uid); toast("Funcionário cadastrado a partir do envio ✅"); depois(); }
    catch (e: any) { toast(e.message); setOk(false); }
  };
  return (
    <div className="card" style={{ marginTop: 14, padding: 16, borderLeft: "4px solid var(--st-concluida)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Revisão · {d.nome || link?.nome}</h3>
        <span style={{ display: "flex", gap: 8 }}><button className="btn sm" onClick={fechar}>Fechar</button><button className="btn primary sm" disabled={ok} onClick={aprovar}>✅ Aprovar e cadastrar</button></span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "4px 16px", margin: "12px 0" }}>
        {campo("CPF", d.cpf)}{campo("RG", d.rg)}{campo("Nascimento", d.nascimento && br(d.nascimento))}{campo("Telefone", d.telefone)}{campo("E-mail", d.email)}{campo("Endereço", d.endereco)}
        {campo("Estado civil", d.estado_civil)}{campo("Escolaridade", d.escolaridade)}{campo("PIS", d.pis)}{campo("CTPS", d.ctps)}
        {campo("Banco", d.banco)}{campo("Agência", d.agencia)}{campo("Conta", d.conta)}{campo("Pix", d.pix)}
        {campo("Emergência", [d.emergencia_nome, d.emergencia_tel].filter(Boolean).join(" · "))}
        {campo("Dependentes", (d.dependentes || []).map((x: any) => x.nome + (x.nascimento ? " (" + br(x.nascimento) + ")" : "")).join(", "))}
        {campo("Observação", d.obs)}
      </div>
      <b>Documentos enviados ({(envio.docs || []).length}):</b>
      <div style={{ margin: "6px 0 12px" }}>{(envio.docs || []).map((x, i) => <button key={i} className="btn sm" style={{ margin: "0 6px 6px 0" }} onClick={() => abrirDoc(x.caminho).catch((e: any) => toast(e.message))}>📄 {x.nome}</button>)}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <div className="field"><label>Cargo</label><input value={cargo} onChange={e => setCargo(e.target.value)} /></div>
        <div className="field"><label>Setor</label><input value={setor} onChange={e => setSetor(e.target.value)} /></div>
        <div className="field"><label>Data de admissão</label><input type="date" value={admissao} onChange={e => setAdmissao(e.target.value)} /></div>
        <div className="field"><label>Empresa</label><select value={empresa} onChange={e => setEmpresa(e.target.value)}><option value="">—</option>{EMPRESAS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
      </div>
      <p className="hint">Ao aprovar, o funcionário entra no cadastro com todos os dados e documentos do envio.</p>
    </div>
  );
}
