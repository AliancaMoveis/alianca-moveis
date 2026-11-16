-- DESEMPENHO · "canceling statement due to statement timeout" nas telas (Área do projetista vinha vazia)
--
-- A regra que decide o que cada pessoa vê rodava uma consulta à tabela de transferências DENTRO dela, linha por
-- linha, nos 7.400 chamados, a cada requisição — 2,6 s por requisição. Como toda tela carrega várias tabelas em
-- páginas, e cada página refaz essa conta, estourava o limite de 8 s do banco e a tela vinha vazia.
--
-- 1) as transferências pendentes passam a ser calculadas UMA vez por requisição, junto com o resto do contexto
-- 2) quem é Gestão (e não é "somente atribuídos") vê tudo pela própria regra — então a função nem é chamada
--
-- Medido em produção, na mesma consulta: 2.600 ms → 557 ms (1) → 29 ms (2). Resultado idêntico, conferido linha a
-- linha nos 7.400 chamados: zero divergência, e os totais por pessoa não mudaram.

create or replace function public._ctx_ver()
returns jsonb language sql stable security definer set search_path to '' as $$
  select case when auth.uid() is null or not public.usuario_ativo() then jsonb_build_object('ok', false)
  else jsonb_build_object('ok', true, 'uid', auth.uid(), 'som', public.somente_atribuidos(), 'ges', public.eh_gestao(),
    'ms', to_jsonb(public.meus_setores()),
    'mkt', public.tem_lib('verMarketing') or 'presenca' = any(public.meus_setores()) or coalesce((select u.edita_agenda from public.usuarios u where u.id = auth.uid()), false),
    'tudo', public.tem_lib('verTudo'),
    'pre', (select coalesce(jsonb_agg(t.id), '[]'::jsonb) from public.tipos t where t.presale),
    -- chamados transferidos para mim e ainda pendentes: antes era um "exists" por linha dentro da regra
    'tr', (select coalesce(jsonb_agg(t.chamado_id), '[]'::jsonb) from public.transferencias t
            where t.status = 'pendente' and t.para_usuario = auth.uid())) end;
$$;

create or replace function public.pode_ver_chamado_ctx(c chamados, x jsonb)
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((x->>'ok')::boolean, false) and case when c.tipo = 'porta' then coalesce((x->>'ges')::boolean, false) or coalesce(x->'ms' ?| array['presenca','gerente_loja'], false) or coalesce(c.atendente_id = (x->>'uid')::uuid, false) or coalesce(c.solicitante_id = (x->>'uid')::uuid, false) or coalesce(x->'tr' ? c.id, false)
  when c.tipo = 'juridico' then coalesce((x->>'ges')::boolean, false) or coalesce(x->'ms' ? 'juridico', false) else coalesce(case
    when (x->>'som')::boolean then
      coalesce(c.consultor_id = (x->>'uid')::uuid, false) or coalesce(c.atendente_id = (x->>'uid')::uuid, false) or coalesce(c.medidor_id = (x->>'uid')::uuid, false)
      or (c.tipo = 'erro_venda' and c.tratativa->'erroVenda'->>'vendedorId' = x->>'uid')
      or coalesce(x->'tr' ? c.id, false)
    when (x->>'ges')::boolean then true
    when x->'pre' ? c.tipo then
      ((x->>'mkt')::boolean and (not (x->'ms' ? 'gerente_loja') or x->'ms' ?| array['marketing_supervisao','marketing_operadora','presenca','proprietario'] or c.data_loja is not null or c.atendente_id is not null)) or x->'ms' ? 'suporte_consultores' or coalesce(c.setor_destino <> 'atendente_cliente' and x->'ms' ? c.setor_destino, false) or coalesce(c.atendente_id = (x->>'uid')::uuid, false) or coalesce(c.solicitante_id = (x->>'uid')::uuid, false) or coalesce(c.responsavel_mkt = (x->>'uid')::uuid, false)
      or (x->'ms' ? 'medidas_supervisao' and c.consultor_id is not null)
    when (x->>'tudo')::boolean then not (x->'ms' ? 'supervisao' and c.tipo in ('checklist', 'medidas') and not coalesce(x->'ms' ? c.setor_destino, false))
    when x->'ms' ? 'callcenter' then true
    else coalesce(c.setor_destino <> 'atendente_cliente' and x->'ms' ? c.setor_destino, false) or coalesce(c.atendente_id = (x->>'uid')::uuid, false) or coalesce(c.solicitante_id = (x->>'uid')::uuid, false) or coalesce(c.medidor_id = (x->>'uid')::uuid, false)
      or (c.tipo = 'medidas' and (x->'ms' ? 'checklist' or x->'ms' ? 'medidas_supervisao'))
  end, false) end;
$$;

-- o atalho vale só para quem NÃO é "somente atribuídos" (na regra essa condição vem antes da de gestão)
alter policy chamados_ler on public.chamados using (
  coalesce((select ((x->>'ges')::boolean and not coalesce((x->>'som')::boolean, false))
            from (select public._ctx_ver() as x) t), false)
  or public.pode_ver_chamado_ctx(chamados.*, (select public._ctx_ver()))
);
