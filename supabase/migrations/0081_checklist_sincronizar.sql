-- Checklist: a planilha "a agendar" passa a SINCRONIZAR a base.
--  · cliente novo na planilha → entra (mesma regra da importação)
--  · cliente que já está no 360 → fica como está (não perde obras, anotações, contatos…)
--  · cliente do 360 ainda NÃO agendado que sumiu da planilha:
--      - se já tinha data oferecida pelo WhatsApp (etapa "aguardando" com proposta) → passa para AGENDADO nessa data
--      - senão (venda cancelada / saiu do checklist) → é EXCLUÍDO
--  · agendados / realizados / encerrados nunca são tocados.
-- p_aplicar = false só calcula (prévia para a tela de confirmação). Exclusão de mais da metade da base exige p_forcar.
create or replace function public.checklist_sincronizar(p jsonb, p_aplicar boolean default false, p_forcar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare nums text[]; base int; v_exc text[]; v_ag text[]; v_med text[]; nnovos int; nmant int; imp jsonb; eu uuid := auth.uid(); alerta boolean; lex jsonb; lag jsonb;
begin
  if not public.pode_checklist() then raise exception 'Só o setor Checklist ou a Gestão atualizam a base do checklist'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then raise exception 'Planilha vazia'; end if;
  select array_agg(distinct n) into nums from (select regexp_replace(coalesce(x->>'numero', ''), '\D', '', 'g') n from jsonb_array_elements(p) x) t where n <> '';
  if coalesce(array_length(nums, 1), 0) = 0 then raise exception 'Não encontrei nenhum nº de venda na planilha'; end if;

  select count(*) into base from public.chamados c
   where c.tipo = 'checklist' and c.status <> 'concluida' and coalesce(c.tratativa->'checklist'->>'etapa', 'a_contatar') not in ('agendado', 'realizado', 'desistiu');
  -- fora da planilha e ainda não agendados
  select array_agg(c.id) filter (where c.tratativa->'checklist'->>'etapa' = 'aguardando' and nullif(c.tratativa->'checklist'->>'proposta', '') is not null),
         array_agg(c.id) filter (where not (c.tratativa->'checklist'->>'etapa' = 'aguardando' and nullif(c.tratativa->'checklist'->>'proposta', '') is not null)
                                   and not exists (select 1 from public.chamados m where m.tipo = 'medidas' and m.vinculado_a = c.id and m.status <> 'concluida')),
         array_agg(c.id) filter (where exists (select 1 from public.chamados m where m.tipo = 'medidas' and m.vinculado_a = c.id and m.status <> 'concluida'))
    into v_ag, v_exc, v_med
    from public.chamados c
   where c.tipo = 'checklist' and c.status <> 'concluida'
     and coalesce(c.tratativa->'checklist'->>'etapa', 'a_contatar') not in ('agendado', 'realizado', 'desistiu')
     and not (c.pedido = any(nums));
  select count(*) filter (where exists (select 1 from public.chamados c where c.tipo = 'checklist' and c.pedido = n)),
         count(*) filter (where not exists (select 1 from public.chamados c where c.tipo = 'checklist' and c.pedido = n))
    into nmant, nnovos from unnest(nums) n;
  select coalesce(jsonb_agg(c.cliente || ' · venda ' || c.pedido order by c.cliente), '[]') into lex from public.chamados c where c.id = any(coalesce(v_exc, '{}'));
  select coalesce(jsonb_agg(c.cliente || ' · ' || to_char(nullif(c.tratativa->'checklist'->>'proposta', '')::timestamp, 'DD/MM HH24:MI') order by c.cliente), '[]') into lag from public.chamados c where c.id = any(coalesce(v_ag, '{}'));
  alerta := base >= 20 and coalesce(array_length(v_exc, 1), 0) > base / 2;

  if p_aplicar then
    if alerta and not p_forcar then raise exception 'Essa planilha excluiria mais da metade dos clientes a agendar — confira se é a planilha certa e confirme de novo'; end if;
    imp := public.checklist_importar(p);
    perform set_config('alianca.sistema', '1', true);
    -- já tinham data oferecida → agendado
    insert into public.historico (chamado_id, quem_id, quem_nome, texto)
    select c.id, eu, public._nome(eu), '📅 Saiu da planilha "a agendar" (já enviado para agendamento) — agendado para '
           || to_char(nullif(c.tratativa->'checklist'->>'proposta', '')::timestamp, 'DD/MM/YYYY HH24:MI') || coalesce(' com ' || nullif(c.tratativa->'checklist'->>'propostaProjetista', ''), '')
      from public.chamados c where c.id = any(coalesce(v_ag, '{}'));
    update public.chamados c set status = 'tratativa',
      tratativa = jsonb_set(c.tratativa, '{checklist}', (c.tratativa->'checklist') || jsonb_build_object(
        'etapa', 'agendado', 'agendadoPara', c.tratativa->'checklist'->>'proposta', 'retornarEm', null, 'confirmacao', '',
        'projetista', nullif(c.tratativa->'checklist'->>'propostaProjetista', ''), 'agendadoPelaPlanilha', now()))
     where c.id = any(coalesce(v_ag, '{}'));
    -- sumiram da planilha sem data → venda cancelada / saiu do checklist
    update public.chamados set vinculado_a = null where vinculado_a = any(coalesce(v_exc, '{}'));
    delete from public.notificacoes where chamado_id = any(coalesce(v_exc, '{}'));
    delete from public.chamados where tipo = 'checklist' and id = any(coalesce(v_exc, '{}'));
  end if;

  return jsonb_build_object('novos', coalesce((imp->>'novos')::int, nnovos), 'mantidos', nmant,
    'agendar', coalesce(array_length(v_ag, 1), 0), 'excluir', coalesce(array_length(v_exc, 1), 0), 'comMedida', coalesce(array_length(v_med, 1), 0),
    'base', base, 'alerta', alerta, 'aplicado', p_aplicar,
    'listaExcluir', lex, 'listaAgendar', lag);
end $$;
revoke all on function public.checklist_sincronizar(jsonb, boolean, boolean) from public, anon;
grant execute on function public.checklist_sincronizar(jsonb, boolean, boolean) to authenticated;
