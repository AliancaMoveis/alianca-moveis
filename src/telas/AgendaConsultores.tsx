// Agenda dos consultores: calendário do mês com as visitas e as datas fechadas (viagem, consulta médica, folga…).
// O consultor vê e fecha a própria agenda; Gestão, Supervisão Marketing e Suporte escolhem o consultor ou veem todos juntos.
// Data fechada = o banco não deixa direcionar visita para ele naquele horário.
import { useMemo, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { STATUS_CLIENTE } from "../lib/regras";
import { DataCalendario } from "../comp/DataCalendario";
import { textoConflito } from "../lib/agendaConsultor";
import { CORES_CLI, corCliente } from "../lib/corCliente";

const DS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MOTIVOS = [["Viagem", "✈️"], ["Consulta médica", "🏥"], ["Folga", "🌴"], ["Compromisso pessoal", "📌"], ["Outro", "📝"]];
const CORES = ["#1f5ad6", "#c0428a", "#0f8a5f", "#d97706", "#7c3aed", "#0891b2", "#b91c1c", "#4d7c0f", "#9333ea", "#0e7490", "#be185d", "#a16207"];
const p2 = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
const icone = (m: string) => (MOTIVOS.find(x => x[0] === m) || ["", "🔒"])[1];
const perTxt = (b: any) => b.periodo === "manha" ? "manhã" : b.periodo === "tarde" ? "tarde" : b.periodo === "horario" ? b.ini + "–" + b.fim : "dia todo";
const primeiro = (n: string) => (n || "").replace(/^(Consultora?)\s+—\s+/, "").split(" ")[0];
const FORA = ["visita_cancelada", "reprovado", "nao_vai_comprar"];

export const podeVerAgendaGeral = (R: any) => R.ehGestao() || R.mySetores().some((x: string) => ["marketing_supervisao", "suporte_consultores"].includes(x));

export default function AgendaConsultores({ movel }: { movel?: boolean }) {
  const { R, st, executar: ex, toast, abrirDetalhe } = useApp() as any;
  const geral = podeVerAgendaGeral(R);
  const consultores = R.consultores();
  const eu = R.currentUserId;
  const [quem, setQuem] = useState<string>(geral ? "todos" : eu);
  const hoje = iso(new Date());
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [sel, setSel] = useState(hoje);
  const [form, setForm] = useState<any>(null);
  const cor = (uid: string) => CORES[Math.max(0, consultores.findIndex((u: any) => u.id === uid)) % CORES.length];
  const alvo = quem === "todos" ? null : quem;

  const visitas = useMemo(() => st.chamados.filter((c: any) => R.domMarketing(c) && c.consultorId && c.dataVisita && !FORA.includes(R.statusClienteDe(c)) && (!alvo || c.consultorId === alvo))
    .sort((a: any, b: any) => String(a.dataVisita).localeCompare(String(b.dataVisita))), [st.chamados, alvo]);
  const todosB = (st.consBloqueios || []).filter((b: any) => !alvo || b.usuarioId === alvo);
  const bloqs = todosB.filter((b: any) => b.tipo !== "evento"), eventos = todosB.filter((b: any) => b.tipo === "evento");
  const evDia = (d: string) => eventos.filter((b: any) => d >= b.de && d <= b.ate);
  const [agCli, setAgCli] = useState<any>(null);
  const visDia = (d: string) => visitas.filter((c: any) => String(c.dataVisita).slice(0, 10) === d);
  const blqDia = (d: string) => bloqs.filter((b: any) => d >= b.de && d <= b.ate);

  const ini = (mes.getDay() + 6) % 7, nDias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const cel: (string | null)[] = [...Array(ini).fill(null), ...Array.from({ length: nDias }, (_, i) => iso(new Date(mes.getFullYear(), mes.getMonth(), i + 1)))];
  while (cel.length % 7) cel.push(null);
  const mudar = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1));

  const abrirForm = (tipo = "bloqueio") => { setAgCli(null); setForm({ tipo, usuario: alvo || "", de: sel, ate: sel, periodo: tipo === "evento" ? "horario" : "dia", ini: tipo === "evento" ? "09:00" : "08:00", fim: tipo === "evento" ? "10:00" : "12:00", motivo: tipo === "evento" ? "" : "Viagem", obs: "" }); };
  const meusParaAgendar = (uid: string) => st.chamados.filter((c: any) => R.domMarketing(c) && c.consultorId === uid && c.setorDestino === "consultor_externo" && !(c.tratativa || {}).realizada)
    .sort((a: any, b: any) => String(a.cliente).localeCompare(String(b.cliente)));
  const salvarAgCli = async () => {
    if (!agCli.id) { toast("Escolha o cliente"); return; }
    if (!agCli.dt || agCli.dt.length < 16) { toast("Escolha o dia e o horário"); return; }
    const ok = await ex(() => A.reagendarVisita(agCli.id, agCli.dt, "agendado pela agenda"), "Visita agendada");
    if (ok !== false) setAgCli(null);
  };
  const salvar = async () => {
    if (!form.usuario) { toast("Escolha o consultor"); return; }
    if (!form.de) { toast("Informe a data"); return; }
    if (form.tipo === "evento" && form.motivo.trim().length < 2) { toast("Dê um título ao evento"); return; }
    const ok = await ex(() => A.consBloqueioSalvar({ tipo: form.tipo, usuario: form.usuario, de: form.de, ate: form.ate || form.de, periodo: form.periodo, ini: form.ini, fim: form.fim, motivo: form.motivo, obs: form.obs }), form.tipo === "evento" ? "Evento criado" : "Agenda fechada");
    if (ok !== false) setForm(null);
  };
  const remover = (b: any) => { if (confirm("Reabrir a agenda de " + R.nomeUser(b.usuarioId) + " (" + b.motivo + ", " + fmt(b.de) + (b.ate !== b.de ? " a " + fmt(b.ate) : "") + ")?")) ex(() => A.consBloqueioRemover(b.id), "Agenda reaberta"); };
  const fmt = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
  const dSel = new Date(sel + "T12:00");
  const listaSel = visDia(sel), blqSel = blqDia(sel), evSel = evDia(sel);
  const podeFechar = (uid: string) => geral || uid === eu;

  const painel = <div className={movel ? "ac-lista" : "ac-side"}>
    <h4>{DS[(dSel.getDay() + 6) % 7]}, {fmt(sel)}{alvo ? " · " + primeiro(R.nomeUser(alvo)) : ""} — {listaSel.length} visita{listaSel.length === 1 ? "" : "s"}</h4>
    {blqSel.map((b: any) => <div key={b.id} className="ac-blq-i"><b>{icone(b.motivo)} {b.motivo}{quem === "todos" ? " · " + primeiro(R.nomeUser(b.usuarioId)) : ""}</b><small>{perTxt(b)}{b.de !== b.ate ? " · " + fmt(b.de) + " a " + fmt(b.ate) : ""}{b.obs ? " · " + b.obs : ""}</small>
      {podeFechar(b.usuarioId) && <button type="button" onClick={() => remover(b)}>Reabrir</button>}</div>)}
    {listaSel.map((c: any) => { const k = corCliente(R, c); return <button type="button" key={c.id} className="ac-vis-i" style={{ borderLeftColor: k.cor, background: k.fundo }} onClick={() => abrirDetalhe(c.id)}>
      <span className="ac-st" style={{ background: k.cor, color: k.k === "ctt" ? "#3a2a00" : "#fff" }}>{k.txt}</span><b>{String(c.dataVisita).slice(11, 16)} · {c.cliente}</b><small>{quem === "todos" ? primeiro(R.nomeUser(c.consultorId)) + " · " : ""}{c.endereco || "sem endereço"} · {STATUS_CLIENTE[R.statusClienteDe(c)] || ""}</small></button>; })}
    {evSel.map((b: any) => <div key={b.id} className="ac-ev-i"><b>📌 {b.motivo}{quem === "todos" ? " · " + primeiro(R.nomeUser(b.usuarioId)) : ""}</b><small>{perTxt(b)}{b.obs ? " · " + b.obs : ""}</small>
      {podeFechar(b.usuarioId) && <button type="button" onClick={() => { if (confirm("Apagar o evento “" + b.motivo + "”?")) ex(() => A.consBloqueioRemover(b.id), "Evento apagado"); }}>Apagar</button>}</div>)}
    {!listaSel.length && !blqSel.length && !evSel.length && <div className="hint">Nenhuma visita neste dia.</div>}
    {!form && !agCli && <div className="ac-acoes">
      <button type="button" className="btn ac-fechar" onClick={() => abrirForm("bloqueio")}>🔒 Fechar datas (viagem, consulta…)</button>
      <button type="button" className="btn ac-evento" onClick={() => abrirForm("evento")}>📌 Criar evento avulso</button>
      <button type="button" className="btn ac-agcli" onClick={() => { setForm(null); setAgCli({ uid: alvo || "", id: "", dt: sel + "T09:00" }); }}>👤 Agendar visita de um cliente</button>
    </div>}
    {agCli && <div className="ac-form">
      <b>👤 Agendar visita de um cliente</b>
      {geral && <label>Consultor<select value={agCli.uid} onChange={e => setAgCli({ ...agCli, uid: e.target.value, id: "" })}><option value="">Escolha…</option>{consultores.map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>}
      <label>Cliente<select value={agCli.id} onChange={e => setAgCli({ ...agCli, id: e.target.value })}><option value="">Escolha o cliente…</option>{meusParaAgendar(agCli.uid || eu).map((c: any) => <option key={c.id} value={c.id}>{c.cliente}{c.dataVisita ? " · marcado " + String(c.dataVisita).slice(8, 10) + "/" + String(c.dataVisita).slice(5, 7) : " · sem data"}</option>)}</select></label>
      <label>Dia e horário</label><DataCalendario value={agCli.dt} onChange={v => setAgCli({ ...agCli, dt: v })} min={hoje + "T00:00"} />
      {agCli.id && (() => { const t = textoConflito(R, agCli.uid || eu, agCli.dt, agCli.id); return t ? <div className="hint" style={{ color: "var(--warn)" }}>⚠️ {t}</div> : null; })()}
      <div className="ac-2"><button type="button" className="btn primary" onClick={salvarAgCli}>Agendar visita</button><button type="button" className="btn ghost" onClick={() => setAgCli(null)}>Cancelar</button></div>
      <div className="hint">Só aparecem os clientes direcionados ainda sem visita realizada. Fica no histórico do cliente.</div>
    </div>}
    {form && <div className="ac-form">
      <b>{form.tipo === "evento" ? "📌 Evento avulso" : "🔒 Fechar datas"}</b>
      {geral && <label>Consultor<select value={form.usuario} onChange={e => setForm({ ...form, usuario: e.target.value })}><option value="">Escolha…</option>{consultores.map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>}
      {form.tipo === "evento" ? <label>Título<input value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} placeholder="Ex.: reunião na loja, treinamento…" /></label> : <><label>Motivo</label><div className="ac-chips">{MOTIVOS.map(([m, ic]) => <button type="button" key={m} className={form.motivo === m ? "on" : ""} onClick={() => setForm({ ...form, motivo: m })}>{ic} {m}</button>)}</div></>}
      <div className="ac-2"><label>De<input type="date" value={form.de} min={hoje} onChange={e => setForm({ ...form, de: e.target.value, ate: form.ate < e.target.value ? e.target.value : form.ate })} /></label>
        <label>Até<input type="date" value={form.ate} min={form.de} onChange={e => setForm({ ...form, ate: e.target.value })} /></label></div>
      <label>Período</label><div className="ac-chips">{[["dia", "Dia todo"], ["manha", "Manhã"], ["tarde", "Tarde"], ["horario", "Horário…"]].map(([k, l]) => <button type="button" key={k} className={form.periodo === k ? "on" : ""} onClick={() => setForm({ ...form, periodo: k })}>{l}</button>)}</div>
      {form.periodo === "horario" && <div className="ac-2"><label>Das<input type="time" value={form.ini} onChange={e => setForm({ ...form, ini: e.target.value })} /></label><label>Até<input type="time" value={form.fim} onChange={e => setForm({ ...form, fim: e.target.value })} /></label></div>}
      <label>Observação<input value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} placeholder="Ex.: viagem para Joinville" /></label>
      <div className="ac-2"><button type="button" className="btn primary" onClick={salvar}>{form.tipo === "evento" ? "Criar evento" : "Fechar estas datas"}</button><button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancelar</button></div>
      <div className="hint">{form.tipo === "evento" ? "O evento aparece na agenda, mas não bloqueia: ainda dá para direcionar visitas nesse dia." : "Ninguém consegue direcionar visita " + (geral && !form.usuario ? "para o consultor" : "para " + (form.usuario === eu ? "você" : primeiro(R.nomeUser(form.usuario)))) + " nesses dias."}</div>
    </div>}
  </div>;

  return (
    <section className={movel ? "ac movel" : "view active ac"}>
      {!movel && <div className="view-head"><div><h2>📅 {geral ? "Agenda dos consultores" : "Minha agenda"}</h2><p>{geral ? "Visitas marcadas e datas fechadas de cada consultor. Escolha o consultor ou veja todos juntos." : "Suas visitas e as datas que você fechou (viagem, consulta médica…). Nesses dias ninguém direciona cliente para você."}</p></div></div>}
      <div className="ac-topo">
        <button type="button" className="ac-nav" onClick={() => mudar(-1)}>‹</button><b>{MESES[mes.getMonth()]} {mes.getFullYear()}</b><button type="button" className="ac-nav" onClick={() => mudar(1)}>›</button>
        <button type="button" className="ac-nav hoje" onClick={() => { const d = new Date(); setMes(new Date(d.getFullYear(), d.getMonth(), 1)); setSel(hoje); }}>Hoje</button>
        {geral && <select className="ac-quem" value={quem} onChange={e => setQuem(e.target.value)}><option value="todos">👥 Todos os consultores</option>{consultores.map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select>}
      </div>
      <div className="ac-leg">{Object.values(CORES_CLI).map(x => <span key={x.txt}><i style={{ background: x.cor }} />{x.txt}</span>)}<span><i style={{ background: "#5b6475" }} />🔒 Data fechada</span><span><i style={{ background: "#0e7490" }} />📌 Evento</span></div>
      <div className="ac-wrap">
        <div className="ac-cal">
          <div className="ac-g">{DS.map(d => <div key={d} className="ac-ds">{movel ? d[0].toUpperCase() : d}</div>)}
            {cel.map((d, i) => { if (!d) return <div key={i} className="ac-c vazio" />;
              const vs = visDia(d), bs = blqDia(d); const diaTodo = bs.some((b: any) => b.periodo === "dia") && (!!alvo || bs.length >= consultores.length);
              return <button type="button" key={i} className={"ac-c" + (d < hoje ? " passado" : "") + (d === hoje ? " hoje" : "") + (d === sel ? " sel" : "") + (bs.length ? (diaTodo ? " bloq" : " meio") : "")} onClick={() => setSel(d)}>
                <span className="n">{Number(d.slice(8))}</span>
                {movel ? <span className="ac-dots">{bs.length ? <em>{icone(bs[0].motivo)}</em> : null}{evDia(d).length ? <em>📌</em> : null}{vs.slice(0, 4).map((c: any) => <i key={c.id} style={{ background: corCliente(R, c).cor }} />)}{vs.length > 4 ? <small>+{vs.length - 4}</small> : null}</span> : <>
                  {bs.slice(0, 2).map((b: any) => <span key={b.id} className="ac-blq">{icone(b.motivo)} {quem === "todos" ? primeiro(R.nomeUser(b.usuarioId)) : b.motivo}<small>{perTxt(b)}</small></span>)}
                  {evDia(d).slice(0, 2).map((b: any) => <span key={"e" + b.id} className="ac-ev">📌 {b.periodo === "horario" ? b.ini + " " : ""}{b.motivo}</span>)}
                  {vs.slice(0, 3).map((c: any) => { const k = corCliente(R, c); return <span key={c.id} className="ac-vis" title={k.txt} style={{ background: k.fundo, color: k.cor, borderLeft: "3px solid " + k.cor }}>{String(c.dataVisita).slice(11, 16)} {quem === "todos" ? primeiro(R.nomeUser(c.consultorId)) + "·" + primeiro(c.cliente) : primeiro(c.cliente)}</span>; })}
                  {vs.length > 3 && <span className="ac-mais">+{vs.length - 3} visita(s)</span>}</>}
              </button>; })}
          </div>
        </div>
        {painel}
      </div>
    </section>
  );
}
