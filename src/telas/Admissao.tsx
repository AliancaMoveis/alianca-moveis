// Página pública de admissão (sem login): o candidato recebe o link do RH, preenche os dados e anexa os documentos.
import { useEffect, useRef, useState } from "react";
import { admissaoEnviar, admissaoInfo, admissaoSubirDoc, fmtCpf } from "../lib/rh";

const CAMPOS_DOC: [string, string, string][] = [
  ["rg_cpf", "RG e CPF (frente e verso)", "foto ou PDF"],
  ["ctps", "Carteira de trabalho (CTPS física ou digital)", "foto ou PDF"],
  ["residencia", "Comprovante de residência", "recente, no seu nome ou dos pais/cônjuge"],
  ["certidao", "Certidão de nascimento ou casamento", ""],
  ["foto", "Foto de rosto (estilo 3×4)", ""],
  ["outro", "Outros (reservista, título de eleitor, diploma…)", "opcional"],
];

export default function Admissao() {
  const token = new URLSearchParams(location.search).get("t") || "";
  const [info, setInfo] = useState<any>(undefined);
  const [ok, setOk] = useState(false); const [enviando, setEnviando] = useState("");
  const [erro, setErro] = useState("");
  const [d, setD] = useState<any>({ nome: "", cpf: "", rg: "", nascimento: "", telefone: "", email: "", endereco: "", estado_civil: "", escolaridade: "", pis: "", ctps: "", banco: "", agencia: "", conta: "", pix: "", emergencia_nome: "", emergencia_tel: "", obs: "" });
  const [deps, setDeps] = useState<{ nome: string; nascimento: string }[]>([]);
  const [arqs, setArqs] = useState<Record<string, File[]>>({});
  useEffect(() => { document.title = "Admissão · Aliança Móveis"; if (!token) { setInfo(null); return; } admissaoInfo(token).then(setInfo).catch(() => setInfo(null)); }, []);

  if (info === undefined) return <Caixa><p style={{ textAlign: "center" }}>Carregando…</p></Caixa>;
  if (info === null) return <Caixa><h2>Link indisponível</h2><p>Este link de admissão não está mais disponível. Fale com o RH da Aliança Móveis.</p></Caixa>;
  if (ok) return <Caixa><h2>✅ Tudo certo, {(d.nome || info.nome).split(" ")[0]}!</h2><p>Seus dados e documentos foram enviados para o RH da Aliança Móveis. A Patrícia vai conferir tudo e te retorna. Obrigado!</p></Caixa>;

  const c = (k: string, rotulo: string, props: any = {}) => (
    <div className="field"><label>{rotulo}</label><input value={d[k]} onChange={e => setD({ ...d, [k]: k === "cpf" ? fmtCpf(e.target.value) : e.target.value })} {...props} /></div>
  );
  const enviar = async () => {
    setErro("");
    if (!d.nome.trim()) { setErro("Preencha seu nome completo."); return; }
    if (d.cpf.replace(/\D/g, "").length !== 11) { setErro("Confira o CPF (11 números)."); return; }
    if (!d.telefone.trim()) { setErro("Preencha seu telefone com DDD."); return; }
    if (!arqs.rg_cpf?.length) { setErro("Anexe a foto do seu RG e CPF."); return; }
    try {
      const docs: any[] = []; let n = 0; const total = Object.values(arqs).reduce((s, l) => s + l.length, 0);
      for (const [campo, lista] of Object.entries(arqs)) for (const f of lista) { n++; setEnviando("Enviando documento " + n + " de " + total + "…"); docs.push(await admissaoSubirDoc(token, campo, f)); }
      setEnviando("Enviando os dados…");
      await admissaoEnviar(token, { ...d, dependentes: deps.filter(x => x.nome.trim()) }, docs);
      setOk(true);
    } catch (e: any) { setErro(e.message || "Não foi possível enviar. Tente de novo."); }
    finally { setEnviando(""); }
  };
  return (
    <Caixa>
      <h2>Admissão · Aliança Móveis</h2>
      <p>Olá{info.nome ? <b>, {info.nome.split(" ")[0]}</b> : null}! Preencha seus dados e anexe os documentos — tudo vai direto para o RH, com segurança.</p>
      <h3>Seus dados</h3>
      <div className="grid2">
        {c("nome", "Nome completo *")}{c("cpf", "CPF *", { inputMode: "numeric", placeholder: "000.000.000-00" })}
        {c("rg", "RG")}{c("nascimento", "Data de nascimento", { type: "date" })}
        {c("telefone", "Telefone / WhatsApp (com DDD) *", { inputMode: "tel" })}{c("email", "E-mail", { type: "email" })}
      </div>
      {c("endereco", "Endereço completo (rua, nº, complemento, bairro, cidade, CEP)")}
      <div className="grid2">
        <div className="field"><label>Estado civil</label><select value={d.estado_civil} onChange={e => setD({ ...d, estado_civil: e.target.value })}><option value="">—</option>{["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)"].map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>Escolaridade</label><select value={d.escolaridade} onChange={e => setD({ ...d, escolaridade: e.target.value })}><option value="">—</option>{["Fundamental", "Médio incompleto", "Médio completo", "Superior incompleto", "Superior completo", "Pós-graduação"].map(x => <option key={x}>{x}</option>)}</select></div>
        {c("pis", "PIS / NIS")}{c("ctps", "Nº da CTPS")}
      </div>
      <h3>Dados bancários (para o pagamento)</h3>
      <div className="grid2">{c("banco", "Banco")}{c("pix", "Chave Pix")}{c("agencia", "Agência")}{c("conta", "Conta")}</div>
      <h3>Contato de emergência</h3>
      <div className="grid2">{c("emergencia_nome", "Nome")}{c("emergencia_tel", "Telefone")}</div>
      <h3>Dependentes (filhos)</h3>
      {deps.map((x, i) => <div className="grid2" key={i}>
        <div className="field"><label>Nome do dependente</label><input value={x.nome} onChange={e => setDeps(deps.map((y, j) => j === i ? { ...y, nome: e.target.value } : y))} /></div>
        <div className="field"><label>Nascimento</label><input type="date" value={x.nascimento} onChange={e => setDeps(deps.map((y, j) => j === i ? { ...y, nascimento: e.target.value } : y))} /></div>
      </div>)}
      <button className="btn sm" type="button" onClick={() => setDeps([...deps, { nome: "", nascimento: "" }])}>＋ Adicionar dependente</button>
      <h3>Documentos</h3>
      {CAMPOS_DOC.map(([k, rotulo, dica]) => <Anexo key={k} rotulo={rotulo + (k === "rg_cpf" ? " *" : "")} dica={dica} lista={arqs[k] || []} muda={l => setArqs({ ...arqs, [k]: l })} />)}
      {c("obs", "Alguma observação para o RH? (opcional)")}
      {erro && <p style={{ color: "#b32424", fontWeight: 700 }}>{erro}</p>}
      <button className="btn primary" style={{ width: "100%", padding: 14, fontSize: 16, marginTop: 10 }} disabled={!!enviando} onClick={enviar}>{enviando || "📨 Enviar para o RH"}</button>
      <p className="hint" style={{ marginTop: 10 }}>Seus dados e documentos são enviados com segurança e só o RH da Aliança Móveis tem acesso.</p>
    </Caixa>
  );
}

function Anexo({ rotulo, dica, lista, muda }: { rotulo: string; dica: string; lista: File[]; muda: (l: File[]) => void }) {
  const inp = useRef<HTMLInputElement>(null);
  return (
    <div className="card" style={{ padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px" }}><b>{rotulo}</b>{dica ? <div className="hint">{dica}</div> : null}</div>
        <input ref={inp} type="file" accept="image/*,.pdf" multiple style={{ display: "none" }} onChange={e => { if (e.target.files?.length) muda([...lista, ...Array.from(e.target.files)]); if (inp.current) inp.current.value = ""; }} />
        <button className="btn sm" type="button" onClick={() => inp.current?.click()}>📎 Anexar</button>
      </div>
      {lista.length > 0 && <div style={{ marginTop: 8 }}>{lista.map((f, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}><span>📄 {f.name}</span><button className="btn sm" type="button" onClick={() => muda(lista.filter((_x, j) => j !== i))}>✕</button></div>)}</div>}
    </div>
  );
}

function Caixa({ children }: { children: any }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f2f4f8", padding: "24px 12px" }}>
      <div className="card" style={{ maxWidth: 680, margin: "0 auto", padding: 20 }}>
        <style>{".grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:560px){.grid2{grid-template-columns:1fr}}h3{margin:18px 0 8px}"}</style>
        {children}
      </div>
    </div>
  );
}
