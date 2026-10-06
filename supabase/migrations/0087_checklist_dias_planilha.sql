-- Checklist: planilha de AGENDADOS com mais de uma data na coluna "Data do Agendamento"
-- ("11/09/26, 15:00, 20/10/26, 09:00" = dois dias distintos de atendimento) também atualiza quem JÁ está no 360.
--  · cliente agendado no 360 cuja data bate com um dos dias da planilha → recebe os dias que faltam como dias adicionais
--  · cliente agendado no 360 em data que não está na planilha → não é alterado (foi remarcado no 360); aparece para conferir
--  · cliente ainda não agendado (a agendar / aguardando) → passa para agendado com os dias da planilha
--  · realizados / encerrados nunca são tocados. Nenhum dia é removido.
-- p_aplicar = false só calcula (prévia).
create or replace function public.checklist_dias_planilha(p jsonb, p_aplicar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; num text; c record; k jsonb; datas timestamp[]; d timestamp; ja date[]; novos jsonb; eu uuid := auth.uid();
        l_add jsonb := '[]'; l_ag jsonb := '[]'; l_dif jsonb := '[]'; n_add int := 0; n_ag int := 0; dur int; dd text;
begin
  if not public.pode_checklist() then raise exception 'Só o setor Checklist ou a Gestão importam a planilha'; end if;
  if jsonb_typeof(p) <> 'array' then raise exception 'Planilha vazia'; end if;
  select coalesce((checklist_agenda->>'duracaoMin')::int, 120) into dur from public.config where id = 1;
  if p_aplicar then perform set_config('alianca.sistema', '1', true); end if;
  for r in select * from jsonb_array_elements(p) loop
    num := regexp_replace(coalesce(r->>'numero', ''), '\D', '', 'g');
    if num = '' or nullif(r->>'agendadoPara', '') is null then continue; end if;
    select array_agg(distinct x order by x) into datas from (
      select (r->>'agendadoPara')::timestamp x
      union select nullif(e->>'data', '')::timestamp from jsonb_array_elements(case when jsonb_typeof(r->'diasExtras') = 'array' then r->'diasExtras' else '[]'::jsonb end) e) t
     where x is not null;
    -- um dia por data (dois horários no mesmo dia = o primeiro)
    select array_agg(m order by m) into datas from (select min(x) m from unnest(datas) x group by x::date) t;
    for c in select ch.id, ch.cliente, ch.tratativa->'checklist' ck from public.chamados ch
              where ch.tipo = 'checklist' and ch.pedido = num and ch.status <> 'concluida' loop
      k := c.ck; dd := (select string_agg(to_char(x, 'DD/MM HH24:MI'), ' + ') from unnest(datas) x);
      if coalesce(k->>'etapa', 'a_contatar') in ('realizado', 'desistiu') then continue; end if;
      if k->>'etapa' = 'agendado' then
        if array_length(datas, 1) < 2 then continue; end if;
        ja := array(select nullif(k->>'agendadoPara', '')::timestamp::date
                    union select nullif(e->>'data', '')::timestamp::date from jsonb_array_elements(case when jsonb_typeof(k->'diasExtras') = 'array' then k->'diasExtras' else '[]'::jsonb end) e);
        if not (nullif(k->>'agendadoPara', '')::timestamp::date = any(array(select x::date from unnest(datas) x))) then
          l_dif := l_dif || to_jsonb(c.cliente || ' · venda ' || num || ' — no 360: ' || coalesce(to_char(nullif(k->>'agendadoPara', '')::timestamp, 'DD/MM HH24:MI'), '—') || ' · planilha: ' || dd);
          continue;
        end if;
        select coalesce(jsonb_agg(jsonb_build_object('data', to_char(x, 'YYYY-MM-DD"T"HH24:MI:SS'), 'duracaoMin', coalesce((k->>'duracaoMin')::int, dur), 'projetista', k->>'projetista') order by x), '[]')
          into novos from unnest(datas) x where not (x::date = any(ja));
        if jsonb_array_length(novos) = 0 then continue; end if;
        n_add := n_add + 1; l_add := l_add || to_jsonb(c.cliente || ' · venda ' || num || ' — ' || dd);
        if p_aplicar then
          update public.chamados set tratativa = jsonb_set(tratativa, '{checklist}', k || jsonb_build_object('diasExtras',
              (select jsonb_agg(x order by x->>'data') from jsonb_array_elements(case when jsonb_typeof(k->'diasExtras') = 'array' then k->'diasExtras' else '[]'::jsonb end || novos) x)))
           where id = c.id;
          insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (c.id, eu, public._nome(eu),
            '📆 Planilha de agendados: atendimento em ' || array_length(datas, 1) || ' dias — ' || dd);
        end if;
      else
        if datas[array_length(datas, 1)]::date < (now() at time zone 'America/Sao_Paulo')::date then continue; end if;
        n_ag := n_ag + 1; l_ag := l_ag || to_jsonb(c.cliente || ' · venda ' || num || ' — ' || dd);
        if p_aplicar then
          update public.chamados set status = 'tratativa', tratativa = jsonb_set(tratativa, '{checklist}', k || jsonb_build_object(
              'etapa', 'agendado', 'agendadoPara', to_char(datas[1], 'YYYY-MM-DD"T"HH24:MI:SS'), 'retornarEm', null, 'confirmacao', '', 'agendadoPelaPlanilha', now(),
              'diasExtras', case when array_length(datas, 1) > 1 then (select jsonb_agg(jsonb_build_object('data', to_char(x, 'YYYY-MM-DD"T"HH24:MI:SS'), 'duracaoMin', dur, 'projetista', k->>'projetista') order by x) from unnest(datas[2:]) x) end))
           where id = c.id;
          insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (c.id, eu, public._nome(eu),
            '📅 Agendado pela planilha de agendados — ' || dd);
        end if;
      end if;
    end loop;
  end loop;
  if p_aplicar then perform set_config('alianca.sistema', '0', true); end if;
  return jsonb_build_object('maisDias', n_add, 'agendar', n_ag, 'diferentes', jsonb_array_length(l_dif),
    'listaMaisDias', l_add, 'listaAgendar', l_ag, 'listaDiferentes', l_dif, 'aplicado', p_aplicar);
end $$;
revoke all on function public.checklist_dias_planilha(jsonb, boolean) from public, anon;
grant execute on function public.checklist_dias_planilha(jsonb, boolean) to authenticated;
