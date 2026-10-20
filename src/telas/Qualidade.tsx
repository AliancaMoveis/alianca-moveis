// ⭐ Pesquisa de satisfação: gerar e enviar o link ao cliente (WhatsApp), acompanhar respostas,
// tratar notas baixas e ver o painel de qualidade. Acesso: Gestão, donos, call center, supervisão e pós-venda (o banco confere).
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtDate, fmtDateTime, hojeISO, isoLocal, linkWhats } from "../lib/regras";
import { ETAPAS, calcNps, linkAvaliacao, msgAvaliacao, type Etapa } from "../lib/qualidade";
import { PERIODOS, periodoDe, type Per } from "./Anuncios";

const MOCK = !!(import.meta as any).env?.VITE_MOCK;
const padraoModelos = () => (Object.keys(ETAPAS) as Etapa[]).map((k, i) => ({ etapa: k, nome: ETAPAS[k].nome, titulo: ETAPAS[k].titulo, resp: ETAPAS[k].resp, perguntas: [...ETAPAS[k].perguntas], ativa: true, ordem: i + 1 }));
// estrelas de cada pergunta (novas respostas: lista; antigas: p1..p3)
const estDe = (a: any): (number | null)[] => Array.isArray(a.estrelas) && a.estrelas.length ? a.estrelas : [a.p1, a.p2, a.p3].filter((x: any) => x != null);
const exemplo = (): any[] => {
  const h = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
  return [
    { id: "e1", token: "x1", etapa: "montagem", cliente: "Mariana Souza", telefone: "41999990001", responsavel: "João Montador", servico_em: hojeISO(), criado_em: h(1), enviado_em: h(1), respondido_em: h(0.5), nps: 10, p1: 5, p2: 5, p3: 5, comentario: "Muito caprichoso, deixou tudo limpo.", pode_ligar: true },
    { id: "e2", token: "x2", etapa: "montagem", cliente: "Carlos Lima", telefone: "41999990002", responsavel: "Carlos Montador", servico_em: hojeISO(), criado_em: h(2), enviado_em: h(2), respondido_em: h(1.5), nps: 4, p1: 3, p2: 4, p3: 2, comentario: "Faltou um puxador e a porta ficou torta.", pode_ligar: true },
    { id: "e3", token: "x3", etapa: "montagem", cliente: "Ana Paula", telefone: "41999990003", responsavel: "João Montador", servico_em: hojeISO(), criado_em: h(3), enviado_em: h(3), respondido_em: null },
  ];
};

export default function Qualidade() {
  const { R, st } = useApp() as any;
  const [aba, setAba] = useState<"enviar" | "enviadas" | "baixas" | "painel" | "perguntas">("enviar");
  // perguntas de cada etapa (editáveis na aba Perguntas); sem banco (teste) usa o padrão
  const [mods, setMods] = useState<any[] | null>(null);
  const carregarMods = () => A.avaliacaoModelos().then(m => setMods(m || padraoModelos())).catch(() => setMods(padraoModelos()));
  useEffect(() => { carregarMods(); }, []);
  const M: Record<string, any> = Object.fromEntries((mods || padraoModelos()).map((m: any) => [m.etapa, m]));
  const [lista, setLista] = useState<any[] | null>(null); const [erro, setErro] = useState("");
  const carregar = () => { if (MOCK) { setLista(exemplo()); return; } const d = new Date(); d.setDate(d.getDate() - 180);
    A.avaliacoesListar(d.toISOString()).then(setLista).catch((e: any) => { setErro(e.message); setLista([]); }); };
  useEffect(carregar, []);
  const baixas = (lista || []).filter(a => a.respondido_em && a.nps != null && a.nps <= 6 && !a.tratado_em);
  const Tab = ({ k, l, n }: any) => <button className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{l}{n ? <i>{n}</i> : null}</button>;
  return <section className="view active ql">
    <div className="view-head"><div><h2>⭐ Pesquisa de satisfação</h2><p>Mande o link da pesquisa para o cliente pelo WhatsApp depois da montagem (ou de outra etapa). Nota de 0 a 6 avisa o pós-venda e a Gestão para ligar.</p></div></div>
    <div className="subnav"><Tab k="enviar" l="📩 Enviar pesquisa" /><Tab k="enviadas" l="Enviadas" /><Tab k="baixas" l="⚠️ Notas baixas" n={baixas.length} /><Tab k="painel" l="📊 Painel" /><Tab k="perguntas" l="📝 Perguntas" /></div>
    {erro && <div className="ro-note">Não consegui carregar as pesquisas: {erro}</div>}
    {aba === "enviar" && <Enviar recarregar={carregar} M={M} mods={mods || padraoModelos()} />}
    {aba === "enviadas" && <Enviadas lista={lista} recarregar={carregar} />}
    {aba === "baixas" && <Baixas lista={lista} recarregar={carregar} M={M} />}
    {aba === "painel" && <Painel lista={lista} M={M} mods={mods || padraoModelos()} />}
    {aba === "perguntas" && <Perguntas mods={mods || padraoModelos()} recarregar={carregarMods} />}
    {R.ehGestao() && aba === "painel" && <LinkGoogle atual={(st.config || {}).googleReview || ""} />}
  </section>;
}

function Enviar({ recarregar, M, mods }: { recarregar: () => void; M: Record<string, any>; mods: any[] }) {
  const { R, st, toast } = useApp() as any;
  const ontem = isoLocal(new Date(Date.now() - 864e5));
  const [f, setF] = useState({ cliente: "", telefone: "", etapa: "montagem" as Etapa, responsavel: "", servicoEm: ontem, chamadoId: "" });
  const [q, setQ] = useState(""); const [gerado, setGerado] = useState<any>(null); const [enviando, setEnviando] = useState(false);
  const sem = (t: string) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const achados = useMemo(() => { const b = sem(q.trim()), d = q.replace(/\D/g, ""); if (b.length < 3) return [];
    return (st.chamados || []).filter((c: any) => c.telefone && String(c.telefone).replace(/\D/g, "").length >= 10 && (sem(c.cliente).includes(b) || (d.length >= 4 && (String(c.telefone).replace(/\D/g, "").includes(d) || String(c.pedido || "").includes(d)))))
      .slice(0, 8); }, [q, st.chamados]);
  const resp = f.etapa === "montagem" ? (st.montadores || []).filter((m: any) => m.ativo).map((m: any) => m.nome)
    : f.etapa === "loja" ? R.projetistas().map((u: any) => u.nome) : [];
  const gerar = async () => {
    if (!f.cliente.trim()) { toast("Informe o nome do cliente"); return; }
    if (f.telefone.replace(/\D/g, "").length < 10) { toast("Informe o telefone do cliente com DDD"); return; }
    setEnviando(true);
    try {
      const r = MOCK ? { id: "m1", token: "exemplo", reaproveitada: false } : await A.avaliacaoCriar(f);
      const link = linkAvaliacao(r.token); const msg = msgAvaliacao(f.etapa, f.cliente, link, f.servicoEm);
      setGerado({ ...r, link, msg, tel: f.telefone, cliente: f.cliente });
      if (r.reaproveitada) toast("Este cliente já tinha uma pesquisa aberta — o mesmo link foi usado");
      recarregar();
    } catch (e: any) { toast(e.message || "Não foi possível gerar a pesquisa"); }
    finally { setEnviando(false); }
  };
  const abrirWhats = () => { if (!gerado) return; const href = linkWhats(gerado.tel, gerado.msg); if (href) window.open(href, "_blank", "noopener");
    if (!MOCK) A.avaliacaoEnviada(gerado.id).then(recarregar).catch(() => null); };
  const copiar = async () => { try { await navigator.clipboard.writeText(gerado.msg); toast("Mensagem copiada"); } catch { toast("Não consegui copiar"); } };
  if (gerado) return <div className="ql-card ql-ok">
    <h3>✓ Pesquisa pronta para {gerado.cliente}</h3>
    <pre className="ql-msg">{gerado.msg}</pre>
    <div className="ql-bts"><button className="btn primary" onClick={abrirWhats}>Abrir no WhatsApp e enviar</button><button className="btn" onClick={copiar}>Copiar mensagem</button>
      <button className="btn ghost" onClick={() => { setGerado(null); setF({ cliente: "", telefone: "", etapa: f.etapa, responsavel: "", servicoEm: ontem, chamadoId: "" }); setQ(""); }}>Nova pesquisa</button></div>
  </div>;
  return <div className="ql-card">
    <div className="field"><label>1. Sobre o que é a pesquisa?</label>
      <div className="ql-temas">{mods.filter((m: any) => m.ativa !== false).map((m: any) => <button key={m.etapa} type="button" className={"ql-tema" + (f.etapa === m.etapa ? " on" : "")} onClick={() => setF({ ...f, etapa: m.etapa, responsavel: "" })}>
        <b>{m.nome}</b><span>{m.perguntas.length} pergunta{m.perguntas.length === 1 ? "" : "s"} · {m.titulo}</span></button>)}</div></div>
    <div className="field"><label>2. Buscar cliente no 360 (nome, telefone ou nº da venda)</label>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Ex.: Mariana, 41 99999, 1308706" />
      {achados.length > 0 && <div className="ql-achados">{achados.map((c: any) => <button key={c.id} type="button" onClick={() => { setF({ ...f, cliente: c.cliente, telefone: c.telefone, chamadoId: c.id }); setQ(""); }}>
        <b>{c.cliente}</b><span>{c.telefone} · {c.id}{c.pedido ? " · venda " + c.pedido : ""}</span></button>)}</div>}</div>
    <div className="ql-grid">
      <div className="field"><label>Nome do cliente *</label><input value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value, chamadoId: "" })} /></div>
      <div className="field"><label>Telefone (WhatsApp, com DDD) *</label><input value={f.telefone} inputMode="tel" onChange={e => setF({ ...f, telefone: e.target.value })} placeholder="41 99999-9999" /></div>
      <div className="field"><label>{(M[f.etapa] || ETAPAS[f.etapa]).resp} (opcional)</label>
        {resp.length ? <select value={f.responsavel} onChange={e => setF({ ...f, responsavel: e.target.value })}><option value="">Não informar</option>{resp.map((n: string) => <option key={n} value={n}>{n}</option>)}</select>
          : <input value={f.responsavel} onChange={e => setF({ ...f, responsavel: e.target.value })} placeholder="Nome" />}</div>
      <div className="field"><label>Data do serviço</label><input type="date" value={f.servicoEm} max={hojeISO()} onChange={e => setF({ ...f, servicoEm: e.target.value })} /></div>
    </div>
    <div className="ql-perg"><b>O cliente vai responder:</b> nota de 0 a 10 (indicaria a Aliança?) · {((M[f.etapa] || ETAPAS[f.etapa]).perguntas || []).join(" · ")} · comentário opcional.</div>
    <div className="ql-bts"><button className="btn primary" disabled={enviando} onClick={gerar}>{enviando ? "Gerando…" : "Gerar pesquisa"}</button></div>
  </div>;
}

function Enviadas({ lista, recarregar }: any) {
  const { toast } = useApp() as any;
  const [q, setQ] = useState("");
  if (!lista) return <div className="dn-vazio">Carregando…</div>;
  const l = lista.filter((a: any) => !q.trim() || (a.cliente + " " + a.telefone + " " + (a.responsavel || "")).toLowerCase().includes(q.trim().toLowerCase()));
  const reenviar = (a: any) => { const href = linkWhats(a.telefone, msgAvaliacao(a.etapa, a.cliente, linkAvaliacao(a.token), a.servico_em || "")); if (href) window.open(href, "_blank", "noopener");
    if (!MOCK) A.avaliacaoEnviada(a.id).then(recarregar).catch(() => null); };
  return <div className="ql-card">
    <input className="cv-busca" type="search" placeholder="🔎 Buscar cliente, telefone ou responsável" value={q} onChange={e => setQ(e.target.value)} />
    <div className="ql-tab-wrap"><table className="ql-tab"><thead><tr><th>Gerada</th><th>Cliente</th><th>Etapa</th><th>Responsável</th><th>Situação</th><th></th></tr></thead>
      <tbody>{l.map((a: any) => <tr key={a.id}><td>{fmtDateTime(a.criado_em).slice(0, 10)}</td><td><b>{a.cliente}</b><small>{a.telefone}</small></td><td>{ETAPAS[a.etapa as Etapa]?.nome || a.etapa}</td><td>{a.responsavel || "—"}</td>
        <td>{a.respondido_em ? <span className={"ql-nota " + (a.nps >= 9 ? "boa" : a.nps <= 6 ? "ruim" : "media")}>nota {a.nps}</span> : a.enviado_em ? <span className="ql-pend">aguardando resposta</span> : <span className="ql-pend">não enviada</span>}</td>
        <td>{!a.respondido_em && <button className="btn sm" onClick={() => reenviar(a)}>{a.enviado_em ? "Reenviar" : "Enviar"}</button>}
          <button className="btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(linkAvaliacao(a.token)); toast("Link copiado"); } catch { toast("Não consegui copiar"); } }}>Copiar link</button></td></tr>)}</tbody></table></div>
    {!l.length && <div className="dn-vazio">Nenhuma pesquisa ainda.</div>}
  </div>;
}

function Baixas({ lista, recarregar, M }: any) {
  const { executar: ex } = useApp() as any;
  const [verTratadas, setVerTratadas] = useState(false);
  if (!lista) return <div className="dn-vazio">Carregando…</div>;
  const ruins = lista.filter((a: any) => a.respondido_em && a.nps != null && a.nps <= 6);
  const abertas = ruins.filter((a: any) => !a.tratado_em), tratadas = ruins.filter((a: any) => a.tratado_em);
  const tratar = async (a: any) => { const obs = prompt("O que foi feito com " + a.cliente + "? (ex.: liguei, troca do puxador agendada para 22/10)"); if (!obs || !obs.trim()) return;
    if (MOCK) return; if (await ex(() => A.avaliacaoTratar(a.id, obs.trim()), "Marcado como resolvido")) recarregar(); };
  const Card = ({ a }: any) => <div className="ql-baixa"><b className="ql-n">{a.nps}</b>
    <div className="ql-bx"><b>{a.cliente}</b><span>{(M[a.etapa] || ETAPAS[a.etapa as Etapa] || {}).nome}{a.responsavel ? " com " + a.responsavel : ""} · respondeu {fmtDateTime(a.respondido_em)}</span>
      <span className="ql-est">{(a.perguntas || (M[a.etapa] || {}).perguntas || []).map((p: string, i: number) => <i key={i}>{p.split(" (")[0].replace(/\?$/, "")}: <b>{estDe(a)[i] ?? "—"}★</b></i>)}</span>
      {a.comentario && <q>{a.comentario}</q>}
      {a.tratado_em ? <span className="ql-trat">✓ {a.tratado_por} · {fmtDateTime(a.tratado_em)} — {a.tratado_obs}</span> : <span>{a.pode_ligar ? "📞 Pode ligar: " + a.telefone : "Preferiu não receber ligação"}</span>}</div>
    {!a.tratado_em && <div className="ql-bts col"><a className="btn sm" href={"tel:" + String(a.telefone).replace(/\D/g, "")}>Ligar</a><button className="btn primary sm" onClick={() => tratar(a)}>Marcar resolvido</button></div>}</div>;
  return <div className="ql-card">
    {abertas.length ? abertas.map((a: any) => <Card key={a.id} a={a} />) : <div className="dn-vazio">Nenhuma nota baixa esperando retorno. 👏</div>}
    {tratadas.length > 0 && <><button className="btn ghost sm" onClick={() => setVerTratadas(!verTratadas)}>{verTratadas ? "▾" : "▸"} Resolvidas ({tratadas.length})</button>{verTratadas && tratadas.map((a: any) => <Card key={a.id} a={a} />)}</>}
  </div>;
}

function Painel({ lista, M, mods }: any) {
  const [per, setPer] = useState<Per>("mes"); const hoje = hojeISO();
  const [pDe, setPDe] = useState(hoje.slice(0, 8) + "01"); const [pAte, setPAte] = useState(hoje);
  const [etapa, setEtapa] = useState<Etapa>("montagem");
  if (!lista) return <div className="dn-vazio">Carregando…</div>;
  const { de, ate } = periodoDe(per, pDe, pAte);
  const no = (v: any) => { const s = String(v || "").slice(0, 10); return !!s && s >= de && s <= ate; };
  const da = lista.filter((a: any) => a.etapa === etapa);
  const env = da.filter((a: any) => no(a.enviado_em || a.criado_em));
  const resp = da.filter((a: any) => a.respondido_em && no(a.respondido_em));
  const nps = calcNps(resp.map((a: any) => a.nps));
  const med = (i: number) => { const v = resp.map((a: any) => estDe(a)[i]).filter((x: any) => x != null); return v.length ? (v.reduce((s: number, x: number) => s + x, 0) / v.length) : null; };
  const f1 = (x: number | null) => x == null ? "—" : x.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pr: string[] = (M[etapa] || ETAPAS[etapa]).perguntas;
  const por: Record<string, any[]> = {}; resp.forEach((a: any) => { const k = a.responsavel || "Não informado"; (por[k] = por[k] || []).push(a); });
  const linhas = Object.entries(por).map(([k, l]) => ({ k, n: l.length, nps: calcNps(l.map(a => a.nps)), m: pr.map((_, i) => { const v = l.map(a => estDe(a)[i]).filter((x: any) => x != null); return v.length ? v.reduce((s: number, x: number) => s + x, 0) / v.length : null; }) })).sort((a, b) => b.n - a.n);
  const ruins = resp.filter((a: any) => a.nps <= 6), abertas = ruins.filter((a: any) => !a.tratado_em);
  const coment = resp.filter((a: any) => a.comentario).slice(0, 9);
  const corN = (v: number | null) => v == null ? undefined : v >= 70 ? "#1f7a44" : v >= 40 ? "#a8700a" : "#b3412f";
  return <div className="ql-painel">
    <div className="an-per">{PERIODOS.map(([k, l]) => <button key={k} className={"chip" + (per === k ? " on" : "")} onClick={() => setPer(k)}>{l}</button>)}
      {per === "pers" && <span className="an-pers"><input type="date" value={pDe} max={pAte} onChange={e => setPDe(e.target.value || pDe)} /> até <input type="date" value={pAte} min={pDe} max={hoje} onChange={e => setPAte(e.target.value || pAte)} /></span>}</div>
    <div className="an-per">{mods.map((m: any) => <button key={m.etapa} className={"chip" + (etapa === m.etapa ? " on" : "")} onClick={() => setEtapa(m.etapa)}>{m.nome}</button>)}</div>
    <div className="pb-per">{fmtDate(de)} a {fmtDate(ate)}</div>
    <div className="pb-bigs">
      <div className="pb-big"><b style={{ color: corN(nps) }}>{nps == null ? "—" : nps}</b><span>NPS · {(M[etapa] || ETAPAS[etapa]).nome.toLowerCase()}</span><span className="pb-comp neutro">{resp.length ? Math.round(resp.filter((a: any) => a.nps >= 9).length / resp.length * 100) + "% notas 9–10 · " + Math.round(ruins.length / resp.length * 100) + "% notas 0–6" : "sem respostas no período"}</span></div>
      <div className="pb-big"><b>{resp.length}<small style={{ fontSize: 16, color: "var(--ink-faint)" }}> / {env.length}</small></b><span>Responderam / enviadas</span><span className="pb-comp neutro">{env.length ? Math.round(resp.length / env.length * 100) + "% de resposta" : ""}</span></div>
      <div className="pb-big ql-med"><span>Notas médias (1 a 5)</span>{pr.map((p, i) => <div key={i}><span>{p.split(" (")[0]}</span><b>{f1(med(i))}</b></div>)}</div>
      <div className={"pb-big" + (abertas.length ? " ql-alerta" : "")}><b style={{ color: abertas.length ? "#b3412f" : undefined }}>{ruins.length}</b><span>Clientes insatisfeitos (0–6)</span><span className="pb-comp neutro">{abertas.length ? abertas.length + " esperando retorno" : "todos tratados"}</span></div>
    </div>
    <div className="panel"><h3>Por {(M[etapa] || ETAPAS[etapa]).resp.toLowerCase()}</h3>
      {linhas.length ? <div className="ql-tab-wrap"><table className="ql-tab"><thead><tr><th>{(M[etapa] || ETAPAS[etapa]).resp}</th><th>Respostas</th><th>NPS</th>{pr.map((p, i) => <th key={i}>{p.split(" (")[0]}</th>)}</tr></thead>
        <tbody>{linhas.map(x => <tr key={x.k}><td><b>{x.k}</b></td><td>{x.n}</td><td style={{ color: corN(x.nps), fontWeight: 700 }}>{x.nps}</td>{x.m.map((v, i) => <td key={i}>{f1(v)}</td>)}</tr>)}</tbody></table></div>
        : <div className="dn-vazio">Sem respostas no período.</div>}</div>
    <div className="panel"><h3>Comentários</h3>
      {coment.length ? <div className="ql-coms">{coment.map((a: any) => <div key={a.id} className="ql-com"><div><b className={"ql-nota " + (a.nps >= 9 ? "boa" : a.nps <= 6 ? "ruim" : "media")}>nota {a.nps}</b><span>{a.cliente.split(" ")[0]}{a.responsavel ? " · " + a.responsavel : ""} · {fmtDate(a.respondido_em)}</span></div><q>{a.comentario}</q></div>)}</div>
        : <div className="dn-vazio">Nenhum comentário no período.</div>}</div>
  </div>;
}

function LinkGoogle({ atual }: { atual: string }) {
  const { executar: ex } = useApp() as any;
  const [u, setU] = useState(atual);
  return <div className="ql-card" style={{ marginTop: 14 }}><div className="field"><label>Link para avaliar a loja no Google (aparece para quem dá nota 9 ou 10)</label>
    <div className="inline-2"><input value={u} onChange={e => setU(e.target.value)} placeholder="https://g.page/r/…/review" /><button className="btn sm" onClick={() => ex(() => A.avaliacaoGoogle(u), "Link do Google salvo")}>Salvar</button></div>
    <small className="hint">No Google Meu Negócio: Perfil da empresa → Pedir avaliações → copiar o link.</small></div></div>;
}

// 📝 perguntas de cada pesquisa: a Gestão edita; as pesquisas já enviadas guardam as perguntas da época
function Perguntas({ mods, recarregar }: { mods: any[]; recarregar: () => void }) {
  const { R } = useApp() as any;
  const pode = R.ehGestao();
  return <div className="ql-pergs">
    <div className="ql-perg">Toda pesquisa tem sempre: <b>nota de 0 a 10</b> (“quanto você indicaria a Aliança para um amigo?”) e <b>comentário opcional</b>. Abaixo ficam as perguntas de estrelas (1 a 5) de cada tema — de 1 a 5 perguntas.{pode ? " Mudanças valem para as próximas pesquisas enviadas." : " Só a Gestão altera."}</div>
    {mods.map(m => <Modelo key={m.etapa + (m.atualizado_em || "")} m={m} pode={pode} recarregar={recarregar} />)}
  </div>;
}
function Modelo({ m, pode, recarregar }: any) {
  const { executar: ex } = useApp() as any;
  const [f, setF] = useState({ ...m, perguntas: [...m.perguntas] });
  const mudou = JSON.stringify(f) !== JSON.stringify({ ...m, perguntas: m.perguntas });
  const setP = (i: number, v: string) => { const p = [...f.perguntas]; p[i] = v; setF({ ...f, perguntas: p }); };
  const salvar = async () => { if (MOCK) return; if (await ex(() => A.avaliacaoModeloSalvar(f), "Perguntas de " + f.nome + " salvas")) recarregar(); };
  return <div className={"ql-card ql-mod" + (f.ativa === false ? " off" : "")}>
    <div className="ql-mod-h"><b>{f.nome}</b>{pode && <label className="ql-ativa"><input type="checkbox" checked={f.ativa !== false} onChange={e => setF({ ...f, ativa: e.target.checked })} /> ativa</label>}
      {m.atualizado_por && <small>alterado por {m.atualizado_por} · {fmtDateTime(m.atualizado_em)}</small>}</div>
    <div className="ql-grid">
      <div className="field"><label>Nome do tema</label><input value={f.nome} disabled={!pode} onChange={e => setF({ ...f, nome: e.target.value })} /></div>
      <div className="field"><label>Título que o cliente vê</label><input value={f.titulo} disabled={!pode} onChange={e => setF({ ...f, titulo: e.target.value })} /></div>
      <div className="field"><label>Quem é avaliado</label><input value={f.resp} disabled={!pode} onChange={e => setF({ ...f, resp: e.target.value })} placeholder="Ex.: Montador" /></div>
    </div>
    <div className="field"><label>Perguntas de estrelas</label>
      {f.perguntas.map((p: string, i: number) => <div key={i} className="ql-pq"><span className="ql-pn">{i + 1}</span><input value={p} disabled={!pode} onChange={e => setP(i, e.target.value)} />
        {pode && f.perguntas.length > 1 && <button type="button" className="btn ghost sm" onClick={() => { if (confirm("Tirar a pergunta “" + p + "”?")) setF({ ...f, perguntas: f.perguntas.filter((_: any, j: number) => j !== i) }); }}>Tirar</button>}</div>)}
      {pode && f.perguntas.length < 5 && <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setF({ ...f, perguntas: [...f.perguntas, ""] })}>＋ Pergunta</button>}</div>
    {pode && <div className="ql-bts"><button className="btn primary sm" disabled={!mudou} onClick={salvar}>Salvar</button>{mudou && <button className="btn ghost sm" onClick={() => setF({ ...m, perguntas: [...m.perguntas] })}>Desfazer</button>}</div>}
  </div>;
}
