// RH · Funcionários, documentos e admissão por link. Só o Bruno e a Patrícia (RLS confere no banco).
import { sb } from "./supabase";
export { PODE_RH, podeRh } from "./ponto";

export type Funcionario = {
  id: string; nome: string; cpf: string; rg: string; nascimento: string | null; telefone: string; email: string; endereco: string;
  estado_civil: string; escolaridade: string; pis: string; ctps: string; cargo: string; setor: string; admissao: string | null;
  salario: number | null; recebe_vt: boolean; vt_dia: number; va_dia: number; jornada_min: number;
  banco: string; agencia: string; conta: string; pix: string; emergencia_nome: string; emergencia_tel: string;
  dependentes: { nome: string; nascimento: string }[]; status: string; desligamento: string | null; obs: string; origem: string; criado_em: string;
};
export type Doc = { id: number; funcionario_id: string; tipo: string; titulo: string; arquivo: string; data_ref: string | null; criado_em: string };
export type Link = { token: string; nome: string; cargo: string; setor: string; status: string; expira_em: string; criado_em: string };
export type Envio = { id: number; token: string; dados: any; docs: { campo: string; nome: string; caminho: string }[]; enviado_em: string; revisado_em: string | null; funcionario_id: string | null };

export const TIPOS_DOC: [string, string][] = [["rg_cpf", "RG / CPF"], ["ctps", "Carteira de trabalho"], ["residencia", "Comprovante de residência"], ["atestado", "Atestado médico"], ["contrato", "Contrato / termo assinado"], ["certidao", "Certidão (nascimento/casamento)"], ["reservista", "Reservista"], ["titulo", "Título de eleitor"], ["foto", "Foto"], ["outro", "Outro"]];
export const STATUS_FUNC: [string, string][] = [["ativo", "Ativo"], ["ferias", "Em férias"], ["afastado", "Afastado"], ["desligado", "Desligado"]];
export const soDig = (v: any) => String(v || "").replace(/\D/g, "");
export const fmtCpf = (v: string) => { const d = soDig(v).slice(0, 11); return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_m, a, b, c, x) => a + "." + b + "." + c + (x ? "-" + x : "")); };

const erro = (r: { error: any }) => { if (r.error) throw new Error(r.error.message); };

export async function listarFuncionarios(): Promise<Funcionario[]> {
  const r = await sb.from("rh_funcionarios").select("*").order("nome"); erro(r);
  return (r.data || []).map((f: any) => ({ ...f, salario: f.salario == null ? null : Number(f.salario), vt_dia: Number(f.vt_dia), va_dia: Number(f.va_dia), dependentes: f.dependentes || [] }));
}
export async function salvarFuncionario(id: string | null, p: Partial<Funcionario>, uid: string): Promise<string> {
  if (id) { const r = await sb.from("rh_funcionarios").update({ ...p, atualizado_em: new Date().toISOString() }).eq("id", id); erro(r); return id; }
  const r = await sb.from("rh_funcionarios").insert({ ...p, criado_por: uid }).select("id").single(); erro(r as any); return (r.data as any).id;
}
export async function apagarFuncionario(id: string) { const r = await sb.from("rh_funcionarios").delete().eq("id", id); erro(r); }

export async function listarDocs(funcionarioId: string): Promise<Doc[]> {
  const r = await sb.from("rh_docs").select("*").eq("funcionario_id", funcionarioId).order("criado_em", { ascending: false }); erro(r); return (r.data || []) as any;
}
export async function subirDoc(funcionarioId: string, tipo: string, titulo: string, dataRef: string | null, f: File, uid: string) {
  const caminho = "funcionarios/" + funcionarioId + "/" + Date.now() + "-" + f.name.replace(/[^\w.\-]+/g, "_");
  const up = await sb.storage.from("rh").upload(caminho, f, { upsert: false }); if (up.error) throw new Error(up.error.message);
  const r = await sb.from("rh_docs").insert({ funcionario_id: funcionarioId, tipo, titulo: titulo || f.name, arquivo: caminho, data_ref: dataRef, criado_por: uid }); erro(r);
}
export async function abrirDoc(caminho: string) {
  const r = await sb.storage.from("rh").createSignedUrl(caminho, 600); if (r.error) throw new Error(r.error.message);
  window.open(r.data.signedUrl, "_blank", "noopener");
}
export async function apagarDoc(d: Doc) {
  await sb.storage.from("rh").remove([d.arquivo]);
  const r = await sb.from("rh_docs").delete().eq("id", d.id); erro(r);
}

// ---------- admissão por link ----------
export const urlAdmissao = (token: string) => location.origin + "/admissao?t=" + token;
export async function listarLinks(): Promise<{ links: Link[]; envios: Envio[] }> {
  const a = await sb.from("rh_admissao_links").select("*").order("criado_em", { ascending: false }); erro(a);
  const b = await sb.from("rh_admissao_envios").select("*").order("enviado_em", { ascending: false }); erro(b);
  return { links: (a.data || []) as any, envios: (b.data || []) as any };
}
export async function criarLink(nome: string, cargo: string, setor: string, uid: string): Promise<Link> {
  const r = await sb.from("rh_admissao_links").insert({ nome, cargo, setor, criado_por: uid }).select("*").single(); erro(r as any); return r.data as any;
}
export async function mudarLink(token: string, p: Partial<Link>) { const r = await sb.from("rh_admissao_links").update(p).eq("token", token); erro(r); }
export async function aprovarEnvio(envio: Envio, link: Link | undefined, ajustes: { cargo: string; setor: string; admissao: string | null }, uid: string): Promise<string> {
  const d = envio.dados || {};
  const fid = await salvarFuncionario(null, {
    nome: d.nome || link?.nome || "—", cpf: d.cpf || "", rg: d.rg || "", nascimento: d.nascimento || null, telefone: d.telefone || "", email: d.email || "",
    endereco: d.endereco || "", estado_civil: d.estado_civil || "", escolaridade: d.escolaridade || "", pis: d.pis || "", ctps: d.ctps || "",
    banco: d.banco || "", agencia: d.agencia || "", conta: d.conta || "", pix: d.pix || "",
    emergencia_nome: d.emergencia_nome || "", emergencia_tel: d.emergencia_tel || "", dependentes: d.dependentes || [],
    cargo: ajustes.cargo, setor: ajustes.setor, admissao: ajustes.admissao, origem: "link", obs: d.obs || "",
  } as any, uid);
  for (const doc of envio.docs || []) {
    const r = await sb.from("rh_docs").insert({ funcionario_id: fid, tipo: doc.campo || "outro", titulo: doc.nome || "Documento", arquivo: doc.caminho, criado_por: uid }); erro(r);
  }
  const r1 = await sb.from("rh_admissao_envios").update({ revisado_em: new Date().toISOString(), revisado_por: uid, funcionario_id: fid }).eq("id", envio.id); erro(r1);
  const r2 = await sb.from("rh_admissao_links").update({ status: "aprovado" }).eq("token", envio.token); erro(r2);
  return fid;
}

// ---------- página pública (sem login) ----------
export async function admissaoInfo(token: string): Promise<{ nome: string; cargo: string; status: string } | null> {
  const r = await sb.rpc("rh_admissao_info", { p_token: token }); if (r.error) throw new Error(r.error.message);
  return (r.data as any) || null;
}
export async function admissaoSubirDoc(token: string, campo: string, f: File): Promise<{ campo: string; nome: string; caminho: string }> {
  if (f.size > 15 * 1024 * 1024) throw new Error(f.name + ": arquivo muito grande (máx. 15 MB)");
  const caminho = "admissao/" + token + "/" + Date.now() + "-" + campo + "-" + f.name.replace(/[^\w.\-]+/g, "_");
  const up = await sb.storage.from("rh").upload(caminho, f, { upsert: false }); if (up.error) throw new Error(up.error.message);
  return { campo, nome: f.name, caminho };
}
export async function admissaoEnviar(token: string, dados: any, docs: any[]) {
  const r = await sb.rpc("rh_admissao_enviar", { p_token: token, p_dados: dados, p_docs: docs }); if (r.error) throw new Error(r.error.message);
}
