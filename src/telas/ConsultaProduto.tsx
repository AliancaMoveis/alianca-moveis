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
  ["nome", "Descrição", ["Item", "Descrição", "Descricao", "Produto", "Nome", "Nome do produto"]],
  ["cor", "Acabamento / cor", ["Grade", "Acabamento", "Cor", "Acabamento / cor", "Cores"]],
  ["tamanho", "Tamanho", ["Tamanho", "Versão", "Versao"]],
  ["ref", "REF", ["REF", "Referência", "Referencia"]],
  ["fabricante", "Fabricante", ["Fabricante", "Marca", "Fornecedor"]],
  ["modulo", "Tipo", ["Tipo", "Categoria", "Módulo", "Modulo", "Grupo de produto", "Linha"]],
  ["grupo", "Grupo (junta cores/tamanhos)", ["Grupo", "Modelo", "Família", "Familia"]],
  ["altura", "Altura (cm)", ["Altura", "A", "Altura (cm)"]],
  ["profundidade", "Profundidade (cm)", ["Profundidade", "P", "Profundidade (cm)"]],
  ["largura", "Largura (cm)", ["Largura", "L", "Largura (cm)"]],
  ["estoque", "Estoque", ["Qtde. Estoque", "Qtde Estoque", "Qtd. Estoque", "Quantidade em estoque", "Qtd", "Quantidade", "Qtde", "Estoque"]],
  ["reservas", "Reservas", ["Reservas", "Reserva", "Reservado"]],
  ["expedicao", "Em expedição", ["Em Expedição", "Expedição", "Em expedicao"]],
  ["saldo", "Saldo para venda", ["Saldo para Venda", "Saldo p/ venda", "Saldo para vendas", "Disponível", "Disponivel", "Saldo"]],
  ["deposito", "Local (Matriz = loja · Estoque 1 / Estofados = depósito)", ["Estoque", "Depósito", "Deposito", "Local"]],
  ["preco", "Preço", ["Preço", "Preco", "Valor", "Preço venda", "Preço de venda"]],
  ["especificacoes", "Especificações técnicas", ["Especificações", "Especificacoes", "Especificações técnicas", "Descrição técnica", "Detalhes"]],
  ["imagem_url", "Imagem (link)", ["Imagem", "Foto", "URL da imagem", "Link da imagem"]],
  ["obs", "Observações", ["Observações", "Observacoes", "Obs"]],
];
// fabricantes que aparecem no nome do produto (Tático não manda a coluna)
const MARCAS = ["DALLA COSTA", "LUCIANE", "ROBEL", "LINEA", "ARTELY", "HENN", "KAPPESBERG", "SIENA", "BERTOLINI", "MADESA", "ITATIAIA", "POLIMOVEIS", "RUFATO", "TUBRAX", "MOVELBENTO", "NOVO HORIZONTE", "TECNOMOBILI", "PEROBELL", "CASA D", "LINEA BRASIL"];
/** CSV do Tático: vem em Latin-1 e as quantidades com vírgula (0,929) saem sem aspas e quebram em duas colunas — junta de volta
 *  (Saldo para Venda = Qtde. Estoque − Reservas − Em Expedição decide qual junção está certa) */
async function lerCsvTatico(f: File): Promise<Record<string, string>[]> {
  const buf = await f.arrayBuffer();
  let txt = new TextDecoder("utf-8").decode(buf); if (txt.includes("\uFFFD")) txt = new TextDecoder("windows-1252").decode(buf);
  const sep = (txt.split(/\r?\n/)[0].match(/;/g) || []).length > (txt.split(/\r?\n/)[0].match(/,/g) || []).length ? ";" : ",";
  const linhas: string[][] = []; let campo = "", lin: string[] = [], aspas = false;
  for (let i = 0; i < txt.length; i++) { const ch = txt[i];
    if (aspas) { if (ch === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += ch; continue; }
    if (ch === '"') aspas = true; else if (ch === sep) { lin.push(campo); campo = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && txt[i + 1] === "\n") i++; lin.push(campo); linhas.push(lin); lin = []; campo = ""; } else campo += ch; }
  if (campo || lin.length) { lin.push(campo); linhas.push(lin); }
  const cab = (linhas.shift() || []).map(x => x.trim());
  const nomesNum = ["Qtde. Estoque", "Reservas", "Em Expedição", "Saldo para Venda"];
  const iNum = nomesNum.map(n => cab.findIndex(c => c.toLowerCase() === n.toLowerCase()));
  const tatico = sep === "," && iNum.every(i => i >= 0) && iNum.every((v, k) => k === 0 || v === iNum[k - 1] + 1);
  return linhas.filter(r => r.some(x => x.trim())).map(r => {
    if (tatico) {
      const ini = iNum[0]; const toks = r.slice(ini).filter((x, k, arr) => x.trim() !== "" || arr.slice(k).some(y => y.trim() !== "")).map(x => x.trim()).filter(x => x !== "");
      if (toks.length > 4) { // escolhe quais vizinhos juntar ("0","929" → 0,929) para fechar a conta do saldo
        const n = toks.length - 4; let melhor: string[] | null = null;
        const tenta = (pos: number, rest: number, acc: string[]) => { if (melhor) return; if (pos >= toks.length) { if (rest === 0 && acc.length === 4) { const v = acc.map(x => Number(x.replace(",", "."))); if (Math.abs(v[0] - v[1] - v[2] - v[3]) < 0.0005) melhor = acc; } return; }
          tenta(pos + 1, rest, [...acc, toks[pos]]); if (rest > 0 && pos + 1 < toks.length && /^\d{1,3}$/.test(toks[pos + 1])) tenta(pos + 2, rest - 1, [...acc, toks[pos] + "," + toks[pos + 1]]); };
        tenta(0, n, []);
        const v = melhor || toks.slice(0, 4); r = [...r.slice(0, ini), ...v];
      }
    }
    const o: Record<string, string> = {}; cab.forEach((c, k) => { if (c) o[c] = (r[k] ?? "").trim(); }); return o; });
}
const numTxt = (s: string) => String(s || "").replace(/cm/i, "").replace(/R\$/, "").trim().replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");

type Produto = { congelado?: boolean; congelado_motivo?: string; mostruario_liberado?: boolean; codigo: string; nome: string; modulo: string; grupo: string; cor: string; tamanho: string; especificacoes: string; estoque: number | null; reservas?: number | null; expedicao?: number | null; saldo?: number | null; deposito?: string; preco: number | null;
  imagem_url: string; obs: string; ref: string; fabricante: string; altura: number | null; profundidade: number | null; largura: number | null; cod_etiqueta: string; atualizado_em?: string; variacoes?: Produto[] };
/** Locais do Tático: MATRIZ = Loja; ESTOQUE 1 / LINHA PRONTA = Depósito; ESTOFADOS = Estoque Estofados. Na MATRIZ (loja), saldo 1 é o MOSTRUÁRIO: não está disponível para venda. */
const MATRIZ = /matriz/i;
// Para o vendedor são só 2 lugares: MATRIZ = Loja; ESTOQUE 1 / LINHA PRONTA / ESTOFADOS (PROMOB 10) = Depósito (os códigos internos ficam todos no depósito)
export const nomeLocal = (d: string) => MATRIZ.test(d || "") ? "Loja (Matriz)" : /estofad|linha\s*pronta|estoque\s*0*1(?!\d)/i.test(d || "") ? "Depósito" : (d || "");
type Local = { local: string; estoque?: number | null; reservas?: number | null; expedicao?: number | null; saldo?: number | null };
const ehMostr = (l: Local) => MATRIZ.test(l.local || "") && Number(l.saldo) === 1;
const saldoDe = (p: any) => p.saldo != null ? Number(p.saldo) : p.estoque != null ? Number(p.estoque) - Number(p.reservas || 0) - Number(p.expedicao || 0) : null;
export function vendavel(p: any) {
  if (!p) return { disp: null as number | null, mostruario: false, locais: [] as (Local & { disp: number | null; mostr: boolean })[] };
  const ls: Local[] = Array.isArray(p.locais) && p.locais.length ? p.locais : p.deposito || p.saldo != null || p.estoque != null ? [{ local: p.deposito || "", estoque: p.estoque, reservas: p.reservas, expedicao: p.expedicao, saldo: p.saldo }] : [];
  // mostruário liberado (gerente/TI/Gestão): a peça única da loja pode ser vendida
  const lib = !!p.mostruario_liberado;
  // junta os estoques do mesmo lugar (Estoque 1 + Estofados = Depósito), somando as quantidades
  const porLugar = new Map<string, Local>();
  ls.forEach(l => { const k = nomeLocal(l.local) || l.local || ""; const a = porLugar.get(k);
    if (!a) { porLugar.set(k, { ...l, local: MATRIZ.test(l.local || "") ? l.local : k }); return; }
    (["estoque", "reservas", "expedicao", "saldo"] as const).forEach(c => { if (l[c] != null) a[c] = Number(a[c] || 0) + Number(l[c]); }); });
  const locais = [...porLugar.values()].map(l => { const sd = saldoDe(l), mostr = ehMostr(l); return { ...l, disp: mostr && !lib ? 0 : sd, mostr }; })
    .sort((a, b) => (MATRIZ.test(a.local || "") ? 0 : 1) - (MATRIZ.test(b.local || "") ? 0 : 1));
  const comNum = locais.filter(l => l.disp != null);
  const soma = comNum.length ? comNum.reduce((t, l) => t + Number(l.disp), 0) : null;
  // tirado de venda (congelado): continua cadastrado, mas não aparece como disponível
  return { disp: p.congelado ? 0 : soma, mostruario: locais.some(l => l.mostr), mostrLiberado: lib && locais.some(l => l.mostr), congelado: !!p.congelado, locais };
}

const VAZIO: Produto = { codigo: "", nome: "", modulo: "", grupo: "", cor: "", tamanho: "", especificacoes: "", estoque: null, preco: null, imagem_url: "", obs: "", ref: "", fabricante: "", altura: null, profundidade: null, largura: null, cod_etiqueta: "" };
const soCod = (s: string) => String(s || "").replace(/\s/g, "");
/** código de preço da etiqueta: "88" + reais + "," + centavos (+ dígitos de controle). 881496,820688 → R$ 1.496,82 */
export const precoEtiqueta = (cod: string): number | null => { const m = String(cod || "").replace(/\s/g, "").match(/^88(\d+)(?:[.,](\d{1,2}))?/); if (!m) return null;
  const v = Number(m[1] + "." + (m[2] || "0").padEnd(2, "0")); return isFinite(v) && v > 0 ? v : null; };
const qtd = (n: any) => n == null || n === "" ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
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
  const { toast, R } = useApp() as any;
  const edita = R.podeEditarProduto(), libMostr = R.podeLiberarMostruario();
  async function acao(f: () => Promise<any>, msg: string, recarregar = true) {
    try { await f(); toast(msg); if (recarregar && prod) await buscar(prod.codigo); if (lista) carregarLista(); } catch (e: any) { toast(e.message || "Não consegui salvar"); }
  }
  const [cam, setCam] = useState(false);
  const [cod, setCod] = useState(""); const [busy, setBusy] = useState(false);
  const [prod, setProd] = useState<Produto | null>(null); const [naoAchou, setNaoAchou] = useState("");
  const [form, setForm] = useState<Produto | null>(null);
  const [lista, setLista] = useState<Produto[] | null>(null); const [q, setQ] = useState("");
  const [recentes, setRecentes] = useState<string[]>([]);
  // busca pelo nome: vai mostrando os produtos enquanto digita (cada palavra precisa aparecer: "mesa freijo")
  const porNome = /[a-zA-ZÀ-ú]/.test(cod) && cod.trim().length >= 2 && !prod && !form;
  const [sugs, setSugs] = useState<Produto[]>([]); const [buscandoNome, setBuscandoNome] = useState(false);
  const [soDisp, setSoDisp] = useState(true);
  useEffect(() => {
    if (!porNome) { setSugs([]); return; }
    let vivo = true; setBuscandoNome(true);
    const t = setTimeout(async () => { try { const r = ((await A.produtoLista(cod.trim())) || []) as Produto[]; if (vivo) setSugs(r); } catch { /* */ } finally { if (vivo) setBuscandoNome(false); } }, 280);
    return () => { vivo = false; clearTimeout(t); };
  }, [cod, porNome]);
  const sugsVis = sugs.map(x => ({ x, d: vendavel(x) })).filter(o => !soDisp || Number(o.d.disp) > 0)
    .sort((a, b) => (Number(b.d.disp) > 0 ? 1 : 0) - (Number(a.d.disp) > 0 ? 1 : 0) || a.x.nome.localeCompare(b.x.nome, "pt-BR")).map(o => o.x);
  function escolher(c: string) { setSugs([]); buscar(c); }
  const [imp, setImp] = useState<{ nome: string; linhas: any[]; semCod: number; projetado: number } | null>(null); const [importando, setImportando] = useState(false); const [prog, setProg] = useState(0);
  const inpArq = { current: null as HTMLInputElement | null };
  async function lerPlanilha(f: File | undefined) {
    if (!f) return;
    try {
      const l = /\.csv$/i.test(f.name) ? await lerCsvTatico(f) : await lerArquivo(f);
      const NUM = ["altura", "profundidade", "largura", "estoque", "reservas", "expedicao", "saldo", "preco"];
      const linhas = l.map(r => { const o: any = {}; COLS.forEach(([k, , nomes]) => { const v = String(col(r, ...nomes) || "").trim(); if (v) o[k] = NUM.includes(k as string) ? numTxt(v) : v; });
        // "Estoque" do Tático é o depósito (LINHA PRONTA); só vale como quantidade quando é número
        if (o.estoque != null && !/^-?\d+(\.\d+)?$/.test(String(o.estoque))) delete o.estoque;
        if (o.deposito && /^-?[\d.,]+$/.test(String(o.deposito))) delete o.deposito;
        o.codigo = String(o.codigo || "").replace(/\s/g, "");
        if (o.nome && !o.fabricante) { const m = MARCAS.find(x => new RegExp("\\b" + x + "\\b", "i").test(o.nome)); if (m) o.fabricante = m.replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w/g, c => c.toLowerCase()); }
        // medidas no nome: "73.5X220X45CM" = largura × altura × profundidade (como na etiqueta)
        if (o.nome && o.altura == null && o.largura == null) { const m = String(o.nome).match(/(\d+(?:[.,]\d+)?)\s*X\s*(\d+(?:[.,]\d+)?)\s*X\s*(\d+(?:[.,]\d+)?)\s*CM/i);
          if (m) { o.largura = m[1].replace(",", "."); o.altura = m[2].replace(",", "."); o.profundidade = m[3].replace(",", "."); } }
        return o; });
      // o mesmo código pode estar na Loja (MATRIZ) e no Depósito (LINHA PRONTA): vira um produto só, com o estoque de cada local
      const porCod = new Map<string, any>();
      // descrição com letra minúscula = linha PROJETADO (outra categoria de venda): não entra na consulta de produto.
      // Só sobem os itens com a descrição toda em CAIXA ALTA.
      const ehProjetado = (n: string) => /[a-zà-ÿ]/.test(String(n || ""));
      const projetado = linhas.filter(x => x.codigo && x.nome && ehProjetado(x.nome)).length;
      linhas.filter(x => x.codigo && x.nome && !ehProjetado(x.nome)).forEach(x => {
        const loc: Local = { local: String(x.deposito || ""), estoque: x.estoque ?? null, reservas: x.reservas ?? null, expedicao: x.expedicao ?? null, saldo: x.saldo ?? null };
        const a = porCod.get(x.codigo);
        if (!a) { porCod.set(x.codigo, { ...x, locais: [loc] }); return; }
        a.locais.push(loc);
        ["estoque", "reservas", "expedicao", "saldo"].forEach(k => { if (x[k] != null) a[k] = Number(a[k] || 0) + Number(x[k]); });
        a.deposito = [...new Set(a.locais.map((l: Local) => l.local).filter(Boolean))].join(" + ");
      });
      const ok = [...porCod.values()];
      setImp({ nome: f.name, linhas: ok, semCod: linhas.filter(x => !(x.codigo && x.nome)).length, projetado });
    } catch (e: any) { toast("Não consegui ler a planilha: " + (e.message || e)); }
  }
  async function importar() {
    if (!imp) return; setImportando(true);
    try { let nv = 0, at = 0, er = 0, pj = 0; const L = 400;
      for (let i = 0; i < imp.linhas.length; i += L) { setProg(Math.round(i / imp.linhas.length * 100)); const r: any = await A.produtoImportar(imp.linhas.slice(i, i + L)); nv += r?.novos || 0; at += r?.atualizados || 0; er += (r?.erros || []).length; pj += r?.projetado || 0; }
      toast(`${nv} produto(s) novo(s) · ${at} atualizado(s)` + (er ? ` · ${er} com erro` : "") + (pj ? ` · ${pj} da linha projetado ficaram de fora` : ""));
      setImp(null); carregarLista(q); }
    catch (e: any) { toast(e.message); } finally { setImportando(false); }
  }
  const modelo = () => baixarXlsx("modelo-produtos", COLS.map(c => c[1]), [["1875840", "MÓDULO CLOSET DALLA COSTA 01 TORRE C/ 02 GAV TW401", "OFF WHITE BRILHO / FREIJÓ", "", "WJG", "Dalla Costa", "Módulo closet", "DALLA COSTA TW401", 220, 45, 73.5, 2, "", "", "", ""]], "Produtos");

  const [precoLido, setPrecoLido] = useState<number | null>(null);
  async function buscar(c: string) {
    const k = soCod(c); if (!k) return;
    // digitou o código de preço da etiqueta (88…,…): só traduz o preço, não é código de produto
    if (/^88\d+[.,]\d/.test(k)) { setPrecoLido(precoEtiqueta(k)); setProd(null); setNaoAchou(""); return; }
    setPrecoLido(null);
    setCod(k); setBusy(true); setForm(null); setNaoAchou(""); setProd(null);
    try { const r = await A.produtoBuscar(k); if (r) { setProd(r); setRecentes(x => [k, ...x.filter(y => y !== k)].slice(0, 8)); } else setNaoAchou(k); }
    catch (e: any) { toast(e.message || "Não consegui consultar"); }
    finally { setBusy(false); }
  }
  async function salvar() {
    if (!form) return;
    // editou o estoque à mão: passa a valer o que foi digitado (o estoque por local volta na próxima planilha)
    const f: any = { ...form }; delete f.variacoes;
    const mudou = ["estoque", "reservas", "expedicao", "saldo", "deposito"].some(k => String((prod as any)?.[k] ?? "") !== String(f[k] ?? ""));
    if (!Array.isArray(f.locais) || f.locais.length <= 1 || mudou || prod?.codigo !== f.codigo) f.locais = [];
    try { const k = await A.produtoSalvar(f); toast("Produto salvo"); setForm(null); await buscar(k || form.codigo); if (lista) carregarLista(); }
    catch (e: any) { toast(e.message || "Não consegui salvar"); }
  }
  async function carregarLista(busca = q) { try { const [l, t] = await Promise.all([A.produtoLista(busca), A.produtoTotal()]); setLista((l || []) as Produto[]); setTotal(t || null); } catch (e: any) { toast(e.message); } }
  const [total, setTotal] = useState<{ total: number; congelados: number } | null>(null);
  useEffect(() => { if (!movel && edita) carregarLista(""); }, []); // a lista completa é só para quem edita (Gestão/TI)
  const campo = (k: keyof Produto, l: string, extra: any = {}) => <label className={"cp-f" + (extra.largo ? " largo" : "")}>{l}
    {extra.area ? <textarea rows={4} value={(form as any)[k] ?? ""} onChange={e => setForm({ ...(form as Produto), [k]: e.target.value })} />
      : <input value={(form as any)[k] ?? ""} inputMode={extra.num ? "decimal" : undefined} onChange={e => setForm({ ...(form as Produto), [k]: e.target.value })} />}</label>;

  return <section className={movel ? "cp cp-movel" : "view active cp"}>
    {!movel && <div className="view-head"><div><h2>🏷 Consulta de produto</h2><p>Leia o código de barras da etiqueta (câmera do celular ou leitor) ou digite o número ou o nome do produto. Mostra o produto, as medidas, o acabamento, o estoque e as outras opções do mesmo produto.</p></div></div>}
    {movel && <div className="mv-sec">🏷 Consulta de produto</div>}

    <div className="cp-busca">
      <button type="button" className="btn primary cp-scan" onClick={() => setCam(true)}>📷 Ler código de barras</button>
      <form className="cp-dig" onSubmit={e => { e.preventDefault(); if (/[a-zA-ZÀ-ú]/.test(cod)) { const d = sugsVis[0]; if (d) escolher(d.codigo); } else buscar(cod); }}>
        <input type="search" autoComplete="off" placeholder="nome do produto, código (1875840) ou código de preço (88…)" value={cod} onChange={e => { setCod(e.target.value); if (/[a-zA-ZÀ-ú]/.test(e.target.value)) { setProd(null); setNaoAchou(""); setPrecoLido(null); } }} />
        <button className="btn" type="submit" disabled={busy}>{busy ? "…" : "Buscar"}</button>
      </form>
    </div>
    {porNome && <div className="cp-sugs">
      <div className="cp-sugs-cab"><span>{buscandoNome ? "Procurando…" : sugsVis.length ? sugsVis.length + (sugsVis.length === 1 ? " produto" : " produtos") + (soDisp ? " com saldo para venda" : "") : soDisp ? "Nenhum produto com saldo para venda com esse nome" : "Nenhum produto com esse nome"}</span>
        <label><input type="checkbox" checked={soDisp} onChange={e => setSoDisp(e.target.checked)} /> só com saldo para venda</label></div>
      {sugsVis.slice(0, 60).map(x => { const d = vendavel(x); return <button key={x.codigo} type="button" className="cp-sug" onClick={() => escolher(x.codigo)}>
        <span><b>{x.nome}</b><small>{[x.cor, x.tamanho].filter(Boolean).join(" · ")}{x.cor || x.tamanho ? " · " : ""}Cód. {x.codigo}</small></span>
        <i className={d.congelado ? "cong" : Number(d.disp) > 0 ? "ok" : d.mostruario ? "mostr" : "zero"}>{d.congelado ? "fora de venda" : Number(d.disp) > 0 ? qtd(d.disp) + " disp." : d.mostruario ? "mostruário" : "sem saldo"}</i></button>; })}
      {sugsVis.length > 60 && <div className="hint" style={{ padding: 8 }}>Mostrando 60 de {sugsVis.length}. Digite mais palavras para filtrar (ex.: "mesa jantar freijo").</div>}
    </div>}

    {precoLido != null && <div className="cp-card cp-preco-lido"><span>Preço da etiqueta</span><b>{fmtMoeda(precoLido)}</b><small>preço bruto · código {cod}</small></div>}
    {prod && !form && <div className="cp-card">
      {prod.imagem_url ? <img className="cp-img" src={prod.imagem_url} alt={prod.nome} /> : null}
      <div className="cp-nome">{prod.nome}</div>
      <div className="cp-sub">{[prod.fabricante, prod.modulo].filter(Boolean).join(" · ")}</div>
      <div className="cp-tags">
        <span className="cp-tag cod">Cód. {prod.codigo}</span>
        {prod.ref && <span className="cp-tag">REF {prod.ref}</span>}
        {prod.deposito && <span className="cp-tag">{[...new Set(String(prod.deposito).split(" + ").map(nomeLocal))].sort((x, y) => (x.startsWith("Loja") ? 0 : 1) - (y.startsWith("Loja") ? 0 : 1)).join(" + ")}</span>}
      </div>
      {/* estoque é a informação principal: o saldo para venda é o que realmente dá para vender */}
      {(prod.saldo != null || prod.estoque != null || prod.reservas != null || prod.expedicao != null) && <div className="cp-estoque">
        {(() => { const v = vendavel(prod); const so = !v.congelado && v.mostruario && !v.mostrLiberado && !Number(v.disp); return <>
          <div className={"cp-saldo " + (v.congelado ? "cong" : so ? "mostr" : Number(v.disp ?? 0) > 0 ? "ok" : "zero")}><span>Saldo para venda (disponível)</span><b>{qtd(v.disp)}</b>
            <small>{v.congelado ? "🧊 TIRADO DE VENDA — não vender" + (prod.congelado_motivo ? " (" + prod.congelado_motivo + ")" : "") : so ? "só tem o MOSTRUÁRIO da loja — não está disponível para venda" : Number(v.disp ?? 0) > 0 ? "pode vender" + (v.mostrLiberado ? " (inclui o mostruário da loja, liberado para venda)" : v.mostruario ? " (o mostruário da loja não entra)" : "") : Number(v.disp ?? 0) < 0 ? "vendido além do estoque — aguardando chegada" : "sem saldo — consulte a reposição"}</small></div>
          {v.locais.some(l => l.local) && <div className="cp-locais">{v.locais.map((l, i) => <div key={i} className={"cp-local" + (l.mostr ? " mostr" : "")}>
            <b>{nomeLocal(l.local)}</b>
            <span>{l.mostr ? (v.mostrLiberado ? "1 peça · mostruário LIBERADO para venda" : "1 peça · MOSTRUÁRIO — não vender") : (Number(l.disp ?? 0) > 0 ? qtd(l.disp) + " disponível" : Number(l.disp ?? 0) < 0 ? qtd(l.disp) + " (vendido além do estoque)" : "sem saldo")}</span>
            <small>estoque {qtd(l.estoque)} · reservado {qtd(l.reservas)} · expedição {qtd(l.expedicao)}</small></div>)}</div>}
        </>; })()}
        <div className="cp-estq">
          <div><span>Em estoque</span><b>{qtd(prod.estoque)}</b><small>na loja/depósito</small></div>
          <div><span>Reservado</span><b>{qtd(prod.reservas)}</b><small>vendas esperando o produto</small></div>
          <div><span>Em expedição</span><b>{qtd(prod.expedicao)}</b><small>sendo enviado</small></div></div>
        {prod.atualizado_em && <small className="hint">Estoque atualizado em {new Date(prod.atualizado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small>}
      </div>}
      {prod.cor && <div className="cp-linha"><span>Acabamento / cor</span><b>{prod.cor}</b></div>}
      {prod.tamanho && <div className="cp-linha"><span>Tamanho</span><b>{prod.tamanho}</b></div>}
      {(prod.altura != null || prod.profundidade != null || prod.largura != null) && <div className="cp-medidas">
        <div><span>Altura</span><b>{cm(prod.altura)}</b></div><div><span>Profundidade</span><b>{cm(prod.profundidade)}</b></div><div><span>Largura</span><b>{cm(prod.largura)}</b></div></div>}
      {(prod.preco != null || precoEtiqueta(prod.cod_etiqueta) != null) && <div className="cp-preco"><span>Preço (bruto)</span><b>{fmtMoeda(Number(prod.preco ?? precoEtiqueta(prod.cod_etiqueta)))}</b>
        {prod.cod_etiqueta && <small>código na etiqueta: {prod.cod_etiqueta}</small>}</div>}
      {prod.especificacoes && <div className="cp-esp"><span>Especificações técnicas</span><div>{prod.especificacoes}</div></div>}
      {prod.obs && <div className="cp-esp"><span>Observações</span><div>{prod.obs}</div></div>}
      {(prod.variacoes || []).length > 0 && <div className="cp-var"><span>Outras opções deste produto</span>
        {(prod.variacoes || []).map(v => <button key={v.codigo} type="button" className="cp-var-it" onClick={() => buscar(v.codigo)}>
          <b>{[v.tamanho, v.cor].filter(Boolean).join(" · ") || v.nome}</b><small>Cód. {v.codigo}{(() => { const d = vendavel(v); return d.disp != null ? " · " + (Number(d.disp) > 0 ? qtd(d.disp) + " disponível" : d.congelado ? "fora de venda" : d.mostruario ? "só mostruário" : "sem saldo") : ""; })()}</small></button>)}</div>}
      {(edita || (libMostr && vendavel(prod).mostruario)) && <div className="cp-acoes">
        {edita && <button type="button" className="btn ghost sm" onClick={() => setForm({ ...VAZIO, ...prod })}>✏️ Editar</button>}
        {edita && <button type="button" className="btn ghost sm" onClick={() => setForm({ ...VAZIO, ...prod, codigo: "", cor: "", tamanho: "", estoque: null })}>＋ Nova cor/tamanho deste produto</button>}
        {libMostr && vendavel(prod).mostruario && (prod.mostruario_liberado
          ? <button type="button" className="btn ghost sm" onClick={() => acao(() => A.produtoMostruario(prod.codigo, false), "Mostruário volta a não ser vendido")}>↩ Não vender o mostruário</button>
          : <button type="button" className="btn sm" onClick={() => { if (confirm("Liberar o MOSTRUÁRIO (peça única da loja) para venda?")) acao(() => A.produtoMostruario(prod.codigo, true), "Mostruário liberado para venda"); }}>✅ Liberar mostruário para venda</button>)}
        {edita && (prod.congelado
          ? <button type="button" className="btn sm" onClick={() => acao(() => A.produtoVenda(prod.codigo, true), "Produto liberado para venda")}>✅ Liberar para venda</button>
          : <button type="button" className="btn ghost sm" onClick={() => { const m = prompt("Tirar de venda (congelar) — motivo (opcional):", ""); if (m !== null) acao(() => A.produtoVenda(prod.codigo, false, m), "Produto tirado de venda"); }}>🧊 Tirar de venda</button>)}
        {edita && <button type="button" className="btn danger sm" onClick={() => { if (confirm("Excluir o produto " + prod.codigo + " — " + prod.nome + "?\nEle sai da base (se vier de novo numa planilha, volta a ser cadastrado).")) acao(async () => { await A.produtoExcluir(prod.codigo); setProd(null); }, "Produto excluído", false); }}>🗑 Excluir</button>}
      </div>}
    </div>}

    {naoAchou && !form && <div className="cp-card cp-nada"><b>Código {naoAchou} ainda não está cadastrado.</b>
      <span className="hint">Cadastre uma vez e, nas próximas leituras, aparece tudo.</span>
      {edita ? <button type="button" className="btn primary" onClick={() => setForm({ ...VAZIO, codigo: naoAchou })}>＋ Cadastrar este produto</button> : <span className="hint">Avise o TI (Alexandre) para cadastrar.</span>}</div>}

    {form && edita && <div className="cp-card cp-form">
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
        {campo("estoque", "Em estoque", { num: true })}
        {campo("reservas", "Reservado", { num: true })}
        {campo("expedicao", "Em expedição", { num: true })}
        {campo("saldo", "Saldo para venda", { num: true })}
        {campo("deposito", "Local (Matriz = loja · Estoque 1 / Estofados = depósito)")}
        <label className="cp-f">Código de preço da etiqueta (88…)<input value={form.cod_etiqueta ?? ""} placeholder="ex.: 881496,820688" onChange={e => { const v = e.target.value; const pr = precoEtiqueta(v); setForm({ ...(form as Produto), cod_etiqueta: v, ...(pr != null ? { preco: pr as any } : {}) }); }} />
          {precoEtiqueta(form.cod_etiqueta) != null && <small style={{ color: "var(--st-concluida)", fontWeight: 700 }}>= {fmtMoeda(precoEtiqueta(form.cod_etiqueta) as number)}</small>}</label>
        {campo("preco", "Preço bruto (R$)", { num: true })}
        {campo("imagem_url", "Link da imagem (opcional)", { largo: true })}
        {campo("especificacoes", "Especificações técnicas", { area: true, largo: true })}
        {campo("obs", "Observações", { area: true, largo: true })}
      </div>
      <div className="cp-acoes"><button type="button" className="btn primary" onClick={salvar}>Salvar</button><button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancelar</button></div>
    </div>}

    {recentes.length > 1 && <div className="cp-rec"><span className="hint">Lidos agora:</span>{recentes.map(r => <button key={r} type="button" className="chip" onClick={() => buscar(r)}>{r}</button>)}</div>}

    {!movel && edita && <div className="card cp-lista">
      <div className="cp-lista-cab"><b>Produtos cadastrados</b> <span className="cp-total">{total ? Number(total.total).toLocaleString("pt-BR") : "…"}</span>{total && Number(total.congelados) > 0 ? <span className="hint">· {total.congelados} fora de venda</span> : null}{lista && total && lista.length < Number(total.total) ? <span className="hint">· mostrando {lista.length}{lista.length >= 300 ? " (busque pelo nome/código para achar os outros)" : " na busca"}</span> : null}
        <form style={{ marginLeft: "auto", display: "flex", gap: 6 }} onSubmit={e => { e.preventDefault(); carregarLista(q); }}><input type="search" placeholder="🔎 nome, código, REF" value={q} onChange={e => setQ(e.target.value)} /><button className="btn sm">Buscar</button></form>
        {edita && <><button type="button" className="btn sm" onClick={() => { setProd(null); setNaoAchou(""); setForm({ ...VAZIO }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>＋ Novo produto</button>
        <label className="btn sm" style={{ cursor: "pointer" }}>⬆ Importar planilha<input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} ref={el => { inpArq.current = el; }} onChange={e => { lerPlanilha(e.target.files?.[0]); e.target.value = ""; }} /></label>
        <button type="button" className="btn ghost sm" onClick={modelo}>⬇ Modelo de planilha</button></>}</div>
      {imp && <div className="cp-imp">
        <b>📄 {imp.nome}</b> · <b>{imp.linhas.length}</b> produto(s) prontos para importar{imp.semCod ? <span className="hint"> · {imp.semCod} linha(s) sem código ou sem descrição foram ignoradas</span> : null}{imp.projetado ? <span className="hint"> · <b>{imp.projetado}</b> item(ns) da linha projetado (descrição em letras minúsculas) ficaram de fora</span> : null}
        <div className="hint">Produto com o mesmo código é atualizado; código novo é cadastrado. Colunas reconhecidas: {COLS.filter(([k]) => imp.linhas.some(x => x[k] != null && x[k] !== "")).map(c => c[1]).join(", ") || "—"}.</div>
        <div style={{ maxHeight: 220, overflow: "auto", margin: "6px 0" }}><table className="cp-tab"><thead><tr><th>Código</th><th>Descrição</th><th>Acabamento</th><th>A × P × L</th><th>Estoque</th><th>Saldo p/ venda</th></tr></thead>
          <tbody>{imp.linhas.slice(0, 50).map((x, i) => <tr key={i}><td>{x.codigo}</td><td>{x.nome}</td><td>{x.cor || ""}</td><td>{[x.altura, x.profundidade, x.largura].map(v => v || "—").join(" × ")}</td><td>{x.estoque ?? ""}</td><td>{x.saldo ?? ""}</td></tr>)}</tbody></table>
          {imp.linhas.length > 50 && <div className="hint">… e mais {imp.linhas.length - 50}</div>}</div>
        <div className="cp-acoes"><button type="button" className="btn primary sm" disabled={importando || !imp.linhas.length} onClick={importar}>{importando ? `Importando… ${prog}%` : `✅ Importar ${imp.linhas.length} produto(s)`}</button><button type="button" className="btn ghost sm" onClick={() => setImp(null)}>Cancelar</button></div>
      </div>}
      <table className="cp-tab"><thead><tr><th>Código</th><th>Produto</th><th>Acabamento</th><th>A × P × L</th><th>REF</th><th>Saldo p/ venda</th></tr></thead>
        <tbody>{(lista || []).map(p => <tr key={p.codigo} className="clic" onClick={() => { buscar(p.codigo); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <td><b>{p.codigo}</b></td><td>{p.nome}</td><td>{p.cor}</td><td>{[p.altura, p.profundidade, p.largura].map(x => x == null ? "—" : String(x).replace(".", ",")).join(" × ")}</td><td>{p.ref}</td><td>{(() => { const d = vendavel(p); return d.congelado ? <span>🧊 fora de venda</span> : d.mostruario && !Number(d.disp) ? <span title="Na loja (matriz), saldo 1 é mostruário">0 · mostruário</span> : qtd(d.disp); })()}</td></tr>)}</tbody></table>
      {lista && !lista.length && <div className="empty" style={{ padding: 20 }}>Nenhum produto cadastrado ainda.</div>}
    </div>}

    {cam && <LeitorCodigo onFechar={() => setCam(false)} onCodigo={c => { setCam(false); buscar(c); }} />}
  </section>;
}
