-- ALIANÇA 360 · Integração com o Exact (checklist): lê o quadro e o calendário do Exact e envia os agendamentos do 360.
-- A chave do Exact fica no segredo EXACT_TOKEN da função "exact" (não fica no banco).

create table if not exists public.exact_config (
  id int primary key default 1 check (id = 1),
  segredo text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  url_funcao text,
  ler_ativo boolean not null default false,       -- Exact → 360 automático (a cada 5 min)
  escrever_ativo boolean not null default false,  -- 360 → Exact na hora
  ultimo_sync timestamptz, ultimo_resultado jsonb);
insert into public.exact_config (id, url_funcao) values (1, 'https://byunwadtkvgwqnlxhpcn.supabase.co/functions/v1/exact') on conflict (id) do nothing;
alter table public.exact_config enable row level security;

create table if not exists public.exact_agenda (id int primary key, titulo text, projetista text);
create table if not exists public.exact_ticket (sale_id text primary key, ticket_id int, status text, cliente text, atualizado timestamptz default now());
create index if not exists exact_ticket_tid on public.exact_ticket (ticket_id);
create table if not exists public.exact_evento (id bigint primary key, agenda_id int, ticket_id int, sale_id text, inicio timestamp, fim timestamp,
  descricao text, obs text, visto_em timestamptz default now());
create index if not exists exact_evento_sale on public.exact_evento (sale_id, inicio);
create table if not exists public.exact_log (id bigserial primary key, em timestamptz not null default now(), tipo text, chamado_id text, ok boolean, detalhe text);
alter table public.exact_agenda enable row level security;
alter table public.exact_ticket enable row level security;
alter table public.exact_evento enable row level security;
alter table public.exact_log enable row level security;
drop policy if exists exact_log_ler on public.exact_log;
create policy exact_log_ler on public.exact_log for select using (public.eh_gestao() or public.pode_checklist());
drop policy if exists exact_ticket_ler on public.exact_ticket;
create policy exact_ticket_ler on public.exact_ticket for select using (public.eh_gestao() or public.pode_checklist());
grant select on public.exact_log, public.exact_ticket to authenticated;

alter table public.checklist_bloqueios add column if not exists exact_event_id bigint unique;

-- UTC (Exact) ⇄ horário de Curitiba (360)
create or replace function public._ex_local(t text) returns timestamp language sql immutable as $$ select (t::timestamptz at time zone 'America/Sao_Paulo') $$;
create or replace function public._ex_utc(t timestamp) returns text language sql immutable as $$ select to_char((t at time zone 'America/Sao_Paulo') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"') $$;
create or replace function public._ex_fone(t text) returns text language sql immutable as $$
  select case when length(d) = 11 then '(' || left(d,2) || ') ' || substr(d,3,1) || '-' || substr(d,4,4) || '-' || substr(d,8,4)
              when length(d) = 10 then '(' || left(d,2) || ') ' || substr(d,3,4) || '-' || substr(d,7,4) else coalesce(t,'') end
  from (select regexp_replace(coalesce(t,''), '\D', '', 'g') d) z $$;

-- vendas do quadro que ainda não existem no 360 (para a função buscar o telefone)
create or replace function public.exact_vendas_novas(p jsonb) returns text[] language sql stable security definer set search_path to '' as $$
  select coalesce(array_agg(distinct s), '{}') from jsonb_array_elements_text(p) s
   where s ~ '^\d+$' and not exists (select 1 from public.chamados c where c.tipo = 'checklist' and c.pedido = s) $$;

-- ========== Exact → 360 ==========
create or replace function public.exact_aplicar(p jsonb) returns jsonb language plpgsql security definer set search_path to '' as $$
declare hj date := (now() at time zone 'America/Sao_Paulo')::date; bruno uuid := '00000000-0000-4000-a000-000000000007';
  r record; c record; k jsonb; novos jsonb; ant text; dep text; todos jsonb; passados jsonb; dur int; nid text; tick record;
  n_ag int := 0; n_reab int := 0; n_novo int := 0; n_volta int := 0; n_canc int := 0; n_fin int := 0; n_obra int := 0; n_bloq int := 0; n_bloq_del int := 0;
  completo boolean := coalesce((p->>'completo')::boolean, false); col text;
begin
  perform set_config('alianca.sistema', '1', true);
  perform set_config('alianca.exact', '1', true);
  -- agendas
  insert into public.exact_agenda (id, titulo, projetista)
  select (a->>'id')::int, a->>'title', public._ck_nome_proj(a->>'title') from jsonb_array_elements(coalesce(p->'agendas','[]')) a
  on conflict (id) do update set titulo = excluded.titulo, projetista = excluded.projetista;
  -- tickets (etapa no quadro)
  insert into public.exact_ticket (sale_id, ticket_id, status, cliente, atualizado)
  select distinct on (x->>'saleId') x->>'saleId', (x->>'ticketId')::int, x->>'col', x->>'client', now() from jsonb_array_elements(coalesce(p->'cards','[]')) x
   where coalesce(x->>'saleId','') <> '' order by x->>'saleId', (x->>'ticketId')::int desc
  on conflict (sale_id) do update set ticket_id = excluded.ticket_id, status = excluded.status, cliente = excluded.cliente, atualizado = now();
  -- eventos de hoje em diante
  if completo then
    delete from public.exact_evento where inicio >= hj;
  else
    delete from public.exact_evento where inicio >= hj and ticket_id in (select (x->>'ticketId')::int from jsonb_array_elements(coalesce(p->'cards','[]')) x);
  end if;
  insert into public.exact_evento (id, agenda_id, ticket_id, sale_id, inicio, fim, descricao, obs, visto_em)
  select (e->>'id')::bigint, (e->>'agendaId')::int, nullif(e->>'ticketId','')::int,
         coalesce(nullif(e->>'saleId',''), (select t.sale_id from public.exact_ticket t where t.ticket_id = nullif(e->>'ticketId','')::int limit 1),
                  case when e->>'ticketId' is null then substring(coalesce(e->>'description','') || ' ' || coalesce(e->>'notes','') from '[Vv]enda\D{0,6}(1\d{6})') end),
         public._ex_local(e->>'start'), public._ex_local(e->>'end'), e->>'description', e->>'notes', now()
    from jsonb_array_elements(coalesce(p->'eventos','[]')) e
   where public._ex_local(e->>'start')::date >= hj
  on conflict (id) do update set agenda_id = excluded.agenda_id, ticket_id = excluded.ticket_id, sale_id = excluded.sale_id, inicio = excluded.inicio, fim = excluded.fim,
    descricao = excluded.descricao, obs = excluded.obs, visto_em = now();

  -- travas manuais (sem venda) → bloqueios da agenda do 360
  if completo then
    for r in select e.*, a.projetista from public.exact_evento e join public.exact_agenda a on a.id = e.agenda_id
              where e.inicio >= hj and a.projetista is not null
                and (e.sale_id is null or not exists (select 1 from public.chamados ch where ch.tipo = 'checklist' and ch.pedido = e.sale_id)) loop
      insert into public.checklist_bloqueios (projetista, inicio, fim, motivo, obs, ativo, criado_por, exact_event_id)
      values (r.projetista, r.inicio, r.fim,
        case when coalesce(r.descricao,'') || coalesce(r.obs,'') ~* 'f[eé]rias' then 'Férias' when coalesce(r.descricao,'') ~* 'feriado' then 'Feriado'
             when coalesce(r.descricao,'') ~* 'm[eé]dic|atesta|consulta|licen' then 'Médico / atestado'
             when coalesce(r.descricao,'') || coalesce(r.obs,'') ~* 'reserv' then 'Reservado no Exact' else 'Agenda do Exact' end,
        btrim(concat_ws(' · ', nullif(btrim(r.descricao),''), nullif(btrim(r.obs),''))), true, 'Exact', r.id)
      on conflict (exact_event_id) do update set projetista = excluded.projetista, inicio = excluded.inicio, fim = excluded.fim, motivo = excluded.motivo, obs = excluded.obs, ativo = true;
      n_bloq := n_bloq + 1;
    end loop;
    with del as (delete from public.checklist_bloqueios b where b.exact_event_id is not null and b.fim >= hj
                   and not exists (select 1 from public.exact_evento e join public.exact_agenda a on a.id = e.agenda_id
                                    where e.id = b.exact_event_id and a.projetista is not null
                                      and (e.sale_id is null or not exists (select 1 from public.chamados ch where ch.tipo = 'checklist' and ch.pedido = e.sale_id))) returning 1)
    select count(*) into n_bloq_del from del;
  end if;

  -- agenda de cada venda (dias de hoje em diante) = Exact
  for r in select e.sale_id, jsonb_agg(jsonb_build_object('t', to_char(e.inicio,'YYYY-MM-DD"T"HH24:MI'), 'p', a.projetista,
                    'dur', greatest(30, (extract(epoch from (e.fim - e.inicio)) / 60)::int)) order by e.inicio) d
             from (select distinct on (sale_id, inicio::date) * from public.exact_evento where sale_id is not null and inicio >= hj order by sale_id, inicio::date, inicio) e
             left join public.exact_agenda a on a.id = e.agenda_id
            group by e.sale_id loop
    select ch.id, ch.status::text st, ch.tratativa->'checklist' ck into c from public.chamados ch
     where ch.tipo = 'checklist' and ch.pedido = r.sale_id and ch.status <> 'concluida' order by ch.criado_em limit 1;
    if found then
      k := coalesce(c.ck, '{}');
      if k ? 'exactPend' then continue; end if;  -- alteração do 360 ainda indo para o Exact
      novos := (select jsonb_agg(jsonb_build_object('t', x->>'t', 'p', coalesce(x->>'p', k->>'projetista'), 'dur', x->'dur') order by x->>'t') from jsonb_array_elements(r.d) x);
      select string_agg(to_char(t::timestamp,'DD/MM HH24:MI') || coalesce(' ' || p,''), ' + ' order by t) into ant from (
        select distinct on (left(t,10)) t, p from (
          select left(k->>'agendadoPara',16) t, k->>'projetista' p where nullif(k->>'agendadoPara','') is not null
          union all select left(e->>'data',16), coalesce(nullif(e->>'projetista',''), k->>'projetista') from jsonb_array_elements(case when jsonb_typeof(k->'diasExtras')='array' then k->'diasExtras' else '[]' end) e
           where nullif(e->>'data','') is not null) y where left(t,10)::date >= hj order by left(t,10), t) z;
      if coalesce(k->>'etapa','') <> 'agendado' then ant := null; end if;
      select string_agg(to_char((x->>'t')::timestamp,'DD/MM HH24:MI') || coalesce(' ' || (x->>'p'),''), ' + ' order by x->>'t') into dep from jsonb_array_elements(novos) x;
      if coalesce(ant,'') = coalesce(dep,'') then continue; end if;
      with d as (select left(k->>'agendadoPara',16) t, k->>'projetista' p where nullif(k->>'agendadoPara','') is not null
                 union all select left(e->>'data',16), coalesce(nullif(e->>'projetista',''), k->>'projetista') from jsonb_array_elements(case when jsonb_typeof(k->'diasExtras')='array' then k->'diasExtras' else '[]' end) e where nullif(e->>'data','') is not null)
      select coalesce(jsonb_agg(jsonb_build_object('t',t,'p',p) order by t),'[]') into passados from (select distinct on (left(t,10)) t,p from d where left(t,10)::date < hj order by left(t,10), t) z;
      if coalesce(k->>'etapa','') <> 'agendado' then passados := '[]'; end if;
      select jsonb_agg(x order by x->>'t') into todos from jsonb_array_elements(passados || novos) x;
      dur := coalesce((novos->0->>'dur')::int, (k->>'duracaoMin')::int);
      update public.chamados set status = 'tratativa', tratativa = jsonb_set(coalesce(tratativa,'{}'), '{checklist}', ((k
          || jsonb_build_object('etapa','agendado','agendadoPara',(todos->0->>'t')||':00','projetista',todos->0->>'p','retornarEm',null,'duracaoMin',dur,'ajustadoPeloExact',now(),
               'confirmacao', case when left(coalesce(k->>'agendadoPara',''),16) = todos->0->>'t' then coalesce(k->>'confirmacao','') else '' end,
               'diasExtras',(select jsonb_agg(jsonb_build_object('data',(x->>'t')||':00','projetista',x->>'p','duracaoMin',coalesce((x->>'dur')::int,dur)) order by x->>'t') from jsonb_array_elements(todos) with ordinality o(x,i) where i > 1)))
          - 'canceladoPeloExact' - 'foraPlanilhaAgendados' - 'foraPlanilhaAgendar' - 'foraExact' - 'liberadoPeloExact' - 'proposta')) where id = c.id;
      insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (c.id, bruno, 'Exact (sincronização)',
        '🔁 Agenda atualizada pelo Exact: ' || coalesce(ant, case when k->>'etapa' = 'agendado' then 'sem data futura' else 'não agendado' end) || ' → ' || dep);
      n_ag := n_ag + 1;
    else
      select * into tick from public.exact_ticket where sale_id = r.sale_id;
      if coalesce(tick.status,'') in ('CHECKLIST_CANCELLED','CHECKLIST_FINISHED') then continue; end if;
      -- encerrado no 360 por engano → reabre; sem registro → cria
      select ch.id, ch.tratativa->'checklist' ck into c from public.chamados ch where ch.tipo = 'checklist' and ch.pedido = r.sale_id
         and coalesce(ch.tratativa->'checklist'->>'etapa','') <> 'realizado' order by ch.criado_em desc limit 1;
      if found then
        k := coalesce(c.ck, '{}'); dur := (r.d->0->>'dur')::int;
        update public.chamados set status = 'tratativa', tratativa = jsonb_set(coalesce(tratativa,'{}'), '{checklist}', ((k
            || jsonb_build_object('etapa','agendado','agendadoPara',(r.d->0->>'t')||':00','projetista',coalesce(r.d->0->>'p', k->>'projetista'),'duracaoMin',dur,'confirmacao','',
                 'retornarEm',null,'reabertoPeloExact',now(),'ajustadoPeloExact',now(),
                 'diasExtras',(select jsonb_agg(jsonb_build_object('data',(x->>'t')||':00','projetista',coalesce(x->>'p', k->>'projetista'),'duracaoMin',(x->>'dur')::int) order by x->>'t') from jsonb_array_elements(r.d) with ordinality o(x,i) where i > 1)))
            - 'canceladoPeloExact' - 'foraExact' - 'liberadoPeloExact')) where id = c.id;
        select string_agg(to_char((x->>'t')::timestamp,'DD/MM HH24:MI') || coalesce(' ' || (x->>'p'),''), ' + ' order by x->>'t') into dep from jsonb_array_elements(r.d) x;
        insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (c.id, bruno, 'Exact (sincronização)', '♻️ Reaberto: está AGENDADO no Exact — ' || dep);
        n_reab := n_reab + 1;
      else
        select x into k from jsonb_array_elements(coalesce(p->'cards','[]')) x where x->>'saleId' = r.sale_id limit 1;
        if k is null then continue; end if;
        insert into public.chamados (tipo, setor_destino, status, sla_resposta, solicitante_id, solicitante_nome, solicitante_setor, cliente, cliente_doc, telefone, email, pedido, produto, motivo, tratativa)
        values ('checklist','checklist','tratativa', now() + interval '2 days', bruno, 'Exact', 'Integração Exact',
          initcap(lower(btrim(coalesce(k->>'nome', k->>'client')))), '', regexp_replace(coalesce(k->>'tel',''),'\D','','g'), '', r.sale_id, 'Projetados', 'Venda encaminhada para o checklist',
          jsonb_build_object('checklist', jsonb_build_object('etapa','agendado','agendadoPara',(r.d->0->>'t')||':00','projetista',r.d->0->>'p','duracaoMin',(r.d->0->>'dur')::int,'contatos',0,
            'diasExtras',(select jsonb_agg(jsonb_build_object('data',(x->>'t')||':00','projetista',x->>'p','duracaoMin',(x->>'dur')::int) order by x->>'t') from jsonb_array_elements(r.d) with ordinality o(x,i) where i > 1),
            'telefone2', regexp_replace(coalesce(k->>'tel2',''),'\D','','g'), 'local', public._ck_local(r.sale_id), 'ajustadoPeloExact', now(),
            'planilha', jsonb_build_object('vendedor', coalesce(k->>'seller',''), 'valor', coalesce(k->>'total',''), 'situacao', coalesce(k->>'col',''), 'importadoEm', now(), 'exact', true))))
        returning id into nid;
        insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (nid, bruno, 'Exact (sincronização)', '📥 Veio do Exact já agendado (venda ' || r.sale_id || ')');
        n_novo := n_novo + 1;
      end if;
    end if;
  end loop;

  -- etapa do quadro do Exact
  for r in select t.*, ch.id cid, ch.status::text st, ch.tratativa->'checklist' ck from public.exact_ticket t
             join public.chamados ch on ch.tipo = 'checklist' and ch.pedido = t.sale_id and ch.status <> 'concluida'
            where t.atualizado > now() - interval '10 minutes' loop
    k := coalesce(r.ck, '{}');
    if k ? 'exactPend' then continue; end if;
    if r.status = 'CHECKLIST_CANCELLED' then
      update public.chamados set status = 'concluida', tratativa = jsonb_set(tratativa, '{checklist}', (k || jsonb_build_object('etapa','desistiu','canceladoNoExact',now(),'agendaAnterior',k->>'agendadoPara'))) where id = r.cid;
      insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (r.cid, bruno, 'Exact (sincronização)', '🚫 Cancelado no Exact (coluna CANCELADOS)');
      n_canc := n_canc + 1;
    elsif r.status = 'CHECKLIST_FINISHED' then
      update public.chamados set status = 'concluida', tratativa = jsonb_set(tratativa, '{checklist}', (k || jsonb_build_object('etapa','realizado','realizadoEm',coalesce(k->>'realizadoEm', now()::text),'concluidoNoExact',now()))) where id = r.cid;
      insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (r.cid, bruno, 'Exact (sincronização)', '✅ Checklist concluído no Exact');
      n_fin := n_fin + 1;
    elsif r.status = 'CHECKLIST_NO_SHOW' and coalesce(k->>'etapa','') <> 'em_obras'
          and not exists (select 1 from public.exact_evento e where e.sale_id = r.sale_id and e.inicio >= hj) then
      update public.chamados set status = 'tratativa', tratativa = jsonb_set(tratativa, '{checklist}', (k || jsonb_build_object('etapa','em_obras','agendaAnterior',k->>'agendadoPara','agendadoPara',null,'diasExtras',null))) where id = r.cid;
      insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (r.cid, bruno, 'Exact (sincronização)', '🏗️ No Exact o cliente está em CLIENTE EM OBRAS');
      n_obra := n_obra + 1;
    elsif r.status = 'CHECKLIST_WAITING_SCHEDULE' and k->>'etapa' = 'agendado' and public._ck_ultima_data(k) >= hj
          and not exists (select 1 from public.exact_evento e where e.sale_id = r.sale_id and e.inicio >= hj) then
      update public.chamados set status = 'aberta', tratativa = jsonb_set(tratativa, '{checklist}', ((k || jsonb_build_object('etapa','a_contatar','agendaAnterior',k->>'agendadoPara','agendadoPara',null,'diasExtras',null,
          'confirmacao','','liberadoPeloExact',now())) - 'proposta')) where id = r.cid;
      insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (r.cid, bruno, 'Exact (sincronização)',
        '↩️ Voltou para A AGENDAR: no Exact o cliente está em "(SEC) Agendamento" sem data (estava ' || coalesce(to_char(nullif(k->>'agendadoPara','')::timestamp,'DD/MM HH24:MI'),'') || ')');
      n_volta := n_volta + 1;
    end if;
  end loop;

  -- novos a agendar (coluna "(SEC) Agendamento") que ainda não estão no 360
  for k in select x from jsonb_array_elements(coalesce(p->'cards','[]')) x
            where x->>'col' = 'CHECKLIST_WAITING_SCHEDULE' and coalesce(x->>'saleId','') ~ '^\d+$'
              and not exists (select 1 from public.chamados ch where ch.tipo = 'checklist' and ch.pedido = x->>'saleId') loop
    insert into public.chamados (tipo, setor_destino, status, sla_resposta, solicitante_id, solicitante_nome, solicitante_setor, cliente, cliente_doc, telefone, email, pedido, produto, motivo, tratativa)
    values ('checklist','checklist','aberta', now() + interval '2 days', bruno, 'Exact', 'Integração Exact',
      initcap(lower(btrim(coalesce(k->>'nome', k->>'client')))), '', regexp_replace(coalesce(k->>'tel',''),'\D','','g'), '', k->>'saleId', 'Projetados', 'Venda encaminhada para o checklist',
      jsonb_build_object('checklist', jsonb_build_object('etapa','a_contatar','contatos',0,'telefone2', regexp_replace(coalesce(k->>'tel2',''),'\D','','g'),
        'local', public._ck_local(k->>'saleId'), 'planilha', jsonb_build_object('vendedor', coalesce(k->>'seller',''), 'valor', coalesce(k->>'total',''), 'situacao', 'CHECKLIST_WAITING_SCHEDULE', 'importadoEm', now(), 'exact', true))))
    returning id into nid;
    insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (nid, bruno, 'Exact (sincronização)', '📥 Veio do Exact para agendar (venda ' || (k->>'saleId') || ')');
    n_novo := n_novo + 1;
  end loop;

  update public.exact_config set ultimo_sync = now(), ultimo_resultado = jsonb_build_object('agendas_ajustadas', n_ag, 'reabertos', n_reab, 'novos', n_novo, 'voltaram_a_agendar', n_volta,
    'cancelados', n_canc, 'concluidos', n_fin, 'em_obras', n_obra, 'travas', n_bloq, 'travas_removidas', n_bloq_del, 'completo', completo) where id = 1;
  insert into public.exact_log (tipo, ok, detalhe) values ('sync', true, (select ultimo_resultado::text from public.exact_config where id = 1));
  return (select ultimo_resultado from public.exact_config where id = 1);
end $$;
revoke all on function public.exact_aplicar(jsonb) from public, anon, authenticated;
revoke all on function public.exact_vendas_novas(jsonb) from public, anon, authenticated;
grant execute on function public.exact_aplicar(jsonb), public.exact_vendas_novas(jsonb) to service_role;

-- ========== 360 → Exact ==========
-- o que o Exact deve ter para este checklist (dias de hoje em diante) e o que ele tem hoje
create or replace function public.exact_push_plano(p_id text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare c record; k jsonb; t record; hj date := (now() at time zone 'America/Sao_Paulo')::date; sec int; des jsonb; exi jsonb;
begin
  select * into c from public.chamados where id = p_id and tipo = 'checklist';
  if not found then return jsonb_build_object('pular', true, 'motivo', 'checklist não encontrado'); end if;
  k := coalesce(c.tratativa->'checklist', '{}');
  select * into t from public.exact_ticket where sale_id = c.pedido;
  if not found or t.ticket_id is null then
    update public.chamados set tratativa = tratativa #- '{checklist,exactPend}' where id = p_id;
    return jsonb_build_object('pular', true, 'motivo', 'venda ' || coalesce(c.pedido,'?') || ' não está no quadro do Exact');
  end if;
  select id into sec from public.exact_agenda where lower(titulo) = 'secretaria' limit 1;
  if c.status <> 'concluida' and k->>'etapa' = 'agendado' then
    select coalesce(jsonb_agg(jsonb_build_object('dia', left(d.t,10), 'start', public._ex_utc(d.t::timestamp), 'end', public._ex_utc(d.t::timestamp + make_interval(mins => d.dur)),
             'agendaId', coalesce((select a.id from public.exact_agenda a where a.projetista = d.p order by a.id limit 1), sec)) order by d.t), '[]') into des
      from (select distinct on (left(t,10)) t, p, dur from (
              select left(k->>'agendadoPara',16) t, k->>'projetista' p, coalesce((k->>'duracaoMin')::int, 120) dur where nullif(k->>'agendadoPara','') is not null
              union all select left(e->>'data',16), coalesce(nullif(e->>'projetista',''), k->>'projetista'), coalesce((e->>'duracaoMin')::int, (k->>'duracaoMin')::int, 120)
                from jsonb_array_elements(case when jsonb_typeof(k->'diasExtras')='array' then k->'diasExtras' else '[]' end) e where nullif(e->>'data','') is not null) y
            where left(t,10)::date >= hj order by left(t,10), t) d;
  else des := '[]'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'dia', to_char(e.inicio,'YYYY-MM-DD'), 'start', public._ex_utc(e.inicio), 'end', public._ex_utc(e.fim), 'agendaId', e.agenda_id, 'notes', e.obs) order by e.inicio), '[]')
    into exi from public.exact_evento e where e.sale_id = c.pedido and e.inicio >= hj and e.ticket_id is not null;
  return jsonb_build_object('ticketId', t.ticket_id, 'saleId', c.pedido,
    'descricao', 'Venda - ' || c.pedido || ' - ' || public._ex_fone(c.telefone) || ' - ' || upper(c.cliente), 'desejados', des, 'existentes', exi);
end $$;

create or replace function public.exact_push_ok(p_id text, p jsonb) returns void language plpgsql security definer set search_path to '' as $$
declare f jsonb; c record; txt text := ''; err boolean := jsonb_array_length(coalesce(p->'erros','[]')) > 0;
begin
  perform set_config('alianca.sistema', '1', true);
  perform set_config('alianca.exact', '1', true);
  select id, pedido into c from public.chamados where id = p_id;
  for f in select * from jsonb_array_elements(coalesce(p->'feitos','[]')) loop
    if f->>'op' = 'excluir' then delete from public.exact_evento where id = (f->>'id')::bigint;
    elsif f->>'id' is not null then
      insert into public.exact_evento (id, agenda_id, ticket_id, sale_id, inicio, fim, descricao, obs, visto_em)
      values ((f->>'id')::bigint, (f->>'agendaId')::int, (f->>'ticketId')::int, c.pedido, public._ex_local(f->>'start'), public._ex_local(f->>'end'), f->>'description', f->>'notes', now())
      on conflict (id) do update set agenda_id = excluded.agenda_id, inicio = excluded.inicio, fim = excluded.fim, descricao = excluded.descricao, visto_em = now();
    end if;
    txt := txt || case f->>'op' when 'criar' then ' · criado ' when 'alterar' then ' · alterado ' else ' · excluído ' end
                || coalesce(to_char(public._ex_local(f->>'start'), 'DD/MM HH24:MI'), '');
  end loop;
  update public.chamados set tratativa = case when err then jsonb_set(tratativa, '{checklist,exactErro}', to_jsonb(left(p->'erros'->>0, 300)))
                                              else (tratativa #- '{checklist,exactPend}') #- '{checklist,exactErro}' end where id = p_id;
  if txt <> '' or err then
    insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (p_id, '00000000-0000-4000-a000-000000000007', 'Exact (integração)',
      case when err then '⚠️ Não foi para o Exact: ' || left(p->'erros'->>0, 300) else '📤 Enviado para o Exact' || txt end);
  end if;
  insert into public.exact_log (tipo, chamado_id, ok, detalhe) values ('push', p_id, not err, p::text);
end $$;
revoke all on function public.exact_push_plano(text), public.exact_push_ok(text, jsonb) from public, anon, authenticated;
grant execute on function public.exact_push_plano(text), public.exact_push_ok(text, jsonb) to service_role;

-- gatilho: mudou a agenda de um checklist no 360 → manda para o Exact na hora
create or replace function public._trg_exact_push() returns trigger language plpgsql security definer set search_path to '' as $$
declare cfg record; o jsonb; n jsonb;
begin
  if new.tipo <> 'checklist' then return new; end if;
  if coalesce(current_setting('alianca.exact', true), '') = '1' or coalesce(current_setting('alianca.sistema', true), '') = '1' then return new; end if;
  select * into cfg from public.exact_config where id = 1;
  if not found or not cfg.escrever_ativo then return new; end if;
  n := coalesce(new.tratativa->'checklist', '{}');
  if tg_op = 'UPDATE' then
    o := coalesce(old.tratativa->'checklist', '{}');
    if old.status is not distinct from new.status and o->'agendadoPara' is not distinct from n->'agendadoPara' and o->'diasExtras' is not distinct from n->'diasExtras'
       and o->'projetista' is not distinct from n->'projetista' and o->'etapa' is not distinct from n->'etapa' and o->'duracaoMin' is not distinct from n->'duracaoMin' then return new; end if;
    -- nada agendado antes nem agora: não há o que mandar
    if coalesce(o->>'etapa','') <> 'agendado' and coalesce(n->>'etapa','') <> 'agendado' then return new; end if;
  elsif coalesce(n->>'etapa','') <> 'agendado' then return new; end if;
  if not exists (select 1 from public.exact_ticket t where t.sale_id = new.pedido) then return new; end if;
  new.tratativa := jsonb_set(coalesce(new.tratativa,'{}'), '{checklist,exactPend}', to_jsonb(now()));
  perform net.http_post(url := cfg.url_funcao, body := jsonb_build_object('acao', 'push', 'id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-exact-segredo', cfg.segredo), timeout_milliseconds := 60000);
  return new;
end $$;
drop trigger if exists exact_push on public.chamados;
create trigger exact_push before insert or update on public.chamados for each row execute function public._trg_exact_push();

-- leitura automática a cada 5 min (o calendário inteiro, com as travas, a cada 15 min)
create or replace function public.exact_disparar_sync(p_eventos boolean default null) returns void language plpgsql security definer set search_path to '' as $$
declare cfg record;
begin
  select * into cfg from public.exact_config where id = 1;
  if not found or (p_eventos is null and not cfg.ler_ativo) then return; end if;
  perform net.http_post(url := cfg.url_funcao, body := jsonb_build_object('acao', 'sync', 'eventos', coalesce(p_eventos, extract(minute from now())::int % 15 < 5)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-exact-segredo', cfg.segredo), timeout_milliseconds := 120000);
end $$;
revoke all on function public.exact_disparar_sync(boolean) from public, anon, authenticated;
select cron.unschedule('exact-sync') where exists (select 1 from cron.job where jobname = 'exact-sync');
select cron.schedule('exact-sync', '*/5 * * * *', 'select public.exact_disparar_sync()');

-- as travas que eu tinha copiado à mão dos prints saem: agora vêm direto do Exact
delete from public.checklist_bloqueios where criado_por = 'Bruno (agenda do Exact)';

-- status para a tela (Gestão / checklist)
create or replace function public.exact_status() returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('ler', ler_ativo, 'escrever', escrever_ativo, 'ultimo_sync', ultimo_sync, 'resultado', ultimo_resultado,
    'pendentes', (select count(*) from public.chamados where tipo = 'checklist' and tratativa->'checklist' ? 'exactPend'),
    'erros', (select count(*) from public.chamados where tipo = 'checklist' and tratativa->'checklist' ? 'exactErro'))
  from public.exact_config where id = 1 and (public.eh_gestao() or public.pode_checklist()) $$;
grant execute on function public.exact_status() to authenticated;

select 'ok — integração com o Exact instalada (ainda desligada)' as resultado;
