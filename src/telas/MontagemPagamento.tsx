// Montagem — controle das montagens efetivadas e pagamento dos montadores (só a Gestão).
// Entra o relatório do Exact (Montador, os, status, Data Montagem, Data Finalizacao, Total Produtos, Total Adicionais, Total OS).
// "AGUARDANDO APROVAÇÃO DE PAGAMENTO" conta, mas fica como aguardando; "PAGAMENTO EFETUADO" = aprovado para pagamento.
// O relatório para o financeiro leva o total de cada montador com a conta cadastrada (Cadastros → Montadores → Contas).
// Não guardamos nome nem endereço do cliente: só o código da O.S.
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../estado";
import { sb } from "../lib/supabase";
import { MOCK } from "../lib/chat";
import { baixarXlsx } from "../lib/planilha";
import { fmtMoeda } from "../lib/regras";
import { col, lerArquivo } from "./Medidas";
import { Kpi } from "./Dashboard";
import { podeMontagemAgend } from "./MontagemAgend";

type Ef = { chave: string; os: string; montador: string; status: string; data_montagem: string; data_finalizacao: string | null; produtos: number; adicionais: number; total: number };

const iso = (s: string) => { const m = String(s || "").match(/(\d{2})[-\/](\d{2})[-\/](\d{4})/); return m ? m[3] + "-" + m[2] + "-" + m[1] : ""; };
const num = (s: string) => { const t = String(s || "0").trim(); const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "")); return isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const somaDias = (s: string, n: number) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const br = (s: string | null) => s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "";
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
const aprovado = (e: Ef) => /pagamento efetuado/i.test(e.status);
const aguardando = (e: Ef) => /aguardando aprova/i.test(e.status);
const conta = (e: Ef) => aprovado(e) || aguardando(e);

function converter(linhas: any[]): Ef[] {
  const m = new Map<string, Ef>();
  for (const l of linhas) {
    const osFull = col(l, "os", "O.S."); const mont = col(l, "Montador").trim();
    if (!osFull || !mont) continue;
    const os = osFull.split("|")[0].trim(); const dm = iso(col(l, "Data Montagem"));
    const chave = [os, mont, dm].join("¦");
    const e: Ef = { chave, os, montador: mont, status: col(l, "status", "Status").trim(), data_montagem: dm, data_finalizacao: iso(col(l, "Data Finalizacao", "Data Finalização")) || null,
      produtos: num(col(l, "Total Produtos")), adicionais: num(col(l, "Total Adicionais")), total: num(col(l, "Total OS")) };
    const ex = m.get(chave);
    if (ex) { ex.produtos = r2(ex.produtos + e.produtos); ex.adicionais = r2(ex.adicionais + e.adicionais); ex.total = r2(ex.total + e.total); } else m.set(chave, e);
  }
  return Array.from(m.values());
}

let mockEf: Ef[] = []; const mockVinc: Record<string, string | null> = {};
async function carregar(): Promise<{ ef: Ef[]; vinc: Record<string, string | null> }> {
  if (MOCK) return { ef: mockEf, vinc: { ...mockVinc } };
  const ef: Ef[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from("montagem_efet").select("chave,os,montador,status,data_montagem,data_finalizacao,produtos,adicionais,total").order("chave").range(i, i + 999);
    if (error) throw new Error(error.message);
    ef.push(...((data || []) as any[]).map(a => ({ ...a, produtos: Number(a.produtos) || 0, adicionais: Number(a.adicionais) || 0, total: Number(a.total) || 0 })));
    if (!data || data.length < 1000) break;
  }
  const { data: v } = await sb.from("montagem_vinculo").select("nome_exact,montador_id");
  return { ef, vinc: Object.fromEntries(((v || []) as any[]).map(x => [x.nome_exact, x.montador_id])) };
}
async function enviar(ef: Ef[]) {
  if (MOCK) { const k = new Set(mockEf.map(a => a.chave)); const n = ef.filter(a => !k.has(a.chave)).length; mockEf = [...mockEf.filter(a => !ef.some(b => b.chave === a.chave)), ...ef]; return { novos: n, atualizados: ef.length - n, total: mockEf.length }; }
  let r = { novos: 0, atualizados: 0, total: 0 };
  for (let i = 0; i < ef.length; i += 500) {
    const p = ef.slice(i, i + 500).map(a => ({ chave: a.chave, os: a.os, montador: a.montador, status: a.status, mont: a.data_montagem, fin: a.data_finalizacao || "", prod: a.produtos, adic: a.adicionais, total: a.total }));
    const { data, error } = await sb.rpc("montagem_efet_importar", { p });
    if (error) throw new Error(error.message);
    r = { novos: r.novos + (data as any).novos, atualizados: r.atualizados + (data as any).atualizados, total: (data as any).total };
  }
  return r;
}
async function vincular(nome: string, id: string | null) {
  if (MOCK) { mockVinc[nome] = id; return; }
  const { error } = await sb.rpc("montagem_vincular", { p_nome: nome, p_montador: id }); if (error) throw new Error(error.message);
}

type G = { nome: string; cad: any | null; n: number; prod: number; adic: number; total: number; aprov: number; aprovN: number; agu: number; aguN: number; itens: Ef[] };

export default function MontagemPagamento() {
  const { R, st, toast } = useApp() as any;
  const [dados, setDados] = useState<{ ef: Ef[]; vinc: Record<string, string | null> } | null>(null); const [erro, setErro] = useState("");
  const h = hoje();
  const [de, setDe] = useState(h.slice(0, 8) + "01"); const [ate, setAte] = useState(h);
  const [pelo, setPelo] = useState<"fin" | "mont">("fin");
  const [fs, setFs] = useState<"todos" | "aprov" | "agu">("todos");
  const [q, setQ] = useState(""); const [aberto, setAberto] = useState("");
  const [enviando, setEnviando] = useState(""); const inp = useRef<HTMLInputElement>(null);
  const recarregar = () => carregar().then(setDados).catch(e => setErro(e.message));
  useEffect(() => { recarregar(); }, []);

  const cadastro = (st.montadores || []).filter((m: any) => m.ativo !== false);
  const porNorm = useMemo(() => { const m: Record<string, any> = {}; cadastro.forEach((x: any) => { m[norm(x.nome)] = x; }); return m; }, [st.montadores]);
  const cadDe = (nome: string) => {
    const v = dados?.vinc[nome];
    if (v !== undefined) return v ? (st.montadores || []).find((m: any) => m.id === v) || null : null;
    return porNorm[norm(nome)] || null;
  };

  if (!podeMontagemAgend(R)) return <section className="view active"><div className="empty">Só a Gestão vê esta tela.</div></section>;

  const subir = async (f: File) => {
    setEnviando("Lendo " + f.name + "…");
    try {
      const ef = converter(await lerArquivo(f));
      if (!ef.length) { toast("Não encontrei montagens neste arquivo (precisa das colunas Montador, os, status, Data Montagem, Total OS)"); return; }
      setEnviando("Enviando " + ef.length + " montagens…");
      const r = await enviar(ef);
      toast(r.novos + " novas · " + r.atualizados + " atualizadas · " + r.total + " no total");
      const ds = ef.map(a => a.data_finalizacao || a.data_montagem).filter(Boolean).sort() as string[];
      if (ds.length) { setDe(ds[0]); setAte(ds[ds.length - 1]); }
      await recarregar();
    } catch (e: any) { toast(e.message || "Não foi possível enviar"); }
    finally { setEnviando(""); if (inp.current) inp.current.value = ""; }
  };

  const dataDe = (e: Ef) => (pelo === "fin" ? e.data_finalizacao || e.data_montagem : e.data_montagem) || "";
  const lista = (dados?.ef || []).filter(e => conta(e) && (fs === "todos" || (fs === "aprov" ? aprovado(e) : aguardando(e)))).filter(e => { const d = dataDe(e); return d >= de && d <= ate; });
  const outros = (dados?.ef || []).filter(e => !conta(e)).filter(e => { const d = dataDe(e); return d >= de && d <= ate; }).length;
  const grupos: G[] = Object.values(lista.reduce((m: Record<string, G>, e) => {
    const g = (m[e.montador] = m[e.montador] || { nome: e.montador, cad: cadDe(e.montador), n: 0, prod: 0, adic: 0, total: 0, aprov: 0, aprovN: 0, agu: 0, aguN: 0, itens: [] });
    g.n++; g.prod += e.produtos; g.adic += e.adicionais; g.total += e.total; g.itens.push(e);
    if (aprovado(e)) { g.aprov += e.total; g.aprovN++; } else { g.agu += e.total; g.aguN++; }
    return m;
  }, {})).sort((a, b) => b.total - a.total);
  const vis = grupos.filter(g => !q.trim() || norm(g.nome + " " + (g.cad?.nome || "")).includes(norm(q)));
  const soma = (f: (g: G) => number) => r2(grupos.reduce((s, g) => s + f(g), 0));
  const temConta = (g: G) => !!(g.cad && g.cad.conta && (g.cad.conta.conta || g.cad.conta.pixChave));
  const semConta = grupos.filter(g => !temConta(g));
  const periodo = (a: string, b: string) => { setDe(a); setAte(b); };
  const mesPassado = () => { const d = new Date(h.slice(0, 8) + "01T12:00:00Z"); d.setUTCDate(0); const fim = d.toISOString().slice(0, 10); periodo(fim.slice(0, 8) + "01", fim); };
  const per = br(de) + " a " + br(ate);
  const stTxt = fs === "aprov" ? "só aprovados para pagamento" : fs === "agu" ? "só aguardando aprovação" : "aprovados + aguardando aprovação";

  const relFinanceiro = () => {
    const cab = ["Montador", "Nome no Exact", "Titular da conta", "CPF/CNPJ", "Banco", "Agência", "Conta", "Tipo de conta", "PIX (tipo)", "PIX (chave)", "Montagens", "Total produtos", "Adicionais", "TOTAL A PAGAR", "Aprovado p/ pagamento", "Aguardando aprovação", "Período", "Obs."];
    const linhas = grupos.map(g => { const k = g.cad?.conta || {}; return [g.cad?.nome || g.nome, g.nome, k.titular || "", k.docTitular || "", k.banco || "", k.agencia || "", k.conta || "", k.tipoConta || "", k.pixTipo || "", k.pixChave || "", g.n, r2(g.prod), r2(g.adic), r2(g.total), r2(g.aprov), r2(g.agu), per, temConta(g) ? "" : "SEM CONTA CADASTRADA"]; });
    linhas.push(["TOTAL", "", "", "", "", "", "", "", "", "", soma(g => g.n), soma(g => g.prod), soma(g => g.adic), soma(g => g.total), soma(g => g.aprov), soma(g => g.agu), per, ""]);
    baixarXlsx("pagamento_montadores_" + de + "_a_" + ate + ".xlsx", cab, linhas, "Pagamento montadores");
  };
  const relDetalhado = () => {
    const cab = ["Montador", "O.S.", "Status", "Data montagem", "Data finalização", "Total produtos", "Adicionais", "Total O.S."];
    const linhas = grupos.flatMap(g => g.itens.slice().sort((a, b) => dataDe(a).localeCompare(dataDe(b))).map(e => [g.cad?.nome || g.nome, e.os, aprovado(e) ? "Aprovado p/ pagamento" : "Aguardando aprovação", br(e.data_montagem), br(e.data_finalizacao), e.produtos, e.adicionais, e.total]));
    baixarXlsx("montagens_detalhadas_" + de + "_a_" + ate + ".xlsx", cab, linhas, "Montagens");
  };

  return (
    <section className="view active">
      <div className="view-head"><div><h2>💰 Montagem · Pagamento dos montadores</h2><p>Montagens efetivadas do Exact por montador: total dos produtos, adicionais e total a pagar. “Aguardando aprovação de pagamento” conta, mas fica separado do “Pagamento efetuado” (aprovado). Gere o relatório com a conta de cada montador para o financeiro.</p></div></div>
      <div className="card ma-topo">
        <div className="ma-envio">
          <input ref={inp} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); }} />
          <button className="btn primary" disabled={!!enviando} onClick={() => inp.current?.click()}>{enviando || "📤 Enviar relatório de montagens efetivadas (CSV ou Excel)"}</button>
          <span className="hint">{dados ? dados.ef.length + " montagens guardadas. Pode enviar o mesmo período de novo: não duplica, só atualiza status e valores." : erro || "Carregando…"}</span>
        </div>
        <div className="ma-filtros">
          <div className="field"><label>De</label><input type="date" value={de} onChange={e => setDe(e.target.value)} /></div>
          <div className="field"><label>Até</label><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></div>
          <div className="field"><label>Pela data de</label><select value={pelo} onChange={e => setPelo(e.target.value as any)}><option value="fin">Finalização</option><option value="mont">Montagem</option></select></div>
          <div className="chips" style={{ margin: 0 }}>
            <button className="chip" onClick={() => periodo(h.slice(0, 8) + "01", h)}>Este mês</button>
            <button className="chip" onClick={mesPassado}>Mês passado</button>
            <button className="chip" onClick={() => periodo(somaDias(h, -6), h)}>Últimos 7 dias</button>
            <button className="chip" onClick={() => periodo(somaDias(h, -14), h)}>Últimos 15 dias</button>
            <button className="chip" onClick={() => { const ds = (dados?.ef || []).map(dataDe).filter(Boolean).sort(); if (ds.length) periodo(ds[0], ds[ds.length - 1]); }}>Tudo</button>
          </div>
        </div>
      </div>

      <div className="subnav" style={{ margin: "14px 0 10px" }}>
        {([["todos", "Aprovados + aguardando"], ["aprov", "✅ Aprovados p/ pagamento"], ["agu", "⏳ Aguardando aprovação"]] as [any, string][]).map(([k, l]) => <button key={k} className={fs === k ? "on" : ""} onClick={() => setFs(k)}>{l}</button>)}
      </div>

      <div className="kpis">
        <Kpi n={soma(g => g.n)} l={"Montagens efetivadas (" + stTxt + ")"} />
        <Kpi n={fmtMoeda(soma(g => g.prod))} l="Total dos produtos (serviço)" fs={20} />
        <Kpi n={fmtMoeda(soma(g => g.adic))} l="Adicionais" fs={20} />
        <Kpi n={fmtMoeda(soma(g => g.total))} l={"Total a pagar · " + grupos.length + " montadores"} fs={20} />
        <Kpi n={fmtMoeda(soma(g => g.aprov))} l={"✅ Aprovado p/ pagamento (" + soma(g => g.aprovN) + ")"} fs={20} />
        <Kpi n={fmtMoeda(soma(g => g.agu))} l={"⏳ Aguardando aprovação (" + soma(g => g.aguN) + ")"} fs={20} cls={soma(g => g.agu) ? "alert" : ""} />
      </div>
      {semConta.length > 0 && <div className="alerta" style={{ marginTop: 12 }}>⚠️ <b>{semConta.length} montador(es) sem conta cadastrada ou sem vínculo com o cadastro:</b> {semConta.map(g => g.nome).join(", ")}. Vincule na tabela abaixo ou cadastre em <b>Cadastros → Montadores → 🔒 Contas para pagamento</b>.</div>}
      {outros > 0 && <div className="hint" style={{ marginTop: 6 }}>{outros} O.S. no período com outro status (ex.: aguardando montagem, cancelado) não entram no pagamento.</div>}

      <div className="card" style={{ padding: 0, marginTop: 14, overflowX: "auto" }}>
        <div className="ma-cab">
          <b>Por montador · {per} · pela data de {pelo === "fin" ? "finalização" : "montagem"}</b>
          <input type="search" placeholder="🔎 Buscar montador" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 220 }} />
          <button className="btn primary sm" onClick={relFinanceiro} disabled={!grupos.length}>⬇ Relatório para o financeiro</button>
          <button className="btn sm" onClick={relDetalhado} disabled={!grupos.length}>⬇ Detalhado por O.S.</button>
        </div>
        {!vis.length ? <div className="empty" style={{ padding: 24 }}>{dados && dados.ef.length ? "Nenhuma montagem efetivada neste período." : "Envie o relatório do Exact para começar."}</div> :
          <table className="ma-tab"><thead><tr><th>Montador</th><th className="n">Montagens</th><th className="n">Produtos</th><th className="n">Adicionais</th><th className="n">Total a pagar</th><th className="n">✅ Aprovado</th><th className="n">⏳ Aguardando</th><th>Conta para pagamento</th></tr></thead>
            <tbody>{vis.map(g => <Linha key={g.nome} g={g} aberto={aberto === g.nome} abrir={() => setAberto(aberto === g.nome ? "" : g.nome)} cadastro={cadastro} temConta={temConta(g)}
              vincular={async (id: string | null) => { try { await vincular(g.nome, id); await recarregar(); toast("Vínculo salvo"); } catch (e: any) { toast(e.message); } }} dataDe={dataDe} />)}</tbody>
            <tfoot><tr><td>Total</td><td className="n">{soma(g => g.n)}</td><td className="n">{fmtMoeda(soma(g => g.prod))}</td><td className="n">{fmtMoeda(soma(g => g.adic))}</td><td className="n">{fmtMoeda(soma(g => g.total))}</td><td className="n">{fmtMoeda(soma(g => g.aprov))}</td><td className="n">{fmtMoeda(soma(g => g.agu))}</td><td></td></tr></tfoot>
          </table>}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>Total a pagar = total dos produtos + adicionais (o “Total OS” do Exact). Toque num montador para ver as O.S. A conta vem do cadastro de montadores; o nome do Exact (ex.: “enilson.rodrigues”) é ligado sozinho ao cadastro quando o nome bate — se não bater, escolha na coluna “Conta”.</p>
    </section>
  );
}

function Linha({ g, aberto, abrir, cadastro, temConta, vincular, dataDe }: any) {
  const k = g.cad?.conta;
  const [trocar, setTrocar] = useState(false);
  return <>
    <tr className={"ma-lin" + (aberto ? " on" : "")} onClick={abrir}>
      <td><b>{g.cad?.nome || g.nome}</b>{g.cad && g.cad.nome !== g.nome ? <small className="hint"> · Exact: {g.nome}</small> : null}</td>
      <td className="n">{g.n}</td><td className="n">{fmtMoeda(g.prod)}</td><td className="n">{fmtMoeda(g.adic)}</td>
      <td className="n"><b>{fmtMoeda(g.total)}</b></td>
      <td className="n">{g.aprovN ? fmtMoeda(g.aprov) : "—"}</td>
      <td className="n">{g.aguN ? fmtMoeda(g.agu) : "—"}</td>
      <td onClick={e => e.stopPropagation()} style={{ minWidth: 220 }}>
        {(!g.cad || trocar) ? <select defaultValue={g.cad?.id || ""} onChange={e => { vincular(e.target.value || null); setTrocar(false); }} style={{ fontSize: 12.5 }}>
          <option value="">{g.cad ? "— sem vínculo —" : "⚠️ Vincular ao cadastro…"}</option>
          {cadastro.map((m: any) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>
          : temConta ? <span className="ma-conta" title={[k.titular, k.docTitular].filter(Boolean).join(" · ")}>✔ {k.banco ? k.banco + " · ag " + (k.agencia || "—") + " · cc " + (k.conta || "—") : "PIX " + (k.pixChave || "")} <a href="#" onClick={e => { e.preventDefault(); setTrocar(true); }}>trocar</a></span>
          : <span style={{ color: "var(--warn)", fontWeight: 700, fontSize: 12.5 }}>⚠️ {g.cad.nome}: sem conta cadastrada <a href="#" onClick={e => { e.preventDefault(); setTrocar(true); }}>trocar</a></span>}
      </td>
    </tr>
    {aberto && <tr className="ma-dias"><td colSpan={8}>
      <table className="ma-os"><thead><tr><th>O.S.</th><th>Montagem</th><th>Finalização</th><th>Status</th><th className="n">Produtos</th><th className="n">Adicionais</th><th className="n">Total</th></tr></thead>
        <tbody>{g.itens.slice().sort((a: any, b: any) => dataDe(a).localeCompare(dataDe(b))).map((e: any) => <tr key={e.chave}><td>{e.os}</td><td>{br(e.data_montagem)}</td><td>{br(e.data_finalizacao)}</td>
          <td>{aprovado(e) ? <span className="vinda ok">✅ Aprovado</span> : <span className="vinda pend">⏳ Aguardando</span>}</td><td className="n">{fmtMoeda(e.produtos)}</td><td className="n">{e.adicionais ? fmtMoeda(e.adicionais) : "—"}</td><td className="n"><b>{fmtMoeda(e.total)}</b></td></tr>)}</tbody></table>
    </td></tr>}
  </>;
}
