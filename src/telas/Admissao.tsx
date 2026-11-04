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
      <CamposFicha f={d} set={setD} publico anexo={(k, rotulo) => <Anexo key={k} selfie={k === "foto"} rotulo={rotulo} dica={k === "foto" ? "uma selfie de rosto, de frente, num lugar claro" : "tire a foto do documento ou escolha do celular (foto ou PDF)"} lista={arqs[k] || []} muda={l => setArqs({ ...arqs, [k]: l })} />} />
      <h3>Outros documentos</h3>
      <Anexo rotulo="Outros (diploma, certificados…)" dica="opcional" lista={arqs.outro || []} muda={l => setArqs({ ...arqs, outro: l })} />
      {c("obs", "Alguma observação para o RH? (opcional)")}
      {erro && <p style={{ color: "#b32424", fontWeight: 700 }}>{erro}</p>}
      <button className="btn primary" style={{ width: "100%", padding: 14, fontSize: 16, marginTop: 10 }} disabled={!!enviando} onClick={enviar}>{enviando || "📨 Enviar para o RH"}</button>
      <p className="hint" style={{ marginTop: 10 }}>Seus dados e documentos são enviados com segurança e só o RH da Aliança Móveis tem acesso.</p>
    </Caixa>
  );
}

function Anexo({ rotulo, dica, lista, muda, selfie }: { rotulo: string; dica: string; lista: File[]; muda: (l: File[]) => void; selfie?: boolean }) {
  const arq = useRef<HTMLInputElement>(null), cam = useRef<HTMLInputElement>(null);
  const add = (fs: FileList | null, el: HTMLInputElement | null) => { if (fs?.length) muda([...lista, ...Array.from(fs)]); if (el) el.value = ""; };
  return (
    <div className="card" style={{ padding: 12, marginBottom: 10 }}>
      <div><b>{rotulo}</b>{dica ? <div className="hint">{dica}</div> : null}</div>
      {/* câmera: selfie abre a câmera da frente; documentos, a de trás */}
      <input ref={cam} type="file" accept="image/*" capture={selfie ? "user" : "environment"} style={{ display: "none" }} onChange={e => add(e.target.files, cam.current)} />
      <input ref={arq} type="file" accept="image/*,.pdf" multiple style={{ display: "none" }} onChange={e => add(e.target.files, arq.current)} />
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button className="btn primary" type="button" style={{ flex: "1 1 150px", padding: "10px 12px" }} onClick={() => cam.current?.click()}>📷 {selfie ? "Tirar selfie" : "Tirar foto"}</button>
        <button className="btn" type="button" style={{ flex: "1 1 150px", padding: "10px 12px" }} onClick={() => arq.current?.click()}>📎 Escolher do celular</button>
      </div>
      {lista.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>{lista.map((f, i) => <Miniatura key={i} f={f} tirar={() => muda(lista.filter((_x, j) => j !== i))} />)}</div>}
    </div>
  );
}

function Miniatura({ f, tirar }: { f: File; tirar: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => { if (!f.type.startsWith("image/")) return; const u = URL.createObjectURL(f); setUrl(u); return () => URL.revokeObjectURL(u); }, [f]);
  return <div style={{ position: "relative", width: 86, textAlign: "center", fontSize: 11 }}>
    {url ? <img src={url} alt="" style={{ width: 86, height: 86, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} /> : <div style={{ width: 86, height: 86, borderRadius: 8, border: "1px solid var(--line)", display: "grid", placeItems: "center", fontSize: 28 }}>📄</div>}
    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
    <button type="button" onClick={tirar} title="Tirar" style={{ position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: 12, border: 0, background: "var(--danger)", color: "#fff", cursor: "pointer" }}>✕</button>
  </div>;
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
