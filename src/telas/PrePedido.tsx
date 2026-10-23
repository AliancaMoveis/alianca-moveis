// 🧾 Pré-pedido do vendedor: separa os produtos da consulta (código, descrição, cor, quantidade) para o cliente,
// com nome, telefone e endereço. NÃO é pedido: não entra em venda nem em nenhuma etapa — é só um arquivo de consulta
// para o vendedor tirar o pedido no sistema (Tático/Exact). Valores e forma de pagamento são opcionais e só para consulta.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtMoeda, linkWhats } from "../lib/regras";

export type ItemPP = { codigo: string; nome: string; cor?: string; ref?: string; tamanho?: string; qtd: number; obs?: string; preco?: string };
export type PP = { id?: string; numero?: number; cliente_nome: string; telefone: string; endereco: string; itens: ItemPP[]; valor_bruto?: any; valor_negociado?: any; pagamento?: string; obs?: string; status?: string; numero_venda?: string; criado_em?: string; atualizado_em?: string };

// ---------- rascunho (o pré-pedido em montagem fica neste aparelho até salvar) ----------
const CHAVE = "pp_rascunho";
const VAZIO: PP = { cliente_nome: "", telefone: "", endereco: "", itens: [], valor_bruto: "", valor_negociado: "", pagamento: "", obs: "" };
export function lerRascunho(): PP { try { const s = localStorage.getItem(CHAVE); return s ? { ...VAZIO, ...JSON.parse(s) } : { ...VAZIO }; } catch { return { ...VAZIO }; } }
export function gravarRascunho(p: PP) { try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* sem armazenamento */ } window.dispatchEvent(new Event("pp-mudou")); }
export function usarRascunho(): [PP, (p: PP) => void] {
  const [p, setP] = useState<PP>(lerRascunho);
  useEffect(() => { const f = () => setP(lerRascunho()); window.addEventListener("pp-mudou", f); return () => window.removeEventListener("pp-mudou", f); }, []);
  return [p, gravarRascunho];
}
const unid = (n: number) => n + (n === 1 ? " un." : " un.");
const totalUn = (p: PP) => p.itens.reduce((s, i) => s + (Number(i.qtd) || 0), 0);
/** "1.496,82" / "1496.82" / "1496,82" → número */
export const numBR = (v: any) => { const t = String(v ?? "").replace(/[^\d,.-]/g, ""); if (!t) return 0; const n = /,\d{1,2}$/.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t.replace(/,/g, "")); return isFinite(n) ? n : 0; };
/** soma dos preços anotados (preço unitário × quantidade) */
export const somaPP = (p: PP) => p.itens.reduce((s, i) => s + numBR(i.preco) * (Number(i.qtd) || 0), 0);
const temPreco = (p: PP) => p.itens.some(i => numBR(i.preco) > 0);
const numPP = (p: PP) => p.numero ? "PP-" + String(p.numero).padStart(4, "0") : "novo";

/** botão na ficha do produto: escolhe a quantidade e encaminha para o pré-pedido */
export function EncaminharPP({ prod, preco }: { prod: any; preco?: number | null }) {
  const { toast } = useApp() as any;
  const [pp] = usarRascunho();
  const ja = pp.itens.find(i => i.codigo === prod.codigo);
  const [q, setQ] = useState(1);
  const add = () => {
    const itens = ja ? pp.itens.map(i => i.codigo === prod.codigo ? { ...i, qtd: i.qtd + q } : i)
      : [...pp.itens, { codigo: prod.codigo, nome: prod.nome, cor: prod.cor || "", ref: prod.ref || "", tamanho: prod.tamanho || "", qtd: q, preco: preco ? String(preco.toFixed(2)).replace(".", ",") : "" }];
    gravarRascunho({ ...pp, itens }); toast((ja ? "Quantidade somada" : "Encaminhado para o pré-pedido") + " · " + prod.nome.slice(0, 40)); setQ(1);
  };
  return <div className="pp-enc">
    {ja && <div className="hint">✓ já está no pré-pedido · {unid(ja.qtd)}</div>}
    <div className="pp-qtd"><span>Quantidade</span><button type="button" onClick={() => setQ(Math.max(1, q - 1))}>−</button><b>{q}</b><button type="button" onClick={() => setQ(q + 1)}>+</button></div>
    <button type="button" className="btn primary pp-btn" onClick={add}>🧾 {ja ? "Somar ao pré-pedido" : "Encaminhar para pré-pedido"}</button>
  </div>;
}

/** barra amarela: pré-pedido em montagem */
export function BarraPP({ abrir }: { abrir: () => void }) {
  const [pp] = usarRascunho();
  if (!pp.itens.length) return null;
  return <button type="button" className="pp-barra" onClick={abrir}><span>🧾 Pré-pedido em aberto{pp.cliente_nome ? " · " + pp.cliente_nome : ""}<small>{pp.itens.length} produto{pp.itens.length > 1 ? "s" : ""} · {totalUn(pp)} unidade{totalUn(pp) > 1 ? "s" : ""}</small></span><b>Abrir ›</b></button>;
}

function textoPP(p: PP) {
  const L = ["*Pré-pedido " + numPP(p) + " — Aliança Móveis*", "", "*Cliente:* " + (p.cliente_nome || "—")];
  if (p.telefone) L.push("*Telefone:* " + p.telefone); if (p.endereco) L.push("*Endereço:* " + p.endereco);
  L.push("", "*Produtos:*");
  p.itens.forEach((i, k) => L.push(`${k + 1}. ${i.nome}${i.cor ? " — " + i.cor : ""} · cód. ${i.codigo} · ${unid(i.qtd)}${i.obs ? " (" + i.obs + ")" : ""}`));
  return L.join("\n");
}
function imprimir(p: PP, vendedor: string) {
  const w = window.open("", "_blank"); if (!w) return;
  const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" } as any)[c]);
  const val = (v: any) => v === "" || v == null ? "" : fmtMoeda(Number(String(v).replace(",", ".")));
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pré-pedido ${numPP(p)}</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#111}h1{font-size:20px;margin:0}small{color:#555}table{width:100%;border-collapse:collapse;margin:14px 0}td,th{border:1px solid #bbb;padding:6px 8px;font-size:13px;text-align:left}th{background:#eee}.box{border:1px solid #bbb;padding:8px 10px;margin:8px 0;font-size:13px}.av{font-size:11px;color:#a00;margin-top:14px}</style></head><body>
    <h1>Pré-pedido ${numPP(p)} — Aliança Móveis</h1><small>${esc(new Date(p.atualizado_em || Date.now()).toLocaleString("pt-BR"))} · vendedor ${esc(vendedor)}</small>
    <div class="box"><b>Cliente:</b> ${esc(p.cliente_nome)}<br><b>Telefone:</b> ${esc(p.telefone)}<br><b>Endereço:</b> ${esc(p.endereco)}</div>
    <table><tr><th>#</th><th>Código</th><th>Produto</th><th>Acabamento / cor</th><th>REF</th><th>Qtd.</th><th>Preço un.</th><th>Total</th><th>Obs.</th></tr>
    ${p.itens.map((i, k) => `<tr><td>${k + 1}</td><td>${esc(i.codigo)}</td><td>${esc(i.nome)}</td><td>${esc(i.cor)}</td><td>${esc(i.ref)}</td><td>${i.qtd}</td><td>${numBR(i.preco) ? fmtMoeda(numBR(i.preco)) : ""}</td><td>${numBR(i.preco) ? fmtMoeda(numBR(i.preco) * i.qtd) : ""}</td><td>${esc(i.obs)}</td></tr>`).join("")}</table>
    ${p.valor_bruto || p.valor_negociado || p.pagamento ? `<div class="box"><b>Valor bruto:</b> ${val(p.valor_bruto)} · <b>Negociado:</b> ${val(p.valor_negociado)}<br><b>Pagamento:</b> ${esc(p.pagamento)}</div>` : ""}
    ${p.obs ? `<div class="box"><b>Obs.:</b> ${esc(p.obs)}</div>` : ""}
    <div class="av">Pré-pedido para consulta — não é pedido nem venda. O pedido é tirado no sistema.</div>
    <script>setTimeout(()=>print(),300)</script></body></html>`);
  w.document.close();
}

/** tela do pré-pedido: montar/editar (rascunho ou salvo) e a lista "Meus pré-pedidos" */
export default function PrePedidos({ onVoltar, inicio = "editar" }: { onVoltar: () => void; inicio?: "editar" | "lista" }) {
  const { toast, R } = useApp() as any;
  const [aba, setAba] = useState<"editar" | "lista">(inicio);
  const [pp, gravar] = usarRascunho();
  const [lista, setLista] = useState<PP[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const carregar = async () => { try { setLista(((await A.prePedidoLista()) || []) as PP[]); } catch (e: any) { toast(e.message); setLista([]); } };
  useEffect(() => { if (aba === "lista") carregar(); }, [aba]);
  const set = (k: keyof PP, v: any) => gravar({ ...pp, [k]: v });
  const setItem = (k: number, m: Partial<ItemPP>) => gravar({ ...pp, itens: pp.itens.map((i, j) => j === k ? { ...i, ...m } : i) });
  const tirar = (k: number) => gravar({ ...pp, itens: pp.itens.filter((_, j) => j !== k) });
  const novo = () => { if (pp.itens.length && !pp.id && !confirm("Descartar o pré-pedido que está montando?")) return; gravar({ ...VAZIO }); setAba("editar"); onVoltar(); };
  async function salvar() {
    if (!pp.itens.length) { toast("Adicione pelo menos um produto (pela consulta)"); return; }
    if (!pp.cliente_nome.trim()) { toast("Informe o nome do cliente"); return; }
    setSalvando(true);
    const env = { ...pp, valor_bruto: temPreco(pp) ? somaPP(pp).toFixed(2) : (numBR(pp.valor_bruto) ? numBR(pp.valor_bruto).toFixed(2) : ""), valor_negociado: numBR(pp.valor_negociado) ? numBR(pp.valor_negociado).toFixed(2) : "" };
    try { const r: any = await A.prePedidoSalvar(env); gravar({ ...VAZIO }); toast("Pré-pedido " + numPP(r || {}) + " salvo"); setAba("lista"); }
    catch (e: any) { toast(e.message || "Não consegui salvar"); } finally { setSalvando(false); }
  }
  const abrir = (p: PP) => { if (pp.itens.length && !pp.id && !confirm("Você tem um pré-pedido sendo montado. Substituir pela edição deste?")) return; const br = (v: any) => v == null || v === "" ? "" : String(Number(v).toFixed(2)).replace(".", ","); gravar({ ...VAZIO, ...p, valor_bruto: br(p.valor_bruto), valor_negociado: br(p.valor_negociado) }); setAba("editar"); };
  const zap = (p: PP) => { const l = linkWhats(p.telefone, textoPP(p)); if (l) window.open(l, "_blank"); else toast("Informe o telefone do cliente"); };

  return <div className="pp">
    <div className="pp-cab"><button type="button" className="btn ghost sm" onClick={onVoltar}>‹ Consulta de produto</button>
      <div className="subnav" style={{ margin: 0 }}><button className={aba === "editar" ? "on" : ""} onClick={() => setAba("editar")}>🧾 Pré-pedido{pp.itens.length ? " (" + pp.itens.length + ")" : ""}</button><button className={aba === "lista" ? "on" : ""} onClick={() => setAba("lista")}>Meus pré-pedidos</button></div></div>
    <div className="pp-aviso">Não é pedido: fica salvo só para você consultar e tirar o pedido no sistema. Não entra em venda nem em nenhuma etapa.</div>

    {aba === "editar" && <>
      <div className="cp-card">
        <div className="pp-tit">Produtos {pp.id ? <small>· editando {numPP(pp)}</small> : null}</div>
        {!pp.itens.length && <div className="hint" style={{ padding: "8px 0" }}>Nenhum produto ainda. Volte para a consulta, leia o código ou busque pelo nome e toque em <b>🧾 Encaminhar para pré-pedido</b>.</div>}
        {pp.itens.map((i, k) => <div key={i.codigo + k} className="pp-it">
          <div><b>{i.nome}</b><small>Cód. {i.codigo}{i.ref ? " · REF " + i.ref : ""}{i.cor ? " · " + i.cor : ""}</small>
            <div className="pp-preco"><label>R$<input inputMode="decimal" placeholder="preço un." value={i.preco || ""} onChange={e => setItem(k, { preco: e.target.value })} /></label>
              {numBR(i.preco) > 0 && <span>= <b>{fmtMoeda(numBR(i.preco) * i.qtd)}</b>{i.qtd > 1 ? <small> ({i.qtd} × {fmtMoeda(numBR(i.preco))})</small> : null}</span>}</div>
            <input className="pp-obs" placeholder="observação do item (opcional)" value={i.obs || ""} onChange={e => setItem(k, { obs: e.target.value })} /></div>
          <div className="pp-q"><button type="button" onClick={() => setItem(k, { qtd: Math.max(1, i.qtd - 1) })}>−</button><b>{i.qtd}</b><button type="button" onClick={() => setItem(k, { qtd: i.qtd + 1 })}>+</button>
            <button type="button" className="pp-x" title="Tirar do pré-pedido" onClick={() => tirar(k)}>🗑</button></div>
        </div>)}
        {temPreco(pp) && <div className="pp-total"><span>Total dos produtos</span><b>{fmtMoeda(somaPP(pp))}</b></div>}
        <button type="button" className="pp-link" onClick={onVoltar}>＋ adicionar produto</button>
      </div>
      <div className="cp-card">
        <div className="pp-tit">Cliente</div>
        <label className="pp-f">Nome<input value={pp.cliente_nome} onChange={e => set("cliente_nome", e.target.value)} placeholder="nome do cliente" /></label>
        <label className="pp-f">Telefone<input value={pp.telefone} inputMode="tel" onChange={e => set("telefone", e.target.value)} placeholder="(41) 9…" /></label>
        <label className="pp-f">Endereço<input value={pp.endereco} onChange={e => set("endereco", e.target.value)} placeholder="rua, número, bairro, cidade" /></label>
      </div>
      <div className="cp-card">
        <div className="pp-tit">Valores e pagamento <small>(opcional)</small></div>
        <div className="pp-cad">🔒 Só para consulta na hora de incluir no sistema — não conta como venda nem entra em nenhuma etapa.</div>
        <div className="pp-g2"><label className="pp-f">Valor bruto {temPreco(pp) ? <small style={{ textTransform: "none", fontWeight: 500 }}>(soma dos produtos)</small> : null}
            {temPreco(pp) ? <div className="pp-soma">{fmtMoeda(somaPP(pp))}</div> : <input inputMode="decimal" value={pp.valor_bruto ?? ""} onChange={e => set("valor_bruto", e.target.value)} placeholder="R$" />}</label>
          <label className="pp-f">Valor negociado<input inputMode="decimal" value={pp.valor_negociado ?? ""} onChange={e => set("valor_negociado", e.target.value)} placeholder="R$" /></label></div>
        {temPreco(pp) && numBR(pp.valor_negociado) > 0 && <div className="hint">Desconto: <b>{fmtMoeda(somaPP(pp) - numBR(pp.valor_negociado))}</b> ({Math.round((1 - numBR(pp.valor_negociado) / Math.max(1, somaPP(pp))) * 1000) / 10}%)</div>}
        <label className="pp-f">Formas de pagamento<input value={pp.pagamento || ""} onChange={e => set("pagamento", e.target.value)} placeholder="ex.: entrada no Pix + 10x cartão" /></label>
        <label className="pp-f">Observações<input value={pp.obs || ""} onChange={e => set("obs", e.target.value)} /></label>
      </div>
      <div className="pp-acoes"><button type="button" className="btn primary pp-salvar" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "💾 Salvar pré-pedido"}</button>
        <button type="button" className="btn" onClick={() => zap(pp)}>💬 WhatsApp</button>
        {(pp.itens.length > 0 || pp.id) && <button type="button" className="btn ghost" onClick={novo}>Descartar / novo</button>}</div>
    </>}

    {aba === "lista" && <div className="cp-card">
      {lista === null ? <div className="hint">Carregando…</div> : !lista.length ? <div className="hint">Nenhum pré-pedido salvo ainda.</div> :
        lista.map(p => <div key={p.id} className="pp-ln">
          <div onClick={() => abrir(p)} style={{ cursor: "pointer", flex: 1 }}><b>{p.cliente_nome || "(sem nome)"}</b>
            <small>{numPP(p)} · {new Date(p.atualizado_em || "").toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {p.itens.length} produto{p.itens.length > 1 ? "s" : ""} · {totalUn(p)} un.{numBR(p.valor_negociado) ? " · negociado " + fmtMoeda(numBR(p.valor_negociado)) : numBR(p.valor_bruto) ? " · " + fmtMoeda(numBR(p.valor_bruto)) : ""}</small></div>
          <span className={"pill" + (p.status === "incluido" ? " pp-ok" : "")}>{p.status === "incluido" ? "incluído · venda " + (p.numero_venda || "—") : "em aberto"}</span>
          <div className="pp-mini">
            <button type="button" title="Editar" onClick={() => abrir(p)}>✏️</button>
            <button type="button" title="Imprimir / PDF" onClick={() => imprimir(p, R.nomeUser(R.currentUserId))}>🖨</button>
            <button type="button" title="Enviar ao cliente" onClick={() => zap(p)}>💬</button>
            {p.status === "incluido"
              ? <button type="button" title="Voltar para em aberto" onClick={async () => { await A.prePedidoStatus(p.id!, "aberto"); carregar(); }}>↩</button>
              : <button type="button" title="Marcar como incluído no sistema" onClick={async () => { const v = prompt("Pedido tirado no sistema — número da venda:", ""); if (v !== null) { try { await A.prePedidoStatus(p.id!, "incluido", v); carregar(); } catch (e: any) { toast(e.message); } } }}>✅</button>}
            <button type="button" title="Excluir" onClick={async () => { if (confirm("Excluir o pré-pedido " + numPP(p) + " de " + p.cliente_nome + "?")) { try { await A.prePedidoExcluir(p.id!); carregar(); } catch (e: any) { toast(e.message); } } }}>🗑</button>
          </div>
        </div>)}
      <div className="hint" style={{ marginTop: 8 }}>Valores só para consulta — não contam como venda.</div>
    </div>}
  </div>;
}
