// Carrega do Supabase tudo o que o usuário logado pode ver (o RLS filtra) e monta
// o mesmo formato de `state` do protótipo, para que as regras portadas funcionem igual.
import { sb } from "./supabase";

export type Anexo = { id?: string; tipo: "img" | "link" | "video" | "pdf"; nome: string; url: string; path?: string | null };
export type Chamado = any;
export type Usuario = { id: string; nome: string; email?: string; setores: string[]; somenteAtribuidos: boolean; ativo: boolean };
export type Setor = { id: string; nome: string; liberacoes: Record<string, boolean> };
export type Estado = {
  setores: Setor[];
  usuarios: Usuario[];
  representantes: any[];
  fabricas: any[];
  chamados: Chamado[];
  tipos: Record<string, any>;
  config: { comissaoPct: number; pagamentoVisita: number; valorVendaMkt?: number; modoTeste?: boolean };
  montadores: Montador[];
};
export type Montador = { id: string; nome: string; telefone: string; ativo: boolean };

async function todos<T = any>(tabela: string, colunas = "*", ordem?: string): Promise<T[]> {
  const out: T[] = [];
  const passo = 1000;
  for (let de = 0; ; de += passo) {
    let q = sb.from(tabela).select(colunas).range(de, de + passo - 1);
    if (ordem) q = q.order(ordem, { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data as T[]) || []));
    if (!data || data.length < passo) break;
  }
  return out;
}

const hora = (v: string | null) => (v ? String(v).slice(0, 16) : "");
export const fmtValor = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// cache de URLs assinadas das fotos (evita baixar de novo a cada atualização)
const cacheUrl = new Map<string, { url: string; exp: number }>();
async function assinar(paths: string[]) {
  const agora = Date.now();
  const faltam = paths.filter(p => { const c = cacheUrl.get(p); return !c || c.exp < agora; });
  if (faltam.length) {
    const { data } = await sb.storage.from("anexos").createSignedUrls(faltam, 3600);
    (data || []).forEach(d => { if (d.signedUrl && d.path) cacheUrl.set(d.path, { url: d.signedUrl, exp: agora + 50 * 60 * 1000 }); });
  }
}

// logo após o login o token pode chegar alguns segundos "no futuro" para o banco (relógios); tenta de novo
export async function carregarEstado(tentativa = 0): Promise<Estado> {
  try { return await carregarEstadoUmaVez(); }
  catch (e: any) {
    if (tentativa < 4 && /issued at future|JWT|fetch/i.test(String(e?.message || e))) {
      await new Promise(r => setTimeout(r, 1500 * (tentativa + 1)));
      return carregarEstado(tentativa + 1);
    }
    throw e;
  }
}
async function carregarEstadoUmaVez(): Promise<Estado> {
  const [setores, tipos, usuarios, us, reps, fabs, cfg, chamados, vendas, valores, transf, hist, anexos, montadores, posvenda] = await Promise.all([
    todos("setores", "*", "ordem"),
    todos("tipos", "*", "ordem"),
    todos("usuarios", "id,nome,email,somente_atribuidos,ativo,criado_em", "criado_em"),
    todos("usuario_setores", "*", "ordem"),
    todos("representantes", "*", "criado_em"),
    todos("fabricas", "*", "criado_em"),
    sb.from("config").select("*").maybeSingle(),
    todos("chamados", "*", "criado_em"),
    todos("vendas", "*"),
    todos("vendas_valores", "*"),
    todos("transferencias", "*", "quando"),
    todos("historico", "chamado_id,quando,quem_nome,texto,id", "id"),
    todos("anexos", "id,chamado_id,tipo,nome,url,storage_path,criado_em", "criado_em"),
    todos("montadores", "*", "nome"),
    todos("posvenda", "*"), // só o setor Pós-venda e a Gestão recebem linhas (RLS)
  ]);
  const pvDe: Record<string, any> = {};
  posvenda.forEach((p: any) => (pvDe[p.chamado_id] = {
    origem: p.origem, categoria: p.categoria, responsabilidade: p.responsabilidade || "analise", pecaAfetada: p.peca_afetada || "",
    montadorId: p.montador_id || "", medidorResp: p.medidor_resp || "", checklistResp: p.checklist_resp || "",
    ocorrido: p.ocorrido, solucao: p.solucao, custo: Number(p.custo) || 0, custoDesc: p.custo_desc, descontoMontador: Number(p.desconto_montador) || 0,
    atualizadoEm: p.atualizado_em, atualizadoPor: p.atualizado_por,
  }));

  const paths = anexos.filter((a: any) => a.storage_path).map((a: any) => a.storage_path);
  if (paths.length) await assinar(paths);

  const setoresDe: Record<string, string[]> = {};
  us.forEach((x: any) => (setoresDe[x.usuario_id] = setoresDe[x.usuario_id] || []).push(x.setor_id));

  const vendaDe: Record<string, any> = {};
  vendas.forEach((v: any) => (vendaDe[v.chamado_id] = v));
  const valorDe: Record<string, number> = {};
  valores.forEach((v: any) => (valorDe[v.chamado_id] = Number(v.valor)));
  const trDe: Record<string, any> = {};
  transf.forEach((t: any) => { if (t.status === "pendente") trDe[t.chamado_id] = t; });
  const histDe: Record<string, any[]> = {};
  hist.forEach((h: any) => (histDe[h.chamado_id] = histDe[h.chamado_id] || []).push({ quando: h.quando, quem: h.quem_nome, texto: h.texto }));
  const anxDe: Record<string, Anexo[]> = {};
  anexos.forEach((a: any) => (anxDe[a.chamado_id] = anxDe[a.chamado_id] || []).push({
    id: a.id, tipo: a.tipo, nome: a.nome, path: a.storage_path,
    url: a.storage_path ? (cacheUrl.get(a.storage_path)?.url || "") : a.url,
  }));

  const tiposMap: Record<string, any> = {};
  tipos.forEach((t: any) => (tiposMap[t.id] = { nome: t.nome, destino: t.setor_destino, anexos: t.anexos, presale: t.presale, direto: t.direto }));

  const estado: Estado = {
    setores: setores.map((s: any) => ({
      id: s.id, nome: s.nome,
      liberacoes: { criar: s.lib_criar, verTudo: s.lib_ver_tudo, cadastros: s.lib_cadastros, admin: s.lib_admin, verMarketing: s.lib_ver_marketing, viaCallcenter: !!s.via_callcenter },
    })),
    usuarios: usuarios.map((u: any) => ({ id: u.id, nome: u.nome, email: u.email, setores: setoresDe[u.id] || [], somenteAtribuidos: u.somente_atribuidos, ativo: u.ativo })),
    representantes: reps.map((r: any) => ({ id: r.id, nome: r.nome, whats: r.whats, email: r.email })),
    fabricas: fabs.map((f: any) => ({ id: f.id, nome: f.nome, emails: f.emails, repId: f.representante_id || "" })),
    tipos: tiposMap,
    montadores: montadores.map((m: any) => ({ id: m.id, nome: m.nome, telefone: m.telefone || "", ativo: m.ativo })),
    config: cfg.data ? { comissaoPct: Number(cfg.data.comissao_pct), pagamentoVisita: Number(cfg.data.pagamento_visita), valorVendaMkt: cfg.data.valor_venda_mkt != null ? Number(cfg.data.valor_venda_mkt) : 10, modoTeste: !!cfg.data.modo_teste } : { comissaoPct: 1.5, pagamentoVisita: 40 },
    chamados: chamados.map((c: any) => {
      const v = vendaDe[c.id];
      const t = trDe[c.id];
      return {
        id: c.id, tipo: c.tipo, setorDestino: c.setor_destino, status: c.status, criadoEm: c.criado_em, slaResposta: c.sla_resposta,
        solicitanteId: c.solicitante_id, solicitante: c.solicitante_nome, setor: c.solicitante_setor,
        cliente: c.cliente, clienteDoc: c.cliente_doc, telefone: c.telefone, email: c.email, pedido: c.pedido,
        dataVenda: c.data_venda || "", pedidoFabrica: c.pedido_fabrica, produto: c.produto, fabrica: c.fabrica_id || "",
        prazoTatico: c.prazo_tatico || "", motivo: c.motivo, urgente: c.urgente, escalonadoAuto: c.escalonado_auto, escaladoEm: c.escalado_em,
        vinculadoA: c.vinculado_a, consultorId: c.consultor_id || "", atendenteId: c.atendente_id || "",
        dataVisita: hora(c.data_visita), endereco: c.endereco, dataLoja: hora(c.data_loja), statusCliente: c.status_cliente || "",
        tratativa: c.tratativa || {},
        resposta: c.resposta_quando ? { previsao: c.resposta_previsao || "", quem: c.resposta_quem, texto: c.resposta_texto, quando: c.resposta_quando } : null,
        venda: v ? {
          numero: v.numero, valor: valorDe[c.id] != null ? fmtValor(valorDe[c.id]) : "", valorNum: valorDe[c.id] ?? null,
          dataVenda: v.data_venda || "", vendedor: v.vendedor, atendenteNome: v.atendente_nome, quando: v.registrado_em, status: v.status,
          gerenteId: v.gerente_id || "", gerenteNome: v.gerente_nome || "",
        } : null,
        transferencia: t ? { de: t.de_usuario, para: t.para_usuario, solicitadoPor: t.solicitado_por, quando: t.quando, status: "pendente" } : null,
        anexos: anxDe[c.id] || [],
        posvenda: pvDe[c.id] || null,
        historico: histDe[c.id] || [],
      };
    }).sort((a: any, b: any) => +new Date(b.criadoEm) - +new Date(a.criadoEm)),
  };
  return estado;
}
