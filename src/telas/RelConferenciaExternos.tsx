// 📋 Relatório para conferência — vendas dos consultores externos no ciclo de pagamento (dia 29 de um mês ao dia 28 do seguinte).
// Mesmo formato da planilha "VENDAS EXTERNOS" que a Gestão montava à mão: CLIENTE · VALOR · DATA · VENDA · CONSULTOR.
// Entra o que conta para o pagamento: nº pago efetivado + pagamento de promissória (pela data em que entrou).
// Promissória ainda não paga e venda aguardando a Gestão não entram (aparecem à parte, só para conferir).
import { useMemo, useState } from "react";
import { useApp } from "../estado";
import { baixarXlsxFormatado } from "../lib/planilha";
import { competenciaItem, fmtDate, fmtMoeda, hojeISO, itensVenda } from "../lib/regras";

/** ciclo que termina no dia 28 do mês "aaaa-mm" (começa no dia seguinte ao 28 do mês anterior) */
export function cicloDoMes(ym: string): [string, string] {
  const [y, m] = ym.split("-").map(Number);
  const fim = new Date(Date.UTC(y, m - 1, 28));
  const ini = new Date(Date.UTC(y, m - 2, 28)); ini.setUTCDate(ini.getUTCDate() + 1);
  return [ini.toISOString().slice(0, 10), fim.toISOString().slice(0, 10)];
}
/** mês (aaaa-mm) do último ciclo já FECHADO na data de hoje */
const ultimoFechado = (h: string) => { const [y, m, d] = h.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, 1)); if (d < 29) dt.setUTCMonth(dt.getUTCMonth() - 1); return dt.toISOString().slice(0, 7); };
const somaMes = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (ym: string) => MESES[Number(ym.slice(5, 7)) - 1] + "/" + ym.slice(0, 4);

type L = { cliente: string; valor: number; data: string; venda: string; consultor: string; alm: string };

export default function RelConferenciaExternos({ fechar }: { fechar: () => void }) {
  const { R, st } = useApp() as any;
  const h = hojeISO();
  const [mes, setMes] = useState(ultimoFechado(h));
  const [de, ate] = cicloDoMes(mes);
  const ehExterno = (id: string) => ((st.usuarios || []).find((u: any) => u.id === id)?.setores || []).includes("consultor_externo");
  const primeiro = (n: string) => String(n || "").trim().split(/\s+/)[0].toUpperCase();

  const { linhas, pend, prom } = useMemo(() => {
    const porNum = new Map<string, L>(); const pend: L[] = []; const prom: L[] = [];
    for (const c of st.chamados || []) {
      if (!c.venda || !c.consultorId || R.ehDireto(c) || !ehExterno(c.consultorId)) continue;
      const cons = primeiro(R.nomeUser(c.consultorId));
      const itens = itensVenda(c.venda);
      const pagos = new Set(itens.filter((i: any) => i.tipo === "pagamento" && i.status === "efetivada").map((i: any) => String(i.numero)));
      for (const i of itens) {
        if (i.status === "cancelada") continue;
        const data = competenciaItem(i.dataVenda, i.decididoEm, i.registradoEm);
        if (!data || data < de || data > ate) continue;
        const l: L = { cliente: c.cliente, valor: Number(i.valor) || 0, data, venda: String(i.numero || ""), consultor: cons, alm: c.id };
        if (i.status === "registrada") { pend.push(l); continue; }
        if (i.tipo === "promissoria") { if (!pagos.has(l.venda)) prom.push(l); continue; }
        // mesmo nº lançado em dois cadastros: conta uma vez (fica o cadastro mais novo)
        const ex = porNum.get(l.venda);
        if (!ex || ex.alm < l.alm) porNum.set(l.venda, l);
      }
    }
    const ord = (a: L, b: L) => a.consultor.localeCompare(b.consultor, "pt-BR") || a.data.localeCompare(b.data) || a.venda.localeCompare(b.venda);
    return { linhas: Array.from(porNum.values()).sort(ord), pend: pend.sort(ord), prom: prom.sort(ord) };
  }, [st.chamados, de, ate]);

  const porCons = useMemo(() => {
    const m = new Map<string, { n: number; v: number }>();
    for (const l of linhas) { const x = m.get(l.consultor) || { n: 0, v: 0 }; x.n++; x.v += l.valor; m.set(l.consultor, x); }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [linhas]);
  const total = linhas.reduce((s, l) => s + l.valor, 0);

  const gerar = () => baixarXlsxFormatado("VENDAS_EXTERNOS_" + de.slice(8, 10) + "-" + de.slice(5, 7) + "_a_" + ate.slice(8, 10) + "-" + ate.slice(5, 7) + "-" + ate.slice(0, 4) + ".xlsx", "VENDAS A CONFIRMAR",
    [{ titulo: "CLIENTE", largura: 58.57 }, { titulo: "VALOR", largura: 14.86, tipo: "moeda", alinhar: "left" }, { titulo: "DATA", largura: 12, tipo: "data", alinhar: "center" },
     { titulo: "VENDA", largura: 12, alinhar: "center" }, { titulo: "CONSULTOR", largura: 20.57, alinhar: "center" }],
    linhas.map(l => [l.cliente, l.valor, l.data, l.venda, l.consultor]));

  return (
    <div className="card" style={{ padding: 16, marginBottom: 14, borderLeft: "4px solid var(--primary)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><b style={{ fontSize: 16 }}>📋 Relatório para conferência · vendas dos externos</b>
          <div className="hint">Ciclo de pagamento: dia 29 de um mês ao dia 28 do seguinte. Mesmo formato da planilha de conferência (cliente, valor, data, venda, consultor).</div></div>
        <button className="btn sm" onClick={fechar}>✕ Fechar</button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "12px 0" }}>
        <button className="btn sm" onClick={() => setMes(somaMes(mes, -1))}>◀</button>
        <b>Ciclo de {nomeMes(mes)}: {fmtDate(de)} a {fmtDate(ate)}</b>
        <button className="btn sm" onClick={() => setMes(somaMes(mes, 1))}>▶</button>
        {mes !== ultimoFechado(h) && <button className="chip" onClick={() => setMes(ultimoFechado(h))}>Último ciclo fechado</button>}
        {ate >= h && <span className="pill" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>ciclo em andamento</span>}
        <button className="btn primary" style={{ marginLeft: "auto" }} disabled={!linhas.length} onClick={gerar}>⬇ Gerar planilha de conferência</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
        {porCons.map(([k, x]) => <div key={k} className="card" style={{ padding: "8px 10px" }}><b>{k}</b><div className="hint">{x.n} venda{x.n === 1 ? "" : "s"}</div><b>{fmtMoeda(x.v)}</b></div>)}
        <div className="card" style={{ padding: "8px 10px", background: "var(--fundo2, #f3f5fa)" }}><b>TOTAL</b><div className="hint">{linhas.length} vendas</div><b>{fmtMoeda(total)}</b></div>
      </div>
      {(pend.length > 0 || prom.length > 0) && <div style={{ marginTop: 12, fontSize: 13.5 }}>
        {pend.length > 0 && <p style={{ margin: "4px 0", color: "var(--warn)" }}>⏳ <b>{pend.length} venda(s) aguardando a Gestão</b> no ciclo ({fmtMoeda(pend.reduce((s, l) => s + l.valor, 0))}) — não entram até serem aprovadas: {pend.map(l => l.venda + " " + l.cliente.split(" ")[0] + " (" + l.consultor + ")").join(" · ")}</p>}
        {prom.length > 0 && <p style={{ margin: "4px 0" }}>🧾 <b>{prom.length} promissória(s) ainda não paga(s)</b> ({fmtMoeda(prom.reduce((s, l) => s + l.valor, 0))}) — entram no ciclo em que forem pagas: {prom.map(l => l.venda + " " + l.cliente.split(" ")[0] + " (" + l.consultor + ")").join(" · ")}</p>}
      </div>}
    </div>
  );
}
