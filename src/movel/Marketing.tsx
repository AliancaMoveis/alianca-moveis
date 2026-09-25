// App do celular — operadoras do marketing: registrar cliente, acompanhar os seus e ver a comissão.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../estado";
import { A, ACEITA_ANEXO, enviarArquivos, enviarFotos, prepararArquivos } from "../lib/acoes";
import { STATUS_CLIENTE, fmtDate, fmtMoeda, hojeISO, isoLocal, mesmaPessoa, parseData, soDigitos } from "../lib/regras";
import { useTimeMkt } from "./Gestor";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const dia = (v: any) => String(v || "").slice(0, 10);
const hora = (v: any) => { const s = String(v || ""); return s.length > 10 ? s.slice(11, 16) : ""; };
const diaLocal = (v: any) => { const x = parseData(v); return isNaN(+x) ? "" : isoLocal(x); };
const curto = (v: any) => { const d = dia(v); if (!d) return ""; const h = hojeISO(); if (d === h) return "hoje"; const a = parseData(h + "T12:00"); a.setDate(a.getDate() + 1); if (d === isoLocal(a)) return "amanhã"; return fmtDate(d).slice(0, 5); };
function mesP(off: number) {
  const h = parseData(hojeISO() + "T12:00"); const ini = new Date(h.getFullYear(), h.getMonth() - off, 1), fim = new Date(h.getFullYear(), h.getMonth() - off + 1, 0);
  return { de: isoLocal(ini), ate: isoLocal(fim), nome: MESES[ini.getMonth()] };
}
function meus(R: any, st: any) { return st.chamados.filter((c: any) => R.domMarketing(c) && c.solicitanteId === R.currentUserId); }

function Linha({ c, abrir }: any) {
  const { R } = useApp() as any;
  const sc = R.statusClienteDe(c);
  const quando = c.dataLoja ? "loja " + curto(c.dataLoja) + " " + hora(c.dataLoja) : c.dataVisita ? "visita " + curto(c.dataVisita) + " " + hora(c.dataVisita) : "cadastrado " + fmtDate(c.criadoEm).slice(0, 5);
  return <button className="mv-linha" onClick={() => abrir(c.id)} style={{ borderLeftColor: c.venda ? "var(--st-concluida)" : R.ehDireto(c) ? "#c0428a" : "var(--primary)" }}>
    <b>{c.cliente}<em className={"sc sc-" + sc}>{STATUS_CLIENTE[sc] || "—"}</em></b>
    <span>{R.ehDireto(c) ? "Direto na loja" : "Consultor externo"} · {quando}{c.venda ? " · venda " + c.venda.numero : ""}</span></button>;
}

// ================= HOJE =================
export function MktHoje({ ir, abrir }: any) {
  const { R, st } = useApp() as any;
  const hoje = hojeISO();
  const P = mesP(0);
  const T = useTimeMkt({ de: P.de, ate: P.ate });
  const eu = T.linhas.find((x: any) => x.u.id === R.currentUserId);
  const l = meus(R, st);
  const deHoje = l.filter((c: any) => diaLocal(c.criadoEm) === hoje);
  const naLoja = l.filter((c: any) => c.dataLoja && dia(c.dataLoja) >= hoje && !c.venda).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  const meta = T.metaHoje ? T.metaHoje.meta : 0;
  const pct = meta ? Math.min(100, deHoje.length / meta * 100) : 0;
  return <>
    <div className="mv-receber mk"><span>Hoje · {fmtDate(hoje)}</span>
      <b>{deHoje.length}{meta ? " / " + meta : ""} <small style={{ fontSize: 15, display: "inline" }}>agendamento(s)</small></b>
      {meta ? <><div className="mv-prog"><i style={{ width: pct + "%" }}></i></div>
        <small>{deHoje.length >= meta ? "🎉 Meta batida! Bônus de " + fmtMoeda(Number(T.metaHoje.valor)) : "Faltam " + (meta - deHoje.length) + " para o bônus de " + fmtMoeda(Number(T.metaHoje.valor))}</small></>
        : <small>Sem meta definida para hoje</small>}</div>
    <button className="mv-principal" onClick={() => ir("novo")}>＋ Registrar cliente</button>
    <div className="mv-tiles" style={{ marginTop: 10 }}>
      <button className="mv-tile clic" onClick={() => ir("ganhos")}><b style={{ color: "var(--st-concluida)" }}>{fmtMoeda(eu ? eu.total : 0)}</b><span>Comissão do mês (calculada)</span></button>
      <button className="mv-tile clic" onClick={() => ir("ganhos")}><b>{eu ? eu.vendas.length : 0}</b><span>Vendas no mês</span></button>
    </div>
    <div className="mv-sec">Seus clientes que vêm à loja</div>
    {naLoja.length ? naLoja.slice(0, 15).map((c: any) => <Linha key={c.id} c={c} abrir={abrir} />) : <div className="mv-vazio">Nenhum agendamento na loja.</div>}
    {deHoje.length > 0 && <><div className="mv-sec">Cadastrados hoje</div>{deHoje.map((c: any) => <Linha key={c.id} c={c} abrir={abrir} />)}</>}
    <button className="mv-linha" onClick={() => ir("loja")} style={{ marginTop: 10 }}><b>🏬 Agenda da loja</b><span>Todos os clientes do dia e os seus</span></button>
  </>;
}

// ================= CLIENTES =================
export function MktClientes({ abrir }: any) {
  const { R, st } = useApp() as any;
  const [f, setF] = useState<"abertos" | "loja" | "vendas" | "todos">("abertos");
  const [q, setQ] = useState("");
  const l = meus(R, st).sort((a: any, b: any) => +new Date(b.criadoEm) - +new Date(a.criadoEm));
  const abertos = l.filter((c: any) => R.emAberto(c) && !c.venda), loja = l.filter((c: any) => c.dataLoja && dia(c.dataLoja) >= hojeISO()), vendas = l.filter((c: any) => c.venda);
  const t = q.trim().toLowerCase(), dg = t.replace(/\D/g, "");
  const base = t ? l : f === "abertos" ? abertos : f === "loja" ? loja : f === "vendas" ? vendas : l;
  const lista = t ? base.filter((c: any) => (c.cliente + " " + (c.produto || "") + " " + c.id).toLowerCase().includes(t) || (dg.length >= 3 && String(c.telefone || "").replace(/\D/g, "").includes(dg))) : base;
  return <>
    <input className="mv-busca" type="search" placeholder="🔎 Buscar cliente, telefone…" value={q} onChange={e => setQ(e.target.value)} />
    {!t && <div className="mv-seg">{([["abertos", "Em andamento", abertos.length], ["loja", "Vêm à loja", loja.length], ["vendas", "Venderam", vendas.length], ["todos", "Todos", l.length]] as any[]).map(([k, n, x]) =>
      <button key={k} className={f === k ? "on" : ""} onClick={() => setF(k)}>{n}<i>{x}</i></button>)}</div>}
    {lista.length ? lista.slice(0, 100).map((c: any) => <Linha key={c.id} c={c} abrir={abrir} />) : <div className="mv-vazio">{t ? "Nenhum cliente encontrado." : "Nada aqui."}</div>}
  </>;
}

// ================= GANHOS (comissão) =================
export function MktGanhos({ abrir }: any) {
  const { R } = useApp() as any;
  const [off, setOff] = useState(0);
  const P = mesP(off);
  const T = useTimeMkt({ de: P.de, ate: P.ate });
  const [pags, setPags] = useState<any[]>([]);
  useEffect(() => { A.listarPagamentosMkt(P.de, P.ate).then(setPags).catch(() => setPags([])); }, [P.de]);
  const eu = T.linhas.find((x: any) => x.u.id === R.currentUserId);
  const pag = pags.find((p: any) => p.operadora_id === R.currentUserId);
  const [ver, setVer] = useState("");
  if (!eu) return <div className="mv-vazio">Sem dados.</div>;
  const aprovado = pag ? Number(pag.total) : 0, pendente = Math.max(0, eu.total - aprovado);
  const lista = ver === "vendas" ? eu.vendas : ver === "conf" ? eu.aConf : ver === "ag" ? eu.ag : ver === "vi" ? eu.vieram : [];
  const hoje = hojeISO();
  const diasMeta = T.metas.filter((m: any) => m.dia <= hoje);
  return <>
    <div className="mv-seg">{[0, 1, 2].map(o => <button key={o} className={off === o ? "on" : ""} onClick={() => { setOff(o); setVer(""); }}>{o === 0 ? "Este mês" : mesP(o).nome}</button>)}</div>
    <div className="mv-receber"><span>Sua comissão · {P.nome}{off === 0 ? " (até hoje)" : ""}</span><b>{fmtMoeda(eu.total)}</b>
      <small>{eu.vendas.length} venda(s) × {fmtMoeda(T.valorVenda)} = {fmtMoeda(eu.vendas.length * T.valorVenda)} + bônus de meta {fmtMoeda(eu.bonus)}</small></div>
    <div className="mv-tiles">
      <div className="mv-tile din"><b style={{ color: aprovado ? "var(--st-concluida)" : "var(--ink-faint)" }}>{fmtMoeda(aprovado)}</b><span>Aprovado para receber</span></div>
      <div className="mv-tile din"><b style={{ color: pendente ? "var(--warn)" : "var(--ink-faint)" }}>{fmtMoeda(pendente)}</b><span>Pendente de aprovação</span></div>
    </div>
    {pag && Number(pag.total) !== eu.total && <div className="mv-dica">O valor mudou depois da aprovação — a supervisora vai reaprovar.</div>}
    <div className="mv-sec">Sua produção</div>
    <div className="mv-tiles c3">
      <button className={"mv-tile clic" + (ver === "ag" ? " sel" : "")} onClick={() => setVer(ver === "ag" ? "" : "ag")}><b>{eu.ag.length}</b><span>Agendou</span></button>
      <button className={"mv-tile clic" + (ver === "vi" ? " sel" : "")} onClick={() => setVer(ver === "vi" ? "" : "vi")}><b>{eu.vieram.length}</b><span>Vieram à loja</span></button>
      <button className={"mv-tile clic" + (ver === "vendas" ? " sel" : "")} onClick={() => setVer(ver === "vendas" ? "" : "vendas")}><b style={{ color: "var(--st-concluida)" }}>{eu.vendas.length}</b><span>Vendas (comissão)</span></button>
      <div className="mv-tile"><b>{eu.mkt.length}</b><span>Direto na loja</span></div>
      <div className="mv-tile"><b>{eu.ext.length}</b><span>Consultor externo</span></div>
      <button className={"mv-tile clic" + (ver === "conf" ? " sel" : "")} onClick={() => setVer(ver === "conf" ? "" : "conf")}><b style={{ color: eu.aConf.length ? "var(--warn)" : undefined }}>{eu.aConf.length}</b><span>Vendas a confirmar</span></button>
    </div>
    {ver && <><div className="mv-sec">{ver === "vendas" ? "Vendas que geram comissão" : ver === "conf" ? "Vendas aguardando confirmação (entram quando efetivadas)" : ver === "ag" ? "Seus agendamentos" : "Vieram à loja"} <i>{lista.length}</i></div>
      {lista.length ? lista.map((c: any) => <Linha key={c.id} c={c} abrir={abrir} />) : <div className="mv-vazio">Nenhum.</div>}</>}
    <div className="mv-sec">Metas do mês · {eu.batidos} de {eu.diasMeta} batidas</div>
    {diasMeta.length ? <div className="mv-funil">{diasMeta.slice().reverse().map((m: any) => {
      const feitos = eu.ag.filter((c: any) => diaLocal(c.criadoEm) === m.dia).length, ok = feitos >= m.meta;
      return <div key={m.dia} className="mv-barra"><span>{fmtDate(m.dia).slice(0, 5)} · meta {m.meta}</span><i><em style={{ width: Math.min(100, feitos / m.meta * 100) + "%", background: ok ? "var(--st-concluida)" : "var(--warn)" }}></em></i><b>{feitos}{ok ? " ✓ " + fmtMoeda(Number(m.valor)) : ""}</b></div>;
    })}</div> : <div className="mv-vazio">Nenhum dia com meta neste mês.</div>}
    <div className="mv-dica" style={{ marginTop: 10 }}>Cada venda <b>efetivada</b> de cliente que você agendou vale {fmtMoeda(T.valorVenda)}. Dias com meta batida somam o bônus do dia. O pagamento é aprovado pela Supervisão Marketing.</div>
  </>;
}

// ================= NOVO CLIENTE =================
type Anexo = { tipo: "img" | "link" | "video" | "pdf"; nome: string; url: string; blob?: Blob };
export function MktNovo({ pronto }: { pronto: (id: string) => void }) {
  const { R, st, toast, recarregar } = useApp() as any;
  const tipos = Object.entries(R.TIPOS).filter(([k, t]: any) => t.presale && R.podeCriarTipo(k)) as [string, any][];
  const tDireto = tipos.find(([, t]) => t.direto), tCons = tipos.find(([, t]) => !t.direto);
  const [tipo, setTipo] = useState<string>(tCons ? tCons[0] : tDireto ? tDireto[0] : "");
  const direto = !!(R.TIPOS[tipo] && R.TIPOS[tipo].direto);
  const V0 = { cliente: "", telefone: "", produto: "", motivo: "", email: "", dataVisita: "", endereco: "" };
  const [f, setF] = useState<any>(V0);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [prep, setPrep] = useState("");
  const [env, setEnv] = useState(false);
  const [dups, setDups] = useState<any[]>([]);
  const tD = useRef<any>();
  const set = (k: string) => (e: any) => setF((x: any) => ({ ...x, [k]: e.target.value }));
  useEffect(() => {
    clearTimeout(tD.current);
    tD.current = setTimeout(() => {
      const d = { telefone: f.telefone, cliente: f.cliente, clienteDoc: "", pedido: "" };
      if (!soDigitos(d.telefone) && (d.cliente || "").trim().length <= 5) { setDups([]); return; }
      setDups(st.chamados.filter((c: any) => R.domMarketing(c) && R.podeVer(c) && mesmaPessoa(c, d)).slice(0, 4));
    }, 350);
  }, [f.cliente, f.telefone]);
  async function addArq(files: FileList | null) {
    if (!files || !files.length) return;
    setPrep("Preparando…");
    try {
      const { fotos, outros, recusados } = await prepararArquivos(Array.from(files), t => setPrep(t));
      if (recusados.length) toast("Não anexado: " + recusados.join(", "));
      setAnexos(a => [...a, ...fotos.map(x => ({ tipo: "img" as const, nome: x.nome, url: URL.createObjectURL(x.blob), blob: x.blob })), ...outros.map(x => ({ tipo: x.tipo, nome: x.nome, url: URL.createObjectURL(x.blob), blob: x.blob }))]);
    } finally { setPrep(""); }
  }
  async function enviar() {
    if (!tipo) { toast("Escolha o tipo de agendamento"); return; }
    if (!f.cliente.trim()) { toast("Informe o nome do cliente"); return; }
    if (soDigitos(f.telefone).length < 10) { toast("Informe o telefone com DDD"); return; }
    if (!f.produto.trim()) { toast("Informe o ambiente de interesse"); return; }
    if (direto && !f.dataVisita) { toast("Informe a data e o horário na loja"); return; }
    setEnv(true);
    try {
      const id = await A.criarChamado({ tipo, cliente: f.cliente.trim(), telefone: f.telefone, produto: f.produto.trim(), motivo: f.motivo.trim() || "—", email: f.email,
        dataVisita: f.dataVisita, endereco: direto ? "" : f.endereco, consultorId: "", clienteDoc: "", pedido: "", dataVenda: "", pedidoFabrica: "", fabrica: "", prazoTatico: "", slaManual: "",
        vinculadoA: dups.length ? dups[0].id : null });
      const fotos = anexos.filter(a => a.tipo === "img");
      const itens: any[] = fotos.length ? await enviarFotos(id, fotos.map(a => ({ nome: a.nome, blob: a.blob! }))) : [];
      const outros = anexos.filter(a => a.tipo === "video" || a.tipo === "pdf");
      if (outros.length) itens.push(...await enviarArquivos(id, outros.map(a => ({ nome: a.nome, blob: a.blob!, tipo: a.tipo as "video" | "pdf" }))));
      if (itens.length) await A.adicionarAnexos(id, itens, false);
      setF(V0); setAnexos([]); setDups([]);
      await recarregar();
      toast("Cliente registrado ✓");
      pronto(id);
    } catch (e: any) { toast(e.message || "Não foi possível registrar"); }
    finally { setEnv(false); }
  }
  return <div className="mv-novo">
    <div className="mv-sec" style={{ marginTop: 0 }}>Tipo de agendamento</div>
    <div className="mv-area">
      {tCons && <button className={tipo === tCons[0] ? "on" : ""} onClick={() => setTipo(tCons[0])}>📍 Visita do consultor</button>}
      {tDireto && <button className={tipo === tDireto[0] ? "on" : ""} onClick={() => setTipo(tDireto[0])}>🏬 Direto na loja</button>}
    </div>
    {dups.length > 0 && <div className="mv-aviso">⚠️ Cliente parecido já cadastrado:{dups.map((c: any) => <div key={c.id}><b>{c.cliente}</b> · {c.telefone || "sem telefone"} · {fmtDate(c.criadoEm)}{c.solicitanteId !== R.currentUserId ? " · por " + R.nomeUser(c.solicitanteId) : ""}</div>)}<small>Se for outro assunto, pode registrar — fica ligado ao histórico dele.</small></div>}
    <label className="mv-campo">Nome do cliente *<input value={f.cliente} onChange={set("cliente")} placeholder="Nome completo" autoComplete="off" /></label>
    <label className="mv-campo">Telefone / WhatsApp *<input type="tel" inputMode="tel" value={f.telefone} onChange={set("telefone")} placeholder="(00) 00000-0000" /></label>
    <label className="mv-campo">Ambiente de interesse *<input value={f.produto} onChange={set("produto")} placeholder="Ex.: Cozinha planejada" /></label>
    <label className="mv-campo">{direto ? "Data e horário na loja *" : "Data e horário da visita (se já souber)"}<input type="datetime-local" value={f.dataVisita} onChange={set("dataVisita")} /></label>
    {!direto && <label className="mv-campo">Endereço da visita<input value={f.endereco} onChange={set("endereco")} placeholder="Rua, número, bairro, cidade" /></label>}
    <label className="mv-campo">Observações<textarea rows={3} value={f.motivo} onChange={set("motivo")} placeholder="O que procura, melhor horário para contato…" /></label>
    <label className="mv-campo">E-mail (opcional)<input type="email" inputMode="email" value={f.email} onChange={set("email")} /></label>
    <div className="mv-anexar">
      <label className="btn sm">{prep || "📷 Foto / vídeo / planta"}<input type="file" accept={ACEITA_ANEXO} multiple disabled={!!prep} style={{ display: "none" }} onChange={e => { addArq(e.target.files); e.target.value = ""; }} /></label>
      {anexos.map((a, i) => <span key={i} className="mv-anx">{a.tipo === "img" ? <img src={a.url} /> : a.tipo === "pdf" ? "📄" : "🎬"}<button onClick={() => setAnexos(x => x.filter((_, j) => j !== i))}>×</button></span>)}
    </div>
    <button className="mv-principal" disabled={env || !!prep} onClick={enviar}>{env ? "Registrando…" : "Registrar cliente"}</button>
    <div className="mv-dica" style={{ marginTop: 8 }}>{direto ? "O cliente entra na agenda da loja e na fila para definir o vendedor." : "A Supervisão Marketing direciona o consultor e completa o que faltar."}</div>
  </div>;
}
