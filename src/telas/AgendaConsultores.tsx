// Agenda dos consultores: calendário do mês com as visitas e as datas fechadas (viagem, consulta médica, folga…).
// O consultor vê e fecha a própria agenda; Gestão, Supervisão Marketing e Suporte escolhem o consultor ou veem todos juntos.
// Data fechada = o banco não deixa direcionar visita para ele naquele horário.
import { useMemo, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { STATUS_CLIENTE } from "../lib/regras";

const DS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MOTIVOS = [["Viagem", "✈️"], ["Consulta médica", "🏥"], ["Folga", "🌴"], ["Compromisso pessoal", "📌"], ["Outro", "📝"]];
const CORES = ["#1f5ad6", "#c0428a", "#0f8a5f", "#d97706", "#7c3aed", "#0891b2", "#b91c1c", "#4d7c0f", "#9333ea", "#0e7490", "#be185d", "#a16207"];
const p2 = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
const icone = (m: string) => (MOTIVOS.find(x => x[0] === m) || ["", "🔒"])[1];
const perTxt = (b: any) => b.periodo === "manha" ? "manhã" : b.periodo === "tarde" ? "tarde" : b.periodo === "horario" ? b.ini + "–" + b.fim : "dia todo";
const primeiro = (n: string) => (n || "").replace(/^(Consultora?)\s+—\s+/, "").split(" ")[0];
const FORA = ["visita_cancelada", "reprovado"];

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
  const bloqs = (st.consBloqueios || []).filter((b: any) => !alvo || b.usuarioId === alvo);
  const visDia = (d: string) => visitas.filter((c: any) => String(c.dataVisita).slice(0, 10) === d);
  const blqDia = (d: string) => bloqs.filter((b: any) => d >= b.de && d <= b.ate);

  const ini = (mes.getDay() + 6) % 7, nDias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const cel: (string | null)[] = [...Array(ini).fill(null), ...Array.from({ length: nDias }, (_, i) => iso(new Date(mes.getFullYear(), mes.getMonth(), i + 1)))];
  while (cel.length % 7) cel.push(null);
  const mudar = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1));

  const abrirForm = () => setForm({ usuario: alvo || "", de: sel, ate: sel, periodo: "dia", ini: "08:00", fim: "12:00", motivo: "Viagem", obs: "" });
  const salvar = async () => {
    if (!form.usuario) { toast("Escolha o consultor"); return; }
    if (!form.de) { toast("Informe a data"); return; }
    const ok = await ex(() => A.consBloqueioSalvar({ usuario: form.usuario, de: form.de, ate: form.ate || form.de, periodo: form.periodo, ini: form.ini, fim: form.fim, motivo: form.motivo, obs: form.obs }), "Agenda fechada");
    if (ok !== false) setForm(null);
  };
  const remover = (b: any) => { if (confirm("Reabrir a agenda de " + R.nomeUser(b.usuarioId) + " (" + b.motivo + ", " + fmt(b.de) + (b.ate !== b.de ? " a " + fmt(b.ate) : "") + ")?")) ex(() => A.consBloqueioRemover(b.id), "Agenda reaberta"); };
  const fmt = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
  const dSel = new Date(sel + "T12:00");
  const listaSel = visDia(sel), blqSel = blqDia(sel);
  const podeFechar = (uid: string) => geral || uid === eu;

  const painel = <div className={movel ? "ac-lista" : "ac-side"}>
    <h4>{DS[(dSel.getDay() + 6) % 7]}, {fmt(sel)}{alvo ? " · " + primeiro(R.nomeUser(alvo)) : ""} — {listaSel.length} visita{listaSel.length === 1 ? "" : "s"}</h4>
    {blqSel.map((b: any) => <div key={b.id} className="ac-blq-i"><b>{icone(b.motivo)} {b.motivo}{quem === "todos" ? " · " + primeiro(R.nomeUser(b.usuarioId)) : ""}</b><small>{perTxt(b)}{b.de !== b.ate ? " · " + fmt(b.de) + " a " + fmt(b.ate) : ""}{b.obs ? " · " + b.obs : ""}</small>
      {podeFechar(b.usuarioId) && <button type="button" onClick={() => remover(b)}>Reabrir</button>}</div>)}
    {listaSel.map((c: any) => <button type="button" key={c.id} className="ac-vis-i" style={{ borderLeftColor: cor(c.consultorId) }} onClick={() => abrirDetalhe(c.id)}>
      <b>{String(c.dataVisita).slice(11, 16)} · {c.cliente}</b><small>{quem === "todos" ? primeiro(R.nomeUser(c.consultorId)) + " · " : ""}{c.endereco || "sem endereço"} · {STATUS_CLIENTE[R.statusClienteDe(c)] || ""}</small></button>)}
    {!listaSel.length && !blqSel.length && <div className="hint">Nenhuma visita neste dia.</div>}
    {!form ? <button type="button" className="btn ac-fechar" onClick={abrirForm}>🔒 Fechar datas (viagem, consulta…)</button> : <div className="ac-form">
      <b>🔒 Fechar datas</b>
      {geral && <label>Consultor<select value={form.usuario} onChange={e => setForm({ ...form, usuario: e.target.value })}><option value="">Escolha…</option>{consultores.map((u: any) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>}
      <label>Motivo</label><div className="ac-chips">{MOTIVOS.map(([m, ic]) => <button type="button" key={m} className={form.motivo === m ? "on" : ""} onClick={() => setForm({ ...form, motivo: m })}>{ic} {m}</button>)}</div>
      <div className="ac-2"><label>De<input type="date" value={form.de} min={hoje} onChange={e => setForm({ ...form, de: e.target.value, ate: form.ate < e.target.value ? e.target.value : form.ate })} /></label>
        <label>Até<input type="date" value={form.ate} min={form.de} onChange={e => setForm({ ...form, ate: e.target.value })} /></label></div>
      <label>Período</label><div className="ac-chips">{[["dia", "Dia todo"], ["manha", "Manhã"], ["tarde", "Tarde"], ["horario", "Horário…"]].map(([k, l]) => <button type="button" key={k} className={form.periodo === k ? "on" : ""} onClick={() => setForm({ ...form, periodo: k })}>{l}</button>)}</div>
      {form.periodo === "horario" && <div className="ac-2"><label>Das<input type="time" value={form.ini} onChange={e => setForm({ ...form, ini: e.target.value })} /></label><label>Até<input type="time" value={form.fim} onChange={e => setForm({ ...form, fim: e.target.value })} /></label></div>}
      <label>Observação<input value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} placeholder="Ex.: viagem para Joinville" /></label>
      <div className="ac-2"><button type="button" className="btn primary" onClick={salvar}>Fechar estas datas</button><button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancelar</button></div>
      <div className="hint">Ninguém consegue direcionar visita {geral && !form.usuario ? "para o consultor" : "para " + (form.usuario === eu ? "você" : primeiro(R.nomeUser(form.usuario)))} nesses dias.</div>
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
      {quem === "todos" && !movel && <div className="ac-leg">{consultores.map((u: any) => <span key={u.id}><i style={{ background: cor(u.id) }} />{primeiro(u.nome)}</span>)}</div>}
      <div className="ac-wrap">
        <div className="ac-cal">
          <div className="ac-g">{DS.map(d => <div key={d} className="ac-ds">{movel ? d[0].toUpperCase() : d}</div>)}
            {cel.map((d, i) => { if (!d) return <div key={i} className="ac-c vazio" />;
              const vs = visDia(d), bs = blqDia(d); const diaTodo = bs.some((b: any) => b.periodo === "dia") && (!!alvo || bs.length >= consultores.length);
              return <button type="button" key={i} className={"ac-c" + (d < hoje ? " passado" : "") + (d === hoje ? " hoje" : "") + (d === sel ? " sel" : "") + (bs.length ? (diaTodo ? " bloq" : " meio") : "")} onClick={() => setSel(d)}>
                <span className="n">{Number(d.slice(8))}</span>
                {movel ? <span className="ac-dots">{bs.length ? <em>{icone(bs[0].motivo)}</em> : null}{vs.slice(0, 4).map((c: any) => <i key={c.id} style={{ background: cor(c.consultorId) }} />)}{vs.length > 4 ? <small>+{vs.length - 4}</small> : null}</span> : <>
                  {bs.slice(0, 2).map((b: any) => <span key={b.id} className="ac-blq">{icone(b.motivo)} {quem === "todos" ? primeiro(R.nomeUser(b.usuarioId)) : b.motivo}<small>{perTxt(b)}</small></span>)}
                  {vs.slice(0, 3).map((c: any) => <span key={c.id} className="ac-vis" style={quem === "todos" ? { background: cor(c.consultorId) + "22", color: cor(c.consultorId), borderLeft: "3px solid " + cor(c.consultorId) } : undefined}>{String(c.dataVisita).slice(11, 16)} {quem === "todos" ? primeiro(R.nomeUser(c.consultorId)) : primeiro(c.cliente)}</span>)}
                  {vs.length > 3 && <span className="ac-mais">+{vs.length - 3} visita(s)</span>}</>}
              </button>; })}
          </div>
        </div>
        {painel}
      </div>
    </section>
  );
}
