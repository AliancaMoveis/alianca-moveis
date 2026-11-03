// Fechamento do ciclo (29 a 28) de consultores externos e medidores.
// A Gestão gera o fechamento do ciclo → fica gravado (foto do momento) → cada um vê o seu relatório
// (clientes, valores, visitas, comissão…) e a Gestão baixa um Excel único, um consultor embaixo do outro, para o Financeiro.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { sb } from "../lib/supabase";
import { MOCK } from "../lib/chat";
import { fmtDate, fmtMoeda } from "../lib/regras";
import { cicloDe, cicloDoMes } from "../lib/ciclo";
import { baixarXlsxGrade, type CelGrade } from "../lib/planilha";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const mesPt = (iso: string) => { const [y, m] = String(iso).split("-").map(Number); return MESES[(m || 1) - 1] + "/" + y; };
const nomeCicloGrande = (ym: string) => (MESES[Number(ym.slice(5, 7)) - 1] + " " + ym.slice(0, 4)).toUpperCase();

export type Linha = { cliente: string; valor: number; data: string; venda: string };
export type Fech = {
  uid: string; nome: string; ciclo: string; de: string; ate: string; linhas: Linha[];
  qtdVisitas: number; valorVisita: number; totalVisitas: number; qtdMedidas: number; totalMedidas: number;
  totalVendas: number; comissaoPct: number; comissao: number; auxilio: number; reembolso: number; total: number; oficial: boolean;
};

/** o período é exatamente um ciclo (29 → 28)? devolve o aaaa-mm */
export function cicloExato(de: string, ate: string): string | null {
  if (!de || !ate) return null; const ym = cicloDe(ate); const [a, b] = cicloDoMes(ym);
  return a === de && b === ate ? ym : null;
}

/** foto do fechamento de uma pessoa no ciclo (mesma conta do Financeiro) */
export function montarFech(R: any, uid: string, ym: string): Fech {
  const [de, ate] = cicloDoMes(ym);
  const e = R.extratoConsultor(uid, de, ate); const cfg = R.cfg();
  const linhas: Linha[] = e.pagamentos.map((p: any) => ({ cliente: String(p.c?.cliente || "").trim(), valor: Number(p.valor) || 0, data: String(p.data || "").slice(0, 10), venda: String(p.numero || "") }))
    .sort((a: Linha, b: Linha) => a.data.localeCompare(b.data) || a.venda.localeCompare(b.venda));
  return {
    uid, nome: R.nomeUser(uid), ciclo: ym, de, ate, linhas,
    qtdVisitas: e.qtdVisitas, valorVisita: Number(cfg.pagamentoVisita) || 0, totalVisitas: e.pagamentoVisitas, qtdMedidas: e.qtdMedidas, totalMedidas: e.pagamentoMedidas,
    totalVendas: e.totalVendido, comissaoPct: Number(cfg.comissaoPct) || 0, comissao: e.comissao, auxilio: e.auxilio, reembolso: e.totalReembolsos, total: e.total, oficial: !!e.oficial,
  };
}

/** linhas do quadro de resumo (lado direito do relatório) */
function resumo(f: Fech): [string, number, "num" | "moeda", boolean?][] {
  const l: [string, number, "num" | "moeda", boolean?][] = [];
  if (f.qtdVisitas || !f.qtdMedidas) l.push(["TOTAL VISITAS", f.qtdVisitas, "num"], ["TOTAL EM VISITAS", f.totalVisitas, "moeda"]);
  if (f.qtdMedidas) l.push(["TOTAL MEDIDAS", f.qtdMedidas, "num"], ["TOTAL EM MEDIDAS", f.totalMedidas, "moeda"]);
  l.push(["TOTAL VENDAS", f.totalVendas, "moeda"], ["AJUDA DE CUSTO FIXA", f.auxilio, "moeda"], ["COMISSÃO VENDAS", f.comissao, "moeda"], ["REEMBOLSO", f.reembolso, "moeda"], ["TOTAL A SER PAGO NO MÊS", f.total, "moeda", true]);
  return l;
}

/** Excel: um bloco por pessoa, um embaixo do outro (layout do relatório do Financeiro) */
export async function excelFechamento(lista: Fech[], nomeArq: string) {
  const cels: CelGrade[] = []; const mesclas: string[] = []; let r = 1;
  const B = true;
  lista.forEach(f => {
    cels.push({ r, c: 0, v: f.nome.toUpperCase(), grande: true, alinhar: "center" }); mesclas.push(`A${r}:G${r}`); r++;
    cels.push({ r, c: 0, v: nomeCicloGrande(f.ciclo) + "  ·  ciclo " + fmtDate(f.de) + " a " + fmtDate(f.ate), negrito: true, alinhar: "center" }); mesclas.push(`A${r}:G${r}`); r++;
    const r0 = r;
    ["CLIENTE", "VALOR", "DATA", "VENDA"].forEach((t, c) => cels.push({ r, c, v: t, negrito: true, borda: B, alinhar: c ? "center" : "left" }));
    f.linhas.forEach((l, i) => {
      const rr = r0 + 1 + i;
      cels.push({ r: rr, c: 0, v: l.cliente, borda: B }, { r: rr, c: 1, v: l.valor, tipo: "moeda", borda: B }, { r: rr, c: 2, v: l.data, tipo: "data", borda: B, alinhar: "center" }, { r: rr, c: 3, v: l.venda, borda: B, alinhar: "center" });
    });
    if (!f.linhas.length) cels.push({ r: r0 + 1, c: 0, v: "Sem vendas no ciclo", borda: B });
    resumo(f).forEach(([t, v, tipo, neg], i) => cels.push({ r: r0 + i, c: 5, v: t, negrito: true, borda: B }, { r: r0 + i, c: 6, v, tipo, negrito: !!neg, borda: B, alinhar: "right" }));
    r = r0 + Math.max(f.linhas.length + 1, resumo(f).length, 2) + 2;
  });
  if (lista.length > 1) {
    cels.push({ r, c: 0, v: "RESUMO DO FECHAMENTO", grande: true }); r++;
    ["NOME", "VISITAS/MEDIDAS", "COMISSÃO", "AJUDA DE CUSTO", "REEMBOLSO", "", "TOTAL A PAGAR"].forEach((t, c) => t && cels.push({ r, c, v: t, negrito: true, borda: B }));
    r++;
    lista.forEach(f => { cels.push({ r, c: 0, v: f.nome, borda: B }, { r, c: 1, v: f.totalVisitas + f.totalMedidas, tipo: "moeda", borda: B }, { r, c: 2, v: f.comissao, tipo: "moeda", borda: B },
      { r, c: 3, v: f.auxilio, tipo: "moeda", borda: B }, { r, c: 4, v: f.reembolso, tipo: "moeda", borda: B }, { r, c: 6, v: f.total, tipo: "moeda", borda: B, negrito: true }); r++; });
    const s = (k: keyof Fech) => lista.reduce((x, f) => x + (Number(f[k]) || 0), 0);
    cels.push({ r, c: 0, v: "TOTAL GERAL", negrito: true, borda: B }, { r, c: 1, v: s("totalVisitas") + s("totalMedidas"), tipo: "moeda", negrito: true, borda: B }, { r, c: 2, v: s("comissao"), tipo: "moeda", negrito: true, borda: B },
      { r, c: 3, v: s("auxilio"), tipo: "moeda", negrito: true, borda: B }, { r, c: 4, v: s("reembolso"), tipo: "moeda", negrito: true, borda: B }, { r, c: 6, v: s("total"), tipo: "moeda", negrito: true, borda: B });
  }
  await baixarXlsxGrade(nomeArq, "Fechamento", [42, 16, 13, 12, 3, 28, 18], cels, mesclas);
}

/** o relatório na tela (igual ao do Financeiro) */
export function RelFech({ f }: { f: Fech }) {
  return (
    <div className="rf">
      <div className="rf-cab"><b>{f.nome}</b><span>{nomeCicloGrande(f.ciclo)} · ciclo {fmtDate(f.de)} a {fmtDate(f.ate)}</span></div>
      <div className="rf-corpo">
        <div className="rf-tab"><table className="dl-tab"><thead><tr><th>Cliente</th><th style={{ textAlign: "right" }}>Valor</th><th>Data</th><th>Venda</th></tr></thead>
          <tbody>{f.linhas.length ? f.linhas.map((l, i) => <tr key={i}><td>{l.cliente}</td><td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmtMoeda(l.valor)}</td><td>{fmtDate(l.data)}</td><td>{l.venda}</td></tr>)
            : <tr><td colSpan={4} className="hint">Sem vendas no ciclo.</td></tr>}</tbody></table></div>
        <div className="rf-res">{resumo(f).map(([t, v, tipo, neg]) => <div key={t} className={neg ? "tot" : ""}><span>{t}</span><b>{tipo === "num" ? v : fmtMoeda(v)}</b></div>)}
          {f.oficial && <small className="hint">Visitas: nº oficial do ciclo · {fmtMoeda(f.valorVisita)} cada · comissão {String(f.comissaoPct).replace(".", ",")}%</small>}</div>
      </div>
    </div>
  );
}

async function lerFech(ciclo?: string, uid?: string) {
  if (MOCK) return [] as any[];
  let q = sb.from("fechamento_campo").select("ciclo,usuario_id,dados,gerado_em,gerado_por").order("ciclo", { ascending: false });
  if (ciclo) q = q.eq("ciclo", ciclo); if (uid) q = q.eq("usuario_id", uid);
  const { data, error } = await q.limit(400); if (error) throw error;
  return (data || []) as { ciclo: string; usuario_id: string; dados: Fech; gerado_em: string; gerado_por: string }[];
}

// ---------- Gestão (no Financeiro, com o período = um ciclo) ----------
export function FechamentoGestao({ de, ate, pessoas }: { de: string; ate: string; pessoas: any[] }) {
  const { R, executar: ex } = useApp() as any;
  const ym = cicloExato(de, ate);
  const [salvos, setSalvos] = useState<any[] | null>(null); const [tick, setTick] = useState(0); const [ver, setVer] = useState("");
  useEffect(() => { let vivo = true; setSalvos(null); if (!ym) return; lerFech(ym).then(l => vivo && setSalvos(l)).catch(() => vivo && setSalvos([])); return () => { vivo = false; }; }, [ym, tick]);
  if (!ym) return <div className="panel" style={{ marginBottom: 16 }}><h3>🔒 Fechamento do ciclo</h3><div className="hint">Escolha um ciclo completo (dia 29 ao dia 28) no período acima para gerar o fechamento e o Excel do Financeiro.</div></div>;
  const previa = pessoas.map(u => montarFech(R, u.id, ym)).filter(f => f.total > 0 || f.linhas.length).sort((a, b) => a.nome.localeCompare(b.nome));
  const feitos = (salvos || []).map(s => s.dados).sort((a, b) => a.nome.localeCompare(b.nome));
  const lista = feitos.length ? feitos : previa;
  const total = lista.reduce((s, f) => s + f.total, 0);
  const gerar = () => {
    if (!previa.length) return;
    if (!confirm(`${feitos.length ? "REFAZER" : "Gerar"} o fechamento de ${nomeCicloGrande(ym)} (ciclo ${fmtDate(de)} a ${fmtDate(ate)})?\n\n${previa.map(f => "• " + f.nome + ": " + fmtMoeda(f.total)).join("\n")}\n\nTotal ${fmtMoeda(previa.reduce((s, f) => s + f.total, 0))}.\nDepois de gerado, cada um vê o seu relatório no Financeiro.`)) return;
    ex(async () => {
      const eu = R.currentUserId;
      if (feitos.length) { const { error } = await sb.from("fechamento_campo").delete().eq("ciclo", ym); if (error) throw error; }
      const { error } = await sb.from("fechamento_campo").insert(previa.map(f => ({ ciclo: ym, usuario_id: f.uid, dados: f, gerado_por: eu })));
      if (error) throw error;
    }, "Fechamento gerado — cada um já vê o seu relatório").then(() => setTick(t => t + 1));
  };
  const desfazer = () => { if (!confirm("Desfazer o fechamento deste ciclo? Os relatórios somem para os consultores.")) return;
    ex(async () => { const { error } = await sb.from("fechamento_campo").delete().eq("ciclo", ym); if (error) throw error; }, "Fechamento desfeito").then(() => setTick(t => t + 1)); };
  const s0 = salvos && salvos[0];
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3>🔒 Fechamento de {nomeCicloGrande(ym)} <span className="hint" style={{ fontWeight: 400 }}>ciclo {fmtDate(de)} a {fmtDate(ate)}</span></h3>
      {salvos === null ? <div className="empty">Carregando…</div> : <>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "6px 0 12px" }}>
          {feitos.length ? <span className="pill" style={{ background: "var(--tn-green)", color: "var(--tn-green-i)", fontWeight: 800 }}>✅ Fechado em {new Date(s0.gerado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{s0.gerado_por ? " por " + R.nomeUser(s0.gerado_por) : ""}</span>
            : <span className="pill" style={{ background: "var(--tn-amber)", color: "var(--tn-amber-i)", fontWeight: 800 }}>Prévia — ainda não fechado</span>}
          <b>{lista.length} pessoa(s) · {fmtMoeda(total)}</b>
          <button className="btn primary" onClick={gerar} disabled={!previa.length}>{feitos.length ? "↻ Refazer fechamento" : "🔒 Gerar fechamento"}</button>
          <button className="btn" onClick={() => excelFechamento(lista, `Fechamento consultores ${ym}${feitos.length ? "" : " (PRÉVIA)"}.xlsx`)} disabled={!lista.length}>📥 Excel para o Financeiro{feitos.length ? "" : " (prévia)"}</button>
          {feitos.length > 0 && <button className="btn ghost sm" onClick={desfazer}>Desfazer</button>}
        </div>
        <table className="dl-tab"><thead><tr><th>Nome</th><th>Visitas/medidas</th><th>Vendas</th><th>Comissão</th><th>Ajuda de custo</th><th>Reembolso</th><th>Total a pagar</th></tr></thead>
          <tbody>{lista.map(f => [<tr key={f.nome} onClick={() => setVer(ver === f.nome ? "" : f.nome)} style={{ cursor: "pointer" }}>
            <td><b>{f.nome}</b> <span className="hint">{ver === f.nome ? "▾" : "▸"}</span></td><td>{fmtMoeda(f.totalVisitas + f.totalMedidas)} <small className="hint">({f.qtdVisitas + f.qtdMedidas})</small></td><td>{fmtMoeda(f.totalVendas)}</td>
            <td>{fmtMoeda(f.comissao)}</td><td>{fmtMoeda(f.auxilio)}</td><td>{fmtMoeda(f.reembolso)}</td><td style={{ fontWeight: 800 }}>{fmtMoeda(f.total)}</td></tr>,
            ver === f.nome && <tr key={f.nome + "d"}><td colSpan={7}><RelFech f={f} /></td></tr>])}</tbody></table>
      </>}
    </div>
  );
}

// ---------- a própria pessoa (ou a Gestão olhando o extrato de alguém): relatórios dos ciclos fechados ----------
export function FechamentoMeu({ uid, movel }: { uid: string; movel?: boolean }) {
  const [lista, setLista] = useState<any[] | null>(null); const [ab, setAb] = useState("");
  useEffect(() => { let vivo = true; lerFech(undefined, uid).then(l => { if (vivo) { setLista(l); setAb(l[0]?.ciclo || ""); } }).catch(() => vivo && setLista([])); return () => { vivo = false; }; }, [uid]);
  if (!lista || !lista.length) return null;
  const f = lista.find(x => x.ciclo === ab)?.dados as Fech | undefined;
  return (
    <div className={movel ? "mv-bloco" : "panel"} style={movel ? undefined : { marginBottom: 16 }}>
      {movel ? <div className="mv-bloco-t">Fechamento</div> : <h3>🔒 Fechamento do ciclo</h3>}
      <div className="fc-hist" style={{ marginBottom: 8 }}>{lista.map(x => <button key={x.ciclo} className={"fc-h" + (ab === x.ciclo ? " on" : "")} onClick={() => setAb(ab === x.ciclo ? "" : x.ciclo)}>{mesPt(x.ciclo + "-01")}: <b>{fmtMoeda(x.dados.total)}</b></button>)}</div>
      {f && <><RelFech f={f} /><button className="btn sm" style={{ marginTop: 8 }} onClick={() => excelFechamento([f], `Fechamento ${f.nome} ${f.ciclo}.xlsx`)}>📥 Baixar em Excel</button></>}
    </div>
  );
}
