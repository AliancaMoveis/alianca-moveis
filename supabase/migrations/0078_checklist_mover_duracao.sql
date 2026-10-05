-- Checklist: duração por cliente (agenda oficial tem atendimentos de 1h a 10h) e ação "mover"
-- (troca projetista, dia, horário e duração de uma vez — usada pela ficha e pelo arrastar na agenda).
-- Conflito = mesmo projetista com atendimentos que se sobrepõem, cada um com a sua duração. Encaixe só com confirmação.
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
  select string_agg(c.cliente || ' às ' || to_char(nullif(c.tratativa->'checklist'->>'agendadoPara', '')::timestamp, 'HH24:MI'), ', ') into outro from public.chamados c
   where c.tipo = 'checklist' and c.id <> p_id and c.status <> 'concluida'
     and c.tratativa->'checklist'->>'etapa' = 'agendado' and c.tratativa->'checklist'->>'projetista' = p_nome
     and nullif(c.tratativa->'checklist'->>'agendadoPara', '')::timestamp < p_dt + make_interval(mins => ndur)
     and p_dt < nullif(c.tratativa->'checklist'->>'agendadoPara', '')::timestamp + make_interval(mins => coalesce((c.tratativa->'checklist'->>'duracaoMin')::int, dur));
  if outro is null then return null; end if;
  if coalesce((p->>'encaixe')::boolean, false) then return p_nome || ' também tem ' || outro; end if;
  raise exception '% já tem checklist nesse horário (%). Para encaixar mesmo assim, marque “Confirmo o encaixe”.', p_nome, outro;
end $$;
revoke all on function public._ck_proj(text, timestamp, text, jsonb) from public, anon, authenticated;

do $do$ declare d text; begin
  d := pg_get_functiondef('public.checklist_registrar(text,jsonb)'::regprocedure);
  d := replace(d, 'declare enc text;', 'declare enc text; v_proj text; v_dur int; v_ant timestamp;');
  d := replace(d, $x$    when 'desmarcar' then$x$, $x$    when 'mover' then
      if coalesce(ck->>'etapa', '') <> 'agendado' then raise exception 'Só dá para mover um checklist agendado'; end if;
      v_ant := nullif(ck->>'agendadoPara', '')::timestamp;
      dt := coalesce(dt, v_ant);
      if dt is null then raise exception 'Informe a data e o horário'; end if;
      v_proj := coalesce(nullif(p->>'projetista', ''), ck->>'projetista');
      if coalesce(v_proj, '') = '' then raise exception 'Escolha o projetista'; end if;
      v_dur := coalesce(nullif(p->>'duracaoMin', '')::int, (ck->>'duracaoMin')::int);
      if v_dur is not null and (v_dur < 30 or v_dur > 660) then raise exception 'Duração inválida'; end if;
      if dt is not distinct from v_ant and v_proj is not distinct from ck->>'projetista' and v_dur is not distinct from (ck->>'duracaoMin')::int then raise exception 'Nada foi alterado'; end if;
      enc := coalesce(enc, public._ck_proj(v_proj, dt, p_id, p || jsonb_build_object('duracaoMin', v_dur)));
      txt := '🔁 Agenda alterada: ' || coalesce(to_char(v_ant, 'DD/MM/YYYY HH24:MI'), '—') || ' ' || coalesce(ck->>'projetista', '—')
          || ' → ' || to_char(dt, 'DD/MM/YYYY HH24:MI') || ' ' || v_proj
          || coalesce(' · ' || round(v_dur / 60.0, 1)::text || 'h', '') || ' — alterar também no sistema interno';
      if dt is distinct from v_ant then ck := ck || jsonb_build_object('remarcacoes', coalesce((ck->>'remarcacoes')::int, 0) + 1, 'confirmacao', ''); end if;
      ck := ck || jsonb_build_object('agendadoPara', to_char(dt, 'YYYY-MM-DD"T"HH24:MI:SS'), 'projetista', v_proj, 'duracaoMin', v_dur);
    when 'desmarcar' then$x$);
  d := replace(d, $x$if acao in ('agendado', 'reagendar', 'projetista') then ck := ck || jsonb_build_object('encaixe'$x$,
                  $x$if acao = 'agendado' and nullif(p->>'duracaoMin', '') is not null then ck := ck || jsonb_build_object('duracaoMin', least(660, greatest(30, (p->>'duracaoMin')::int))); end if;
  if acao in ('agendado', 'reagendar', 'projetista', 'mover') then ck := ck || jsonb_build_object('encaixe'$x$);
  if d not like '%when ''mover'' then%' or d not like '%''projetista'', ''mover''%' or d not like '%v_ant timestamp%' then raise exception 'mover'; end if;
  execute d;
end $do$;
