// Painel do PROPRIETÁRIO: só números (sem ações). Resultado do mês, loja ao vivo, quem vende, de onde vem o cliente e quanto custa vender.
import { useState } from "react";
import { useApp } from "../estado";
import { fmtMoeda, hojeISO, isoLocal, parseData, parseMoeda, vendaContaComissao, vendaContaVolume } from "../lib/regras";
import { BarRow } from "./Dashboard";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function mes(off: number) {
  const h = parseData(hojeISO() + "T12:00"); const ini = new Date(h.getFullYear(), h.getMonth() - off, 1); const fim = new Date(h.getFullYear(), h.getMonth() - off + 1, 0);
  return { de: isoLocal(ini), ate: isoLocal(fim), nome: MESES[ini.getMonth()].replace(/^./, c => c.toUpperCase()) + " " + ini.getFullYear(), dias: fim.getDate() };
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
function Var({ atual, antes, dinheiro }: { atual: number; antes: number; dinheiro?: boolean }) {
  if (!antes) return <small className="dn-var">sem base no mês anterior</small>;
  const p = Math.round(((atual - antes) / antes) * 100);
  return <small className={"dn-var " + (p >= 0 ? "sobe" : "desce")}>{p >= 0 ? "▲" : "▼"} {Math.abs(p)}% vs mês anterior ({dinheiro ? fmtMoeda(antes) : antes})</small>;
}

export default function PainelDono() {
  const { R, st, abrirDetalhe } = useApp() as any;
  const [off, setOff] = useState(0);
  const M = mes(off), A = mes(off + 1);
  const hoje = hojeISO();
  const mkt = st.chamados.filter((c: any) => R.domMarketing(c));
  const val = (c: any) => (c.venda && c.venda.valorNum != null ? Number(c.venda.valorNum) : parseMoeda(c.venda && c.venda.valor));
  const dataV = (c: any) => String(c.venda.dataVenda || c.venda.quando || "").slice(0, 10);
  // mês corrente: compara com o mesmo número de dias do mês anterior (justo)
  const diaHoje = Number(hoje.slice(8, 10));
  const ateAnt = off === 0 ? A.de.slice(0, 8) + String(Math.min(diaHoje, A.dias)).padStart(2, "0") : A.ate;
  const vendidas = (de: string, ate: string) => mkt.filter((c: any) => vendaContaVolume(c.venda) && dataV(c) >= de && dataV(c) <= ate);
  const V = vendidas(M.de, off === 0 ? hoje : M.ate), VA = vendidas(A.de, ateAnt);
  const soma = (l: any[]) => l.reduce((s, c) => s + val(c), 0);
  const tot = soma(V), totA = soma(VA), tk = V.length ? tot / V.length : 0, tkA = VA.length ? totA / VA.length : 0;
  const aConfirmar = mkt.filter((c: any) => c.venda && c.venda.status === "registrada");

  // loja ao vivo (hoje)
  const lojaHoje = mkt.filter((c: any) => String(c.dataLoja || "").slice(0, 10) === hoje).sort((a: any, b: any) => String(a.dataLoja).localeCompare(String(b.dataLoja)));
  const fim = (c: any) => !!c.venda || ["orcamento", "sem_resposta", "reprovado", "nao_compareceu", "venda_cancelada"].includes(R.statusClienteDe(c));
  const emAtd = lojaHoje.filter((c: any) => c.tratativa && c.tratativa.emAtendimento && !fim(c));
  const agora = new Date();
  const esperando = lojaHoje.filter((c: any) => !fim(c) && !(c.tratativa && c.tratativa.emAtendimento) && parseData(c.dataLoja) <= agora);
  const semVend = lojaHoje.filter((c: any) => !c.atendenteId && !fim(c));
  const proximos = lojaHoje.filter((c: any) => parseData(c.dataLoja) > agora && !fim(c)).slice(0, 6);
  const vendHoje = mkt.filter((c: any) => c.venda && c.venda.status !== "cancelada" && dataV(c) === hoje);

  // quem vende
  const agrupa = (chave: (c: any) => string) => {
    const m: Record<string, { n: number; v: number }> = {};
    V.forEach((c: any) => { const k = chave(c) || "—"; m[k] = m[k] || { n: 0, v: 0 }; m[k].n++; m[k].v += val(c); });
    return Object.entries(m).sort((a, b) => b[1].v - a[1].v);
  };
  const porVend = agrupa((c: any) => c.atendenteId ? R.nomeUser(c.atendenteId) : c.venda.vendedor);
  const porGer = agrupa((c: any) => c.venda.gerenteNome || "(não informado)");
  const mxV = Math.max(1, ...porVend.map(x => x[1].v)), mxG = Math.max(1, ...porGer.map(x => x[1].v));
  const oM = V.filter((c: any) => R.origemLoja(c) === "marketing"), oE = V.filter((c: any) => R.origemLoja(c) === "externo");

  // custo comercial do mês (o que se paga para vender)
  const cfg = R.cfg();
  const noMes = (d: any) => { const s = String(d || "").slice(0, 10); return s >= M.de && s <= (off === 0 ? hoje : M.ate); };
  const visitas = mkt.filter((c: any) => c.consultorId && c.tratativa && c.tratativa.realizada && noMes(c.dataLoja)).length;
  const medidas = st.chamados.filter((c: any) => c.tipo === "medidas" && c.tratativa && c.tratativa.medida && c.tratativa.medida.realizadaEm && noMes(c.tratativa.medida.realizadaEm)).length;
  const comConsultor = V.filter((c: any) => c.consultorId && vendaContaComissao(c.venda)).reduce((s, c) => s + val(c), 0) * cfg.comissaoPct / 100;
  const comMkt = V.filter((c: any) => R.ehDireto(c) && vendaContaComissao(c.venda)).length * (cfg.valorVendaMkt ?? 10);
  const reemb = (st.reembolsos || []).filter((r: any) => r.status === "aprovado" && noMes(r.data)).reduce((s: number, r: any) => s + r.valor, 0);
  const comVend = tot * 0.02;
  const custo = (visitas + medidas) * cfg.pagamentoVisita + comConsultor + comMkt + reemb + comVend;

  const Pessoa = ({ c, extra }: any) => <button className="dn-pessoa" onClick={() => abrirDetalhe(c.id)}><b>{String(c.dataLoja).slice(11, 16)}</b><span>{c.cliente}</span><small>{extra}</small></button>;

  return (
    <div className="dn">
      <div className="dn-meses">{[0, 1, 2].map(o => <button key={o} className={off === o ? "on" : ""} onClick={() => setOff(o)}>{o === 0 ? "Este mês" : mes(o).nome}</button>)}</div>

      <div className="dn-grandes">
        <div className="dn-g principal"><span>Vendido · {M.nome}{off === 0 ? " (até hoje)" : ""}</span><b>{fmtMoeda(tot)}</b><Var atual={tot} antes={totA} dinheiro /></div>
        <div className="dn-g"><span>Vendas</span><b>{V.length}</b><Var atual={V.length} antes={VA.length} /></div>
        <div className="dn-g"><span>Ticket médio</span><b>{V.length ? fmtMoeda(tk) : "—"}</b><Var atual={tk} antes={tkA} dinheiro /></div>
      </div>
      {aConfirmar.length > 0 && <div className="dn-nota">{aConfirmar.length} venda(s) registrada(s) aguardando confirmação da Gestão ({fmtMoeda(soma(aConfirmar))}) — ainda não entram nos números.</div>}

      {off === 0 && <div className="dn-bloco">
        <h3>🏬 Loja agora <span className="live"><i></i>ao vivo</span></h3>
        <div className="dn-mini">
          <div><b>{lojaHoje.length}</b><span>agendados hoje</span></div>
          <div className="verde"><b>{emAtd.length}</b><span>em atendimento</span></div>
          <div className={esperando.length ? "alerta" : ""}><b>{esperando.length}</b><span>chegando / esperando</span></div>
          <div className={semVend.length ? "alerta" : ""}><b>{semVend.length}</b><span>sem vendedor</span></div>
          <div><b>{vendHoje.length}</b><span>vendas hoje · {fmtMoeda(soma(vendHoje))}</span></div>
        </div>
        <div className="dn-2">
          <div><h4>Em atendimento</h4>{emAtd.length ? emAtd.map((c: any) => <Pessoa key={c.id} c={c} extra={R.nomeUser(c.atendenteId)} />) : <div className="dn-vazio">Ninguém em atendimento agora.</div>}</div>
          <div><h4>Próximos a chegar</h4>{proximos.length ? proximos.map((c: any) => <Pessoa key={c.id} c={c} extra={c.atendenteId ? R.nomeUser(c.atendenteId) : "sem vendedor"} />) : <div className="dn-vazio">Nenhum outro cliente hoje.</div>}</div>
        </div>
      </div>}

      <div className="dn-2">
        <div className="dn-bloco"><h3>Vendas por vendedor</h3>
          {porVend.length ? porVend.map(([nm, x]) => <div key={nm}><BarRow nm={nm} pct={x.v / mxV * 100} v={fmtMoeda(x.v)} cor="var(--st-concluida)" /><div className="dn-sub">{x.n} venda(s) · ticket {fmtMoeda(x.v / x.n)}</div></div>) : <div className="dn-vazio">Sem vendas no período.</div>}</div>
        <div className="dn-bloco"><h3>Por gerente que negociou</h3>
          {porGer.length ? porGer.map(([nm, x]) => <div key={nm}><BarRow nm={nm} pct={x.v / mxG * 100} v={fmtMoeda(x.v)} cor="#27468f" /><div className="dn-sub">{x.n} venda(s)</div></div>) : <div className="dn-vazio">Sem vendas no período.</div>}</div>
      </div>

      <div className="dn-2">
        <div className="dn-bloco"><h3>De onde vem o cliente</h3>
          <div className="dn-origem">
            <div><i className="mk"></i><b>Marketing</b><span>{oM.length} vendas · {fmtMoeda(soma(oM))}</span><small>ticket {oM.length ? fmtMoeda(soma(oM) / oM.length) : "—"} · {pct(soma(oM), tot) ?? 0}% do vendido</small></div>
            <div><i className="ex"></i><b>Consultor externo</b><span>{oE.length} vendas · {fmtMoeda(soma(oE))}</span><small>ticket {oE.length ? fmtMoeda(soma(oE) / oE.length) : "—"} · {pct(soma(oE), tot) ?? 0}% do vendido</small></div>
          </div></div>
        <div className="dn-bloco"><h3>Custo comercial do mês</h3>
          <div className="dn-custo"><b>{fmtMoeda(custo)}</b><span>{tot ? ((custo / tot) * 100).toFixed(1).replace(".", ",") + "% do vendido" : "—"}</span></div>
          <div className="dn-linhas">
            <div><span>Visitas pagas ({visitas} × {fmtMoeda(cfg.pagamentoVisita)})</span><b>{fmtMoeda(visitas * cfg.pagamentoVisita)}</b></div>
            <div><span>Medidas ({medidas} × {fmtMoeda(cfg.pagamentoVisita)})</span><b>{fmtMoeda(medidas * cfg.pagamentoVisita)}</b></div>
            <div><span>Comissão consultores ({String(cfg.comissaoPct).replace(".", ",")}%)</span><b>{fmtMoeda(comConsultor)}</b></div>
            <div><span>Marketing (por venda efetivada)</span><b>{fmtMoeda(comMkt)}</b></div>
            <div><span>Reembolsos aprovados</span><b>{fmtMoeda(reemb)}</b></div>
            <div><span>Comissão vendedores (estimativa 2%)</span><b>{fmtMoeda(comVend)}</b></div>
          </div>
          <small className="dn-nota2">Bônus de meta do marketing não entra aqui (aparece em Produtividade e pagamento).</small>
        </div>
      </div>
    </div>
  );
}
