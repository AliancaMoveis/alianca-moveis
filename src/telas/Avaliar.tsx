// Pesquisa de satisfação que o cliente responde pelo link do WhatsApp (sem login).
// O banco só aceita uma resposta por link; nota de 0 a 6 avisa o pós-venda e a Gestão.
import { useEffect, useState } from "react";
import { A } from "../lib/acoes";
import { ETAPAS, type Etapa } from "../lib/qualidade";

const Estrela = ({ on }: { on: boolean }) => <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" fill={on ? "#e3a91c" : "#ffffff"} stroke={on ? "#c98a12" : "#b9c2b5"} strokeWidth="1.4" strokeLinejoin="round" /></svg>;
const corNota = (v: number) => v <= 6 ? "#c0392b" : v <= 8 ? "#c98a12" : "#1f7a44";

export default function Avaliar() {
  const token = new URLSearchParams(location.search).get("t") || "";
  const [info, setInfo] = useState<any>(undefined); const [erro, setErro] = useState("");
  const [nps, setNps] = useState<number | null>(null); const [est, setEst] = useState<number[]>([0, 0, 0]);
  const [coment, setComent] = useState(""); const [ligar, setLigar] = useState(true);
  const [enviando, setEnviando] = useState(false); const [fim, setFim] = useState<{ nps: number; google: string | null } | null>(null); const [aviso, setAviso] = useState("");
  useEffect(() => { document.title = "Pesquisa · Aliança Móveis"; if (!token) { setErro("Link incompleto"); setInfo(null); return; }
    A.avaliacaoPublica(token).then(setInfo).catch((e: any) => { setErro(e.message || "Link inválido"); setInfo(null); }); }, []);
  const et = ETAPAS[(info?.etapa || "montagem") as Etapa] || ETAPAS.montagem;
  const enviar = async () => {
    if (nps === null) { setAviso("Escolha uma nota de 0 a 10"); return; }
    if (est.some(x => !x)) { setAviso("Toque nas estrelas das 3 perguntas"); return; }
    setEnviando(true); setAviso("");
    try { const r = await A.avaliacaoResponder(token, nps, est[0], est[1], est[2], coment, ligar); setFim({ nps, google: r?.google || null }); window.scrollTo(0, 0); }
    catch (e: any) { setAviso(e.message || "Não foi possível enviar. Tente de novo."); }
    finally { setEnviando(false); }
  };
  const Topo = ({ children }: any) => <header className="av-top"><div className="av-marca"><span className="av-logo">ALIANÇA</span><b>Aliança Móveis</b></div>{children}</header>;
  if (info === undefined) return <div className="av"><Topo /><main className="av-main"><div className="av-card">Carregando…</div></main></div>;
  if (!info) return <div className="av"><Topo /><main className="av-main"><div className="av-card"><h2>Link inválido</h2><p>Este link de pesquisa não existe ou está incompleto. Se recebeu pelo WhatsApp, abra direto pela mensagem.</p></div></main></div>;
  if (fim || info.respondida) {
    const n = fim ? fim.nps : info.nps; const google = fim ? fim.google : info.google;
    return <div className="av"><Topo />
      <main className="av-main">
        <div className="av-ok"><div className="av-check"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#1f7a44" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
          <h1>Obrigado{info.cliente ? ", " + cap(info.cliente) : ""}!</h1><p>{fim ? "Sua avaliação chegou para a gerência da Aliança Móveis." : "Esta pesquisa já foi respondida. Obrigado!"}</p></div>
        {n != null && n >= 9 && google && <section className="av-card"><div className="av-tag ok">NOTA {n}</div><h2>Que bom que gostou! Pode deixar sua opinião no Google?</h2><p>Ajuda outras famílias a conhecerem a Aliança. Leva 30 segundos.</p><a className="av-bt" href={google} target="_blank" rel="noopener">Avaliar no Google</a></section>}
        {fim && n != null && n <= 6 && <section className="av-card"><div className="av-tag ruim">NOTA {n}</div><h2>Sentimos muito que não foi como esperava.</h2><p>{ligar ? "Nossa equipe de pós-venda vai te ligar em até 1 dia útil para resolver." : "Sua resposta foi registrada e a gerência vai analisar."}</p></section>}
      </main></div>;
  }
  const quando = info.servicoEm ? String(info.servicoEm).slice(8, 10) + "/" + String(info.servicoEm).slice(5, 7) : "";
  return <div className="av">
    <Topo><h1>Olá{info.cliente ? ", " + cap(info.cliente) : ""}! {et.titulo}</h1>
      <p>{info.etapa === "montagem" ? "Montagem feita" + (quando ? " em " + quando : "") + (info.responsavel ? " por " + cap(info.responsavel) : "") + ". " : ""}Leva menos de 1 minuto e ajuda a gente a melhorar.</p></Topo>
    <main className="av-main">
      <section className="av-card"><h2>De 0 a 10, quanto você indicaria a Aliança para um amigo?</h2>
        <div className="av-notas">{Array.from({ length: 11 }, (_, v) => <button key={v} type="button" aria-label={"Nota " + v} aria-pressed={nps === v} onClick={() => setNps(v)}
          style={nps === v ? { background: corNota(v), borderColor: corNota(v), color: "#fff" } : undefined}>{v}</button>)}</div>
        <div className="av-escala"><span>0 · nada provável</span><span>10 · com certeza</span></div></section>
      <section className="av-card"><h2>Sobre {info.etapa === "montagem" ? "a montagem" : info.etapa === "loja" ? "o atendimento" : info.etapa === "medicao" ? "a medição" : info.etapa === "checklist" ? "o checklist" : "o pós-venda"}</h2>
        {et.perguntas.map((q, i) => <div key={i} className="av-q"><div>{q}</div>
          <div className="av-est">{[1, 2, 3, 4, 5].map(k => <button key={k} type="button" aria-label={k + (k === 1 ? " estrela" : " estrelas")} onClick={() => setEst(est.map((x, j) => j === i ? k : x))}><Estrela on={k <= est[i]} /></button>)}</div></div>)}</section>
      <section className="av-card"><label htmlFor="av-com" className="av-lbl">Quer contar algo para a gente? <small>(opcional)</small></label>
        <textarea id="av-com" rows={4} value={coment} onChange={e => setComent(e.target.value)} maxLength={2000} placeholder="Ex.: o montador foi muito cuidadoso, mas faltou um puxador" />
        <label className="av-chk"><input type="checkbox" checked={ligar} onChange={e => setLigar(e.target.checked)} /> Pode me ligar se precisar resolver algo</label></section>
      {aviso && <div className="av-aviso">{aviso}</div>}
      <button type="button" className="av-bt" disabled={enviando} onClick={enviar}>{enviando ? "Enviando…" : "Enviar avaliação"}</button>
      <p className="av-rod">Suas respostas vão direto para a gerência da Aliança Móveis.</p>
    </main></div>;
}
const cap = (s: string) => { const t = String(s || "").trim().split(/\s+/)[0] || ""; return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : ""; };
