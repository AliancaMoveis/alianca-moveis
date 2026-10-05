-- Checklist: cliente com mais de um dia de atendimento (ck.diasExtras = [{data, duracaoMin, projetista}]).
-- Os dias extras ocupam a agenda do projetista como qualquer agendamento (conflito / encaixe valem para eles também).
create or replace function public._ck_proj(p_nome text, p_dt timestamp, p_id text, p jsonb) returns text
language plpgsql stable security definer set search_path = '' as $$
declare outro text; dur int; ndur int;
begin
  if not exists (select 1 from public.config cf, jsonb_array_elements_text(coalesce(cf.checklist_agenda->'projetistas', '[]'::jsonb)) x where cf.id = 1 and x = p_nome) then
    raise exception 'Escolha o projetista da lista';
  end if;
  if p_dt is null then return null; end if;
  select coalesce((checklist_agenda->>'duracaoMin')::int, 120) into dur from public.config where id = 1;
  ndur := coalesce(nullif(p->>'duracaoMin', '')::int, (select (c.tratativa->'checklist'->>'duracaoMin')::int from public.chamados c where c.id = p_id), dur);
  with ag as (
    select c.cliente, c.tratativa->'checklist' k from public.chamados c
     where c.tipo = 'checklist' and c.id <> p_id and c.status <> 'concluida' and c.tratativa->'checklist'->>'etapa' = 'agendado'),
  occ as (
    select cliente, nullif(k->>'agendadoPara', '')::timestamp ini, coalesce((k->>'duracaoMin')::int, dur) d, k->>'projetista' pj from ag
    union all
    select cliente, nullif(e->>'data', '')::timestamp, coalesce((e->>'duracaoMin')::int, dur), e->>'projetista' from ag, jsonb_array_elements(coalesce(k->'diasExtras', '[]'::jsonb)) e)
  select string_agg(cliente || ' às ' || to_char(ini, 'HH24:MI'), ', ') into outro from occ
   where pj = p_nome and ini < p_dt + make_interval(mins => ndur) and p_dt < ini + make_interval(mins => d);
  if outro is null then return null; end if;
  if coalesce((p->>'encaixe')::boolean, false) then return p_nome || ' também tem ' || outro; end if;
  raise exception '% já tem checklist em % (%). Para encaixar mesmo assim, marque “Confirmo o encaixe”.', p_nome, to_char(p_dt, 'DD/MM HH24:MI'), outro;
end $$;
revoke all on function public._ck_proj(text, timestamp, text, jsonb) from public, anon, authenticated;

do $do$ declare d text; begin
  d := pg_get_functiondef('public.checklist_registrar(text,jsonb)'::regprocedure);
  d := replace(d, 'declare enc text;', 'declare enc text; v_e jsonb; v_lista jsonb := ''[]''::jsonb; v_t timestamp; v_m int; v_pj text;');
  d := replace(d, $x$    when 'desmarcar' then$x$, $x$    when 'dias' then
      if coalesce(ck->>'etapa', '') <> 'agendado' then raise exception 'Só dá para incluir dias em um checklist agendado'; end if;
      if jsonb_typeof(coalesce(p->'dias', '[]'::jsonb)) <> 'array' then raise exception 'Lista de dias inválida'; end if;
      if jsonb_array_length(coalesce(p->'dias', '[]'::jsonb)) > 10 then raise exception 'No máximo 10 dias adicionais'; end if;
      for v_e in select x from jsonb_array_elements(coalesce(p->'dias', '[]'::jsonb)) x loop
        v_t := nullif(v_e->>'data', '')::timestamp;
        if v_t is null then raise exception 'Informe o dia e o horário de cada dia adicional'; end if;
        if v_t::date = nullif(ck->>'agendadoPara', '')::date then raise exception 'O dia adicional % é o mesmo dia do agendamento principal — aumente a duração em vez disso', to_char(v_t, 'DD/MM'); end if;
        v_m := coalesce(nullif(v_e->>'duracaoMin', '')::int, (ck->>'duracaoMin')::int, 120);
        if v_m < 30 or v_m > 660 then raise exception 'Duração inválida em %', to_char(v_t, 'DD/MM'); end if;
        v_pj := coalesce(nullif(v_e->>'projetista', ''), ck->>'projetista');
        enc := coalesce(public._ck_proj(v_pj, v_t, p_id, jsonb_build_object('duracaoMin', v_m, 'encaixe', coalesce((p->>'encaixe')::boolean, false))), enc);
        v_lista := v_lista || jsonb_build_array(jsonb_build_object('data', to_char(v_t, 'YYYY-MM-DD"T"HH24:MI:SS'), 'duracaoMin', v_m, 'projetista', v_pj));
      end loop;
      select coalesce(jsonb_agg(x order by x->>'data'), '[]'::jsonb) into v_lista from jsonb_array_elements(v_lista) x;
      txt := case when jsonb_array_length(v_lista) = 0 then '📆 Dias adicionais removidos — fica só o dia ' || coalesce(to_char(nullif(ck->>'agendadoPara', '')::timestamp, 'DD/MM'), '—')
             else '📆 Atendimento em ' || (jsonb_array_length(v_lista) + 1) || ' dias: ' || coalesce(to_char(nullif(ck->>'agendadoPara', '')::timestamp, 'DD/MM HH24:MI'), '—') || ' + '
               || (select string_agg(to_char((x->>'data')::timestamp, 'DD/MM HH24:MI') || ' (' || (x->>'projetista') || ')', ', ') from jsonb_array_elements(v_lista) x) end
             || ' — lançar também no sistema interno';
      ck := ck || jsonb_build_object('diasExtras', v_lista);
    when 'desmarcar' then$x$);
  d := replace(d, $x$'desmarcadoEm', now(),$x$, $x$'desmarcadoEm', now(), 'diasExtras', null,$x$);
  if d not like '%when ''dias'' then%' or d not like '%''diasExtras'', null%' then raise exception 'dias'; end if;
  execute d;
end $do$;
