// 🤝 Negociação: o vendedor envia o pré-pedido e os gerentes / proprietários abrem aqui, na hora da negociação com o cliente:
// produtos (inclusive Promob), preços cheios, total bruto e a simulação do desconto (em % ou valor final) com a forma de pagamento.
// Continua sendo só consulta: não é venda e não entra em nenhuma etapa.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtMoeda } from "../lib/regras";
import { FRETES, descontoPromo, freteDe, numBR, precoItem, somaBase, somaPP, somaPromo, somaTabela, type PP } from "./PrePedido";
import { PLANOS, PRIMEIRO, VIGENCIA, liquidoMax, planos as planosCred } from "../lib/crediario";

type PN = PP & { vendedor?: string; neg_status?: string; neg_enviado_em?: string; neg_valor?: any; neg_desconto?: any; neg_pagamento?: string; neg_obs?: string; neg_em?: string };
const numPP = (p: PP) => p.numero ? "PP-" + String(p.numero).padStart(4, "0") : "—";
const ROT: Record<string, string> = { enviado: "🆕 aguardando", negociando: "🤝 em negociação", fechado: "✅ fechada" };
const hora = (v?: string) => v ? new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const br2 = (n: number) => n ? n.toFixed(2).replace(".", ",") : "";

export default function Negociacao({ onVoltar }: { onVoltar?: () => void }) {
  const { toast } = useApp() as any;
  const [lista, setLista] = useState<PN[] | null>(null);
  const [abrir, setAbrir] = useState<string>("");
  const [filtro, setFiltro] = useState<"abertas" | "fechadas">("abertas");
  const carregar = async () => { try { setLista(((await A.negociacaoLista()) || []) as PN[]); } catch (e: any) { toast(e.message); setLista([]); } };
  useEffect(() => { carregar(); const t = setInterval(carregar, 30000); return () => clearInterval(t); }, []);
  const vis = (lista || []).filter(p => filtro === "fechadas" ? p.neg_status === "fechado" : p.neg_status !== "fechado");
  const atual = (lista || []).find(p => p.id === abrir);
  // o gerente tira do quadro dele o que não serve (duplicado, teste, cliente que desistiu)
  const excluir = async (p: PN) => {
    if (!confirm("Tirar " + numPP(p) + " de " + (p.cliente_nome || "cliente sem nome") + " da negociação?\n\nSai da sua tela e a proposta é apagada. O pré-pedido continua com o vendedor, que pode enviar de novo.")) return;
    try { await A.negociacaoExcluir(p.id!); if (abrir === p.id) setAbrir(""); toast("Tirado da negociação"); carregar(); }
    catch (e: any) { toast(e.message || "Não consegui tirar da negociação"); }
  };
  if (atual) return <Mesa p={atual} voltar={() => { setAbrir(""); carregar(); }} recarregar={carregar} excluir={() => excluir(atual)} />;
  return <div className="ng">
    {onVoltar && <button type="button" className="btn ghost sm" onClick={onVoltar}>‹ Voltar</button>}
    <div className="pp-tit" style={{ fontSize: 17, margin: "6px 0" }}>🤝 Negociação</div>
    <div className="pp-aviso">Pré-pedidos que os vendedores enviaram para negociar. Abra na hora com o cliente: preços cheios, total e simulação do desconto. Só consulta — não é venda.</div>
    <div className="chips" style={{ margin: "0 0 8px" }}>
      <button type="button" className={"chip" + (filtro === "abertas" ? " on" : "")} onClick={() => setFiltro("abertas")}>Para negociar ({(lista || []).filter(p => p.neg_status !== "fechado").length})</button>
      <button type="button" className={"chip" + (filtro === "fechadas" ? " on" : "")} onClick={() => setFiltro("fechadas")}>Fechadas ({(lista || []).filter(p => p.neg_status === "fechado").length})</button>
      <button type="button" className="chip" onClick={carregar}>↻ Atualizar</button></div>
    {lista === null ? <div className="hint">Carregando…</div> : !vis.length ? <div className="cp-card hint">Nenhum pré-pedido {filtro === "fechadas" ? "fechado" : "para negociar"} agora.</div> :
      vis.map(p => <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "stretch", marginBottom: 8 }}>
        <button type="button" className={"ng-card " + (p.neg_status || "")} style={{ marginBottom: 0 }} onClick={() => setAbrir(p.id!)}>
          <div><b>{p.cliente_nome || "Cliente sem nome"}</b><small>{numPP(p)} · vendedor {p.vendedor || "—"} · enviado {hora(p.neg_enviado_em)}</small>
            <small>{p.itens.length} produto{p.itens.length > 1 ? "s" : ""}{p.itens.some((i: any) => i.promob) ? " · inclui Promob" : ""}{p.itens.some((i: any) => i.promo) ? " · 🏷 tem promoção" : ""}{freteDe(p) > 0 ? " · 🚚 frete" : ""}</small></div>
          <div className="ng-dir"><b>{fmtMoeda((somaPP(p) || numBR(p.valor_bruto)) + freteDe(p))}</b><span className="pill">{ROT[p.neg_status || ""] || p.neg_status}</span>
            {numBR(p.neg_valor) > 0 && <small>proposta {fmtMoeda(numBR(p.neg_valor))}</small>}</div>
        </button>
        <button type="button" className="btn ghost" title="Tirar da negociação" aria-label="Tirar da negociação" style={{ flex: "none", padding: "0 12px", fontSize: 17 }} onClick={() => excluir(p)}>🗑</button>
      </div>)}
  </div>;
}

/** mesa de negociação: produtos, preços cheios e a simulação do desconto */
function Mesa({ p, voltar, recarregar, excluir }: { p: PN; voltar: () => void; recarregar?: () => void; excluir?: () => void }) {
  const { toast, R } = useApp() as any;
  // o gerente pode tirar e incluir produto durante a negociação; as contas seguem esta lista
  const [itens, setItens] = useState<any[]>(p.itens || []);
  const pv = { ...p, itens } as PN;
  // O desconto cai SÓ sobre a base: produto em promoção já veio com o preço da promoção e frete é custo.
  const base = somaBase(pv) || (somaPP(pv) ? 0 : numBR(p.valor_bruto));
  const promo = somaPromo(pv);
  const tabela = somaTabela(pv);          // soma pelo preço do sistema, antes da promoção
  const promoAbat = descontoPromo(pv);    // quanto a promoção já abateu
  const temPromo = itens.some((i: any) => i.promo);
  const [frete, setFrete] = useState(br2(freteDe(p)));
  const fret = numBR(frete);
  const bruto = base + promo + fret;                       // valor cheio que o cliente vê
  const foraDesc = promo + fret;                           // o que não aceita desconto
  const ini = numBR(p.neg_valor) || numBR(p.valor_negociado) || 0;
  const [valor, setValor] = useState(br2(ini));
  // o % que o gerente salvou é o que vale ao reabrir; só recalcula quando não há proposta salva
  const [desc, setDesc] = useState(numBR(p.neg_desconto) > 0
    ? br2(numBR(p.neg_desconto))
    : ini && base ? br2(Math.round((1 - Math.max(0, ini - foraDesc) / base) * 1000) / 10) : "");
  const [pag, setPag] = useState(p.neg_pagamento || p.pagamento || "");
  const [obs, setObs] = useState(p.neg_obs || "");
  const [modo, setModo] = useState("");   // como o cliente vai pagar: à vista, cartão ou crediário
  const [salvando, setSalvando] = useState(false);
  const porDesc = (d: string) => { setDesc(d); const n = numBR(d); setValor(n > 0 && base ? br2(Math.round((base * (1 - n / 100) + foraDesc) * 100) / 100) : ""); };
  const porValor = (v: string) => { setValor(v); const n = numBR(v); setDesc(n > 0 && base ? br2(Math.round((1 - Math.max(0, n - foraDesc) / base) * 1000) / 10) : ""); };
  // mudou o frete: o valor final acompanha, mantendo o desconto que já estava na mesa
  const mudarFrete = (f: string) => { setFrete(f); const n = numBR(desc);
    if (n > 0 && base) setValor(br2(Math.round((base * (1 - n / 100) + promo + numBR(f)) * 100) / 100)); };
  const final = numBR(valor) || bruto;
  const descRS = Math.max(0, base - (final - foraDesc));
  async function mexerItens(l: any[], aviso: string) {
    const antes = itens; setItens(l);
    try { await A.negociacaoItens(p.id!, l); toast(aviso); }
    catch (e: any) { setItens(antes); toast(e.message || "Não consegui alterar os produtos"); }
  }
  async function salvar(status: string) {
    setSalvando(true);
    try {
      // o frete vai SEMPRE, inclusive "0.00": é assim que "tirei o frete" fica gravado
      // e não volta para o frete do vendedor quando o gerente reabre a mesa
      await A.negociacaoSalvar(p.id!, {
        status,
        valor: numBR(valor) ? numBR(valor).toFixed(2) : "",
        desconto: numBR(desc) ? String(numBR(desc)) : "",
        frete: fret.toFixed(2),
        pagamento: pag,
        obs,
      });
      if (status === "fechado") { toast("Negociação fechada"); voltar(); }
      // negociação em andamento: o gerente fica na mesa, com o cliente na frente dele
      else { toast("Proposta salva — o vendedor já vê"); recarregar?.(); }
    }
    catch (e: any) { toast(e.message || "Não consegui salvar"); }
    finally { setSalvando(false); }
  }
  const promob = itens.filter((i: any) => i.promob), prontos = itens.filter((i: any) => !i.promob);
  const somaDe = (l: any[]) => l.reduce((s, i) => s + precoItem(i) * (Number(i.qtd) || 0), 0);
  return <div className="ng">
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button type="button" className="btn ghost sm" onClick={voltar}>‹ Negociação</button>
      {excluir && <button type="button" className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={excluir}>🗑 Tirar da negociação</button>}
    </div>
    <div className="cp-card">
      <div className="ng-cli"><b>{p.cliente_nome || "Cliente sem nome"}</b><small>{numPP(p)} · vendedor {p.vendedor || "—"}{p.telefone ? " · " + p.telefone : ""}</small>{p.endereco && <small>{p.endereco}</small>}</div>
      <table className="ng-tab"><thead><tr><th>Produto</th><th>Qtd.</th><th>Preço de tabela</th>{temPromo && <th>🏷 Promoção</th>}<th>Total</th></tr></thead>
        <tbody>{itens.map((i: any, k) => <tr key={k} className={(i.promob ? "promob" : "") + (i.promo ? " ng-promo" : "")}>
          <td><b>{i.promob ? "📐 " : ""}{i.nome}</b>{i.promo && <span className="ng-tag">🏷 promoção · sem desconto</span>}
            <small>{i.promob ? "Promob (projeto)" : "Cód. " + i.codigo + (i.cor ? " · " + i.cor : "")}{i.obs ? " · " + i.obs : ""}</small></td>
          <td>{i.qtd}</td>
          <td>{numBR(i.preco) ? fmtMoeda(numBR(i.preco)) : "—"}{numBR(i.preco) && i.qtd > 1 ? <small style={{ display: "block", opacity: .7 }}>{fmtMoeda(numBR(i.preco) * i.qtd)}</small> : null}</td>
          {temPromo && <td>{i.promo ? <b style={{ color: "#8a5d00" }}>{fmtMoeda(numBR(i.precoPromo))}</b> : "—"}</td>}
          <td><b>{precoItem(i) ? fmtMoeda(precoItem(i) * i.qtd) : "—"}</b>
            <div className="ng-qtd">
              <button type="button" title="Menos um" onClick={() => mexerItens(itens.map((x, j) => j === k ? { ...x, qtd: Math.max(1, (Number(x.qtd) || 1) - 1) } : x), "Quantidade alterada")}>−</button>
              <button type="button" title="Mais um" onClick={() => mexerItens(itens.map((x, j) => j === k ? { ...x, qtd: (Number(x.qtd) || 1) + 1 } : x), "Quantidade alterada")}>＋</button>
              <button type="button" title="Tirar da negociação" onClick={() => { if (itens.length < 2) { toast("A negociação precisa de pelo menos um produto"); return; }
                if (confirm("Tirar " + i.nome + " desta negociação?")) mexerItens(itens.filter((_, j) => j !== k), "Produto retirado"); }}>🗑</button>
            </div></td></tr>)}</tbody></table>
      <IncluirProduto onIncluir={it => mexerItens([...itens, it], "Produto incluído")} />
      {promob.length > 0 && prontos.length > 0 && <div className="ng-sub"><span>Produtos prontos {fmtMoeda(somaDe(prontos))}</span><span>Promob {fmtMoeda(somaDe(promob))}</span></div>}
      {/* do preço do sistema até o preço que o cliente vê */}
      <div className="ng-res">
        <div><span>Soma pelo preço de tabela</span><b>{fmtMoeda(tabela)}</b></div>
        {promoAbat > 0.004 && <div className="d"><span>🏷 Promoção já aplicada</span><b>− {fmtMoeda(promoAbat)}</b></div>}
        {fret > 0 && <div><span>🚚 Frete</span><b>+ {fmtMoeda(fret)}</b></div>}
      </div>
      <div className="ng-bruto"><span>Valor cheio</span><b>{fmtMoeda(bruto)}</b></div>
      <div className="ng-bases">
        <div className="ng-b1"><span>Entra no desconto</span><b>{fmtMoeda(base)}</b></div>
        {promo > 0 && <div className="ng-b2"><span>🏷 Em promoção <small>sem desconto</small></span><b>{fmtMoeda(promo)}</b></div>}
        {fret > 0 && <div className="ng-b2"><span>🚚 Frete <small>sem desconto</small></span><b>{fmtMoeda(fret)}</b></div>}
      </div>
      {(numBR(p.valor_negociado) > 0 || p.pagamento) && <div className="hint">Vendedor anotou: {numBR(p.valor_negociado) ? "negociado " + fmtMoeda(numBR(p.valor_negociado)) : ""}{p.pagamento ? " · " + p.pagamento : ""}</div>}
    </div>
    <div className="cp-card">
      <div className="pp-tit">Simular a negociação</div>
      {/* frete: entra fixo em R$ 100 (Curitiba e região) e o gerente ajusta aqui — litoral e fora são mais caros */}
      <div className="ng-frete">
        <label className="pp-f" style={{ maxWidth: 160, margin: 0 }}>🚚 Frete R$<input inputMode="decimal" value={frete} onChange={e => mudarFrete(e.target.value)} placeholder="0,00" /></label>
        <div className="ng-rap" style={{ margin: 0 }}>{FRETES.map(([v, r]) => <button key={v} type="button" className={"chip" + (br2(numBR(frete)) === br2(numBR(v)) ? " on" : "")} onClick={() => mudarFrete(v)}>{r} {fmtMoeda(numBR(v))}</button>)}
          {fret > 0 && <button type="button" className="chip" onClick={() => mudarFrete("")}>sem frete</button>}</div>
      </div>
      <div className="hint" style={{ marginBottom: 6 }}>O desconto vale só sobre <b>{fmtMoeda(base)}</b>{foraDesc > 0 ? <> — {promo > 0 ? "promoção" : ""}{promo > 0 && fret > 0 ? " e " : ""}{fret > 0 ? "frete" : ""} ({fmtMoeda(foraDesc)}) {foraDesc && promo > 0 && fret > 0 ? "entram" : "entra"} por fora.</> : "."}</div>
      <div className="ng-rap">{[3, 5, 8, 10, 12, 15].map(d => <button key={d} type="button" className={"chip" + (numBR(desc) === d ? " on" : "")} onClick={() => porDesc(String(d))}>{d}%</button>)}</div>
      <div className="pp-g2"><label className="pp-f">Desconto % <small style={{ textTransform: "none", fontWeight: 500 }}>(sobre {fmtMoeda(base)})</small><input inputMode="decimal" value={desc} onChange={e => porDesc(e.target.value)} placeholder="0" /></label>
        <label className="pp-f">Valor final R$ <small style={{ textTransform: "none", fontWeight: 500 }}>(tudo incluso)</small><input inputMode="decimal" value={valor} onChange={e => porValor(e.target.value)} placeholder={br2(bruto)} /></label></div>
      {/* a conta aberta, linha a linha, do cheio até o que fica para o cliente */}
      <div className="ng-res">
        {promoAbat > 0.004 && <div className="m"><span>Tabela {fmtMoeda(tabela)} · promoção já aplicada</span><b>− {fmtMoeda(promoAbat)}</b></div>}
        <div><span>Valor cheio</span><b>{fmtMoeda(bruto)}</b></div>
        {descRS > 0.004 && <div className="d"><span>Desconto dado ({(Math.round(descRS / base * 1000) / 10).toString().replace(".", ",")}% sobre {fmtMoeda(base)})</span><b>− {fmtMoeda(descRS)}</b></div>}
      </div>
      <div className="ng-final"><span>Fica por</span><b>{fmtMoeda(final)}</b></div>

      <div className="pp-tit" style={{ marginTop: 10 }}>Como o cliente vai pagar</div>
      <div className="ng-rap">{([["vista", "💵 À vista"], ["cartao", "💳 Cartão de crédito"], ...(R.temAcesso("crediario") ? [["crediario", "🧾 Crediário da loja"]] as [string, string][] : [])] as [string, string][])
        .map(([k, r]) => <button key={k} type="button" className={"chip" + (modo === k ? " on" : "")} onClick={() => { setModo(modo === k ? "" : k); if (k === "vista") setPag("À vista " + fmtMoeda(final)); }}>{r}</button>)}</div>

      {modo === "cartao" && <>
        <div className="hint" style={{ marginBottom: 6 }}>O cliente parcela no cartão dele e a loja recebe o <b>valor à vista</b> — por isso as parcelas são a divisão limpa de {fmtMoeda(final)}.</div>
        <div className="ng-cred-l">{Array.from({ length: 12 }, (_, i) => i + 1).map(n => {
          const r = "Cartão de crédito " + n + "× de " + fmtMoeda(final / n);
          return <button key={n} type="button" className={"ng-cred-i ng-clic" + (pag === r ? " sel" : "")} onClick={() => setPag(r)}>
            <b>{n}× {fmtMoeda(final / n)}</b><span>total {fmtMoeda(final)}</span></button>; })}</div>
      </>}

      {modo === "crediario" && R.temAcesso("crediario") && <Crediario liquido={final} bruto={bruto} escolher={setPag} escolhido={pag} />}

      <label className="pp-f">Forma de pagamento<input value={pag} onChange={e => setPag(e.target.value)} placeholder="ex.: entrada no Pix + 10x cartão" /></label>
      <label className="pp-f">Observação da negociação<input value={obs} onChange={e => setObs(e.target.value)} /></label>
      <div className="pp-acoes"><button type="button" className="btn primary pp-salvar" disabled={salvando} onClick={() => salvar("negociando")}>💾 Salvar proposta</button>
        <button type="button" className="btn" disabled={salvando} onClick={() => salvar("fechado")}>✅ Negociação fechada</button></div>
      <div className="hint">O vendedor vê a proposta no pré-pedido dele. Só consulta — o pedido continua sendo tirado no sistema.</div>
    </div>
  </div>;
}

/** 💳 Crediário da loja (teste · só para quem tem o acesso "crediario").
 *  A conta vai ao contrário do normal: o gerente já fechou QUANTO A LOJA RECEBE (o valor à vista
 *  da negociação) e a tela mostra, para cada plano, o preço que o cliente enxerga como "sem juros"
 *  — n parcelas iguais, sem nenhuma menção a juros — e quanto de desconto ainda cabe ali dentro.
 *  Plano em que a etiqueta passa do valor cheio aparece em vermelho: não fecha sem cobrar mais. */
function Crediario({ liquido, bruto, escolher, escolhido }: { liquido: number; bruto: number; escolher?: (t: string) => void; escolhido?: string }) {
  const [dias, setDias] = useState(30);
  const [rec, setRec] = useState("");
  const [tudo, setTudo] = useState(false);
  const alvo = numBR(rec) || liquido;
  const l = planosCred(alvo, bruto, dias);
  const vis = tudo ? l : l.filter(x => x.plano <= 12);
  return <div className="ng-cred">
    <div className="pp-tit" style={{ marginTop: 4 }}>💳 Crediário da loja <small style={{ textTransform: "none", fontWeight: 500 }}>· tabela de {VIGENCIA}</small></div>
    <div className="ng-frete">
      <label className="pp-f" style={{ maxWidth: 190, margin: 0 }}>A loja precisa receber R$
        <input inputMode="decimal" value={rec} onChange={e => setRec(e.target.value)} placeholder={br2(liquido)} /></label>
      <div className="ng-rap" style={{ margin: 0 }}>{PRIMEIRO.map(([d, r]) => <button key={d} type="button" className={"chip" + (dias === d ? " on" : "")} onClick={() => setDias(d)}>1ª em {r}</button>)}</div>
    </div>
    <div className="hint" style={{ marginBottom: 6 }}>Sem preencher, usa o valor da negociação acima (<b>{fmtMoeda(liquido)}</b>). O preço de cada plano já está com o parcelamento embutido — o cliente vê <b>parcelas iguais</b>, e o que sobra entre esse preço e o valor cheio ({fmtMoeda(bruto)}) é o desconto que ainda dá para dar.</div>
    {!l.some(x => x.cabe) && <div className="ng-cred-fora">
      Com <b>{fmtMoeda(alvo)}</b> no bolso da loja, nenhum plano cabe dentro do valor cheio — o parcelamento custa mais do que a diferença que sobrou.
      Para o <b>{PLANOS[0]}×</b> fechar sem subir o preço, a loja teria que receber no máximo <b>{fmtMoeda(liquidoMax(PLANOS[0], dias, bruto))}</b>
      {dias > 30 ? <> (ou manter a 1ª parcela em 30 dias)</> : null}.
    </div>}
    <div className="ng-cred-l">
      {vis.map(x => { const txt = "Crediário " + x.plano + "× de " + fmtMoeda(x.parcela) + " (1ª em " + dias + " dias)";
        return <button key={x.plano} type="button" className={"ng-cred-i ng-clic" + (x.cabe ? "" : " nao") + (escolhido === txt ? " sel" : "")}
          onClick={() => escolher?.(txt)} disabled={!escolher}>
        <b>{x.plano}× {fmtMoeda(x.parcela)}</b>
        <span>total {fmtMoeda(x.etiqueta)}</span>
        {x.cabe ? <small>cabe {(x.desconto * 100).toFixed(1).replace(".", ",")}% de desconto · {fmtMoeda(x.descontoRS)}</small>
          : <small>passa {(-x.desconto * 100).toFixed(1).replace(".", ",")}% do valor cheio</small>}
      </button>; })}
    </div>
    <button type="button" className="pp-link" onClick={() => setTudo(t => !t)}>{tudo ? "mostrar só até 12×" : "ver todos os planos (até 36×)"}</button>
  </div>;
}

/** incluir produto no meio da negociação: busca na mesma base da Consulta de produto,
 *  e, se o produto não estiver lá (item de projeto, por exemplo), aceita escrever à mão */
function IncluirProduto({ onIncluir }: { onIncluir: (i: any) => void }) {
  const { toast } = useApp() as any;
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [achados, setAchados] = useState<any[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [mao, setMao] = useState(false);
  const [nome, setNome] = useState(""); const [preco, setPreco] = useState(""); const [qtd, setQtd] = useState(1);
  const buscar = async () => {
    const t = q.trim(); if (t.length < 2) { toast("Escreva pelo menos 2 letras ou o código"); return; }
    setBuscando(true);
    try { setAchados(((await A.produtoLista(t)) || []).slice(0, 20)); }
    catch (e: any) { toast(e.message || "Não consegui buscar"); setAchados([]); }
    finally { setBuscando(false); }
  };
  const incluirDaBase = (x: any) => {
    const pr = x.preco != null ? String(Number(x.preco).toFixed(2)).replace(".", ",") : "";
    onIncluir({ codigo: x.codigo, nome: x.nome, cor: x.cor || "", ref: x.ref || "", tamanho: x.tamanho || "", qtd: 1, preco: pr, precoTab: pr });
    setAberto(false); setQ(""); setAchados(null);
  };
  const incluirMao = () => {
    if (nome.trim().length < 2) { toast("Escreva o nome do produto"); return; }
    if (numBR(preco) <= 0) { toast("Informe o preço"); return; }
    onIncluir({ codigo: "—", nome: nome.trim(), qtd: Math.max(1, qtd), preco });
    setAberto(false); setMao(false); setNome(""); setPreco(""); setQtd(1);
  };
  if (!aberto) return <button type="button" className="pp-link" onClick={() => setAberto(true)}>＋ incluir produto nesta negociação</button>;
  return <div className="ng-incl">
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label className="pp-f" style={{ flex: "1 1 200px", margin: 0 }}>Buscar produto <small style={{ textTransform: "none", fontWeight: 500 }}>por código ou nome</small>
        <input value={q} autoFocus onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") buscar(); }} placeholder="ex.: 1875840 ou cabeceira" /></label>
      <button type="button" className="btn sm" disabled={buscando} onClick={buscar}>{buscando ? "buscando…" : "🔎 Buscar"}</button>
      <button type="button" className="btn ghost sm" onClick={() => { setAberto(false); setMao(false); setAchados(null); }}>fechar</button>
    </div>
    {achados && (achados.length
      ? <div className="ng-achados">{achados.map((x: any) => <button key={x.codigo} type="button" onClick={() => incluirDaBase(x)}>
          <b>{x.nome}</b><span>Cód. {x.codigo}{x.cor ? " · " + x.cor : ""}</span>
          <small>{x.preco != null ? fmtMoeda(Number(x.preco)) : "sem preço na base"}</small></button>)}</div>
      : <div className="hint" style={{ marginTop: 6 }}>Nada encontrado com “{q}”.</div>)}
    {!mao ? <button type="button" className="pp-link" onClick={() => setMao(true)}>não está na base? escrever à mão</button>
      : <div className="pp-g2" style={{ marginTop: 6 }}>
          <label className="pp-f">Produto<input value={nome} onChange={e => setNome(e.target.value)} placeholder="nome do produto" /></label>
          <label className="pp-f">Preço un. R$<input inputMode="decimal" value={preco} onChange={e => setPreco(e.target.value)} placeholder="0,00" /></label>
          <label className="pp-f">Quantidade<input inputMode="numeric" value={qtd} onChange={e => setQtd(Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1))} /></label>
          <div style={{ display: "flex", alignItems: "flex-end" }}><button type="button" className="btn primary sm" onClick={incluirMao}>Incluir</button></div>
        </div>}
  </div>;
}
