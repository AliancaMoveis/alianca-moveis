// /contrato?t=… — assinatura online do checklist (sem login, só com o link / QR Code)
// Mesma ordem do papel: 1) termo de ciência do material (vem preenchido e o cliente pode corrigir) · 2) geral (29 itens "Sim")
// · 3) imagens do projeto de cada ambiente · 4) nome, CPF, assinatura e selfie.
import { useEffect, useRef, useState } from "react";
import { blobParaJpeg, contratoApi } from "../lib/contratoUtil";
import { CONDICOES_CONTRATO, INFO_TECNICAS, LOGO_URL, contratoHtml, cpfValido, diferencasTermo, faltaNoTermo, fmtCpf, type ContratoDados, type TermoAmb } from "../lib/contratoDoc";
import TermoMaterial from "../comp/TermoMaterial";

const COR = { pri: "#284b8f", ok: "#2f7a3f", okbg: "#e6f4e9", s: "#5a6270", l: "#e0e3e8", r: "#9b1c1c", verde: "#0f5e3a" };
const PASSOS = ["Materiais", "Termo geral", "Imagens", "Assinatura"];
const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export default function Contrato() {
  const token = new URLSearchParams(location.search).get("t") || "";
  const [d, setD] = useState<ContratoDados | null>(null);
  const [erro, setErro] = useState("");
  const [passo, setPasso] = useState(0);
  const [termos, setTermos] = useState<TermoAmb[]>([]);
  const [matOk, setMatOk] = useState<boolean[]>([]);
  const [geral, setGeral] = useState<boolean[]>(CONDICOES_CONTRATO.map(() => false));
  const [imgOk, setImgOk] = useState<boolean[]>([]);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [assin, setAssin] = useState("");
  const [selfie, setSelfie] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");
  const [feito, setFeito] = useState<any>(null);
  const [zoom, setZoom] = useState<string>("");

  useEffect(() => {
    document.title = "Contrato · Aliança Móveis";
    if (!token) { setErro("Link inválido"); return; }
    contratoApi({ acao: "ver", token }).then(r => {
      if (r.assinado) { setFeito(r); return; }
      const dd: ContratoDados = r.dados; setD(dd);
      setTermos(dd.ambientes.map(a => copia(a.termo))); setMatOk(dd.ambientes.map(() => false)); setImgOk(dd.ambientes.map(() => false));
    }).catch(e => setErro(e.message));
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [passo]);

  const ok1 = !!d && matOk.length === d.ambientes.length && matOk.every(Boolean);
  const ok2 = geral.every(Boolean);
  const ok3 = !!d && imgOk.length === d.ambientes.length && imgOk.every(Boolean);
  const ok4 = nome.trim().length >= 5 && cpfValido(cpf) && !!assin && !!selfie;
  const falta4 = nome.trim().length < 5 ? "Escreva seu nome completo" : !cpfValido(cpf) ? "Informe um CPF válido" : !assin ? "Faça sua assinatura no quadro" : !selfie ? "Tire a selfie" : "";
  const libera = [true, ok1, ok1 && ok2, ok1 && ok2 && ok3];

  function imprimir() {
    if (!d) return;
    const w = window.open("", "_blank"); if (!w) return;
    const html = contratoHtml(d, { nome, cpf, termos, materiaisOk: matOk, geral, imagensOk: imgOk }, null, location.origin + "/logo.png");
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* */ } }, 900);
  }
  async function enviar() {
    if (!ok1 || !ok2 || !ok3) { setMsg("Volte e conclua os passos anteriores"); return; }
    if (!ok4) { setMsg(falta4); return; }
    setEnviando(true); setMsg("");
    try {
      const r = await contratoApi({ acao: "assinar", token, resposta: { nome: nome.trim(), cpf: cpf.replace(/\D/g, ""), termos, materiaisOk: matOk, geral, imagensOk: imgOk }, assinatura: assin, selfie });
      setFeito({ nome: nome.trim(), em: new Date().toISOString(), teste: !!r.teste, url: r.url || "" }); window.scrollTo(0, 0);
    } catch (e: any) { setMsg(e.message); } finally { setEnviando(false); }
  }

  const casca = (filhos: any) => <div style={{ minHeight: "100vh", background: "#eef0f2", font: "15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif", color: "#1a1d21" }}>
    <div style={{ background: COR.verde, color: "#fff", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
      <img src={LOGO_URL.replace(/^https:\/\/[^/]+/, "")} alt="Aliança" style={{ height: 42 }} />
      <div><b style={{ letterSpacing: .5 }}>ALIANÇA MÓVEIS</b><div style={{ fontSize: 12.5, opacity: .85 }}>Checklist do projeto final · assinatura do cliente</div></div></div>
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "14px 12px 60px" }}>{filhos}</div></div>;
  const card: any = { background: "#fff", border: "1px solid " + COR.l, borderRadius: 14, padding: "14px 16px", marginBottom: 14, boxShadow: "0 1px 3px rgba(20,28,45,.06)" };
  const ciente = (on: boolean, set: (v: boolean) => void, txt: string, desab = false) => <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "11px 12px", marginTop: 10, borderRadius: 10, cursor: desab ? "default" : "pointer", opacity: desab ? .55 : 1, background: on ? COR.okbg : "#f6f7f9", border: "1.5px solid " + (on ? "#9fc5a8" : COR.l) }}>
    <input type="checkbox" checked={on} disabled={desab} onChange={e => set(e.target.checked)} style={{ width: 24, height: 24, flex: "none", accentColor: COR.ok }} /><b style={{ fontSize: 14.5 }}>{txt}</b></label>;
  const botao = (txt: string, on: boolean, f: () => void, cor = COR.pri) => <button type="button" onClick={f} disabled={!on}
    style={{ width: "100%", padding: 15, fontSize: 16.5, fontWeight: 800, color: "#fff", background: on ? cor : "#9aa3b0", border: 0, borderRadius: 12, cursor: on ? "pointer" : "default", marginTop: 4 }}>{txt}</button>;

  if (feito) return casca(<div style={{ ...card, textAlign: "center", padding: "34px 18px" }}>
    <div style={{ fontSize: 54 }}>✅</div><h2 style={{ margin: "6px 0" }}>Contrato assinado</h2>
    <p style={{ color: COR.s }}>Obrigado{feito.nome ? ", " + String(feito.nome).split(" ")[0] : ""}! Sua assinatura foi registrada{feito.em ? " em " + new Date(feito.em).toLocaleString("pt-BR") : ""}.<br />O projetista já recebeu a confirmação. Se quiser uma cópia, peça a ele — o contrato pode ser impresso na loja.</p>
    {feito.teste && <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#fff8e6", border: "1px solid #f0d9a6" }}>
      <b>🧪 Link de teste</b><div style={{ fontSize: 13.5, color: COR.s, margin: "4px 0 10px" }}>Este link continua aberto para outras pessoas testarem.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {feito.url && <button type="button" onClick={async () => { const w = window.open("", "_blank"); if (!w) return; w.document.write("<p style='font:16px system-ui;padding:30px'>Abrindo…</p>"); try { const h = await (await fetch(feito.url)).text(); w.document.open(); w.document.write(h); w.document.close(); } catch { w.close(); } }}
          style={{ padding: "10px 16px", fontSize: 15, fontWeight: 800, color: "#fff", background: COR.pri, border: 0, borderRadius: 10 }}>📄 Ver o contrato assinado</button>}
        <button type="button" onClick={() => location.reload()} style={{ padding: "10px 16px", fontSize: 15, fontWeight: 700, color: COR.pri, background: "#fff", border: "1.5px solid " + COR.l, borderRadius: 10 }}>↻ Assinar de novo</button>
      </div></div>}</div>);
  if (erro) return casca(<div style={{ ...card, textAlign: "center", padding: "30px 18px" }}><div style={{ fontSize: 40 }}>⚠️</div><h3>{erro}</h3></div>);
  if (!d) return casca(<div style={{ ...card, textAlign: "center", color: COR.s }}>Abrindo o contrato…</div>);

  const alteracoes = d.ambientes.flatMap((a, i) => termos[i] ? diferencasTermo(a.termo, termos[i]).map(x => a.nome + " — " + x) : []);
  return casca(<>
    <div style={card}>
      <b style={{ fontSize: 17 }}>{d.cliente}</b><div style={{ color: COR.s, fontSize: 13.5 }}>Venda {d.venda} · {d.ambientes.length} ambiente{d.ambientes.length === 1 ? "" : "s"} · projetista {d.projetista}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{d.ambientes.map((a, i) => <span key={i} style={{ background: "#e8ecf3", color: COR.pri, borderRadius: 999, padding: "3px 10px", fontSize: 13, fontWeight: 700 }}>{i + 1} · {a.nome}</span>)}</div>
      {(d.obs || d.naoInclusos.length > 0) && <div style={{ fontSize: 13, color: COR.s, marginTop: 8 }}>{d.naoInclusos.length > 0 && <div><b>Não inclusos:</b> {d.naoInclusos.join(", ")}</div>}{d.obs && <div><b>Observações:</b> {d.obs}</div>}</div>}
      <div style={{ display: "flex", gap: 4, marginTop: 12 }}>{PASSOS.map((p, i) => {
        const feitoP = [ok1, ok2, ok3, false][i];
        return <button key={p} type="button" disabled={!libera[i]} onClick={() => setPasso(i)} style={{ flex: 1, padding: "7px 2px", borderRadius: 9, border: "1.5px solid " + (passo === i ? COR.pri : feitoP ? "#9fc5a8" : COR.l),
          background: passo === i ? COR.pri : feitoP ? COR.okbg : "#fff", color: passo === i ? "#fff" : libera[i] ? "#1a1d21" : "#9aa3b0", fontSize: 12, fontWeight: 700, cursor: libera[i] ? "pointer" : "default" }}>
          {feitoP && passo !== i ? "✓ " : i + 1 + " · "}{p}</button>;
      })}</div>
      <button type="button" onClick={imprimir} style={{ marginTop: 10, background: "none", border: 0, color: COR.pri, fontWeight: 700, fontSize: 14, padding: 2, cursor: "pointer" }}>🖨 Ver o documento completo / imprimir</button>
    </div>

    {passo === 0 && <>
      <div style={card}>
        <h3 style={{ margin: "0 0 6px" }}>1 · Termo de ciência do material</h3>
        <p style={{ margin: 0, color: COR.s, fontSize: 14 }}>Os materiais abaixo vieram do seu projeto. <b>Confira com o projetista</b>: se algo estiver diferente, corrija aqui mesmo — a alteração fica registrada no contrato.</p>
        <div style={{ fontSize: 12.5, color: COR.s, marginTop: 8 }}>{INFO_TECNICAS.map((x, i) => <div key={i}>• {x}</div>)}</div>
      </div>
      {d.ambientes.map((a, i) => {
        const falta = termos[i] ? faltaNoTermo(termos[i]) : [];
        return <div key={i} style={{ ...card, borderColor: matOk[i] ? "#9fc5a8" : COR.l }}>
          <h3 style={{ margin: "0 0 10px" }}>Ambiente {i + 1} de {d.ambientes.length}: {a.nome}</h3>
          {a.fichaObs && <div style={{ fontSize: 13.5, background: "#fff8e6", border: "1px solid #f0d9a6", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}><b>Observações:</b> {a.fichaObs}</div>}
          {termos[i] && <TermoMaterial v={termos[i]} orig={a.termo} onChange={t => { setTermos(ts => ts.map((x, j) => j === i ? t : x)); setMatOk(m => m.map((x, j) => j === i ? false : x)); }} />}
          {falta.length > 0 && <div style={{ marginTop: 10, color: "#8a5d00", fontSize: 13.5, fontWeight: 600 }}>Falta preencher: {falta.join(", ")}</div>}
          {ciente(!!matOk[i], v => setMatOk(m => m.map((x, j) => j === i ? v : x)), `Conferi os materiais do ambiente ${a.nome} e estou ciente`, falta.length > 0)}
        </div>;
      })}
      {botao(ok1 ? "Continuar → Termo geral" : "Confirme os materiais de cada ambiente", ok1, () => setPasso(1))}
    </>}

    {passo === 1 && <>
      <div style={card}>
        <h3 style={{ margin: "0 0 6px" }}>2 · Geral</h3>
        <p style={{ margin: 0, color: COR.s, fontSize: 14 }}>Leia cada item e marque <b>Sim</b>. ({geral.filter(Boolean).length} de {CONDICOES_CONTRATO.length})</p>
      </div>
      <div style={card}>{CONDICOES_CONTRATO.map((t, i) => <div key={i} style={{ padding: "10px 0", borderBottom: i < CONDICOES_CONTRATO.length - 1 ? "1px solid #eef0f2" : 0 }}>
        <div style={{ fontSize: 14.5 }}><b>{i + 1} - </b>{t}</div>
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", marginTop: 7, padding: "6px 14px", borderRadius: 9, cursor: "pointer", fontWeight: 800, background: geral[i] ? COR.okbg : "#f6f7f9", border: "1.5px solid " + (geral[i] ? "#9fc5a8" : COR.l) }}>
          <input type="checkbox" checked={geral[i]} onChange={e => setGeral(g => g.map((x, j) => j === i ? e.target.checked : x))} style={{ width: 22, height: 22, accentColor: COR.ok }} /> Sim</label>
      </div>)}</div>
      {botao(ok2 ? "Continuar → Imagens do projeto" : `Marque “Sim” em todos (${geral.filter(Boolean).length}/${CONDICOES_CONTRATO.length})`, ok2, () => setPasso(2))}
    </>}

    {passo === 2 && <>
      <div style={card}>
        <h3 style={{ margin: "0 0 6px" }}>3 · Imagens do projeto</h3>
        <p style={{ margin: 0, color: COR.s, fontSize: 14 }}>Este é o projeto que vai para a fábrica. Toque na imagem para ampliar.</p>
      </div>
      {d.ambientes.map((a, i) => <div key={i} style={{ ...card, borderColor: imgOk[i] ? "#9fc5a8" : COR.l }}>
        <h3 style={{ margin: "0 0 10px" }}>Ambiente {i + 1} de {d.ambientes.length}: {a.nome}</h3>
        {a.fichaObs && <div style={{ fontSize: 13.5, background: "#fff8e6", border: "1px solid #f0d9a6", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}><b>Observações:</b> {a.fichaObs}</div>}
        {a.imagens.length ? <div style={{ display: "grid", gap: 10 }}>{a.imagens.map((m, j) => <figure key={j} style={{ margin: 0 }}>
          <img src={m.src} alt="" onClick={() => setZoom(m.src)} style={{ width: "100%", borderRadius: 10, border: "1px solid " + COR.l, cursor: "zoom-in", background: "#fff" }} />
          <figcaption style={{ fontSize: 12, color: COR.s }}>{m.nome}</figcaption></figure>)}</div>
          : <div style={{ color: COR.s }}>Sem imagens anexadas para este ambiente.</div>}
        {(a.itens || []).length > 0 && <details style={{ marginTop: 10 }}><summary style={{ cursor: "pointer", fontWeight: 700, color: COR.pri }}>O que foi comprado ({a.itens!.length} itens)</summary>
          <div style={{ fontSize: 13.5, marginTop: 6 }}>{a.itens!.map((x, j) => <div key={j} style={{ padding: "4px 0", borderBottom: "1px solid #eef0f2" }}>{x.qtd} · {x.descricao} <span style={{ color: COR.s }}>({x.medidas})</span></div>)}</div></details>}
        {ciente(!!imgOk[i], v => setImgOk(m => m.map((x, j) => j === i ? v : x)), a.imagens.length ? `Vi as imagens do projeto do ambiente ${a.nome} e estou de acordo` : `Estou ciente do projeto do ambiente ${a.nome}`)}
      </div>)}
      {botao(ok3 ? "Continuar → Assinatura" : "Confirme as imagens de cada ambiente", ok3, () => setPasso(3))}
    </>}

    {passo === 3 && <>
      {alteracoes.length > 0 && <div style={{ ...card, background: "#fdf1f1", borderColor: "#f3b8b8" }}>
        <b style={{ color: COR.r }}>Você alterou o termo do material:</b>
        <div style={{ fontSize: 13.5, marginTop: 4 }}>{alteracoes.map((x, i) => <div key={i}>• {x}</div>)}</div>
        <div style={{ fontSize: 12.5, color: COR.s, marginTop: 4 }}>As alterações ficam registradas no contrato assinado.</div></div>}
      <div style={card}>
        <h3 style={{ margin: "0 0 8px" }}>4 · Seus dados</h3>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo de quem está assinando" autoComplete="name"
          style={{ width: "100%", boxSizing: "border-box", fontSize: 16, padding: "11px 12px", border: "1.5px solid " + COR.l, borderRadius: 10, marginBottom: 8 }} />
        <input value={fmtCpf(cpf)} onChange={e => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="CPF" inputMode="numeric"
          style={{ width: "100%", boxSizing: "border-box", fontSize: 16, padding: "11px 12px", border: "1.5px solid " + (cpf.length === 11 && !cpfValido(cpf) ? COR.r : COR.l), borderRadius: 10 }} />
        {cpf.length === 11 && !cpfValido(cpf) && <div style={{ color: COR.r, fontSize: 13, marginTop: 4 }}>CPF inválido — confira os números.</div>}
      </div>
      <div style={card}><h3 style={{ margin: "0 0 8px" }}>Assinatura</h3><Quadro onMudar={setAssin} /></div>
      <div style={card}>
        <h3 style={{ margin: "0 0 8px" }}>Selfie</h3>
        <p style={{ margin: "0 0 10px", color: COR.s, fontSize: 13.5 }}>Uma foto do seu rosto agora, para confirmar que foi você quem assinou.</p>
        <Selfie valor={selfie} onMudar={setSelfie} />
      </div>
      {msg && <div style={{ ...card, background: "#fdecec", borderColor: "#f3b8b8", color: COR.r, fontWeight: 700 }}>{msg}</div>}
      {botao(enviando ? "Enviando…" : ok4 ? "✍️ Assinar o contrato" : falta4, ok4 && !enviando, enviar, COR.ok)}
      <p style={{ fontSize: 12, color: COR.s, textAlign: "center", marginTop: 10 }}>Ao assinar, ficam registrados seu nome, CPF, a assinatura, a selfie, a data e a hora, o endereço de internet do aparelho e o código do documento.</p>
    </>}

    {zoom && <div onClick={() => setZoom("")} style={{ position: "fixed", inset: 0, background: "rgba(10,14,20,.92)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
      <img src={zoom} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", background: "#fff" }} />
      <div style={{ position: "absolute", top: 10, right: 14, color: "#fff", fontSize: 15, fontWeight: 700 }}>✕ fechar</div></div>}
  </>);
}

/** quadro para assinar com o dedo / mouse */
function Quadro({ onMudar }: { onMudar: (png: string) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const des = useRef(false), traco = useRef(0);
  const [vazio, setVazio] = useState(true);
  useEffect(() => {
    const c = cv.current!; const r = c.getBoundingClientRect(); const k = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * k); c.height = Math.round(r.height * k);
    const g = c.getContext("2d")!; g.scale(k, k); g.lineWidth = 2.6; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#0d1b3e";
  }, []);
  const pos = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const ini = (e: React.PointerEvent) => { e.preventDefault(); cv.current!.setPointerCapture(e.pointerId); des.current = true; const [x, y] = pos(e); const g = cv.current!.getContext("2d")!; g.beginPath(); g.moveTo(x, y); };
  const mov = (e: React.PointerEvent) => { if (!des.current) return; const [x, y] = pos(e); const g = cv.current!.getContext("2d")!; g.lineTo(x, y); g.stroke(); traco.current++; };
  const fim = () => { if (!des.current) return; des.current = false; if (traco.current > 12) { setVazio(false); onMudar(cv.current!.toDataURL("image/png")); } };
  const limpar = () => { const c = cv.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); traco.current = 0; setVazio(true); onMudar(""); };
  return <div>
    <div style={{ position: "relative" }}>
      <canvas ref={cv} onPointerDown={ini} onPointerMove={mov} onPointerUp={fim} onPointerCancel={fim}
        style={{ width: "100%", height: 190, border: "2px dashed #b9c2d0", borderRadius: 12, background: "#fbfcfe", touchAction: "none", display: "block" }} />
      {vazio && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#9aa3b0", pointerEvents: "none" }}>Assine aqui com o dedo</div>}
      <div style={{ position: "absolute", left: 18, right: 18, bottom: 38, borderBottom: "1px solid #c8cfda", pointerEvents: "none" }} />
    </div>
    <button type="button" onClick={limpar} style={{ marginTop: 8, background: "none", border: "1px solid " + COR.l, borderRadius: 8, padding: "6px 12px", fontSize: 14 }}>Limpar e assinar de novo</button>
  </div>;
}

/** selfie pela câmera frontal (o celular abre a câmera direto) */
function Selfie({ valor, onMudar }: { valor: string; onMudar: (s: string) => void }) {
  const ref = useRef<HTMLInputElement>(null); const [proc, setProc] = useState(false); const [erro, setErro] = useState("");
  return <div>
    <input ref={ref} type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={async e => {
      const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setProc(true); setErro("");
      try { onMudar(await blobParaJpeg(f, 900, 0.8)); } catch { setErro("Não consegui abrir a foto. Tente de novo."); } finally { setProc(false); }
    }} />
    {valor ? <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
      <img src={valor} alt="" style={{ width: 120, height: 150, objectFit: "cover", borderRadius: 10, border: "1px solid " + COR.l }} />
      <button type="button" onClick={() => ref.current?.click()} style={{ background: "none", border: "1px solid " + COR.l, borderRadius: 8, padding: "8px 12px", fontSize: 14 }}>📷 Tirar outra</button></div>
      : <button type="button" onClick={() => ref.current?.click()} disabled={proc}
        style={{ width: "100%", padding: "14px", fontSize: 16, fontWeight: 700, color: COR.pri, background: "#e8f1ff", border: "1.5px solid #b8cdf0", borderRadius: 12 }}>{proc ? "Preparando a foto…" : "📷 Tirar selfie"}</button>}
    {erro && <div style={{ color: COR.r, marginTop: 6 }}>{erro}</div>}
  </div>;
}
