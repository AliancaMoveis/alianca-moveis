// Carrega do Supabase tudo o que o usuário logado pode ver (o RLS filtra) e monta
// o mesmo formato de `state` do protótipo, para que as regras portadas funcionem igual.
import { sb } from "./supabase";

export type Anexo = { id?: string; tipo: "img" | "link" | "video" | "pdf"; nome: string; url: string; path?: string | null; criadoPor?: string | null };
export type Chamado = any;
export type Usuario = { id: string; nome: string; email?: string; setores: string[]; somenteAtribuidos: boolean; ativo: boolean; fazProjeto?: boolean; folga?: number | null; turno?: string | null; nomeCompleto?: string | null; telefone?: string | null; feriasDe?: string | null; feriasAte?: string | null; editaAgenda?: boolean; domingoRef?: string | null; naAgenda?: boolean; acessos?: string[]; avisosOff?: string[] };
export type Setor = { id: string; nome: string; liberacoes: Record<string, boolean> };
export type Estado = {
  setores: Setor[];
  usuarios: Usuario[];
  representantes: any[];
  fabricas: any[];
  chamados: Chamado[];
  tipos: Record<string, any>;
  config: { comissaoPct: number; pagamentoVisita: number; valorVendaMkt?: number; modoTeste?: boolean; auxilioFixo?: number; diaAuxilio?: number; checklistAgenda?: any; googleReview?: string; escalaDomingos?: Record<string, string> };
  montadores: Montador[];
  reembolsos: Reembolso[];
  /** cruzamento Minha Visita × Exact, por nº de venda (setor de Medidas) */
  medidasCruz?: Record<string, MedidaCruz>;
  /** períodos com a agenda do checklist fechada (feriado, folga, consulta…); projetista "" = todos */
  ckBloqueios?: CkBloqueio[];
  consBloqueios?: { id: number; tipo: string; usuarioId: string; de: string; ate: string; periodo: string; ini: string; fim: string; motivo: string; obs: string; criadoPor: string }[];
  vendedorDias?: Record<string, Record<string, string>>;
  /** nº oficial de visitas por ciclo de pagamento (29 → 28), lançado pela Gestão — vale para o pagamento de R$ por visita */
  visitasCiclo?: VisitaCiclo[];
};
export type VisitaCiclo = { id: number; ciclo: string; usuarioId: string; pessoa: string; papel: string; visitas: number; obs: string; atualizadoEm: string };
export type CkBloqueio = { id: number; projetista: string; inicio: string; fim: string; motivo: string; obs: string; criadoPor: string };
export type MedidaCruz = { venda: string; comprador: string; telefone: string; visitado: string; consultor: string; statusMv: string; visitaEm: string; medidor: string; situacao: string; resultado: "ok" | "sem"; tratativa: string; obs: string; cruzadoEm: string; atualizadoEm: string; atualizadoPor: string };
export type Reembolso = { id: string; usuarioId: string; chamadoId: string; data: string; tipo: string; valor: number; descricao: string; path: string; status: string; criadoEm: string; decididoEm: string; motivo: string };
export type Montador = { id: string; nome: string; telefone: string; regiao: string; ativo: boolean; conta?: any };

function competencia(dv: string, reg: string) {
  if (!dv || !reg) return { dataVenda: dv, dataVendaReal: dv };
  const r = new Date(reg); const regMes = `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, "0")}`;
  return dv.slice(0, 7) < regMes ? { dataVenda: regMes + "-01", dataVendaReal: dv } : { dataVenda: dv, dataVendaReal: dv };
}

// ordem precisa ser ÚNICA para paginar: com empate (ex.: chamados importados no mesmo instante), o banco pode
// devolver a mesma linha em duas páginas e pular outra — e cada pessoa via um total diferente.
//
// Páginas grandes de propósito: a regra de permissão do banco é conferida UMA vez por pedido, varrendo todos os
// chamados. Com páginas de 1.000 isso se repetia 30+ vezes por tela e estourava o limite de 8s do banco — a tela
// vinha vazia com "canceling statement due to statement timeout". Com 10.000, são 3 ou 4 pedidos.
//
// Avança pelo número de linhas que REALMENTE vieram (se o servidor tiver um teto menor por pedido, continua certo)
// e só para quando um pedido volta vazio — nunca por supor que a página veio curta.
const PASSOS = [10000, 5000, 2000, 500];
/** quantas linhas o servidor entrega de fato por pedido — descoberto uma vez e reaproveitado */
let tetoServidor = 0;
async function todos<T = any>(tabela: string, colunas = "*", ordem?: string, desempate?: string): Promise<T[]> {
  const out: T[] = [];
  let nivel = 0, de = 0;
  for (;;) {
    const passo = PASSOS[nivel];
    let q = sb.from(tabela).select(colunas).range(de, de + passo - 1);
    if (ordem) q = q.order(ordem, { ascending: true });
    if (desempate && desempate !== ordem) q = q.order(desempate, { ascending: true });
    const { data, error } = await q;
    if (error) {
      // banco sobrecarregado (estouro de tempo): tenta de novo com página menor em vez de deixar a tela vazia
      const demorou = /timeout|57014|canceling statement/i.test(error.message || "");
      if (demorou && nivel < PASSOS.length - 1) { nivel++; await new Promise(r => setTimeout(r, 400)); continue; }
      throw error;
    }
    const n = (data as T[] | null)?.length || 0;
    if (n) { out.push(...(data as T[])); de += n; }
    if (n >= passo) { if (passo > tetoServidor) tetoServidor = passo; continue; }   // página cheia: tem mais
    // página curta: acabou — a não ser que o servidor tenha um teto menor por pedido e ainda não saibamos qual
    if (!n || (tetoServidor && n < tetoServidor)) break;
    tetoServidor = n;   // primeira página curta sem teto conhecido: confere com mais um pedido
  }
  return out;
}

const hora = (v: string | null) => (v ? String(v).slice(0, 16) : "");
export const fmtValor = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// cache de URLs assinadas das fotos (evita baixar de novo a cada atualização).
// Fica guardado no navegador: antes vivia só na memória, então cada F5 mandava o banco
// assinar tudo de novo — conferindo permissão foto por foto — e o 360 travava.
const CHAVE_CACHE = "a360:urls";
const TETO_CACHE = 1500;   // só o que foi visto de verdade; o resto é assinado quando aparece na tela
const cacheUrl = new Map<string, { url: string; exp: number }>();
try {
  const g = JSON.parse(localStorage.getItem(CHAVE_CACHE) || "[]");
  const agora = Date.now();
  if (Array.isArray(g)) g.forEach((x: any) => { if (x && x.p && x.u && x.e > agora) cacheUrl.set(x.p, { url: x.u, exp: x.e }); });
} catch { /* navegador sem localStorage ou cache corrompido: segue sem */ }
let salvando: any = null;
function guardarCache() {
  clearTimeout(salvando);
  salvando = setTimeout(() => {
    try {
      const agora = Date.now();
      const l = Array.from(cacheUrl.entries()).filter(([, v]) => v.exp > agora).slice(-TETO_CACHE)
        .map(([p, v]) => ({ p, u: v.url, e: v.exp }));
      localStorage.setItem(CHAVE_CACHE, JSON.stringify(l));
    } catch { /* cota cheia: o cache em memória continua valendo nesta sessão */ }
  }, 1500);
}
// Assina em lotes pequenos: um pedido com mais de mil fotos estourava o tempo do banco (permissão conferida foto a foto)
// e voltava sem nenhuma URL — as imagens apareciam quebradas e o .zip saía vazio.
async function assinarLote(lote: string[], agora: number) {
  for (let t = 0; t < 2; t++) {
    const { data, error } = await sb.storage.from("anexos").createSignedUrls(lote, 3600);
    if (!error) { (data || []).forEach(d => { if (d.signedUrl && d.path) cacheUrl.set(d.path, { url: d.signedUrl, exp: agora + 50 * 60 * 1000 }); }); guardarCache(); return; }
    await new Promise(r => setTimeout(r, 600));
  }
}
export async function assinar(paths: string[]) {
  const agora = Date.now();
  const faltam = Array.from(new Set(paths.filter(p => { const c = cacheUrl.get(p); return !c || c.exp < agora; })));
  const lotes: string[][] = []; for (let i = 0; i < faltam.length; i += 100) lotes.push(faltam.slice(i, i + 100));
  for (let i = 0; i < lotes.length; i += 4) await Promise.all(lotes.slice(i, i + 4).map(l => assinarLote(l, agora).catch(() => null)));
  // o que ainda ficou sem URL: uma a uma
  const resto = faltam.filter(p => !cacheUrl.has(p)).slice(0, 200);
  for (let i = 0; i < resto.length; i += 6) await Promise.all(resto.slice(i, i + 6).map(p => urlAnexo(p).catch(() => "")));
}
/** foto quebrada na tela (URL vencida depois de horas com o 360 aberto): pede uma URL nova e recarrega a imagem */
export function consertarFotosQuebradas() {
  // Duas tentativas por imagem:
  //  1ª  o link assinado venceu → pede um novo.
  //  2ª  o navegador não DECODIFICA o arquivo. É o caso do HEIC que a câmera Samsung em
  //      "Alta eficiência" grava com nome .jpg: subiu cru e nenhum Android/Edge abre. Aqui
  //      o arquivo é baixado, convertido para JPEG na hora e mostrado. Conserta o que já
  //      está no armazenamento sem pedir para ninguém reenviar nada.
  const tentativas = new WeakMap<HTMLImageElement, number>();
  document.addEventListener("error", (ev) => {
    const el = ev.target as HTMLImageElement;
    if (!el || el.tagName !== "IMG") return;
    const n = tentativas.get(el) || 0;
    if (n >= 2) return;
    const m = (el.currentSrc || el.src || "").match(/\/object\/sign\/anexos\/([^?]+)/);
    if (!m) return;
    tentativas.set(el, n + 1);
    const path = decodeURIComponent(m[1]);
    if (n === 0) { cacheUrl.delete(path); urlAnexo(path).then(u => { if (u) el.src = u; }).catch(() => null); return; }
    (async () => {
      try {
        const u = await urlAnexo(path); if (!u) return;
        const b = await (await fetch(u)).blob();
        const { ehHeic, heicParaJpeg } = await import("./acoes");
        if (!(await ehHeic(b))) return;
        const j = await heicParaJpeg(b, 0.85); if (!j) return;
        el.src = URL.createObjectURL(j);
      } catch { /* não deu: a imagem fica quebrada como estava */ }
    })();
  }, true);
}
/** URL de um anexo na hora (quando a lista veio sem URL ou ela venceu) */
export async function urlAnexo(path: string): Promise<string> {
  if (!path) return "";
  const c = cacheUrl.get(path); if (c && c.exp > Date.now()) return c.url;
  const { data } = await sb.storage.from("anexos").createSignedUrl(path, 3600);
  if (data?.signedUrl) { cacheUrl.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 }); guardarCache(); }
  return data?.signedUrl || "";
}

// logo após o login o token pode chegar alguns segundos "no futuro" para o banco (relógios); tenta de novo
export async function carregarEstado(completo = false, tentativa = 0): Promise<Estado> {
  try { return await carregarEstadoUmaVez(completo); }
  catch (e: any) {
    if (tentativa < 4 && /issued at future|JWT|fetch/i.test(String(e?.message || e))) {
      await new Promise(r => setTimeout(r, 1500 * (tentativa + 1)));
      return carregarEstado(completo, tentativa + 1);
    }
    throw e;
  }
}

type Bruto = { chamados: any[]; historico: any[]; anexos: any[]; vendas: any[]; valores: any[]; itens: any[] };
/** última carga crua guardada aqui, para as próximas trazerem só a diferença */
let bruto: Bruto | null = null;
/** relógio DO BANCO da última carga (nunca o do computador, que pode estar adiantado) */
let ate: string | null = null;
/** recomeça do zero na próxima carga (troca de usuário, erro) */
export function esquecerCarga() { bruto = null; ate = null; }

// Mescla a diferença: os clientes que vieram são substituídos por inteiro — eles e tudo o que é deles
// (histórico, anexos, venda, valores, itens). Assim o que foi apagado some junto, sem precisar de controle
// de exclusão. `ids` é a lista do que a pessoa pode ver agora: o que saiu dela é descartado.
function mesclar(a: Bruto, d: any): Bruto {
  const mud = new Set<string>((d.chamados || []).map((c: any) => String(c.id)));
  const vis: Set<string> | null = Array.isArray(d.ids) ? new Set(d.ids.map(String)) : null;
  const fica = (id: any) => !mud.has(String(id)) && (!vis || vis.has(String(id)));
  const junta = (velho: any[], novo: any[], campo: string, ordem?: (x: any, y: any) => number) => {
    const out = velho.filter(x => fica(x[campo])).concat(novo || []);
    return ordem ? out.sort(ordem) : out;
  };
  const porData = (k: string) => (x: any, y: any) => String(x[k] || "").localeCompare(String(y[k] || ""));
  return {
    chamados: junta(a.chamados, d.chamados, "id", porData("criado_em")),
    historico: junta(a.historico, d.historico, "chamado_id", (x, y) => Number(x.id) - Number(y.id)),
    anexos: junta(a.anexos, d.anexos, "chamado_id", porData("criado_em")),
    vendas: junta(a.vendas, d.vendas, "chamado_id"),
    valores: junta(a.valores, d.valores, "chamado_id"),
    itens: junta(a.itens, d.itens, "chamado_id", porData("registrado_em")),
  };
}

// Carga principal numa chamada só ao banco (a permissão de cada chamado é avaliada uma vez).
// Da segunda vez em diante pede só o que mudou desde a anterior: montar o JSON de 7.700 clientes +
// 35.000 linhas de histórico levava ~4 s e ~24 MB POR ATUALIZAÇÃO, de cada aba aberta — era o que travava
// o sistema nos horários cheios. Se a função não existir ou falhar, cai no modo antigo (tudo, tabela a tabela).
async function principal(): Promise<Bruto> {
  const { data, error } = await sb.rpc("carregar_principal", bruto && ate ? { p_desde: ate } : {});
  if (!error && data) {
    let d = data as any;
    // cliente que passou a ser visível sem ter mudado (mudou a permissão da pessoa, não o cliente):
    // ele vem na lista de ids e não nos dados. Aí não dá para remendar — busca tudo de novo.
    if (d.parcial && bruto && Array.isArray(d.ids)) {
      const tem = new Set(bruto.chamados.map((c: any) => String(c.id)));
      (d.chamados || []).forEach((c: any) => tem.add(String(c.id)));
      if (d.ids.some((i: any) => !tem.has(String(i)))) {
        const r = await sb.rpc("carregar_principal", {});
        if (!r.error && r.data) d = r.data as any;
      }
    }
    bruto = d.parcial && bruto ? mesclar(bruto, d)
      : { chamados: d.chamados || [], historico: d.historico || [], anexos: d.anexos || [], vendas: d.vendas || [], valores: d.valores || [], itens: d.itens || [] };
    if (d.ate) ate = String(d.ate);
    return bruto;
  }
  const [chamados, vendas, valores, historico, anexos, itens] = await Promise.all([
    todos("chamados", "*", "criado_em", "id"), todos("vendas", "*", "chamado_id"), todos("vendas_valores", "*", "chamado_id"),
    todos("historico", "chamado_id,quando,quem_nome,texto,id", "id"), todos("anexos", "id,chamado_id,tipo,nome,url,storage_path,criado_em,criado_por", "criado_em", "id"),
    todos("venda_itens", "*", "registrado_em", "id").catch(() => []),
  ]);
  bruto = { chamados, historico, anexos, vendas, valores, itens }; ate = null;
  return bruto;
}

// Tabelas pequenas que quase nunca mudam (setores, usuários, fábricas, config…): na atualização de fundo
// são reaproveitadas por até 2 min. Toda ação da própria pessoa pede completo e busca tudo de novo,
// então ninguém deixa de ver o que acabou de cadastrar.
let apoio: any[] | null = null; let apoioEm = 0;
const APOIO_MS = 120000;
async function carregarEstadoUmaVez(completo = false): Promise<Estado> {
  const usarCache = !completo && !!apoio && Date.now() - apoioEm < APOIO_MS;
  const [P, apoioAgora] = await Promise.all([principal(), usarCache ? Promise.resolve(apoio!) : buscarApoio()]);
  if (!usarCache) { apoio = apoioAgora; apoioEm = Date.now(); }
  const [setores, tipos, usuarios, us, reps, fabs, cfg, transf, montadores, posvenda, reemb, mcruz, bloqs, vdias, mconta, cbloq, viscic, vtemp, uacess] = apoioAgora as any[];
  return montar({ P, setores, tipos, usuarios, us, reps, fabs, cfg, transf, montadores, posvenda, reemb, mcruz, bloqs, vdias, mconta, cbloq, viscic, vtemp, uacess });
}

/** as tabelas de apoio, na ordem em que carregarEstadoUmaVez as desmonta */
function buscarApoio(): Promise<any[]> {
  return Promise.all([
    todos("setores", "*", "ordem"),
    todos("tipos", "*", "ordem"),
    todos("usuarios", "id,nome,email,somente_atribuidos,ativo,criado_em,faz_projeto,folga,turno,nome_completo,telefone,ferias_de,ferias_ate,edita_agenda,domingo_ref,na_agenda,freelancer,menus_ocultos,escala_dom", "criado_em"),
    todos("usuario_setores", "*", "ordem"),
    todos("representantes", "*", "criado_em"),
    todos("fabricas", "*", "criado_em"),
    sb.from("config").select("*").maybeSingle(),
    todos("transferencias", "*", "quando"),
    todos("montadores", "*", "nome"),
    todos("posvenda", "*"), // só o setor Pós-venda e a Gestão recebem linhas (RLS)
    todos("reembolsos", "*", "criado_em").catch(() => []), // o próprio pedido ou a Gestão (RLS)
    todos("medidas_cruzamento", "*", "venda").catch(() => []), // Medidas e Checklist (RLS)
    todos("checklist_bloqueios", "*", "inicio").catch(() => []), // agenda fechada do checklist (RLS)
    todos("vendedor_dias", "*", "dia").catch(() => []), // trocas de folga dos vendedores
    todos("montadores_conta", "*").catch(() => []), // conta de pagamento do montador — só Pós-venda e Gestão (RLS)
    todos("consultor_bloqueios", "*", "de").catch(() => []), // agenda fechada dos consultores (o próprio, Gestão e supervisões)
    todos("visitas_ciclo", "*", "ciclo").catch(() => []), // nº oficial de visitas por ciclo (Gestão lança; o próprio vê o dele)
    todos("vendas_temp", "*", "data", "id").catch(() => []), // vendas lançadas só para a Gestão conferir (RLS: só Gestão) — não geram comissão nem aviso
    todos("usuario_acessos", "usuario_id,acesso").catch(() => []), // acessos extras por pessoa (o próprio e a Gestão)
  ]);
}

async function montar(d: any): Promise<Estado> {
  const { P, setores, tipos, usuarios, us, reps, fabs, cfg, transf, montadores, posvenda, reemb, mcruz, bloqs, vdias, mconta, cbloq, viscic, vtemp, uacess } = d;
  const { chamados, vendas, valores, historico: hist, anexos } = P; const proms = P.itens;
  // lançamentos da venda: nºs pagos, promissórias (com saldo) e pagamentos de promissória
  const itensDe: Record<string, any[]> = {};
  (proms as any[]).forEach((i: any) => (itensDe[i.chamado_id] = itensDe[i.chamado_id] || []).push({
    id: i.id, tipo: i.tipo, numero: i.numero, valor: Number(i.valor), dataVenda: i.data_venda || "", vencimento: i.vencimento || "", status: i.status,
    valorPago: Number(i.valor_pago) || 0, promissoriaId: i.promissoria_id || "", registradoEm: i.registrado_em, decididoEm: i.decidido_em || "" }));
  // vendas temporárias (só a Gestão recebe as linhas): entram como nº pago efetivado, marcadas temp — somam no efetivado, fora da comissão
  const vendaTempDe: Record<string, any> = {};
  (vtemp as any[]).forEach((t: any) => {
    (itensDe[t.chamado_id] = itensDe[t.chamado_id] || []).push({ id: "temp-" + t.id, tipo: "pago", numero: String(t.numero), valor: Number(t.valor), dataVenda: t.data, vencimento: "", status: "efetivada",
      valorPago: 0, promissoriaId: "", registradoEm: t.criado_em, decididoEm: t.data + "T12:00:00", temp: true, obs: t.obs || "" });
    vendaTempDe[t.chamado_id] = vendaTempDe[t.chamado_id] || { numero: String(t.numero), data_venda: t.data, decidido_em: t.data + "T12:00:00", registrado_em: t.criado_em, status: "efetivada", vendedor: "", temp: true, soma: 0 };
    vendaTempDe[t.chamado_id].soma += Number(t.valor) || 0;
  });
  // promissórias no formato usado pelas telas: aberta (validada com saldo), quitada, pendente (a validar), cancelada
  const promDe: Record<string, any[]> = {};
  Object.entries(itensDe).forEach(([k, l]) => (promDe[k] = l.filter(i => i.tipo === "promissoria").map(i => ({
    ...i, saldo: Math.max(0, i.valor - i.valorPago),
    status: i.status === "cancelada" ? "cancelada" : i.status === "registrada" ? "pendente" : i.valor - i.valorPago > 0.004 ? "aberta" : "quitada",
    quitadaEm: (l.filter(x => x.promissoriaId === i.id && x.status === "efetivada").map(x => x.dataVenda).sort().pop()) || "" }))));
  const pvDe: Record<string, any> = {};
  posvenda.forEach((p: any) => (pvDe[p.chamado_id] = {
    origem: p.origem, categoria: p.categoria, responsabilidade: p.responsabilidade || "analise", pecaAfetada: p.peca_afetada || "",
    situacao: p.situacao || "", projetistaChecklist: p.projetista_checklist || "",
    montadorId: p.montador_id || "", medidorResp: p.medidor_resp || "", checklistResp: p.checklist_resp || "",
    ocorrido: p.ocorrido, solucao: p.solucao, custo: Number(p.custo) || 0, custoDesc: p.custo_desc, descontoMontador: Number(p.desconto_montador) || 0,
    atualizadoEm: p.atualizado_em, atualizadoPor: p.atualizado_por,
    paradoObra: !!p.parado_obra, prazo: p.prazo || "", desfecho: p.desfecho || "",
    reembolsoStatus: p.reembolso_status || "", reembolsoValor: Number(p.reembolso_valor) || 0, reembolsoPagoEm: p.reembolso_pago_em || "",
    descontoStatus: p.desconto_status || "", descontoEm: p.desconto_em || "",
  }));

  // Antes isto assinava a URL de TODAS as fotos de TODOS os tickets a cada carregamento —
  // quase 10 mil, com o Storage conferindo permissão uma por uma. Era a causa das travadas.
  // Agora só os anexos que viram link (PDF e vídeo), que não têm como se consertar depois;
  // as fotos são assinadas quando entram na tela (ver comp/FotoAnexo).
  const paths = anexos.filter((a: any) => a.storage_path && a.tipo !== "img").map((a: any) => a.storage_path);
  let assinando: Promise<void> | null = null;
  if (paths.length) {
    assinando = assinar(paths).catch(() => null) as Promise<void>;
    await Promise.race([assinando, new Promise(r => setTimeout(r, 2500))]);
  }

  const setoresDe: Record<string, string[]> = {};
  us.forEach((x: any) => (setoresDe[x.usuario_id] = setoresDe[x.usuario_id] || []).push(x.setor_id));

  const vendaDe: Record<string, any> = {};
  vendas.forEach((v: any) => (vendaDe[v.chamado_id] = v));
  const valorDe: Record<string, number> = {};
  valores.forEach((v: any) => (valorDe[v.chamado_id] = Number(v.valor)));
  const entradaDe: Record<string, number> = {};
  valores.forEach((v: any) => (entradaDe[v.chamado_id] = Number(v.entrada) || 0));
  const entInfDe: Record<string, number> = {};
  valores.forEach((v: any) => (entInfDe[v.chamado_id] = Number(v.entrada_informada) || 0));
  const trDe: Record<string, any> = {};
  transf.forEach((t: any) => { if (t.status === "pendente") trDe[t.chamado_id] = t; });
  const histDe: Record<string, any[]> = {};
  hist.forEach((h: any) => (histDe[h.chamado_id] = histDe[h.chamado_id] || []).push({ quando: h.quando, quem: h.quem_nome, texto: h.texto }));
  const anxDe: Record<string, Anexo[]> = {};
  anexos.forEach((a: any) => (anxDe[a.chamado_id] = anxDe[a.chamado_id] || []).push({
    id: a.id, tipo: a.tipo, nome: a.nome, path: a.storage_path, criadoPor: a.criado_por || null,
    url: a.storage_path ? (cacheUrl.get(a.storage_path)?.url || "") : a.url,
  }));

  const tiposMap: Record<string, any> = {};
  tipos.forEach((t: any) => (tiposMap[t.id] = { nome: t.nome, destino: t.setor_destino, anexos: t.anexos, presale: t.presale, direto: t.direto, rapido: !!t.rapido }));

  const estado: Estado = {
    setores: setores.map((s: any) => ({
      id: s.id, nome: s.nome,
      liberacoes: { criar: s.lib_criar, verTudo: s.lib_ver_tudo, cadastros: s.lib_cadastros, admin: s.lib_admin, verMarketing: s.lib_ver_marketing, viaCallcenter: !!s.via_callcenter },
    })),
    usuarios: usuarios.map((u: any) => ({ id: u.id, nome: u.nome, email: u.email, setores: setoresDe[u.id] || [], somenteAtribuidos: u.somente_atribuidos, ativo: u.ativo, fazProjeto: u.faz_projeto !== false, folga: u.folga ?? null, turno: u.turno || null, nomeCompleto: u.nome_completo || null, telefone: u.telefone || null, feriasDe: u.ferias_de || null, feriasAte: u.ferias_ate || null, editaAgenda: !!u.edita_agenda, domingoRef: u.domingo_ref || null, naAgenda: u.na_agenda !== false, menusOcultos: u.menus_ocultos || [], avisosOff: u.avisos_off || [], acessos: (uacess as any[]).filter((a: any) => a.usuario_id === u.id).map((a: any) => a.acesso), freelancer: !!u.freelancer, escalaDom: u.escala_dom || null })),
    representantes: reps.map((r: any) => ({ id: r.id, nome: r.nome, whats: r.whats, email: r.email })).sort((a: any, b: any) => String(a.nome || "").trim().localeCompare(String(b.nome || "").trim(), "pt-BR", { sensitivity: "base", numeric: true })),
    fabricas: fabs.map((f: any) => ({ id: f.id, nome: f.nome, emails: f.emails, repId: f.representante_id || "", ipi: f.ipi == null ? 5 : Number(f.ipi), frete: f.frete == null ? 8 : Number(f.frete), apelidos: f.apelidos || "" })).sort((a: any, b: any) => { const na = /n[aã]o informad/i.test(a.nome) ? 1 : 0, nb = /n[aã]o informad/i.test(b.nome) ? 1 : 0; return na - nb || String(a.nome || "").trim().localeCompare(String(b.nome || "").trim(), "pt-BR", { sensitivity: "base", numeric: true }); }),
    tipos: tiposMap,
    reembolsos: (reemb as any[]).map((r: any) => ({ id: r.id, usuarioId: r.usuario_id, chamadoId: r.chamado_id || "", data: r.data, tipo: r.tipo, valor: Number(r.valor), descricao: r.descricao || "",
      path: r.comprovante_path, status: r.status, criadoEm: r.criado_em, decididoEm: r.decidido_em || "", motivo: r.motivo || "" })),
    montadores: montadores.map((m: any) => { const k: any = (mconta as any[]).find((x: any) => x.montador_id === m.id);
      return { id: m.id, nome: m.nome, telefone: m.telefone || "", regiao: m.regiao || "", ativo: m.ativo,
        conta: k ? { titular: k.titular, docTitular: k.doc_titular, banco: k.banco, agencia: k.agencia, conta: k.conta, tipoConta: k.tipo_conta, pixTipo: k.pix_tipo, pixChave: k.pix_chave, obs: k.obs, atualizadoEm: k.atualizado_em, atualizadoPor: k.atualizado_por } : null }; }),
    vendedorDias: (vdias as any[]).reduce((m: any, r: any) => { (m[r.usuario_id] = m[r.usuario_id] || {})[r.dia] = r.tipo; return m; }, {}),
    visitasCiclo: (viscic as any[]).map((v: any) => ({ id: v.id, ciclo: v.ciclo, usuarioId: v.usuario_id || "", pessoa: v.pessoa, papel: v.papel, visitas: Number(v.visitas) || 0, obs: v.obs || "", atualizadoEm: v.atualizado_em })),
    consBloqueios: (cbloq as any[]).filter((b: any) => b.ativo).map((b: any) => ({ id: b.id, tipo: b.tipo || "bloqueio", usuarioId: b.usuario_id, de: String(b.de).slice(0, 10), ate: String(b.ate).slice(0, 10), periodo: b.periodo, ini: String(b.hora_ini || "").slice(0, 5), fim: String(b.hora_fim || "").slice(0, 5), motivo: b.motivo, obs: b.obs || "", criadoPor: b.criado_por || "" })),
    ckBloqueios: (bloqs as any[]).filter((b: any) => b.ativo).map((b: any) => ({ id: b.id, projetista: b.projetista || "", inicio: String(b.inicio).slice(0, 16).replace(" ", "T"), fim: String(b.fim).slice(0, 16).replace(" ", "T"), motivo: b.motivo, obs: b.obs || "", criadoPor: b.criado_por || "" })),
    medidasCruz: Object.fromEntries((mcruz as any[]).map((m: any) => [m.venda, { venda: m.venda, comprador: m.comprador, telefone: m.telefone, visitado: m.visitado, consultor: m.consultor,
      statusMv: m.status_mv, visitaEm: m.visita_em, medidor: m.medidor, situacao: m.situacao_exact, resultado: m.resultado, tratativa: m.tratativa, obs: m.obs,
      cruzadoEm: m.cruzado_em, atualizadoEm: m.atualizado_em, atualizadoPor: m.atualizado_por }])),
    config: cfg.data ? { comissaoPct: Number(cfg.data.comissao_pct), pagamentoVisita: Number(cfg.data.pagamento_visita), valorVendaMkt: cfg.data.valor_venda_mkt != null ? Number(cfg.data.valor_venda_mkt) : 10, modoTeste: !!cfg.data.modo_teste, auxilioFixo: cfg.data.auxilio_fixo != null ? Number(cfg.data.auxilio_fixo) : 1500, diaAuxilio: Number(cfg.data.dia_auxilio) || 15, checklistAgenda: cfg.data.checklist_agenda || null, escalaDomingos: cfg.data.escala_domingos || {}, googleReview: cfg.data.google_review_url || "" } : { comissaoPct: 1.5, pagamentoVisita: 40 },
    // proteção extra: o mesmo chamado nunca entra duas vezes (somaria a venda em dobro)
    chamados: ((vistos: Set<string>) => chamados.filter((c: any) => !(c.tratativa && c.tratativa.excluido) && !vistos.has(c.id) && !!vistos.add(c.id)))(new Set()).map((c: any) => {
      const v = vendaDe[c.id] || vendaTempDe[c.id];
      const t = trDe[c.id];
      return {
        id: c.id, tipo: c.tipo, setorDestino: c.setor_destino, status: c.status, criadoEm: c.criado_em, slaResposta: c.sla_resposta,
        // marketing: quem conta (produção, comissão) é a responsável escolhida no cadastro; sem escolha, quem cadastrou
        solicitanteId: c.responsavel_mkt || c.solicitante_id, cadastradoPorId: c.solicitante_id, responsavelMkt: c.responsavel_mkt || null, solicitante: c.solicitante_nome, setor: c.solicitante_setor,
        cliente: c.cliente, clienteDoc: c.cliente_doc, telefone: c.telefone, email: c.email, pedido: c.pedido,
        dataVenda: c.data_venda || "", pedidoFabrica: c.pedido_fabrica, produto: c.produto, fabrica: c.fabrica_id || "",
        prazoTatico: c.prazo_tatico || "", motivo: c.motivo, urgente: c.urgente, escalonadoAuto: c.escalonado_auto, escaladoEm: c.escalado_em,
        vinculadoA: c.vinculado_a, origem: c.origem || "", consultorId: c.consultor_id || "", atendenteId: c.atendente_id || "",
        dataVisita: hora(c.data_visita), medidorId: c.medidor_id || "", dataMedida: hora(c.data_medida), endereco: c.endereco, dataLoja: hora(c.data_loja), statusCliente: c.status_cliente || "",
        tratativa: c.tratativa || {},
        resposta: c.resposta_quando ? { previsao: c.resposta_previsao || "", quem: c.resposta_quem, texto: c.resposta_texto, quando: c.resposta_quando } : null,
        venda: v ? {
          numero: v.numero, valor: valorDe[c.id] != null ? fmtValor(valorDe[c.id]) : v.temp ? fmtValor(v.soma) : "", valorNum: valorDe[c.id] ?? (v.temp ? v.soma : null),
          // competência: a venda conta no mês em que a Gestão aprovou; se a data da venda é de mês anterior, vai para o 1º dia do mês da aprovação
          ...competencia(v.data_venda || "", v.decidido_em || v.registrado_em), vendedor: v.vendedor, atendenteNome: v.atendente_nome, quando: v.registrado_em, status: vendaTempDe[c.id] && !["entrada", "efetivada"].includes(v.status) ? "efetivada" : v.status,
          gerenteId: v.gerente_id || "", gerenteNome: v.gerente_nome || "",
          entrada: entradaDe[c.id] || 0, promissorias: promDe[c.id] || [], itens: itensDe[c.id] || null, tipoInformado: v.tipo_informado || "", entradaInformada: entInfDe[c.id] || 0,
          ...(v.temp ? { temp: true } : {}),
        } : null,
        transferencia: t ? { de: t.de_usuario, para: t.para_usuario, solicitadoPor: t.solicitado_por, quando: t.quando, status: "pendente" } : null,
        anexos: anxDe[c.id] || [],
        posvenda: pvDe[c.id] || null,
        historico: histDe[c.id] || [],
      };
    }).sort((a: any, b: any) => +new Date(b.criadoEm) - +new Date(a.criadoEm)),
  };
  if (assinando) assinando.then(() => {
    let mudou = false;
    estado.chamados.forEach((c: any) => (c.anexos || []).forEach((a: any) => { if (!a.url && a.path) { const u = cacheUrl.get(a.path)?.url; if (u) { a.url = u; mudou = true; } } }));
    if (mudou) window.dispatchEvent(new Event("a360-fotos"));
  });
  return estado;
}
