// Agenda da loja em tela aberta (sem login) — /loja?k=<link secreto>
import { fmtTel } from "../lib/baseClientes";
// Só leitura: horário, cliente, vendedor, consultor, origem e situação. Atualiza a cada minuto.
import { useEffect, useState } from "react";
import { A } from "../lib/acoes";

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const fmtDia = (d: string) => { const x = new Date(d + "T12:00"); return DIAS[x.getDay()].split("-")[0] + " " + String(x.getDate()).padStart(2, "0") + "/" + String(x.getMonth() + 1).padStart(2, "0"); };
const iso = (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const soNome = (n: string) => (n || "").replace(/^(Consultora?|Vendedora?|Projetista|Suporte)\s+—\s+/, "");
// situação resumida para quem está na loja
// o banco já devolve a situação resumida (nunca "vendido"): sem_vendedor, com_vendedor, em_atendimento, finalizado, reagendado, nao_compareceu
const SIT: Record<string, [string, string]> = {
  sem_vendedor: ["Aguardando", "agu"], com_vendedor: ["Com vendedor", "com"], em_atendimento: ["Em atendimento", "atd"],
  finalizado: ["Atendimento finalizado", "fin"], reagendado: ["Reagendado", "nao"], nao_compareceu: ["Não compareceu", "nao"],
};
const FILTROS: [string, string][] = [["todos", "clientes"], ["sem_vendedor", "sem vendedor"], ["com_vendedor", "com vendedor"], ["em_atendimento", "em atendimento"], ["finalizado", "atendimento finalizado"]];

export default function AgendaPublica() {
  const token = new URLSearchParams(location.search).get("k") || "";
  const [off, setOff] = useState(0);
  const [filtro, setFiltro] = useState("todos");
  const [agora, setAgora] = useState(new Date());
  const [dados, setDados] = useState<any[] | null>(null);
  const [erro, setErro] = useState("");
  const [atualizado, setAtualizado] = useState<Date | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; t: string } | null>(null);
  const [enviando, setEnviando] = useState("");
  const [escolher, setEscolher] = useState<any>(null);   // cliente sem vendedor: quem assume o atendimento
  const [sel, setSel] = useState("");                     // id do vendedor ou "outro"
  const [outro, setOutro] = useState("");
  const [senha, setSenha] = useState("");                 // senha do vendedor (assumir com responsabilidade)
  const [busca, setBusca] = useState("");                 // busca de cliente em qualquer dia
  const [achados, setAchados] = useState<any[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [qtd, setQtd] = useState<Record<string, number>>({});   // nº de imagens/arquivos por cliente
  const [ver, setVer] = useState<any>(null);                     // "Ver imagens": { x, sel, passo: nome | confirmar | ok, programado, arquivos }
  const [zoom, setZoom] = useState("");
  useEffect(() => { if (token) A.agendaPublicaVendedores(token).then(setVendedores).catch(() => setVendedores([])); }, []);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(t); }, [aviso]);
  const dia = (() => { const d = new Date(); d.setDate(d.getDate() + off); return d; })();
  const diaIso = iso(dia);
  useEffect(() => { document.title = "Agenda da loja · Aliança Móveis"; const t = setInterval(() => setAgora(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    let vivo = true;
    const carregar = () => { A.agendaPublicaAnexosQtd(token, diaIso).then(q => { if (vivo) setQtd(q || {}); }).catch(() => null); return A.agendaPublicaDia(token, diaIso).then(r => { if (vivo) { setDados(r); setErro(""); setAtualizado(new Date()); } })
      .catch((e: any) => { if (vivo) { setErro(e.message || "Não foi possível carregar"); setDados(d => d || []); } }); };
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
  const cont = (k: string) => k === "todos" ? l.length : l.filter(x => x.situacao === k).length;
  const mkt = l.filter(x => x.origem === "marketing").length;
  // busca na hora: ao digitar, a lista do dia mostra só quem combina (nome, telefone, consultor, vendedor)
  const sem = (t: string) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const qb = sem(busca.trim()), qd = busca.replace(/\D/g, "");
  const casa = (x: any) => !qb || sem(x.cliente).includes(qb) || (qd.length >= 3 && String(x.telefone || "").replace(/\D/g, "").includes(qd)) || sem(x.consultor).includes(qb) || sem(x.vendedor).includes(qb);
  const lv = (filtro === "todos" || qb ? l : l.filter(x => x.situacao === filtro)).filter(casa);
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
  const abrirAssumir = (x: any, troca = false) => { setSel(""); setOutro(""); setSenha(""); setEscolher({ ...x, _troca: troca }); };
  const assumir = async () => {
    const x = escolher; if (!x) return;
    if (!sel) { setAviso({ ok: false, t: "Selecione o seu nome" }); return; }
    const ehOutro = sel === "outro", nomeOutro = outro.trim();
    if (ehOutro && nomeOutro.length < 2) { setAviso({ ok: false, t: "Escreva o seu nome" }); return; }
    if (!ehOutro && !senha) { setAviso({ ok: false, t: "Digite a sua senha do sistema" }); return; }
    const v = vendedores.find(y => y.id === sel);
    setEnviando(x.id);
    try {
      await A.agendaPublicaAssumir2(token, x.id, ehOutro ? null : sel, ehOutro ? "" : senha, ehOutro ? nomeOutro : "");
      const nome = ehOutro ? nomeOutro : v ? v.nome : "";
      setDados(d => (d || []).map(y => y.id === x.id ? { ...y, vendedor: nome, assumido: true, externo: ehOutro, situacao: ehOutro ? y.situacao : "com_vendedor", pedido_vendedor: "" } : y));
      setAviso({ ok: true, t: "✓ " + soNome(nome) + " assumiu o atendimento de " + x.cliente + (x._troca ? " (" + soNome(x.vendedor) + " não apareceu)." : ".") });
      setEscolher(null); setSenha("");
    } catch (e: any) { setAviso({ ok: false, t: e.message || "Não foi possível assumir" }); }
    finally { setEnviando(""); }
  };
  const abrirVer = (x: any) => { const v = vendedores.find(y => soNome(y.nome) === soNome(x.vendedor || "")); setSenha(""); setVer({ x, sel: v ? v.id : "", passo: "nome" }); };
  const verImagens = async (assumir: boolean) => {
    const v = ver; if (!v || !v.sel) { setAviso({ ok: false, t: "Selecione o seu nome" }); return; }
    setEnviando(v.x.id);
    try {
      if (assumir && !senha) { setAviso({ ok: false, t: "Digite a sua senha do sistema" }); return; }
      const r = await A.agendaPublicaImagens(token, v.x.id, v.sel, assumir, assumir ? senha : "");
      if (r && r.confirmar) { setVer({ ...v, passo: "confirmar", programado: r.programado || "" }); return; }
      setVer({ ...v, passo: "ok", arquivos: r.arquivos || [] }); setSenha("");
      if (r.trocou) {
        setDados(d => (d || []).map(y => y.id === v.x.id ? { ...y, vendedor: r.nome, situacao: y.situacao === "sem_vendedor" ? "com_vendedor" : y.situacao, pedido_vendedor: "" } : y));
        setAviso({ ok: true, t: "✓ " + soNome(r.nome) + " agora é o projetista de " + v.x.cliente + "." });
      }
    } catch (e: any) { setAviso({ ok: false, t: e.message || "Não foi possível abrir as imagens" }); }
    finally { setEnviando(""); }
  };
  const buscar = async (e?: any) => {
    if (e) e.preventDefault();
    const q = busca.trim(); if (q.length < 3) { setAviso({ ok: false, t: "Digite pelo menos 3 letras ou números" }); return; }
    setBuscando(true);
    try { setAchados(await A.agendaPublicaBuscar(token, q)); } catch (er: any) { setAviso({ ok: false, t: er.message || "Não foi possível buscar" }); }
    finally { setBuscando(false); }
  };
  const offDe = (d: string) => { const a = new Date(); a.setHours(12, 0, 0, 0); const b = new Date(d + "T12:00"); return Math.round((b.getTime() - a.getTime()) / 86400000); };
  // vendedor chamado 2x e não apareceu (3 min depois da 2ª chamada): outro vendedor pode assumir com a senha
  const podeTrocar = (x: any) => ehHoje && x.vendedor && !x.externo && x.situacao === "com_vendedor" && (x.avisos || 0) >= 2 && falta(x) === 0;
  const podeAvisar = (x: any) => ehHoje && ["sem_vendedor", "com_vendedor", "em_atendimento"].includes(x.situacao);
  const proximoIdx = ehHoje ? lv.findIndex(x => min(x.hora) >= hhmm - 15 && podeAvisar(x)) : -1;
  return (
    <div className="ap">
      <header className="ap-top">
        <img src="/logo.png" alt="" />
        <div className="ap-tit"><b>Agenda da loja</b><span>Aliança Móveis</span></div>
        <div className="ap-relogio"><b>{String(agora.getHours()).padStart(2, "0")}:{String(agora.getMinutes()).padStart(2, "0")}</b><span>{DIAS[agora.getDay()].replace(/^./, c => c.toUpperCase())}, {agora.getDate()} de {MESES[agora.getMonth()]}</span></div>
      </header>
      <form className="ap-busca" onSubmit={buscar}>
        <input value={busca} onChange={e => { setBusca(e.target.value); setAchados(null); }} placeholder="🔎 Digite o nome ou telefone do cliente — aparece na hora aqui embaixo" autoComplete="off" />
        {busca && <button type="button" className="ap-limpar" onClick={() => { setBusca(""); setAchados(null); }}>✕ Limpar</button>}
        <button type="submit" disabled={buscando}>{buscando ? "Buscando…" : "Buscar em outros dias"}</button>
      </form>
      <nav className="ap-dias">
        <button disabled={off <= -1} onClick={() => setOff(off - 1)}>‹</button>
        {[0, 1, 2].map(o => { const d = new Date(); d.setDate(d.getDate() + o); return <button key={o} className={off === o ? "on" : ""} onClick={() => setOff(o)}>{o === 0 ? "Hoje" : o === 1 ? "Amanhã" : DIAS[d.getDay()].split("-")[0]}<small>{String(d.getDate()).padStart(2, "0")}/{String(d.getMonth() + 1).padStart(2, "0")}</small></button>; })}
        {(off < 0 || off > 2) && <button className="on">{DIAS[dia.getDay()].split("-")[0]}<small>{String(dia.getDate()).padStart(2, "0")}/{String(dia.getMonth() + 1).padStart(2, "0")}</small></button>}
        <button disabled={off >= 7} onClick={() => setOff(off + 1)}>›</button>
      </nav>
      <section className="ap-resumo">
        {FILTROS.map(([k, t]) => <button key={k} className={"f-" + k + (filtro === k ? " on" : "")} onClick={() => setFiltro(filtro === k && k !== "todos" ? "todos" : k)}><b>{cont(k)}</b><span>{k === "todos" ? (ehHoje ? "clientes hoje" : "clientes no dia") : t}</span></button>)}
        <div className="mix"><span><i className="mk"></i>{mkt} marketing</span><span><i className="ex"></i>{l.length - mkt} consultor externo</span></div>
      </section>
      <div className="ap-lista">
        {qb && dados !== null && <div className="ap-filtrando">🔎 <b>{lv.length}</b> cliente{lv.length === 1 ? "" : "s"} {ehHoje ? "de hoje" : "deste dia"} com “{busca.trim()}”{!lv.length ? <> — <button className="ap-link" onClick={() => buscar()}>procurar em outros dias</button></> : null}</div>}
        {dados === null ? <div className="ap-vazio">Carregando…</div> : !lv.length ? (qb ? null : <div className="ap-vazio">{l.length ? "Nenhum cliente nesta situação." : "Nenhum cliente agendado " + (ehHoje ? "para hoje" : "neste dia") + "."}</div>) :
          lv.map((x, i) => {
            const [sit, cls] = SIT[x.situacao] || ["Aguardando", "agu"];
            const passou = ehHoje && min(x.hora) < hhmm - 30 && cls === "agu" && !x.vendedor;
            return (
              <div key={i} className={"ap-item " + cls + (i === proximoIdx && !qb ? " agora" : "") + (passou ? " atrasado" : "") + (qb && lv.length === 1 ? " achado" : "")}>
                <div className="ap-hora">{x.hora}{i === proximoIdx && !qb && <small>próximo</small>}</div>
                <div className={"ap-origem " + x.origem}>{x.origem === "marketing" ? "Marketing" : "Externo"}</div>
                <div className="ap-cli"><b>{x.cliente}</b>
                  <span>{x.consultor ? "Consultor: " + soNome(x.consultor) : "Agendado pelo marketing"}{x.telefone ? " · 📞 " + fmtTel(x.telefone) : ""}{x.quer_projeto ? " · 📐 quer projeto" : ""}</span>
                  {x.obs ? <span className="ap-obs">📝 {x.obs}</span> : null}
                  <button className="ap-ver" disabled={!qtd[x.id]} title={qtd[x.id] ? "" : x.origem === "marketing" ? "Nenhuma imagem anexada" : "As imagens deste cliente estão no Minha Visita"} onClick={() => qtd[x.id] && abrirVer(x)}>🖼 {qtd[x.id] ? "Ver imagens (" + qtd[x.id] + ")" : x.origem === "marketing" ? "Sem imagens" : "Imagens no Minha Visita"}</button></div>
                <div className="ap-vend">{x.vendedor ? <><small>{x.externo ? "Freelancer" : "Vendedor"}</small><b>{soNome(x.vendedor)}</b>{x.assumido ? <span className="ap-assumido">{x.externo ? "sem cadastro · assumiu na fila" : "assumiu na fila"}</span> : null}</>
                  : x.pedido_vendedor ? <><small>Aguardando aprovação</small><b className="pedido">{soNome(x.pedido_vendedor)}</b></>
                  : x.situacao === "sem_vendedor" ? <b className="semv">Sem vendedor · fila</b> : <b>—</b>}</div>
                <div className={"ap-sit " + cls}>{passou ? "Atrasado" : sit}</div>
                <div className="ap-acao">{podeAvisar(x) && x.externo ? <small>freelancer — sem aviso no celular</small>
                  : podeAvisar(x) && !x.vendedor ? <><button className="ap-iniciar" disabled={enviando === x.id} onClick={() => abrirAssumir(x)}>✋ Assumir atendimento</button><small>{x.pedido_vendedor ? soNome(x.pedido_vendedor) + " pediu pelo sistema" : "selecione seu nome"}</small></>
                  : podeAvisar(x) && x.em_atendimento ? <><span className="ap-ematd">🟢 Em atendimento</span><small>desde {new Date(x.em_atendimento).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small></>
                  : podeAvisar(x) ? (() => { const f = falta(x); const hr = x.avisado_em ? new Date(x.avisado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
                  return <>
                    <button className={"ap-chegou" + (x.avisos ? " feito" : "")} disabled={!!f || enviando === x.id} onClick={() => avisar(x)}>
                      {enviando === x.id ? "Avisando…" : f ? "Avisar de novo em " + Math.floor(f / 60) + ":" + String(f % 60).padStart(2, "0") : x.avisos ? "🔔 Avisar de novo" : "🔔 Cliente chegou"}</button>
                    {x.avisos ? <small>{x.vendedor ? "Vendedor avisado" : "Coordenação avisada"} às {hr}{x.avisos > 1 ? " · " + x.avisos + "x" : ""}</small> : <small>{x.vendedor ? "avisa " + soNome(x.vendedor) : "avisa a coordenação"}</small>}
                    {podeTrocar(x) && <button className="ap-iniciar troca" disabled={enviando === x.id} onClick={() => abrirAssumir(x, true)}>✋ Não veio — outro assume</button>}
                  </>; })() : null}</div>
              </div>);
          })}
      </div>
      {escolher && <div className="ap-modal" onClick={() => setEscolher(null)}>
        <div className="ap-modal-c" onClick={e => e.stopPropagation()}>
          <b>Assumir o atendimento de {escolher.cliente}</b>
          <span>{escolher._troca ? <><b>{soNome(escolher.vendedor)}</b> foi chamado(a) {escolher.avisos}x e não apareceu. O cliente passa para o seu nome e {soNome(escolher.vendedor)} é avisado(a).</> : <>O cliente fica no seu nome, marcado como <b>assumido na fila</b>.</>} Você se responsabiliza pelo atendimento — confirme com a <b>sua senha do sistema</b>.</span>
          <label className="ap-campo">Seu nome
            <select value={sel} onChange={e => setSel(e.target.value)} autoFocus>
              <option value="">Selecione…</option>
              {vendedores.filter(v => !escolher._troca || soNome(v.nome) !== soNome(escolher.vendedor)).map(v => <option key={v.id} value={v.id}>{soNome(v.nome)}</option>)}
              {!escolher._troca && <option value="outro">Outro (não estou na lista)</option>}
            </select></label>
          {sel === "outro" && <label className="ap-campo">Escreva seu nome completo<input value={outro} onChange={e => setOutro(e.target.value)} placeholder="Ex.: Pedro Almeida (freelancer)" autoFocus /></label>}
          {sel && sel !== "outro" && <label className="ap-campo">Sua senha do sistema<input type="password" autoComplete="off" value={senha} onChange={e => setSenha(e.target.value)} onKeyDown={e => { if (e.key === "Enter") assumir(); }} placeholder="a mesma do app" autoFocus /></label>}
          <button className="ap-confirmar" disabled={enviando === escolher.id || !sel || (sel === "outro" ? outro.trim().length < 2 : !senha)} onClick={assumir}>{enviando === escolher.id ? "Assumindo…" : "✋ Assumir atendimento"}</button>
          <button className="ap-cancelar" onClick={() => { setEscolher(null); setSenha(""); }}>Cancelar</button>
        </div></div>}
      {ver && <div className="ap-modal" onClick={() => setVer(null)}>
        <div className={"ap-modal-c" + (ver.passo === "ok" ? " ap-galeria" : "")} onClick={e => e.stopPropagation()}>
          {ver.passo === "nome" && <>
            <b>Imagens de {ver.x.cliente}</b>
            <span>Confirme quem vai fazer o projeto. {ver.x.vendedor ? <>Projetista programado: <b>{soNome(ver.x.vendedor)}</b>.</> : "Este cliente ainda está sem projetista."}</span>
            <label className="ap-campo">Seu nome
              <select value={ver.sel} onChange={e => setVer({ ...ver, sel: e.target.value })} autoFocus>
                <option value="">Selecione…</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{soNome(v.nome)}</option>)}
              </select></label>
            <button className="ap-confirmar" disabled={!ver.sel || enviando === ver.x.id} onClick={() => verImagens(false)}>{enviando === ver.x.id ? "Abrindo…" : "🖼 Ver imagens"}</button>
            <button className="ap-cancelar" onClick={() => setVer(null)}>Cancelar</button>
          </>}
          {ver.passo === "confirmar" && <>
            <b>Você vai assumir este projeto?</b>
            <span>{ver.programado ? <>O projetista programado para <b>{ver.x.cliente}</b> é <b>{soNome(ver.programado)}</b>.</> : <><b>{ver.x.cliente}</b> está sem projetista.</>} Se você abrir as imagens, <b>o projeto passa para o seu nome</b>{ver.programado ? " e " + soNome(ver.programado) + " e a coordenação são avisados" : " e a coordenação é avisada"}.</span>
            <label className="ap-campo">Sua senha do sistema<input type="password" autoComplete="off" value={senha} onChange={e => setSenha(e.target.value)} onKeyDown={e => { if (e.key === "Enter") verImagens(true); }} placeholder="a mesma do app" autoFocus /></label>
            <button className="ap-confirmar" disabled={enviando === ver.x.id || !senha} onClick={() => verImagens(true)}>{enviando === ver.x.id ? "Assumindo…" : "✋ Sim, vou assumir o projeto"}</button>
            <button className="ap-cancelar" onClick={() => setVer({ ...ver, passo: "nome" })}>Voltar</button>
          </>}
          {ver.passo === "ok" && <>
            <b>Imagens de {ver.x.cliente}</b>
            <span>Links válidos por 10 minutos. Toque numa imagem para ampliar.</span>
            <div className="ap-imgs">
              {(ver.arquivos || []).filter((a: any) => a.tipo === "img").map((a: any, i: number) => <img key={i} src={a.url} alt={a.nome || ""} onClick={() => setZoom(a.url)} />)}
            </div>
            {(ver.arquivos || []).filter((a: any) => a.tipo !== "img").map((a: any, i: number) => <a key={i} className="ap-arq" href={a.url} target="_blank" rel="noopener">{a.tipo === "pdf" ? "📄" : a.tipo === "video" ? "🎬" : "🔗"} {a.nome || (a.tipo === "pdf" ? "Planta (PDF)" : a.tipo === "video" ? "Vídeo" : "Link")}</a>)}
            {!(ver.arquivos || []).length && <span>Nenhuma imagem anexada.</span>}
            <button className="ap-cancelar" onClick={() => setVer(null)}>Fechar</button>
          </>}
        </div></div>}
      {achados && <div className="ap-modal" onClick={() => setAchados(null)}>
        <div className="ap-modal-c ap-achados" onClick={e => e.stopPropagation()}>
          <b>Busca: “{busca.trim()}”</b>
          {!achados.length ? <span>Nenhum cliente encontrado na agenda (90 dias para trás e para frente).</span> :
            achados.map((a: any) => { const o = offDe(a.dia); const [sit] = SIT[a.situacao] || ["Aguardando"]; return (
              <div key={a.id} className="ap-achado">
                <div className="q"><b>{fmtDia(a.dia)}</b><span>{a.hora}</span></div>
                <div className="c"><b>{a.cliente}</b><span>{a.telefone ? "📞 " + fmtTel(a.telefone) + " · " : ""}{a.consultor ? "Consultor: " + soNome(a.consultor) : "Marketing"} · {a.vendedor ? "Vendedor: " + soNome(a.vendedor) : "sem vendedor"} · {sit}</span>{a.obs ? <small>📝 {a.obs}</small> : null}</div>
                {o >= -1 && o <= 7 ? <button onClick={() => { setOff(o); setFiltro("todos"); setBusca(a.cliente); setAchados(null); }}>{o === 0 ? "Abrir aqui" : "Abrir no dia"}</button> : <small className="fora">{o < 0 ? "dia já passou" : "agenda futura"}</small>}
              </div>); })}
          <button className="ap-cancelar" onClick={() => setAchados(null)}>Fechar</button>
        </div></div>}
      {zoom && <div className="ap-zoom" onClick={() => setZoom("")}><img src={zoom} alt="" /></div>}
      {aviso && <div className={"ap-toast" + (aviso.ok ? "" : " erro")} onClick={() => setAviso(null)}>{aviso.t}</div>}
      <footer className="ap-rod">{erro ? <span style={{ color: "#c24a4a" }}>Sem conexão — tentando de novo… </span> : null}Atualizado às {atualizado ? atualizado.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"} · atualiza sozinho a cada minuto</footer>
    </div>
  );
}
