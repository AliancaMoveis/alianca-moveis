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
  trocarConsultor: (id: string, consultor: string, motivo: string) => rpc("trocar_consultor", { p_id: id, p_consultor: consultor, p_motivo: motivo }),
  marcarLitoral: (id: string, sim: boolean) => rpc("marcar_litoral", { p_id: id, p_sim: sim }),
  litoralDecidir: (id: string, aprovar: boolean, obs = "") => rpc("litoral_decidir", { p_id: id, p_aprovar: aprovar, p_obs: obs }),
  pedirVendedorLoja: (id: string, sim: boolean) => rpc("pedir_vendedor_loja", { p_id: id, p_sim: sim }),
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
  medidaDirecionar: (id: string, medidor: string, data: string, endereco: string) => rpc("medida_direcionar", { p_id: id, p_medidor: medidor, p_data: nz(data), p_endereco: endereco || "" }),
  medidaRealizada: (id: string, medidas: string, obs: string) => rpc("medida_realizada", { p_id: id, p_medidas: medidas || "", p_obs: obs || "" }),
  medidaContato: (id: string, data: string | null, obs = "") => rpc("medida_contato", { p_id: id, p_data: data ? (data.length === 10 ? data + "T09:00" : data) : null, p_obs: obs }),
  medidaRefazer: (id: string, motivo: string) => rpc("medida_refazer", { p_id: id, p_motivo: motivo }),
  medidaEmObra: (id: string, previsao: string, obs: string) => rpc("medida_em_obra", { p_id: id, p_previsao: previsao || null, p_obs: obs || "" }),
  medidaPendente: (id: string, obs: string) => rpc("medida_pendente", { p_id: id, p_obs: obs || "" }),
  medidasImportar: (linhas: any[], aplicar: boolean) => rpc<any>("medidas_importar", { p: linhas, p_aplicar: aplicar }),
  medidaLiberar: (id: string, obs: string) => rpc<string>("medida_liberar", { p_id: id, p_obs: obs || "" }),
  medidaAprovarVisita360: (id: string, visita: string, obs = "") => rpc<string>("medida_aprovar_visita360", { p_id: id, p_visita: visita, p_obs: obs }),
  solicitarReembolso: async (uid: string, tipo: string, valor: number, data: string, descricao: string, foto: Blob, chamado?: string) => {
    const pdf = foto.type === "application/pdf";
    const path = `${uid}/${crypto.randomUUID()}.${pdf ? "pdf" : "jpg"}`;
    const { error } = await sb.storage.from("reembolsos").upload(path, foto, { contentType: pdf ? "application/pdf" : "image/jpeg" });
    if (error) throw new Error("Não foi possível enviar a foto do comprovante");
    return rpc<string>("solicitar_reembolso", { p_tipo: tipo, p_valor: valor, p_data: data, p_descricao: descricao || "", p_comprovante: path, p_chamado: nz(chamado) });
  },
  validarVendasLote: (ids: string[], status: "efetivada" | "cancelada") => rpc<number>("validar_vendas_lote", { p_ids: ids, p_status: status }),
  aprovarReembolsosLote: (ids: string[]) => rpc<number>("aprovar_reembolsos_lote", { p_ids: ids }),
  decidirReembolso: (id: string, aprovar: boolean, motivo = "") => rpc("decidir_reembolso", { p_id: id, p_aprovar: aprovar, p_motivo: motivo }),
  urlComprovante: async (path: string) => { const { data } = await sb.storage.from("reembolsos").createSignedUrl(path, 600); return data?.signedUrl || ""; },
  finalizarAtendimento: (id: string, texto: string) => rpc("finalizar_atendimento", { p_id: id, p_texto: texto || "" }),
  cobrarParecer: (id: string) => rpc("cobrar_parecer", { p_id: id }),
  solicitarAtendimento: (id: string) => rpc("solicitar_atendimento", { p_id: id }),
  cancelarPedidoAtendimento: (id: string) => rpc("cancelar_pedido_atendimento", { p_id: id }),
  responderPedidoAtendimento: (id: string, aprovar: boolean) => rpc("responder_pedido_atendimento", { p_id: id, p_aprovar: aprovar }),
  designarProjetista: (id: string, atendente: string) => rpc("designar_projetista", { p_id: id, p_atendente: atendente }),
  marcarComparecimento: (id: string, acao: "chegou" | "nao_compareceu" | "voltou") => rpc("marcar_comparecimento", { p_id: id, p_acao: acao }),
  reagendarLoja: (id: string, nova: string, motivo = "") => rpc("reagendar_loja", { p_id: id, p_nova: nz(nova), p_motivo: motivo }),
  reagendarVisita: (id: string, nova: string, motivo = "") => rpc("reagendar_visita", { p_id: id, p_nova: nz(nova), p_motivo: motivo }),
  editarCliente: (id: string, p: any) => rpc("editar_cliente", { p_id: id, p }),
  trocarVendedor: (id: string, novo: string) => rpc("trocar_vendedor", { p_id: id, p_novo: novo }),
  solicitarTransferencia: (id: string, para: string) => rpc<string>("solicitar_transferencia", { p_id: id, p_para: para }),
  responderTransferencia: (id: string, aceitar: boolean, origem: "detalhe" | "aprovacoes" = "detalhe") =>
    rpc("responder_transferencia", { p_id: id, p_aceitar: aceitar, p_origem: origem }),
  cancelarTransferencia: (id: string) => rpc("cancelar_transferencia", { p_id: id }),
  registrarVenda: (id: string, numero: string, valor: number, data: string, vendedor: string, gerente: string, tipo = "", entrada: number | null = null) =>
    rpc("registrar_venda", { p_id: id, p_numero: numero, p_valor: valor, p_data: nz(data), p_vendedor: vendedor, p_gerente: nz(gerente), p_tipo: tipo, p_entrada: entrada }),
  confirmarVinda: (id: string, obs: string, desfazer = false) => rpc("confirmar_vinda_loja", { p_id: id, p_obs: obs || "", p_desfazer: desfazer }),
  consBloqueioSalvar: (p: any) => rpc<number>("consultor_bloqueio_salvar", { p }),
  consBloqueioRemover: (id: number) => rpc("consultor_bloqueio_remover", { p_id: id }),
  visitaRealizada: (id: string, obs = "") => rpc("visita_realizada", { p_id: id, p_obs: obs }),
  visitaRealizadaDesfazer: (id: string, motivo: string) => rpc("visita_realizada_desfazer", { p_id: id, p_motivo: motivo }),
  cancelouLoja: (id: string, obs: string, desfazer = false) => rpc("cancelou_loja", { p_id: id, p_obs: obs || "", p_desfazer: desfazer }),
  consultorSituacao: (id: string, status: string, obs: string) => rpc("consultor_situacao", { p_id: id, p_status: status, p_obs: obs || "" }),
  validarVenda: (id: string, status: string, entrada: number, promissorias: any[]) => rpc("validar_venda", { p_id: id, p_status: status, p_entrada: entrada || 0, p_promissorias: promissorias }),
  quitarPromissoria: (id: string, valor: number, numero: string, data: string) => rpc("quitar_promissoria", { p_id: id, p_valor: valor, p_numero: numero, p_data: nz(data) }),
  // vários nºs de venda no mesmo cliente: [{tipo: "pago"|"promissoria", numero, valor, vencimento?}]
  registrarVendaItens: (id: string, itens: any[], data: string, vendedor: string, gerente: string, substituir = false) =>
    rpc("registrar_venda_itens", { p_id: id, p_itens: itens, p_data: nz(data), p_vendedor: vendedor, p_gerente: nz(gerente), p_substituir: substituir }),
  decidirItensVenda: (id: string, itens: { id: string; status: string }[]) => rpc("decidir_itens_venda", { p_id: id, p_itens: itens }),
  corrigirItemVenda: (item: string, numero: string, valor: number, data: string, vencimento: string) =>
    rpc("corrigir_item_venda", { p_item: item, p_numero: numero, p_valor: valor, p_data: nz(data), p_vencimento: nz(vencimento) }),
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
  vendedorEscala: (id: string, fazProjeto: boolean, folga: number | null, turno: string) => rpc("vendedor_escala", { p_id: id, p_faz_projeto: fazProjeto, p_folga: folga, p_turno: turno }),
  vendedorIndisponivelCiente: (id: string, vend: string, motivo: string) => rpc("vendedor_indisponivel_ciente", { p_id: id, p_vend: vend, p_motivo: motivo }),
  erroVendaDefinir: (id: string, p: any) => rpc("erro_venda_definir", { p_id: id, p }),
  erroVendaResponder: (id: string, texto: string) => rpc("erro_venda_responder", { p_id: id, p_texto: texto }),
  medidaSolicitacaoEncaminhar: (id: string, obs: string) => rpc<string>("medida_solicitacao_encaminhar", { p_id: id, p_obs: obs }),
  juridicoCriar: (p: any) => rpc<string>("juridico_criar", { p }),
  juridicoSalvar: (id: string, p: any) => rpc("juridico_salvar", { p_id: id, p }),
  minhasMedidasChecklist: () => rpc<Record<string, string>>("minhas_medidas_checklist"),
  salvarUsuario: (id: string, nome: string, setores: string[], somente: boolean) => rpc("salvar_usuario", { p_id: id, p_nome: nome, p_setores: setores, p_somente: somente }),
  desativarUsuario: (id: string) => rpc("desativar_usuario", { p_id: id }),
  reativarUsuario: (id: string) => rpc("reativar_usuario", { p_id: id }),
  linkAgendaPublica: () => rpc<any>("link_agenda_publica"),
  gerarLinkAgendaPublica: (ativar: boolean) => rpc<string>("gerar_link_agenda_publica", { p_ativar: ativar }),
  agendaPublicaDia: async (token: string, dia: string) => {
    if ((import.meta as any).env?.VITE_MOCK) return ((window as any).__agendaPublicaMock || []) as any[];
    const [l, ex] = await Promise.all([
      rpc<any[]>("agenda_publica_dia", { p_token: token, p_dia: dia }),
      rpc<any[]>("agenda_publica_extra", { p_token: token, p_dia: dia }).catch(() => [] as any[]),
    ]);
    const m: Record<string, any> = {}; (ex || []).forEach((e: any) => (m[e.id] = e));
    return (l || []).map((x: any) => ({ ...x, telefone: m[x.id]?.telefone || "", obs: m[x.id]?.obs || "" }));
  },
  agendaPublicaVendedores: async (token: string) => {
    if ((import.meta as any).env?.VITE_MOCK) return [{ id: "v1", nome: "Giovanna" }, { id: "v2", nome: "Lucas" }, { id: "v3", nome: "Roy" }];
    return (await rpc<any[]>("agenda_publica_vendedores", { p_token: token })) || [];
  },
  agendaPublicaAssumir: async (token: string, id: string, vendedor: string | null, nomeOutro: string) => {
    if ((import.meta as any).env?.VITE_MOCK) return { nome: nomeOutro || "Lucas", externo: !vendedor };
    return rpc<any>("agenda_publica_assumir", { p_token: token, p_id: id, p_vendedor: vendedor, p_nome_outro: nomeOutro });
  },
  // vendedor cadastrado confirma com a senha; cliente com vendedor só depois de chamar 2x e ele não aparecer
  agendaPublicaAssumir2: async (token: string, id: string, vendedor: string | null, senha: string, nomeOutro: string) => {
    if ((import.meta as any).env?.VITE_MOCK) return senha === "errada" ? Promise.reject(new Error("Senha incorreta")) : { nome: nomeOutro || "Lucas", externo: !vendedor };
    const r = await rpc<any>("agenda_publica_assumir_v2", { p_token: token, p_id: id, p_vendedor: vendedor, p_senha: senha, p_nome_outro: nomeOutro });
    if (r && r.erro) throw new Error(r.erro);
    return r;
  },
  agendaPublicaVeioHoje: (token: string, id: string) => rpc("agenda_publica_veio_hoje", { p_token: token, p_id: id }),
  avaliacaoCriar2: (p: any) => rpc<{ id: string; token: string; reaproveitada: boolean }>("avaliacao_criar2", { p }),
  avaliacaoResponder3: (token: string, nps: number, estrelas: (number | null)[], comentario: string, podeLigar: boolean) =>
    (import.meta as any).env?.VITE_MOCK ? Promise.resolve({ ok: true, google: nps >= 9 ? "https://g.page/r/exemplo/review" : null }) : rpc<{ ok: boolean; google: string | null }>("avaliacao_responder3", { p_token: token, p_nps: nps, p_estrelas: estrelas, p_comentario: comentario, p_pode_ligar: podeLigar }),
  questionario: async () => { if ((import.meta as any).env?.VITE_MOCK) return null; const { data, error } = await sb.from("avaliacao_questionario").select("*").eq("id", 1).maybeSingle(); if (error) throw new Error(error.message); return data; },
  questionarioSalvar: (titulo: string, secoes: any[]) => rpc("avaliacao_questionario_salvar", { p_titulo: titulo, p_secoes: secoes }),
  avaliacaoCriar: (p: any) => rpc<{ id: string; token: string; reaproveitada: boolean }>("avaliacao_criar", { p }),
  avaliacaoEnviada: (id: string) => rpc("avaliacao_enviada", { p_id: id }),
  avaliacaoTratar: (id: string, obs: string) => rpc("avaliacao_tratar", { p_id: id, p_obs: obs }),
  avaliacaoGoogle: (url: string) => rpc("avaliacao_google_salvar", { p_url: url }),
  avaliacaoPublica: (token: string) => (import.meta as any).env?.VITE_MOCK ? import("./qualidade").then(q => ({ cliente: "Mariana", etapa: "montagem", responsavel: "João", servicoEm: "2026-10-18", respondida: false, titulo: q.QUESTIONARIO_PADRAO.titulo, secoes: q.QUESTIONARIO_PADRAO.secoes, pessoas: { Montador: "João", Vendedor: "Roy" } })) : rpc<any>("avaliacao_publica", { p_token: token }),
  avaliacaoResponder: (token: string, nps: number, estrelas: number[], comentario: string, podeLigar: boolean) =>
    (import.meta as any).env?.VITE_MOCK ? Promise.resolve({ ok: true, google: nps >= 9 ? "https://g.page/r/exemplo/review" : null }) : rpc<{ ok: boolean; google: string | null }>("avaliacao_responder2", { p_token: token, p_nps: nps, p_estrelas: estrelas, p_comentario: comentario, p_pode_ligar: podeLigar }),
  avaliacaoModelos: async () => { if ((import.meta as any).env?.VITE_MOCK) return null; const { data, error } = await sb.from("avaliacao_modelos").select("*").order("ordem"); if (error) throw new Error(error.message); return data || []; },
  avaliacaoModeloSalvar: (m: any) => rpc("avaliacao_modelo_salvar", { p_etapa: m.etapa, p_nome: m.nome, p_titulo: m.titulo, p_resp: m.resp, p_perguntas: m.perguntas, p_ativa: m.ativa }),
  avaliacoesListar: async (desde: string) => { const { data, error } = await sb.from("avaliacoes").select("*").gte("criado_em", desde).order("criado_em", { ascending: false }).limit(2000); if (error) throw new Error(error.message); return data || []; },
  agendaPublicaBuscar: async (token: string, q: string) => {
    if ((import.meta as any).env?.VITE_MOCK) return (((window as any).__agendaPublicaMock || []) as any[]).filter((x: any) => (x.cliente || "").toLowerCase().includes(q.toLowerCase())).map((x: any) => ({ ...x, dia: new Date().toISOString().slice(0, 10) }));
    return (await rpc<any[]>("agenda_publica_buscar", { p_token: token, p_q: q })) || [];
  },
  agendaLojaBuscar: (q: string) => rpc<any[]>("agenda_loja_buscar", { p_q: q }),
  chamarVendedor: (id: string, obs: string) => rpc<any>("chamar_vendedor", { p_vendedor: id, p_obs: obs }),
  chamarVendedoresFila: (obs: string) => rpc<any>("chamar_vendedores_fila", { p_obs: obs }),
  baseClientesConsulta: (q: string) => rpc<any[]>("base_clientes_consulta", { p_q: q }),
  agendaPublicaAvisar: async (token: string, id: string) => {
    if ((import.meta as any).env?.VITE_MOCK) return { avisados: 1, vendedor: true };
    return rpc<any>("agenda_publica_avisar", { p_token: token, p_id: id });
  },
  agendaPublicaAnexosQtd: async (token: string, dia: string): Promise<Record<string, number>> => {
    if ((import.meta as any).env?.VITE_MOCK) return Object.fromEntries((((window as any).__agendaPublicaMock || []) as any[]).map((x: any) => [x.id, 3]));
    return (await rpc<any>("agenda_publica_anexos_qtd", { p_token: token, p_dia: dia })) || {};
  },
  // "Ver imagens" na tela da loja: confirma quem é; se não for o projetista programado, só abre com assumir = true
  agendaPublicaImagens: async (token: string, id: string, vendedor: string, assumir: boolean, senha = ""): Promise<any> => {
    if ((import.meta as any).env?.VITE_MOCK) return assumir || vendedor === "v1" ? { ok: true, nome: "Giovanna", trocou: assumir, arquivos: [{ tipo: "img", nome: "planta.jpg", url: "/logo.png" }, { tipo: "img", nome: "parede.jpg", url: "/icon-512.png" }] } : { confirmar: true, programado: "Giovanna" };
    const { data, error } = await sb.functions.invoke("agenda-imagens", { body: { token, id, vendedor, assumir, senha } });
    if (error) { let m = error.message; try { const j = await (error as any).context.json(); if (j && j.erro) m = j.erro; } catch { /* */ } throw new Error(m); }
    if (data && data.erro) throw new Error(data.erro);
    return data;
  },
  salvarModoTeste: (ligado: boolean) => rpc("salvar_modo_teste", { p_ligado: ligado }),
  retornoMontadorDefinir: (id: string, p: any) => rpc("retorno_montador_definir", { p_id: id, p }),
  montadorSalvar: (p: any) => rpc<string>("montador_salvar", { p }),
  salvarMontador: (id: string | null, nome: string, telefone: string) => rpc("salvar_montador", { p_id: id, p_nome: nome, p_telefone: telefone }),
  ativarMontador: (id: string, ativo: boolean) => rpc("ativar_montador", { p_id: id, p_ativo: ativo }),
  posvendaRelato: (id: string, origem: string, peca: string) => rpc("posvenda_relato", { p_id: id, p_origem: origem, p_peca: peca }),
  posvendaAbertura: (id: string, p: any) => rpc("posvenda_abertura", { p_id: id, p }),
  ckBloqueioSalvar: (p: any) => rpc<number>("checklist_bloqueio_salvar", { p }),
  ckBloqueioReabrir: (id: number) => rpc("checklist_bloqueio_reabrir", { p_id: id }),
  medidasCruzSalvar: (linhas: any[]) => rpc<{ novos: number; atualizados: number }>("medidas_cruzamento_salvar", { p: linhas }),
  medidasCruzTratar: (venda: string, tratativa: string, obs: string, resultado?: string) => rpc("medidas_cruzamento_tratar", { p_venda: venda, p_tratativa: tratativa, p_obs: obs, p_resultado: resultado || null }),
  checklistSincronizar: (linhas: any[], aplicar: boolean, forcar = false) => rpc<any>("checklist_sincronizar", { p: linhas, p_aplicar: aplicar, p_forcar: forcar }),
  checklistAgendadosPlanilha: (linhas: any[], aplicar: boolean, trocarProj: boolean, corrigir: boolean) => rpc<any>("checklist_agendados_planilha", { p: linhas, p_aplicar: aplicar, p_trocar_proj: trocarProj, p_corrigir: corrigir }),
  checklistDiasPlanilha: (linhas: any[], aplicar: boolean) => rpc<any>("checklist_dias_planilha", { p: linhas, p_aplicar: aplicar }),
  checklistImportar: (linhas: any[]) => rpc<{ novos: number; ignorados: number; agendados?: number }>("checklist_importar", { p: linhas }),
  vendedorCadastrar: (nome: string, email: string, senha: string, freelancer: boolean, fazProjeto: boolean) => rpc<string>("vendedor_cadastrar", { p_nome: nome, p_email: email, p_senha: senha, p_freelancer: freelancer, p_faz_projeto: fazProjeto }),
  vendedorDescadastrar: (id: string) => rpc<number>("vendedor_descadastrar", { p_id: id }),
  vendedorReativar: (id: string) => rpc("vendedor_reativar", { p_id: id }),
  vendedorFreelancer: (id: string, sim: boolean) => rpc("vendedor_freelancer", { p_id: id, p_sim: sim }),
  vendedorEscalaV2: (id: string, fazProjeto: boolean, folga: number | null, turno: string, domingo: string | null, naAgenda: boolean) => rpc("vendedor_escala_v2", { p_id: id, p_faz_projeto: fazProjeto, p_folga: folga, p_turno: turno, p_domingo: domingo, p_na_agenda: naAgenda }),
  vendedorDia: (id: string, dia: string, tipo: string, obs = "") => rpc("vendedor_dia", { p_id: id, p_dia: dia, p_tipo: tipo, p_obs: obs }),
  mktDefinirResponsavel: (id: string, uid: string) => rpc("mkt_definir_responsavel", { p_id: id, p_uid: uid }),
  exactConfirmarVenda: (id: string, numero: string, valor: number, data: string | null, vendedor: string, situacao: string, vendedorId: string | null) =>
    rpc<string>("exact_confirmar_venda", { p_id: id, p_numero: numero, p_valor: valor, p_data: data, p_vendedor: vendedor, p_situacao: situacao, p_vendedor_id: vendedorId }),
  clientePagadorSalvar: (id: string, venda: string, p: { nome: string; telefone1?: string; telefone2?: string; endereco?: string; idTatico?: string }) => rpc("cliente_pagador_salvar", { p_id: id, p_venda: venda, p }),
  exactChecklistMarcar: (numero: string, chamado: string | null, p: Record<string, any>, desfazer = false) => rpc("exact_checklist_marcar", { p_numero: numero, p_chamado: chamado, p, p_desfazer: desfazer }),
  vendaConfEnviar: (linhas: any[]) => rpc<number>("venda_conf_enviar", { p: linhas }),
  vendaConfExcluir: (numeros: string[]) => (import.meta as any).env?.VITE_MOCK ? Promise.resolve(numeros.length) : rpc<number>("venda_conf_excluir", { p_numeros: numeros }),
  vendaConfPromissoria: (numero: string, total: number, entrada: number) => (import.meta as any).env?.VITE_MOCK ? Promise.resolve("ok") : rpc<string>("venda_conf_promissoria", { p_numero: numero, p_total: total, p_entrada: entrada }),
  // 🏷 Consulta de produto (etiqueta do Tático)
  produtoBuscar: (codigo: string) => (import.meta as any).env?.VITE_MOCK ? Promise.resolve(((window as any).__prodMock || []).find((x: any) => x.codigo === codigo) ? { ...((window as any).__prodMock || []).find((x: any) => x.codigo === codigo), variacoes: [] } : null) : rpc<any>("produto_buscar", { p_codigo: codigo }),
  produtoLista: (q = "") => (import.meta as any).env?.VITE_MOCK ? Promise.resolve((window as any).__prodMock || []) : rpc<any[]>("produto_lista", { p_q: q }),
  produtoImportar: (linhas: any[]) => (import.meta as any).env?.VITE_MOCK ? Promise.resolve({ novos: linhas.length, atualizados: 0, erros: [] }) : rpc<any>("produto_importar", { p: linhas }),
  produtoImportarFim: (locais: string[], codigos: string[]) => (import.meta as any).env?.VITE_MOCK ? Promise.resolve({ zerados: 0 }) : rpc<any>("produto_importar_fim", { p_locais: locais, p_codigos: codigos }),
  produtoTotal: () => (import.meta as any).env?.VITE_MOCK ? Promise.resolve({ total: ((window as any).__prodMock || []).length, congelados: 0 }) : rpc<any>("produto_total", {}),
  produtoExcluir: (codigo: string) => (import.meta as any).env?.VITE_MOCK ? Promise.resolve(null) : rpc("produto_excluir", { p_codigo: codigo }),
  produtoVenda: (codigo: string, liberar: boolean, motivo = "") => (import.meta as any).env?.VITE_MOCK ? Promise.resolve(null) : rpc("produto_venda", { p_codigo: codigo, p_liberar: liberar, p_motivo: motivo }),
  produtoMostruario: (codigo: string, liberar: boolean) => (import.meta as any).env?.VITE_MOCK ? Promise.resolve(null) : rpc("produto_mostruario", { p_codigo: codigo, p_liberar: liberar }),
  produtoSalvar: (p: Record<string, any>) => (import.meta as any).env?.VITE_MOCK ? Promise.resolve(p.codigo) : rpc<string>("produto_salvar", { p }),
  vendaConfLista: () => (import.meta as any).env?.VITE_MOCK ? Promise.resolve(((window as any).__confMock || []) as any[]) : rpc<any[]>("venda_conf_lista", {}),
  vendaConfEditar: (numero: string, p: Record<string, any>) => (import.meta as any).env?.VITE_MOCK ? Promise.resolve(null) : rpc("venda_conf_editar", { p_numero: numero, p }),
  vendaConfDecidir: (numero: string, acao: string) => (import.meta as any).env?.VITE_MOCK ? Promise.resolve(acao) : rpc<string>("venda_conf_decidir", { p_numero: numero, p_acao: acao }),
  exactChecklistLista: () => rpc<any[]>("exact_checklist_lista", {}),
  cienteCancelamento: (id: string) => rpc("ciente_cancelamento", { p_id: id }),
  excluirClienteMkt: async (id: string, motivo: string) => {
    const paths = await rpc<string[]>("mkt_excluir_cliente", { p_id: id, p_motivo: motivo });
    if (paths && paths.length) await sb.storage.from("anexos").remove(paths).catch(() => null);
    return paths;
  },
  vendedorFerias: (id: string, de: string | null, ate: string | null) => rpc("vendedor_ferias", { p_id: id, p_de: de, p_ate: ate }),
  vendedorBuscar: (q: string) => rpc<any[]>("vendedor_buscar_clientes", { p_q: q }),
  vendedorAssumir: (id: string) => rpc("vendedor_assumir", { p_id: id }),
  salvarMeusDados: (nomeCompleto: string, telefone: string) => rpc("salvar_meus_dados", { p_nome_completo: nomeCompleto, p_telefone: telefone }),
  checklistRegistrar: (id: string, p: any) => rpc("checklist_registrar", { p_id: id, p }),
  salvarChecklistAgenda: (p: any) => rpc("salvar_checklist_agenda", { p }),
  checklistExcluir: (ids: string[]) => rpc<number>("checklist_excluir", { p_ids: ids }),
  checklistPedirMedida: (id: string, obs: string) => rpc<string>("checklist_pedir_medida", { p_id: id, p_obs: obs }),
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
  agendaLoja: (dia: string) => rpc<any[]>("agenda_loja_v3", { p_dia: dia }),
  registrarPorta: (p: any) => rpc<string>("registrar_cliente_porta", { p }),
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
  if (!(file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name))) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const max = 1000; let w = img.width, h = img.height;
    if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob | null>(res => cv.toBlob(b => res(b), "image/jpeg", 0.55));
  } catch { return null; } // formato que o navegador não abre (ex.: HEIC no Windows/Android): vai o arquivo original
  finally { URL.revokeObjectURL(url); }
}
// ---------- vídeos e PDFs ----------
export const LIMITE_ARQUIVO = 30 * 1024 * 1024; // igual ao limite do armazenamento
// pelo tipo do arquivo e, quando o celular não informa o tipo, pela extensão do nome
const tipoArquivo = (f: File) => (f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name)) ? "img"
  : (f.type.startsWith("video/") || /\.(mp4|mov|m4v|3gp|3gpp|webm|mkv|avi|mpe?g)$/i.test(f.name)) ? "video"
  : (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) ? "pdf" : null;
const mimeImg = (f: File) => f.type || (/\.png$/i.test(f.name) ? "image/png" : /\.hei[cf]$/i.test(f.name) ? "image/heic" : "image/jpeg");
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
    if (tp === "img") {
      const b = await comprimir(f);
      if (b) fotos.push({ nome: f.name, blob: b });
      else if (f.size > LIMITE_ARQUIVO) recusados.push(f.name + " (maior que 30 MB)");
      else fotos.push({ nome: f.name, blob: f.slice(0, f.size, mimeImg(f)), original: true } as any);
    }
    else if (tp === "pdf") { if (f.size > LIMITE_ARQUIVO) recusados.push(f.name + " (maior que 30 MB)"); else outros.push({ nome: f.name, blob: f, tipo: "pdf" }); }
    else if (tp === "video") {
      try { status && status("Reduzindo o vídeo " + f.name + "…"); const b = await comprimirVideo(f, p => status && status("Reduzindo o vídeo " + f.name + "… " + p + "%")); outros.push({ nome: f.name, blob: b, tipo: "video" }); }
      catch (e: any) { recusados.push(f.name + " (" + (e.message || "erro no vídeo") + ")"); }
    } else recusados.push(f.name + " (tipo não aceito)");
  }
  status && status("");
  return { fotos, outros, recusados };
}
export const ACEITA_ANEXO = "image/*,video/*,application/pdf,.pdf,.heic,.heif,.jpg,.jpeg,.png,.mp4,.mov,.3gp";

export async function enviarFotos(chamadoId: string, arquivos: { nome: string; blob: Blob }[]) {
  const itens: any[] = [];
  for (const a of arquivos) {
    // foto comprimida = JPEG; original (formato que o navegador não abre, ex.: HEIC) vai como está
    const orig = (a as any).original, tipo = orig ? (a.blob.type || "image/jpeg") : "image/jpeg";
    const ext = orig ? (tipo.includes("png") ? ".png" : tipo.includes("hei") ? ".heic" : ".jpg") : ".jpg";
    const nomeLimpo = (a.nome || "foto").replace(/[^\w.\-]+/g, "_").replace(/\.[^.]+$/, "") + ext;
    const path = `${chamadoId}/${crypto.randomUUID()}-${nomeLimpo}`;
    const { error } = await sb.storage.from("anexos").upload(path, a.blob, { contentType: tipo });
    if (error) throw new Error("Não foi possível enviar a foto " + a.nome + (error.message ? " (" + error.message + ")" : ""));
    itens.push({ tipo: "img", nome: a.nome || nomeLimpo, storage_path: path });
  }
  return itens;
}
