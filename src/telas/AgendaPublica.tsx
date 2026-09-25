// Agenda da loja em tela aberta (sem login) — /loja?k=<link secreto>
// Só leitura: horário, cliente, vendedor, consultor, origem e situação. Atualiza a cada minuto.
import { useEffect, useState } from "react";
import { A } from "../lib/acoes";

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const iso = (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const soNome = (n: string) => (n || "").replace(/^(Consultora?|Vendedora?|Projetista|Suporte)\s+—\s+/, "");
// situação resumida para quem está na loja
const SIT: Record<string, [string, string]> = {
  agendado_loja: ["Aguardando", "agu"], com_vendedor: ["Com vendedor", "com"], orcamento: ["Orçamento", "atd"], sem_resposta: ["Em atendimento", "atd"], reagendado: ["Reagendado", "atd"],
  vendido: ["Vendido", "ven"], vendido_promissoria: ["Vendido", "ven"], vendido_revisao: ["Vendido", "ven"], nao_compareceu: ["Não compareceu", "nao"], reprovado: ["Não fechou", "nao"], venda_cancelada: ["Não fechou", "nao"],
};

export default function AgendaPublica() {
  const token = new URLSearchParams(location.search).get("k") || "";
  const [off, setOff] = useState(0);
  const [agora, setAgora] = useState(new Date());
  const [dados, setDados] = useState<any[] | null>(null);
  const [erro, setErro] = useState("");
  const [atualizado, setAtualizado] = useState<Date | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; t: string } | null>(null);
  const [enviando, setEnviando] = useState("");
  const [escolher, setEscolher] = useState<any>(null);   // cliente sem vendedor: quem assume o atendimento
  const [sel, setSel] = useState("");                     // id do vendedor ou "outro"
  const [outro, setOutro] = useState("");
  const [vendedores, setVendedores] = useState<any[]>([]);
  useEffect(() => { if (token) A.agendaPublicaVendedores(token).then(setVendedores).catch(() => setVendedores([])); }, []);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(t); }, [aviso]);
  const dia = (() => { const d = new Date(); d.setDate(d.getDate() + off); return d; })();
  const diaIso = iso(dia);
  useEffect(() => { document.title = "Agenda da loja · Aliança Móveis"; const t = setInterval(() => setAgora(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    let vivo = true;
    const carregar = () => A.agendaPublicaDia(token, diaIso).then(r => { if (vivo) { setDados(r); setErro(""); setAtualizado(new Date()); } })
      .catch((e: any) => { if (vivo) { setErro(e.message || "Não foi possível carregar"); setDados(d => d || []); } });
    setDados(null); carregar();
    const t = setInterval(carregar, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, [diaIso]);
  // volta sozinho para "hoje" depois de 3 minutos em outro dia
  useEffect(() => { if (!off) return; const t = setTimeout(() => setOff(0), 180000); return () => clearTimeout(t); }, [off]);

  if (!token) return <div className="ap-erro"><img src="/logo.png" alt="" /><b>Link incompleto</b><span>Peça à Gestão o link da agenda da loja.</span></div>;
  if (erro && (!dados || !dados.length) && /inválido|desligado/i.test(erro)) return <div className="ap-erro"><img src="/logo.png" alt="" /><b>Agenda indisponível</b><span>Este link foi trocado ou desligado. Peça à Gestão o link atual.</span></div>;

  const l = dados || [];
  const hhmm = agora.getHours() * 60 + agora.getMinutes();
  const min = (h: string) => { const [a, b] = (h || "0:0").split(":").map(Number); return a * 60 + b; };
  const ehHoje = off === 0;
  const n = { total: l.length, fila: l.filter(x => !x.vendedor && !["vendido", "vendido_promissoria", "vendido_revisao", "nao_compareceu"].includes(x.situacao)).length,
    atd: l.filter(x => ["com_vendedor", "orcamento", "sem_resposta", "reagendado"].includes(x.situacao)).length, ven: l.filter(x => (SIT[x.situacao] || [])[1] === "ven").length,
    mkt: l.filter(x => x.origem === "marketing").length };
  // "Cliente chegou": avisa o vendedor no celular (sem vendedor, avisa a coordenação). Repetir só depois de 3 min.
  const ESPERA = 180;
  const falta = (x: any) => x.avisado_em ? Math.max(0, ESPERA - Math.floor((agora.getTime() - new Date(x.avisado_em).getTime()) / 1000)) : 0;
  const avisar = async (x: any) => {
    setEnviando(x.id);
    try {
      const r: any = await A.agendaPublicaAvisar(token, x.id);
      setDados(d => (d || []).map(y => y.id === x.id ? { ...y, avisado_em: new Date().toISOString(), avisos: (y.avisos || 0) + 1 } : y));
      setAviso({ ok: true, t: r && r.vendedor && x.vendedor ? "✓ " + soNome(x.vendedor) + " foi avisado(a) no celular: " + x.cliente + " chegou." : "✓ Cliente sem vendedor — a coordenação foi avisada no celular." });
    } catch (e: any) { setAviso({ ok: false, t: e.message || "Não foi possível avisar" }); }
    finally { setEnviando(""); }
  };
  const abrirAssumir = (x: any) => { setSel(""); setOutro(""); setEscolher(x); };
  const assumir = async () => {
    const x = escolher; if (!x) return;
    if (!sel) { setAviso({ ok: false, t: "Selecione o seu nome" }); return; }
    const ehOutro = sel === "outro", nomeOutro = outro.trim();
    if (ehOutro && nomeOutro.length < 2) { setAviso({ ok: false, t: "Escreva o seu nome" }); return; }
    const v = vendedores.find(y => y.id === sel);
    setEnviando(x.id);
    try {
      await A.agendaPublicaAssumir(token, x.id, ehOutro ? null : sel, ehOutro ? nomeOutro : "");
      const nome = ehOutro ? nomeOutro : v ? v.nome : "";
      setDados(d => (d || []).map(y => y.id === x.id ? { ...y, vendedor: nome, assumido: true, externo: ehOutro, situacao: ehOutro ? y.situacao : "com_vendedor", pedido_vendedor: "" } : y));
      setAviso({ ok: true, t: "✓ " + soNome(nome) + " assumiu o atendimento de " + x.cliente + "." });
      setEscolher(null);
    } catch (e: any) { setAviso({ ok: false, t: e.message || "Não foi possível assumir" }); }
    finally { setEnviando(""); }
  };
  const podeAvisar = (x: any) => ehHoje && !["vendido", "vendido_promissoria", "vendido_revisao", "nao_compareceu", "reprovado", "venda_cancelada"].includes(x.situacao);
  const proximoIdx = ehHoje ? l.findIndex(x => min(x.hora) >= hhmm - 15) : -1;
  return (
    <div className="ap">
      <header className="ap-top">
        <img src="/logo.png" alt="" />
        <div className="ap-tit"><b>Agenda da loja</b><span>Aliança Móveis</span></div>
        <div className="ap-relogio"><b>{String(agora.getHours()).padStart(2, "0")}:{String(agora.getMinutes()).padStart(2, "0")}</b><span>{DIAS[agora.getDay()].replace(/^./, c => c.toUpperCase())}, {agora.getDate()} de {MESES[agora.getMonth()]}</span></div>
      </header>
      <nav className="ap-dias">
        <button disabled={off <= -1} onClick={() => setOff(off - 1)}>‹</button>
        {[0, 1, 2].map(o => { const d = new Date(); d.setDate(d.getDate() + o); return <button key={o} className={off === o ? "on" : ""} onClick={() => setOff(o)}>{o === 0 ? "Hoje" : o === 1 ? "Amanhã" : DIAS[d.getDay()].split("-")[0]}<small>{String(d.getDate()).padStart(2, "0")}/{String(d.getMonth() + 1).padStart(2, "0")}</small></button>; })}
        {(off < 0 || off > 2) && <button className="on">{DIAS[dia.getDay()].split("-")[0]}<small>{String(dia.getDate()).padStart(2, "0")}/{String(dia.getMonth() + 1).padStart(2, "0")}</small></button>}
        <button disabled={off >= 7} onClick={() => setOff(off + 1)}>›</button>
      </nav>
      <section className="ap-resumo">
        <div><b>{n.total}</b><span>clientes {ehHoje ? "hoje" : "no dia"}</span></div>
        <div className="fila"><b>{n.fila}</b><span>sem vendedor</span></div>
        <div className="atd"><b>{n.atd}</b><span>em atendimento</span></div>
        <div className="ven"><b>{n.ven}</b><span>vendidos</span></div>
        <div className="mix"><span><i className="mk"></i>{n.mkt} marketing</span><span><i className="ex"></i>{n.total - n.mkt} consultor externo</span></div>
      </section>
      <div className="ap-lista">
        {dados === null ? <div className="ap-vazio">Carregando…</div> : !l.length ? <div className="ap-vazio">Nenhum cliente agendado {ehHoje ? "para hoje" : "neste dia"}.</div> :
          l.map((x, i) => {
            const [sit, cls] = SIT[x.situacao] || ["Agendado", "agu"];
            const passou = ehHoje && min(x.hora) < hhmm - 30 && cls === "agu" && !x.vendedor;
            return (
              <div key={i} className={"ap-item " + cls + (i === proximoIdx ? " agora" : "") + (passou ? " atrasado" : "")}>
                <div className="ap-hora">{x.hora}{i === proximoIdx && <small>próximo</small>}</div>
                <div className={"ap-origem " + x.origem}>{x.origem === "marketing" ? "Marketing" : "Externo"}</div>
                <div className="ap-cli"><b>{x.cliente}</b>
                  <span>{x.consultor ? "Consultor: " + soNome(x.consultor) : "Agendado pelo marketing"}{x.quer_projeto ? " · 📐 quer projeto" : ""}</span></div>
                <div className="ap-vend">{x.vendedor ? <><small>{x.externo ? "Freelancer" : "Vendedor"}</small><b>{soNome(x.vendedor)}</b>{x.assumido ? <span className="ap-assumido">{x.externo ? "sem cadastro · assumiu na fila" : "assumiu na fila"}</span> : null}</>
                  : x.pedido_vendedor ? <><small>Aguardando aprovação</small><b className="pedido">{soNome(x.pedido_vendedor)}</b></>
                  : cls === "agu" ? <b className="semv">Sem vendedor · fila</b> : <b>—</b>}</div>
                <div className={"ap-sit " + cls}>{passou ? "Atrasado" : sit}</div>
                <div className="ap-acao">{podeAvisar(x) && x.externo ? <small>freelancer — sem aviso no celular</small>
                  : podeAvisar(x) && !x.vendedor ? <><button className="ap-iniciar" disabled={enviando === x.id} onClick={() => abrirAssumir(x)}>✋ Assumir atendimento</button><small>{x.pedido_vendedor ? soNome(x.pedido_vendedor) + " pediu pelo sistema" : "selecione seu nome"}</small></>
                  : podeAvisar(x) ? (() => { const f = falta(x); const hr = x.avisado_em ? new Date(x.avisado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
                  return <>
                    <button className={"ap-chegou" + (x.avisos ? " feito" : "")} disabled={!!f || enviando === x.id} onClick={() => avisar(x)}>
                      {enviando === x.id ? "Avisando…" : f ? "Avisar de novo em " + Math.floor(f / 60) + ":" + String(f % 60).padStart(2, "0") : x.avisos ? "🔔 Avisar de novo" : "🔔 Cliente chegou"}</button>
                    {x.avisos ? <small>{x.vendedor ? "Vendedor avisado" : "Coordenação avisada"} às {hr}{x.avisos > 1 ? " · " + x.avisos + "x" : ""}</small> : <small>{x.vendedor ? "avisa " + soNome(x.vendedor) : "avisa a coordenação"}</small>}
                  </>; })() : null}</div>
              </div>);
          })}
      </div>
      {escolher && <div className="ap-modal" onClick={() => setEscolher(null)}>
        <div className="ap-modal-c" onClick={e => e.stopPropagation()}>
          <b>Assumir o atendimento de {escolher.cliente}</b>
          <span>O cliente fica no seu nome, marcado como <b>assumido na fila</b>. Você se responsabiliza pelo atendimento como se ele tivesse sido direcionado a você.</span>
          <label className="ap-campo">Seu nome
            <select value={sel} onChange={e => setSel(e.target.value)} autoFocus>
              <option value="">Selecione…</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{soNome(v.nome)}</option>)}
              <option value="outro">Outro (não estou na lista)</option>
            </select></label>
          {sel === "outro" && <label className="ap-campo">Escreva seu nome completo<input value={outro} onChange={e => setOutro(e.target.value)} placeholder="Ex.: Pedro Almeida (freelancer)" autoFocus /></label>}
          <button className="ap-confirmar" disabled={enviando === escolher.id || !sel || (sel === "outro" && outro.trim().length < 2)} onClick={assumir}>{enviando === escolher.id ? "Assumindo…" : "✋ Assumir atendimento"}</button>
          <button className="ap-cancelar" onClick={() => setEscolher(null)}>Cancelar</button>
        </div></div>}
      {aviso && <div className={"ap-toast" + (aviso.ok ? "" : " erro")} onClick={() => setAviso(null)}>{aviso.t}</div>}
      <footer className="ap-rod">{erro ? <span style={{ color: "#c24a4a" }}>Sem conexão — tentando de novo… </span> : null}Atualizado às {atualizado ? atualizado.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"} · atualiza sozinho a cada minuto</footer>
    </div>
  );
}
