-- ALIANÇA 360 · Integração Exact: bloqueios do 360 viram eventos manuais no Exact
-- ========== bloqueios do 360 → eventos manuais no Exact (reservado, médico, consulta…) ==========
create or replace function public.exact_bloq_plano(p_id bigint) returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('id', b.id, 'eventId', b.exact_event_id, 'ativo', b.ativo,
    'agendaId', (select a.id from public.exact_agenda a where a.projetista = b.projetista order by a.id limit 1),
    'start', public._ex_utc(b.inicio), 'end', public._ex_utc(b.fim),
    'description', coalesce(nullif(b.motivo,''), 'Bloqueio'), 'notes', btrim(coalesce(b.obs,'') || ' (360 · ' || coalesce(b.criado_por,'') || ')'))
  from public.checklist_bloqueios b where b.id = p_id $$;
create or replace function public.exact_bloq_ok(p_id bigint, p_event bigint, p_erro text default null) returns void language plpgsql security definer set search_path to '' as $$
begin
  perform set_config('alianca.exact', '1', true);
  if p_event is not null then update public.checklist_bloqueios set exact_event_id = p_event where id = p_id and exact_event_id is null; end if;
  insert into public.exact_log (tipo, ok, detalhe) values ('bloqueio', p_erro is null, 'bloqueio ' || p_id || coalesce(' → evento ' || p_event, '') || coalesce(' · ' || p_erro, ''));
end $$;
revoke all on function public.exact_bloq_plano(bigint), public.exact_bloq_ok(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.exact_bloq_plano(bigint), public.exact_bloq_ok(bigint, bigint, text) to service_role;

create or replace function public._trg_exact_bloq() returns trigger language plpgsql security definer set search_path to '' as $$
declare cfg record; corpo jsonb;
begin
  if coalesce(current_setting('alianca.exact', true), '') = '1' then return null; end if;
  select * into cfg from public.exact_config where id = 1;
  if not found or not cfg.escrever_ativo then return null; end if;
  if tg_op = 'DELETE' then
    if old.exact_event_id is null then return null; end if;
    corpo := jsonb_build_object('acao','bloqueio','op','excluir','eventId', old.exact_event_id, 'id', old.id);
  else
    if new.projetista is null then return null; end if;
    if tg_op = 'UPDATE' and old.inicio is not distinct from new.inicio and old.fim is not distinct from new.fim and old.projetista is not distinct from new.projetista
       and old.motivo is not distinct from new.motivo and old.obs is not distinct from new.obs and old.ativo is not distinct from new.ativo then return null; end if;
    if not new.ativo and new.exact_event_id is null then return null; end if;
    corpo := jsonb_build_object('acao','bloqueio','op', case when not new.ativo then 'excluir' else 'salvar' end, 'id', new.id, 'eventId', new.exact_event_id);
  end if;
  perform net.http_post(url := cfg.url_funcao, body := corpo, headers := jsonb_build_object('Content-Type','application/json','x-exact-segredo', cfg.segredo), timeout_milliseconds := 60000);
  return null;
end $$;
drop trigger if exists exact_bloq on public.checklist_bloqueios;
create trigger exact_bloq after insert or update or delete on public.checklist_bloqueios for each row execute function public._trg_exact_bloq();


-- envio do agendamento: guarda os agendamentos que o Exact tem de fato depois do envio (evita duplicar)
create or replace function public.exact_push_ok(p_id text, p jsonb) returns void language plpgsql security definer set search_path to '' as $$
declare f jsonb; c record; txt text := ''; err boolean := jsonb_array_length(coalesce(p->'erros','[]')) > 0; hj date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform set_config('alianca.sistema', '1', true);
  perform set_config('alianca.exact', '1', true);
  select id, pedido into c from public.chamados where id = p_id;
  if jsonb_typeof(p->'eventos') = 'array' then
    delete from public.exact_evento where sale_id = c.pedido and inicio >= hj and ticket_id is not null;
    insert into public.exact_evento (id, agenda_id, ticket_id, sale_id, inicio, fim, descricao, obs, visto_em)
    select (e->>'id')::bigint, (e->>'agendaId')::int, (p->>'ticketId')::int, c.pedido, public._ex_local(e->>'start'), public._ex_local(e->>'end'), e->>'description', e->>'notes', now()
      from jsonb_array_elements(p->'eventos') e
    on conflict (id) do update set agenda_id = excluded.agenda_id, ticket_id = excluded.ticket_id, sale_id = excluded.sale_id, inicio = excluded.inicio, fim = excluded.fim, descricao = excluded.descricao, visto_em = now();
  else
    for f in select * from jsonb_array_elements(coalesce(p->'feitos','[]')) loop
      if f->>'op' = 'excluir' then delete from public.exact_evento where id = (f->>'id')::bigint;
      elsif f->>'id' is not null then
        insert into public.exact_evento (id, agenda_id, ticket_id, sale_id, inicio, fim, descricao, obs, visto_em)
        values ((f->>'id')::bigint, (f->>'agendaId')::int, (f->>'ticketId')::int, c.pedido, public._ex_local(f->>'start'), public._ex_local(f->>'end'), f->>'description', f->>'notes', now())
        on conflict (id) do update set agenda_id = excluded.agenda_id, inicio = excluded.inicio, fim = excluded.fim, descricao = excluded.descricao, visto_em = now();
      end if;
    end loop;
  end if;
  for f in select * from jsonb_array_elements(coalesce(p->'feitos','[]')) loop
    txt := txt || case f->>'op' when 'criar' then ' · criado ' when 'alterar' then ' · alterado ' else ' · excluído ' end
                || coalesce(to_char(public._ex_local(f->>'start'), 'DD/MM HH24:MI'), '');
  end loop;
  update public.chamados set tratativa = case when err then jsonb_set(tratativa, '{checklist,exactErro}', to_jsonb(left(p->'erros'->>0, 300)))
                                              else (tratativa #- '{checklist,exactPend}') #- '{checklist,exactErro}' end where id = p_id;
  if txt <> '' or err then
    insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (p_id, '00000000-0000-4000-a000-000000000007', 'Exact (integração)',
      case when err then '⚠️ Não foi para o Exact: ' || left(p->'erros'->>0, 300) else '📤 Enviado para o Exact' || txt end);
  end if;
  insert into public.exact_log (tipo, chamado_id, ok, detalhe) values ('push', p_id, not err, left(p::text, 4000));
end $$;
revoke all on function public.exact_push_ok(text, jsonb) from public, anon, authenticated;
grant execute on function public.exact_push_ok(text, jsonb) to service_role;

select 'ok — pronto para o teste de envio' as resultado;
