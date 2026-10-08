// Painel do Checklist (dashboard do setor e acompanhamento da Gestão): agenda do dia, atividades feitas no dia e clientes pendentes.
import { useState } from "react";
import { useApp } from "../estado";
import { fmtDate, hojeISO, isoLocal } from "../lib/regras";
import { BarRow, Kpi } from "./Dashboard";
import { CONF_CK, ck, grupoCk } from "./Checklist";

// classifica o que foi feito no histórico do checklist (texto gravado pelo banco)
const ATV: [string, string, RegExp][] = [
  ["agendou", "📅 Agendamentos feitos", /^📅 Checklist agendado/],
  ["contato", "💬 Contatos / mensagens", /^💬 (WhatsApp enviado|Nova tentativa)/],
  ["confenv", "📨 Confirmações enviadas", /^📨 Mensagem de confirmação/],
  ["confirmou", "✅ Clientes confirmaram", /^✅ Cliente confirmou presença/],
  ["reagendou", "🔁 Reagendamentos", /^(🔁 Agend|🔁 Agenda alterada|🚫 Cliente não pode vir)/],
  ["desmarcou", "❌ Desmarcados", /^(❌ Agendamento|🚫 Cliente não pode vir.*❌)/],
  ["aguardando", "⏸ Colocados em aguardando", /^(⏸|🔄 Cliente pediu outra data|🚧 Ambiente em obra|📵 Sem resposta)/],
  ["realizou", "✔ Checklists realizados", /^✅ Checklist realizado/],
  ["solicitacao", "📞 Solicitações recebidas (call center)", /^Solicitação aberta/],
  ["anotacao", "📝 Anotações", /^📝 Anotação/],
];
const tipoAtv = (t: string) => (ATV.find(([, , re]) => re.test(String(t || ""))) || [""])[0];
const hora = (v: any) => String(v || "").slice(11, 16);

export default function PainelChecklist() {
  const { R, st, abrirDetalhe } = useApp() as any;
  const [dia, setDia] = useState(hojeISO());
  const mover = (n: number) => { const d = new Date(dia + "T12:00"); d.setDate(d.getDate() + n); setDia(isoLocal(d)); };
  const todos = st.chamados.filter((c: any) => c.tipo === "checklist" && R.podeVer(c));
  const diaAg = (c: any) => String(ck(c).agendadoPara || "").slice(0, 10);
  const extras = (c: any) => (Array.isArray(ck(c).diasExtras) ? ck(c).diasExtras : []).map((e: any) => ({ data: String(e.data || ""), projetista: e.projetista || "" }));
  // agenda do dia: dia principal ou dia adicional
  const agenda = todos.filter((c: any) => grupoCk(c) === "agendado" || c.status === "concluida")
    .map((c: any) => { if (diaAg(c) === dia) return { c, quando: String(ck(c).agendadoPara), proj: ck(c).projetista || "" }; const e = extras(c).find((x: any) => x.data.slice(0, 10) === dia); return e ? { c, quando: e.data, proj: e.projetista } : null; })
    .filter(Boolean).filter((x: any) => grupoCk(x.c) === "agendado" || /realizado/i.test(String(ck(x.c).etapa)))
    .sort((a: any, b: any) => a.quando.localeCompare(b.quando));
  const confirmados = agenda.filter((x: any) => ck(x.c).confirmacao === "confirmada"), aConfirmar = agenda.filter((x: any) => ck(x.c).confirmacao !== "confirmada");
  // atividades do dia (quem fez o quê)
  const evs: any[] = [];
  todos.forEach((c: any) => (c.historico || []).forEach((h: any) => { if (String(h.quando).slice(0, 10) !== dia && isoLocal(new Date(h.quando)) !== dia) return; const k = tipoAtv(h.texto); if (k) evs.push({ k, c, quem: h.quem, quando: h.quando, texto: h.texto }); }));
  const cont = (k: string) => evs.filter(e => e.k === k).length;
  const pessoas: Record<string, Record<string, number>> = {};
  evs.filter(e => e.quem && e.quem !== "Sistema" && !/^Importa/i.test(e.quem)).forEach(e => { (pessoas[e.quem] = pessoas[e.quem] || {})[e.k] = (pessoas[e.quem][e.k] || 0) + 1; });
  // pendentes (agora)
  const aAgendar = todos.filter((c: any) => grupoCk(c) === "agendar"), aguard = todos.filter((c: any) => grupoCk(c) === "aguardando");
  const futuros = todos.filter((c: any) => grupoCk(c) === "agendado" && diaAg(c) > hojeISO());
  const pedidosCC = todos.filter((c: any) => /call center/i.test(c.setor || "") && c.status !== "concluida");
  const semContato = aAgendar.filter((c: any) => !(ck(c).contatos > 0));
  const ehHoje = dia === hojeISO();
  return (
    <section className="view active">
      <div className="view-head"><div><h2>✓ Painel do Checklist</h2><p>Agenda do dia, o que a equipe fez no dia e os clientes pendentes. Use as setas para ver outro dia.</p></div><span className="live"><i></i>ao vivo</span></div>
      <div className="card" style={{ padding: "10px 14px", marginBottom: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn sm" onClick={() => mover(-1)}>‹</button>
        <button className={"btn sm" + (ehHoje ? " primary" : "")} onClick={() => setDia(hojeISO())}>Hoje</button>
        <button className="btn sm" onClick={() => mover(1)}>›</button>
        <input type="date" value={dia} onChange={e => e.target.value && setDia(e.target.value)} style={{ maxWidth: 170 }} />
        <b style={{ marginLeft: 6 }}>{fmtDate(dia)}{ehHoje ? " · hoje" : ""}</b>
      </div>
      <div className="sec-label">Agenda do dia</div>
      <div className="kpis">
        <Kpi n={agenda.length} l="Clientes na agenda do dia" />
        <Kpi n={confirmados.length} l="Confirmados para o dia" cor="var(--st-concluida)" />
        <Kpi n={aConfirmar.length} l="Ainda sem confirmação" cls={aConfirmar.length ? "urg" : ""} />
        <Kpi n={cont("realizou")} l="Realizados no dia" />
      </div>
      <div className="sec-label">Atividades feitas no dia</div>
      <div className="kpis">{ATV.map(([k, l]) => <Kpi key={k} n={cont(k)} l={l} />)}</div>
      <div className="sec-label">Clientes pendentes (agora)</div>
      <div className="kpis">
        <Kpi n={aAgendar.length} l="A agendar" cls={aAgendar.length ? "urg" : ""} />
        <Kpi n={semContato.length} l="A agendar sem nenhum contato" cls={semContato.length ? "alert" : ""} />
        <Kpi n={aguard.length} l="Aguardando (obra, outra data, sem resposta…)" />
        <Kpi n={pedidosCC.length} l="Pedidos do call center em aberto" cor={pedidosCC.length ? "var(--critico)" : undefined} />
        <Kpi n={futuros.length} l="Agendados para os próximos dias" />
      </div>
      <div className="panel-grid">
        <div className="panel"><h3>Agenda de {fmtDate(dia)} <span className="badge b-tratativa">{agenda.length}</span></h3>
          {agenda.length ? agenda.map((x: any) => { const cf = CONF_CK[ck(x.c).confirmacao || ""] || CONF_CK[""];
            return <div key={x.c.id + x.quando} className="acao" style={{ borderLeftColor: cf[1] }} onClick={() => abrirDetalhe(x.c.id)}><span><b>{hora(x.quando)}</b> · {x.c.cliente} · {x.proj || "sem projetista"}</span><span className="g" style={{ color: cf[1] }}>{cf[0]}</span></div>; })
            : <div className="hint">Ninguém agendado neste dia.</div>}
        </div>
        <div className="panel"><h3>Quem fez o quê no dia</h3>
          {Object.keys(pessoas).length ? <div style={{ overflowX: "auto" }}><table className="dl-tab"><thead><tr><th>Pessoa</th><th>Agendou</th><th>Contatos</th><th>Conf. enviadas</th><th>Confirmados</th><th>Reagend.</th><th>Realizados</th><th>Total</th></tr></thead><tbody>
            {Object.entries(pessoas).sort((a, b) => Object.values(b[1]).reduce((s, n) => s + n, 0) - Object.values(a[1]).reduce((s, n) => s + n, 0)).map(([p, v]) =>
              <tr key={p}><td><b>{p}</b></td><td>{v.agendou || 0}</td><td>{v.contato || 0}</td><td>{v.confenv || 0}</td><td>{v.confirmou || 0}</td><td>{v.reagendou || 0}</td><td>{v.realizou || 0}</td><td><b>{Object.values(v).reduce((s, n) => s + n, 0)}</b></td></tr>)}
          </tbody></table></div> : <div className="hint">Nenhuma atividade registrada neste dia.</div>}
          <h3 style={{ marginTop: 16 }}>Atividades</h3>
          {ATV.filter(([k]) => cont(k)).map(([k, l]) => <BarRow key={k} nm={l} pct={cont(k) / Math.max(1, ...ATV.map(([x]) => cont(x))) * 100} v={cont(k)} />)}
        </div>
      </div>
    </section>
  );
}
