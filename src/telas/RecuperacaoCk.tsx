// 💵 Financeiro do checklist: a comissão do projetista sobre a recuperação do projeto.
// Substitui a planilha que era preenchida à mão (uma aba por mês, uma linha por cliente) e o papelzinho
// que ia até o caixa. Duas visões:
//   · Ciclo — o "mês" deles, que fecha todo dia 25 (26 a 25), com as colunas da planilha e os totais
//   · Fechamento do dia — o que o projetista leva ao financeiro no fim do dia: cliente, venda e valores
// O financeiro (a Regina, do caixa) corrige o valor do projeto final e aprova pela própria tela.
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { ciclo, cicloDe, moverCiclo } from "../lib/cicloCk";
import { Calendario } from "./Checklist";
import { fmtDate, hojeISO } from "../lib/regras";

type Linha = {
  chamado: string; cliente: string; cpf?: string; venda?: string; vendaTatico?: string; data?: string; projetista: string;
  valorInicial: number | null; descontoPct: number | null; valorFinal: number | null;
  diferenca: number | null; recuperado: number | null; faixa: number | null; comissao: number | null;
  manual?: boolean; status: string; obs?: string; motivo?: string; informadoPor?: string; informadoEm?: string; decididoPor?: string; pagoEm?: string;
};

const brl = (v: any) => v == null ? "—" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: any) => v == null ? "—" : String(Math.round(Number(v) * 1000) / 10).replace(".", ",") + "%";
const doc = (x: any) => { const d = String(x || "").replace(/\D/g, ""); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d || "—"; };
const SIT: Record<string, [string, string]> = {
  pendente: ["⏳ Aguardando o financeiro", "var(--warn)"], aprovado: ["✅ Aprovado", "var(--st-concluida)"],
  recusado: ["❌ Recusado", "var(--danger)"], pago: ["💰 Pago", "var(--st-concluida)"],
};

export default function RecuperacaoCk() {
  const { toast } = useApp() as any;
  const [ym, setYm] = useState(cicloDe(hojeISO()));
  const [aba, setAba] = useState<"ciclo" | "dia">("ciclo");
  const [dia, setDia] = useState(hojeISO());
  const [d, setD] = useState<any>(null);
  const [quem, setQuem] = useState("");
  const [sit, setSit] = useState("");
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [editV, setEditV] = useState<Record<string, string>>({});   // nº da venda nova, corrigido pelo financeiro
  const [ocupado, setOcupado] = useState("");
  const c = ciclo(ym);
  const per = aba === "ciclo" ? { de: c.de, ate: c.ate } : { de: dia, ate: dia };

  const carregar = () => A.ckRecupLista(per.de, per.ate, quem || undefined).then(setD).catch((e: any) => { toast(e.message); setD({ linhas: [] }); });
  useEffect(() => { setD(null); carregar(); }, [per.de, per.ate, quem]);

  const todas: Linha[] = d?.linhas || [];
  const linhas: Linha[] = sit ? todas.filter(x => x.status === sit) : todas;
  const podeDecidir = !!d?.podeDecidir;
  const projetistas = useMemo(() => [...new Set(todas.map(l => l.projetista))].sort(), [todas]);
  const soma = (k: keyof Linha) => linhas.reduce((t, l) => t + (Number(l[k]) || 0), 0);
  const porPessoa = useMemo(() => {
    const m = new Map<string, { n: number; dif: number; rec: number; com: number; pend: number }>();
    for (const l of linhas) {
      const x = m.get(l.projetista) || { n: 0, dif: 0, rec: 0, com: 0, pend: 0 };
      x.n++; x.dif += Number(l.diferenca) || 0; x.rec += Number(l.recuperado) || 0;
      if (l.status !== "recusado") x.com += Number(l.comissao) || 0;
      if (l.status === "pendente") x.pend++;
      m.set(l.projetista, x);
    }
    return [...m.entries()].sort((a, b) => b[1].com - a[1].com);
  }, [linhas]);

  const decidir = async (l: Linha, status: string) => {
    const vf = edit[l.chamado];
    let motivo = "";
    if (status === "recusado") { motivo = prompt("Por que está recusando a comissão de " + l.cliente + "?") || ""; if (!motivo.trim()) return; }
    setOcupado(l.chamado);
    try { await A.ckRecupDecidir(l.chamado, status, { valorFinal: vf || undefined, vendaTatico: editV[l.chamado] || undefined, motivo });
      setEdit(e => { const n = { ...e }; delete n[l.chamado]; return n; });
      setEditV(e => { const n = { ...e }; delete n[l.chamado]; return n; });
      toast(status === "aprovado" ? "Comissão aprovada" : status === "pago" ? "Marcada como paga" : status === "recusado" ? "Comissão recusada" : "Voltou para análise");
      carregar(); }
    catch (e: any) { toast(e.message || "não deu"); } finally { setOcupado(""); }
  };

  const imprimir = () => {
    const w = window.open("", "_blank");
    if (!w) { toast("Libere as janelas (pop-up) do navegador para imprimir"); return; }
    const tit = aba === "ciclo" ? "Comissão por recuperação · ciclo " + c.nome + " (" + c.curto + ")" : "Fechamento do dia · " + fmtDate(dia);
    const sub = aba === "dia" ? "O que o checklist passa para o financeiro: aprovar a liberação da venda do cliente e o pagamento da comissão." : "";
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${tit}</title><style>
@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}
body{margin:0;font:9pt/1.3 Arial,Helvetica,sans-serif;color:#111}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:5px;margin-bottom:8px}
header b{font-size:13pt}header span{font-size:9pt;color:#444}
.sub{font-size:9pt;color:#444;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:8.4pt}th,td{border:1px solid #888;padding:3px 5px}
th{background:#f3f3f3;text-align:left;font-size:7.8pt}td.n{text-align:right;white-space:nowrap}
tfoot td{font-weight:700;background:#f3f3f3}
.ass{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:16mm;font-size:8.6pt;text-align:center}.ass div{border-top:1px solid #111;padding-top:3px}
</style></head><body>
<header><b>ALIANÇA MÓVEIS</b><span>${tit}</span></header>
${sub ? `<div class="sub">${sub}</div>` : ""}
<table><thead><tr><th>Data</th><th>Projetista</th><th>Cliente</th><th>CPF</th><th>Venda de origem</th><th>Venda nova</th><th>Cupom</th><th>Projeto final</th><th>Diferença</th><th>Desc.</th><th>Recuperado</th><th>%</th><th>Comissão</th><th>Situação</th></tr></thead>
<tbody>${linhas.map(l => `<tr><td>${l.data ? fmtDate(l.data) : "—"}</td><td>${l.projetista}</td><td>${l.cliente}</td><td>${doc(l.cpf)}</td><td>${l.venda || "—"}</td><td><b>${l.vendaTatico || "—"}</b></td>
<td class="n">${brl(l.valorInicial)}</td><td class="n">${brl(l.valorFinal)}</td><td class="n">${brl(l.diferenca)}</td><td class="n">${pct(l.descontoPct)}</td>
<td class="n">${brl(l.recuperado)}</td><td class="n">${l.faixa === 0 ? "—" : pct(l.faixa)}</td><td class="n">${brl(l.comissao)}</td><td>${(SIT[l.status] || [l.status])[0].replace(/^\S+\s/, "")}</td></tr>`).join("")}</tbody>
<tfoot><tr><td colspan="8">Total · ${linhas.length} cliente(s)</td><td class="n">${brl(soma("diferenca"))}</td><td></td><td class="n">${brl(soma("recuperado"))}</td><td></td><td class="n">${brl(linhas.filter(l => l.status !== "recusado").reduce((t, l) => t + (Number(l.comissao) || 0), 0))}</td><td></td></tr></tfoot></table>
<div class="ass"><div>Checklist${quem ? " · " + quem : ""}</div><div>Financeiro — conferido e aprovado</div></div>
</body></html>`);
    w.document.close(); setTimeout(() => w.print(), 400);
  };

  return (
    <section className="view active">
      <div className="view-head"><div><h2>💵 Financeiro do checklist</h2>
        <p>A comissão do projetista sobre a recuperação do projeto: o quanto o projeto final ficou abaixo do cupom. Faixas sobre o valor recuperado — até R$ 499,99 não paga, até R$ 2.999,99 paga 2%, de R$ 3.000 paga 5%.</p></div>
        <button className="btn ghost sm" onClick={carregar}>↻ Atualizar</button></div>

      <div className="card" style={{ padding: "10px 14px", marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div className="chips" style={{ margin: 0 }}>
          <button className={"chip" + (aba === "ciclo" ? " on" : "")} onClick={() => setAba("ciclo")}>Ciclo do mês</button>
          <button className={"chip" + (aba === "dia" ? " on" : "")} onClick={() => setAba("dia")}>Fechamento do dia</button>
        </div>
        {aba === "ciclo" ? <>
          <button className="btn sm" onClick={() => setYm(moverCiclo(ym, -1))}>‹</button>
          <b style={{ textTransform: "capitalize", minWidth: 150, textAlign: "center" }}>{c.nome}</b>
          <button className="btn sm" disabled={ym >= cicloDe(hojeISO())} onClick={() => setYm(moverCiclo(ym, 1))}>›</button>
          <span className="hint" style={{ margin: 0 }}>{c.curto}{ym === cicloDe(hojeISO()) ? " · ciclo atual, em aberto" : ""}</span>
        </> : <>
          <input type="date" value={dia} max={hojeISO()} onChange={e => e.target.value && setDia(e.target.value)} style={{ maxWidth: 160 }} />
          <button className="btn sm" onClick={() => setDia(hojeISO())}>Hoje</button>
        </>}
        {!d?.soMinhas && <select value={quem} onChange={e => setQuem(e.target.value)} style={{ maxWidth: 200, marginLeft: "auto" }} title="Filtrar por projetista">
          <option value="">Todos os projetistas</option>{projetistas.map(p => <option key={p} value={p}>{p}</option>)}</select>}
        <select value={sit} onChange={e => setSit(e.target.value)} style={{ maxWidth: 190 }} title="Filtrar pela situação">
          <option value="">Todas as situações</option><option value="pendente">⏳ Aguardando o financeiro</option>
          <option value="aprovado">✅ Aprovadas</option><option value="pago">💰 Pagas</option><option value="recusado">❌ Recusadas</option></select>
        <button className="btn primary sm" disabled={!linhas.length} onClick={imprimir}>🖨 Imprimir</button>
      </div>

      {d === null ? <div className="hint">Carregando…</div> : !linhas.length ? <div className="cp-card hint">
        {aba === "ciclo" ? "Nenhuma recuperação informada neste ciclo." : "Nenhuma recuperação informada neste dia."}
        {" "}A recuperação é informada na etapa 5 do checklist, ao finalizar o atendimento.</div> : <>
        <div className="kpis" style={{ marginBottom: 12 }}>
          <div className="kpi"><div className="n">{linhas.length}</div><div className="l">Cliente(s) com recuperação</div></div>
          <div className="kpi"><div className="n din"><small>R$</small>{soma("diferenca").toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div><div className="l">Diferença bruta (tabela)</div></div>
          <div className="kpi"><div className="n din"><small>R$</small>{soma("recuperado").toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div><div className="l">Total recuperado pela loja</div></div>
          <div className="kpi"><div className="n din" style={{ color: "var(--st-concluida)" }}><small>R$</small>{linhas.filter(l => l.status !== "recusado").reduce((t, l) => t + (Number(l.comissao) || 0), 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div><div className="l">Comissão (sem as recusadas)</div></div>
          <div className="kpi"><div className="n">{linhas.filter(l => l.status === "pendente").length}</div><div className="l">Aguardando o financeiro</div></div>
        </div>

        {porPessoa.length > 1 && <><div className="sec-label">Por projetista</div>
          <div className="card" style={{ padding: "8px 14px", marginBottom: 12, overflowX: "auto" }}>
            <table className="ng-tab"><thead><tr><th>Projetista</th><th>Clientes</th><th>Diferença</th><th>Recuperado</th><th>Comissão</th><th>Pendentes</th></tr></thead>
              <tbody>{porPessoa.map(([n, x]) => <tr key={n}><td><b>{n}</b></td><td>{x.n}</td><td>{brl(x.dif)}</td><td>{brl(x.rec)}</td>
                <td><b style={{ color: "var(--st-concluida)" }}>{brl(x.com)}</b></td><td>{x.pend || "—"}</td></tr>)}</tbody></table></div></>}

        <div className="sec-label">{aba === "ciclo" ? "Clientes do ciclo" : "Clientes do dia"}</div>
        <div className="card" style={{ padding: "8px 14px", overflowX: "auto" }}>
          <table className="ng-tab">
            <thead><tr><th>Data</th><th>Cliente</th><th>Venda de origem</th><th>Venda nova (Tático)</th><th>Cupom</th><th>Projeto final</th><th>Diferença</th><th>Desc.</th><th>Recuperado</th><th>%</th><th>Comissão</th><th>Situação</th>{podeDecidir && <th></th>}</tr></thead>
            <tbody>{linhas.map(l => { const sit = SIT[l.status] || [l.status, "var(--line)"];
              return <tr key={l.chamado}>
                <td>{l.data ? fmtDate(l.data) : "—"}</td>
                <td><b>{l.cliente}</b>{!d?.soMinhas && <small style={{ display: "block", opacity: .7 }}>{l.projetista}</small>}
                  {/* o ticket do Exact não trouxe os valores: o projetista leu no Tático e digitou — confira antes de aprovar */}
                  {l.manual && <small style={{ display: "block", color: "var(--warn)", fontWeight: 700 }}>✍️ cupom e desconto informados à mão</small>}
                  {l.obs && <small style={{ display: "block", opacity: .7 }}>{l.obs}</small>}</td>
                <td>{l.venda || "—"}</td>
                <td>{podeDecidir && l.status !== "pago"
                  ? <input inputMode="numeric" style={{ width: 100, fontSize: 12.5 }} placeholder="nº da venda"
                      value={editV[l.chamado] ?? (l.vendaTatico || "")} onChange={e => setEditV(x => ({ ...x, [l.chamado]: e.target.value }))} />
                  : l.vendaTatico ? <b>{l.vendaTatico}</b> : <span style={{ color: "var(--warn)", fontWeight: 700, fontSize: 12 }}>falta tirar</span>}</td>
                <td>{brl(l.valorInicial)}</td>
                <td>{podeDecidir && l.status !== "pago" ? <input inputMode="decimal" style={{ width: 110, fontSize: 12.5 }}
                  value={edit[l.chamado] ?? (l.valorFinal == null ? "" : String(l.valorFinal).replace(".", ","))}
                  onChange={e => setEdit(x => ({ ...x, [l.chamado]: e.target.value }))} /> : brl(l.valorFinal)}</td>
                <td>{brl(l.diferenca)}</td>
                <td>{pct(l.descontoPct)}</td>
                <td><b>{brl(l.recuperado)}</b></td>
                <td>{l.faixa === 0 ? <span className="hint" style={{ margin: 0 }}>não paga</span> : pct(l.faixa)}</td>
                <td><b style={{ color: "var(--st-concluida)" }}>{brl(l.comissao)}</b></td>
                <td><span style={{ color: sit[1], fontWeight: 700, fontSize: 12 }}>{sit[0]}</span>
                  {l.motivo && <small style={{ display: "block", opacity: .8 }}>{l.motivo}</small>}
                  {l.decididoPor && <small style={{ display: "block", opacity: .7 }}>{l.decididoPor}</small>}</td>
                {podeDecidir && <td style={{ whiteSpace: "nowrap" }}>
                  {l.status === "pendente" && <><button className="btn sm" disabled={ocupado === l.chamado} onClick={() => decidir(l, "aprovado")}>✓ Aprovar</button>{" "}
                    <button className="btn ghost sm" disabled={ocupado === l.chamado} onClick={() => decidir(l, "recusado")}>✕</button></>}
                  {l.status === "aprovado" && <button className="btn sm" disabled={ocupado === l.chamado} onClick={() => decidir(l, "pago")}>💰 Pago</button>}
                  {["recusado", "pago"].includes(l.status) && <button className="btn ghost sm" disabled={ocupado === l.chamado} onClick={() => decidir(l, "pendente")}>↩ Reabrir</button>}
                </td>}
              </tr>; })}</tbody>
          </table>
        </div>
        {podeDecidir && <div className="hint" style={{ marginTop: 8 }}>Dá para corrigir o valor do projeto final na própria linha antes de aprovar — a diferença, o recuperado e a comissão se refazem no servidor.</div>}
      </>}
    </section>
  );
}

/** 🧾 Validações do dia — a folha que o projetista leva à Regina, no caixa.
 *  A venda do checklist NÃO existe até o projetista tirá-la no Tático: ele lança lá, pega o número novo
 *  e é esse número que o financeiro valida. Por isso a coluna do Tático é a primeira coisa da folha. */
export function ValidacoesDoDia() {
  const { toast, R } = useApp() as any;
  const [dia, setDia] = useState(hojeISO());
  const [d, setD] = useState<any>(null);
  const carregar = () => { setD(null); A.ckRecupLista(dia, dia).then(setD).catch((e: any) => { toast(e.message); setD({ linhas: [] }); }); };
  useEffect(carregar, [dia]);
  const l: Linha[] = d?.linhas || [];
  const semTatico = l.filter(x => !x.vendaTatico);
  const soma = (k: keyof Linha) => l.reduce((t, x) => t + (Number(x[k]) || 0), 0);
  const imprimir = () => {
    const w = window.open("", "_blank");
    if (!w) { toast("Libere as janelas (pop-up) do navegador para imprimir"); return; }
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Validações ${fmtDate(dia)}</title><style>
@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;font:9pt/1.3 Arial,Helvetica,sans-serif;color:#111}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:5px;margin-bottom:6px}header b{font-size:13pt}header span{font-size:9pt;color:#444}
.sub{font-size:8.6pt;color:#444;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:8.6pt}th,td{border:1px solid #888;padding:4px 5px}th{background:#f3f3f3;text-align:left;font-size:7.8pt}
td.n{text-align:right;white-space:nowrap}td.ok{width:22mm}tfoot td{font-weight:700;background:#f3f3f3}
.tat{font-weight:700;font-size:10pt}
.ass{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:16mm;font-size:8.6pt;text-align:center}.ass div{border-top:1px solid #111;padding-top:3px}
</style></head><body>
<header><b>ALIANÇA MÓVEIS</b><span>Validações do dia · checklist · ${fmtDate(dia)}</span></header>
<div class="sub">Duas conferências nesta folha: <b>validar a venda tirada no Tático</b> de cada cliente e <b>aprovar a comissão de recuperação</b> do projetista.</div>
<table><thead><tr><th>Venda no Tático</th><th>Cliente</th><th>CPF</th><th>Venda de origem</th><th>Projetista</th><th>Cupom</th><th>Projeto final</th><th>Recuperado</th><th>Comissão</th><th class="ok">Venda validada</th><th class="ok">Comissão ok</th></tr></thead>
<tbody>${l.map(x => `<tr><td class="tat">${x.vendaTatico || "—"}</td><td>${x.cliente}${x.manual ? " <b>(valores à mão)</b>" : ""}</td><td>${String(x.cpf || "").replace(/\D/g, "") || "—"}</td><td>${x.venda || "—"}</td><td>${x.projetista}</td>
<td class="n">${brl(x.valorInicial)}</td><td class="n">${brl(x.valorFinal)}</td><td class="n">${brl(x.recuperado)}</td><td class="n">${brl(x.comissao)}</td><td></td><td></td></tr>`).join("")}</tbody>
<tfoot><tr><td colspan="7">Total · ${l.length} cliente(s)</td><td class="n">${brl(soma("recuperado"))}</td><td class="n">${brl(soma("comissao"))}</td><td></td><td></td></tr></tfoot></table>
<div class="ass"><div>Checklist — entregue por</div><div>Financeiro — conferido e validado</div></div>
</body></html>`);
    w.document.close(); setTimeout(() => w.print(), 400);
  };
  return (
    <section className="view active">
      <div className="view-head"><div><h2>🧾 Validações do dia</h2>
        <p>O que você leva ao financeiro no fim do dia: a venda que você tirou no Tático para cada cliente, para a Regina validar, e a comissão da recuperação para ela aprovar.</p></div>
        <button className="btn ghost sm" onClick={carregar}>↻ Atualizar</button></div>

      <div className="card" style={{ padding: "10px 14px", marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input type="date" value={dia} max={hojeISO()} onChange={e => e.target.value && setDia(e.target.value)} style={{ maxWidth: 160 }} />
        <button className="btn sm" onClick={() => setDia(hojeISO())}>Hoje</button>
        <button className="btn primary sm" disabled={!l.length} onClick={imprimir} style={{ marginLeft: "auto" }}>🖨 Imprimir para o financeiro</button>
      </div>

      {d === null ? <div className="hint">Carregando…</div> : !l.length
        ? <div className="cp-card hint">Nenhum checklist com recuperação informada neste dia. A recuperação é informada na etapa 5, ao finalizar o atendimento.</div>
        : <>
          {semTatico.length > 0 && <div className="cp-card" style={{ borderColor: "var(--warn)", marginBottom: 10 }}>
            ⚠️ <b>{semTatico.length} cliente(s) sem o nº da venda no Tático:</b> {semTatico.map(x => x.cliente).join(", ")}.
            Tire a venda no Tático e informe o número na etapa 5 — sem ele o financeiro não tem o que validar.</div>}
          <div className="kpis" style={{ marginBottom: 12 }}>
            <div className="kpi"><div className="n">{l.length}</div><div className="l">Cliente(s) do dia</div></div>
            <div className="kpi"><div className="n">{l.filter(x => x.vendaTatico).length}</div><div className="l">Com venda tirada no Tático</div></div>
            <div className="kpi"><div className="n din"><small>R$</small>{soma("recuperado").toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div><div className="l">Recuperado no dia</div></div>
            <div className="kpi"><div className="n din" style={{ color: "var(--st-concluida)" }}><small>R$</small>{soma("comissao").toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div><div className="l">Comissão do dia</div></div>
          </div>
          <div className="card" style={{ padding: "8px 14px", overflowX: "auto" }}>
            <table className="ng-tab">
              <thead><tr><th>Venda no Tático</th><th>Cliente</th><th>Venda de origem</th>{!d?.soMinhas && <th>Projetista</th>}<th>Cupom</th><th>Projeto final</th><th>Recuperado</th><th>Comissão</th><th>Situação</th></tr></thead>
              <tbody>{l.map(x => { const sit = SIT[x.status] || [x.status, "var(--line)"];
                return <tr key={x.chamado}>
                  <td>{x.vendaTatico ? <b style={{ fontSize: 15 }}>{x.vendaTatico}</b> : <span style={{ color: "var(--warn)", fontWeight: 700 }}>falta tirar</span>}</td>
                  <td><b>{x.cliente}</b></td><td>{x.venda || "—"}</td>
                  {!d?.soMinhas && <td>{x.projetista}</td>}
                  <td>{brl(x.valorInicial)}</td><td>{brl(x.valorFinal)}</td><td><b>{brl(x.recuperado)}</b></td>
                  <td><b style={{ color: "var(--st-concluida)" }}>{brl(x.comissao)}</b></td>
                  <td><span style={{ color: sit[1], fontWeight: 700, fontSize: 12 }}>{sit[0]}</span></td>
                </tr>; })}</tbody>
            </table>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>A folha impressa leva duas colunas em branco para a Regina marcar: venda validada e comissão aprovada.{R.ehGestao && R.ehGestao() ? "" : ""}</div>
        </>}
    </section>
  );
}


/** 📅 Agenda geral para o projetista: a mesma agenda do setor Checklist, só que sem poder mexer.
 *  Ele não lê os chamados de checklist direto (a permissão é do setor Checklist), então a lista vem
 *  pronta do servidor e é remontada no formato que o calendário espera. */
export function AgendaGeralProjetista() {
  const { toast } = useApp() as any;
  const [ch, setCh] = useState<any[] | null>(null);
  useEffect(() => {
    const d = new Date(); const de = new Date(d); de.setDate(de.getDate() - 45); const ate = new Date(d); ate.setDate(ate.getDate() + 90);
    const iso = (x: Date) => x.toISOString().slice(0, 10);
    A.ckProjetistaAgenda("*", iso(de), iso(ate))
      .then(l => setCh((l || []).map((c: any) => ({
        id: c.id, tipo: "checklist", cliente: c.cliente, pedido: c.pedido, telefone: c.telefone, status: c.status,
        tratativa: { checklist: {
          etapa: c.etapa, agendadoPara: c.agendadoPara, duracaoMin: c.duracaoMin, projetista: c.projetista,
          diasExtras: Array.isArray(c.diasExtras) ? c.diasExtras : [], confirmacao: c.confirmacao, proposta: c.proposta,
          propostaDiasExtras: c.propostaDiasExtras, propostaProjetista: c.propostaProjetista, local: c.local,
          ambiente: c.ambiente, encaixe: c.encaixe, realizadoEm: c.realizadoEm, termo: c.termo,
        } },
      }))))
      .catch((e: any) => { toast(e.message); setCh([]); });
  }, []);
  return (
    <section className="view active">
      <div className="view-head"><div><h2>📅 Agenda geral do checklist</h2>
        <p>A agenda de todos os projetistas, no mesmo formato do setor Checklist: escolha o dia e veja quem está com quem. Aqui é só visualização — quem altera a agenda é o setor Checklist.</p></div></div>
      {ch === null ? <div className="hint">Carregando a agenda…</div> : <Calendario soLeitura fonte={ch} />}
    </section>
  );
}
