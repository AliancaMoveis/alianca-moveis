-- MEDIDAS em operação (Supervisão de Medidas: Luciene · medidores: Cesar e Gilberto · consultores externos também medem)
-- Etapas (tratativa.medida.etapa):
--   pendente  → Pendente para medir (a programar)
--   agendada  → Aguardando medição (direcionada a medidor/consultor, com data)
--   validar   → Aguardando análise (o consultor já trouxe as medidas da visita de venda)
--   realizada → Aguardando análise (medidor/consultor finalizou, ou veio do cruzamento com o Minha Visita)
--   em_obra   → Em obra: não permite a medida oficial (previsão de término opcional); fica até alguém mexer
--   liberada  → Aprovada pela supervisora = MEDIDA OFICIAL (o checklist da venda passa a mostrar "medida oficial" e as fotos)
-- Medida paga R$ 40 a quem mediu (sem comissão) — exceto as que vieram do cruzamento com o Minha Visita (semPagamento).

-- venda confirmada: se o consultor já trouxe medidas/anexos → análise; senão → pendente para medir
do $do$ declare d text; begin
  d := pg_get_functiondef('public._trg_venda_cria_medida()'::regprocedure);
  if d like '%''pendente''%' then return; end if;
  d := replace(d, $x$jsonb_build_object('medida', jsonb_build_object('etapa', 'validar', 'consultorVisita'$x$,
    $x$jsonb_build_object('medida', jsonb_build_object('etapa', case when coalesce(c.tratativa->>'medidas', '') <> '' or exists (select 1 from public.anexos a where a.chamado_id = c.id) then 'validar' else 'pendente' end, 'consultorVisita'$x$);
  if d not like '%''pendente''%' then raise exception 'anchor trg_venda_cria_medida'; end if;
  execute d;
end $do$;

-- medida pedida pelo checklist nasce como pendente para medir
do $do$ declare d text; begin
  d := pg_get_functiondef('public.checklist_pedir_medida(text,text)'::regprocedure);
  d := replace(d, $x$jsonb_build_object('medida', jsonb_build_object('etapa', 'validar', 'pedidoChecklist', true))$x$, $x$jsonb_build_object('medida', jsonb_build_object('etapa', 'pendente', 'pedidoChecklist', true))$x$);
  execute d;
end $do$;

-- Em obra (previsão opcional) e voltar para pendente
create or replace function public.medida_em_obra(p_id text, p_previsao date default null, p_obs text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._medida(p_id); m jsonb;
begin
  if not public.eh_sup_medidas() then raise exception 'Só a Supervisão de Medidas ou a Gestão'; end if;
  if c.status = 'concluida' then raise exception 'Esta medida já foi aprovada'; end if;
  m := coalesce(c.tratativa->'medida', '{}'::jsonb) || jsonb_build_object('etapa', 'em_obra', 'emObraEm', now(), 'previsaoObra', p_previsao, 'obsObra', btrim(coalesce(p_obs, '')));
  update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('medida', m) where id = p_id;
  perform public._reg(p_id, '🚧 Em obra — sem medida oficial' || coalesce(' · previsão de término ' || to_char(p_previsao, 'DD/MM/YYYY'), '') || coalesce(' · ' || nullif(btrim(p_obs), ''), ''));
end $$;
revoke all on function public.medida_em_obra(text, date, text) from public, anon;
grant execute on function public.medida_em_obra(text, date, text) to authenticated;

create or replace function public.medida_pendente(p_id text, p_obs text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._medida(p_id); m jsonb;
begin
  if not public.eh_sup_medidas() then raise exception 'Só a Supervisão de Medidas ou a Gestão'; end if;
  if c.status = 'concluida' then raise exception 'Esta medida já foi aprovada'; end if;
  m := coalesce(c.tratativa->'medida', '{}'::jsonb) || jsonb_build_object('etapa', 'pendente');
  update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('medida', m), medidor_id = null, data_medida = null where id = p_id;
  perform public._reg(p_id, '📐 Voltou para pendente para medir' || coalesce(' · ' || nullif(btrim(p_obs), ''), ''));
end $$;
revoke all on function public.medida_pendente(text, text) from public, anon;
grant execute on function public.medida_pendente(text, text) to authenticated;

-- Aprovar = medida oficial. Liga ao checklist da venda (pelo vínculo ou pelo nº da venda); não cria checklist novo
-- (a base do checklist vem da planilha de tickets).
create or replace function public.medida_liberar(p_id text, p_obs text default '') returns text
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._medida(p_id); m jsonb; etapa text; ck text; eu uuid := auth.uid();
begin
  if not public.eh_sup_medidas() then raise exception 'Só a Supervisão de Medidas ou a Gestão aprovam a medida'; end if;
  etapa := coalesce(c.tratativa->'medida'->>'etapa', 'validar');
  if etapa not in ('validar', 'realizada') then raise exception 'A medida ainda não foi feita — aguarde a medição'; end if;
  m := coalesce(c.tratativa->'medida', '{}'::jsonb) || jsonb_build_object('etapa', 'liberada', 'liberadaEm', now(), 'liberadaPor', public._nome(eu),
        'validouConsultor', etapa = 'validar', 'obsLiberacao', btrim(coalesce(p_obs, '')), 'oficial', true);
  update public.chamados set status = 'concluida', tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('medida', m) where id = p_id;
  select x.id into ck from public.chamados x where x.tipo = 'checklist' and (x.id = c.vinculado_a or (nullif(c.pedido, '') is not null and x.pedido = c.pedido))
   order by (x.id = c.vinculado_a) desc, (x.status <> 'concluida') desc limit 1;
  perform public._reg(p_id, '✅ Medida aprovada — medida oficial' || coalesce(' · checklist ' || ck, '') || coalesce(' · ' || nullif(btrim(p_obs), ''), ''));
  if ck is not null then
    perform set_config('alianca.sistema', '1', true);
    update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('checklist', coalesce(tratativa->'checklist', '{}'::jsonb)
        || jsonb_build_object('medidaOk', true, 'medidaOkEm', now(), 'medidaId', p_id))
     where id = ck;
    perform set_config('alianca.sistema', '0', true);
    perform public._reg(ck, '📐 Medida oficial aprovada (' || p_id || ') — fotos disponíveis na ficha da medida');
  end if;
  return coalesce(ck, '');
end $$;

-- o checklist (projetista) enxerga as medidas e as fotos; continua sem poder alterar
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
      or (c.tipo = 'medidas' and (x->'ms' ? 'checklist' or x->'ms' ? 'medidas_supervisao'))
  end, false);
$$;

-- R$ 40 só para medida paga (a que veio do Minha Visita não paga)
do $do$ declare d text; begin
  d := pg_get_functiondef('public._extrato_campo(uuid,date,date)'::regprocedure);
  if d like '%semPagamento%' then return; end if;
  d := replace(d, $x$c.medidor_id = p_uid and (c.tratativa->'medida'->>'realizadaEm') is not null$x$,
                  $x$c.medidor_id = p_uid and (c.tratativa->'medida'->>'realizadaEm') is not null and not coalesce((c.tratativa->'medida'->>'semPagamento')::boolean, false)$x$);
  if d not like '%semPagamento%' then raise exception 'anchor extrato'; end if;
  execute d;
end $do$;

-- consultor do Minha Visita (nome do cadastro) → usuário consultor externo
create or replace function public._consultor_por_nome(p text) returns uuid
language sql stable security definer set search_path = '' as $$
  with n as (select lower(translate(btrim(coalesce(p, '')), 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc')) v)
  select u.id from public.usuarios u join public.usuario_setores us on us.usuario_id = u.id and us.setor_id = 'consultor_externo', n
   where u.ativo and n.v <> '' and (
     lower(translate(u.nome, 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc')) = n.v
     or n.v like lower(translate(u.nome, 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc')) || ' %')
   order by length(u.nome) desc limit 1;
$$;

-- cruzamento com o Minha Visita: quem foi visitado pelo consultor → a medida vai para "Aguardando análise",
-- com o consultor como medidor (sem pagamento). Medidas já aprovadas, em obra ou em medição não mudam.
do $do$ declare d text; begin
  d := pg_get_functiondef('public.medidas_cruzamento_salvar(jsonb)'::regprocedure);
  if d like '%_consultor_por_nome%' then return; end if;
  d := replace(d, $x$  end loop;
  return jsonb_build_object('novos', n_novo, 'atualizados', n_atu);$x$, $x$    if r->>'resultado' = 'ok' then perform public._medida_da_visita(v, r); end if;
  end loop;
  return jsonb_build_object('novos', n_novo, 'atualizados', n_atu);$x$);
  if d not like '%_medida_da_visita%' then raise exception 'anchor cruzamento'; end if;
  execute d;
end $do$;

create or replace function public._medida_da_visita(v text, r jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare mid text; m public.chamados; ck public.chamados; uid uuid := public._consultor_por_nome(r->>'consultor'); eu uuid := auth.uid(); md jsonb;
begin
  select * into m from public.chamados x where x.tipo = 'medidas' and x.pedido = v order by (x.status <> 'concluida') desc, x.criado_em desc limit 1;
  if found and (m.status = 'concluida' or coalesce(m.tratativa->'medida'->>'etapa', 'validar') not in ('pendente', 'validar')) then return; end if;
  md := jsonb_build_object('etapa', 'realizada', 'realizadaEm', now(), 'realizadaPor', uid, 'origem', 'minha_visita', 'semPagamento', true,
          'consultorNome', coalesce(r->>'consultor', ''), 'visitado', coalesce(r->>'visitado', ''), 'visitaEm', coalesce(r->>'visitaEm', ''));
  perform set_config('alianca.sistema', '1', true);
  if m.id is null then
    select * into ck from public.chamados x where x.tipo = 'checklist' and x.pedido = v order by (x.status <> 'concluida') desc limit 1;
    insert into public.chamados (tipo, setor_destino, status, sla_resposta, solicitante_id, solicitante_nome, solicitante_setor, cliente, cliente_doc, telefone, email,
                                 pedido, data_venda, produto, motivo, endereco, vinculado_a, medidor_id, tratativa)
    values ('medidas', 'medidas', 'tratativa', now() + interval '2 days', eu, public._nome(eu), 'Supervisão de Medidas',
            coalesce(ck.cliente, initcap(lower(coalesce(r->>'comprador', 'Cliente')))), coalesce(ck.cliente_doc, ''), coalesce(ck.telefone, regexp_replace(coalesce(r->>'telefone', ''), '\D', '', 'g')),
            coalesce(ck.email, ''), v, ck.data_venda, coalesce(ck.produto, 'Projetados'),
            'Medidas do consultor na visita (Minha Visita) — conferir e aprovar.', coalesce(ck.endereco, ''), ck.id, uid, jsonb_build_object('medida', md))
    returning id into mid;
    insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (mid, eu, public._nome(eu),
      '📐 Cruzamento com o Minha Visita: visitado por ' || coalesce(nullif(r->>'consultor', ''), 'consultor') || ' → aguardando análise');
  else
    update public.chamados set status = 'tratativa', medidor_id = coalesce(uid, medidor_id),
      tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('medida', coalesce(tratativa->'medida', '{}'::jsonb) || md)
     where id = m.id;
    insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (m.id, eu, public._nome(eu),
      '📐 Cruzamento com o Minha Visita: visitado por ' || coalesce(nullif(r->>'consultor', ''), 'consultor') || ' → aguardando análise');
  end if;
  perform set_config('alianca.sistema', '0', true);
end $$;
revoke all on function public._medida_da_visita(text, jsonb) from public, anon, authenticated;

-- alerta das 9h para a Supervisão de Medidas: checklist agendado em até 3 dias sem medida aprovada
do $do$ declare d text; begin
  d := pg_get_functiondef('public.avisos_rotina_em(timestamp without time zone)'::regprocedure);
  if d like '%medckalerta%' then return; end if;
  d := replace(d, $x$begin
  slots := case$x$, $x$begin
  if public._hm(agora, '09:00') then
    select count(*), string_agg(c.cliente || ' (' || to_char((c.tratativa->'checklist'->>'agendadoPara')::timestamp, 'DD/MM') || ')', ', ' order by c.tratativa->'checklist'->>'agendadoPara'), min(c.id)
      into n, txt, s
      from public.chamados c
     where c.tipo = 'checklist' and c.status <> 'concluida' and c.tratativa->'checklist'->>'etapa' = 'agendado'
       and ((c.tratativa->'checklist'->>'agendadoPara')::timestamp)::date between hoje and hoje + 3
       and not exists (select 1 from public.chamados md where md.tipo = 'medidas' and md.pedido = c.pedido and md.tratativa->'medida'->>'etapa' = 'liberada');
    if n > 0 then
      perform public._notificar(public._usuarios_setor(array['medidas_supervisao']), '⚠️ ' || n || ' checklist(s) em até 3 dias sem medida aprovada',
        left(txt, 180), case when n = 1 then s end, 'medckalerta:' || hoje);
    end if;
  end if;
  slots := case$x$);
  if d not like '%medckalerta%' then raise exception 'anchor avisos'; end if;
  execute d;
end $do$;
