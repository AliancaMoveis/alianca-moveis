-- Produtos: estoque por local (MATRIZ = loja, LINHA PRONTA = depósito) e busca pelo nome (cada palavra, sem acento).
-- Regra de negócio (no app): na MATRIZ, saldo 1 é o mostruário — não está disponível para venda.
alter table public.produtos add column if not exists locais jsonb not null default '[]'::jsonb;
-- produto_salvar: grava p->'locais' quando vier (aplicado direto no banco, ver pg_get_functiondef)
create or replace function public.produto_lista(p_q text default '')
 returns setof public.produtos language sql stable security definer set search_path to '' as $function$
  select p.* from public.produtos p where public.pode_produtos()
    and not exists (
      select 1 from regexp_split_to_table(btrim(coalesce(p_q,'')), '\s+') w
       where w <> '' and not (translate(lower(concat_ws(' ', p.nome, p.cor, p.codigo, p.ref, p.fabricante, p.tamanho, p.modulo)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
                              like '%' || translate(lower(w), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') || '%'))
  order by p.nome, p.cor limit 300 $function$;
-- produto_importar: com planilhas separadas (MATRIZ / LINHA PRONTA), mantém os locais que não vieram no arquivo
-- e recalcula estoque/reservas/expedição/saldo/deposito somando os locais (aplicado direto no banco).
-- App: itens com descrição em letras minúsculas (linha projetado) não são importados.
-- Setor TI e cadastro de produtos com acesso a Fábricas (fornecedores e telefones dos representantes)
update public.setores set lib_cadastros = true where id = 'produtos';
-- Cadastro de usuários para o TI (setor produtos): pode_usuarios(), usuarios_pode(p_id, p_setores), _setor_restrito(setor)
-- salvar_usuario / desativar_usuario / reativar_usuario: checam usuarios_pode; edge function admin-usuarios v4 idem.
-- produto_importar: ignora no servidor descrições com letra minúscula (linha projetado) e devolve 'projetado'.
-- Trava de edição: pode_editar_produtos() (Gestão e TI), pode_liberar_mostruario() (+ gerentes), pode_produtos() = consulta.
-- produtos: congelado/_em/_por/_motivo (tirar de venda), mostruario_liberado/_em/_por.
-- RPCs: produto_excluir, produto_venda(cod, liberar, motivo), produto_mostruario(cod, liberar), produto_total().
-- Consulta para vendedor (teste: Lucas 573aa574…): pode_produtos() inclui o uid; produto_lista exige 2+ letras para quem não edita.
-- pode_produtos(): todos os vendedores (setor atendente_cliente) passam a consultar.
-- pode_produtos(): + call center e Salete, Francyne, Francilene, Sônia (assistência) — só consulta.
-- produto_importar_fim(locais, codigos): o que tinha o estoque do arquivo e não veio nele fica zerado nesse estoque (Tático omite itens zerados).
-- Checklist: Wagner na agenda (inicioProjetista 2026-10-26, trabalhaFeriado); salvar_checklist_agenda preserva essas chaves.
-- checklist_agendados_planilha(+p_liberar): acrescenta dias futuros, readequa outra data (p_corrigir), tira quem saiu da planilha (p_liberar).
-- Pré-pedido do vendedor (teste: só Lucas): tabela pre_pedidos (RLS sem acesso direto) + pode_pre_pedido, pre_pedido_lista/salvar/status/excluir.
-- Escala ABC de domingos: usuarios.escala_dom, config.escala_domingos, escala_domingos_salvar, vendedor_escala_abc.
-- Vendedor de outro setor (freelance, ex.: Sônia): _eh_projetista_valido sem exigir somente_atribuidos; pode_ver_chamado_ctx: setor atendente_cliente só vê os clientes atribuídos.
