// Página pública de admissão (sem login): o candidato recebe o link do RH, preenche os dados e anexa os documentos.
import { useEffect, useRef, useState } from "react";
import { admissaoEnviar, admissaoInfo, admissaoSubirDoc } from "../lib/rh";
import { CamposFicha, abrirFicha } from "../lib/rhFicha";



export default function Admissao() {
  const token = new URLSearchParams(location.search).get("t") || "";
  const [info, setInfo] = useState<any>(undefined);
  const [ok, setOk] = useState(false); const [enviando, setEnviando] = useState("");
  const [erro, setErro] = useState("");
  const [d, setD] = useState<any>(abrirFicha({ nome: "", cpf: "", rg: "", nascimento: "", telefone: "", email: "", endereco: "", estado_civil: "", escolaridade: "", pis: "", ctps: "", banco: "", agencia: "", conta: "", emergencia_nome: "", emergencia_tel: "", obs: "" }));
  const [arqs, setArqs] = useState<Record<string, File[]>>({});
  useEffect(() => { document.title = "Admissão · Aliança Móveis"; if (!token) { setInfo(null); return; } admissaoInfo(token).then(setInfo).catch(() => setInfo(null)); }, []);

  if (info === undefined) return <Caixa><p style={{ textAlign: "center" }}>Carregando…</p></Caixa>;
  if (info === null) return <Caixa><h2>Link indisponível</h2><p>Este link de admissão não está mais disponível. Fale com o RH da Aliança Móveis.</p></Caixa>;
  if (ok) return <Caixa><h2>✅ Tudo certo, {(d.nome || info.nome).split(" ")[0]}!</h2><p>Seus dados e documentos foram enviados para o RH da Aliança Móveis. A Patrícia vai conferir tudo e te retorna. Obrigado!</p></Caixa>;

  const c = (k: string, rotulo: string) => <div className="field"><label>{rotulo}</label><input value={d[k] || ""} onChange={e => setD({ ...d, [k]: e.target.value })} /></div>;
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
      await admissaoEnviar(token, { ...d, dependentes: d.tem_dependentes === "sim" ? (d.dependentes || []).filter((x: any) => String(x.nome || "").trim()) : [] }, docs);
      setOk(true);
    } catch (e: any) { setErro(e.message || "Não foi possível enviar. Tente de novo."); }
    finally { setEnviando(""); }
  };
  return (
    <Caixa>
      <h2>Admissão · Aliança Móveis</h2>
      <p>Olá{info.nome ? <b>, {info.nome.split(" ")[0]}</b> : null}! Preencha seus dados e anexe os documentos — tudo vai direto para o RH, com segurança.</p>
      <CamposFicha f={d} set={setD} publico anexo={(k, rotulo) => <Anexo key={k} rotulo={rotulo} dica="foto ou PDF" lista={arqs[k] || []} muda={l => setArqs({ ...arqs, [k]: l })} />} />
      <h3>Outros documentos</h3>
      <Anexo rotulo="Outros (diploma, certificados…)" dica="opcional" lista={arqs.outro || []} muda={l => setArqs({ ...arqs, outro: l })} />
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
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "24px 12px" }}>
      <div className="card" style={{ maxWidth: 680, margin: "0 auto", padding: 20 }}>
        <style>{".grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:560px){.grid2{grid-template-columns:1fr}}h3{margin:18px 0 8px}"}</style>
        {children}
      </div>
    </div>
  );
}
