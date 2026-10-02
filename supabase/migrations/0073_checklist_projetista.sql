-- Checklist: projetista do agendamento (lista configurável). Obrigatório ao agendar; o mesmo projetista não pode ter dois clientes no mesmo horário.
update public.config set checklist_agenda = checklist_agenda || '{"projetistas":["Silvane","Rafael","Angela","Gislaine","Cleberson","Juliana"]}'::jsonb
 where id = 1 and not (checklist_agenda ? 'projetistas');
alter table public.config alter column checklist_agenda set default
  '{"dias":[1,2,3,4,5],"horarios":["09:00","10:30","14:00","15:30","17:00"],"vagas":1,"seguraDias":2,"projetistas":["Silvane","Rafael","Angela","Gislaine","Cleberson","Juliana"]}'::jsonb;

create or replace function public._ck_projetista_ok(p_nome text, p_dt timestamp, p_id text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare outro text;
begin
  if not exists (select 1 from public.config cf, jsonb_array_elements_text(coalesce(cf.checklist_agenda->'projetistas', '[]'::jsonb)) x where cf.id = 1 and x = p_nome) then
    raise exception 'Escolha o projetista da lista';
  end if;
  if p_dt is null then return; end if;
  select c.cliente into outro from public.chamados c
   where c.tipo = 'checklist' and c.id <> p_id and c.status <> 'concluida'
     and c.tratativa->'checklist'->>'etapa' = 'agendado' and c.tratativa->'checklist'->>'projetista' = p_nome
     and nullif(c.tratativa->'checklist'->>'agendadoPara', '')::timestamp = p_dt limit 1;
  if outro is not null then raise exception '% já tem checklist nesse horário (%)', p_nome, outro; end if;
end $$;
revoke all on function public._ck_projetista_ok(text, timestamp, text) from public, anon, authenticated;

do $do$ declare d text; begin
  d := pg_get_functiondef('public.salvar_checklist_agenda(jsonb)'::regprocedure);
  d := replace(d, $x$  update public.config set checklist_agenda = jsonb_build_object('dias', p->'dias',$x$, $x$  if jsonb_typeof(p->'projetistas') <> 'array' or jsonb_array_length(p->'projetistas') = 0 then raise exception 'Informe pelo menos um projetista'; end if;
  update public.config set checklist_agenda = jsonb_build_object('projetistas', (select jsonb_agg(distinct btrim(x)) from jsonb_array_elements_text(p->'projetistas') x where btrim(x) <> ''), 'dias', p->'dias',$x$);
  if d not like '%''projetistas''%' then raise exception 'cfg'; end if;
  execute d;

  d := pg_get_functiondef('public.checklist_registrar(text,jsonb)'::regprocedure);
  -- agendar: projetista obrigatório
  d := replace(d, $x$      ck := ck || jsonb_build_object('etapa', 'agendado', 'agendadoPara', dt, 'ambiente', p->>'ambiente', 'retornarEm', null);
      txt := '📅 Checklist agendado para ' || to_char(dt, 'DD/MM/YYYY HH24:MI')$x$, $x$      if coalesce(p->>'projetista', '') = '' then raise exception 'Informe o projetista do checklist'; end if;
      perform public._ck_projetista_ok(p->>'projetista', dt, p_id);
      ck := ck || jsonb_build_object('etapa', 'agendado', 'agendadoPara', dt, 'ambiente', p->>'ambiente', 'retornarEm', null, 'projetista', p->>'projetista');
      txt := '📅 Checklist agendado para ' || to_char(dt, 'DD/MM/YYYY HH24:MI') || ' com ' || (p->>'projetista')$x$);
  -- alterar data: pode trocar o projetista junto
  d := replace(d, $x$      ck := ck || jsonb_build_object('agendadoPara', dt, 'remarcacoes', coalesce((ck->>'remarcacoes')::int, 0) + 1);$x$, $x$      if coalesce(p->>'projetista', '') <> '' then
        perform public._ck_projetista_ok(p->>'projetista', dt, p_id);
        if p->>'projetista' is distinct from ck->>'projetista' then txt := txt || ' · projetista ' || coalesce(ck->>'projetista', '—') || ' → ' || (p->>'projetista'); end if;
        ck := ck || jsonb_build_object('projetista', p->>'projetista');
      elsif ck->>'projetista' is not null then
        perform public._ck_projetista_ok(ck->>'projetista', dt, p_id);
      end if;
      ck := ck || jsonb_build_object('agendadoPara', dt, 'remarcacoes', coalesce((ck->>'remarcacoes')::int, 0) + 1);$x$);
  -- informar/trocar só o projetista (agendados antigos)
  d := replace(d, $x$    when 'desmarcar' then$x$, $x$    when 'projetista' then
      if coalesce(ck->>'etapa', '') <> 'agendado' then raise exception 'Informe o projetista só em checklist agendado'; end if;
      perform public._ck_projetista_ok(coalesce(p->>'projetista', ''), nullif(ck->>'agendadoPara', '')::timestamp, p_id);
      txt := '👤 Projetista do checklist: ' || coalesce(ck->>'projetista', '—') || ' → ' || (p->>'projetista');
      ck := ck || jsonb_build_object('projetista', p->>'projetista');
    when 'desmarcar' then$x$);
  if d not like '%''projetista'', p->>''projetista''%' or d not like '%when ''projetista'' then%' then raise exception 'reg'; end if;
  execute d;
end $do$;
