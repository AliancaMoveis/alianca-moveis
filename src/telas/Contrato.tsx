// /contrato?t=… — o cliente lê o contrato do checklist, marca a ciência de cada item, assina na tela e tira uma selfie (sem login)
import { useEffect, useRef, useState } from "react";
import { blobParaJpeg, contratoApi } from "../lib/contratoUtil";

const COR = { pri: "#284b8f", ok: "#2f7a3f", s: "#5a6270", l: "#e0e3e8", r: "#9b1c1c" };

export default function Contrato() {
  const token = new URLSearchParams(location.search).get("t") || "";
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [aceites, setAceites] = useState<boolean[]>([]);
  const [nome, setNome] = useState("");
  const [assin, setAssin] = useState("");
  const [selfie, setSelfie] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");
  const [feito, setFeito] = useState<any>(null);

  useEffect(() => {
    document.title = "Contrato · Aliança Móveis";
    if (!token) { setErro("Link inválido"); return; }
    contratoApi({ acao: "ver", token }).then(r => { if (r.assinado) setFeito(r); else { setD(r); setAceites((r.aceites || []).map(() => false)); } }).catch(e => setErro(e.message));
  }, []);

  const tudo = aceites.length > 0 && aceites.every(Boolean);
  const pronto = tudo && nome.trim().length >= 5 && !!assin && !!selfie;
  const falta = !tudo ? "Marque todos os itens de ciência" : nome.trim().length < 5 ? "Escreva seu nome completo" : !assin ? "Faça sua assinatura no quadro" : !selfie ? "Tire a selfie" : "";

  async function enviar() {
    if (!pronto) { setMsg(falta); return; }
    setEnviando(true); setMsg("");
    try { await contratoApi({ acao: "assinar", token, nome: nome.trim(), aceites, assinatura: assin, selfie }); setFeito({ nome: nome.trim(), em: new Date().toISOString() }); window.scrollTo(0, 0); }
    catch (e: any) { setMsg(e.message); } finally { setEnviando(false); }
  }

  const casca = (filhos: any) => <div style={{ minHeight: "100vh", background: "#eef0f2", font: "15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif", color: "#1a1d21" }}>
    <div style={{ background: "#1f2a3b", color: "#fff", padding: "14px 16px", textAlign: "center" }}><b style={{ letterSpacing: 1 }}>ALIANÇA MÓVEIS</b><div style={{ fontSize: 12.5, opacity: .8 }}>Checklist do projeto final · assinatura do cliente</div></div>
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "14px 12px 60px" }}>{filhos}</div></div>;
  const card: any = { background: "#fff", border: "1px solid " + COR.l, borderRadius: 14, padding: "14px 16px", marginBottom: 14, boxShadow: "0 1px 3px rgba(20,28,45,.06)" };

  if (feito) return casca(<div style={{ ...card, textAlign: "center", padding: "34px 18px" }}>
    <div style={{ fontSize: 54 }}>✅</div><h2 style={{ margin: "6px 0" }}>Contrato assinado</h2>
    <p style={{ color: COR.s }}>Obrigado{feito.nome ? ", " + feito.nome.split(" ")[0] : ""}! Sua assinatura foi registrada{feito.em ? " em " + new Date(feito.em).toLocaleString("pt-BR") : ""}.<br />O projetista já recebeu a confirmação. Se quiser uma cópia, peça a ele — o contrato pode ser impresso na loja.</p></div>);
  if (erro) return casca(<div style={{ ...card, textAlign: "center", padding: "30px 18px" }}><div style={{ fontSize: 40 }}>⚠️</div><h3>{erro}</h3></div>);
  if (!d) return casca(<div style={{ ...card, textAlign: "center", color: COR.s }}>Abrindo o contrato…</div>);

  return casca(<>
    <div style={card}><b style={{ fontSize: 17 }}>{d.cliente}</b><div style={{ color: COR.s, fontSize: 13.5 }}>Venda {d.venda} · leia o documento abaixo, marque cada item, assine e tire uma selfie para confirmar.</div></div>
    <div style={{ display: "flex", justifyContent: "flex-end", margin: "-4px 0 8px" }}>
      <button type="button" onClick={() => { const w = window.open("", "_blank"); if (!w) return; w.document.open(); w.document.write(d.html); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch { /* */ } }, 800); }}
        style={{ background: "#fff", border: "1px solid " + COR.l, borderRadius: 10, padding: "8px 14px", fontSize: 14, fontWeight: 700, color: COR.pri }}>🖨 Imprimir / ver em tela cheia</button></div>
    <div style={{ ...card, padding: 6 }}><Documento html={d.html} /></div>
    <div style={card}>
      <h3 style={{ margin: "0 0 8px" }}>1 · Ciência e aceite</h3>
      {(d.aceites || []).map((t: string, i: number) => <label key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 4px", borderBottom: "1px solid #eef0f2", cursor: "pointer" }}>
        <input type="checkbox" checked={!!aceites[i]} onChange={e => setAceites(a => a.map((x, j) => j === i ? e.target.checked : x))} style={{ width: 22, height: 22, flex: "none", marginTop: 1, accentColor: COR.pri }} />
        <span>{t}</span></label>)}
      {aceites.length > 1 && <button type="button" onClick={() => setAceites(a => a.map(() => !tudo))} style={{ marginTop: 8, background: "none", border: 0, color: COR.pri, fontWeight: 700, fontSize: 14, padding: 4 }}>{tudo ? "Desmarcar todos" : "Li tudo — marcar todos"}</button>}
    </div>
    <div style={card}>
      <h3 style={{ margin: "0 0 8px" }}>2 · Seu nome completo</h3>
      <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo de quem está assinando" autoComplete="name"
        style={{ width: "100%", boxSizing: "border-box", fontSize: 16, padding: "11px 12px", border: "1.5px solid " + COR.l, borderRadius: 10 }} />
    </div>
    <div style={card}>
      <h3 style={{ margin: "0 0 8px" }}>3 · Assinatura</h3>
      <Quadro onMudar={setAssin} />
    </div>
    <div style={card}>
      <h3 style={{ margin: "0 0 8px" }}>4 · Selfie</h3>
      <p style={{ margin: "0 0 10px", color: COR.s, fontSize: 13.5 }}>Uma foto do seu rosto agora, para confirmar que foi você quem assinou.</p>
      <Selfie valor={selfie} onMudar={setSelfie} />
    </div>
    {msg && <div style={{ ...card, background: "#fdecec", borderColor: "#f3b8b8", color: COR.r, fontWeight: 700 }}>{msg}</div>}
    <button onClick={enviar} disabled={enviando}
      style={{ width: "100%", padding: "16px", fontSize: 17, fontWeight: 800, color: "#fff", background: pronto ? COR.ok : "#9aa3b0", border: 0, borderRadius: 12, cursor: "pointer" }}>
      {enviando ? "Enviando…" : pronto ? "✍️ Assinar o contrato" : falta}</button>
    <p style={{ fontSize: 12, color: COR.s, textAlign: "center", marginTop: 10 }}>Ao assinar, ficam registrados seu nome, a assinatura, a selfie, a data e a hora, o endereço de internet do aparelho e o código do documento.</p>
  </>);
}

/** o contrato (HTML A4) dentro da página, reduzido para caber na largura do celular */
function Documento({ html }: { html: string }) {
  const caixa = useRef<HTMLDivElement>(null), ifr = useRef<HTMLIFrameElement>(null);
  const [esc, setEsc] = useState(1), [alt, setAlt] = useState(1200);
  const L = 820;
  const medir = () => {
    const w = caixa.current?.clientWidth || L; setEsc(Math.min(1, w / L));
    const doc = ifr.current?.contentDocument; if (doc?.body) setAlt(Math.ceil(doc.body.getBoundingClientRect().height) + 30);
  };
  useEffect(() => { window.addEventListener("resize", medir); const t = setInterval(medir, 1500); return () => { window.removeEventListener("resize", medir); clearInterval(t); }; }, []);
  const doc = html.replace("</head>", "<style>@media screen{body{margin:0;padding:10px 12px;background:#fff}.pg{box-shadow:none!important;margin:0 auto 18px!important}.quebra{border-top:2px dashed #ccd;padding-top:12px}}</style></head>");
  return <div ref={caixa} style={{ width: "100%", height: alt * esc, overflow: "hidden" }}>
    <iframe ref={ifr} srcDoc={doc} sandbox="allow-same-origin" onLoad={medir} title="Contrato"
      style={{ width: L, height: alt, border: 0, transform: `scale(${esc})`, transformOrigin: "0 0", display: "block" }} />
  </div>;
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
