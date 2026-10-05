-- Checklist: fechar agenda (feriado, folga, consulta, falta…) — de um projetista ou de todos, dia inteiro ou só um período.
-- O banco recusa agendar / oferecer horário em período fechado. Reabrir = desativar o bloqueio (fica o registro).
create table if not exists public.checklist_bloqueios (
  id bigserial primary key,
  projetista text,                 -- null = todos os projetistas
  inicio timestamp not null,
  fim timestamp not null,
  motivo text not null default '',
  obs text not null default '',
  ativo boolean not null default true,
  criado_por text not null default '',
  criado_em timestamptz not null default now(),
  reaberto_por text,
  reaberto_em timestamptz,
  check (fim > inicio)
);
alter table public.checklist_bloqueios enable row level security;
create policy ck_bloq_ler on public.checklist_bloqueios for select to authenticated using (public.pode_checklist());

create or replace function public.checklist_bloqueio_salvar(p jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_ini timestamp; v_fim timestamp; v_proj text; nid bigint;
begin
  if not public.pode_checklist() then raise exception 'Só o setor Checklist ou a Gestão fecham a agenda'; end if;
  v_ini := nullif(p->>'inicio', '')::timestamp; v_fim := nullif(p->>'fim', '')::timestamp;
  if v_ini is null or v_fim is null then raise exception 'Informe o início e o fim'; end if;
  if v_fim <= v_ini then raise exception 'O fim precisa ser depois do início'; end if;
  if v_fim - v_ini > interval '62 days' then raise exception 'Período longo demais (máx. 2 meses)'; end if;
  if coalesce(btrim(p->>'motivo'), '') = '' then raise exception 'Informe o motivo'; end if;
  v_proj := nullif(btrim(coalesce(p->>'projetista', '')), '');
  if v_proj is not null and not exists (select 1 from public.config cf, jsonb_array_elements_text(coalesce(cf.checklist_agenda->'projetistas', '[]'::jsonb)) x where cf.id = 1 and x = v_proj) then
    raise exception 'Projetista não encontrado';
  end if;
  insert into public.checklist_bloqueios (projetista, inicio, fim, motivo, obs, criado_por)
  values (v_proj, v_ini, v_fim, btrim(p->>'motivo'), left(coalesce(p->>'obs', ''), 500), public._nome(auth.uid())) returning id into nid;
  return nid;
end $$;
revoke all on function public.checklist_bloqueio_salvar(jsonb) from public, anon;
grant execute on function public.checklist_bloqueio_salvar(jsonb) to authenticated;

create or replace function public.checklist_bloqueio_reabrir(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode_checklist() then raise exception 'Só o setor Checklist ou a Gestão reabrem a agenda'; end if;
  update public.checklist_bloqueios set ativo = false, reaberto_por = public._nome(auth.uid()), reaberto_em = now() where id = p_id and ativo;
  if not found then raise exception 'Bloqueio não encontrado'; end if;
end $$;
revoke all on function public.checklist_bloqueio_reabrir(bigint) from public, anon;
grant execute on function public.checklist_bloqueio_reabrir(bigint) to authenticated;

-- agendar / oferecer / mover em período fechado é recusado
do $do$ declare d text; begin
  d := pg_get_functiondef('public._ck_proj(text,timestamp without time zone,text,jsonb)'::regprocedure);
  if d like '%checklist_bloqueios%' then return; end if;
  d := replace(d, $x$  with ag as ($x$, $x$  select 'agenda fechada (' || b.motivo || coalesce(' — ' || nullif(b.obs, ''), '') || ', ' || to_char(b.inicio, 'DD/MM HH24:MI') || ' a ' || to_char(b.fim, 'DD/MM HH24:MI') || ')' into outro
    from public.checklist_bloqueios b
   where b.ativo and (b.projetista is null or b.projetista = p_nome) and b.inicio < p_dt + make_interval(mins => ndur) and p_dt < b.fim
   order by b.inicio limit 1;
  if outro is not null then raise exception '% está com a %. Escolha outro dia/horário ou reabra a agenda.', p_nome, outro; end if;
  with ag as ($x$);
  if d not like '%checklist_bloqueios%' then raise exception 'anchor'; end if;
  execute d;
end $do$;

-- correção: diasExtras pode estar gravado como null (desmarcar) — só expande quando for lista
do $do$ declare d text; begin
  d := pg_get_functiondef('public._ck_proj(text,timestamp without time zone,text,jsonb)'::regprocedure);
  d := replace(d, $x$jsonb_array_elements(coalesce(k->'diasExtras', '[]'::jsonb))$x$, $x$jsonb_array_elements(case when jsonb_typeof(k->'diasExtras') = 'array' then k->'diasExtras' else '[]'::jsonb end)$x$);
  execute d;
end $do$;
