// Todas as gravações passam por funções do banco, que conferem a permissão e registram o histórico.
import { sb } from "./supabase";

async function rpc<T = any>(fn: string, args: Record<string, any> = {}): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message || "Não foi possível concluir a ação");
  return data as T;
}
const nz = (v: any) => (v === "" || v === undefined ? null : v);

export const A = {
  criarChamado: (p: any) => rpc<string>("criar_chamado", { p }),
  alternarUrgente: (id: string) => rpc("alternar_urgente", { p_id: id }),
  mudarStatus: (id: string, s: string) => rpc("mudar_status", { p_id: id, p_status: s }),
  registrarRetorno: (id: string, previsao: string, quem: string, texto: string) => rpc("registrar_retorno", { p_id: id, p_previsao: nz(previsao), p_quem: quem, p_texto: texto }),
  alterarPrazo: (id: string, data: string) => rpc("alterar_prazo", { p_id: id, p_data: nz(data) }),
  adicionarNota: (id: string, texto: string) => rpc("adicionar_nota", { p_id: id, p_texto: texto }),
  salvarTratativa: (id: string, campos: any) => rpc("salvar_tratativa", { p_id: id, p_campos: campos }),
  alternarMarcacao: (id: string, campo: string) => rpc("alternar_marcacao", { p_id: id, p_campo: campo }),
  entregaParaFabrica: (id: string) => rpc("entrega_para_fabrica", { p_id: id }),
  encaminharSetor: (id: string, setor: string) => rpc("encaminhar_setor", { p_id: id, p_setor: setor }),
  alterarStatusCliente: (id: string, novo: string) => rpc("alterar_status_cliente", { p_id: id, p_novo: novo }),
  direcionarConsultor: (id: string, consultor: string, dataVisita: string, endereco: string) =>
    rpc("direcionar_consultor", { p_id: id, p_consultor: consultor, p_data_visita: nz(dataVisita), p_endereco: endereco || "" }),
  agendarLoja: (id: string, dataLoja: string, medidas: string, obs: string) =>
    rpc("agendar_loja", { p_id: id, p_data_loja: nz(dataLoja && dataLoja.length === 10 ? dataLoja + "T09:00" : dataLoja), p_medidas: medidas, p_obs: obs }),
  designarProjetista: (id: string, atendente: string) => rpc("designar_projetista", { p_id: id, p_atendente: atendente }),
  marcarComparecimento: (id: string, acao: "chegou" | "nao_compareceu" | "voltou") => rpc("marcar_comparecimento", { p_id: id, p_acao: acao }),
  reagendarLoja: (id: string, nova: string) => rpc("reagendar_loja", { p_id: id, p_nova: nz(nova) }),
  trocarVendedor: (id: string, novo: string) => rpc("trocar_vendedor", { p_id: id, p_novo: novo }),
  solicitarTransferencia: (id: string, para: string) => rpc<string>("solicitar_transferencia", { p_id: id, p_para: para }),
  responderTransferencia: (id: string, aceitar: boolean, origem: "detalhe" | "aprovacoes" = "detalhe") =>
    rpc("responder_transferencia", { p_id: id, p_aceitar: aceitar, p_origem: origem }),
  cancelarTransferencia: (id: string) => rpc("cancelar_transferencia", { p_id: id }),
  registrarVenda: (id: string, numero: string, valor: number, data: string, vendedor: string) =>
    rpc("registrar_venda", { p_id: id, p_numero: numero, p_valor: valor, p_data: nz(data), p_vendedor: vendedor }),
  decidirVenda: (id: string, novo: string, origem: "detalhe" | "aprovacoes" = "detalhe") => rpc("decidir_venda", { p_id: id, p_novo: novo, p_origem: origem }),
  corrigirVenda: (id: string, numero: string, valor: number, data: string, vendedor: string) =>
    rpc("corrigir_venda", { p_id: id, p_numero: numero, p_valor: valor, p_data: nz(data), p_vendedor: vendedor }),
  adicionarAnexos: (id: string, itens: any[], registrar = true) => rpc("adicionar_anexos", { p_id: id, p_itens: itens, p_registrar: registrar }),
  removerAnexo: async (anexoId: string) => {
    const path = await rpc<string | null>("remover_anexo", { p_anexo: anexoId });
    if (path) await sb.storage.from("anexos").remove([path]);
  },
  salvarFabrica: (id: string | null, nome: string, emails: string, rep: string) => rpc("salvar_fabrica", { p_id: id, p_nome: nome, p_emails: emails, p_rep: nz(rep) }),
  removerFabrica: (id: string) => rpc("remover_fabrica", { p_id: id }),
  salvarRepresentante: (id: string | null, nome: string, whats: string, email: string) => rpc("salvar_representante", { p_id: id, p_nome: nome, p_whats: whats, p_email: email }),
  removerRepresentante: (id: string) => rpc("remover_representante", { p_id: id }),
  salvarSetor: (id: string | null, nome: string, libs: any) => rpc("salvar_setor", { p_id: id, p_nome: nome, p_libs: libs }),
  removerSetor: (id: string) => rpc("remover_setor", { p_id: id }),
  salvarRoteamento: (tipo: string, setor: string) => rpc("salvar_roteamento", { p_tipo: tipo, p_setor: setor }),
  salvarConfig: (pct: number, pag: number) => rpc("salvar_config", { p_pct: pct, p_pagamento: pag }),
  salvarUsuario: (id: string, nome: string, setores: string[], somente: boolean) => rpc("salvar_usuario", { p_id: id, p_nome: nome, p_setores: setores, p_somente: somente }),
  desativarUsuario: (id: string) => rpc("desativar_usuario", { p_id: id }),
  reativarUsuario: (id: string) => rpc("reativar_usuario", { p_id: id }),
  salvarModoTeste: (ligado: boolean) => rpc("salvar_modo_teste", { p_ligado: ligado }),
  agendaLoja: (dia: string) => rpc<any[]>("agenda_loja", { p_dia: dia }),
  adminUsuarios: async (corpo: any) => {
    const { data, error } = await sb.functions.invoke("admin-usuarios", { body: corpo });
    if (error) {
      let msg = error.message;
      try { const j = await (error as any).context?.json?.(); if (j?.erro) msg = j.erro; } catch { /* */ }
      throw new Error(msg);
    }
    if (data?.erro) throw new Error(data.erro);
    return data;
  },
};

// envio de fotos: comprime como o protótipo (máx. 1000px, JPEG 0,55) e guarda no Storage
export async function comprimir(file: File): Promise<Blob | null> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const max = 1000; let w = img.width, h = img.height;
    if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob | null>(res => cv.toBlob(b => res(b), "image/jpeg", 0.55));
  } finally { URL.revokeObjectURL(url); }
}
export async function enviarFotos(chamadoId: string, arquivos: { nome: string; blob: Blob }[]) {
  const itens: any[] = [];
  for (const a of arquivos) {
    const nomeLimpo = (a.nome || "foto").replace(/[^\w.\-]+/g, "_").replace(/\.[^.]+$/, "") + ".jpg";
    const path = `${chamadoId}/${crypto.randomUUID()}-${nomeLimpo}`;
    const { error } = await sb.storage.from("anexos").upload(path, a.blob, { contentType: "image/jpeg" });
    if (error) throw new Error("Não foi possível enviar a foto " + a.nome);
    itens.push({ tipo: "img", nome: a.nome || nomeLimpo, storage_path: path });
  }
  return itens;
}
