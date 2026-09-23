import { useState } from "react";
import { useApp } from "../estado";
import { corDoSetor, fmtDate, hojeISO, inicial, isoLocal, tempoRel } from "../lib/regras";
import { Kpi } from "./Dashboard";

function classificaAcao(txt: string) {
  const t = (txt || "").toLowerCase();
  if (/solicitação aberta/.test(t)) return { k: "abertura", l: "Abertura" };
  if (/venda .*(registrada|atualizada)/.test(t)) return { k: "venda", l: "Venda" };
  if (/situação da venda/.test(t)) return { k: "venda_status", l: "Decisão de venda" };
  if (/dados da venda corrigidos/.test(t)) return { k: "venda_edit", l: "Correção de venda" };
  if (/transferência/.test(t)) return { k: "transferencia", l: "Transferência" };
  if (/vendedor alterado/.test(t)) return { k: "transferencia", l: "Troca de vendedor" };
  if (/direcionado ao consultor|atribu/.test(t)) return { k: "direcionamento", l: "Direcionamento" };
  if (/direcionado ao projetista|designad/.test(t)) return { k: "designacao", l: "Designação" };
  if (/status do cliente alterado|status →/.test(t)) return { k: "status", l: "Mudança de status" };
  if (/visita marcada como realizada|contato com o cliente/.test(t)) return { k: "visita", l: "Visita" };
  if (/agendamento na loja remarcado|vinda à loja agendada|reagendamento da vinda/.test(t)) return { k: "agenda", l: "Agenda" };
  if (/retorno registrado|previsão/.test(t)) return { k: "retorno", l: "Retorno" };
  if (/anexo|link anexado/.test(t)) return { k: "anexo", l: "Anexo" };
  if (/escalonado|atraso crítico/.test(t)) return { k: "sistema", l: "Automático" };
  if (/prazo alterado/.test(t)) return { k: "prazo", l: "Prazo" };
  if (/urgen/.test(t)) return { k: "urgencia", l: "Urgência" };
  return { k: "outro", l: "Outra ação" };
}

export default function Atividades() {
  const { R, st, abrirDetalhe } = useApp();
  const [f, setF] = useState({ de: "", ate: "", se: "", us: "", q: "" });
  const [vista, setVista] = useState("produtividade");
  const s = (k: string) => (e: any) => setF(x => ({ ...x, [k]: e.target.value }));
  const usuarioPorNome = (nome: string) => st.usuarios.find(u => u.nome === nome) || null;

  let evs: any[] = [];
  st.chamados.filter(R.podeVer).forEach(c => (c.historico || []).forEach((h: any) => {
    const u = usuarioPorNome(h.quem);
    const setorId = u ? ((u.setores || [])[0] || "") : (h.quem === "Sistema" ? "sistema" : "");
    evs.push({ quando: h.quando, quem: h.quem, userId: u ? u.id : null, setorId, setorNome: h.quem === "Sistema" ? "Sistema" : (u ? R.setoresLabel(u) : "—"), texto: h.texto, chamado: c.id, cliente: c.cliente, tipo: classificaAcao(h.texto) });
  }));
  evs.sort((a, b) => +new Date(b.quando) - +new Date(a.quando));
  if (f.de) evs = evs.filter(e => new Date(e.quando) >= new Date(f.de + "T00:00:00"));
  if (f.ate) evs = evs.filter(e => new Date(e.quando) <= new Date(f.ate + "T23:59:59"));
  if (f.se) evs = evs.filter(e => e.setorId === f.se);
  if (f.us) evs = evs.filter(e => e.userId === f.us);
  if (f.q) evs = evs.filter(e => (e.texto + " " + e.quem + " " + e.cliente).toLowerCase().includes(f.q.toLowerCase()));

  const usuariosAtivos = new Set(evs.filter(e => e.userId).map(e => e.userId)).size;
  const hoje = hojeISO();
  const diaDe = (q: string) => isoLocal(new Date(q));
  const deHoje = evs.filter(e => diaDe(e.quando) === hoje).length;
  const auto = evs.filter(e => e.quem === "Sistema").length;

  const porUser: Record<string, any> = {};
  evs.filter(e => e.userId).forEach(e => { const k = e.userId; porUser[k] = porUser[k] || { n: 0, tipos: {}, ultima: e.quando }; porUser[k].n++; porUser[k].tipos[e.tipo.l] = (porUser[k].tipos[e.tipo.l] || 0) + 1; if (new Date(e.quando) > new Date(porUser[k].ultima)) porUser[k].ultima = e.quando; });
  const rows = Object.entries(porUser).map(([uid, v]: any) => ({ u: R.getUser(uid), ...v })).filter(r => r.u).sort((a, b) => b.n - a.n);
  const maxN = Math.max(1, ...rows.map(r => r.n));
  const porDia: Record<string, any[]> = {}; evs.forEach(e => { const d = diaDe(e.quando); (porDia[d] = porDia[d] || []).push(e); });
  const dias = Object.keys(porDia).sort((a, b) => b.localeCompare(a));
  const porSetor: Record<string, any> = {}; evs.forEach(e => { const k = e.setorId || "—"; porSetor[k] = porSetor[k] || { n: 0, users: {} }; porSetor[k].n++; if (e.userId) porSetor[k].users[e.userId] = (porSetor[k].users[e.userId] || 0) + 1; });
  const sr = Object.entries(porSetor).sort((a: any, b: any) => b[1].n - a[1].n); const maxS = Math.max(1, ...sr.map((r: any) => r[1].n));

  return (
    <section className="view active" id="view-atividades">
      <div className="view-head"><div><h2>Controle de atividades</h2><p>Tudo que cada usuário fez no sistema, com hora e setor. Use para acompanhar produtividade e auditar decisões.</p></div></div>
      <div className="card" style={{ padding: "16px 18px", marginBottom: 16 }}>
        <div className="grid">
          <div className="field"><label>De</label><input type="date" value={f.de} onChange={s("de")} /></div>
          <div className="field"><label>Até</label><input type="date" value={f.ate} onChange={s("ate")} /></div>
          <div className="field"><label>Setor</label><select value={f.se} onChange={s("se")}><option value="">Todos os setores</option>{st.setores.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}<option value="sistema">Sistema (automático)</option></select></div>
          <div className="field"><label>Usuário</label><select value={f.us} onChange={s("us")}><option value="">Todos os usuários</option>{st.usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
          <div className="field full"><label>Buscar na ação</label><input placeholder="Ex.: venda, transferência, status, cliente…" value={f.q} onChange={s("q")} /></div>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn ghost sm" onClick={() => setF({ de: "", ate: "", se: "", us: "", q: "" })}>Limpar</button>
          <button className="btn sm" onClick={() => setF(x => ({ ...x, de: hoje, ate: hoje }))}>Só hoje</button>
          <button className="btn sm" onClick={() => { const b = new Date(); b.setDate(b.getDate() - 6); setF(x => ({ ...x, de: isoLocal(b), ate: hoje })); }}>Últimos 7 dias</button>
          <span className="live" style={{ marginLeft: "auto" }}><i></i>ao vivo</span>
        </div>
      </div>
      <div className="kpis" id="atKpis"><Kpi n={evs.length} l="Ações no período" /><Kpi n={deHoje} l="Ações hoje" /><Kpi n={usuariosAtivos} l="Usuários ativos" /><Kpi n={auto} l="Ações do sistema" /></div>
      <div className="subnav" id="atSub">{[["produtividade", "Produtividade"], ["linha", "Linha do tempo"], ["setores", "Por setor"]].map(([v, l]) => <button key={v} className={vista === v ? "on" : ""} onClick={() => setVista(v)}>{l}</button>)}</div>
      {vista === "produtividade" && <div id="atProdutividade">{rows.length ? rows.map(r => {
        const cor = corDoSetor((r.u.setores || [])[0]);
        return (
          <div className="at-card" key={r.u.id}><div className="top"><div className="av" style={{ background: cor }}>{inicial(r.u.nome)}</div><div><div className="nm">{r.u.nome}</div><div className="sb">{R.setoresLabel(r.u)} · última ação {tempoRel(r.ultima)} atrás</div></div><div className="qt"><b>{r.n}</b><span>ações</span></div></div>
            <div className="at-barra"><i style={{ width: r.n / maxN * 100 + "%", background: cor }}></i></div>
            <div className="at-tags">{Object.entries(r.tipos).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5).map(([l, n]: any) => <span key={l} className="at-tag">{l}: {n}</span>)}</div></div>
        );
      }) : <div className="empty">Nenhuma atividade no período.</div>}</div>}
      {vista === "linha" && <div id="atLinha">{dias.length ? dias.map(dia => (
        <div key={dia}><div className="at-dia">{fmtDate(dia)} · {porDia[dia].length} ação(ões)</div>
          {porDia[dia].map((e, i) => { const cor = e.quem === "Sistema" ? "var(--ink-faint)" : corDoSetor(e.setorId); return (
            <div className="at-ev" key={i}><div className="hora">{new Date(e.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div><div className="pino" style={{ background: cor }}></div>
              <div><div><span className="quem" style={{ color: cor }}>{e.quem}</span><span className="setor">{e.setorNome}</span> <span className="at-tag">{e.tipo.l}</span></div><div className="txt">{e.texto}</div><div className="ref" onClick={() => abrirDetalhe(e.chamado)}>{e.chamado} · {e.cliente}</div></div></div>); })}
        </div>)) : <div className="empty">Nenhuma atividade no período.</div>}</div>}
      {vista === "setores" && <div id="atSetores">{sr.length ? sr.map(([sid, v]: any) => {
        const cor = sid === "sistema" ? "var(--ink-faint)" : corDoSetor(sid); const nome = sid === "sistema" ? "Sistema (automático)" : R.setorNome(sid);
        return (
          <div className="at-card" key={sid}><div className="top"><div className="av" style={{ background: cor }}>{inicial(nome)}</div><div><div className="nm">{nome}</div><div className="sb">{Object.keys(v.users).length} pessoa(s) ativa(s)</div></div><div className="qt"><b>{v.n}</b><span>ações</span></div></div>
            <div className="at-barra"><i style={{ width: v.n / maxS * 100 + "%", background: cor }}></i></div>
            <div className="at-tags">{Object.entries(v.users).sort((a: any, b: any) => b[1] - a[1]).map(([uid, n]: any) => <span key={uid} className="at-tag">{R.nomeUser(uid)}: {n}</span>)}</div></div>
        );
      }) : <div className="empty">Nenhuma atividade no período.</div>}</div>}
    </section>
  );
}
