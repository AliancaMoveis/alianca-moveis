// /contrato?t=… — assinatura online do checklist (sem login, só com o link / QR Code)
// Mesma ordem do papel: 1) termo de ciência do material (vem preenchido e o cliente pode corrigir) · 2) geral (29 itens "Sim")
// · 3) imagens do projeto de cada ambiente · 4) nome, CPF, assinatura e selfie.
import { useEffect, useRef, useState } from "react";
import { blobParaJpeg, contratoApi, contratoCopia } from "../lib/contratoUtil";
import { CONDICOES_CONTRATO, INFO_TECNICAS, LOGO_URL, contratoHtml, cpfValido, diferencasTermo, faltaNoTermo, fmtCpf, type ContratoDados, type TermoAmb, INICIO_MONTAGEM } from "../lib/contratoDoc";
import TermoMaterial from "../comp/TermoMaterial";

/** O documento na PRÓPRIA tela, não em janela nova.
 *  No celular o navegador bloqueia janela nova (window.open) quase sempre: o cliente clicava em
 *  "Ver o documento completo" e não acontecia nada. Aqui o contrato abre por cima da página, dentro
 *  de um quadro, com botão de imprimir — sem depender de pop-up, no Android e no iPhone. */
function VerDocumento({ html, onFechar, autoPdf }: { html: string; onFechar: () => void; autoPdf?: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const imprimir = () => { const w = ref.current?.contentWindow; if (!w) return; try { w.focus(); w.print(); } catch { /* o navegador recusou */ } };
  // "Baixar em PDF": abre a caixa de impressão já no destino "Salvar como PDF" assim que o documento desenha
  const [caiu, setCaiu] = useState(false);     // o blob não desenhou: volta para o modo antigo
  const abriu = useRef(false);
  const pronto = () => { abriu.current = true; if (autoPdf) setTimeout(imprimir, 400); };
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); }; window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [onFechar]);
  // O documento vai para o iframe por blob, não por srcDoc. Com srcDoc o HTML inteiro (com todas as
  // imagens do projeto em base64) ficava vivo DUAS vezes: na string do React e na página do iframe.
  // Em projeto com muitas imagens isso estoura a memória do Safari no iPhone, a aba cai e o cliente
  // perde a assinatura no meio. Com blob o navegador segura o conteúdo uma vez só, e ao fechar o
  // endereço é revogado — a memória volta na hora.
  const [src, setSrc] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    setSrc(u); abriu.current = false; setCaiu(false);
    const t = setTimeout(() => { if (!abriu.current) setCaiu(true); }, 2000);
    return () => { clearTimeout(t); URL.revokeObjectURL(u); };
  }, [html]);
  return <div style={{ position: "fixed", inset: 0, background: "rgba(16,20,26,.75)", zIndex: 9999, display: "flex", flexDirection: "column" }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", background: "#fff", borderBottom: "1px solid #e0e3e8" }}>
      <b style={{ fontSize: 15, marginRight: "auto" }}>Documento completo</b>
      <button type="button" onClick={imprimir} style={{ padding: "9px 14px", fontWeight: 800, fontSize: 14, color: "#fff", background: "#284b8f", border: 0, borderRadius: 10 }}>🖨 Imprimir / salvar PDF</button>
      <button type="button" onClick={onFechar} style={{ padding: "9px 14px", fontWeight: 800, fontSize: 14, color: "#284b8f", background: "#fff", border: "2px solid #284b8f", borderRadius: 10 }}>Fechar</button>
    </div>
    {autoPdf && <div style={{ padding: "8px 12px", background: "#e9eff9", color: "#284b8f", fontSize: 13, fontWeight: 600 }}>Na janela que abrir, escolha <b>Salvar como PDF</b> (no iPhone, toque em Compartilhar › Salvar em Arquivos).</div>}
    {caiu
      ? <iframe ref={ref} srcDoc={html} title="Documento" onLoad={pronto} style={{ flex: 1, width: "100%", border: 0, background: "#fff" }} />
      : <iframe ref={ref} src={src} title="Documento" onLoad={pronto} style={{ flex: 1, width: "100%", border: 0, background: "#fff" }} />}
  </div>;
}

/** via do cliente: baixa/abre o contrato que ele acabou de assinar (e continua valendo se reabrir o link) */
function BaixarContrato({ token }: { token: string }) {
  const [indo, setIndo] = useState(""); const [erro, setErro] = useState(""); const [doc, setDoc] = useState(""); const [pdf, setPdf] = useState(false);

  // Baixar de verdade: quem manda é o SERVIDOR, que entrega o arquivo marcado como anexo
  // (Content-Disposition). Aí o celular salva nos Downloads / Arquivos em vez de só mostrar
  // numa aba. O atributo download sozinho não resolve — o iPhone ignora em endereço de fora.
  // Como o arquivo vem como anexo, o clique baixa sem tirar o cliente desta tela.
  const baixar = async () => {
    setIndo("b"); setErro("");
    try {
      const r = await contratoCopia({ token });
      const a = document.createElement("a"); a.href = r.urlBaixar || r.url; a.rel = "noopener"; a.download = "";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e: any) { setErro(e.message || "Não consegui baixar agora"); }
    finally { setIndo(""); }
  };

  // na própria tela, pelo mesmo motivo do documento completo: no celular a janela nova é bloqueada
  const abrir = async (pdf: boolean) => {
    setIndo(pdf ? "p" : "a"); setErro(""); setPdf(pdf);
    try {
      const r = await contratoCopia({ token });
      setDoc(await (await fetch(r.url)).text());
    } catch (e: any) { setErro(e.message || "Não consegui abrir agora"); }
    finally { setIndo(""); }
  };

  const bt = (p: boolean): React.CSSProperties => ({ padding: "13px 20px", fontSize: 16, fontWeight: 800, borderRadius: 12, border: p ? 0 : "2px solid " + COR.pri,
    color: p ? "#fff" : COR.pri, background: p ? COR.pri : "#fff" });
  return <div style={{ marginTop: 14 }}>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button type="button" onClick={() => abrir(true)} disabled={!!indo} style={{ ...bt(true), background: indo ? "#9aa3b0" : COR.pri }}>
        {indo === "p" ? "Montando o PDF…" : "📥 Baixar em PDF"}</button>
      <button type="button" onClick={() => abrir(false)} disabled={!!indo} style={bt(false)}>
        {indo === "a" ? "Abrindo…" : "📄 Ver na tela"}</button>
    </div>
    {doc && <VerDocumento html={doc} autoPdf={pdf} onFechar={() => setDoc("")} />}
    {erro && <div style={{ color: "#9b1c1c", fontSize: 13, marginTop: 8 }}>{erro}</div>}
    <div style={{ fontSize: 12.5, color: "#5a6270", marginTop: 8 }}>
      <b>Baixar em PDF</b> abre a sua via e a caixa de salvar — escolha <b>Salvar como PDF</b> e o arquivo fica no celular, pronto para enviar por WhatsApp.
      <b> Ver na tela</b> abre o contrato completo com a sua assinatura.
      <div style={{ marginTop: 6 }}><a href="#" onClick={e => { e.preventDefault(); baixar(); }} style={{ color: COR.s }}>{indo === "b" ? "baixando…" : "ou baixar o arquivo original (.html)"}</a></div>
    </div>
  </div>;
}

const COR = { pri: "#284b8f", ok: "#2f7a3f", okbg: "#e6f4e9", s: "#5a6270", l: "#e0e3e8", r: "#9b1c1c", verde: "#0f5e3a" };
const PASSOS = ["Materiais", "Termo geral", "Imagens", "Assinatura"];
const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export default function Contrato() {
  const token = new URLSearchParams(location.search).get("t") || "";
  const [d, setD] = useState<ContratoDados | null>(null);
  const [erro, setErro] = useState("");
  const [passo, setPasso] = useState(0);
  const [doc, setDoc] = useState("");   // documento completo aberto por cima da tela
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
  // 2º link: quem abre é o TITULAR da compra. O representante já conferiu tudo; o titular lê, autoriza e assina.
  const [tit, setTit] = useState<{ nome: string; representante: string; em: string; resposta: any } | null>(null);
  const [autorizo, setAutorizo] = useState(false);
  const [telTit, setTelTit] = useState("");   // telefone do titular, para mandar o 2º link (vem do sistema, dá para corrigir)
  const [enviei, setEnviei] = useState(false);
  const soLeitura = !!tit;

  // ---------- não perder o preenchimento se a página cair ----------
  // O Safari do iPhone derruba a aba por falta de memória quando o projeto tem muitas imagens.
  // Antes, voltar significava refazer TUDO: nome, CPF, cada conferência de material, cada item do
  // termo geral e a assinatura. Agora o preenchimento fica guardado no próprio aparelho, por
  // contrato, e volta sozinho. A selfie fica de fora de propósito (é a parte mais pesada e é um
  // toque só para refazer).
  const chaveR = "a360-ct-" + token;
  const restaurado = useRef(false);
  useEffect(() => {
    if (!d || restaurado.current) return;
    restaurado.current = true;
    try {
      const s = JSON.parse(sessionStorage.getItem(chaveR) || "null");
      if (!s) return;
      if (s.nome) setNome(s.nome);
      if (s.cpf) setCpf(s.cpf);
      if (s.assin) setAssin(s.assin);
      if (typeof s.autorizo === "boolean") setAutorizo(s.autorizo);
      if (!tit) {
        if (Array.isArray(s.matOk) && s.matOk.length === d.ambientes.length) setMatOk(s.matOk);
        if (Array.isArray(s.imgOk) && s.imgOk.length === d.ambientes.length) setImgOk(s.imgOk);
        if (Array.isArray(s.geral) && s.geral.length === CONDICOES_CONTRATO.length) setGeral(s.geral);
        if (Array.isArray(s.termos) && s.termos.length === d.ambientes.length) setTermos(s.termos);
      }
      if (typeof s.passo === "number") setPasso(s.passo);
      setMsg("Voltamos de onde você parou — confira antes de assinar.");
    } catch { /* se não der para ler, começa limpo */ }
  }, [d]);
  useEffect(() => {
    if (!d || !restaurado.current) return;
    try { sessionStorage.setItem(chaveR, JSON.stringify({ nome, cpf, assin, autorizo, matOk, imgOk, geral, termos, passo })); }
    catch { /* sem espaço: segue sem guardar */ }
  }, [d, nome, cpf, assin, autorizo, matOk, imgOk, geral, termos, passo]);

  useEffect(() => {
    document.title = "Contrato · Aliança Móveis";
    if (!token) { setErro("Link inválido"); return; }
    contratoApi({ acao: "ver", token }).then(r => {
      if (r.assinado) { setFeito(r); if (r.telefoneTitular) setTelTit(String(r.telefoneTitular)); return; }
      const dd: ContratoDados = r.dados; setD(dd);
      if (r.titular) {
        // o titular vê a conferência que o representante fez, já marcada, sem poder mudar
        setTit(r.titular);
        const rp = r.titular.resposta || {};
        setTermos(dd.ambientes.map((a, i) => copia(rp.termos?.[i] || a.termo)));
        setMatOk(dd.ambientes.map(() => true)); setImgOk(dd.ambientes.map(() => true));
        setGeral(CONDICOES_CONTRATO.map(() => true));
        return;
      }
      setTermos(dd.ambientes.map(a => copia(a.termo))); setMatOk(dd.ambientes.map(() => false)); setImgOk(dd.ambientes.map(() => false));
      if (r.representante) setNome(r.representante);   // o projetista já cadastrou quem está assinando
    }).catch(e => setErro(e.message));
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [passo]);

  const ok1 = !!d && matOk.length === d.ambientes.length && matOk.every(Boolean);
  const ok2 = geral.every(Boolean);
  const ok3 = !!d && imgOk.length === d.ambientes.length && imgOk.every(Boolean);
  const ok4 = (!tit || autorizo) && nome.trim().length >= 5 && cpfValido(cpf) && !!assin && !!selfie;
  const falta4 = tit && !autorizo ? "Marque a autorização acima" : nome.trim().length < 5 ? "Escreva seu nome completo" : !cpfValido(cpf) ? "Informe um CPF válido" : !assin ? "Faça sua assinatura no quadro" : !selfie ? "Tire a selfie" : "";
  const libera = [true, ok1, ok1 && ok2, ok1 && ok2 && ok3];
  useEffect(() => { if (tit) setPasso(3); }, [tit]);   // o titular só autoriza e assina — a conferência já foi feita

  // mostra o documento NA PRÓPRIA TELA: no celular a janela nova é bloqueada e o botão não fazia nada
  function imprimir() {
    if (!d) return;
    setDoc(contratoHtml(d, { nome, cpf, termos, materiaisOk: matOk, geral, imagensOk: imgOk }, null, location.origin + "/logo.png"));
  }
  async function enviar() {
    if (!ok1 || !ok2 || !ok3) { setMsg("Volte e conclua os passos anteriores"); return; }
    if (!ok4) { setMsg(falta4); return; }
    setEnviando(true); setMsg("");
    try {
      const r = tit
        ? await contratoApi({ acao: "assinar", token, titular: true, nome: nome.trim(), cpf: cpf.replace(/\D/g, ""), autorizo, assinatura: assin, selfie })
        : await contratoApi({ acao: "assinar", token, resposta: { nome: nome.trim(), cpf: cpf.replace(/\D/g, ""), termos, materiaisOk: matOk, geral, imagensOk: imgOk }, assinatura: assin, selfie });
      if (r.telefoneTitular) setTelTit(String(r.telefoneTitular));
      try { sessionStorage.removeItem(chaveR); } catch { /* */ }
      setFeito({ nome: nome.trim(), em: new Date().toISOString(), teste: !!r.teste, url: r.url || "",
        aguardandoTitular: !!r.aguardandoTitular, titular: r.titular || "", tokenTitular: r.tokenTitular || "" });
      window.scrollTo(0, 0);
    } catch (e: any) { setMsg(e.message); } finally { setEnviando(false); }
  }

  const casca = (filhos: any) => <div style={{ minHeight: "100vh", background: "#eef0f2", font: "15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif", color: "#1a1d21" }}>
    <div style={{ background: COR.verde, color: "#fff", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
      <img src={LOGO_URL.replace(/^https:\/\/[^/]+/, "")} alt="Aliança" style={{ height: 42 }} />
      <div><b style={{ letterSpacing: .5 }}>ALIANÇA MÓVEIS</b><div style={{ fontSize: 12.5, opacity: .85 }}>Checklist do projeto final · assinatura do cliente</div></div></div>
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "14px 12px 60px" }}>{filhos}</div>
    {doc && <VerDocumento html={doc} onFechar={() => setDoc("")} />}</div>;
  const card: any = { background: "#fff", border: "1px solid " + COR.l, borderRadius: 14, padding: "14px 16px", marginBottom: 14, boxShadow: "0 1px 3px rgba(20,28,45,.06)" };
  const ciente = (on: boolean, set: (v: boolean) => void, txt: string, desab = false) => <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "11px 12px", marginTop: 10, borderRadius: 10, cursor: desab ? "default" : "pointer", opacity: desab ? .55 : 1, background: on ? COR.okbg : "#f6f7f9", border: "1.5px solid " + (on ? "#9fc5a8" : COR.l) }}>
    <input type="checkbox" checked={on} disabled={desab} onChange={e => set(e.target.checked)} style={{ width: 24, height: 24, flex: "none", accentColor: COR.ok }} /><b style={{ fontSize: 14.5 }}>{txt}</b></label>;
  const botao = (txt: string, on: boolean, f: () => void, cor = COR.pri) => <button type="button" onClick={f} disabled={!on}
    style={{ width: "100%", padding: 15, fontSize: 16.5, fontWeight: 800, color: "#fff", background: on ? cor : "#9aa3b0", border: 0, borderRadius: 12, cursor: on ? "pointer" : "default", marginTop: 4 }}>{txt}</button>;

  // o representante assinou e já mandou o link: fecha com o que falta
  if (feito?.aguardandoTitular && enviei) return casca(<div style={{ ...card, textAlign: "center", padding: "34px 18px" }}>
    <div style={{ fontSize: 54 }}>✅</div><h2 style={{ margin: "6px 0" }}>Pronto, é só isso</h2>
    <p style={{ color: COR.s }}>Sua parte está assinada e registrada.<br />Agora é <b>{feito.titular}</b> abrir o link, autorizar a representação e assinar — aí o contrato fica completo.</p>
    <button type="button" onClick={() => setEnviei(false)}
      style={{ marginTop: 14, padding: "11px 18px", fontSize: 15, fontWeight: 700, color: COR.pri, background: "#fff", border: "1.5px solid " + COR.l, borderRadius: 12 }}>↩ Voltar e mandar o link de novo</button>
    <p style={{ fontSize: 12.5, color: COR.s, marginTop: 14 }}>O projetista também consegue reenviar o link pelo 360.</p>
  </div>);
  // o representante assinou: falta o titular da compra — mostra o link para mandar para ele
  if (feito?.aguardandoTitular) {
    const link = location.origin + "/contrato?t=" + feito.tokenTitular;
    const prim = String(feito.titular || "").trim().split(" ")[0];
    const num = telTit.replace(/\D/g, "");
    const zap = num.length >= 10 ? (num.length <= 11 ? "55" + num : num) : "";
    const texto = `Olá${prim ? ", " + prim : ""}! Aqui está o link para você assinar o contrato do seu projeto na Aliança Móveis: ${link}`;
    return casca(<div style={{ ...card, padding: "28px 18px" }}>
      <div style={{ fontSize: 50, textAlign: "center" }}>✍️</div>
      <h2 style={{ margin: "6px 0", textAlign: "center" }}>Conferência assinada</h2>
      <p style={{ color: COR.s, textAlign: "center" }}>Obrigado{feito.nome ? ", " + String(feito.nome).split(" ")[0] : ""}! Agora falta a assinatura de <b>{feito.titular}</b>, titular da compra.<br />É só mandar o link pelo WhatsApp. {prim || "O titular"} abre, autoriza a representação e assina — não precisa refazer nada.</p>

      <div style={{ marginTop: 16 }}>
        <label style={{ fontSize: 13.5, fontWeight: 700, color: COR.s }}>Celular de {prim || "quem vai assinar"}</label>
        <input value={telTit} onChange={e => setTelTit(e.target.value)} inputMode="tel" placeholder="(41) 99999-9999"
          style={{ width: "100%", boxSizing: "border-box", fontSize: 17, padding: "12px", border: "1.5px solid " + COR.l, borderRadius: 10, marginTop: 5 }} />
        <div style={{ fontSize: 12.5, color: COR.s, marginTop: 4 }}>Veio do cadastro da venda. Se não for esse, corrija aqui antes de enviar.</div>
      </div>

      <a href={zap ? "https://wa.me/" + zap + "?text=" + encodeURIComponent(texto) : "https://wa.me/?text=" + encodeURIComponent(texto)} target="_blank" rel="noopener"
        style={{ display: "block", textAlign: "center", padding: "15px 20px", fontSize: 17, fontWeight: 800, color: "#fff", background: "#1f9d55", borderRadius: 12, textDecoration: "none", marginTop: 14 }}>
        📲 Enviar pelo WhatsApp{zap ? "" : " (escolher o contato)"}</a>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 10 }}>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(link); setMsg("Link copiado"); }}
          style={{ padding: "11px 18px", fontSize: 15, fontWeight: 700, color: COR.pri, background: "#fff", border: "1.5px solid " + COR.l, borderRadius: 12 }}>📋 Copiar o link</button>
      </div>
      {msg && <div style={{ textAlign: "center", color: COR.ok, fontWeight: 700, marginTop: 10 }}>{msg}</div>}
      <button type="button" onClick={() => setEnviei(true)}
        style={{ width: "100%", padding: "13px 20px", fontSize: 16, fontWeight: 800, color: "#fff", background: COR.pri, border: 0, borderRadius: 12, marginTop: 16 }}>
        ✓ Já enviei — finalizar</button>
      <p style={{ fontSize: 12.5, color: COR.s, textAlign: "center", marginTop: 12 }}>O link vale por 3 dias. Se fechar esta tela sem enviar, o projetista reenvia pelo 360.</p>
    </div>);
  }
  if (feito) return casca(<div style={{ ...card, textAlign: "center", padding: "34px 18px" }}>
    <div style={{ fontSize: 54 }}>✅</div><h2 style={{ margin: "6px 0" }}>Contrato assinado</h2>
    <p style={{ color: COR.s }}>Obrigado{feito.nome ? ", " + String(feito.nome).split(" ")[0] : ""}! Sua assinatura foi registrada{feito.em ? " em " + new Date(feito.em).toLocaleString("pt-BR") : ""}.<br />O projetista já recebeu a confirmação. Guarde a sua via abaixo — ela fica disponível por 30 dias neste link.</p>
    <BaixarContrato token={token} />
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
    {tit && <div style={{ ...card, background: "#eef3ff", borderColor: "#c9d8f5" }}>
      <b style={{ fontSize: 16, color: COR.pri }}>Você é o titular da compra</b>
      <div style={{ fontSize: 14, marginTop: 4 }}><b>{tit.representante}</b> fez o checklist com o projetista e conferiu os materiais, o termo geral e as imagens do projeto, representando você.</div>
      <div style={{ fontSize: 14, marginTop: 6 }}>Leia o que foi conferido, <b>autorize a representação</b> e assine. O contrato só vale com as duas assinaturas.</div></div>}
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
        <p style={{ margin: 0, color: COR.s, fontSize: 14 }}>Estes são os materiais definidos no seu projeto pelo projetista. <b>Confira item por item.</b> Se algo estiver diferente do combinado, <b>não assine</b> e fale com o projetista — ele corrige e gera um contrato novo.</p>
        <div style={{ fontSize: 12.5, color: COR.s, marginTop: 8 }}>{INFO_TECNICAS.map((x, i) => <div key={i}>• {x}</div>)}</div>
      </div>
      {d.ambientes.map((a, i) => {
        const falta = termos[i] ? faltaNoTermo(termos[i]) : [];
        return <div key={i} style={{ ...card, borderColor: matOk[i] ? "#9fc5a8" : COR.l }}>
          <h3 style={{ margin: "0 0 10px" }}>Ambiente {i + 1} de {d.ambientes.length}: {a.nome}</h3>
          {a.fichaObs && <div style={{ fontSize: 13.5, background: "#fff8e6", border: "1px solid #f0d9a6", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}><b>Observações:</b> {a.fichaObs}</div>}
          {termos[i] && <TermoMaterial v={termos[i]} orig={a.termo} somenteLeitura onChange={() => { /* o cliente não altera o material */ }} />}
          {falta.length > 0 && <div style={{ marginTop: 10, color: "#8a5d00", fontSize: 13.5, fontWeight: 600 }}>Este ambiente está incompleto ({falta.join(", ")}). Peça ao projetista para completar e gerar o contrato de novo.</div>}
          {ciente(!!matOk[i], v => setMatOk(m => m.map((x, j) => j === i ? v : x)), soLeitura ? `Materiais do ambiente ${a.nome} conferidos por ${tit!.representante}` : `Conferi os materiais do ambiente ${a.nome} e estou ciente`, soLeitura || falta.length > 0)}
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
        {i === INICIO_MONTAGEM && <div style={{ margin: "6px 0 12px", padding: "8px 12px", borderRadius: 10, background: "#eef3ff", border: "1.5px solid #c9d8f5" }}>
          <b style={{ fontSize: 15.5, color: COR.pri }}>🔧 Montagem</b>
          <div style={{ fontSize: 13, color: COR.s }}>Como funciona a montagem do seu móvel.</div></div>}
        <div style={{ fontSize: 14.5 }}><b>{i + 1} - </b>{t}</div>
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", marginTop: 7, padding: "6px 14px", borderRadius: 9, cursor: "pointer", fontWeight: 800, background: geral[i] ? COR.okbg : "#f6f7f9", border: "1.5px solid " + (geral[i] ? "#9fc5a8" : COR.l) }}>
          <input type="checkbox" checked={geral[i]} disabled={soLeitura} onChange={e => setGeral(g => g.map((x, j) => j === i ? e.target.checked : x))} style={{ width: 22, height: 22, accentColor: COR.ok }} /> Sim</label>
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
        {ciente(!!imgOk[i], v => setImgOk(m => m.map((x, j) => j === i ? v : x)), soLeitura ? `Imagens do ambiente ${a.nome} conferidas por ${tit!.representante}` : a.imagens.length ? `Vi todas as imagens acima e declaro que elas representam o projeto do ambiente ${a.nome} conforme eu solicitei` : `Estou ciente do projeto do ambiente ${a.nome}`, soLeitura)}
      </div>)}
      {botao(ok3 ? "Continuar → Assinatura" : "Confirme as imagens de cada ambiente", ok3, () => setPasso(3))}
    </>}

    {passo === 3 && <>
      {alteracoes.length > 0 && <div style={{ ...card, background: "#fdf1f1", borderColor: "#f3b8b8" }}>
        <b style={{ color: COR.r }}>Você alterou o termo do material:</b>
        <div style={{ fontSize: 13.5, marginTop: 4 }}>{alteracoes.map((x, i) => <div key={i}>• {x}</div>)}</div>
        <div style={{ fontSize: 12.5, color: COR.s, marginTop: 4 }}>As alterações ficam registradas no contrato assinado.</div></div>}
      {tit && <div style={{ ...card, borderColor: autorizo ? "#9fc5a8" : COR.l }}>
        <h3 style={{ margin: "0 0 6px" }}>Autorização</h3>
        <p style={{ margin: 0, color: COR.s, fontSize: 14 }}>Confirme que você autorizou {tit.representante} a fazer o checklist no seu lugar.</p>
        {ciente(autorizo, setAutorizo, `Autorizo ${tit.representante} a me representar na assinatura do checklist`)}
      </div>}
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

/** Selfie pela câmera frontal.
 *
 *  Dois defeitos que deixavam o cliente travado aqui, relatados pelo Wagner em 28/11:
 *
 *  1) O campo de arquivo estava com display:none. Vários navegadores de celular ignoram um
 *     clique programático num campo que não está renderizado — o cliente apertava o botão e
 *     não acontecia NADA, sem erro nenhum. Agora ele fica na página, invisível mas presente.
 *
 *  2) Quem usa iPhone manda HEIC, que o <img> não abre (resolvido no blobParaJpeg).
 *
 *  E quando mesmo assim a câmera não abrir — aparelho antigo, câmera ocupada por outro app,
 *  permissão negada no sistema —, aparece a saída pela galeria em vez de silêncio. */
function Selfie({ valor, onMudar }: { valor: string; onMudar: (s: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const refGaleria = useRef<HTMLInputElement>(null);
  const [proc, setProc] = useState(false); const [erro, setErro] = useState("");
  const [mostrarGaleria, setMostrarGaleria] = useState(false);
  // invisível para o olho, mas renderizado: é o que faz o clique funcionar no celular
  const escondido: React.CSSProperties = { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" };

  const receber = async (e: any) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return; setProc(true); setErro("");
    try { onMudar(await blobParaJpeg(f, 900, 0.8)); setMostrarGaleria(false); }
    catch { setErro("Não consegui abrir essa foto. Tente tirar de novo, ou escolher uma da galeria."); setMostrarGaleria(true); }
    finally { setProc(false); }
  };

  const abrirCamera = () => {
    setErro("");
    try { ref.current?.click(); } catch { setMostrarGaleria(true); }
    // se a câmera não abrir, o cliente fica olhando para a tela sem nada acontecer:
    // depois de alguns segundos sem foto, oferecemos o outro caminho
    window.setTimeout(() => { if (!valor) setMostrarGaleria(true); }, 6000);
  };

  return <div>
    <input ref={ref} type="file" accept="image/*" capture="user" style={escondido} tabIndex={-1} onChange={receber} />
    <input ref={refGaleria} type="file" accept="image/*" style={escondido} tabIndex={-1} onChange={receber} />
    {valor ? <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
      <img src={valor} alt="" style={{ width: 120, height: 150, objectFit: "cover", borderRadius: 10, border: "1px solid " + COR.l }} />
      <button type="button" onClick={abrirCamera} style={{ background: "none", border: "1px solid " + COR.l, borderRadius: 8, padding: "8px 12px", fontSize: 14 }}>📷 Tirar outra</button></div>
      : <button type="button" onClick={abrirCamera} disabled={proc}
        style={{ width: "100%", padding: "14px", fontSize: 16, fontWeight: 700, color: COR.pri, background: "#e8f1ff", border: "1.5px solid #b8cdf0", borderRadius: 12 }}>{proc ? "Preparando a foto…" : "📷 Tirar selfie"}</button>}
    {!valor && mostrarGaleria && <button type="button" onClick={() => refGaleria.current?.click()} disabled={proc}
      style={{ width: "100%", marginTop: 8, padding: "12px", fontSize: 15, fontWeight: 600, color: COR.pri, background: "none", border: "1px solid " + COR.l, borderRadius: 12 }}>
      A câmera não abriu? Escolher uma foto do aparelho</button>}
    {erro && <div style={{ color: COR.r, marginTop: 6 }}>{erro}</div>}
  </div>;
}
