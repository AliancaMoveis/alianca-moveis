// 🏷 Consulta de produto: o vendedor aponta a câmera para o código de barras da etiqueta (Tático) e vê o produto —
// nome, acabamento/cor, medidas, referência, estoque, especificações e as outras opções (tamanhos e cores) do mesmo produto.
// Leitura: BarcodeDetector do navegador (Android/Chrome) e, quando não tem, a biblioteca ZXing (iPhone e outros).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../estado";
import { A } from "../lib/acoes";
import { fmtMoeda } from "../lib/regras";
import { col, lerArquivo } from "./Medidas";
import { baixarXlsx } from "../lib/planilha";

// planilha de produtos: aceita os nomes de coluna mais comuns (Tático, Excel feito à mão)
const COLS: [keyof Produto, string, string[]][] = [
  ["codigo", "Código de barras", ["Código de barras", "Codigo de barras", "Código", "Codigo", "Cód", "Cod", "EAN", "Cód. barras", "CodBarras", "ID"]],
  ["nome", "Descrição", ["Descrição", "Descricao", "Produto", "Nome", "Nome do produto"]],
  ["cor", "Acabamento / cor", ["Acabamento", "Cor", "Acabamento / cor", "Cores"]],
  ["tamanho", "Tamanho", ["Tamanho", "Versão", "Versao"]],
  ["ref", "REF", ["REF", "Referência", "Referencia"]],
  ["fabricante", "Fabricante", ["Fabricante", "Marca", "Fornecedor"]],
  ["modulo", "Tipo", ["Tipo", "Categoria", "Módulo", "Modulo", "Grupo de produto", "Linha"]],
  ["grupo", "Grupo (junta cores/tamanhos)", ["Grupo", "Modelo", "Família", "Familia"]],
  ["altura", "Altura (cm)", ["Altura", "A", "Altura (cm)"]],
  ["profundidade", "Profundidade (cm)", ["Profundidade", "P", "Profundidade (cm)"]],
  ["largura", "Largura (cm)", ["Largura", "L", "Largura (cm)"]],
  ["estoque", "Estoque", ["Estoque", "Saldo", "Qtd", "Quantidade", "Qtde"]],
  ["preco", "Preço", ["Preço", "Preco", "Valor", "Preço venda", "Preço de venda"]],
  ["especificacoes", "Especificações técnicas", ["Especificações", "Especificacoes", "Especificações técnicas", "Descrição técnica", "Detalhes"]],
  ["imagem_url", "Imagem (link)", ["Imagem", "Foto", "URL da imagem", "Link da imagem"]],
  ["obs", "Observações", ["Observações", "Observacoes", "Obs"]],
];
const numTxt = (s: string) => String(s || "").replace(/cm/i, "").replace(/R\$/, "").trim().replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");

type Produto = { codigo: string; nome: string; modulo: string; grupo: string; cor: string; tamanho: string; especificacoes: string; estoque: number | null; preco: number | null;
  imagem_url: string; obs: string; ref: string; fabricante: string; altura: number | null; profundidade: number | null; largura: number | null; cod_etiqueta: string; atualizado_em?: string; variacoes?: Produto[] };
const VAZIO: Produto = { codigo: "", nome: "", modulo: "", grupo: "", cor: "", tamanho: "", especificacoes: "", estoque: null, preco: null, imagem_url: "", obs: "", ref: "", fabricante: "", altura: null, profundidade: null, largura: null, cod_etiqueta: "" };
const soCod = (s: string) => String(s || "").replace(/\s/g, "");
const cm = (n: number | null) => n == null || n === ("" as any) ? "—" : String(n).replace(".", ",") + " cm";

/** câmera em tela cheia lendo código de barras; chama onCodigo uma vez */
export function LeitorCodigo({ onCodigo, onFechar }: { onCodigo: (c: string) => void; onFechar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState(""); const [luz, setLuz] = useState(false); const [temLuz, setTemLuz] = useState(false);
  const fim = useRef(false); const trilha = useRef<MediaStreamTrack | null>(null);
  useEffect(() => {
    let parar = () => { /* nada */ }; let vivo = true;
    const achou = (txt: string) => { if (fim.current || !txt) return; fim.current = true; try { navigator.vibrate?.(80); } catch { /* sem vibração */ } onCodigo(soCod(txt)); };
    (async () => {
      try {
        const BD = (window as any).BarcodeDetector;
        const formatos = BD ? await BD.getSupportedFormats?.().catch(() => []) : [];
        if (BD && formatos && formatos.length) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
          if (!vivo) { stream.getTracks().forEach(t => t.stop()); return; }
          const v = video.current!; v.srcObject = stream; await v.play();
          trilha.current = stream.getVideoTracks()[0]; setTemLuz(!!(trilha.current?.getCapabilities as any)?.call(trilha.current)?.torch);
          const det = new BD({ formats: formatos.filter((f: string) => ["code_128", "code_39", "code_93", "codabar", "ean_13", "ean_8", "itf", "upc_a", "upc_e"].includes(f)) });
          let ativo = true;
          const laco = async () => { if (!ativo || fim.current) return; try { const r = await det.detect(v); if (r && r[0]) achou(r[0].rawValue); } catch { /* quadro ruim */ } setTimeout(laco, 120); };
          laco();
          parar = () => { ativo = false; stream.getTracks().forEach(t => t.stop()); };
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const leitor = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 120 });
          const ctl = await leitor.decodeFromConstraints({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }, video.current!, (res) => { if (res) achou(res.getText()); });
          const st = video.current?.srcObject as MediaStream | null; trilha.current = st?.getVideoTracks()[0] || null;
          try { setTemLuz(!!(trilha.current as any)?.getCapabilities?.()?.torch); } catch { /* sem lanterna */ }
          parar = () => ctl.stop();
          if (!vivo) parar();
        }
      } catch (e: any) {
        setErro(/Permission|NotAllowed/i.test(String(e?.name || e?.message)) ? "Libere o acesso à câmera para o 360 nas permissões do navegador e tente de novo." : "Não consegui abrir a câmera: " + (e?.message || e));
      }
    })();
    return () => { vivo = false; parar(); };
  }, []);
  const alternarLuz = async () => { try { await (trilha.current as any)?.applyConstraints({ advanced: [{ torch: !luz }] }); setLuz(!luz); } catch { /* aparelho sem lanterna */ } };
  return createPortal(<div className="cp-cam" role="dialog" aria-label="Ler código de barras">
    <video ref={video} playsInline muted autoPlay />
    <div className="cp-mira"><i /></div>
    <div className="cp-cam-top"><b>Aponte para o código de barras da etiqueta</b>
      <span>{temLuz && <button type="button" onClick={alternarLuz}>{luz ? "🔦 Apagar" : "🔦 Lanterna"}</button>}<button type="button" onClick={onFechar}>✕ Fechar</button></span></div>
    {erro && <div className="cp-cam-erro">{erro}</div>}
  </div>, document.body);
}

export default function ConsultaProduto({ movel = false }: { movel?: boolean }) {
  const { toast } = useApp() as any;
  const [cam, setCam] = useState(false);
  const [cod, setCod] = useState(""); const [busy, setBusy] = useState(false);
  const [prod, setProd] = useState<Produto | null>(null); const [naoAchou, setNaoAchou] = useState("");
  const [form, setForm] = useState<Produto | null>(null);
  const [lista, setLista] = useState<Produto[] | null>(null); const [q, setQ] = useState("");
  const [recentes, setRecentes] = useState<string[]>([]);
  const [imp, setImp] = useState<{ nome: string; linhas: any[]; semCod: number } | null>(null); const [importando, setImportando] = useState(false);
  const inpArq = { current: null as HTMLInputElement | null };
  async function lerPlanilha(f: File | undefined) {
    if (!f) return;
    try {
      const l = await lerArquivo(f);
      const linhas = l.map(r => { const o: any = {}; COLS.forEach(([k, , nomes]) => { const v = String(col(r, ...nomes) || "").trim(); if (v) o[k] = ["altura", "profundidade", "largura", "estoque", "preco"].includes(k as string) ? numTxt(v) : v; });
        o.codigo = String(o.codigo || "").replace(/\s/g, ""); return o; });
      const ok = linhas.filter(x => x.codigo && x.nome);
      setImp({ nome: f.name, linhas: ok, semCod: linhas.length - ok.length });
    } catch (e: any) { toast("Não consegui ler a planilha: " + (e.message || e)); }
  }
  async function importar() {
    if (!imp) return; setImportando(true);
    try { const r: any = await A.produtoImportar(imp.linhas);
      toast(`${r?.novos ?? 0} produto(s) novo(s) · ${r?.atualizados ?? 0} atualizado(s)` + ((r?.erros || []).length ? ` · ${(r.erros || []).length} com erro` : ""));
      setImp(null); carregarLista(q); }
    catch (e: any) { toast(e.message); } finally { setImportando(false); }
  }
  const modelo = () => baixarXlsx("modelo-produtos", COLS.map(c => c[1]), [["1875840", "MÓDULO CLOSET DALLA COSTA 01 TORRE C/ 02 GAV TW401", "OFF WHITE BRILHO / FREIJÓ", "", "WJG", "Dalla Costa", "Módulo closet", "DALLA COSTA TW401", 220, 45, 73.5, 2, "", "", "", ""]], "Produtos");

  async function buscar(c: string) {
    const k = soCod(c); if (!k) return;
    setCod(k); setBusy(true); setForm(null); setNaoAchou(""); setProd(null);
    try { const r = await A.produtoBuscar(k); if (r) { setProd(r); setRecentes(x => [k, ...x.filter(y => y !== k)].slice(0, 8)); } else setNaoAchou(k); }
    catch (e: any) { toast(e.message || "Não consegui consultar"); }
    finally { setBusy(false); }
  }
  async function salvar() {
    if (!form) return;
    try { const k = await A.produtoSalvar(form as any); toast("Produto salvo"); setForm(null); await buscar(k || form.codigo); if (lista) carregarLista(); }
    catch (e: any) { toast(e.message || "Não consegui salvar"); }
  }
  async function carregarLista(busca = q) { try { setLista(((await A.produtoLista(busca)) || []) as Produto[]); } catch (e: any) { toast(e.message); } }
  useEffect(() => { if (!movel) carregarLista(""); }, []);
  const campo = (k: keyof Produto, l: string, extra: any = {}) => <label className={"cp-f" + (extra.largo ? " largo" : "")}>{l}
    {extra.area ? <textarea rows={4} value={(form as any)[k] ?? ""} onChange={e => setForm({ ...(form as Produto), [k]: e.target.value })} />
      : <input value={(form as any)[k] ?? ""} inputMode={extra.num ? "decimal" : undefined} onChange={e => setForm({ ...(form as Produto), [k]: e.target.value })} />}</label>;

  return <section className={movel ? "cp cp-movel" : "view active cp"}>
    {!movel && <div className="view-head"><div><h2>🏷 Consulta de produto</h2><p>Leia o código de barras da etiqueta (câmera do celular ou leitor) ou digite o número. Mostra o produto, as medidas, o acabamento, o estoque e as outras opções do mesmo produto.</p></div></div>}
    {movel && <div className="mv-sec">🏷 Consulta de produto</div>}

    <div className="cp-busca">
      <button type="button" className="btn primary cp-scan" onClick={() => setCam(true)}>📷 Ler código de barras</button>
      <form className="cp-dig" onSubmit={e => { e.preventDefault(); buscar(cod); }}>
        <input inputMode="numeric" placeholder="ou digite o código (ex.: 1875840)" value={cod} onChange={e => setCod(e.target.value)} />
        <button className="btn" type="submit" disabled={busy}>{busy ? "…" : "Buscar"}</button>
      </form>
    </div>

    {prod && !form && <div className="cp-card">
      {prod.imagem_url ? <img className="cp-img" src={prod.imagem_url} alt={prod.nome} /> : null}
      <div className="cp-nome">{prod.nome}</div>
      <div className="cp-sub">{[prod.fabricante, prod.modulo].filter(Boolean).join(" · ")}</div>
      <div className="cp-tags">
        <span className="cp-tag cod">Cód. {prod.codigo}</span>
        {prod.ref && <span className="cp-tag">REF {prod.ref}</span>}
        {prod.estoque != null && <span className={"cp-tag " + (Number(prod.estoque) > 0 ? "ok" : "zero")}>{Number(prod.estoque) > 0 ? prod.estoque + " em estoque" : "Sem estoque"}</span>}
      </div>
      {prod.cor && <div className="cp-linha"><span>Acabamento / cor</span><b>{prod.cor}</b></div>}
      {prod.tamanho && <div className="cp-linha"><span>Tamanho</span><b>{prod.tamanho}</b></div>}
      {(prod.altura != null || prod.profundidade != null || prod.largura != null) && <div className="cp-medidas">
        <div><span>Altura</span><b>{cm(prod.altura)}</b></div><div><span>Profundidade</span><b>{cm(prod.profundidade)}</b></div><div><span>Largura</span><b>{cm(prod.largura)}</b></div></div>}
      {prod.preco != null && <div className="cp-linha"><span>Preço</span><b>{fmtMoeda(Number(prod.preco))}</b></div>}
      {prod.especificacoes && <div className="cp-esp"><span>Especificações técnicas</span><div>{prod.especificacoes}</div></div>}
      {prod.obs && <div className="cp-esp"><span>Observações</span><div>{prod.obs}</div></div>}
      {(prod.variacoes || []).length > 0 && <div className="cp-var"><span>Outras opções deste produto</span>
        {(prod.variacoes || []).map(v => <button key={v.codigo} type="button" className="cp-var-it" onClick={() => buscar(v.codigo)}>
          <b>{[v.tamanho, v.cor].filter(Boolean).join(" · ") || v.nome}</b><small>Cód. {v.codigo}{v.estoque != null ? " · " + (Number(v.estoque) > 0 ? v.estoque + " em estoque" : "sem estoque") : ""}</small></button>)}</div>}
      <div className="cp-acoes"><button type="button" className="btn ghost sm" onClick={() => setForm({ ...VAZIO, ...prod })}>✏️ Editar</button>
        <button type="button" className="btn ghost sm" onClick={() => setForm({ ...VAZIO, ...prod, codigo: "", cor: "", tamanho: "", estoque: null })}>＋ Nova cor/tamanho deste produto</button></div>
    </div>}

    {naoAchou && !form && <div className="cp-card cp-nada"><b>Código {naoAchou} ainda não está cadastrado.</b>
      <span className="hint">Cadastre uma vez e, nas próximas leituras, aparece tudo.</span>
      <button type="button" className="btn primary" onClick={() => setForm({ ...VAZIO, codigo: naoAchou })}>＋ Cadastrar este produto</button></div>}

    {form && <div className="cp-card cp-form">
      <b>{form.codigo && prod && prod.codigo === form.codigo ? "Editar produto" : "Cadastrar produto"}</b>
      <div className="cp-grid">
        {campo("codigo", "Código de barras *")}
        {campo("nome", "Nome do produto *", { largo: true })}
        {campo("cor", "Acabamento / cor")}
        {campo("tamanho", "Tamanho / versão")}
        {campo("ref", "Referência (REF)")}
        {campo("fabricante", "Fabricante")}
        {campo("modulo", "Tipo / módulo")}
        {campo("grupo", "Grupo (junta as cores e tamanhos)")}
        {campo("altura", "Altura (cm)", { num: true })}
        {campo("profundidade", "Profundidade (cm)", { num: true })}
        {campo("largura", "Largura (cm)", { num: true })}
        {campo("estoque", "Estoque (unidades)", { num: true })}
        {campo("preco", "Preço (R$)", { num: true })}
        {campo("imagem_url", "Link da imagem (opcional)", { largo: true })}
        {campo("especificacoes", "Especificações técnicas", { area: true, largo: true })}
        {campo("obs", "Observações", { area: true, largo: true })}
      </div>
      <div className="cp-acoes"><button type="button" className="btn primary" onClick={salvar}>Salvar</button><button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancelar</button></div>
    </div>}

    {recentes.length > 1 && <div className="cp-rec"><span className="hint">Lidos agora:</span>{recentes.map(r => <button key={r} type="button" className="chip" onClick={() => buscar(r)}>{r}</button>)}</div>}

    {!movel && <div className="card cp-lista">
      <div className="cp-lista-cab"><b>Produtos cadastrados</b> <span className="hint">{lista ? lista.length : "…"}</span>
        <form style={{ marginLeft: "auto", display: "flex", gap: 6 }} onSubmit={e => { e.preventDefault(); carregarLista(q); }}><input type="search" placeholder="🔎 nome, código, REF" value={q} onChange={e => setQ(e.target.value)} /><button className="btn sm">Buscar</button></form>
        <button type="button" className="btn sm" onClick={() => { setProd(null); setNaoAchou(""); setForm({ ...VAZIO }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>＋ Novo produto</button>
        <label className="btn sm" style={{ cursor: "pointer" }}>⬆ Importar planilha<input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} ref={el => { inpArq.current = el; }} onChange={e => { lerPlanilha(e.target.files?.[0]); e.target.value = ""; }} /></label>
        <button type="button" className="btn ghost sm" onClick={modelo}>⬇ Modelo de planilha</button></div>
      {imp && <div className="cp-imp">
        <b>📄 {imp.nome}</b> · <b>{imp.linhas.length}</b> produto(s) prontos para importar{imp.semCod ? <span className="hint"> · {imp.semCod} linha(s) sem código ou sem descrição foram ignoradas</span> : null}
        <div className="hint">Produto com o mesmo código é atualizado; código novo é cadastrado. Colunas reconhecidas: {COLS.filter(([k]) => imp.linhas.some(x => x[k] != null && x[k] !== "")).map(c => c[1]).join(", ") || "—"}.</div>
        <div style={{ maxHeight: 220, overflow: "auto", margin: "6px 0" }}><table className="cp-tab"><thead><tr><th>Código</th><th>Descrição</th><th>Acabamento</th><th>A × P × L</th><th>Estoque</th></tr></thead>
          <tbody>{imp.linhas.slice(0, 50).map((x, i) => <tr key={i}><td>{x.codigo}</td><td>{x.nome}</td><td>{x.cor || ""}</td><td>{[x.altura, x.profundidade, x.largura].map(v => v || "—").join(" × ")}</td><td>{x.estoque ?? ""}</td></tr>)}</tbody></table>
          {imp.linhas.length > 50 && <div className="hint">… e mais {imp.linhas.length - 50}</div>}</div>
        <div className="cp-acoes"><button type="button" className="btn primary sm" disabled={importando || !imp.linhas.length} onClick={importar}>{importando ? "Importando…" : `✅ Importar ${imp.linhas.length} produto(s)`}</button><button type="button" className="btn ghost sm" onClick={() => setImp(null)}>Cancelar</button></div>
      </div>}
      <table className="cp-tab"><thead><tr><th>Código</th><th>Produto</th><th>Acabamento</th><th>A × P × L</th><th>REF</th><th>Estoque</th></tr></thead>
        <tbody>{(lista || []).map(p => <tr key={p.codigo} className="clic" onClick={() => { buscar(p.codigo); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <td><b>{p.codigo}</b></td><td>{p.nome}</td><td>{p.cor}</td><td>{[p.altura, p.profundidade, p.largura].map(x => x == null ? "—" : String(x).replace(".", ",")).join(" × ")}</td><td>{p.ref}</td><td>{p.estoque ?? "—"}</td></tr>)}</tbody></table>
      {lista && !lista.length && <div className="empty" style={{ padding: 20 }}>Nenhum produto cadastrado ainda.</div>}
    </div>}

    {cam && <LeitorCodigo onFechar={() => setCam(false)} onCodigo={c => { setCam(false); buscar(c); }} />}
  </section>;
}
