-- Checklist: coluna "Agenda" da planilha de tickets = projetista que vai atender (um nome por data, na ordem).
-- Importar agendados passa a gravar o projetista (no dia principal e em cada dia adicional).
-- Quem já está agendado no 360: recebe o projetista se estiver sem; trocar o projetista existente só quando marcado na prévia.
-- "Corrigir a agenda pela planilha" (marcado na prévia): a planilha de agendados vira a agenda oficial —
--   agendado no 360 em outra data → passa para a data/projetista da planilha;
--   agendado no 360 (de hoje em diante) que não está na planilha → é liberado (volta para a agendar).
--   "Aguardando" (data oferecida, esperando o cliente), realizados e encerrados não são tocados.

-- nome da planilha → nome do projetista cadastrado na agenda (ignora acento/maiúscula); desconhecido → null
create or replace function public._ck_nome_proj(p text) returns text
language sql stable security definer set search_path = '' as $$
  select x from public.config cf, jsonb_array_elements_text(coalesce(cf.checklist_agenda->'projetistas', '[]'::jsonb)) x
   where cf.id = 1 and lower(translate(x, 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc'))
                     = lower(translate(btrim(coalesce(p, '')), 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc')) limit 1;
$$;

-- importação de clientes novos: projetista do dia principal e de cada dia adicional
do $do$ declare d text; begin
  d := pg_get_functiondef('public.checklist_importar(jsonb)'::regprocedure);
  if d like '%_ck_nome_proj%' then return; end if;
  d := replace(d, $x$'agendadoPara', ag, 'contatos', 0,$x$, $x$'agendadoPara', ag, 'contatos', 0, 'projetista', case when ag is not null then public._ck_nome_proj(r->>'projetista') end,$x$);
  d := replace(d, $x$(select jsonb_agg(jsonb_build_object('data', to_char((e->>'data')::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS')) order by e->>'data')$x$,
                  $x$(select jsonb_agg(jsonb_build_object('data', to_char((e->>'data')::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS'), 'projetista', coalesce(public._ck_nome_proj(e->>'projetista'), public._ck_nome_proj(r->>'projetista'))) order by e->>'data')$x$);
  if (length(d) - length(replace(d, '_ck_nome_proj', ''))) / length('_ck_nome_proj') <> 3 then raise exception 'anchor checklist_importar'; end if;
  execute d;
end $do$;

-- quem já está no 360 (planilha de agendados): dias que faltam + projetista (substitui checklist_dias_planilha)
create or replace function public.checklist_agendados_planilha(p jsonb, p_aplicar boolean default false, p_trocar_proj boolean default false, p_corrigir boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; num text; c record; k jsonb; eu uuid := auth.uid(); dur int; dd text; pm text; pj text; ex jsonb; novos jsonb; ja date[];
        l_add jsonb := '[]'; l_ag jsonb := '[]'; l_dif jsonb := '[]'; l_pj jsonb := '[]'; n_add int := 0; n_ag int := 0; n_pj int := 0;
        desc_ text[] := '{}'; mudou boolean; pjx boolean; nums text[] := '{}'; l_lib jsonb := '[]'; n_lib int := 0; n_fut int; hj date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.pode_checklist() then raise exception 'Só o setor Checklist ou a Gestão importam a planilha'; end if;
  if jsonb_typeof(p) <> 'array' then raise exception 'Planilha vazia'; end if;
  select coalesce((checklist_agenda->>'duracaoMin')::int, 120) into dur from public.config where id = 1;
  if p_aplicar then perform set_config('alianca.sistema', '1', true); end if;
  for r in select * from jsonb_array_elements(p) loop
    num := regexp_replace(coalesce(r->>'numero', ''), '\D', '', 'g');
    if num = '' or nullif(r->>'agendadoPara', '') is null then continue; end if;
    nums := nums || num;
    -- dias da planilha (um por dia), cada um com seu projetista
    with dias as (
      select (r->>'agendadoPara')::timestamp t, r->>'projetista' n
      union all select nullif(e->>'data', '')::timestamp, coalesce(nullif(e->>'projetista', ''), r->>'projetista')
        from jsonb_array_elements(case when jsonb_typeof(r->'diasExtras') = 'array' then r->'diasExtras' else '[]'::jsonb end) e),
    um as (select distinct on (t::date) t, n from dias where t is not null order by t::date, t)
    select jsonb_agg(jsonb_build_object('t', t, 'n', n, 'p', public._ck_nome_proj(n)) order by t) into ex from um;
    select coalesce(array_agg(distinct x->>'n'), '{}') || desc_ into desc_ from jsonb_array_elements(ex) x where nullif(x->>'n', '') is not null and x->>'p' is null;
    dd := (select string_agg(to_char((x->>'t')::timestamp, 'DD/MM HH24:MI') || coalesce(' ' || nullif(x->>'p', ''), ''), ' + ' order by x->>'t') from jsonb_array_elements(ex) x);
    for c in select ch.id, ch.cliente, ch.tratativa->'checklist' ck from public.chamados ch
              where ch.tipo = 'checklist' and ch.pedido = num and ch.status <> 'concluida' loop
      k := c.ck;
      if coalesce(k->>'etapa', 'a_contatar') in ('realizado', 'desistiu') then continue; end if;
      if k->>'etapa' = 'agendado' then
        -- projetista do dia principal na planilha
        pm := (select x->>'p' from jsonb_array_elements(ex) x where (x->>'t')::timestamp::date = nullif(k->>'agendadoPara', '')::timestamp::date limit 1);
        if not exists (select 1 from jsonb_array_elements(ex) x where (x->>'t')::timestamp::date = nullif(k->>'agendadoPara', '')::timestamp::date) then
          l_dif := l_dif || to_jsonb(c.cliente || ' · venda ' || num || ' — no 360: ' || coalesce(to_char(nullif(k->>'agendadoPara', '')::timestamp, 'DD/MM HH24:MI'), '—') || ' · planilha: ' || dd);
          if p_aplicar and p_corrigir then
            update public.chamados set tratativa = jsonb_set(tratativa, '{checklist}', k || jsonb_build_object(
                'agendadoPara', to_char((ex->0->>'t')::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS'), 'confirmacao', '', 'agendadoPelaPlanilha', now(),
                'projetista', coalesce(nullif(ex->0->>'p', ''), k->>'projetista'),
                'diasExtras', case when jsonb_array_length(ex) > 1 then (select jsonb_agg(jsonb_build_object('data', to_char((x->>'t')::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS'), 'duracaoMin', coalesce((k->>'duracaoMin')::int, dur),
                     'projetista', coalesce(nullif(x->>'p', ''), nullif(ex->0->>'p', ''), k->>'projetista')) order by x->>'t') from jsonb_array_elements(ex) with ordinality o(x, i) where i > 1) end))
             where id = c.id;
            insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (c.id, eu, public._nome(eu),
              '🔁 Agenda corrigida pela planilha de agendados: ' || coalesce(to_char(nullif(k->>'agendadoPara', '')::timestamp, 'DD/MM HH24:MI'), '—') || ' → ' || dd);
          end if;
          continue;
        end if;
        ja := array(select nullif(e->>'data', '')::timestamp::date from jsonb_array_elements(case when jsonb_typeof(k->'diasExtras') = 'array' then k->'diasExtras' else '[]'::jsonb end) e);
        select coalesce(jsonb_agg(jsonb_build_object('data', to_char((x->>'t')::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS'), 'duracaoMin', coalesce((k->>'duracaoMin')::int, dur),
                 'projetista', coalesce(nullif(x->>'p', ''), k->>'projetista')) order by x->>'t'), '[]')
          into novos from jsonb_array_elements(ex) x
         where (x->>'t')::timestamp::date <> nullif(k->>'agendadoPara', '')::timestamp::date and not ((x->>'t')::timestamp::date = any(ja));
        -- projetista: preenche quando o 360 está sem; troca só se pedido na prévia
        pj := case when pm is not null and (nullif(k->>'projetista', '') is null or (p_trocar_proj and k->>'projetista' <> pm)) then pm end;
        pjx := (p_trocar_proj and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(k->'diasExtras') = 'array' then k->'diasExtras' else '[]'::jsonb end) e
                                                 join jsonb_array_elements(ex) x on (x->>'t')::timestamp::date = (e->>'data')::timestamp::date
                                                where nullif(x->>'p', '') is not null and coalesce(e->>'projetista', '') <> x->>'p'));
        mudou := pj is not null or jsonb_array_length(novos) > 0 or pjx;
        if not mudou then continue; end if;
        if jsonb_array_length(novos) > 0 then n_add := n_add + 1; l_add := l_add || to_jsonb(c.cliente || ' · venda ' || num || ' — ' || dd); end if;
        if pj is not null or pjx then n_pj := n_pj + 1; l_pj := l_pj || to_jsonb(c.cliente || ' · venda ' || num || ' — ' || coalesce(nullif(k->>'projetista', ''), 'sem projetista') || ' → ' || coalesce(pj, 'projetista dos dias adicionais conforme a planilha')); end if;
        if p_aplicar then
          update public.chamados set tratativa = jsonb_set(tratativa, '{checklist}', k
              || case when pj is not null then jsonb_build_object('projetista', pj) else '{}'::jsonb end
              || jsonb_build_object('diasExtras', (select jsonb_agg(
                     case when p_trocar_proj and xx.p is not null then e || jsonb_build_object('projetista', xx.p) else e end order by e->>'data')
                   from jsonb_array_elements(case when jsonb_typeof(k->'diasExtras') = 'array' then k->'diasExtras' else '[]'::jsonb end || novos) e
                   left join lateral (select x->>'p' p from jsonb_array_elements(ex) x where (x->>'t')::timestamp::date = (e->>'data')::timestamp::date and nullif(x->>'p', '') is not null limit 1) xx on true)))
           where id = c.id;
          insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (c.id, eu, public._nome(eu), '📆 Planilha de agendados: ' || dd);
        end if;
      else
        if ((ex->-1->>'t')::timestamp)::date < (now() at time zone 'America/Sao_Paulo')::date then continue; end if;
        n_ag := n_ag + 1; l_ag := l_ag || to_jsonb(c.cliente || ' · venda ' || num || ' — ' || dd);
        if p_aplicar then
          update public.chamados set status = 'tratativa', tratativa = jsonb_set(tratativa, '{checklist}', k || jsonb_build_object(
              'etapa', 'agendado', 'agendadoPara', to_char((ex->0->>'t')::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS'), 'retornarEm', null, 'confirmacao', '', 'agendadoPelaPlanilha', now(),
              'projetista', coalesce(nullif(ex->0->>'p', ''), k->>'projetista'),
              'diasExtras', case when jsonb_array_length(ex) > 1 then (select jsonb_agg(jsonb_build_object('data', to_char((x->>'t')::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS'), 'duracaoMin', dur,
                   'projetista', coalesce(nullif(x->>'p', ''), nullif(ex->0->>'p', ''), k->>'projetista')) order by x->>'t') from jsonb_array_elements(ex) with ordinality o(x, i) where i > 1) end))
           where id = c.id;
          insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (c.id, eu, public._nome(eu), '📅 Agendado pela planilha de agendados — ' || dd);
        end if;
      end if;
    end loop;
  end loop;
  -- agendados (de hoje em diante) que não estão na planilha → liberar
  select count(*) into n_fut from public.chamados ch where ch.tipo = 'checklist' and ch.status <> 'concluida' and ch.tratativa->'checklist'->>'etapa' = 'agendado'
     and nullif(ch.tratativa->'checklist'->>'agendadoPara', '')::timestamp::date >= hj;
  for c in select ch.id, ch.cliente, ch.pedido, ch.tratativa->'checklist' ck from public.chamados ch
            where ch.tipo = 'checklist' and ch.status <> 'concluida' and ch.tratativa->'checklist'->>'etapa' = 'agendado'
              and nullif(ch.tratativa->'checklist'->>'agendadoPara', '')::timestamp::date >= hj and not (ch.pedido = any(nums))
            order by ch.tratativa->'checklist'->>'agendadoPara' loop
    n_lib := n_lib + 1; l_lib := l_lib || to_jsonb(c.cliente || ' · venda ' || c.pedido || ' — ' || to_char(nullif(c.ck->>'agendadoPara', '')::timestamp, 'DD/MM HH24:MI') || coalesce(' ' || nullif(c.ck->>'projetista', ''), ''));
    if p_aplicar and p_corrigir then
      update public.chamados set tratativa = jsonb_set(tratativa, '{checklist}', c.ck || jsonb_build_object('etapa', 'a_contatar', 'agendadoPara', null, 'proposta', null,
          'retornarEm', null, 'diasExtras', null, 'confirmacao', '', 'liberadoPelaPlanilha', now(), 'desmarcacoes', coalesce((c.ck->>'desmarcacoes')::int, 0) + 1))
       where id = c.id;
      insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (c.id, eu, public._nome(eu),
        '❌ Liberado da agenda (' || to_char(nullif(c.ck->>'agendadoPara', '')::timestamp, 'DD/MM/YYYY HH24:MI') || '): não está na planilha de agendados — volta para a agendar');
    end if;
  end loop;
  if p_aplicar then perform set_config('alianca.sistema', '0', true); end if;
  return jsonb_build_object('liberar', n_lib, 'listaLiberar', l_lib, 'agendadosFuturos', n_fut, 'alertaLiberar', n_fut >= 10 and n_lib > n_fut / 2,
    'maisDias', n_add, 'agendar', n_ag, 'diferentes', jsonb_array_length(l_dif), 'projetista', n_pj,
    'listaMaisDias', l_add, 'listaAgendar', l_ag, 'listaDiferentes', l_dif, 'listaProjetista', l_pj,
    'desconhecidos', to_jsonb(array(select distinct unnest(desc_))), 'aplicado', p_aplicar);
end $$;
revoke all on function public.checklist_agendados_planilha(jsonb, boolean, boolean, boolean) from public, anon;
grant execute on function public.checklist_agendados_planilha(jsonb, boolean, boolean, boolean) to authenticated;
