// 🤝 Negociação: o vendedor envia o pré-pedido e os gerentes / proprietários abrem aqui, na hora da negociação com o cliente:
// produtos (inclusive Promob), preços cheios, total bruto e a simulação do desconto (em % ou valor final) com a forma de pagamento.
// Continua sendo só consulta: não é venda e não entra em nenhuma etapa.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtMoeda } from "../lib/regras";
import { FRETES, freteDe, numBR, precoItem, somaBase, somaPP, somaPromo, type PP } from "./PrePedido";

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
  if (atual) return <Mesa p={atual} voltar={() => { setAbrir(""); carregar(); }} excluir={() => excluir(atual)} />;
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
function Mesa({ p, voltar, excluir }: { p: PN; voltar: () => void; excluir?: () => void }) {
  const { toast } = useApp() as any;
  // O desconto cai SÓ sobre a base: produto em promoção já veio com o preço da promoção e frete é custo.
  const base = somaBase(p) || (somaPP(p) ? 0 : numBR(p.valor_bruto));
  const promo = somaPromo(p);
  const [frete, setFrete] = useState(br2(freteDe(p)));
  const fret = numBR(frete);
  const bruto = base + promo + fret;                       // valor cheio que o cliente vê
  const foraDesc = promo + fret;                           // o que não aceita desconto
  const ini = numBR(p.neg_valor) || numBR(p.valor_negociado) || 0;
  const [valor, setValor] = useState(br2(ini));
  const [desc, setDesc] = useState(ini && base ? br2(Math.round((1 - Math.max(0, ini - foraDesc) / base) * 1000) / 10) : "");
  const [pag, setPag] = useState(p.neg_pagamento || p.pagamento || "");
  const [obs, setObs] = useState(p.neg_obs || "");
  const [salvando, setSalvando] = useState(false);
  const porDesc = (d: string) => { setDesc(d); const n = numBR(d); setValor(n > 0 && base ? br2(Math.round((base * (1 - n / 100) + foraDesc) * 100) / 100) : ""); };
  const porValor = (v: string) => { setValor(v); const n = numBR(v); setDesc(n > 0 && base ? br2(Math.round((1 - Math.max(0, n - foraDesc) / base) * 1000) / 10) : ""); };
  // mudou o frete: o valor final acompanha, mantendo o desconto que já estava na mesa
  const mudarFrete = (f: string) => { setFrete(f); const n = numBR(desc);
    if (n > 0 && base) setValor(br2(Math.round((base * (1 - n / 100) + promo + numBR(f)) * 100) / 100)); };
  const final = numBR(valor) || bruto;
  const descRS = Math.max(0, base - (final - foraDesc));
  async function salvar(status: string) {
    setSalvando(true);
    try { await A.negociacaoSalvar(p.id!, { status, valor: numBR(valor) ? numBR(valor).toFixed(2) : "", desconto: numBR(desc) ? String(numBR(desc)) : "", frete: fret ? fret.toFixed(2) : "", pagamento: pag, obs }); toast(status === "fechado" ? "Negociação fechada" : "Proposta salva — o vendedor já vê"); voltar(); }
    catch (e: any) { toast(e.message || "Não consegui salvar"); } finally { setSalvando(false); }
  }
  const promob = p.itens.filter((i: any) => i.promob), prontos = p.itens.filter((i: any) => !i.promob);
  const somaDe = (l: any[]) => l.reduce((s, i) => s + precoItem(i) * (Number(i.qtd) || 0), 0);
  return <div className="ng">
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button type="button" className="btn ghost sm" onClick={voltar}>‹ Negociação</button>
      {excluir && <button type="button" className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={excluir}>🗑 Tirar da negociação</button>}
    </div>
    <div className="cp-card">
      <div className="ng-cli"><b>{p.cliente_nome || "Cliente sem nome"}</b><small>{numPP(p)} · vendedor {p.vendedor || "—"}{p.telefone ? " · " + p.telefone : ""}</small>{p.endereco && <small>{p.endereco}</small>}</div>
      <table className="ng-tab"><thead><tr><th>Produto</th><th>Qtd.</th><th>Preço un.</th><th>Total</th></tr></thead>
        <tbody>{p.itens.map((i: any, k) => <tr key={k} className={(i.promob ? "promob" : "") + (i.promo ? " ng-promo" : "")}>
          <td><b>{i.promob ? "📐 " : ""}{i.nome}</b>{i.promo && <span className="ng-tag">🏷 promoção · sem desconto</span>}
            <small>{i.promob ? "Promob (projeto)" : "Cód. " + i.codigo + (i.cor ? " · " + i.cor : "")}{i.obs ? " · " + i.obs : ""}</small></td>
          <td>{i.qtd}</td>
          <td>{precoItem(i) ? fmtMoeda(precoItem(i)) : "—"}{i.promo && numBR(i.preco) > numBR(i.precoPromo) ? <small style={{ display: "block", textDecoration: "line-through", opacity: .6 }}>{fmtMoeda(numBR(i.preco))}</small> : null}</td>
          <td><b>{precoItem(i) ? fmtMoeda(precoItem(i) * i.qtd) : "—"}</b></td></tr>)}</tbody></table>
      {promob.length > 0 && prontos.length > 0 && <div className="ng-sub"><span>Produtos prontos {fmtMoeda(somaDe(prontos))}</span><span>Promob {fmtMoeda(somaDe(promob))}</span></div>}
      {/* o gerente bate o olho e sabe onde pode dar desconto */}
      <div className="ng-bases">
        <div className="ng-b1"><span>Entra no desconto</span><b>{fmtMoeda(base)}</b></div>
        {promo > 0 && <div className="ng-b2"><span>🏷 Em promoção <small>sem desconto</small></span><b>{fmtMoeda(promo)}</b></div>}
        {fret > 0 && <div className="ng-b2"><span>🚚 Frete <small>sem desconto</small></span><b>{fmtMoeda(fret)}</b></div>}
      </div>
      <div className="ng-bruto"><span>Valor cheio (bruto)</span><b>{fmtMoeda(bruto)}</b></div>
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
      <div className="ng-final"><span>Fica por</span><b>{fmtMoeda(final)}</b>{descRS > 0.004 && <small>desconto de {fmtMoeda(descRS)} sobre {fmtMoeda(base)} ({(Math.round(descRS / base * 1000) / 10).toString().replace(".", ",")}%){foraDesc > 0 ? " · + " + fmtMoeda(foraDesc) + " sem desconto" : ""}</small>}</div>
      <div className="ng-parc">{[1, 3, 6, 10, 12].map(n => <span key={n}>{n}x {fmtMoeda(final / n)}</span>)}</div>
      <label className="pp-f">Forma de pagamento<input value={pag} onChange={e => setPag(e.target.value)} placeholder="ex.: entrada no Pix + 10x cartão" /></label>
      <label className="pp-f">Observação da negociação<input value={obs} onChange={e => setObs(e.target.value)} /></label>
      <div className="pp-acoes"><button type="button" className="btn primary pp-salvar" disabled={salvando} onClick={() => salvar("negociando")}>💾 Salvar proposta</button>
        <button type="button" className="btn" disabled={salvando} onClick={() => salvar("fechado")}>✅ Negociação fechada</button></div>
      <div className="hint">O vendedor vê a proposta no pré-pedido dele. Só consulta — o pedido continua sendo tirado no sistema.</div>
    </div>
  </div>;
}
