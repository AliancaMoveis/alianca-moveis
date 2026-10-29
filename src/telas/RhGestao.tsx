// RH · Gestão — valores (VA/VT), prévia da folha (cruza o ponto), descontos do mês e férias/13º. Só Bruno e Patrícia.
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../estado";
import { fmtMoeda } from "../lib/regras";
import { baixarXlsx } from "../lib/planilha";
import { hm, listarCartoes, podeRh, type CartaoDb, type DiaPonto } from "../lib/ponto";
import { apagarFerias, apagarLancRh, criarFerias, criarLancRh, lerCfgRh, listarFerias, listarFuncionarios, listarLanc, salvarCfgRh, soDig, CFG_PADRAO, TIPOS_LANC, type Cfg, type Ferias, type Funcionario, type Lanc } from "../lib/rh";

const br = (s?: string | null) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—");
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const num = (v: any) => { const n = Number(String(v ?? "0").replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : 0; };
const fimMes = (m: string) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7), 0); return m + "-" + String(d.getDate()).padStart(2, "0"); };

export default function RhGestao() {
  const { R, toast } = useApp() as any;
  const [aba, setAba] = useState("folha");
  const [cfg, setCfg] = useState<Cfg>(CFG_PADRAO);
  const [funcs, setFuncs] = useState<Funcionario[] | null>(null);
  const [ponto, setPonto] = useState<{ cartoes: CartaoDb[]; dias: (DiaPonto & { cartao_id: number })[] } | null>(null);
  const [ferias, setFerias] = useState<Ferias[]>([]);
  const [mes, setMes] = useState(hoje().slice(0, 7));
  const [lancs, setLancs] = useState<Lanc[]>([]);
  const [erro, setErro] = useState("");
  useEffect(() => {
    lerCfgRh().then(setCfg).catch(() => null);
    listarFuncionarios().then(setFuncs).catch(e => setErro(e.message));
    listarCartoes().then(setPonto).catch(() => setPonto({ cartoes: [], dias: [] }));
    listarFerias().then(setFerias).catch(() => null);
  }, []);
  useEffect(() => { listarLanc(mes).then(setLancs).catch(() => setLancs([])); }, [mes]);
  if (!podeRh(R.currentUserId)) return <section className="view active"><div className="empty">Só o Bruno e a Patrícia (RH) veem esta tela.</div></section>;

  const linhas = useMemo(() => {
    if (!funcs || !ponto) return [];
    const de = mes + "-01", ate = fimMes(mes);
    return funcs.filter(f => f.status !== "desligado").map(f => {
      const cpfs = soDig(f.cpf);
      const meus = ponto.cartoes.filter(c => cpfs && soDig(c.cpf) === cpfs).map(c => c.id);
      const ds = ponto.dias.filter(d => meus.includes(d.cartao_id) && d.data >= de && d.data <= ate);
      const pres = ds.filter(d => d.batidas.length);
      const doms = pres.filter(d => new Date(d.data + "T12:00").getDay() === 0);
      const fers = pres.filter(d => d.feriado);
      const e50 = ds.reduce((s, d) => s + d.ex50, 0), e100 = ds.reduce((s, d) => s + d.ex100, 0), falt = ds.reduce((s, d) => s + d.faltas, 0);
      const vaDia = f.va_dia || cfg.va_dia, vtDia = f.vt_dia || cfg.vt_dia;
      const va = pres.length * vaDia;
      const vt = f.recebe_vt ? pres.length * vtDia : 0;
      const hora = f.salario ? f.salario / 220 : null;
      const vE50 = hora != null ? (e50 / 60) * hora * 1.5 : null;
      const vE100 = hora != null ? (e100 / 60) * hora * 2 : null;
      const vFalt = hora != null ? (falt / 60) * hora : null;
      const meusLanc = lancs.filter(l => l.funcionario_id === f.id);
      const lMais = meusLanc.filter(l => (TIPOS_LANC.find(t => t[0] === l.tipo)?.[2] ?? -1) > 0).reduce((s, l) => s + l.valor, 0);
      const lMenos = meusLanc.filter(l => (TIPOS_LANC.find(t => t[0] === l.tipo)?.[2] ?? -1) < 0).reduce((s, l) => s + l.valor, 0);
      return { f, temPonto: meus.length > 0, pres: pres.length, doms: doms.length, fers: fers.length, e50, e100, falt, va, vt, vE50, vE100, vFalt, lMais, lMenos, meusLanc };
    }).sort((a, b) => a.f.nome.localeCompare(b.f.nome));
  }, [funcs, ponto, cfg, mes, lancs]);

  const abas = <div className="subnav" style={{ margin: "0 0 14px" }}>
    <button className={aba === "folha" ? "on" : ""} onClick={() => setAba("folha")}>💰 Prévia da folha</button>
    <button className={aba === "desc" ? "on" : ""} onClick={() => setAba("desc")}>➖ Descontos e bônus do mês</button>
    <button className={aba === "ferias" ? "on" : ""} onClick={() => setAba("ferias")}>🏖 Férias e 13º</button>
    <button className={aba === "valores" ? "on" : ""} onClick={() => setAba("valores")}>⚙ Valores e regras</button>
  </div>;
  const mesInput = <div className="field"><label>Mês</label><input type="month" value={mes} onChange={e => setMes(e.target.value)} /></div>;

  return (
    <section className="view active">
      <div className="view-head"><div><h2>💼 RH · Gestão</h2><p>Valores, prévia da folha cruzando a folha ponto, descontos do mês e controle de férias/13º — só você e a Patrícia.</p></div></div>
      {abas}
      {erro && <div className="empty">{erro}</div>}
      {aba === "valores" && <Valores cfg={cfg} setCfg={setCfg} uid={R.currentUserId} toast={toast} />}
      {aba === "folha" && <Folha linhas={linhas} mes={mes} mesInput={mesInput} cfg={cfg} />}
      {aba === "desc" && <Descontos funcs={funcs || []} lancs={lancs} mes={mes} mesInput={mesInput} rec={() => listarLanc(mes).then(setLancs)} uid={R.currentUserId} toast={toast} />}
      {aba === "ferias" && <FeriasTab funcs={funcs || []} ferias={ferias} rec={() => listarFerias().then(setFerias)} uid={R.currentUserId} toast={toast} />}
    </section>
  );
}

function Valores({ cfg, setCfg, uid, toast }: any) {
  const [va, setVa] = useState(String(cfg.va_dia).replace(".", ",")); const [vt, setVt] = useState(String(cfg.vt_dia).replace(".", ","));
  const [vaAt, setVaAt] = useState(!!cfg.va_atestado); const [jor, setJor] = useState(hm(cfg.jornada_min));
  useEffect(() => { setVa(String(cfg.va_dia).replace(".", ",")); setVt(String(cfg.vt_dia).replace(".", ",")); setVaAt(!!cfg.va_atestado); setJor(hm(cfg.jornada_min)); }, [cfg]);
  const salvar = async () => {
    const m = jor.match(/(\d{1,2}):(\d{2})/); const c = { va_dia: num(va), vt_dia: num(vt), va_atestado: vaAt, jornada_min: m ? +m[1] * 60 + +m[2] : 440 };
    try { await salvarCfgRh(c, uid); setCfg(c); toast("Valores salvos"); } catch (e: any) { toast(e.message); }
  };
  return (
    <div className="card" style={{ padding: 16, maxWidth: 680 }}>
      <b>Valores padrão da empresa</b>
      <p className="hint" style={{ margin: "4px 0 12px" }}>Valem para todos. Para um funcionário com valor diferente, preencha na ficha dele (em Funcionários) — o valor da ficha ganha do padrão.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
        <div className="field"><label>Vale-refeição/alimentação por dia trabalhado (R$)</label><input value={va} onChange={e => setVa(e.target.value)} inputMode="decimal" /></div>
        <div className="field"><label>Vale-transporte por dia trabalhado (R$)</label><input value={vt} onChange={e => setVt(e.target.value)} inputMode="decimal" /></div>
        <div className="field"><label>Jornada diária padrão (h:mm)</label><input value={jor} onChange={e => setJor(e.target.value)} placeholder="7:20" /></div>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0" }}><input type="checkbox" checked={vaAt} onChange={e => setVaAt(e.target.checked)} /> Dia de atestado também ganha o vale (quando as justificativas forem lançadas)</label>
      <button className="btn primary" onClick={salvar}>💾 Salvar</button>
      <p className="hint" style={{ marginTop: 12 }}>Nas contas: valor da hora = salário ÷ 220 · extra 50% = hora × 1,5 · extra 100% = hora × 2 · desconto de falta = horas de falta × valor da hora. DSR, INSS, IRRF e encargos ficam com o contador — aqui é a prévia gerencial.</p>
    </div>
  );
}

function Folha({ linhas, mes, mesInput, cfg }: any) {
  const m = (v: number | null) => v == null ? "—" : fmtMoeda(v);
  const exportar = () => {
    const cab = ["Funcionário", "Cargo", "Dias c/ presença", "Domingos", "Feriados", "Extra 50% (h)", "Extra 100% (h)", "Faltas (h)", "VA (R$)", "VT (R$)", "Extra 50% (R$)", "Extra 100% (R$)", "Desconto faltas (R$)", "Bônus/reembolsos (R$)", "Descontos do mês (R$)"];
    baixarXlsx("previa_folha_" + mes + ".xlsx", cab, linhas.map((x: any) => [x.f.nome, x.f.cargo, x.pres, x.doms, x.fers, hm(x.e50), hm(x.e100), hm(x.falt), x.va, x.vt, x.vE50 ?? "", x.vE100 ?? "", x.vFalt ?? "", x.lMais, x.lMenos]), "Prévia " + mes);
  };
  const tot = (f: (x: any) => number) => linhas.reduce((s: number, x: any) => s + (f(x) || 0), 0);
  return <>
    <div className="card ma-topo"><div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>{mesInput}<button className="btn primary" disabled={!linhas.length} onClick={exportar}>⬇ Excel da prévia</button>
      <span className="hint">Dias e horas vêm da <b>Folha ponto</b> (ligação pelo CPF do cadastro = CPF do cartão). VA padrão {fmtMoeda(cfg.va_dia)} · VT padrão {fmtMoeda(cfg.vt_dia)}.</span></div></div>
    {!linhas.length ? <div className="empty" style={{ padding: 24 }}>Cadastre os funcionários e envie os cartões ponto para a prévia aparecer.</div> :
      <div className="card" style={{ padding: 0, marginTop: 14, overflowX: "auto" }}>
        <table className="ma-tab" style={{ minWidth: 1150 }}>
          <thead><tr><th>Funcionário</th><th className="n">Dias pres.</th><th className="n">Dom</th><th className="n">Fer</th><th className="n">Ex50</th><th className="n">Ex100</th><th className="n">Faltas</th><th className="n">VA</th><th className="n">VT</th><th className="n">Ex50 R$</th><th className="n">Ex100 R$</th><th className="n">Desc. faltas</th><th className="n">Lançamentos</th></tr></thead>
          <tbody>{linhas.map((x: any) => <tr key={x.f.id} style={!x.temPonto ? { opacity: .55 } : undefined}>
            <td><b>{x.f.nome}</b><div className="hint">{x.f.cargo || ""}{!x.temPonto ? " · sem cartão ponto com este CPF" : ""}{x.f.salario == null ? " · sem salário na ficha (R$ das horas não calcula)" : ""}</div></td>
            <td className="n"><b>{x.pres}</b></td><td className="n">{x.doms || "–"}</td><td className="n">{x.fers || "–"}</td>
            <td className="n">{x.e50 ? hm(x.e50) : "–"}</td><td className="n">{x.e100 ? hm(x.e100) : "–"}</td><td className="n">{x.falt ? hm(x.falt) : "–"}</td>
            <td className="n"><b>{m(x.va)}</b></td><td className="n">{x.f.recebe_vt ? <b>{m(x.vt)}</b> : "–"}</td>
            <td className="n">{m(x.vE50)}</td><td className="n">{m(x.vE100)}</td><td className="n">{x.vFalt ? <span style={{ color: "var(--danger)" }}>{m(x.vFalt)}</span> : "—"}</td>
            <td className="n">{x.lMais || x.lMenos ? <>{x.lMais ? "+" + fmtMoeda(x.lMais) : ""} {x.lMenos ? <span style={{ color: "var(--danger)" }}>−{fmtMoeda(x.lMenos)}</span> : ""}</> : "–"}</td>
          </tr>)}</tbody>
          <tfoot><tr><td>Total</td><td className="n">{tot(x => x.pres)}</td><td className="n">{tot(x => x.doms)}</td><td className="n">{tot(x => x.fers)}</td><td className="n">{hm(tot(x => x.e50))}</td><td className="n">{hm(tot(x => x.e100))}</td><td className="n">{hm(tot(x => x.falt))}</td><td className="n">{fmtMoeda(tot(x => x.va))}</td><td className="n">{fmtMoeda(tot(x => x.vt))}</td><td className="n">{fmtMoeda(tot(x => x.vE50 || 0))}</td><td className="n">{fmtMoeda(tot(x => x.vE100 || 0))}</td><td className="n">{fmtMoeda(tot(x => x.vFalt || 0))}</td><td className="n">{fmtMoeda(tot(x => x.lMais) - tot(x => x.lMenos))}</td></tr></tfoot>
        </table>
      </div>}
  </>;
}

function Descontos({ funcs, lancs, mes, mesInput, rec, uid, toast }: any) {
  const [fid, setFid] = useState(""); const [tipo, setTipo] = useState("desconto"); const [descr, setDescr] = useState(""); const [valor, setValor] = useState("");
  const ativos = funcs.filter((f: Funcionario) => f.status !== "desligado");
  const add = async () => {
    if (!fid) { toast("Escolha o funcionário"); return; } if (!num(valor)) { toast("Informe o valor"); return; }
    try { await criarLancRh({ funcionario_id: fid, competencia: mes, tipo, descricao: descr.trim(), valor: num(valor) }, uid); setDescr(""); setValor(""); rec(); toast("Lançado"); } catch (e: any) { toast(e.message); }
  };
  const nome = (id: string) => (funcs.find((f: Funcionario) => f.id === id) || { nome: "?" }).nome;
  return <>
    <div className="card ma-topo"><div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
      {mesInput}
      <div className="field" style={{ flex: "1 1 200px" }}><label>Funcionário</label><select value={fid} onChange={e => setFid(e.target.value)}><option value="">—</option>{ativos.map((f: Funcionario) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>
      <div className="field"><label>Tipo</label><select value={tipo} onChange={e => setTipo(e.target.value)}>{TIPOS_LANC.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
      <div className="field" style={{ flex: "1 1 180px" }}><label>Descrição</label><input value={descr} onChange={e => setDescr(e.target.value)} placeholder="Ex.: adiantamento dia 15" /></div>
      <div className="field"><label>Valor (R$)</label><input style={{ width: 110 }} value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" /></div>
      <button className="btn primary" onClick={add}>＋ Lançar</button>
    </div></div>
    {!lancs.length ? <div className="empty" style={{ padding: 24 }}>Nenhum lançamento em {mes.slice(5, 7)}/{mes.slice(0, 4)}.</div> :
      <div className="card" style={{ padding: 0, marginTop: 14 }}>
        <table className="ma-tab"><thead><tr><th>Funcionário</th><th>Tipo</th><th>Descrição</th><th className="n">Valor</th><th></th></tr></thead>
          <tbody>{lancs.map((l: Lanc) => { const t = TIPOS_LANC.find(x => x[0] === l.tipo); return <tr key={l.id}>
            <td><b>{nome(l.funcionario_id)}</b></td><td>{t?.[1] || l.tipo}</td><td>{l.descricao || "—"}</td>
            <td className="n" style={{ color: (t?.[2] ?? -1) < 0 ? "var(--danger)" : "var(--st-concluida)", fontWeight: 700 }}>{(t?.[2] ?? -1) < 0 ? "−" : "+"}{fmtMoeda(l.valor)}</td>
            <td><button className="btn sm" onClick={async () => { if (confirm("Apagar este lançamento?")) { await apagarLancRh(l.id); rec(); } }}>🗑</button></td>
          </tr>; })}</tbody></table>
      </div>}
  </>;
}

function FeriasTab({ funcs, ferias, rec, uid, toast }: any) {
  const h = hoje();
  const [fid, setFid] = useState(""); const [de, setDe] = useState(""); const [ate, setAte] = useState("");
  const addY = (s: string, n: number) => { const d = new Date(s + "T12:00:00Z"); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10); };
  const addM = (s: string, n: number) => { const d = new Date(s + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
  const linhas = funcs.filter((f: Funcionario) => f.status !== "desligado" && f.admissao).map((f: Funcionario) => {
    const adm = f.admissao as string;
    // último período aquisitivo COMPLETO (12 meses) até hoje
    let ini = adm; let fim = addY(adm, 1); let completos = 0;
    while (fim <= h) { completos++; ini = fim; fim = addY(ini, 1); }
    const aqDe = completos ? addY(adm, completos - 1) : adm, aqAte = completos ? addY(adm, completos) : addY(adm, 1);
    const limite = completos ? addM(aqAte, 11) : ""; // tirar antes disso para não vencer (dobra)
    const tiradas = (ferias as Ferias[]).filter(x => x.funcionario_id === f.id && x.de >= aqAte).reduce((s, x) => s + Math.round((+new Date(x.ate) - +new Date(x.de)) / 86400000) + 1, 0);
    const diasRestam = completos ? Math.max(0, 30 - tiradas) : 0;
    const diasPraVencer = limite ? Math.round((+new Date(limite) - +new Date(h)) / 86400000) : null;
    const bruta = f.salario ? f.salario + f.salario / 3 : null;
    const mesesAno = (() => { const ja = h.slice(0, 4) + "-01-01"; const ini2 = adm > ja ? adm : ja; return Math.max(0, Math.min(12, Math.floor((+new Date(h) - +new Date(ini2)) / (30.44 * 86400000)) + 1)); })();
    const dec = f.salario ? f.salario * mesesAno / 12 : null;
    return { f, completos, aqDe, aqAte, limite, diasRestam, diasPraVencer, bruta, dec, mesesAno, minhas: (ferias as Ferias[]).filter(x => x.funcionario_id === f.id) };
  }).sort((a: any, b: any) => (a.diasPraVencer ?? 9e9) - (b.diasPraVencer ?? 9e9));
  const add = async () => {
    if (!fid || !de || !ate || ate < de) { toast("Escolha o funcionário e o período"); return; }
    try { await criarFerias({ funcionario_id: fid, de, ate }, uid); setDe(""); setAte(""); rec(); toast("Férias registradas"); } catch (e: any) { toast(e.message); }
  };
  return <>
    <div className="card ma-topo"><div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
      <div className="field" style={{ flex: "1 1 200px" }}><label>Registrar férias de</label><select value={fid} onChange={e => setFid(e.target.value)}><option value="">—</option>{funcs.filter((f: Funcionario) => f.status !== "desligado").map((f: Funcionario) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>
      <div className="field"><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
      <div className="field"><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
      <button className="btn primary" onClick={add}>＋ Registrar</button>
    </div></div>
    {!linhas.length ? <div className="empty" style={{ padding: 24 }}>Preencha a data de admissão na ficha dos funcionários para o controle aparecer.</div> :
      <div className="card" style={{ padding: 0, marginTop: 14, overflowX: "auto" }}>
        <table className="ma-tab" style={{ minWidth: 980 }}>
          <thead><tr><th>Funcionário</th><th>Admissão</th><th>Período aquisitivo vencido</th><th className="n">Dias a tirar</th><th>Tirar até (senão dobra)</th><th className="n">Férias + ⅓ (bruto)</th><th className="n">13º proporcional {h.slice(0, 4)}</th><th>Férias registradas</th></tr></thead>
          <tbody>{linhas.map((x: any) => {
            const alerta = x.diasPraVencer != null && x.diasRestam > 0 && x.diasPraVencer <= 90;
            return <tr key={x.f.id} style={alerta ? { background: "rgba(214,60,60,.08)" } : undefined}>
              <td><b>{x.f.nome}</b>{x.f.salario == null ? <div className="hint">sem salário na ficha — valores não calculam</div> : null}</td>
              <td>{br(x.f.admissao)}</td>
              <td>{x.completos ? br(x.aqDe) + " a " + br(x.aqAte) : "ainda no 1º ano"}</td>
              <td className="n">{x.completos ? <b style={alerta ? { color: "var(--danger)" } : undefined}>{x.diasRestam}</b> : "—"}</td>
              <td>{x.completos && x.diasRestam > 0 ? <b style={alerta ? { color: "var(--danger)" } : undefined}>{br(x.limite)}{alerta ? " ⚠ " + x.diasPraVencer + " dias" : ""}</b> : "—"}</td>
              <td className="n">{x.bruta != null ? fmtMoeda(x.bruta) : "—"}</td>
              <td className="n">{x.dec != null ? fmtMoeda(x.dec) + " (" + x.mesesAno + "/12)" : "—"}</td>
              <td>{x.minhas.length ? x.minhas.map((v: Ferias) => <span key={v.id} className="pill" style={{ marginRight: 6 }}>{br(v.de)}–{br(v.ate)} <a style={{ cursor: "pointer" }} onClick={async () => { if (confirm("Apagar este registro de férias?")) { await apagarFerias(v.id); rec(); } }}>✕</a></span>) : "—"}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    <p className="hint" style={{ marginTop: 10 }}>Regra simplificada: a cada 12 meses de casa vencem 30 dias de férias, que precisam ser tiradas em até 11 meses (antes de dobrar). Faltas injustificadas em excesso podem reduzir o direito — confirme com o contador. 13º proporcional = salário × meses trabalhados no ano ÷ 12.</p>
  </>;
}
