// 👤 Ficha de produtividade individual (Controle de atividades → clicar na pessoa).
// Tudo sai do histórico das ações no 360: jornada (1ª e última ação, horas ativas, pausas), o que a pessoa fez,
// o resultado do trabalho conforme o setor e o comparativo com o próprio setor. Importações de planilha não contam.
import { useMemo, useState } from "react";
import { useApp } from "../estado";
import { corDoSetor, fmtDate, hojeISO, inicial, isoLocal } from "../lib/regras";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const LOTE = /(planilha|importado da|saiu do checklist|importa[çc][ãa]o)/i;
// o que a pessoa fez (ordem importa: o primeiro que casar)
const TIPOS: [string, RegExp, string][] = [
  ["Definiu vendedor", /^vendedor definido/i, "#284b8f"],
  ["Cobrou parecer do vendedor", /^parecer cobrado/i, "#c98a12"],
  ["Confirmou vinda / presença", /(confirmou a vinda|confirmou presença|confirmação de presença)/i, "#3f8f4f"],
  ["Trocou vendedor", /(vendedor alterado|troca.*vendedor|vendedor trocado)/i, "#7c3aed"],
  ["Reagendou", /(reagendamento|reagendad|remarcad)/i, "#2f8fa8"],
  ["Vendedor fora da disponibilidade", /fora da disponibilidade/i, "#c23b3b"],
  ["Abriu solicitação", /^solicitação aberta/i, "#284b8f"],
  ["Finalizou atendimento", /^✓ atendimento finalizado/i, "#3f8f4f"],
  ["WhatsApp / mensagem enviada", /(whatsapp enviado|mensagem .*enviad)/i, "#1fa855"],
  ["Agendou checklist", /checklist agendado/i, "#2f8fa8"],
  ["Liberou da agenda", /liberado da agenda/i, "#c98a12"],
  ["Cadastrou cliente", /(cliente cadastrado|novo cliente|cadastro do cliente)/i, "#284b8f"],
  ["Agendou vinda à loja", /vinda à loja agendada/i, "#2f8fa8"],
  ["Visita", /(visita marcada como realizada|visita realizada)/i, "#3f8f4f"],
  ["Contato com o cliente", /contato com o cliente/i, "#2f8fa8"],
  ["Atualizou a tratativa", /tratativa atualizada/i, "#5a6270"],
  ["Venda", /venda .*(registrada|atualizada)/i, "#3f8f4f"],
  ["Mudou status do cliente", /(status do cliente|status →)/i, "#5a6270"],
  ["Anexo", /(anexo|link anexado)/i, "#5a6270"],
];
const tipoDe = (t: string) => { for (const [l, re] of TIPOS) if (re.test(t || "")) return l; return "Outras ações"; };
const hhmm = (min: number) => String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(Math.round(min % 60)).padStart(2, "0");
const minDoDia = (d: Date) => d.getHours() * 60 + d.getMinutes();
const n1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const pct = (a: number, b: number) => (b ? Math.round(a / b * 100) + "%" : "—");
const mediana = (l: number[]) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

type Ev = { quando: string; d: Date; texto: string; c: any; tipo: string };

/** ações (sem importações) de uma pessoa no período, com o chamado */
function eventosDe(st: any, nome: string, de: string, ate: string): Ev[] {
  const out: Ev[] = [];
  st.chamados.forEach((c: any) => (c.historico || []).forEach((h: any) => {
    if (h.quem !== nome || LOTE.test(h.texto || "")) return;
    const d = new Date(h.quando); const iso = isoLocal(d); if (iso < de || iso > ate) return;
    out.push({ quando: h.quando, d, texto: h.texto, c, tipo: tipoDe(h.texto) });
  }));
  return out.sort((a, b) => +a.d - +b.d);
}
/** jornada: por dia, 1ª e última ação, horas ativas (blocos de 30 min com ação), maior pausa e pausas > 40 min (9h–18h) */
function jornada(evs: Ev[]) {
  const por: Record<string, Ev[]> = {}; evs.forEach(e => (por[isoLocal(e.d)] = por[isoLocal(e.d)] || []).push(e));
  return Object.entries(por).sort((a, b) => a[0].localeCompare(b[0])).map(([dia, l]) => {
    const ms = l.map(e => minDoDia(e.d)); const blocos = new Set(ms.map(m => Math.floor(m / 30))).size;
    let maior = 0, pausas = 0;
    for (let i = 1; i < ms.length; i++) { const g = ms[i] - ms[i - 1]; if (ms[i - 1] >= 540 && ms[i] <= 1080) { if (g > maior) maior = g; if (g > 40) pausas++; } }
    return { dia, n: l.length, ini: ms[0], fim: ms[ms.length - 1], ativas: blocos / 2, maior, pausas };
  });
}
/** números de uma pessoa (para a ficha e para o comparativo) */
function numeros(st: any, u: any, de: string, ate: string) {
  const evs = eventosDe(st, u.nome, de, ate); const J = jornada(evs);
  const avg = (k: "n" | "ini" | "fim" | "ativas" | "pausas") => J.length ? J.reduce((s, x) => s + x[k], 0) / J.length : 0;
  const ab = evs.filter(e => e.tipo === "Abriu solicitação"), fin = evs.filter(e => e.tipo === "Finalizou atendimento");
  const noPrazo = fin.filter(e => !e.c.slaResposta || +e.d <= +new Date(e.c.slaResposta)).length;
  return { evs, J, dias: J.length, acoesDia: avg("n"), ativas: avg("ativas"), ini: avg("ini"), fim: avg("fim"), pausasDia: avg("pausas"), abertas: ab.length, finalizadas: fin.length, noPrazo,
    checklist: evs.filter(e => ["Confirmou vinda / presença", "WhatsApp / mensagem enviada", "Agendou checklist", "Liberou da agenda"].includes(e.tipo) && e.c.tipo === "checklist").length };
}

export default function FichaProdutividade({ uid, de0, ate0, voltar }: { uid: string; de0: string; ate0: string; voltar: () => void }) {
  const { R, st, abrirDetalhe } = useApp() as any;
  const hoje = hojeISO(); const menos = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return isoLocal(d); };
  const [sel, setSel] = useState(uid);
  const [per, setPer] = useState(de0 || ate0 ? "filtro" : "30");
  const [pDe, setPDe] = useState(de0 || menos(29)); const [pAte, setPAte] = useState(ate0 || hoje);
  const { de, ate } = per === "hoje" ? { de: hoje, ate: hoje } : per === "7" ? { de: menos(6), ate: hoje } : per === "30" ? { de: menos(29), ate: hoje } : { de: pDe, ate: pAte };
  const u = R.getUser(sel);
  const N = useMemo(() => u ? numeros(st, u, de, ate) : null, [st, sel, de, ate]);
  const setor0 = (u?.setores || [])[0];
  const colegas = useMemo(() => {
    const esc = R.escopoSetores();
    return st.usuarios.filter((x: any) => x.ativo && (x.setores || []).includes(setor0) && (!esc || (x.setores || []).some((s: string) => esc.includes(s))))
      .map((x: any) => ({ u: x, ...numeros(st, x, de, ate) })).sort((a: any, b: any) => b.evs.length - a.evs.length);
  }, [st, setor0, de, ate]);
  if (!u || !N) return null;
  const ss: string[] = u.setores || []; const cor = corDoSetor(setor0);
  // o que fez
  const cont: Record<string, number> = {}; N.evs.forEach(e => (cont[e.tipo] = (cont[e.tipo] || 0) + 1));
  const tipos = Object.entries(cont).sort((a, b) => b[1] - a[1]); const mxT = Math.max(1, ...tipos.map(t => t[1]));
  const corT = (l: string) => (TIPOS.find(t => t[0] === l) || ["", /./, "#8b94a3"])[2];
  // resultado do trabalho conforme o setor
  const res: { n: string; l: string; cls?: string; title?: string }[] = [];
  if (ss.includes("suporte_consultores")) {
    const defs = N.evs.filter(e => e.tipo === "Definiu vendedor"); const ch = new Set(defs.map(e => e.c.id));
    const depois = defs.filter(e => e.c.dataLoja && +e.d > +new Date(e.c.dataLoja)).length;
    const antec = mediana(defs.filter(e => e.c.dataLoja && +new Date(e.c.dataLoja) > +e.d).map(e => (+new Date(e.c.dataLoja) - +e.d) / 36e5));
    const cob = N.evs.filter(e => e.tipo === "Cobrou parecer do vendedor");
    const resp = cob.map(e => (e.c.historico || []).filter((h: any) => +new Date(h.quando) > +e.d && h.quem !== u.nome && h.quem !== "Sistema").map((h: any) => +new Date(h.quando)).sort()[0]);
    const respH = resp.filter(Boolean).map((t, i) => (t - +cob[i].d) / 36e5);
    const agora = new Date();
    const fila = st.chamados.filter((c: any) => R.domMarketing(c) && !c.atendenteId && c.setorDestino === "suporte_consultores" && c.dataLoja && new Date(c.dataLoja) >= agora && !c.venda).length;
    const filaJa = st.chamados.filter((c: any) => R.domMarketing(c) && !c.atendenteId && c.dataLoja && String(c.dataLoja).slice(0, 10) <= isoLocal(new Date(Date.now() + 864e5)) && new Date(c.dataLoja) >= agora && !c.venda).length;
    res.push({ n: String(ch.size), l: "clientes com vendedor definido", cls: "bom" },
      { n: antec == null ? "—" : antec >= 48 ? "~" + Math.round(antec / 24) + " dias" : Math.round(antec) + "h", l: "de antecedência antes da vinda à loja (mediana)" },
      { n: String(depois), l: "definidos depois da hora marcada na loja", cls: depois ? "ruim" : "" },
      { n: String(fila), l: "clientes na fila sem vendedor agora" + (filaJa ? " · " + filaJa + " para hoje/amanhã" : ""), cls: filaJa ? "ruim" : "" },
      { n: String(cob.length), l: "pareceres cobrados" },
      { n: pct(respH.length, cob.length), l: "dos cobrados tiveram resposta", cls: "bom" },
      { n: respH.length ? n1(mediana(respH) as number) + "h" : "—", l: "até a resposta (mediana)" },
      { n: String(cob.length - respH.length), l: "cobranças ainda sem resposta", cls: cob.length - respH.length ? "ruim" : "" });
  }
  if (ss.includes("callcenter") || ss.includes("supervisao")) {
    res.push({ n: String(N.abertas), l: "solicitações abertas", cls: "bom" }, { n: String(N.finalizadas), l: "atendimentos finalizados por ela" },
      { n: pct(N.finalizadas, N.abertas), l: "resolvido (finalizadas ÷ abertas)" }, { n: pct(N.noPrazo, N.finalizadas), l: "finalizados dentro do prazo", cls: N.finalizadas && N.noPrazo / N.finalizadas < .85 ? "ruim" : "bom" });
    if (N.checklist) res.push({ n: String(N.checklist), l: "ações no checklist (confirmações, mensagens, agendas)" });
  }
  // mapa de calor
  const H: Record<string, number> = {}; N.evs.forEach(e => { const k = e.d.getDay() + "|" + e.d.getHours(); H[k] = (H[k] || 0) + 1; });
  const mxH = Math.max(1, ...Object.values(H)); const horas = Array.from({ length: 11 }, (_, i) => 8 + i);
  const picoK = Object.entries(H).sort((a, b) => b[1] - a[1])[0];
  const media = colegas.length ? colegas.reduce((s: number, x: any) => s + x.acoesDia, 0) / colegas.filter((x: any) => x.dias).length || 0 : 0;
  return (
    <div className="fp">
      <button className="btn ghost sm" onClick={voltar}>‹ Voltar ao controle de atividades</button>
      <div className="fp-cab"><div className="av" style={{ background: cor }}>{inicial(u.nome)}</div><div><b>{u.nome}</b><span>{R.setoresLabel(u)}</span></div>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{ marginLeft: "auto" }}>{colegas.map((x: any) => <option key={x.u.id} value={x.u.id}>{x.u.nome}</option>)}{!colegas.some((x: any) => x.u.id === sel) && <option value={sel}>{u.nome}</option>}</select></div>
      <div className="chips" style={{ margin: "8px 0 12px" }}>{[["hoje", "Hoje"], ["7", "7 dias"], ["30", "30 dias"], ["filtro", "📅 Período"]].map(([k, l]) => <button key={k} className={"chip" + (per === k ? " on" : "")} onClick={() => setPer(k)}>{l}</button>)}
        {per === "filtro" && <span style={{ marginLeft: 6 }}><input type="date" value={pDe} onChange={e => setPDe(e.target.value || pDe)} /> até <input type="date" value={pAte} onChange={e => setPAte(e.target.value || pAte)} /></span>}</div>
      {!N.evs.length ? <div className="empty">Nenhuma ação de {u.nome} de {fmtDate(de)} a {fmtDate(ate)}.</div> : <>
        <div className="fp-kp">
          <div><b>{N.dias}</b><span>dias com atividade</span></div>
          <div><b>{Math.round(N.acoesDia)}</b><span>ações por dia</span><small>{media ? "média do setor " + Math.round(media) : "média"}</small></div>
          <div><b>{n1(N.ativas)}h</b><span>ativas por dia</span><small>blocos de 30 min com ação</small></div>
          <div><b>{hhmm(N.ini)}</b><span>primeira ação</span><small>média</small></div>
          <div><b>{hhmm(N.fim)}</b><span>última ação</span><small>média</small></div>
          <div><b>{n1(N.pausasDia)}</b><span>pausas &gt; 40 min/dia</span><small>no horário 9h–18h</small></div>
        </div>
        <div className="fp-g2">
          <div className="panel"><h3>O que fez <small>{N.evs.length} ações (importações de planilha não contam)</small></h3>
            {tipos.map(([l, n]) => <div key={l} className="fp-tp"><span>{l}</span><div className="fp-pb"><i style={{ width: n / mxT * 100 + "%", background: corT(l) }} /></div><b>{n}</b></div>)}</div>
          {res.length > 0 && <div className="panel"><h3>Resultado do trabalho</h3><div className="fp-res">{res.map((r, i) => <div key={i} className={r.cls || ""}><b>{r.n}</b><span>{r.l}</span></div>)}</div></div>}
        </div>
        <div className="fp-g2">
          <div className="panel"><h3>⏱ Jornada por dia <small>1ª e última ação · horas ativas · maior pausa</small></h3>
            <div className="an-tab-wrap"><table className="dl-tab"><thead><tr><th>Dia</th><th>Início</th><th>Fim</th><th style={{ minWidth: 150 }}>8h — 19h</th><th>Ações</th><th>Ativas</th><th>Maior pausa</th></tr></thead>
              <tbody>{N.J.slice().reverse().map(j => <tr key={j.dia}><td><b>{fmtDate(j.dia).slice(0, 5)}</b> <small className="hint">{DIAS[new Date(j.dia + "T12:00").getDay()]}</small></td><td>{hhmm(j.ini)}</td><td>{hhmm(j.fim)}</td>
                <td><div className="fp-tl"><i style={{ left: Math.min(100, Math.max(0, (j.ini - 480) / 660 * 100)) + "%", width: Math.max(1, (Math.min(1140, Math.max(480, j.fim)) - Math.min(1140, Math.max(480, j.ini))) / 660 * 100) + "%" }} /></div></td><td>{j.n}</td><td>{n1(j.ativas)}h</td>
                <td style={j.maior >= 150 ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{j.maior ? hhmm(j.maior) : "—"}</td></tr>)}</tbody></table></div>
            <div className="hint" style={{ marginTop: 6 }}>Em vermelho: pausa maior que 2h30 sem nenhuma ação no sistema (almoço longo, trabalho fora do 360 ou ausência — vale conversar).</div></div>
          <div className="panel"><h3>🔥 Quando produz <small>ações por hora × dia da semana</small></h3>
            <table className="fp-heat"><thead><tr><th></th>{horas.map(h => <th key={h}>{h}h</th>)}</tr></thead>
              <tbody>{[1, 2, 3, 4, 5, 6, 0].map(d => <tr key={d}><th>{DIAS[d]}</th>{horas.map(h => { const v = H[d + "|" + h] || 0; return <td key={h} style={{ background: v ? `rgba(59,111,216,${0.15 + 0.85 * v / mxH})` : undefined, color: v / mxH > .55 ? "#fff" : undefined }}>{v || ""}</td>; })}</tr>)}</tbody></table>
            {picoK && <div className="hint" style={{ marginTop: 6 }}>Pico: {DIAS[+picoK[0].split("|")[0]]} às {picoK[0].split("|")[1]}h ({picoK[1]} ações).</div>}</div>
        </div>
        <div className="panel"><h3>📋 Últimas ações <small>clique para abrir o cliente</small></h3>
          <div className="fp-ult">{N.evs.slice(-40).reverse().map((e, i) => <div key={i} onClick={() => abrirDetalhe(e.c.id)}><span>{e.d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span><b>{e.c.cliente || e.c.id}</b><em>{e.texto}</em></div>)}</div></div>
      </>}
      {colegas.length > 1 && <div className="panel"><h3>👥 Comparativo do setor <small>{R.setorNome(setor0)} · mesmo período · clique para abrir a ficha</small></h3>
        <div className="an-tab-wrap"><table className="dl-tab"><thead><tr><th>Pessoa</th><th>Dias</th><th>Ações/dia</th><th>Ativas/dia</th><th>Horário médio</th>{(ss.includes("callcenter") || ss.includes("supervisao")) && <><th>Abertas</th><th>Finalizadas</th><th>No prazo</th></>}<th>Pausas/dia</th></tr></thead>
          <tbody>{colegas.map((x: any) => <tr key={x.u.id} onClick={() => setSel(x.u.id)} style={{ cursor: "pointer", background: x.u.id === sel ? "var(--primary-soft)" : undefined }}>
            <td><b>{x.u.nome}</b></td><td>{x.dias}</td><td>{Math.round(x.acoesDia)}</td><td>{n1(x.ativas)}h</td><td>{x.dias ? hhmm(x.ini) + " – " + hhmm(x.fim) : "—"}</td>
            {(ss.includes("callcenter") || ss.includes("supervisao")) && <><td>{x.abertas}</td><td>{x.finalizadas}</td><td style={x.finalizadas && x.noPrazo / x.finalizadas < .85 ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{pct(x.noPrazo, x.finalizadas)}</td></>}
            <td>{x.dias ? n1(x.pausasDia) : "—"}</td></tr>)}</tbody></table></div></div>}
    </div>
  );
}
