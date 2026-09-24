// ALIANÇA 360 no celular (app instalado pelo navegador).
// Consultor externo e vendedor: telas simples, com as ações do dia a um toque. Gestão/Supervisões: resumo visual.
// Os demais setores usam a versão completa (responsiva).
import { useEffect, useRef, useState } from "react";
import { useApp } from "../estado";
import { A, ACEITA_ANEXO, enviarArquivos, enviarFotos, prepararArquivos } from "../lib/acoes";
import { EM_ATENDIMENTO, STATUS_CLIENTE, fmtDate, fmtDateTime, fmtMoeda, hojeISO, isoLocal, parseData, parseMoeda, vendaContaVolume } from "../lib/regras";
import { sair } from "../lib/teste";
import Detalhe from "../comp/Detalhe";
import Agenda from "../telas/Agenda";

export type Perfil = "consultor" | "vendedor" | "gestor";
export function perfilMovel(R: any): Perfil | null {
  const s = R.mySetores();
  if (R.ehGestao() || R.temMarketing() || R.verTudo() || s.includes("suporte_consultores")) return "gestor";
  if (s.includes("consultor_externo")) return "consultor";
  if (s.includes("atendente_cliente")) return "vendedor";
  return null;
}

const primeiro = (n: string) => (n || "").replace(/^(Consultora?|Vendedora?)\s+—\s+/, "").split(" ")[0];
const hora = (v: any) => { const s = String(v || ""); return s.length > 10 ? s.slice(11, 16) : ""; };
const dia = (v: any) => String(v || "").slice(0, 10);
const diaCurto = (v: any) => { const d = dia(v); if (!d) return "sem data"; if (d === hojeISO()) return "hoje"; const a = new Date(); a.setDate(a.getDate() + 1); if (d === isoLocal(a)) return "amanhã"; return fmtDate(d).slice(0, 5); };

export default function AppMovel({ perfil, completa }: { perfil: Perfil; completa: () => void }) {
  const { R, detalheId, modal } = useApp() as any;
  const abas: [string, string, string][] = perfil === "consultor" ? [["hoje", "Hoje", "☀"], ["visitas", "Visitas", "📍"], ["loja", "Loja", "🏬"], ["eu", "Eu", "👤"]]
    : perfil === "vendedor" ? [["hoje", "Hoje", "☀"], ["pendentes", "Parecer", "✎"], ["loja", "Agenda", "🏬"], ["eu", "Eu", "👤"]]
    : [["resumo", "Resumo", "▦"], ["acao", "Ação", "⚑"], ["loja", "Loja", "🏬"], ["eu", "Mais", "☰"]];
  const [aba, setAba] = useState(abas[0][0]);
  const [aberto, setAberto] = useState<string | null>(null);
  const u = R.me();
  const papel = perfil === "consultor" ? "Consultor" : perfil === "vendedor" ? "Vendedor" : "Gestão";
  const pend = perfil === "vendedor" ? R.state.chamados.filter((c: any) => c.atendenteId === R.currentUserId && (R.parecerCobrado(c) || R.semParecer(c))).length : 0;
  return (
    <div className="mv">
      <header className="mv-top">
        <img src="/logo.png" alt="" className="mv-logo" />
        <div className="mv-tit"><b>{papel} · Aliança Móveis</b><span>{u?.nome ? primeiro(u.nome) : ""}</span></div>
      </header>
      <main className="mv-corpo" key={aba}>
        {perfil === "consultor" && aba === "hoje" && <ConsHoje abrir={setAberto} ir={setAba} />}
        {perfil === "consultor" && aba === "visitas" && <ConsVisitas abrir={setAberto} />}
        {perfil === "vendedor" && aba === "hoje" && <VendHoje abrir={setAberto} />}
        {perfil === "vendedor" && aba === "pendentes" && <VendPendentes abrir={setAberto} />}
        {perfil === "gestor" && aba === "resumo" && <GestResumo />}
        {perfil === "gestor" && aba === "acao" && <GestAcao />}
        {aba === "loja" && (perfil === "consultor" ? <ConsLoja abrir={setAberto} /> : <div className="mv-agenda"><Agenda /></div>)}
        {aba === "eu" && <Eu perfil={perfil} completa={completa} />}
      </main>
      <nav className="mv-tabs">
        {abas.map(([k, l, ic]) => <button key={k} className={aba === k ? "on" : ""} onClick={() => setAba(k)}><span className="ic">{ic}</span>{l}{k === "pendentes" && pend > 0 && <i className="mv-dot">{pend}</i>}</button>)}
      </nav>
      {aberto && <Folha id={aberto} fechar={() => setAberto(null)} perfil={perfil} />}
      {detalheId && <Detalhe id={detalheId} />}
      {modal}
    </div>
  );
}

// ---------- blocos comuns ----------
const Num = ({ n, l, cor, on }: any) => <button className={"mv-num" + (on ? " on" : "")} onClick={on} style={cor ? { color: cor } : undefined}><b>{n}</b><span>{l}</span></button>;
function Cartao({ c, abrir, linha, destaque }: any) {
  const { R } = useApp() as any;
  const sc = R.statusClienteDe(c);
  return (
    <button className={"mv-card" + (destaque ? " dest" : "")} onClick={() => abrir(c.id)}>
      <div className="mv-card-h"><b>{linha?.hora || ""}</b><small>{linha?.dia || ""}</small></div>
      <div className="mv-card-c"><div className="nm">{c.cliente}{R.semAnexo(c) ? " ⚠️" : ""}</div><div className="sb">{linha?.sub || c.produto || "—"}</div></div>
      <span className={"sc sc-" + sc}>{STATUS_CLIENTE[sc] || "—"}</span>
    </button>
  );
}
const Vazio = ({ t }: { t: string }) => <div className="mv-vazio">{t}</div>;

// ---------- consultor ----------
function consDados(R: any, st: any) {
  const eu = R.currentUserId, hoje = hojeISO();
  const meus = st.chamados.filter((c: any) => R.domMarketing(c) && c.consultorId === eu);
  const aFazer = meus.filter((c: any) => c.setorDestino === "consultor_externo" && !(c.tratativa && c.tratativa.realizada)).sort((a: any, b: any) => String(a.dataVisita || "9").localeCompare(String(b.dataVisita || "9")));
  const faltaLoja = meus.filter((c: any) => c.setorDestino === "consultor_externo" && c.tratativa && c.tratativa.realizada && !c.dataLoja);
  const deHoje = aFazer.filter((c: any) => dia(c.dataVisita) === hoje);
  const atrasadas = aFazer.filter((c: any) => c.dataVisita && dia(c.dataVisita) < hoje);
  const semAnexo = meus.filter((c: any) => R.semAnexo(c));
  const naLoja = meus.filter((c: any) => c.dataLoja && dia(c.dataLoja) >= hoje && !c.venda).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  return { meus, aFazer, faltaLoja, deHoje, atrasadas, semAnexo, naLoja };
}
function ConsHoje({ abrir, ir }: any) {
  const { R, st } = useApp() as any;
  const d = consDados(R, st);
  const prox = d.atrasadas[0] || d.deHoje[0] || d.aFazer[0];
  return <>
    <div className="mv-nums">
      <Num n={d.deHoje.length} l="Visitas hoje" on={() => ir("visitas")} />
      <Num n={d.faltaLoja.length} l="Agendar loja" cor={d.faltaLoja.length ? "var(--warn)" : undefined} on={() => ir("visitas")} />
      <Num n={d.semAnexo.length} l="Sem anexo" cor={d.semAnexo.length ? "#b07a00" : undefined} on={() => ir("visitas")} />
    </div>
    {prox ? <div className="mv-hero" onClick={() => abrir(prox.id)}>
      <div className="mv-hero-l">{d.atrasadas.includes(prox) ? "Visita atrasada" : "Próxima visita"}</div>
      <div className="mv-hero-q">{diaCurto(prox.dataVisita)} {hora(prox.dataVisita)}</div>
      <div className="mv-hero-n">{prox.cliente}</div>
      <div className="mv-hero-s">{prox.endereco || "sem endereço"}</div>
      <Contato c={prox} />
    </div> : <Vazio t="Nenhuma visita a fazer. 👍" />}
    {d.faltaLoja.length > 0 && <><div className="mv-sec">Visita feita — falta agendar a loja</div>
      {d.faltaLoja.map((c: any) => <Cartao key={c.id} c={c} abrir={abrir} linha={{ hora: hora(c.dataVisita), dia: diaCurto(c.dataVisita), sub: "Toque para agendar a vinda à loja" }} destaque />)}</>}
    {d.deHoje.filter((c: any) => c !== prox).length > 0 && <><div className="mv-sec">Mais visitas hoje</div>
      {d.deHoje.filter((c: any) => c !== prox).map((c: any) => <Cartao key={c.id} c={c} abrir={abrir} linha={{ hora: hora(c.dataVisita), dia: "hoje", sub: c.endereco }} />)}</>}
  </>;
}
function ConsVisitas({ abrir }: any) {
  const { R, st } = useApp() as any;
  const d = consDados(R, st);
  const [f, setF] = useState<"fazer" | "loja" | "anexo" | "todas">("fazer");
  const lista = f === "fazer" ? d.aFazer : f === "loja" ? d.faltaLoja : f === "anexo" ? d.semAnexo : d.meus.slice().sort((a: any, b: any) => +new Date(b.criadoEm) - +new Date(a.criadoEm));
  return <>
    <div className="mv-seg">{([["fazer", "A fazer", d.aFazer.length], ["loja", "Agendar loja", d.faltaLoja.length], ["anexo", "Sem anexo", d.semAnexo.length], ["todas", "Todas", d.meus.length]] as any[]).map(([k, l, n]) =>
      <button key={k} className={f === k ? "on" : ""} onClick={() => setF(k)}>{l}<i>{n}</i></button>)}</div>
    {lista.length ? lista.map((c: any) => <Cartao key={c.id} c={c} abrir={abrir} linha={{ hora: hora(c.dataVisita), dia: diaCurto(c.dataVisita), sub: c.endereco || c.produto }} />) : <Vazio t="Nada aqui." />}
  </>;
}
function ConsLoja({ abrir }: any) {
  const { R, st } = useApp() as any;
  const d = consDados(R, st);
  const res = d.meus.filter((c: any) => c.venda || (c.tratativa && c.tratativa.parecerEm) || R.statusClienteDe(c) === "nao_compareceu").sort((a: any, b: any) => String(b.dataLoja || "").localeCompare(String(a.dataLoja || ""))).slice(0, 15);
  return <>
    <div className="mv-sec">Seus clientes que vêm à loja</div>
    {d.naLoja.length ? d.naLoja.map((c: any) => <Cartao key={c.id} c={c} abrir={abrir} linha={{ hora: hora(c.dataLoja), dia: diaCurto(c.dataLoja), sub: c.atendenteId ? "vendedor " + primeiro(R.nomeUser(c.atendenteId)) : "Sem vendedor · fila" }} />) : <Vazio t="Nenhum agendamento na loja." />}
    <div className="mv-sec">Resultado na loja</div>
    {res.length ? res.map((c: any) => <Cartao key={c.id} c={c} abrir={abrir} linha={{ hora: hora(c.dataLoja), dia: diaCurto(c.dataLoja), sub: (c.tratativa && c.tratativa.parecer) || (c.venda ? "venda " + c.venda.numero : "—") }} />) : <Vazio t="Ainda sem resultados." />}
  </>;
}

// ---------- vendedor ----------
function vendDados(R: any, st: any) {
  const eu = R.currentUserId, hoje = hojeISO();
  const meus = st.chamados.filter((c: any) => R.domMarketing(c) && c.atendenteId === eu);
  const abertos = meus.filter((c: any) => !c.venda && EM_ATENDIMENTO.includes(R.statusClienteDe(c)));
  const deHoje = abertos.filter((c: any) => dia(c.dataLoja) === hoje).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  const proximos = abertos.filter((c: any) => c.dataLoja && dia(c.dataLoja) > hoje).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  const cobrados = meus.filter((c: any) => R.parecerCobrado(c));
  const semParecer = meus.filter((c: any) => R.semParecer(c) && !cobrados.includes(c));
  const semAtual = meus.filter((c: any) => !c.venda && R.clienteCriticoInatividade(c) && !cobrados.includes(c) && !semParecer.includes(c));
  return { meus, abertos, deHoje, proximos, cobrados, semParecer, semAtual };
}
function VendHoje({ abrir }: any) {
  const { R, st } = useApp() as any;
  const d = vendDados(R, st);
  const [f, setF] = useState<"hoje" | "prox">("hoje");
  const lista = f === "hoje" ? d.deHoje : d.proximos;
  return <>
    <div className="mv-nums">
      <Num n={d.deHoje.length} l="Hoje" on={() => setF("hoje")} />
      <Num n={d.proximos.length} l="Próximos" on={() => setF("prox")} />
      <Num n={d.cobrados.length + d.semParecer.length} l="Falta parecer" cor={d.cobrados.length + d.semParecer.length ? "var(--danger)" : undefined} />
    </div>
    <div className="mv-seg"><button className={f === "hoje" ? "on" : ""} onClick={() => setF("hoje")}>Hoje<i>{d.deHoje.length}</i></button><button className={f === "prox" ? "on" : ""} onClick={() => setF("prox")}>Próximos<i>{d.proximos.length}</i></button></div>
    {lista.length ? lista.map((c: any) => <Cartao key={c.id} c={c} abrir={abrir} linha={{ hora: hora(c.dataLoja), dia: diaCurto(c.dataLoja), sub: (c.tratativa && c.tratativa.querProjeto === "sim" ? "📐 quer projeto · " : "") + (c.produto || "—") }} />)
      : <Vazio t={f === "hoje" ? "Nenhum cliente seu hoje." : "Nenhum agendamento futuro."} />}
  </>;
}
function VendPendentes({ abrir }: any) {
  const { R, st } = useApp() as any;
  const d = vendDados(R, st);
  const grupo = (t: string, l: any[], cor: string) => l.length ? <><div className="mv-sec" style={{ color: cor }}>{t}</div>{l.map((c: any) => <Cartao key={c.id} c={c} abrir={abrir} linha={{ hora: hora(c.dataLoja), dia: diaCurto(c.dataLoja), sub: c.produto }} destaque />)}</> : null;
  if (!d.cobrados.length && !d.semParecer.length && !d.semAtual.length) return <Vazio t="Tudo em dia. Nenhum parecer pendente. 👍" />;
  return <>
    {grupo("Parecer cobrado pelo Suporte", d.cobrados, "var(--critico)")}
    {grupo("Já vieram — falta seu parecer", d.semParecer, "var(--danger)")}
    {grupo("Sem atualização há mais de 24h", d.semAtual, "var(--warn)")}
  </>;
}

// ---------- ficha do cliente no celular ----------
function Folha({ id, fechar, perfil }: any) {
  const { R, st, abrirDetalhe } = useApp() as any;
  const c = st.chamados.find((x: any) => x.id === id);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  if (!c) return null;
  const sc = R.statusClienteDe(c);
  const t = c.tratativa || {};
  return (
    <div className="mv-folha">
      <div className="mv-folha-top"><button className="mv-voltar" onClick={fechar}>‹ Voltar</button><span className={"sc sc-" + sc}>{STATUS_CLIENTE[sc] || "—"}</span></div>
      <div className="mv-folha-corpo">
        <div className="mv-cli">{c.cliente}</div>
        <div className="mv-cli-s">{c.produto || "—"}{c.solicitante ? " · marcado por " + primeiro(c.solicitante) : ""}</div>
        <div className="mv-info">
          {c.dataVisita && perfil === "consultor" && <div><span>Visita</span><b>{fmtDateTime(c.dataVisita)}</b></div>}
          {c.dataLoja && <div><span>Na loja</span><b>{fmtDateTime(c.dataLoja)}</b></div>}
          {c.endereco && perfil === "consultor" && <div><span>Endereço</span><b>{c.endereco}</b></div>}
          {perfil === "vendedor" && c.consultorId && <div><span>Consultor</span><b>{R.nomeUser(c.consultorId)}</b></div>}
          {perfil === "consultor" && c.dataLoja && <div><span>Vendedor</span><b>{c.atendenteId ? R.nomeUser(c.atendenteId) : "Sem vendedor · fila"}</b></div>}
          {t.querProjeto && <div><span>Projeto pronto</span><b>{t.querProjeto === "sim" ? "📐 Sim, quer ver" : "Não"}</b></div>}
          {t.medidas && <div><span>Medidas</span><b>{t.medidas}</b></div>}
          {t.obs && <div><span>Obs. do consultor</span><b>{t.obs}</b></div>}
          {t.parecer && <div><span>Parecer do vendedor</span><b>{t.parecer}</b></div>}
        </div>
        <Contato c={c} rota={perfil === "consultor"} />
        {perfil === "consultor" && <PassosConsultor c={c} />}
        {perfil === "vendedor" && <AcoesVendedor c={c} />}
        <Anexar c={c} />
        <button className="mv-link" onClick={() => abrirDetalhe(c.id)}>Ver ficha completa e histórico ›</button>
      </div>
    </div>
  );
}
function Contato({ c, rota = true }: any) {
  const { R } = useApp() as any;
  const tel = String(c.telefone || "").replace(/\D/g, ""), wa = R.waLinkCliente(c), maps = R.mapsLink(c), waze = R.wazeLink(c);
  return (
    <div className="mv-contato" onClick={e => e.stopPropagation()}>
      {tel ? <a href={"tel:" + tel} className="mv-bt">📞<span>Ligar</span></a> : <span className="mv-bt off">📞<span>Sem tel.</span></span>}
      {wa ? <a href={wa} target="_blank" rel="noopener" className="mv-bt wa">💬<span>WhatsApp</span></a> : null}
      {rota && maps ? <a href={maps} target="_blank" rel="noopener" className="mv-bt">🗺<span>Maps</span></a> : null}
      {rota && waze ? <a href={waze} target="_blank" rel="noopener" className="mv-bt">🚗<span>Waze</span></a> : null}
    </div>
  );
}
function Anexar({ c }: any) {
  const { R, executar: ex, toast } = useApp() as any;
  const [status, setStatus] = useState("");
  const qtd = (c.anexos || []).length;
  if (!R.podeAnexar(c)) return null;
  const enviar = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setStatus("Preparando…");
    try {
      const { fotos, outros, recusados } = await prepararArquivos(Array.from(files), s => setStatus(s || "Enviando…"));
      if (recusados.length) toast("Não anexado: " + recusados.join(", "));
      if (!fotos.length && !outros.length) return;
      setStatus("Enviando…");
      await ex(async () => { const itens = [...await enviarFotos(c.id, fotos), ...await enviarArquivos(c.id, outros)]; await A.adicionarAnexos(c.id, itens, true); }, "Anexo enviado");
    } finally { setStatus(""); }
  };
  return (
    <div className="mv-bloco">
      <div className="mv-bloco-t">Planta, fotos e vídeos {qtd ? <small>({qtd} anexado{qtd > 1 ? "s" : ""})</small> : <small style={{ color: "#b07a00" }}>⚠️ sem anexo</small>}</div>
      {status ? <div className="mv-status">{status}</div> : <div className="mv-2">
        <label className="mv-grande">📷 Tirar foto<input type="file" accept="image/*" capture="environment" hidden onChange={e => { enviar(e.target.files); e.target.value = ""; }} /></label>
        <label className="mv-grande">📎 Foto, vídeo ou PDF<input type="file" accept={ACEITA_ANEXO} multiple hidden onChange={e => { enviar(e.target.files); e.target.value = ""; }} /></label>
      </div>}
    </div>
  );
}
function PassosConsultor({ c }: any) {
  const { executar: ex, toast } = useApp() as any;
  const t = c.tratativa || {};
  const etapa = c.setorDestino === "consultor_externo";
  const [dl, setDl] = useState(""); const [qp, setQp] = useState(""); const [obs, setObs] = useState(t.obs || ""); const [med, setMed] = useState(t.medidas || "");
  if (!etapa) return c.dataLoja ? <div className="mv-ok">✓ Agendado na loja para {fmtDateTime(c.dataLoja)}</div> : null;
  const marcar = (campo: string, ok: string) => ex(() => A.alternarMarcacao(c.id, campo), ok);
  return (
    <div className="mv-bloco">
      <div className="mv-passo"><span className={t.contatoIniciado ? "ok" : ""}>1</span><div>Contato com o cliente</div>
        <button className={"mv-tg" + (t.contatoIniciado ? " on" : "")} onClick={() => marcar("contatoIniciado", "Atualizado")}>{t.contatoIniciado ? "Feito ✓" : "Marcar"}</button></div>
      <div className="mv-passo"><span className={t.realizada ? "ok" : ""}>2</span><div>Visita realizada</div>
        <button className={"mv-tg" + (t.realizada ? " on" : "")} onClick={() => marcar("realizada", "Atualizado")}>{t.realizada ? "Feita ✓" : "Marcar"}</button></div>
      <div className="mv-passo col"><div className="mv-passo-l"><span>3</span><div>Observações da visita</div></div>
        <textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Condições do local, o que o cliente quer…" rows={2} />
        <input value={med} onChange={e => setMed(e.target.value)} placeholder="Complemento de medidas (opcional)" />
        <button className="btn sm" onClick={() => ex(() => A.salvarTratativa(c.id, { obs, medidas: med }), "Salvo")}>Salvar observação</button></div>
      <div className="mv-passo col"><div className="mv-passo-l"><span>4</span><div>Agendar a vinda à loja</div></div>
        <input type="datetime-local" value={dl} onChange={e => setDl(e.target.value)} />
        <div className="mv-2"><button className={"mv-op" + (qp === "sim" ? " on" : "")} onClick={() => setQp("sim")}>📐 Quer projeto pronto</button><button className={"mv-op" + (qp === "nao" ? " on" : "")} onClick={() => setQp("nao")}>Não quer projeto</button></div>
        <button className="mv-principal" onClick={() => {
          if (!dl || dl.length < 16) { toast("Escolha o dia e o horário na loja"); return; }
          if (!qp) { toast("Diga se o cliente quer projeto pronto"); return; }
          if (!(c.anexos || []).length && !confirm("Este cliente está SEM ANEXO (planta/fotos). Agendar mesmo assim?")) return;
          ex(() => A.agendarLoja(c.id, dl, med, obs, qp), "Agendado na loja ✓");
        }}>Agendar na loja</button></div>
    </div>
  );
}
function AcoesVendedor({ c }: any) {
  const { R, executar: ex, toast } = useApp() as any;
  const t = c.tratativa || {};
  const sc = R.statusClienteDe(c);
  const [st, setSt] = useState(""); const [txt, setTxt] = useState(""); const [data, setData] = useState("");
  const [num, setNum] = useState(""); const [val, setVal] = useState("");
  if (c.setorDestino !== "atendente_cliente" || c.venda) return c.venda ? <div className="mv-ok">✓ Venda nº {c.venda.numero} registrada</div> : null;
  if (["reprovado", "nao_compareceu"].includes(sc)) return <div className="mv-bloco"><div className="mv-ok" style={{ color: "var(--danger)" }}>{STATUS_CLIENTE[sc]}</div>
    <button className="btn sm" onClick={() => sc === "reprovado" ? ex(() => A.vendedorStatus(c.id, "com_vendedor", "", "Atendimento reaberto"), "Reaberto") : ex(() => A.marcarComparecimento(c.id, "voltou"), "Reaberto")}>Reabrir atendimento</button></div>;
  const OPC: [string, string][] = [["orcamento", "Orçamento"], ["sem_resposta", "Sem resposta"], ["reagendado", "Reagendado"], ["reprovado", "Reprovado"], ["nao_compareceu", "Não veio"], ["vendido", "Vendido"]];
  const salvar = () => {
    if (!st) { toast("Escolha o status"); return; }
    if (st === "vendido") {
      if (!num.trim()) { toast("Informe o nº da venda"); return; }
      const v = parseMoeda(val); if (!v || v <= 0) { toast("Informe o valor da venda"); return; }
      ex(() => A.registrarVenda(c.id, num.trim(), v, hojeISO(), R.me()?.nome || ""), "Venda registrada — a Gestão confirma").then((ok: boolean) => ok && setSt(""));
      return;
    }
    if (st === "reagendado" && (!data || data.length < 16)) { toast("Escolha a nova data e horário"); return; }
    if (["orcamento", "sem_resposta", "reprovado"].includes(st) && !txt.trim()) { toast("Escreva o parecer"); return; }
    ex(() => A.vendedorStatus(c.id, st, st === "reagendado" ? data : "", txt.trim()), "Status salvo").then((ok: boolean) => { if (ok) { setSt(""); setTxt(""); setData(""); } });
  };
  return (
    <div className="mv-bloco">
      {t.cobradoEm && <div className="mv-alerta">Parecer cobrado por {t.cobradoPor} · {fmtDateTime(t.cobradoEm)}</div>}
      <div className="mv-2">
        <button className={"mv-op" + (t.emContato ? " on" : "")} onClick={() => ex(() => A.alternarMarcacao(c.id, "emContato"), "Atualizado")}>{t.emContato ? "✓ Em contato" : "Já estou em contato"}</button>
        <button className={"mv-op" + (t.projetoSistema ? " on" : "")} onClick={() => ex(() => A.alternarMarcacao(c.id, "projetoSistema"), "Atualizado")}>{t.projetoSistema ? "✓ Projeto no sistema" : "Projeto pronto no sistema"}</button>
      </div>
      <div className="mv-bloco-t" style={{ marginTop: 12 }}>Como foi o atendimento?</div>
      <div className="mv-3">{OPC.map(([k, l]) => <button key={k} className={"mv-op" + (st === k ? " on" : "") + (k === "vendido" ? " venda" : "")} onClick={() => setSt(k)}>{l}</button>)}</div>
      {st === "reagendado" && <input type="datetime-local" value={data} onChange={e => setData(e.target.value)} />}
      {st === "vendido" && <div className="mv-2"><input inputMode="numeric" placeholder="Nº da venda" value={num} onChange={e => setNum(e.target.value)} /><input inputMode="decimal" placeholder="Valor (R$)" value={val} onChange={e => setVal(e.target.value)} /></div>}
      {st && st !== "vendido" && <textarea rows={2} placeholder="Parecer: o que aconteceu, próximo passo…" value={txt} onChange={e => setTxt(e.target.value)} />}
      {st && <button className="mv-principal" onClick={salvar}>{st === "vendido" ? "Registrar venda" : "Salvar"}</button>}
      {t.parecerEm && <div className="mv-ult">Último parecer: <b>{STATUS_CLIENTE[t.parecerStatus] || t.parecerStatus}</b>{t.parecer ? " — " + t.parecer : ""}</div>}
    </div>
  );
}

// ---------- gestão ----------
function GestResumo() {
  const { R, st } = useApp() as any;
  const [per, setPer] = useState<"hoje" | "mes">("mes");
  const hoje = hojeISO(), de = per === "hoje" ? hoje : hoje.slice(0, 8) + "01";
  const noPer = (v: any) => !!v && String(isoLocal(parseData(v))) >= de && String(isoLocal(parseData(v))) <= hoje;
  const todos = st.chamados.filter(R.podeVer);
  const cc = todos.filter((c: any) => !R.domMarketing(c)), mk = todos.filter((c: any) => R.domMarketing(c));
  const pr = (c: any) => R.prioridade(c);
  const ccAb = cc.filter((c: any) => c.status === "aberta" || c.status === "tratativa").length;
  const vendasPer = mk.filter((c: any) => vendaContaVolume(c.venda) && noPer(c.venda.dataVenda || c.venda.quando));
  const valor = vendasPer.reduce((s: number, c: any) => s + parseMoeda(c.venda.valor), 0);
  const visitas = mk.filter((c: any) => !R.ehDireto(c) && c.consultorId && noPer(R.ancoraVisita(c)));
  const F = R.funil(visitas);
  const lojaHoje = mk.filter((c: any) => dia(c.dataLoja) === hoje);
  const Tile = ({ n, l, cor }: any) => <div className="mv-tile"><b style={cor ? { color: cor } : undefined}>{n}</b><span>{l}</span></div>;
  const barra = (l: string, n: number, max: number, cor: string) => <div className="mv-barra"><span>{l}</span><i><em style={{ width: (max ? n / max * 100 : 0) + "%", background: cor }}></em></i><b>{n}</b></div>;
  return <>
    <div className="mv-seg"><button className={per === "hoje" ? "on" : ""} onClick={() => setPer("hoje")}>Hoje</button><button className={per === "mes" ? "on" : ""} onClick={() => setPer("mes")}>Mês atual</button></div>
    <div className="mv-sec">Call center e pós-venda</div>
    <div className="mv-tiles">
      <Tile n={ccAb} l="Em aberto" /><Tile n={cc.filter((c: any) => pr(c) === "critico").length} l="Críticos" cor="var(--critico)" />
      <Tile n={cc.filter((c: any) => pr(c) === "atrasado").length} l="Atrasados" cor="var(--danger)" /><Tile n={cc.filter((c: any) => c.status === "informar").length} l="Informar cliente" cor="var(--st-informar)" />
    </div>
    <div className="mv-sec">Marketing e loja</div>
    <div className="mv-tiles">
      <Tile n={mk.filter((c: any) => noPer(c.criadoEm)).length} l="Clientes novos" /><Tile n={lojaHoje.length} l="Na loja hoje" />
      <Tile n={lojaHoje.filter((c: any) => !c.atendenteId).length} l="Sem vendedor hoje" cor="var(--warn)" /><Tile n={mk.filter((c: any) => R.semParecer(c)).length} l="Sem parecer" cor="var(--danger)" />
      <Tile n={vendasPer.length} l="Vendas" cor="var(--st-concluida)" /><Tile n={mk.filter((c: any) => c.venda && c.venda.status === "registrada").length} l="Vendas a confirmar" cor="var(--warn)" />
    </div>
    {vendasPer.some((c: any) => R.podeVerValor(c)) ? <div className="mv-valor"><span>Valor vendido ({per === "hoje" ? "hoje" : "mês"})</span><b>{fmtMoeda(valor)}</b></div> : null}
    <div className="mv-sec">Visitas → loja → venda</div>
    <div className="mv-funil">
      {barra("Visitas", F.total, F.total, "var(--primary)")}{barra("Realizadas", F.realizadas, F.total, "var(--st-respondida)")}
      {barra("Agend. loja", F.agendadas, F.total, "var(--st-tratativa)")}{barra("Vieram", F.vieram, F.total, "var(--warn)")}{barra("Vendas", F.vendas, F.total, "var(--st-concluida)")}
    </div>
  </>;
}
function GestAcao() {
  const { R, st, abrirDetalhe } = useApp() as any;
  const todos = st.chamados.filter(R.podeVer);
  const acao = R.ordenar(todos.filter((c: any) => ["critico", "atrasado", "urgente"].includes(R.prioridade(c)))).slice(0, 40);
  const pend = R.minhasPendencias();
  return <>
    {pend.grupos.map((g: any) => <div key={g.chave} className="mv-grupo"><div className="mv-sec" style={{ color: g.cor }}>{g.titulo} <i>{g.itens.length}</i></div>
      {g.itens.slice(0, 6).map((c: any) => <button key={c.id} className="mv-linha" onClick={() => abrirDetalhe(c.id)}><b>{c.cliente}</b><span>{c.id} · {R.setorNome(c.setorDestino)}</span></button>)}
      {g.itens.length > 6 && <div className="mv-mais">+{g.itens.length - 6} na versão completa</div>}</div>)}
    <div className="mv-sec">Precisam de ação</div>
    {acao.length ? acao.map((c: any) => { const p = R.prioridade(c); return <button key={c.id} className="mv-linha" onClick={() => abrirDetalhe(c.id)} style={{ borderLeftColor: p === "critico" ? "var(--critico)" : "var(--danger)" }}><b>{c.cliente}</b><span>{c.id} · {R.setorNome(c.setorDestino)} · {R.domMarketing(c) ? "sem atualização" : p}</span></button>; }) : <Vazio t="Tudo sob controle." />}
  </>;
}

// ---------- eu / mais ----------
function Eu({ perfil, completa }: any) {
  const { R, st } = useApp() as any;
  const u = R.me();
  const hoje = hojeISO(), de = hoje.slice(0, 8) + "01";
  let bloco: any = null;
  if (perfil === "consultor") {
    const f = R.funilConsultor(R.currentUserId, de, hoje);
    bloco = <div className="mv-tiles"><div className="mv-tile"><b>{f.total}</b><span>Visitas no mês</span></div><div className="mv-tile"><b>{f.realizadas}</b><span>Realizadas</span></div>
      <div className="mv-tile"><b>{f.agendadas}</b><span>Agendados loja</span></div><div className="mv-tile"><b style={{ color: "var(--st-concluida)" }}>{f.vendas}</b><span>Vendas</span></div></div>;
  } else if (perfil === "vendedor") {
    const meus = st.chamados.filter((c: any) => R.domMarketing(c) && c.atendenteId === R.currentUserId);
    const noMes = (c: any) => { const d = String(c.venda?.dataVenda || c.venda?.quando || "").slice(0, 10); return d >= de && d <= hoje; };
    const v = meus.filter((c: any) => vendaContaVolume(c.venda) && noMes(c));
    bloco = <div className="mv-tiles"><div className="mv-tile"><b>{meus.filter((c: any) => dia(c.dataLoja) >= de && dia(c.dataLoja) <= hoje).length}</b><span>Clientes no mês</span></div>
      <div className="mv-tile"><b style={{ color: "var(--st-concluida)" }}>{v.length}</b><span>Vendas no mês</span></div>
      <div className="mv-tile" style={{ gridColumn: "1/-1" }}><b>{fmtMoeda(v.reduce((s: number, c: any) => s + parseMoeda(c.venda.valor), 0))}</b><span>Total vendido (comissão calculada no Tático)</span></div></div>;
  }
  return <>
    <div className="mv-perfil"><div className="av">{(u?.nome || "?").replace(/^.*—\s*/, "").slice(0, 1)}</div><div><b>{u?.nome}</b><span>{R.setoresLabel(u)}</span></div></div>
    {bloco && <><div className="mv-sec">Este mês</div>{bloco}</>}
    <div className="mv-sec">Aplicativo</div>
    <Instalar />
    <button className="mv-linha" onClick={completa}><b>Abrir versão completa</b><span>Todas as telas do sistema (melhor no computador)</span></button>
    <button className="mv-linha" onClick={() => sair()} style={{ borderLeftColor: "var(--danger)" }}><b>Sair</b><span>Encerrar a sessão neste aparelho</span></button>
  </>;
}

// botão "Instalar" (Android/Chrome) e instrução para iPhone
let promptInstalar: any = null;
if (typeof window !== "undefined") window.addEventListener("beforeinstallprompt", (e: any) => { e.preventDefault(); promptInstalar = e; });
export function Instalar() {
  const [, set] = useState(0);
  const inst = typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const tick = useRef<any>(); useEffect(() => { tick.current = setInterval(() => set(x => x + 1), 1500); return () => clearInterval(tick.current); }, []);
  if (inst) return <div className="mv-ok">✓ Aplicativo instalado neste aparelho</div>;
  if (promptInstalar) return <button className="mv-principal" onClick={async () => { promptInstalar.prompt(); await promptInstalar.userChoice; promptInstalar = null; set(x => x + 1); }}>📲 Instalar o aplicativo</button>;
  return <div className="mv-dica">{ios ? <>No iPhone: toque em <b>Compartilhar</b> (quadrado com seta) e depois em <b>Adicionar à Tela de Início</b>.</> : <>No Android: toque no menu <b>⋮</b> do Chrome e em <b>Instalar aplicativo</b> (ou "Adicionar à tela inicial").</>}</div>;
}
