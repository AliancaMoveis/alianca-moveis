// ⭐ Pesquisa de satisfação — questionário ÚNICO da jornada do cliente (Venda, Medição, Checklist, Entrega, Montagem),
// enviado depois da montagem. Gerar e mandar o link pelo WhatsApp, acompanhar respostas, tratar notas baixas,
// painel de qualidade e (Gestão) editar as perguntas. Acesso: Gestão, donos, call center, supervisão e pós-venda (o banco confere).
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtDate, fmtDateTime, hojeISO, isoLocal, linkWhats } from "../lib/regras";
import { ETAPAS, QUESTIONARIO_PADRAO, calcNps, linkAvaliacao, msgAvaliacao, msgPesquisa, porSecao, type Etapa, type Secao } from "../lib/qualidade";
import { PERIODOS, periodoDe, type Per } from "./Anuncios";

const MOCK = !!(import.meta as any).env?.VITE_MOCK;
// estrelas da resposta (novas: lista; antigas: p1..p3)
const estDe = (a: any): (number | null)[] => Array.isArray(a.estrelas) && a.estrelas.length ? a.estrelas : [a.p1, a.p2, a.p3].filter((x: any) => x != null);
// etapas da pesquisa: a cópia guardada no envio; pesquisas antigas (de uma etapa só) viram uma etapa
const secoesDe = (a: any): Secao[] => Array.isArray(a.secoes) && a.secoes.length ? a.secoes
  : [{ nome: (ETAPAS[a.etapa as Etapa] || ETAPAS.montagem).nome, quem: (ETAPAS[a.etapa as Etapa] || ETAPAS.montagem).resp, perguntas: a.perguntas || (ETAPAS[a.etapa as Etapa] || ETAPAS.montagem).perguntas }];
const media = (v: (number | null)[]) => { const x = v.filter((n): n is number => n != null); return x.length ? x.reduce((s, n) => s + n, 0) / x.length : null; };
const f1 = (x: number | null) => x == null ? "—" : x.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const corN = (v: number | null) => v == null ? undefined : v >= 70 ? "#1f7a44" : v >= 40 ? "#a8700a" : "#b3412f";
const corE = (v: number | null) => v == null ? undefined : v >= 4.5 ? "#1f7a44" : v >= 3.5 ? "#a8700a" : "#b3412f";
const msgDe = (a: any) => Array.isArray(a.secoes) && a.secoes.length ? msgPesquisa(a.cliente, linkAvaliacao(a.token)) : msgAvaliacao(a.etapa, a.cliente, linkAvaliacao(a.token), a.servico_em || "");

const exemplo = (): any[] => {
  const h = (d: number) => new Date(Date.now() - d * 864e5).toISOString(); const S = QUESTIONARIO_PADRAO.secoes;
  return [
    { id: "e1", token: "x1", etapa: "montagem", cliente: "Mariana Souza", telefone: "41999990001", responsavel: "João Montador", pessoas: { Montador: "João Montador", Vendedor: "Roy" }, secoes: S, criado_em: h(1), enviado_em: h(1), respondido_em: h(0.5), nps: 10, estrelas: [5, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5, 5], comentario: "Muito caprichoso, deixou tudo limpo.", pode_ligar: true },
    { id: "e2", token: "x2", etapa: "montagem", cliente: "Carlos Lima", telefone: "41999990002", responsavel: "Carlos Montador", pessoas: { Montador: "Carlos Montador", Vendedor: "Giovanna" }, secoes: S, criado_em: h(2), enviado_em: h(2), respondido_em: h(1.5), nps: 4, estrelas: [4, 4, 4, 3, 4, null, null, 3, 3, 3, 2, 2], comentario: "Faltou um puxador e a porta ficou torta.", pode_ligar: true },
    { id: "e3", token: "x3", etapa: "montagem", cliente: "Ana Paula", telefone: "41999990003", responsavel: "João Montador", secoes: S, criado_em: h(3), enviado_em: h(3), respondido_em: null },
  ];
};

export default function Qualidade() {
  const { R, st } = useApp() as any;
  const [aba, setAba] = useState<"enviar" | "enviadas" | "baixas" | "painel" | "perguntas">("enviar");
  const [lista, setLista] = useState<any[] | null>(null); const [erro, setErro] = useState("");
  const [Q, setQ] = useState<{ titulo: string; secoes: Secao[]; atualizado_por?: string; atualizado_em?: string }>(QUESTIONARIO_PADRAO);
  const carregar = () => { if (MOCK) { setLista(exemplo()); return; } const d = new Date(); d.setDate(d.getDate() - 180);
    A.avaliacoesListar(d.toISOString()).then(setLista).catch((e: any) => { setErro(e.message); setLista([]); }); };
  const carregarQ = () => A.questionario().then(q => { if (q) setQ(q); }).catch(() => null);
  useEffect(() => { carregar(); carregarQ(); }, []);
  const baixas = (lista || []).filter(a => a.respondido_em && a.nps != null && a.nps <= 6 && !a.tratado_em);
  const Tab = ({ k, l, n }: any) => <button className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{l}{n ? <i>{n}</i> : null}</button>;
  return <section className="view active ql">
    <div className="view-head"><div><h2>⭐ Pesquisa de satisfação</h2><p>Um questionário só, com toda a jornada do cliente: venda, medição, checklist, entrega e montagem. Mande o link pelo WhatsApp depois da montagem. Nota de 0 a 6 avisa o pós-venda e a Gestão para ligar.</p></div></div>
    <div className="subnav"><Tab k="enviar" l="📩 Enviar pesquisa" /><Tab k="enviadas" l="Enviadas" /><Tab k="baixas" l="⚠️ Notas baixas" n={baixas.length} /><Tab k="painel" l="📊 Painel" /><Tab k="perguntas" l="📝 Perguntas" /></div>
    {erro && <div className="ro-note">Não consegui carregar as pesquisas: {erro}</div>}
    {aba === "enviar" && <Enviar recarregar={carregar} Q={Q} />}
    {aba === "enviadas" && <Enviadas lista={lista} recarregar={carregar} />}
    {aba === "baixas" && <Baixas lista={lista} recarregar={carregar} />}
    {aba === "painel" && <Painel lista={lista} Q={Q} />}
    {aba === "perguntas" && <Perguntas Q={Q} recarregar={carregarQ} />}
    {R.ehGestao() && aba === "painel" && <LinkGoogle atual={(st.config || {}).googleReview || ""} />}
  </section>;
}

function Enviar({ recarregar, Q }: { recarregar: () => void; Q: { titulo: string; secoes: Secao[] } }) {
  const { R, st, toast } = useApp() as any;
  const [f, setF] = useState({ cliente: "", telefone: "", servicoEm: isoLocal(new Date(Date.now() - 864e5)), chamadoId: "" });
  const [pessoas, setPessoas] = useState<Record<string, string>>({});
  const [q, setQ] = useState(""); const [gerado, setGerado] = useState<any>(null); const [enviando, setEnviando] = useState(false);
  const sem = (t: string) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const achados = useMemo(() => { const b = sem(q.trim()), d = q.replace(/\D/g, ""); if (b.length < 3) return [];
    return (st.chamados || []).filter((c: any) => c.telefone && String(c.telefone).replace(/\D/g, "").length >= 10 && (sem(c.cliente).includes(b) || (d.length >= 4 && (String(c.telefone).replace(/\D/g, "").includes(d) || String(c.pedido || "").includes(d)))))
      .slice(0, 8); }, [q, st.chamados]);
  const quem = Array.from(new Set(Q.secoes.map(s => s.quem).filter(Boolean)));
  const opcoes = (k: string): string[] => /montador/i.test(k) ? (st.montadores || []).filter((m: any) => m.ativo).map((m: any) => m.nome)
    : /vendedor|projetista/i.test(k) ? R.projetistas().map((u: any) => u.nome) : [];
  const escolher = (c: any) => {
    setF({ ...f, cliente: c.cliente, telefone: c.telefone, chamadoId: c.id }); setQ("");
    // vendedor que atendeu: já vem do cliente do 360
    const vk = quem.find(k => /vendedor/i.test(k));
    if (vk && c.atendenteId) setPessoas(p => ({ ...p, [vk]: R.nomeUser(c.atendenteId) }));
  };
  const gerar = async () => {
    if (!f.cliente.trim()) { toast("Informe o nome do cliente"); return; }
    if (f.telefone.replace(/\D/g, "").length < 10) { toast("Informe o telefone do cliente com DDD"); return; }
    setEnviando(true);
    try {
      const r = MOCK ? { id: "m1", token: "exemplo", reaproveitada: false } : await A.avaliacaoCriar2({ ...f, pessoas });
      const link = linkAvaliacao(r.token);
      setGerado({ ...r, link, msg: msgPesquisa(f.cliente, link), tel: f.telefone, cliente: f.cliente });
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
      <button className="btn ghost" onClick={() => { setGerado(null); setF({ cliente: "", telefone: "", servicoEm: f.servicoEm, chamadoId: "" }); setPessoas({}); setQ(""); }}>Nova pesquisa</button></div>
  </div>;
  return <div className="ql-card">
    <div className="field"><label>1. Buscar cliente no 360 (nome, telefone ou nº da venda)</label>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Ex.: Mariana, 41 99999, 1308706" />
      {achados.length > 0 && <div className="ql-achados">{achados.map((c: any) => <button key={c.id} type="button" onClick={() => escolher(c)}>
        <b>{c.cliente}</b><span>{c.telefone} · {c.id}{c.pedido ? " · venda " + c.pedido : ""}</span></button>)}</div>}</div>
    <div className="ql-grid">
      <div className="field"><label>Nome do cliente *</label><input value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value, chamadoId: "" })} /></div>
      <div className="field"><label>Telefone (WhatsApp, com DDD) *</label><input value={f.telefone} inputMode="tel" onChange={e => setF({ ...f, telefone: e.target.value })} placeholder="41 99999-9999" /></div>
      <div className="field"><label>Data da montagem</label><input type="date" value={f.servicoEm} max={hojeISO()} onChange={e => setF({ ...f, servicoEm: e.target.value })} /></div>
    </div>
    <div className="field"><label>2. Quem atendeu o cliente (opcional — serve para o painel por pessoa)</label>
      <div className="ql-grid">{quem.map(k => { const op = opcoes(k); return <div key={k} className="field"><label>{k}</label>
        {op.length ? <select value={pessoas[k] || ""} onChange={e => setPessoas({ ...pessoas, [k]: e.target.value })}><option value="">Não informar</option>{op.map(n => <option key={n} value={n}>{n}</option>)}</select>
          : <input value={pessoas[k] || ""} onChange={e => setPessoas({ ...pessoas, [k]: e.target.value })} placeholder="Nome" />}</div>; })}</div></div>
    <div className="ql-perg"><b>O cliente vai responder:</b> nota de 0 a 10 (indicaria a Aliança?) · {Q.secoes.map(s => s.nome + " (" + s.perguntas.length + ")").join(" · ")} · comentário opcional. Em cada etapa ele pode marcar “não participei”.</div>
    <div className="ql-bts"><button className="btn primary" disabled={enviando} onClick={gerar}>{enviando ? "Gerando…" : "Gerar pesquisa"}</button></div>
  </div>;
}

function Enviadas({ lista, recarregar }: any) {
  const { toast } = useApp() as any;
  const [q, setQ] = useState("");
  if (!lista) return <div className="dn-vazio">Carregando…</div>;
  const l = lista.filter((a: any) => !q.trim() || (a.cliente + " " + a.telefone + " " + (a.responsavel || "") + " " + Object.values(a.pessoas || {}).join(" ")).toLowerCase().includes(q.trim().toLowerCase()));
  const reenviar = (a: any) => { const href = linkWhats(a.telefone, msgDe(a)); if (href) window.open(href, "_blank", "noopener");
    if (!MOCK) A.avaliacaoEnviada(a.id).then(recarregar).catch(() => null); };
  return <div className="ql-card">
    <input className="cv-busca" type="search" placeholder="🔎 Buscar cliente, telefone, vendedor ou montador" value={q} onChange={e => setQ(e.target.value)} />
    <div className="ql-tab-wrap"><table className="ql-tab"><thead><tr><th>Gerada</th><th>Cliente</th><th>Quem atendeu</th><th>Situação</th><th></th></tr></thead>
      <tbody>{l.map((a: any) => <tr key={a.id}><td>{fmtDateTime(a.criado_em).slice(0, 10)}</td><td><b>{a.cliente}</b><small>{a.telefone}</small></td>
        <td>{Object.keys(a.pessoas || {}).length ? Object.entries(a.pessoas).map(([k, v]: any) => <small key={k}>{k}: {v}</small>) : (a.responsavel || "—")}</td>
        <td>{a.respondido_em ? <span className={"ql-nota " + (a.nps >= 9 ? "boa" : a.nps <= 6 ? "ruim" : "media")}>nota {a.nps}</span> : a.enviado_em ? <span className="ql-pend">aguardando resposta</span> : <span className="ql-pend">não enviada</span>}</td>
        <td>{!a.respondido_em && <button className="btn sm" onClick={() => reenviar(a)}>{a.enviado_em ? "Reenviar" : "Enviar"}</button>}
          <button className="btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(linkAvaliacao(a.token)); toast("Link copiado"); } catch { toast("Não consegui copiar"); } }}>Copiar link</button></td></tr>)}</tbody></table></div>
    {!l.length && <div className="dn-vazio">Nenhuma pesquisa ainda.</div>}
  </div>;
}

// resumo por etapa de uma resposta ("Venda 4,5★ · Medição não participou · …")
function ResumoEtapas({ a }: any) {
  const ps = porSecao(secoesDe(a), estDe(a));
  return <span className="ql-est">{ps.map((s, i) => { const m = media(s.notas); return <i key={i}>{s.nome}: <b style={{ color: corE(m) }}>{m == null ? "não participou" : f1(m) + "★"}</b></i>; })}</span>;
}

function Baixas({ lista, recarregar }: any) {
  const { executar: ex } = useApp() as any;
  const [verTratadas, setVerTratadas] = useState(false);
  if (!lista) return <div className="dn-vazio">Carregando…</div>;
  const ruins = lista.filter((a: any) => a.respondido_em && a.nps != null && a.nps <= 6);
  const abertas = ruins.filter((a: any) => !a.tratado_em), tratadas = ruins.filter((a: any) => a.tratado_em);
  const tratar = async (a: any) => { const obs = prompt("O que foi feito com " + a.cliente + "? (ex.: liguei, troca do puxador agendada para 22/10)"); if (!obs || !obs.trim()) return;
    if (MOCK) return; if (await ex(() => A.avaliacaoTratar(a.id, obs.trim()), "Marcado como resolvido")) recarregar(); };
  const Card = ({ a }: any) => <div className="ql-baixa"><b className="ql-n">{a.nps}</b>
    <div className="ql-bx"><b>{a.cliente}</b><span>{Object.entries(a.pessoas || {}).map(([k, v]) => k + " " + v).join(" · ") || (a.responsavel ? "Montador " + a.responsavel : "")} · respondeu {fmtDateTime(a.respondido_em)}</span>
      <ResumoEtapas a={a} />
      {a.comentario && <q>{a.comentario}</q>}
      {a.tratado_em ? <span className="ql-trat">✓ {a.tratado_por} · {fmtDateTime(a.tratado_em)} — {a.tratado_obs}</span> : <span>{a.pode_ligar ? "📞 Pode ligar: " + a.telefone : "Preferiu não receber ligação"}</span>}</div>
    {!a.tratado_em && <div className="ql-bts col"><a className="btn sm" href={"tel:" + String(a.telefone).replace(/\D/g, "")}>Ligar</a><button className="btn primary sm" onClick={() => tratar(a)}>Marcar resolvido</button></div>}</div>;
  return <div className="ql-card">
    {abertas.length ? abertas.map((a: any) => <Card key={a.id} a={a} />) : <div className="dn-vazio">Nenhuma nota baixa esperando retorno.</div>}
    {tratadas.length > 0 && <><button className="btn ghost sm" onClick={() => setVerTratadas(!verTratadas)}>{verTratadas ? "▾" : "▸"} Resolvidas ({tratadas.length})</button>{verTratadas && tratadas.map((a: any) => <Card key={a.id} a={a} />)}</>}
  </div>;
}

function Painel({ lista, Q }: any) {
  const [per, setPer] = useState<Per>("mes"); const hoje = hojeISO();
  const [pDe, setPDe] = useState(hoje.slice(0, 8) + "01"); const [pAte, setPAte] = useState(hoje);
  const [abre, setAbre] = useState<string>("");
  if (!lista) return <div className="dn-vazio">Carregando…</div>;
  const { de, ate } = periodoDe(per, pDe, pAte);
  const no = (v: any) => { const s = String(v || "").slice(0, 10); return !!s && s >= de && s <= ate; };
  const env = lista.filter((a: any) => no(a.enviado_em || a.criado_em));
  const resp = lista.filter((a: any) => a.respondido_em && no(a.respondido_em));
  const nps = calcNps(resp.map((a: any) => a.nps));
  const ruins = resp.filter((a: any) => a.nps <= 6), abertas = ruins.filter((a: any) => !a.tratado_em);
  // notas por etapa (pelo nome da etapa, juntando versões do questionário) e por pergunta
  const et: Record<string, { quem: string; notas: number[]; perg: Record<string, number[]> }> = {};
  const ordem: string[] = Q.secoes.map((s: Secao) => s.nome);
  resp.forEach((a: any) => porSecao(secoesDe(a), estDe(a)).forEach(s => {
    const e = et[s.nome] = et[s.nome] || { quem: s.quem, notas: [], perg: {} }; if (!ordem.includes(s.nome)) ordem.push(s.nome);
    s.notas.forEach((n, i) => { if (n == null) return; e.notas.push(n); (e.perg[s.perguntas[i]] = e.perg[s.perguntas[i]] || []).push(n); });
  }));
  // por pessoa: cada etapa avaliada com o nome de quem atendeu
  const pessoas: Record<string, Record<string, { n: number; notas: number[]; nps: number[] }>> = {};
  resp.forEach((a: any) => { const pe = a.pessoas || (a.responsavel ? { Montador: a.responsavel } : {});
    porSecao(secoesDe(a), estDe(a)).forEach(s => { const nome = s.quem && pe[s.quem]; if (!nome) return; const m = media(s.notas); if (m == null) return;
      const g = pessoas[s.quem] = pessoas[s.quem] || {}; const x = g[nome] = g[nome] || { n: 0, notas: [], nps: [] }; x.n++; x.notas.push(m); x.nps.push(a.nps); }); });
  const coment = resp.filter((a: any) => a.comentario).slice(0, 9);
  const geral = media(Object.values(et).flatMap(e => e.notas));
  return <div className="ql-painel">
    <div className="an-per">{PERIODOS.map(([k, l]) => <button key={k} className={"chip" + (per === k ? " on" : "")} onClick={() => setPer(k)}>{l}</button>)}
      {per === "pers" && <span className="an-pers"><input type="date" value={pDe} max={pAte} onChange={e => setPDe(e.target.value || pDe)} /> até <input type="date" value={pAte} min={pDe} max={hoje} onChange={e => setPAte(e.target.value || pAte)} /></span>}</div>
    <div className="pb-per">{fmtDate(de)} a {fmtDate(ate)}</div>
    <div className="pb-bigs">
      <div className="pb-big"><b style={{ color: corN(nps) }}>{nps == null ? "—" : nps}</b><span>NPS · indicaria a Aliança</span><span className="pb-comp neutro">{resp.length ? Math.round(resp.filter((a: any) => a.nps >= 9).length / resp.length * 100) + "% notas 9–10 · " + Math.round(ruins.length / resp.length * 100) + "% notas 0–6" : "sem respostas no período"}</span></div>
      <div className="pb-big"><b>{resp.length}<small style={{ fontSize: 16, color: "var(--ink-faint)" }}> / {env.length}</small></b><span>Responderam / enviadas</span><span className="pb-comp neutro">{env.length ? Math.round(resp.length / env.length * 100) + "% de resposta" : ""}</span></div>
      <div className="pb-big"><b style={{ color: corE(geral) }}>{f1(geral)}</b><span>Média geral das estrelas (1 a 5)</span></div>
      <div className={"pb-big" + (abertas.length ? " ql-alerta" : "")}><b style={{ color: abertas.length ? "#b3412f" : undefined }}>{ruins.length}</b><span>Clientes insatisfeitos (0–6)</span><span className="pb-comp neutro">{abertas.length ? abertas.length + " esperando retorno" : ruins.length ? "todos tratados" : ""}</span></div>
    </div>
    <div className="panel"><h3>Nota por etapa da jornada <small style={{ fontWeight: 500, color: "var(--ink-faint)" }}>— clique para ver cada pergunta</small></h3>
      <div className="ql-etapas">{ordem.filter(n => et[n]).map(n => { const e = et[n]; const m = media(e.notas); return <div key={n} className="ql-etapa">
        <button type="button" className="ql-etapa-h" onClick={() => setAbre(abre === n ? "" : n)}><b>{n}</b><span className="ql-barra"><i style={{ width: (m ? m / 5 * 100 : 0) + "%", background: corE(m) }} /></span><b style={{ color: corE(m) }}>{f1(m)}★</b><small>{abre === n ? "▾" : "▸"}</small></button>
        {abre === n && <div className="ql-etapa-q">{Object.entries(e.perg).map(([p, v]) => <div key={p}><span>{p}</span><b style={{ color: corE(media(v)) }}>{f1(media(v))}</b><small>{v.length} resp.</small></div>)}</div>}
      </div>; })}{!Object.keys(et).length && <div className="dn-vazio">Sem respostas no período.</div>}</div></div>
    {Object.entries(pessoas).map(([papel, g]) => <div key={papel} className="panel"><h3>Por {papel.toLowerCase()}</h3>
      <div className="ql-tab-wrap"><table className="ql-tab"><thead><tr><th>{papel}</th><th>Avaliações</th><th>Média da etapa</th><th>NPS dos clientes</th></tr></thead>
        <tbody>{Object.entries(g).sort((a, b) => b[1].n - a[1].n).map(([nome, x]) => { const m = media(x.notas), np = calcNps(x.nps); return <tr key={nome}><td><b>{nome}</b></td><td>{x.n}</td><td style={{ color: corE(m), fontWeight: 700 }}>{f1(m)}★</td><td style={{ color: corN(np), fontWeight: 700 }}>{np}</td></tr>; })}</tbody></table></div></div>)}
    <div className="panel"><h3>Comentários</h3>
      {coment.length ? <div className="ql-coms">{coment.map((a: any) => <div key={a.id} className="ql-com"><div><b className={"ql-nota " + (a.nps >= 9 ? "boa" : a.nps <= 6 ? "ruim" : "media")}>nota {a.nps}</b><span>{a.cliente.split(" ")[0]} · {fmtDate(a.respondido_em)}</span></div><q>{a.comentario}</q></div>)}</div>
        : <div className="dn-vazio">Nenhum comentário no período.</div>}</div>
  </div>;
}

// 📝 o questionário único: a Gestão edita etapas e perguntas; as pesquisas já enviadas guardam as perguntas da época
function Perguntas({ Q, recarregar }: { Q: any; recarregar: () => void }) {
  const { R, executar: ex } = useApp() as any;
  const pode = R.ehGestao();
  const copia = () => ({ titulo: Q.titulo, secoes: Q.secoes.map((s: Secao) => ({ ...s, perguntas: [...s.perguntas] })) });
  const [f, setF] = useState<{ titulo: string; secoes: Secao[] }>(copia());
  useEffect(() => setF(copia()), [Q]);
  const mudou = JSON.stringify(f) !== JSON.stringify(copia());
  const setS = (i: number, s: Secao) => setF({ ...f, secoes: f.secoes.map((x, j) => j === i ? s : x) });
  const mover = (i: number, d: number) => { const s = [...f.secoes]; const [x] = s.splice(i, 1); s.splice(i + d, 0, x); setF({ ...f, secoes: s }); };
  const salvar = async () => { if (MOCK) return; if (await ex(() => A.questionarioSalvar(f.titulo, f.secoes), "Questionário salvo — vale para as próximas pesquisas")) recarregar(); };
  return <div className="ql-pergs">
    <div className="ql-perg">O cliente responde tudo numa pesquisa só: primeiro a <b>nota de 0 a 10</b> (“quanto você indicaria a Aliança para um amigo?”), depois as estrelas (1 a 5) de cada etapa abaixo — podendo marcar “não participei” —, e no fim um <b>comentário opcional</b>.{pode ? " Mudanças valem para as próximas pesquisas enviadas." : " Só a Gestão altera."}
      {Q.atualizado_por && <> Última alteração: {Q.atualizado_por}, {fmtDateTime(Q.atualizado_em)}.</>}</div>
    <div className="ql-card"><div className="field"><label>Título que o cliente vê</label><input value={f.titulo} disabled={!pode} onChange={e => setF({ ...f, titulo: e.target.value })} /></div></div>
    {f.secoes.map((s, i) => <div key={i} className="ql-card ql-mod">
      <div className="ql-mod-h"><span className="ql-pn">{i + 1}</span><b>{s.nome || "Nova etapa"}</b>
        {pode && <span className="ql-bts" style={{ marginLeft: "auto" }}>
          <button type="button" className="btn ghost sm" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
          <button type="button" className="btn ghost sm" disabled={i === f.secoes.length - 1} onClick={() => mover(i, 1)} aria-label="Descer">↓</button>
          {f.secoes.length > 1 && <button type="button" className="btn ghost sm" onClick={() => { if (confirm("Tirar a etapa “" + s.nome + "” do questionário?")) setF({ ...f, secoes: f.secoes.filter((_, j) => j !== i) }); }}>Tirar etapa</button>}</span>}</div>
      <div className="ql-grid">
        <div className="field"><label>Etapa</label><input value={s.nome} disabled={!pode} onChange={e => setS(i, { ...s, nome: e.target.value })} placeholder="Ex.: Entrega" /></div>
        <div className="field"><label>Quem é avaliado</label><input value={s.quem} disabled={!pode} onChange={e => setS(i, { ...s, quem: e.target.value })} placeholder="Ex.: Entregador" /></div>
      </div>
      <div className="field"><label>Perguntas de estrelas</label>
        {s.perguntas.map((p, k) => <div key={k} className="ql-pq"><input value={p} disabled={!pode} onChange={e => { const ps = [...s.perguntas]; ps[k] = e.target.value; setS(i, { ...s, perguntas: ps }); }} />
          {pode && s.perguntas.length > 1 && <button type="button" className="btn ghost sm" onClick={() => { if (confirm("Tirar a pergunta “" + p + "”?")) setS(i, { ...s, perguntas: s.perguntas.filter((_, j) => j !== k) }); }}>Tirar</button>}</div>)}
        {pode && s.perguntas.length < 5 && <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setS(i, { ...s, perguntas: [...s.perguntas, ""] })}>＋ Pergunta</button>}</div>
    </div>)}
    {pode && <div className="ql-bts" style={{ marginTop: 12 }}>
      {f.secoes.length < 8 && <button type="button" className="btn" onClick={() => setF({ ...f, secoes: [...f.secoes, { nome: "", quem: "", perguntas: [""] }] })}>＋ Etapa</button>}
      <button className="btn primary" disabled={!mudou} onClick={salvar}>Salvar questionário</button>{mudou && <button className="btn ghost" onClick={() => setF(copia())}>Desfazer</button>}</div>}
  </div>;
}

function LinkGoogle({ atual }: { atual: string }) {
  const { executar: ex } = useApp() as any;
  const [u, setU] = useState(atual);
  return <div className="ql-card" style={{ marginTop: 14 }}><div className="field"><label>Link para avaliar a loja no Google (aparece para quem dá nota 9 ou 10)</label>
    <div className="inline-2"><input value={u} onChange={e => setU(e.target.value)} placeholder="https://g.page/r/…/review" /><button className="btn sm" onClick={() => ex(() => A.avaliacaoGoogle(u), "Link do Google salvo")}>Salvar</button></div>
    <small className="hint">No Google Meu Negócio: Perfil da empresa → Pedir avaliações → copiar o link.</small></div></div>;
}
