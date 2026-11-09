// Financeiro (Salete, Patrícia): só o que foi FECHADO e ENVIADO para pagamento — montagem e fretes.
// Escolhe o pagamento, vê quem recebe, a conta e o valor, e baixa o arquivo.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { sb } from "../lib/supabase";
import { MOCK } from "../lib/chat";
import { Historico } from "./MontagemPagamento";
import { pdfFretes, type LinhaFrete } from "./FretesFechamento";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const nomeMes = (m: string) => MESES[+m.slice(5, 7) - 1] + " " + m.slice(0, 4);
const moeda = (n: number) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (s?: string | null) => s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "";

export default function FinPagamentos() {
  const [aba, setAba] = useState<"mont" | "frete">("mont");
  const { irPara } = useApp() as any;
  return <section className="view active">
    <div className="view-head"><div><h2>💰 Pagamentos</h2><p>Só o que foi fechado e enviado para o financeiro. Escolha o pagamento, confira quem recebe, a conta e o valor, e baixe o arquivo.</p></div></div>
    <div className="subnav" style={{ margin: "0 0 14px" }}>
      <button className={aba === "mont" ? "on" : ""} onClick={() => setAba("mont")}>🔧 Montagem</button>
      <button className={aba === "frete" ? "on" : ""} onClick={() => setAba("frete")}>🚚 Fretes</button>
      <button onClick={() => irPara?.("montagem_agend")}>📅 Agendadoras da montagem</button>
    </div>
    {aba === "mont" ? <Historico soEnviados /> : <Fretes />}
  </section>;
}

function Fretes() {
  const [l, setL] = useState<any[] | null>(null); const [erro, setErro] = useState(""); const [ab, setAb] = useState<number | null>(null);
  useEffect(() => { if (MOCK) { setL([]); return; }
    sb.from("frete_envios_fin").select("*").eq("ativo", true).order("mes", { ascending: false }).then(({ data, error }) => error ? setErro(error.message) : setL(data || [])); }, []);
  if (erro) return <div className="empty">{erro}</div>;
  if (!l) return <div className="empty">Carregando…</div>;
  if (!l.length) return <div className="empty" style={{ padding: 24 }}>Nenhum pagamento de frete enviado para o financeiro ainda.</div>;
  const f = l.find(x => x.id === ab); const linhas: LinhaFrete[] = (f?.linhas || []) as LinhaFrete[];
  return <>
    <div className="card" style={{ padding: 0, overflowX: "auto" }}>
      <table className="ma-tab"><thead><tr><th>Fretes do mês</th><th>Pagamento</th><th className="n">Freteiros</th><th className="n">Total a pagar</th><th>Enviado</th><th></th></tr></thead>
        <tbody>{l.map(x => <tr key={x.id} className={"ma-lin" + (ab === x.id ? " on" : "")} onClick={() => setAb(ab === x.id ? null : x.id)}>
          <td><b>{nomeMes(x.mes)}</b></td><td>{br(x.data_pagamento) || "—"}</td><td className="n">{x.n_freteiros ?? "—"}</td><td className="n"><b>{x.total != null ? moeda(Number(x.total)) : "em preparação"}</b></td>
          <td><small>{new Date(x.enviado_em).toLocaleDateString("pt-BR")}{x.enviado_por ? " · " + x.enviado_por : ""}</small></td><td className="g">ver ›</td></tr>)}</tbody></table>
    </div>
    {f && <div className="card" style={{ padding: 0, marginTop: 14, overflowX: "auto" }}>
      <div className="ma-cab"><b>Fretes de {nomeMes(f.mes).toLowerCase()} · pagamento em {br(f.data_pagamento) || "—"}</b>
        <button className="btn primary sm" disabled={!linhas.length} onClick={() => pdfFretes(f.mes, f.data_pagamento || "", linhas).catch(e => alert("Não foi possível gerar o PDF: " + e.message))}>⬇ Baixar PDF para pagamento</button></div>
      {!linhas.length ? <div className="empty">O relatório deste mês ainda está sendo preparado pela gestão.</div> :
        <table className="ma-tab"><thead><tr><th>Freteiro</th><th>Favorecido · agência / conta</th><th className="n">Valor total</th><th className="n">Descontos</th><th className="n">A pagar</th></tr></thead>
          <tbody>{linhas.map((x, i) => <tr key={i}><td><b>{x.apelido}</b></td><td><small>{x.favorecido || x.conta ? `${x.favorecido} · Ag. ${x.agencia || "—"} / Conta ${x.conta || "—"}` : <span style={{ color: "var(--warn)" }}>sem conta cadastrada</span>}</small></td>
            <td className="n">{moeda(x.total)}</td><td className="n">{x.tDesc ? moeda(x.tDesc) : "—"}</td><td className="n"><b>{moeda(x.pagar)}</b></td></tr>)}
            <tr style={{ fontWeight: 700 }}><td>Total</td><td></td><td className="n">{moeda(linhas.reduce((s, x) => s + x.total, 0))}</td><td className="n">{moeda(linhas.reduce((s, x) => s + x.tDesc, 0))}</td><td className="n">{moeda(linhas.reduce((s, x) => s + x.pagar, 0))}</td></tr></tbody></table>}
    </div>}
  </>;
}
