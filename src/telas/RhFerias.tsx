// 🏖 RH · Controle de férias — todos os funcionários (dados do cadastro), período aquisitivo, saldo, prazo para tirar,
// férias programadas/gozadas e quem está de férias. Só Bruno e Patrícia.
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../estado";
import { baixarXlsxFormatado } from "../lib/planilha";
import { podeRh } from "../lib/ponto";
import { apagarFerias, criarFerias, listarFerias, listarFuncionarios, nomeEmpresa, EMPRESAS, type Ferias, type Funcionario } from "../lib/rh";

const br = (s?: string | null) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—");
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const addY = (s: string, n: number) => { const d = new Date(s + "T12:00:00Z"); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10); };
const addM = (s: string, n: number) => { const d = new Date(s + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const addD = (s: string, n: number) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dias = (de: string, ate: string) => Math.round((+new Date(ate + "T12:00") - +new Date(de + "T12:00")) / 86400000) + 1;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type Sit = "ferias" | "vencida" | "vencendo" | "programada" | "a_tirar" | "em_dia" | "primeiro_ano";
const SIT: Record<Sit, [string, string, string]> = {
  ferias: ["🏖 De férias agora", "#E6F0FF", "#1D4ED8"],
  vencida: ["⛔ Passou do prazo — risco de dobra", "#FDE8E8", "#B91C1C"],
  vencendo: ["⚠ Vence em até 90 dias", "#FFF4DC", "#9A5B00"],
  programada: ["📅 Programada", "#EEF6EE", "#1F6B3E"],
  a_tirar: ["Tem saldo a tirar", "#F3F4F6", "#374151"],
  em_dia: ["✓ Em dia", "#E8F3EC", "#1F6B3E"],
  primeiro_ano: ["1º ano de casa", "#F3F4F6", "#6B7280"],
};

/** período aquisitivo vencido mais recente (12 meses completos), saldo, prazo e período em andamento */
function calc(f: Funcionario, fs: Ferias[], h: string) {
  const adm = f.admissao as string;
  let completos = 0; while (addY(adm, completos + 1) <= h) completos++;
  const aqDe = completos ? addY(adm, completos - 1) : null, aqAte = completos ? addD(addY(adm, completos), -1) : null;
  const limite = aqAte ? addM(addD(aqAte, 1), 11) : null; // precisa começar até aqui (o período concessivo é de 12 meses)
  const minhas = fs.filter(x => x.funcionario_id === f.id).sort((a, b) => a.de.localeCompare(b.de));
  const contam = aqAte ? minhas.filter(x => x.de > aqAte) : [];
  const gozadas = contam.filter(x => x.de <= h).reduce((s, x) => s + dias(x.de, x.ate), 0);
  const programadas = contam.filter(x => x.de > h).reduce((s, x) => s + dias(x.de, x.ate), 0);
  const saldo = completos ? Math.max(0, 30 - gozadas - programadas) : 0;
  const agora = minhas.find(x => x.de <= h && x.ate >= h) || null;
  const prox = minhas.find(x => x.de > h) || null;
  const atualDe = addY(adm, completos);
  const mesesAtual = Math.max(0, Math.floor((+new Date(h) - +new Date(atualDe)) / (30.44 * 86400000)));
  const proporcional = Math.min(30, Math.round(mesesAtual * 2.5));
  const faltaDias = limite ? Math.round((+new Date(limite) - +new Date(h)) / 86400000) : null;
  let sit: Sit;
  if (agora) sit = "ferias";
  else if (!completos) sit = "primeiro_ano";
  else if (saldo > 0 && faltaDias != null && faltaDias < 0) sit = "vencida";
  else if (saldo > 0 && faltaDias != null && faltaDias <= 90) sit = "vencendo";
  else if (programadas > 0) sit = "programada";
  else if (saldo > 0) sit = "a_tirar";
  else sit = "em_dia";
  return { completos, aqDe, aqAte, limite, faltaDias, gozadas, programadas, saldo, agora, prox, atualDe, mesesAtual, proporcional, minhas, sit };
}

export default function RhFerias() {
  const { R, toast } = useApp() as any;
  const uid = R.currentUserId;
  const [funcs, setFuncs] = useState<Funcionario[] | null>(null);
  const [fs, setFs] = useState<Ferias[]>([]);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<"controle" | "escala">("controle");
  const [fEmp, setFEmp] = useState(""); const [fDep, setFDep] = useState(""); const [fSit, setFSit] = useState<Sit | "">(""); const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const recF = () => listarFerias().then(setFs).catch(e => toast?.(e.message));
  useEffect(() => { listarFuncionarios().then(setFuncs).catch(e => setErro(e.message)); recF(); }, []);
  const h = hoje();
  const linhas = useMemo(() => (funcs || []).filter(f => f.status !== "desligado" && f.admissao).map(f => ({ f, ...calc(f, fs, h) })), [funcs, fs, h]);
  if (!podeRh(uid)) return <section className="view active"><div className="empty">Só o Bruno e a Patrícia (RH) veem esta tela.</div></section>;

  const deps = Array.from(new Set(linhas.map(l => l.f.setor).filter(Boolean))).sort();
  const vis = linhas.filter(l => (!fEmp || l.f.empresa === fEmp) && (!fDep || l.f.setor === fDep) && (!fSit || l.sit === fSit)
    && (!busca || (l.f.nome + " " + l.f.folha + " " + l.f.cargo).toLowerCase().includes(busca.toLowerCase())))
    .sort((a, b) => { const o: Sit[] = ["vencida", "ferias", "vencendo", "programada", "a_tirar", "em_dia", "primeiro_ano"]; return o.indexOf(a.sit) - o.indexOf(b.sit) || (a.faltaDias ?? 9e9) - (b.faltaDias ?? 9e9) || a.f.nome.localeCompare(b.f.nome); });
  const conta = (s: Sit) => linhas.filter(l => (!fEmp || l.f.empresa === fEmp) && l.sit === s).length;
  const semAdm = (funcs || []).filter(f => f.status !== "desligado" && !f.admissao).length;

  const xlsx = () => baixarXlsxFormatado("CONTROLE_FERIAS_" + h + ".xlsx", "FÉRIAS",
    [{ titulo: "Nº FOLHA", largura: 9, alinhar: "center" }, { titulo: "NOME", largura: 38 }, { titulo: "EMPRESA", largura: 16 }, { titulo: "FUNÇÃO", largura: 24 }, { titulo: "DEPARTAMENTO", largura: 22 },
     { titulo: "ADMISSÃO", largura: 12, tipo: "data", alinhar: "center" }, { titulo: "PERÍODO AQUISITIVO", largura: 24, alinhar: "center" }, { titulo: "SALDO (DIAS)", largura: 11, alinhar: "center" },
     { titulo: "INICIAR ATÉ", largura: 12, tipo: "data", alinhar: "center" }, { titulo: "PROGRAMADAS / GOZADAS", largura: 40 }, { titulo: "PERÍODO ATUAL (DIAS PROP.)", largura: 14, alinhar: "center" }, { titulo: "SITUAÇÃO", largura: 26 }],
    vis.map(l => [l.f.folha, l.f.nome, nomeEmpresa(l.f.empresa), l.f.cargo, l.f.setor, l.f.admissao, l.aqDe ? br(l.aqDe) + " a " + br(l.aqAte) : "1º ano", l.completos ? l.saldo : "",
      l.completos && l.saldo > 0 ? l.limite : "", l.minhas.map(x => br(x.de) + " a " + br(x.ate) + " (" + dias(x.de, x.ate) + "d)").join("; "), l.proporcional, SIT[l.sit][0].replace(/^[^\wÀ-ú]+\s*/, "")]));

  return (
    <section className="view active">
      <div className="view-head"><div><h2>🏖 RH · Controle de férias</h2><p>Período aquisitivo, saldo de dias, prazo para começar as férias antes de vencer (pagamento em dobro), férias programadas e quem está fora. Só você e a Patrícia.</p></div></div>
      <div className="subnav" style={{ margin: "0 0 12px" }}>
        <button className={aba === "controle" ? "on" : ""} onClick={() => setAba("controle")}>📋 Controle por funcionário</button>
        <button className={aba === "escala" ? "on" : ""} onClick={() => setAba("escala")}>📅 Escala dos próximos meses</button>
      </div>
      {erro && <div className="empty">{erro}</div>}
      {!funcs ? <div className="empty">Carregando…</div> : <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 8, marginBottom: 12 }}>
          {(["ferias", "vencida", "vencendo", "programada", "a_tirar"] as Sit[]).map(s => <button key={s} className="card" onClick={() => { setFSit(fSit === s ? "" : s); setAba("controle"); }}
            style={{ textAlign: "left", padding: "10px 12px", cursor: "pointer", background: SIT[s][1], border: fSit === s ? "2px solid " + SIT[s][2] : undefined }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: SIT[s][2] }}>{conta(s)}</div><div style={{ fontSize: 13, color: SIT[s][2] }}>{SIT[s][0]}</div></button>)}
        </div>
        <div className="card ma-topo"><div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <div className="field" style={{ flex: "1 1 200px" }}><label>Buscar</label><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, nº folha, função…" /></div>
          <div className="field"><label>Empresa</label><select value={fEmp} onChange={e => setFEmp(e.target.value)}><option value="">Todas</option>{EMPRESAS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
          <div className="field"><label>Departamento</label><select value={fDep} onChange={e => setFDep(e.target.value)}><option value="">Todos</option>{deps.map(d => <option key={d}>{d}</option>)}</select></div>
          <div className="field"><label>Situação</label><select value={fSit} onChange={e => setFSit(e.target.value as any)}><option value="">Todas</option>{(Object.keys(SIT) as Sit[]).map(s => <option key={s} value={s}>{SIT[s][0]}</option>)}</select></div>
          <button className="btn" onClick={xlsx}>⬇ Excel</button>
        </div>
          {semAdm > 0 && <div className="hint" style={{ marginTop: 6 }}>⚠ {semAdm} funcionário(s) sem data de admissão na ficha não aparecem aqui.</div>}
        </div>
        {aba === "controle" ? <div className="card" style={{ padding: 0, marginTop: 12, overflowX: "auto" }}>
          <div className="hint" style={{ padding: "8px 12px" }}>{vis.length} funcionário(s) · clique na linha para lançar ou ver as férias</div>
          <table className="ma-tab" style={{ minWidth: 1100, fontSize: 13.5 }}>
            <thead><tr><th>Folha</th><th>Funcionário</th><th>Empresa</th><th>Admissão</th><th>Período aquisitivo vencido</th><th style={{ textAlign: "center" }}>Saldo</th><th>Iniciar até</th><th>Próximas / atuais</th><th style={{ textAlign: "center" }}>Período atual</th><th>Situação</th></tr></thead>
            <tbody>{vis.map(l => <LinhaF key={l.f.id} l={l} h={h} aberto={aberto === l.f.id} abrir={() => setAberto(aberto === l.f.id ? null : l.f.id)} uid={uid} toast={toast} rec={recF} />)}</tbody>
          </table>
        </div> : <Escala linhas={vis} h={h} />}
        <p className="hint" style={{ marginTop: 10 }}>Regra: a cada 12 meses de casa (período aquisitivo) o funcionário ganha 30 dias. Eles precisam ser tirados nos 12 meses seguintes — o sistema avisa para começar até o 11º mês, senão vence e é pago em dobro.
          Pode dividir em até 3 períodos (um de pelo menos 14 dias e os outros de pelo menos 5). Faltas injustificadas podem reduzir os dias — confirme com o contador. Os períodos anteriores ao último vencido são considerados já tirados.</p>
      </>}
    </section>
  );
}

function LinhaF({ l, h, aberto, abrir, uid, toast, rec }: { l: any; h: string; aberto: boolean; abrir: () => void; uid: string; toast: any; rec: () => void }) {
  const [de, setDe] = useState(""); const [qtd, setQtd] = useState("30"); const [obs, setObs] = useState("");
  const ate = de && Number(qtd) > 0 ? addD(de, Number(qtd) - 1) : "";
  const [bg, cor] = [SIT[l.sit as Sit][1], SIT[l.sit as Sit][2]];
  const lancar = async () => {
    const n = Number(qtd);
    if (!de || !n) return toast?.("Informe o início e a quantidade de dias");
    if (n < 5) return toast?.("Cada período de férias tem no mínimo 5 dias");
    if (l.completos && n > l.saldo && !confirm(`O saldo é ${l.saldo} dias e você está lançando ${n}. Lançar mesmo assim?`)) return;
    try { await criarFerias({ funcionario_id: l.f.id, de, ate, obs }, uid); setDe(""); setObs(""); rec(); toast?.("Férias lançadas: " + br(de) + " a " + br(ate)); } catch (e: any) { toast?.(e.message); }
  };
  return <>
    <tr className="ma-lin" onClick={abrir} style={{ cursor: "pointer", background: aberto ? "#eef3ff" : undefined }}>
      <td>{l.f.folha || "—"}</td>
      <td><b>{l.f.nome}</b><div className="hint">{[l.f.cargo, l.f.setor].filter(Boolean).join(" · ")}</div></td>
      <td>{nomeEmpresa(l.f.empresa)}</td>
      <td>{br(l.f.admissao)}</td>
      <td>{l.aqDe ? br(l.aqDe) + " a " + br(l.aqAte) : <span className="hint">ainda no 1º ano</span>}</td>
      <td style={{ textAlign: "center" }}>{l.completos ? <b style={{ color: l.saldo > 0 ? cor : undefined }}>{l.saldo}</b> : "—"}{l.programadas > 0 && <div className="hint">{l.programadas} prog.</div>}</td>
      <td>{l.completos && l.saldo > 0 ? <b style={{ color: cor }}>{br(l.limite)}<div style={{ fontWeight: 400, fontSize: 12 }}>{l.faltaDias < 0 ? "passou há " + -l.faltaDias + " dias · dobra em " + br(addD(addY(l.aqAte, 1), 0)) : "faltam " + l.faltaDias + " dias"}</div></b> : "—"}</td>
      <td>{l.agora ? <b>até {br(l.agora.ate)}</b> : l.prox ? br(l.prox.de) + " a " + br(l.prox.ate) : "—"}</td>
      <td style={{ textAlign: "center" }}>{l.proporcional} dias<div className="hint">{l.mesesAtual}/12 meses</div></td>
      <td><span className="pill" style={{ background: bg, color: cor, borderColor: cor }}>{SIT[l.sit as Sit][0]}</span></td>
    </tr>
    {aberto && <tr><td colSpan={10} style={{ background: "#f7f9fd", padding: 12 }}>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px" }}>
          <b>Férias registradas</b>
          {l.minhas.length ? <table className="ma-tab" style={{ marginTop: 6, fontSize: 13 }}><tbody>{l.minhas.slice().reverse().map((x: Ferias) => <tr key={x.id}>
            <td>{br(x.de)} a {br(x.ate)}</td><td>{dias(x.de, x.ate)} dias</td><td>{x.de > h ? "programada" : x.ate < h ? "gozada" : "em andamento"}</td><td className="hint">{x.obs}</td>
            <td><button className="btn sm" onClick={async () => { if (confirm("Apagar estas férias?")) { await apagarFerias(x.id); rec(); } }}>✕</button></td></tr>)}</tbody></table>
            : <div className="hint" style={{ marginTop: 4 }}>Nenhuma férias lançada.</div>}
        </div>
        <div style={{ flex: "1 1 320px" }}>
          <b>➕ Lançar / programar férias</b>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginTop: 6 }}>
            <div className="field" style={{ margin: 0 }}><label>Início</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
            <div className="field" style={{ margin: 0, width: 90 }}><label>Dias</label><select value={qtd} onChange={e => setQtd(e.target.value)}>{[30, 20, 15, 14, 10, 5].map(n => <option key={n}>{n}</option>)}</select></div>
            <div className="field" style={{ margin: 0 }}><label>Volta em</label><input disabled value={ate ? br(addD(ate, 1)) : ""} style={{ width: 110 }} /></div>
            <div className="field" style={{ margin: 0, flex: 1, minWidth: 140 }}><label>Obs.</label><input value={obs} onChange={e => setObs(e.target.value)} placeholder="ex.: 1ª parte / abono 10 dias" /></div>
            <button className="btn primary" onClick={lancar}>Lançar</button>
          </div>
          {l.completos > 0 && <div className="hint" style={{ marginTop: 6 }}>Saldo do período {br(l.aqDe)} a {br(l.aqAte)}: <b>{l.saldo} dias</b> · começar até {br(l.limite)}.</div>}
        </div>
      </div>
    </td></tr>}
  </>;
}

/** quem sai em cada mês (próximos 12 meses), pelas férias lançadas */
function Escala({ linhas, h }: { linhas: any[]; h: string }) {
  const meses = Array.from({ length: 12 }, (_, i) => addM(h.slice(0, 7) + "-01", i).slice(0, 7));
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10, marginTop: 12 }}>
    {meses.map(m => {
      const fim = addD(addM(m + "-01", 1), -1);
      const q = linhas.flatMap(l => l.minhas.filter((x: Ferias) => x.de <= fim && x.ate >= m + "-01").map((x: Ferias) => ({ l, x }))).sort((a, b) => a.x.de.localeCompare(b.x.de));
      const vence = linhas.filter(l => l.saldo > 0 && l.limite && l.limite.slice(0, 7) === m);
      return <div key={m} className="card" style={{ padding: 10 }}>
        <b style={{ textTransform: "capitalize" }}>{MESES[+m.slice(5, 7) - 1]}/{m.slice(0, 4)}</b> <span className="hint">· {q.length} de férias</span>
        {q.map(({ l, x }) => <div key={x.id} style={{ fontSize: 13, marginTop: 4 }}>🏖 <b>{l.f.nome.split(" ").slice(0, 2).join(" ")}</b> <span className="hint">{br(x.de).slice(0, 5)}–{br(x.ate).slice(0, 5)} · {l.f.setor}</span></div>)}
        {vence.length > 0 && <div style={{ fontSize: 12.5, color: "#9A5B00", marginTop: 6 }}>⚠ Prazo para começar vence: {vence.map(l => l.f.nome.split(" ")[0]).join(", ")}</div>}
        {!q.length && !vence.length && <div className="hint" style={{ marginTop: 4 }}>—</div>}
      </div>;
    })}
  </div>;
}
