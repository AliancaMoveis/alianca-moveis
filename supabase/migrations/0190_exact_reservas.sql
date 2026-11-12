-- ALIANÇA 360 · Integração Exact: horário oferecido pelo WhatsApp (aguardando resposta) vira RESERVA no Exact
create table if not exists public.exact_reserva (event_id bigint primary key, chamado_id text not null, dia date, inicio timestamp, fim timestamp, agenda_id int, criado_em timestamptz default now());
create index if not exists exact_reserva_ch on public.exact_reserva (chamado_id);
alter table public.exact_reserva enable row level security;

-- reservas que o checklist deve ter no Exact (horário oferecido e ainda sem resposta) e as que já tem
create or replace function public.exact_reserva_plano(p_id text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare c record; k jsonb; hj date := (now() at time zone 'America/Sao_Paulo')::date; sec int; des jsonb := '[]'; exi jsonb;
begin
  select * into c from public.chamados where id = p_id and tipo = 'checklist';
  if not found then return jsonb_build_object('desejadas','[]'::jsonb,'existentes','[]'::jsonb); end if;
  k := coalesce(c.tratativa->'checklist', '{}');
  select id into sec from public.exact_agenda where lower(titulo) = 'secretaria' limit 1;
  if c.status <> 'concluida' and coalesce(k->>'etapa','') = 'aguardando' and nullif(k->>'proposta','') is not null then
    select coalesce(jsonb_agg(jsonb_build_object('dia', left(d.tt,10), 'start', public._ex_utc(d.tt::timestamp), 'end', public._ex_utc(d.tt::timestamp + make_interval(mins => d.dur)),
             'agendaId', coalesce((select a.id from public.exact_agenda a where a.projetista = d.pp order by a.id limit 1), sec)) order by d.tt), '[]') into des
      from (select distinct on (left(y.tt,10)) y.tt, y.pp, y.dur from (
              select left(k->>'proposta',16) tt, coalesce(nullif(k->>'propostaProjetista',''), k->>'projetista') pp, coalesce((k->>'duracaoMin')::int, 120) dur
              union all select left(coalesce(e->>'data', e#>>'{}'),16), coalesce(nullif(e->>'projetista',''), nullif(k->>'propostaProjetista',''), k->>'projetista'), coalesce((e->>'duracaoMin')::int, (k->>'duracaoMin')::int, 120)
                from jsonb_array_elements(case when jsonb_typeof(k->'propostaDiasExtras')='array' then k->'propostaDiasExtras' else '[]' end) e) y
            where y.tt ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d' and left(y.tt,10)::date >= hj order by left(y.tt,10), y.tt) d;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.event_id, 'dia', to_char(r.dia,'YYYY-MM-DD'), 'start', public._ex_utc(r.inicio), 'end', public._ex_utc(r.fim), 'agendaId', r.agenda_id) order by r.inicio), '[]')
    into exi from public.exact_reserva r where r.chamado_id = p_id;
  return jsonb_build_object('desejadas', des, 'existentes', exi,
    'descricao', 'RESERVA 360 · ' || upper(c.cliente) || ' · ' || coalesce(c.pedido,''),
    'notes', '⏳ Aguardando resposta do cliente — horário oferecido pelo WhatsApp no 360' ||
             coalesce(' em ' || to_char((nullif(k->>'ultimoContato','')::timestamptz) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), '') ||
             ' · tel ' || public._ex_fone(c.telefone));
end $$;

create or replace function public.exact_reserva_ok(p_id text, p jsonb) returns void language plpgsql security definer set search_path to '' as $$
declare f jsonb; txt text := ''; err boolean := jsonb_array_length(coalesce(p->'erros','[]')) > 0;
begin
  perform set_config('alianca.sistema', '1', true);
  perform set_config('alianca.exact', '1', true);
  for f in select * from jsonb_array_elements(coalesce(p->'feitos','[]')) loop
    if f->>'op' = 'excluir' then delete from public.exact_reserva where event_id = (f->>'id')::bigint;
    elsif f->>'id' is not null then
      insert into public.exact_reserva (event_id, chamado_id, dia, inicio, fim, agenda_id)
      values ((f->>'id')::bigint, p_id, public._ex_local(f->>'start')::date, public._ex_local(f->>'start'), public._ex_local(f->>'end'), (f->>'agendaId')::int)
      on conflict (event_id) do update set dia = excluded.dia, inicio = excluded.inicio, fim = excluded.fim, agenda_id = excluded.agenda_id;
    end if;
    txt := txt || case f->>'op' when 'criar' then ' · reservado ' when 'alterar' then ' · reserva alterada ' else ' · reserva liberada ' end
                || coalesce(to_char(public._ex_local(f->>'start'), 'DD/MM HH24:MI'), '');
  end loop;
  if txt <> '' or err then
    insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (p_id, '00000000-0000-4000-a000-000000000007', 'Exact (integração)',
      case when err then '⚠️ Reserva não foi para o Exact: ' || left(p->'erros'->>0, 300) else '📤 Exact' || txt end);
  end if;
  insert into public.exact_log (tipo, chamado_id, ok, detalhe) values ('reserva', p_id, not err, left(p::text, 2000));
end $$;
revoke all on function public.exact_reserva_plano(text), public.exact_reserva_ok(text, jsonb) from public, anon, authenticated;
grant execute on function public.exact_reserva_plano(text), public.exact_reserva_ok(text, jsonb) to service_role;

-- gatilho: agenda OU horário oferecido mudou → manda para o Exact
create or replace function public._trg_exact_push() returns trigger language plpgsql security definer set search_path to '' as $$
declare cfg record; o jsonb; n jsonb; mud_ag boolean := false; mud_res boolean := false; tem_res boolean;
begin
  if new.tipo <> 'checklist' then return new; end if;
  if coalesce(current_setting('alianca.exact', true), '') = '1' or coalesce(current_setting('alianca.sistema', true), '') = '1' then return new; end if;
  select * into cfg from public.exact_config where id = 1;
  if not found or not cfg.escrever_ativo then return new; end if;
  n := coalesce(new.tratativa->'checklist', '{}');
  o := case when tg_op = 'UPDATE' then coalesce(old.tratativa->'checklist', '{}') else '{}'::jsonb end;
  -- agendamento
  if (o->'agendadoPara' is distinct from n->'agendadoPara' or o->'diasExtras' is distinct from n->'diasExtras' or o->'projetista' is distinct from n->'projetista'
      or o->'etapa' is distinct from n->'etapa' or o->'duracaoMin' is distinct from n->'duracaoMin')
     and (coalesce(o->>'etapa','') = 'agendado' or coalesce(n->>'etapa','') = 'agendado')
     and exists (select 1 from public.exact_ticket t where t.sale_id = new.pedido) then mud_ag := true; end if;
  -- reserva (horário oferecido aguardando resposta)
  tem_res := exists (select 1 from public.exact_reserva r where r.chamado_id = new.id);
  if (o->'proposta' is distinct from n->'proposta' or o->'propostaProjetista' is distinct from n->'propostaProjetista' or o->'propostaDiasExtras' is distinct from n->'propostaDiasExtras'
      or o->'etapa' is distinct from n->'etapa' or o->'duracaoMin' is distinct from n->'duracaoMin' or (tg_op = 'UPDATE' and old.status is distinct from new.status))
     and (coalesce(n->>'etapa','') = 'aguardando' or tem_res) then mud_res := true; end if;
  if not mud_ag and not mud_res then return new; end if;
  if mud_ag then new.tratativa := jsonb_set(coalesce(new.tratativa,'{}'), '{checklist,exactPend}', to_jsonb(now())); end if;
  perform net.http_post(url := cfg.url_funcao, body := jsonb_build_object('acao', 'push', 'id', new.id, 'agenda', mud_ag, 'reserva', mud_res),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-exact-segredo', cfg.segredo), timeout_milliseconds := 60000);
  return new;
end $$;

-- a leitura do Exact ignora as reservas criadas pelo 360 (não viram bloqueio nem agendamento)
do $$
declare src text := pg_get_functiondef('public.exact_aplicar'::regproc); a text;
begin
  if position('exact_reserva' in src) > 0 then return; end if;
  a := E'   where public._ex_local(e->>''start'')::date >= hj\n';
  if position(a in src) = 0 then raise exception 'trecho não encontrado em exact_aplicar'; end if;
  src := replace(src, a, E'   where public._ex_local(e->>''start'')::date >= hj and not exists (select 1 from public.exact_reserva rr where rr.event_id = (e->>''id'')::bigint)\n');
  execute src;
end $$;

select 'ok — reservas do 360 vão para o Exact' as resultado;
