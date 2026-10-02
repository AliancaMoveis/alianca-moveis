-- Checklist: alterar agendamento (nova data) e desmarcar (volta para contato, com motivo); horários de atendimento para sugerir dias/horários livres.
alter table public.config add column if not exists checklist_agenda jsonb not null
  default '{"dias":[1,2,3,4,5],"horarios":["09:00","10:30","14:00","15:30","17:00"],"vagas":1,"seguraDias":2}'::jsonb;

create or replace function public.salvar_checklist_agenda(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare h text; d int;
begin
  if not public.pode_checklist() then raise exception 'Só o setor Checklist ou a Gestão alteram os horários do checklist'; end if;
  if jsonb_typeof(p->'dias') <> 'array' or jsonb_array_length(p->'dias') = 0 then raise exception 'Escolha pelo menos um dia da semana'; end if;
  for d in select (x)::int from jsonb_array_elements_text(p->'dias') x loop if d < 0 or d > 6 then raise exception 'Dia inválido'; end if; end loop;
  if jsonb_typeof(p->'horarios') <> 'array' or jsonb_array_length(p->'horarios') = 0 then raise exception 'Informe pelo menos um horário'; end if;
  for h in select x from jsonb_array_elements_text(p->'horarios') x loop if h !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Horário inválido: %', h; end if; end loop;
  if coalesce((p->>'vagas')::int, 0) not between 1 and 20 then raise exception 'Vagas por horário: de 1 a 20'; end if;
  if coalesce((p->>'seguraDias')::int, -1) not between 0 and 15 then raise exception 'Dias para segurar a data oferecida: de 0 a 15'; end if;
  update public.config set checklist_agenda = jsonb_build_object('dias', p->'dias', 'horarios', p->'horarios', 'vagas', (p->>'vagas')::int, 'seguraDias', (p->>'seguraDias')::int),
    atualizado_em = now(), atualizado_por = auth.uid() where id = 1;
end $$;
revoke all on function public.salvar_checklist_agenda(jsonb) from public, anon;
grant execute on function public.salvar_checklist_agenda(jsonb) to authenticated;

-- novas ações em checklist_registrar: 'reagendar' (altera a data, continua agendado) e 'desmarcar' (tira da agenda e volta para contato)
do $do$ declare d text; begin
  d := pg_get_functiondef('public.checklist_registrar(text,jsonb)'::regprocedure);
  d := replace(d, $x$    when 'outra_data' then$x$, $x$    when 'reagendar' then
      if coalesce(ck->>'etapa', '') <> 'agendado' then raise exception 'Só dá para alterar a data de um checklist agendado'; end if;
      if dt is null then raise exception 'Informe a nova data e horário'; end if;
      if dt = nullif(ck->>'agendadoPara', '')::timestamp then raise exception 'A nova data é igual à atual'; end if;
      txt := '🔁 Agendamento alterado: ' || coalesce(to_char(nullif(ck->>'agendadoPara', '')::timestamp, 'DD/MM/YYYY HH24:MI'), '—') || ' → ' || to_char(dt, 'DD/MM/YYYY HH24:MI') || ' — alterar também no sistema interno';
      ck := ck || jsonb_build_object('agendadoPara', dt, 'remarcacoes', coalesce((ck->>'remarcacoes')::int, 0) + 1);
    when 'desmarcar' then
      if coalesce(ck->>'etapa', '') <> 'agendado' then raise exception 'Este cliente não está agendado'; end if;
      if obs = '' then raise exception 'Informe o motivo de desmarcar'; end if;
      txt := '❌ Agendamento de ' || coalesce(to_char(nullif(ck->>'agendadoPara', '')::timestamp, 'DD/MM/YYYY HH24:MI'), '—') || ' desmarcado — desmarcar também no sistema interno';
      ck := ck || jsonb_build_object('etapa', case when dd is null then 'a_contatar' else 'outra_data' end, 'agendadoPara', null, 'proposta', null, 'retornarEm', dd,
                                     'desmarcadoEm', now(), 'desmarcacoes', coalesce((ck->>'desmarcacoes')::int, 0) + 1);
      if dd is not null then txt := txt || ' · retornar em ' || to_char(dd, 'DD/MM/YYYY'); end if;
    when 'outra_data' then$x$);
  if d not like '%''desmarcar''%' then raise exception 'x'; end if;
  execute d;
end $do$;
