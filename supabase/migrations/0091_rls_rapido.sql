-- Desempenho: as regras de visibilidade (RLS) eram calculadas linha a linha, consultando usuário/setores/liberações
-- dezenas de milhares de vezes por tela → "statement timeout" ao entrar com vários usuários ao mesmo tempo.
-- Agora o contexto do usuário é calculado UMA vez por consulta e as tabelas filhas usam a lista de chamados visíveis.
-- As regras continuam exatamente as mesmas.

create or replace function public._ctx_ver() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null or not public.usuario_ativo() then jsonb_build_object('ok', false)
  else jsonb_build_object('ok', true, 'uid', auth.uid(), 'som', public.somente_atribuidos(), 'ges', public.eh_gestao(),
    'ms', to_jsonb(public.meus_setores()), 'mkt', public.tem_lib('verMarketing'), 'tudo', public.tem_lib('verTudo'),
    'pre', (select coalesce(jsonb_agg(t.id), '[]'::jsonb) from public.tipos t where t.presale)) end;
$$;

create or replace function public.pode_ver_chamado_ctx(c public.chamados, x jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((x->>'ok')::boolean, false) and coalesce(case
    when (x->>'som')::boolean then
      coalesce(c.consultor_id = (x->>'uid')::uuid, false) or coalesce(c.atendente_id = (x->>'uid')::uuid, false) or coalesce(c.medidor_id = (x->>'uid')::uuid, false)
      or exists (select 1 from public.transferencias t where t.chamado_id = c.id and t.status = 'pendente' and t.para_usuario = (x->>'uid')::uuid)
    when (x->>'ges')::boolean then true
    when x->'pre' ? c.tipo then
      (x->>'mkt')::boolean or x->'ms' ? 'suporte_consultores' or coalesce(x->'ms' ? c.setor_destino, false) or coalesce(c.solicitante_id = (x->>'uid')::uuid, false)
    when (x->>'tudo')::boolean then true
    when x->'ms' ? 'callcenter' then true
    else coalesce(x->'ms' ? c.setor_destino, false) or coalesce(c.solicitante_id = (x->>'uid')::uuid, false) or coalesce(c.medidor_id = (x->>'uid')::uuid, false)
  end, false);
$$;

create or replace function public.pode_ver_valor_ctx(c public.chamados, x jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((x->>'ok')::boolean, false) and ((x->>'ges')::boolean or x->'ms' ? 'gerente_loja'
    or coalesce(c.atendente_id = (x->>'uid')::uuid, false) or coalesce(c.consultor_id = (x->>'uid')::uuid, false));
$$;

-- a função antiga (usada pelas ações) passa a usar a mesma regra
create or replace function public.pode_ver_chamado(c public.chamados) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.pode_ver_chamado_ctx(c, public._ctx_ver());
$$;

alter policy chamados_ler on public.chamados using (public.pode_ver_chamado_ctx(chamados.*, (select public._ctx_ver())));
alter policy historico_ler on public.historico using (chamado_id in (select c.id from public.chamados c));
alter policy anexos_ler on public.anexos using (chamado_id in (select c.id from public.chamados c));
alter policy transferencias_ler on public.transferencias using (chamado_id in (select c.id from public.chamados c));
alter policy vendas_ler on public.vendas using (chamado_id in (select c.id from public.chamados c));
alter policy venda_itens_ler on public.venda_itens using (chamado_id in (select c.id from public.chamados c where public.pode_ver_valor_ctx(c, (select public._ctx_ver()))));
alter policy vendas_valores_ler on public.vendas_valores using (chamado_id in (select c.id from public.chamados c where public.pode_ver_valor_ctx(c, (select public._ctx_ver()))));

-- demais tabelas: funções do usuário avaliadas uma vez por consulta ((select f()) vira InitPlan)
alter policy posvenda_ler on public.posvenda using ((select public.pode_ver_posvenda()) and chamado_id in (select c.id from public.chamados c));
alter policy campo_fech_itens_ler on public.campo_fechamento_itens using ((select public.eh_gestao()) or usuario_id = (select auth.uid()));
alter policy campo_fech_ler on public.campo_fechamentos using ((select public.eh_gestao()) or usuario_id = (select auth.uid()));
alter policy ck_bloq_ler on public.checklist_bloqueios using ((select public.pode_checklist()));
alter policy config_ler on public.config using ((select public.usuario_ativo()));
alter policy fabricas_ler on public.fabricas using ((select public.usuario_ativo()));
alter policy medidas_cruz_ler on public.medidas_cruzamento using ((select public.pode_medidas()) or (select public.pode_checklist()));
alter policy mkt_metas_ler on public.mkt_metas using ((select public.ve_mkt_pagamento()));
alter policy mkt_pagamentos_ler on public.mkt_pagamentos using ((select public.gere_mkt()) or operadora_id = (select auth.uid()));
alter policy montadores_ler on public.montadores using ((select public.usuario_ativo()));
alter policy montadores_conta_ler on public.montadores_conta using ((select public.pode_conta_montador()));
alter policy notif_ler on public.notificacoes using (usuario_id = (select auth.uid()));
alter policy push_insc_ler on public.push_inscricoes using (usuario_id = (select auth.uid()));
alter policy reembolsos_ler on public.reembolsos using (usuario_id = (select auth.uid()) or (select public.eh_gestao()));
alter policy representantes_ler on public.representantes using ((select public.usuario_ativo()));
alter policy roteiros_ler on public.roteiros using ((select public.pode_treinamento()) and (status = 'aprovado' or autor_id = (select auth.uid()) or (select public.gere_treinamento())));
alter policy setores_ler on public.setores using ((select public.usuario_ativo()));
alter policy tipos_ler on public.tipos using ((select public.usuario_ativo()));
alter policy usuario_setores_ler on public.usuario_setores using ((select public.usuario_ativo()));
alter policy usuarios_ler on public.usuarios using ((select public.usuario_ativo()) or id = (select auth.uid()));
