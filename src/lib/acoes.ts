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
  definirFabrica: (id: string, fab: string) => rpc("definir_fabrica", { p_id: id, p_fab: fab }),
  alterarPrazo: (id: string, data: string) => rpc("alterar_prazo", { p_id: id, p_data: nz(data) }),
  adicionarNota: (id: string, texto: string) => rpc("adicionar_nota", { p_id: id, p_texto: texto }),
  salvarTratativa: (id: string, campos: any) => rpc("salvar_tratativa", { p_id: id, p_campos: campos }),
  alternarMarcacao: (id: string, campo: string) => rpc("alternar_marcacao", { p_id: id, p_campo: campo }),
  entregaParaFabrica: (id: string) => rpc("entrega_para_fabrica", { p_id: id }),
  encaminharSetor: (id: string, setor: string) => rpc("encaminhar_setor", { p_id: id, p_setor: setor }),
  alterarStatusCliente: (id: string, novo: string, dataLoja?: string) => rpc("alterar_status_cliente", { p_id: id, p_novo: novo, ...(dataLoja ? { p_data_loja: dataLoja } : {}) }),
  direcionarConsultor: (id: string, consultor: string, dataVisita: string, endereco: string) =>
    rpc("direcionar_consultor", { p_id: id, p_consultor: consultor, p_data_visita: nz(dataVisita), p_endereco: endereco || "" }),
  agendarLoja: (id: string, dataLoja: string, medidas: string, obs: string, querProjeto?: string) =>
    rpc("agendar_loja", { p_id: id, p_data_loja: nz(dataLoja && dataLoja.length === 10 ? dataLoja + "T09:00" : dataLoja), p_medidas: medidas, p_obs: obs, p_quer_projeto: querProjeto || null }),
  vendedorStatus: (id: string, status: string, data: string, parecer: string) => rpc("vendedor_status", { p_id: id, p_status: status, p_data: nz(data), p_parecer: parecer || "" }),
  pedirAcompanhamento: (id: string, motivo: string) => rpc("pedir_acompanhamento", { p_id: id, p_motivo: motivo }),
  assumirAcompanhamento: (id: string) => rpc("assumir_acompanhamento", { p_id: id }),
  encerrarAcompanhamento: (id: string, obs: string) => rpc("encerrar_acompanhamento", { p_id: id, p_obs: obs || "" }),
  iniciarAtendimento: (id: string) => rpc("iniciar_atendimento", { p_id: id }),
  cobrarParecer: (id: string) => rpc("cobrar_parecer", { p_id: id }),
  solicitarAtendimento: (id: string) => rpc("solicitar_atendimento", { p_id: id }),
  cancelarPedidoAtendimento: (id: string) => rpc("cancelar_pedido_atendimento", { p_id: id }),
  responderPedidoAtendimento: (id: string, aprovar: boolean) => rpc("responder_pedido_atendimento", { p_id: id, p_aprovar: aprovar }),
  designarProjetista: (id: string, atendente: string) => rpc("designar_projetista", { p_id: id, p_atendente: atendente }),
  marcarComparecimento: (id: string, acao: "chegou" | "nao_compareceu" | "voltou") => rpc("marcar_comparecimento", { p_id: id, p_acao: acao }),
  reagendarLoja: (id: string, nova: string) => rpc("reagendar_loja", { p_id: id, p_nova: nz(nova) }),
  trocarVendedor: (id: string, novo: string) => rpc("trocar_vendedor", { p_id: id, p_novo: novo }),
  solicitarTransferencia: (id: string, para: string) => rpc<string>("solicitar_transferencia", { p_id: id, p_para: para }),
  responderTransferencia: (id: string, aceitar: boolean, origem: "detalhe" | "aprovacoes" = "detalhe") =>
    rpc("responder_transferencia", { p_id: id, p_aceitar: aceitar, p_origem: origem }),
  cancelarTransferencia: (id: string) => rpc("cancelar_transferencia", { p_id: id }),
  registrarVenda: (id: string, numero: string, valor: number, data: string, vendedor: string, gerente: string) =>
    rpc("registrar_venda", { p_id: id, p_numero: numero, p_valor: valor, p_data: nz(data), p_vendedor: vendedor, p_gerente: nz(gerente) }),
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
  salvarConfig: (pct: number, pag: number, valorMkt?: number) => rpc("salvar_config", { p_pct: pct, p_pagamento: pag, p_valor_mkt: valorMkt ?? null }),
  salvarUsuario: (id: string, nome: string, setores: string[], somente: boolean) => rpc("salvar_usuario", { p_id: id, p_nome: nome, p_setores: setores, p_somente: somente }),
  desativarUsuario: (id: string) => rpc("desativar_usuario", { p_id: id }),
  reativarUsuario: (id: string) => rpc("reativar_usuario", { p_id: id }),
  linkAgendaPublica: () => rpc<any>("link_agenda_publica"),
  gerarLinkAgendaPublica: (ativar: boolean) => rpc<string>("gerar_link_agenda_publica", { p_ativar: ativar }),
  agendaPublicaDia: async (token: string, dia: string) => {
    if ((import.meta as any).env?.VITE_MOCK) return ((window as any).__agendaPublicaMock || []) as any[];
    return (await rpc<any[]>("agenda_publica_dia", { p_token: token, p_dia: dia })) || [];
  },
  agendaPublicaVendedores: async (token: string) => {
    if ((import.meta as any).env?.VITE_MOCK) return [{ id: "v1", nome: "Giovanna" }, { id: "v2", nome: "Lucas" }, { id: "v3", nome: "Roy" }];
    return (await rpc<any[]>("agenda_publica_vendedores", { p_token: token })) || [];
  },
  agendaPublicaAssumir: async (token: string, id: string, vendedor: string | null, nomeOutro: string) => {
    if ((import.meta as any).env?.VITE_MOCK) return { nome: nomeOutro || "Lucas", externo: !vendedor };
    return rpc<any>("agenda_publica_assumir", { p_token: token, p_id: id, p_vendedor: vendedor, p_nome_outro: nomeOutro });
  },
  agendaPublicaAvisar: async (token: string, id: string) => {
    if ((import.meta as any).env?.VITE_MOCK) return { avisados: 1, vendedor: true };
    return rpc<any>("agenda_publica_avisar", { p_token: token, p_id: id });
  },
  salvarModoTeste: (ligado: boolean) => rpc("salvar_modo_teste", { p_ligado: ligado }),
  salvarMontador: (id: string | null, nome: string, telefone: string) => rpc("salvar_montador", { p_id: id, p_nome: nome, p_telefone: telefone }),
  ativarMontador: (id: string, ativo: boolean) => rpc("ativar_montador", { p_id: id, p_ativo: ativo }),
  posvendaRelato: (id: string, origem: string, peca: string) => rpc("posvenda_relato", { p_id: id, p_origem: origem, p_peca: peca }),
  salvarPosvenda: (id: string, p: any) => rpc("salvar_posvenda", { p_id: id, p }),
  posvendaEncaminhar: (id: string, tipo: string, motivo: string) => rpc<string>("posvenda_encaminhar", { p_id: id, p_tipo: tipo, p_motivo: motivo }),
  listarMetasMkt: async (de: string, ate: string) => {
    if ((import.meta as any).env?.VITE_MOCK) return ((window as any).__metasMock || []) as any[];
    const { data, error } = await sb.from("mkt_metas").select("*").gte("dia", de).lte("dia", ate).order("dia");
    if (error) throw new Error(error.message);
    return (data || []) as any[];
  },
  listarPagamentosMkt: async (de: string, ate: string) => {
    if ((import.meta as any).env?.VITE_MOCK) return [] as any[];
    const { data, error } = await sb.from("mkt_pagamentos").select("*").eq("de", de).eq("ate", ate);
    if (error) throw new Error(error.message);
    return (data || []) as any[];
  },
  salvarMetaMkt: (dia: string, meta: number, valor: number, obs: string) => rpc("salvar_meta_mkt", { p_dia: dia, p_meta: meta, p_valor: valor, p_obs: obs || "" }),
  removerMetaMkt: (dia: string) => rpc("remover_meta_mkt", { p_dia: dia }),
  aprovarPagamentoMkt: (op: string, de: string, ate: string) => rpc("aprovar_pagamento_mkt", { p_op: op, p_de: de, p_ate: ate }),
  cancelarAprovacaoMkt: (id: string) => rpc("cancelar_aprovacao_mkt", { p_id: id }),
  listarRoteiros: async () => {
    if ((import.meta as any).env?.VITE_MOCK) return ((window as any).__roteirosMock || []) as any[];
    const { data, error } = await sb.from("roteiros").select("*").order("categoria").order("situacao");
    if (error) throw new Error(error.message);
    return (data || []) as any[];
  },
  salvarRoteiro: (id: string | null, p: any) => rpc<string>("salvar_roteiro", { p_id: id, p }),
  aprovarRoteiro: (id: string) => rpc("aprovar_roteiro", { p_id: id }),
  removerRoteiro: (id: string) => rpc("remover_roteiro", { p_id: id }),
  agendaLoja: (dia: string) => rpc<any[]>("agenda_loja", { p_dia: dia }),
  adminUsuarios: async (corpo: any) => {
    // falhas passageiras do servidor de funções (502/503, queda de rede) são tentadas de novo — só no modo de teste, que não grava nada
    let data: any, error: any;
    const tentativas = ["entrar_como", "voltar"].includes(corpo?.acao) ? 4 : 1;
    for (let t = 0; t < tentativas; t++) {
      ({ data, error } = await sb.functions.invoke("admin-usuarios", { body: corpo }));
      const st = error?.context?.status;
      const passageiro = error && (error.name === "FunctionsFetchError" || error.name === "FunctionsRelayError" || st === 502 || st === 503 || st === 504);
      if (!passageiro) break;
      await new Promise(r => setTimeout(r, 800 * (t + 1)));
    }
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
// ---------- vídeos e PDFs ----------
export const LIMITE_ARQUIVO = 30 * 1024 * 1024; // igual ao limite do armazenamento
const tipoArquivo = (f: File) => f.type.startsWith("image/") ? "img" : f.type.startsWith("video/") ? "video" : (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) ? "pdf" : null;
export { tipoArquivo };
// vídeo: reduz para ~640px e ~0,8 Mbps (gravando o vídeo num canvas). Leva o tempo do vídeo. Se o navegador não suportar, envia o original (até 30 MB).
export async function comprimirVideo(file: File, progresso?: (pct: number) => void): Promise<Blob> {
  const leve = file.size <= 6 * 1024 * 1024;
  const MR: any = (window as any).MediaRecorder;
  if (leve || !MR) { if (file.size > LIMITE_ARQUIVO) throw new Error("Vídeo muito grande (máx. 30 MB). Grave um vídeo mais curto."); return file; }
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.src = url; v.muted = true; v.playsInline = true; (v as any).preload = "auto";
    await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error("Não consegui ler este vídeo")); });
    const max = 640; let w = v.videoWidth || 640, h = v.videoHeight || 360;
    if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r / 2) * 2; h = Math.round(h * r / 2) * 2; }
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const ctx = cv.getContext("2d")!;
    const stream: MediaStream = (cv as any).captureStream(24);
    try { const src: MediaStream = (v as any).captureStream ? (v as any).captureStream() : (v as any).mozCaptureStream(); src.getAudioTracks().forEach(t => stream.addTrack(t)); v.muted = false; v.volume = 0; } catch { /* sem áudio */ }
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find(t => MR.isTypeSupported && MR.isTypeSupported(t)) || "";
    const rec = new MR(stream, { mimeType: mime || undefined, videoBitsPerSecond: 800_000, audioBitsPerSecond: 64_000 });
    const partes: Blob[] = [];
    rec.ondataavailable = (e: any) => { if (e.data && e.data.size) partes.push(e.data); };
    const fim = new Promise<void>(res => { rec.onstop = () => res(); });
    let ativo = true;
    const desenhar = () => { if (!ativo) return; ctx.drawImage(v, 0, 0, w, h); if (progresso && v.duration) progresso(Math.min(99, Math.round(v.currentTime / v.duration * 100))); requestAnimationFrame(desenhar); };
    rec.start(1000); await v.play(); desenhar();
    await new Promise<void>(res => { v.onended = () => res(); });
    ativo = false; rec.stop(); await fim;
    const out = new Blob(partes, { type: (mime || "video/webm").split(";")[0] });
    if (!out.size || out.size >= file.size) { if (file.size > LIMITE_ARQUIVO) throw new Error("Vídeo muito grande (máx. 30 MB)."); return file; }
    if (out.size > LIMITE_ARQUIVO) throw new Error("Mesmo reduzido, o vídeo passou de 30 MB. Grave um vídeo mais curto.");
    progresso && progresso(100);
    return out;
  } finally { URL.revokeObjectURL(url); }
}
// envia vídeos/PDFs já preparados para o armazenamento
export async function enviarArquivos(chamadoId: string, arquivos: { nome: string; blob: Blob; tipo: "video" | "pdf" }[]) {
  const itens: any[] = [];
  for (const a of arquivos) {
    if (a.blob.size > LIMITE_ARQUIVO) throw new Error(a.nome + ": arquivo maior que 30 MB");
    const ext = a.tipo === "pdf" ? ".pdf" : (a.blob.type.includes("mp4") ? ".mp4" : a.blob.type.includes("quicktime") ? ".mov" : ".webm");
    const base = (a.nome || a.tipo).replace(/[^\w.\-]+/g, "_").replace(/\.[^.]+$/, "");
    const path = `${chamadoId}/${crypto.randomUUID()}-${base}${ext}`;
    const tipo = a.tipo === "pdf" ? "application/pdf" : (a.blob.type || "video/webm");
    const { error } = await sb.storage.from("anexos").upload(path, a.blob, { contentType: tipo });
    if (error) throw new Error("Não foi possível enviar " + a.nome + (error.message ? " (" + error.message + ")" : ""));
    itens.push({ tipo: a.tipo, nome: a.nome || base + ext, storage_path: path });
  }
  return itens;
}

// separa e prepara o que o usuário escolheu: fotos comprimidas, vídeos reduzidos, PDFs como estão
export async function prepararArquivos(files: File[], status?: (txt: string) => void) {
  const fotos: { nome: string; blob: Blob }[] = [], outros: { nome: string; blob: Blob; tipo: "video" | "pdf" }[] = [], recusados: string[] = [];
  for (const f of files) {
    const tp = tipoArquivo(f);
    if (tp === "img") { const b = await comprimir(f); if (b) fotos.push({ nome: f.name, blob: b }); else recusados.push(f.name); }
    else if (tp === "pdf") { if (f.size > LIMITE_ARQUIVO) recusados.push(f.name + " (maior que 30 MB)"); else outros.push({ nome: f.name, blob: f, tipo: "pdf" }); }
    else if (tp === "video") {
      try { status && status("Reduzindo o vídeo " + f.name + "…"); const b = await comprimirVideo(f, p => status && status("Reduzindo o vídeo " + f.name + "… " + p + "%")); outros.push({ nome: f.name, blob: b, tipo: "video" }); }
      catch (e: any) { recusados.push(f.name + " (" + (e.message || "erro no vídeo") + ")"); }
    } else recusados.push(f.name + " (tipo não aceito)");
  }
  status && status("");
  return { fotos, outros, recusados };
}
export const ACEITA_ANEXO = "image/*,video/*,application/pdf,.pdf";

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
