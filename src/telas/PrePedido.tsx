// 🧾 Pré-pedido do vendedor: separa os produtos da consulta (código, descrição, cor, quantidade) para o cliente,
// com nome, telefone e endereço. NÃO é pedido: não entra em venda nem em nenhuma etapa — é só um arquivo de consulta
// para o vendedor tirar o pedido no sistema (Tático/Exact). Valores e forma de pagamento são opcionais e só para consulta.
import { useEffect, useState } from "react";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtMoeda, linkWhats } from "../lib/regras";

export type ItemPP = { codigo: string; nome: string; cor?: string; ref?: string; tamanho?: string; qtd: number; obs?: string; preco?: string };
export type PP = { id?: string; numero?: number; cliente_nome: string; telefone: string; endereco: string; itens: ItemPP[]; valor_bruto?: any; valor_negociado?: any; pagamento?: string; obs?: string; status?: string; numero_venda?: string; criado_em?: string; atualizado_em?: string };

// ---------- vários clientes ao mesmo tempo ----------
// Cada pré-pedido fica salvo no 360 desde o primeiro produto (status "aberto"). O vendedor pode atender vários clientes:
// cada um aparece numa barra amarela. "Para quem" vai o próximo produto lido = o pré-pedido ativo; depois de "Salvar e
// fechar", o próximo produto começa um pré-pedido NOVO (novo cliente).
const VAZIO: PP = { cliente_nome: "", telefone: "", endereco: "", itens: [], valor_bruto: "", valor_negociado: "", pagamento: "", obs: "" };
const CHAVE_ALVO = "pp_alvo";
export const lerAlvo = () => { try { return localStorage.getItem(CHAVE_ALVO) || ""; } catch { return ""; } };
export const gravarAlvo = (id: string) => { try { localStorage.setItem(CHAVE_ALVO, id); } catch { /* sem armazenamento */ } window.dispatchEvent(new Event("pp-mudou")); };
let _cache: PP[] | null = null; let _busca: Promise<PP[]> | null = null;
export async function carregarPP(forcar = false): Promise<PP[]> {
  if (_cache && !forcar) return _cache;
  if (!_busca) _busca = A.prePedidoLista().then((l: any) => (_cache = (l || []) as PP[])).catch(() => (_cache || [])).finally(() => { _busca = null; });
  return _busca;
}
const avisar = () => window.dispatchEvent(new Event("pp-mudou"));
export async function salvarPP(p: PP): Promise<PP> {
  const env = { ...p, valor_bruto: temPreco(p) ? somaPP(p).toFixed(2) : (numBR(p.valor_bruto) ? numBR(p.valor_bruto).toFixed(2) : ""), valor_negociado: numBR(p.valor_negociado) ? numBR(p.valor_negociado).toFixed(2) : "" };
  const r: PP = await A.prePedidoSalvar(env);
  _cache = [r, ...((_cache || []).filter(x => x.id !== r.id))]; avisar(); return r;
}
/** lista dos pré-pedidos (atualiza sozinha quando algum muda) */
export function usarPP(): [PP[] | null, string] {
  const [l, setL] = useState<PP[] | null>(_cache); const [alvo, setAlvo] = useState(lerAlvo());
  useEffect(() => { let vivo = true; const f = () => { setAlvo(lerAlvo()); carregarPP().then(x => vivo && setL([...x])); }; f(); window.addEventListener("pp-mudou", f); return () => { vivo = false; window.removeEventListener("pp-mudou", f); }; }, []);
  return [l, alvo];
}
const abertos = (l: PP[] | null) => (l || []).filter(p => p.status !== "incluido");
const unid = (n: number) => n + (n === 1 ? " un." : " un.");
const totalUn = (p: PP) => p.itens.reduce((s, i) => s + (Number(i.qtd) || 0), 0);
/** "1.496,82" / "1496.82" / "1496,82" → número */
export const numBR = (v: any) => { const t = String(v ?? "").replace(/[^\d,.-]/g, ""); if (!t) return 0; const n = /,\d{1,2}$/.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t.replace(/,/g, "")); return isFinite(n) ? n : 0; };
/** soma dos preços anotados (preço unitário × quantidade) */
export const somaPP = (p: PP) => p.itens.reduce((s, i) => s + numBR(i.preco) * (Number(i.qtd) || 0), 0);
const temPreco = (p: PP) => p.itens.some(i => numBR(i.preco) > 0);
const numPP = (p: PP) => p.numero ? "PP-" + String(p.numero).padStart(4, "0") : "novo";

/** botão na ficha do produto: escolhe a quantidade e PARA QUAL CLIENTE vai (pré-pedido ativo ou um novo) */
export function EncaminharPP({ prod, preco }: { prod: any; preco?: number | null }) {
  const { toast } = useApp() as any;
  const [lista, alvo0] = usarPP();
  const ab = abertos(lista);
  const alvo = ab.some(p => p.id === alvo0) ? alvo0 : "";
  const atual = ab.find(p => p.id === alvo) || null;
  const ja = atual?.itens.find(i => i.codigo === prod.codigo);
  const [q, setQ] = useState(1); const [ocupado, setOcupado] = useState(false);
  const add = async () => {
    setOcupado(true);
    try {
      const base: PP = atual || { ...VAZIO };
      const itens = ja ? base.itens.map(i => i.codigo === prod.codigo ? { ...i, qtd: i.qtd + q } : i)
        : [...base.itens, { codigo: prod.codigo, nome: prod.nome, cor: prod.cor || "", ref: prod.ref || "", tamanho: prod.tamanho || "", qtd: q, preco: preco ? String(preco.toFixed(2)).replace(".", ",") : "" }];
      const r = await salvarPP({ ...base, itens }); gravarAlvo(r.id || "");
      toast((ja ? "Quantidade somada" : "Encaminhado") + " · " + (r.cliente_nome || numPP(r)) + " · " + prod.nome.slice(0, 32)); setQ(1);
    } catch (e: any) { toast(e.message || "Não consegui encaminhar"); } finally { setOcupado(false); }
  };
  return <div className="pp-enc">
    <label className="pp-para">Para<select value={alvo} onChange={e => gravarAlvo(e.target.value)}>
      <option value="">＋ Novo cliente (novo pré-pedido)</option>
      {ab.map(p => <option key={p.id} value={p.id}>{(p.cliente_nome || "sem nome") + " · " + numPP(p) + " · " + p.itens.length + " produto(s)"}</option>)}
    </select></label>
    {ja && <div className="hint">✓ já está no pré-pedido de {atual?.cliente_nome || numPP(atual!)} · {unid(ja.qtd)}</div>}
    <div className="pp-qtd"><span>Quantidade</span><button type="button" onClick={() => setQ(Math.max(1, q - 1))}>−</button><b>{q}</b><button type="button" onClick={() => setQ(q + 1)}>+</button></div>
    <button type="button" className="btn primary pp-btn" disabled={ocupado} onClick={add}>🧾 {ocupado ? "Encaminhando…" : ja ? "Somar ao pré-pedido" : atual ? "Encaminhar para " + (atual.cliente_nome || numPP(atual)) : "Encaminhar para um NOVO pré-pedido"}</button>
  </div>;
}

/** barras amarelas: um pré-pedido em aberto por cliente (o ativo fica destacado) */
export function BarraPP({ abrir }: { abrir: (id: string) => void }) {
  const [lista, alvo] = usarPP();
  const ab = abertos(lista);
  if (!ab.length) return null;
  return <div className="pp-barras">{ab.slice(0, 12).map(p => <button key={p.id} type="button" className={"pp-barra" + (p.id === alvo ? " ativo" : "")} onClick={() => abrir(p.id!)}>
    <span>🧾 {p.cliente_nome || "Cliente sem nome"}<small>{numPP(p)} · {p.itens.length} produto{p.itens.length > 1 ? "s" : ""} · {totalUn(p)} un.{p.id === alvo ? " · recebendo os próximos produtos" : ""}</small></span><b>Abrir ›</b></button>)}</div>;
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

/** tela do pré-pedido: editar um cliente (por id) e a lista "Meus pré-pedidos" */
export default function PrePedidos({ onVoltar, id }: { onVoltar: () => void; id?: string }) {
  const { toast, R } = useApp() as any;
  const [aba, setAba] = useState<"editar" | "lista">(id ? "editar" : "lista");
  const [lista] = usarPP();
  const [pp, setPP] = useState<PP | null>(null);
  const [salvando, setSalvando] = useState(false); const [sujo, setSujo] = useState(false);
  const br = (v: any) => v == null || v === "" ? "" : String(Number(v).toFixed(2)).replace(".", ",");
  const abrirId = (x: string) => { const p = (lista || []).find(y => y.id === x); if (p) { setPP({ ...VAZIO, ...p, valor_bruto: br(p.valor_bruto), valor_negociado: br(p.valor_negociado) }); setSujo(false); setAba("editar"); } };
  useEffect(() => { if (id && lista && !pp) abrirId(id); }, [lista]);
  useEffect(() => { carregarPP(true).then(() => avisar()); }, []);
  // salva sozinho 1,2 s depois de cada alteração (não perde nada se fechar o app)
  useEffect(() => { if (!pp || !sujo || !pp.itens.length) return; const t = setTimeout(async () => { try { const r = await salvarPP(pp); setPP(x => x ? { ...x, id: r.id, numero: r.numero } : x); setSujo(false); } catch { /* tenta de novo na próxima */ } }, 1200); return () => clearTimeout(t); }, [pp, sujo]);
  const mudar = (m: Partial<PP>) => { setPP(x => x ? { ...x, ...m } : x); setSujo(true); };
  const set = (k: keyof PP, v: any) => mudar({ [k]: v } as any);
  const setItem = (k: number, m: Partial<ItemPP>) => pp && mudar({ itens: pp.itens.map((i, j) => j === k ? { ...i, ...m } : i) });
  const tirar = (k: number) => pp && mudar({ itens: pp.itens.filter((_, j) => j !== k) });
  async function salvar(fechar: boolean) {
    if (!pp) return;
    if (!pp.itens.length) { toast("Adicione pelo menos um produto (pela consulta)"); return; }
    if (!pp.cliente_nome.trim()) { toast("Informe o nome do cliente"); return; }
    setSalvando(true);
    try { const r = await salvarPP(pp); setSujo(false); toast("Pré-pedido " + numPP(r) + " de " + r.cliente_nome + " salvo");
      if (fechar) { if (lerAlvo() === r.id) gravarAlvo(""); onVoltar(); } else setPP(x => x ? { ...x, id: r.id, numero: r.numero } : x); }
    catch (e: any) { toast(e.message || "Não consegui salvar"); } finally { setSalvando(false); }
  }
  const zap = (p: PP) => { const l = linkWhats(p.telefone, textoPP(p)); if (l) window.open(l, "_blank"); else toast("Informe o telefone do cliente"); };
  const recarregar = () => carregarPP(true).then(() => avisar());

  return <div className="pp">
    <div className="pp-cab"><button type="button" className="btn ghost sm" onClick={onVoltar}>‹ Consulta de produto</button>
      <div className="subnav" style={{ margin: 0 }}>{pp && <button className={aba === "editar" ? "on" : ""} onClick={() => setAba("editar")}>🧾 {pp.cliente_nome || numPP(pp)}</button>}<button className={aba === "lista" ? "on" : ""} onClick={() => setAba("lista")}>Meus pré-pedidos</button></div></div>
    <div className="pp-aviso">Não é pedido: fica salvo só para você consultar e tirar o pedido no sistema. Não entra em venda nem em nenhuma etapa.</div>

    {aba === "editar" && pp && <>
      <div className="cp-card">
        <div className="pp-tit">Produtos <small>· {numPP(pp)}{sujo ? " · salvando…" : " · salvo"}</small></div>
        {!pp.itens.length && <div className="hint" style={{ padding: "8px 0" }}>Nenhum produto. Volte para a consulta e encaminhe.</div>}
        {pp.itens.map((i, k) => <div key={i.codigo + k} className="pp-it">
          <div><b>{i.nome}</b><small>Cód. {i.codigo}{i.ref ? " · REF " + i.ref : ""}{i.cor ? " · " + i.cor : ""}</small>
            <div className="pp-preco"><label>R$<input inputMode="decimal" placeholder="preço un." value={i.preco || ""} onChange={e => setItem(k, { preco: e.target.value })} /></label>
              {numBR(i.preco) > 0 && <span>= <b>{fmtMoeda(numBR(i.preco) * i.qtd)}</b>{i.qtd > 1 ? <small> ({i.qtd} × {fmtMoeda(numBR(i.preco))})</small> : null}</span>}</div>
            <input className="pp-obs" placeholder="observação do item (opcional)" value={i.obs || ""} onChange={e => setItem(k, { obs: e.target.value })} /></div>
          <div className="pp-q"><button type="button" onClick={() => setItem(k, { qtd: Math.max(1, i.qtd - 1) })}>−</button><b>{i.qtd}</b><button type="button" onClick={() => setItem(k, { qtd: i.qtd + 1 })}>+</button>
            <button type="button" className="pp-x" title="Tirar do pré-pedido" onClick={() => tirar(k)}>🗑</button></div>
        </div>)}
        {temPreco(pp) && <div className="pp-total"><span>Total dos produtos</span><b>{fmtMoeda(somaPP(pp))}</b></div>}
        <button type="button" className="pp-link" onClick={() => { if (pp.id) gravarAlvo(pp.id); onVoltar(); }}>＋ adicionar produto a este cliente</button>
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
      <div className="pp-acoes"><button type="button" className="btn primary pp-salvar" disabled={salvando} onClick={() => salvar(true)}>{salvando ? "Salvando…" : "💾 Salvar e fechar"}</button>
        <button type="button" className="btn" onClick={() => zap(pp)}>💬 WhatsApp</button>
        <button type="button" className="btn ghost" onClick={() => { if (pp.id) gravarAlvo(pp.id); onVoltar(); }}>＋ Adicionar produtos a este cliente</button></div>
      <div className="hint" style={{ marginBottom: 14 }}>Depois de <b>Salvar e fechar</b>, o próximo produto lido começa um pré-pedido <b>novo</b> (outro cliente). Este continua na barra amarela até você marcar "incluído no sistema".</div>
    </>}

    {aba === "lista" && <div className="cp-card">
      {lista === null ? <div className="hint">Carregando…</div> : !lista.length ? <div className="hint">Nenhum pré-pedido salvo ainda.</div> :
        lista.map(p => <div key={p.id} className="pp-ln">
          <div onClick={() => abrirId(p.id!)} style={{ cursor: "pointer", flex: 1 }}><b>{p.cliente_nome || "(sem nome)"}</b>
            <small>{numPP(p)} · {new Date(p.atualizado_em || "").toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {p.itens.length} produto{p.itens.length > 1 ? "s" : ""} · {totalUn(p)} un.{numBR(p.valor_negociado) ? " · negociado " + fmtMoeda(numBR(p.valor_negociado)) : numBR(p.valor_bruto) ? " · " + fmtMoeda(numBR(p.valor_bruto)) : ""}</small></div>
          <span className={"pill" + (p.status === "incluido" ? " pp-ok" : "")}>{p.status === "incluido" ? "incluído · venda " + (p.numero_venda || "—") : "em aberto"}</span>
          <div className="pp-mini">
            <button type="button" title="Editar" onClick={() => abrirId(p.id!)}>✏️</button>
            <button type="button" title="Imprimir / PDF" onClick={() => imprimir(p, R.nomeUser(R.currentUserId))}>🖨</button>
            <button type="button" title="Enviar ao cliente" onClick={() => zap(p)}>💬</button>
            {p.status === "incluido"
              ? <button type="button" title="Voltar para em aberto" onClick={async () => { await A.prePedidoStatus(p.id!, "aberto"); recarregar(); }}>↩</button>
              : <button type="button" title="Marcar como incluído no sistema" onClick={async () => { const v = prompt("Pedido tirado no sistema — número da venda:", ""); if (v !== null) { try { await A.prePedidoStatus(p.id!, "incluido", v); if (lerAlvo() === p.id) gravarAlvo(""); recarregar(); } catch (e: any) { toast(e.message); } } }}>✅</button>}
            <button type="button" title="Excluir" onClick={async () => { if (confirm("Excluir o pré-pedido " + numPP(p) + " de " + p.cliente_nome + "?")) { try { await A.prePedidoExcluir(p.id!); if (lerAlvo() === p.id) gravarAlvo(""); if (pp?.id === p.id) setPP(null); recarregar(); } catch (e: any) { toast(e.message); } } }}>🗑</button>
          </div>
        </div>)}
      <div className="hint" style={{ marginTop: 8 }}>Valores só para consulta — não contam como venda.</div>
    </div>}
  </div>;
}
