// Fretes (SIMULAÇÃO — só o usuário do Bruno): romaneio → freteiro registra entregas, volumes, valor e km → escritório aprova.
import { sb } from "./supabase";
import { MOCK } from "./chat";

export const BRUNO = "00000000-0000-4000-a000-000000000007";
export const podeFretes = (uid: string) => uid === BRUNO;

export type Romaneio = { id: number; numero: string; data: string; freteiro: string; placa: string; tipo: string; status: string; km_ini: number | null; km_fim: number | null; valor_km: number;
  enviado_em: string | null; aprovado_em: string | null; aprovado_por: string | null; devolvido_motivo: string | null };
export type Entrega = { id: number; romaneio_id: number; ordem: number; venda: string; cliente: string; endereco: string; bairro: string; cep: string; cidade: string; telefones: string; obs: string; nf: string;
  vol_deposito: number | null; vol_entregue: number | null; valor_tabela: number; valor_freteiro: number | null; situacao: string; motivo: string; canhoto: boolean; entregue_em: string | null; extra: boolean; autorizado: boolean | null };

export const SITUACAO: Record<string, string> = { pendente: "Pendente", entregue: "Entregue", parcial: "Parcial", nao_entregue: "Não entregue" };
export const STATUS_ROM: Record<string, string> = { conferido: "Liberado para o freteiro", em_rota: "Em rota", enviado: "Aguardando aprovação", devolvido: "Devolvido ao freteiro", aprovado: "Aprovado" };

// ---------- simulação local (modo de teste sem banco) ----------
let mr: Romaneio[] = []; let me: Entrega[] = [];
function seedMock() {
  mr = [{ id: 1, numero: "104997", data: "2026-10-13", freteiro: "José Elias da Silva", placa: "AWH-5202", tipo: "Normal", status: "conferido", km_ini: null, km_fim: null, valor_km: 3, enviado_em: null, aprovado_em: null, aprovado_por: null, devolvido_motivo: null }];
  const b = (ordem: number, venda: string, cliente: string, endereco: string, bairro: string, cidade: string, vol: number, valor: number, obs = ""): Entrega =>
    ({ id: ordem, romaneio_id: 1, ordem, venda, cliente, endereco, bairro, cep: "", cidade, telefones: "(41) 99999-0000", obs, nf: "4515" + ordem, vol_deposito: vol, vol_entregue: null, valor_tabela: valor, valor_freteiro: null, situacao: "pendente", motivo: "", canhoto: false, entregue_em: null, extra: false, autorizado: null });
  me = [b(1, "1307996", "Douglas Delfes Pereira", "Rua Francisco Fruet, 989 - Sob 03", "Novo Mundo", "Curitiba - PR", 2, 45),
    b(2, "1305726", "Jose Sebastiao De Oliveira", "Rua Leon Nicolas, 1200 - Sob 3", "Capão Raso", "Curitiba - PR", 9, 45, "Ligar 1h antes"),
    b(3, "1305220", "Daniele Comparin Dos Anjos", "Avenida Portugal, 6547 - 70", "Veneza", "Fazenda Rio Grande - PR", 80, 93, "Condomínio San Marcos")];
}
if (MOCK) seedMock();

export async function carregarFretes(): Promise<{ rom: Romaneio[]; ent: Entrega[] }> {
  if (MOCK) return { rom: mr.map(r => ({ ...r })), ent: me.map(e => ({ ...e })) };
  const [a, b] = await Promise.all([
    sb.from("frete_romaneios").select("*").order("data", { ascending: false }),
    sb.from("frete_entregas").select("*").order("ordem"),
  ]);
  if (a.error) throw new Error(a.error.message); if (b.error) throw new Error(b.error.message);
  const n = (x: any) => x == null ? null : Number(x);
  return { rom: (a.data || []).map((r: any) => ({ ...r, valor_km: Number(r.valor_km) })),
    ent: (b.data || []).map((e: any) => ({ ...e, valor_tabela: Number(e.valor_tabela), valor_freteiro: n(e.valor_freteiro) })) };
}
export async function salvarRomaneio(id: number, p: Partial<Romaneio>) {
  if (MOCK) { mr = mr.map(r => r.id === id ? { ...r, ...p } : r); return; }
  const { error } = await sb.from("frete_romaneios").update(p).eq("id", id); if (error) throw new Error(error.message);
}
export async function salvarEntrega(id: number, p: Partial<Entrega>) {
  if (MOCK) { me = me.map(e => e.id === id ? { ...e, ...p } : e); return; }
  const { error } = await sb.from("frete_entregas").update(p).eq("id", id); if (error) throw new Error(error.message);
}
export async function incluirExtra(romaneioId: number, ordem: number, cliente: string, endereco: string, motivo: string) {
  const p = { romaneio_id: romaneioId, ordem, cliente, endereco, obs: motivo, extra: true, valor_tabela: 0, situacao: "entregue", entregue_em: new Date().toISOString() };
  if (MOCK) { me.push({ id: Date.now(), venda: "", bairro: "", cep: "", cidade: "", telefones: "", nf: "", vol_deposito: null, vol_entregue: null, valor_freteiro: null, motivo: "", canhoto: false, autorizado: null, ...p } as Entrega); return; }
  const { error } = await sb.from("frete_entregas").insert(p); if (error) throw new Error(error.message);
}
export async function reiniciarSimulacao() {
  if (MOCK) { seedMock(); return; }
  const { error } = await sb.rpc("frete_sim_reiniciar"); if (error) throw new Error(error.message);
}

// ---------- contas ----------
export const valorEntrega = (e: Entrega) => {
  if (e.extra) return e.autorizado ? Number(e.valor_freteiro ?? e.valor_tabela ?? 0) : 0;
  if (e.situacao === "nao_entregue") return 0;
  return Number(e.valor_freteiro ?? e.valor_tabela ?? 0);
};
export function resumo(r: Romaneio, ents: Entrega[]) {
  const l = ents.filter(e => e.romaneio_id === r.id);
  const normais = l.filter(e => !e.extra);
  const km = r.km_ini != null && r.km_fim != null && r.km_fim >= r.km_ini ? r.km_fim - r.km_ini : null;
  const vEnt = l.reduce((s, e) => s + valorEntrega(e), 0);
  const vKm = km != null ? km * Number(r.valor_km || 0) : 0;
  return {
    l, normais, km, vEnt, vKm, total: vEnt + vKm,
    feitas: normais.filter(e => e.situacao !== "pendente").length,
    volDep: normais.reduce((s, e) => s + (e.vol_deposito || 0), 0),
    volEnt: normais.reduce((s, e) => s + (e.vol_entregue || 0), 0),
    semCanhoto: normais.filter(e => ["entregue", "parcial"].includes(e.situacao) && !e.canhoto).length,
    difVol: normais.filter(e => e.situacao !== "pendente" && e.vol_entregue != null && e.vol_deposito != null && e.vol_entregue !== e.vol_deposito),
    difValor: normais.filter(e => e.valor_freteiro != null && Number(e.valor_freteiro) !== Number(e.valor_tabela)),
    extrasPend: l.filter(e => e.extra && e.autorizado == null),
  };
}
export const moeda = (n: number) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const endCompleto = (e: Entrega) => [e.endereco, e.bairro, e.cidade.replace(/ - PR$/i, "") + " - PR", e.cep].filter(Boolean).join(", ");
export function rotaMaps(ents: Entrega[]) {
  const pend = ents.filter(e => !e.extra && e.situacao === "pendente").sort((a, b) => a.ordem - b.ordem);
  if (!pend.length) return "";
  const enc = (e: Entrega) => encodeURIComponent(endCompleto(e));
  const dest = pend[pend.length - 1], meio = pend.slice(0, -1).slice(0, 9);
  return "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + enc(dest) + (meio.length ? "&waypoints=" + meio.map(enc).join("%7C") : "");
}

// ---------- lançamento manual pelo escritório (sem o freteiro usar nada) ----------
export type Lanc = { id: number; freteiro: string; data: string; romaneio: string; valor: number; tipo: "romaneio" | "total"; obs: string;
  lancado_por: string; status: string; devolvido_motivo: string; enviado_em: string | null; aprovado_em: string | null; aprovado_por: string | null };
let ml: Lanc[] = [{ id: 1, freteiro: "José Elias da Silva", data: "2026-10-13", romaneio: "104997", valor: 1159, tipo: "romaneio", obs: "", lancado_por: "Exemplo", status: "lancado", devolvido_motivo: "", enviado_em: null, aprovado_em: null, aprovado_por: null }];
export async function listarLanc(): Promise<Lanc[]> {
  if (MOCK) return ml.map(x => ({ ...x }));
  const { data, error } = await sb.from("frete_lancamentos").select("*").order("data").order("id");
  if (error) throw new Error(error.message);
  return (data || []).map((x: any) => ({ ...x, valor: Number(x.valor) }));
}
export async function criarLanc(p: Partial<Lanc>) {
  if (MOCK) { ml.push({ id: Date.now(), freteiro: "", data: "", romaneio: "", valor: 0, tipo: "romaneio", obs: "", lancado_por: "você", status: "lancado", devolvido_motivo: "", enviado_em: null, aprovado_em: null, aprovado_por: null, ...p } as Lanc); return; }
  const { error } = await sb.from("frete_lancamentos").insert(p); if (error) throw new Error(error.message);
}
export async function mudarLanc(ids: number[], p: Partial<Lanc>) {
  if (MOCK) { ml = ml.map(x => ids.includes(x.id) ? { ...x, ...p } : x); return; }
  const { error } = await sb.from("frete_lancamentos").update(p).in("id", ids); if (error) throw new Error(error.message);
}
export async function apagarLanc(id: number) {
  if (MOCK) { ml = ml.filter(x => x.id !== id); return; }
  const { error } = await sb.from("frete_lancamentos").delete().eq("id", id); if (error) throw new Error(error.message);
}
