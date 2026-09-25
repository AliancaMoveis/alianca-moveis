-- Avisos no celular — pacote aprovado pela Gestão em 25/09/2026.
-- Rotina (pg_cron a cada 5 min, horário de Brasília). Cada aviso tem chave única por dia/horário → nunca repete.
--  CONSULTOR : sem anexo 3x/dia (8h–18h, horários alternados por dia) até resolver · visita 1h antes (com endereço)
--              · visita sem registro 1h depois do horário · resumo do dia às 17h · cliente dele chegou na loja
--              · visita marcada para o MESMO dia = aviso urgente
--  RESPONSÁVEL (consultor/vendedor): cliente sem atualização +24h → 1x/dia às 9h
--  VENDEDOR  : agenda do dia às 9h · clientes sem parecer às 19h · cliente reagendou/cancelou
--  OPERADORA : meta do dia definida · faltam X para a meta às 15h
--  SUP. MKT  : operadora sem agendamento até 11h · meta do time batida · resumo 18h · pagamentos do mês pendentes (dias 1–10, 10h)
--  SUP. CC   : chamado urgente · prazo estourado/escalonado · chamados parados há 3+ dias (9h)
--  GESTÃO    : agenda da loja 8h · fechamento 19h · resumo 21h · venda acima de R$ 30 mil · vendas a confirmar há +24h (10h)
--  GERENTE   : agenda da loja 8h · fechamento 19h · cliente com vendedor e sem atendimento 10 min depois do "Cliente chegou"

create or replace function public._hm(p_ts timestamp, p_ini text, p_min int default 30) returns boolean
language sql immutable set search_path = '' as $$
  select p_ts >= (p_ts::date + p_ini::time) and p_ts < (p_ts::date + p_ini::time + make_interval(mins => p_min));
$$;

create or replace function public._final_cliente(c public.chamados) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.status_cliente_de(c)::text in ('vendido','vendido_promissoria','vendido_revisao','venda_cancelada','nao_compareceu','reprovado');
$$;

create or replace function public.avisos_rotina_em(p_agora timestamp) returns void
language plpgsql security definer set search_path = '' as $$
declare
  agora timestamp := p_agora;
  hoje date := p_agora::date;
  dow int := extract(isodow from p_agora)::int;
  slots text[]; s text; i int;
  r record; m public.mkt_metas; txt text; n int; n2 int; n3 int; v numeric;
  gest uuid[] := public._usuarios_setor(array['gestao']);
  ger uuid[] := public._usuarios_setor(array['gerente_loja']);
  supm uuid[] := public._usuarios_setor(array['marketing_supervisao']);
  supc uuid[] := public._usuarios_setor(array['supervisao']);
begin
  -- ============ CONSULTOR: clientes sem anexo — 3x/dia, horários alternados, só entre 8h e 18h ============
  slots := case when extract(day from hoje)::int % 2 = 0 then array['08:30','12:30','16:30'] else array['10:00','14:00','17:30'] end;
  for i in 1..3 loop
    s := slots[i];
    if public._hm(agora, s) then
      for r in
        select c.consultor_id uid, count(*) n, string_agg(c.cliente, ', ' order by c.data_loja nulls last) nomes, min(c.id) cid
        from public.chamados c join public.tipos t on t.id = c.tipo
        where t.presale and c.consultor_id is not null
          and not exists (select 1 from public.anexos a where a.chamado_id = c.id)
          and not exists (select 1 from public.vendas vv where vv.chamado_id = c.id)
          and not public._final_cliente(c)
          and (c.data_loja is not null or coalesce((c.tratativa->>'realizada')::boolean, false))
        group by c.consultor_id
      loop
        perform public._notificar(array[r.uid], '📎 ' || r.n || case when r.n = 1 then ' cliente sem anexo' else ' clientes sem anexo' end,
          'Anexe fotos/medidas/projeto: ' || left(r.nomes, 150), case when r.n = 1 then r.cid end, 'semanexo:' || hoje || ':' || i);
      end loop;
    end if;
  end loop;

  -- ============ RESPONSÁVEL: cliente sem atualização há +24h — 1x/dia às 9h ============
  if public._hm(agora, '09:00') then
    for r in
      select resp uid, count(*) n, string_agg(cliente, ', ') nomes, min(id) cid from (
        select c.id, c.cliente, case when c.setor_destino = 'consultor_externo' then c.consultor_id else c.atendente_id end resp
        from public.chamados c join public.tipos t on t.id = c.tipo
        where t.presale and not public._final_cliente(c)
          and coalesce((select max(h.quando) from public.historico h where h.chamado_id = c.id and coalesce(h.quem_nome, '') <> 'Sistema'), c.criado_em) < now() - interval '24 hours'
      ) x where resp is not null group by resp
    loop
      perform public._notificar(array[r.uid], '🕒 ' || r.n || case when r.n = 1 then ' cliente sem atualização' else ' clientes sem atualização' end || ' há +24h',
        'Registre o andamento: ' || left(r.nomes, 150), case when r.n = 1 then r.cid end, 'inativo:' || hoje);
    end loop;
  end if;

  -- ============ CONSULTOR: visita em 1h (com endereço) ============
  for r in select c.* from public.chamados c
           where c.consultor_id is not null and c.setor_destino = 'consultor_externo' and not coalesce((c.tratativa->>'realizada')::boolean, false)
             and c.data_visita between agora + interval '50 minutes' and agora + interval '70 minutes' loop
    perform public._notificar(array[r.consultor_id], '📍 Visita às ' || to_char(r.data_visita, 'HH24:MI'),
      r.cliente || coalesce(' · ' || nullif(r.endereco, ''), '') || coalesce(' · ' || nullif(r.telefone, ''), ''), r.id, 'visita1h:' || r.id || ':' || to_char(r.data_visita, 'YYYYMMDDHH24MI'));
  end loop;

  -- ============ CONSULTOR: visita sem registro 1h depois do horário (últimos 2 dias) ============
  for r in select c.* from public.chamados c
           where c.consultor_id is not null and c.setor_destino = 'consultor_externo' and not coalesce((c.tratativa->>'realizada')::boolean, false)
             and c.data_visita between agora - interval '2 days' and agora - interval '1 hour' loop
    perform public._notificar(array[r.consultor_id], '❓ Marque se a visita foi realizada',
      r.cliente || ' · visita de ' || to_char(r.data_visita, 'DD/MM HH24:MI'), r.id, 'visitasemreg:' || r.id || ':' || to_char(r.data_visita, 'YYYYMMDDHH24MI'));
  end loop;

  -- ============ CONSULTOR: resumo do dia às 17h ============
  if public._hm(agora, '17:00') then
    for r in select u uid,
                (select count(*) from public.chamados c where c.consultor_id = u and c.data_visita::date = hoje and coalesce((c.tratativa->>'realizada')::boolean, false)) feitas,
                (select count(*) from public.chamados c where c.consultor_id = u and c.data_visita::date = hoje and not coalesce((c.tratativa->>'realizada')::boolean, false)) pend,
                (select count(*) from public.chamados c where c.consultor_id = u and c.data_loja::date = hoje) loja
             from unnest(public._usuarios_setor(array['consultor_externo'])) u loop
      if r.feitas + r.pend + r.loja > 0 then
        perform public._notificar(array[r.uid], '📋 Seu dia até agora',
          r.feitas || ' visita(s) feita(s) · ' || r.pend || ' pendente(s) hoje · ' || r.loja || ' cliente(s) seu(s) na loja hoje', null, 'consdia:' || hoje);
      end if;
    end loop;
  end if;

  -- ============ VENDEDOR: agenda do dia às 9h ============
  if public._hm(agora, '09:00') then
    for r in select c.atendente_id uid, count(*) n, string_agg(to_char(c.data_loja, 'HH24:MI') || ' ' || split_part(c.cliente, ' ', 1), ' · ' order by c.data_loja) l
             from public.chamados c join public.tipos t on t.id = c.tipo
             where t.presale and c.atendente_id is not null and c.data_loja::date = hoje and not public._final_cliente(c)
             group by c.atendente_id loop
      perform public._notificar(array[r.uid], '☀️ Você tem ' || r.n || case when r.n = 1 then ' cliente hoje' else ' clientes hoje' end, left(r.l, 180), null, 'vendagenda:' || hoje);
    end loop;
  end if;

  -- ============ VENDEDOR: clientes de hoje sem parecer às 19h ============
  if public._hm(agora, '19:00') then
    for r in select c.atendente_id uid, count(*) n, string_agg(split_part(c.cliente, ' ', 1), ', ') l
             from public.chamados c join public.tipos t on t.id = c.tipo
             where t.presale and c.setor_destino = 'atendente_cliente' and c.atendente_id is not null and c.data_loja::date = hoje and c.data_loja <= agora
               and not exists (select 1 from public.vendas vv where vv.chamado_id = c.id) and not public._final_cliente(c)
               and ((c.tratativa->>'parecerEm') is null or ((c.tratativa->>'parecerEm')::timestamptz at time zone 'America/Sao_Paulo') < c.data_loja)
             group by c.atendente_id loop
      perform public._notificar(array[r.uid], '✍️ ' || r.n || case when r.n = 1 then ' cliente sem parecer hoje' else ' clientes sem parecer hoje' end, 'Registre como foi: ' || left(r.l, 160), null, 'vendsempar:' || hoje);
    end loop;
  end if;

  -- ============ MARKETING ============
  select * into m from public.mkt_metas where dia = hoje;
  if found and m.meta > 0 then
    -- meta do dia definida (a partir das 8h, uma vez por dia)
    if agora >= hoje + time '08:00' and agora < hoje + time '18:00' then
      perform public._notificar(public._usuarios_setor(array['marketing_operadora']), '🎯 Meta de hoje: ' || m.meta || ' agendamentos',
        'Bônus de ' || public._moeda(m.valor) || ' para quem bater a meta.' || coalesce(' ' || nullif(m.obs, ''), ''), null, 'metadia:' || hoje);
    end if;
    -- faltam X às 15h
    if public._hm(agora, '15:00') then
      for r in select u uid, (select count(*) from public.chamados c join public.tipos t on t.id = c.tipo where t.presale and c.solicitante_id = u and (c.criado_em at time zone 'America/Sao_Paulo')::date = hoje) n
               from unnest(public._usuarios_setor(array['marketing_operadora'])) u loop
        if r.n < m.meta then
          perform public._notificar(array[r.uid], '⏳ Faltam ' || (m.meta - r.n) || ' para a meta', 'Você tem ' || r.n || ' de ' || m.meta || ' agendamentos hoje.', null, 'metafalta:' || hoje);
        end if;
      end loop;
    end if;
    -- meta do time batida (todas as operadoras)
    select count(*), count(*) filter (where k >= m.meta) into n, n2 from (
      select (select count(*) from public.chamados c join public.tipos t on t.id = c.tipo where t.presale and c.solicitante_id = u and (c.criado_em at time zone 'America/Sao_Paulo')::date = hoje) k
      from unnest(public._usuarios_setor(array['marketing_operadora'])) u) x;
    if n > 0 and n2 = n then
      perform public._notificar(supm || gest, '🏆 Meta do time batida!', 'Todas as ' || n || ' operadoras bateram a meta de ' || m.meta || ' hoje.', null, 'metatime:' || hoje);
    end if;
  end if;

  -- operadora sem nenhum agendamento até as 11h
  if public._hm(agora, '11:00') and dow <= 6 then
    select string_agg(public._nome(u), ', ') into txt from unnest(public._usuarios_setor(array['marketing_operadora'])) u
     where not exists (select 1 from public.chamados c join public.tipos t on t.id = c.tipo where t.presale and c.solicitante_id = u and (c.criado_em at time zone 'America/Sao_Paulo')::date = hoje);
    if txt is not null then perform public._notificar(supm, '📵 Sem agendamento até 11h', txt, null, 'opzero:' || hoje); end if;
  end if;

  -- resumo do marketing às 18h
  if public._hm(agora, '18:00') then
    select string_agg(split_part(public._nome(solicitante_id), ' ', 1) || ' ' || k, ' · ' order by k desc), sum(k) into txt, n from (
      select c.solicitante_id, count(*) k from public.chamados c join public.tipos t on t.id = c.tipo
      where t.presale and (c.criado_em at time zone 'America/Sao_Paulo')::date = hoje and c.solicitante_id = any(public._usuarios_setor(array['marketing_operadora']))
      group by c.solicitante_id) x;
    select count(*) into n2 from public.chamados c join public.tipos t on t.id = c.tipo
     where t.presale and c.data_loja::date = hoje and (exists (select 1 from public.vendas vv where vv.chamado_id = c.id) or public.status_cliente_de(c)::text in ('orcamento','sem_resposta','reprovado'));
    select count(*) into n3 from public.vendas vv where (vv.registrado_em at time zone 'America/Sao_Paulo')::date = hoje and vv.status <> 'cancelada';
    perform public._notificar(supm, '📊 Resumo do marketing hoje', coalesce(n, 0) || ' agendados · ' || n2 || ' vieram na loja · ' || n3 || ' vendas' || coalesce(' — ' || txt, ''), null, 'resumomkt:' || hoje);
  end if;

  -- pagamentos do mês anterior pendentes de aprovação (dias 1 a 10, às 10h)
  if extract(day from hoje)::int <= 10 and public._hm(agora, '10:00') then
    select count(*) into n from unnest(public._usuarios_setor(array['marketing_operadora'])) u
     where exists (select 1 from public.chamados c where c.solicitante_id = u and (c.criado_em at time zone 'America/Sao_Paulo')::date >= date_trunc('month', hoje - interval '1 month')::date and (c.criado_em at time zone 'America/Sao_Paulo')::date < date_trunc('month', hoje)::date)
       and not exists (select 1 from public.mkt_pagamentos p where p.operadora_id = u and p.de = date_trunc('month', hoje - interval '1 month')::date);
    if n > 0 then
      perform public._notificar(supm || gest, '💵 Pagamentos de ' || to_char(hoje - interval '1 month', 'MM/YYYY') || ' pendentes', n || ' operadora(s) aguardando aprovação do pagamento.', null, 'pagpend:' || hoje);
    end if;
  end if;

  -- ============ SUPERVISÃO CALL CENTER: chamados parados há 3+ dias (9h) ============
  if public._hm(agora, '09:00') then
    select count(*), string_agg(id, ', ') into n, txt from (
      select c.id from public.chamados c join public.tipos t on t.id = c.tipo
      where not t.presale and c.status <> 'concluida'
        and coalesce((select max(h.quando) from public.historico h where h.chamado_id = c.id), c.criado_em) < now() - interval '3 days'
      order by c.criado_em limit 50) x;
    if n > 0 then perform public._notificar(supc, '🧊 ' || n || ' chamado(s) parado(s) há 3+ dias', left(txt, 180), null, 'parados:' || hoje); end if;
  end if;

  -- ============ GESTÃO + GERENTES: agenda da loja às 8h e fechamento às 19h ============
  if public._hm(agora, '08:00') then
    select count(*), count(*) filter (where c.atendente_id is null), count(*) filter (where t.direto) into n, n2, n3
      from public.chamados c join public.tipos t on t.id = c.tipo where t.presale and c.data_loja::date = hoje;
    if n > 0 then
      perform public._notificar(gest || ger, '🏬 Loja hoje: ' || n || ' cliente(s)', n3 || ' do marketing · ' || (n - n3) || ' de consultor externo · ' || n2 || ' sem vendedor', null, 'lojaabre:' || hoje);
    end if;
  end if;
  if public._hm(agora, '19:00') then
    select count(*) filter (where exists (select 1 from public.vendas vv where vv.chamado_id = c.id) or public.status_cliente_de(c)::text in ('orcamento','sem_resposta','reprovado')),
           count(*) filter (where public.status_cliente_de(c)::text = 'nao_compareceu'),
           count(*) filter (where c.data_loja <= agora and not public._final_cliente(c) and not exists (select 1 from public.vendas vv where vv.chamado_id = c.id)
                              and ((c.tratativa->>'parecerEm') is null or ((c.tratativa->>'parecerEm')::timestamptz at time zone 'America/Sao_Paulo') < c.data_loja))
      into n, n2, n3
      from public.chamados c join public.tipos t on t.id = c.tipo where t.presale and c.data_loja::date = hoje;
    select count(*) into i from public.vendas vv where (vv.registrado_em at time zone 'America/Sao_Paulo')::date = hoje and vv.status <> 'cancelada';
    perform public._notificar(gest || ger, '🔒 Fechamento da loja', n || ' atendido(s) · ' || n2 || ' não vieram · ' || n3 || ' sem parecer · ' || i || ' venda(s) registrada(s)', null, 'lojafecha:' || hoje);
  end if;

  -- ============ GESTÃO: resumo do dia às 21h ============
  if public._hm(agora, '21:00') then
    select count(*), count(*) filter (where exists (select 1 from public.vendas vv where vv.chamado_id = c.id) or public.status_cliente_de(c)::text in ('orcamento','sem_resposta','reprovado')),
           count(*) filter (where public.status_cliente_de(c)::text = 'nao_compareceu')
      into n, n2, n3 from public.chamados c join public.tipos t on t.id = c.tipo where t.presale and c.data_loja::date = hoje;
    select count(*), coalesce(sum(vl.valor), 0) into i, v from public.vendas vv left join public.vendas_valores vl on vl.chamado_id = vv.chamado_id
     where (vv.registrado_em at time zone 'America/Sao_Paulo')::date = hoje and vv.status <> 'cancelada';
    perform public._notificar(gest, '📈 Resumo do dia', 'Loja: ' || n || ' agendados, ' || n2 || ' vieram, ' || n3 || ' não vieram · Vendas: ' || i || ' · ' || public._moeda(v), null, 'resumogestao:' || hoje);
  end if;

  -- ============ GESTÃO: vendas aguardando confirmação há +24h (10h) ============
  if public._hm(agora, '10:00') then
    select count(*), coalesce(sum(vl.valor), 0) into n, v from public.vendas vv left join public.vendas_valores vl on vl.chamado_id = vv.chamado_id
     where vv.status = 'registrada' and vv.registrado_em < now() - interval '24 hours';
    if n > 0 then perform public._notificar(gest, '🧾 ' || n || ' venda(s) a confirmar há +24h', 'Total ' || public._moeda(v) || ' — confirme em Aprovações.', null, 'vconf24:' || hoje); end if;
  end if;

  -- ============ GERENTE: cliente chegou e está sem atendimento há 10 min ============
  for r in select c.id, c.cliente, c.atendente_id, ch.avisado_em from public.agenda_chegadas ch join public.chamados c on c.id = ch.chamado_id
           where ch.avisado_em < now() - interval '10 minutes' and ch.avisado_em > now() - interval '3 hours'
             and c.atendente_id is not null and not (c.tratativa ? 'emAtendimento') and not public._final_cliente(c)
             and not exists (select 1 from public.vendas vv where vv.chamado_id = c.id) loop
    perform public._notificar(ger, '⏱️ Cliente esperando há 10 min', r.cliente || ' chegou às ' || to_char(r.avisado_em at time zone 'America/Sao_Paulo', 'HH24:MI') || ' e ' || public._nome(r.atendente_id) || ' ainda não iniciou o atendimento.', r.id, 'espera:' || r.id || ':' || extract(epoch from r.avisado_em)::bigint);
  end loop;
end $$;

-- a rotina usa o horário de Brasília (separada para poder testar em qualquer horário)
create or replace function public.avisos_rotina() returns void
language sql security definer set search_path = '' as $$ select public.avisos_rotina_em((now() at time zone 'America/Sao_Paulo')::timestamp); $$;

-- ============ avisos disparados por mudança no cliente/chamado ============
create or replace function public._trg_avisos_extra() returns trigger
language plpgsql security definer set search_path = '' as $$
declare presale boolean := public.tipo_presale(new.tipo); hoje date := (now() at time zone 'America/Sao_Paulo')::date; k text := extract(epoch from now())::bigint::text;
begin
  if presale then
    -- vendedor: cliente reagendou / cancelou a vinda
    if tg_op = 'UPDATE' and new.atendente_id is not null and old.atendente_id = new.atendente_id and old.data_loja is not null then
      if new.data_loja is null then
        perform public._notificar(array[new.atendente_id], '❌ Cliente cancelou a vinda', new.cliente || ' não vem mais em ' || to_char(old.data_loja, 'DD/MM HH24:MI') || '.', new.id, 'cancelou:' || new.id || ':' || k);
      elsif new.data_loja is distinct from old.data_loja then
        perform public._notificar(array[new.atendente_id], '📅 Cliente reagendou', new.cliente || ': ' || to_char(old.data_loja, 'DD/MM HH24:MI') || ' → ' || to_char(new.data_loja, 'DD/MM HH24:MI'), new.id, 'reagendou:' || new.id || ':' || k);
      end if;
    end if;
    -- consultor: visita marcada para HOJE = urgente
    if new.consultor_id is not null and new.data_visita is not null and new.data_visita::date = hoje
       and (tg_op = 'INSERT' or old.consultor_id is distinct from new.consultor_id or old.data_visita is distinct from new.data_visita) then
      perform public._notificar(array[new.consultor_id], '🚨 URGENTE: visita HOJE às ' || to_char(new.data_visita, 'HH24:MI'),
        new.cliente || coalesce(' · ' || nullif(new.endereco, ''), ''), new.id, 'visitahoje:' || new.id || ':' || to_char(new.data_visita, 'YYYYMMDDHH24MI'));
    end if;
    -- consultor: o cliente dele começou a ser atendido na loja
    if new.consultor_id is not null and (new.tratativa ? 'emAtendimento') and (tg_op = 'INSERT' or not (old.tratativa ? 'emAtendimento')) then
      perform public._notificar(array[new.consultor_id], '🏬 Seu cliente chegou na loja', new.cliente || ' está sendo atendido por ' || public._nome(new.atendente_id) || '.', new.id, 'conschegou:' || new.id);
    end if;
  else
    -- supervisão call center: chamado urgente / prazo estourado
    if new.urgente and (tg_op = 'INSERT' or not old.urgente) then
      perform public._notificar(public._usuarios_setor(array['supervisao']), '⚠️ Chamado urgente', new.id || ' · ' || new.cliente || ' · ' || public._setor_nome(new.setor_destino), new.id, 'urgente:' || new.id || ':' || k);
    end if;
    if (new.escalonado_auto and (tg_op = 'INSERT' or not old.escalonado_auto)) or (new.escalado_critico and (tg_op = 'INSERT' or not old.escalado_critico)) then
      perform public._notificar(public._usuarios_setor(array['supervisao']), case when new.escalado_critico then '🔴 Chamado crítico (+24h)' else '⏰ Prazo de resposta estourado' end,
        new.id || ' · ' || new.cliente || ' · ' || public._setor_nome(new.setor_destino), new.id, 'sla:' || new.id || ':' || case when new.escalado_critico then 'c' else 'a' end);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists chamados_avisos_extra on public.chamados;
create trigger chamados_avisos_extra after insert or update on public.chamados for each row execute function public._trg_avisos_extra();

-- consultor: "Cliente chegou" apertado na tela da loja
create or replace function public._trg_chegada_consultor() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.chamados;
begin
  select * into c from public.chamados where id = new.chamado_id;
  if found and c.consultor_id is not null then
    perform public._notificar(array[c.consultor_id], '🏬 Seu cliente chegou na loja', c.cliente || ' acabou de chegar' || coalesce(' · vendedor ' || public._nome(c.atendente_id), '') || '.', c.id, 'conschegou:' || c.id);
  end if;
  return null;
end $$;
drop trigger if exists agenda_chegadas_consultor on public.agenda_chegadas;
create trigger agenda_chegadas_consultor after insert on public.agenda_chegadas for each row execute function public._trg_chegada_consultor();

-- gestão: venda acima de R$ 30 mil
create or replace function public._trg_venda_alta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.chamados; vv public.vendas;
begin
  if new.valor >= 30000 and (tg_op = 'INSERT' or old.valor < 30000) then
    select * into c from public.chamados where id = new.chamado_id;
    select * into vv from public.vendas where chamado_id = new.chamado_id;
    perform public._notificar(public._usuarios_setor(array['gestao']), '💎 Venda alta: ' || public._moeda(new.valor),
      c.cliente || coalesce(' · ' || public._nome(c.atendente_id), '') || coalesce(' · ger. ' || vv.gerente_nome, ''), c.id, 'vendaalta:' || c.id);
  end if;
  return null;
end $$;
drop trigger if exists vendas_valores_alta on public.vendas_valores;
create trigger vendas_valores_alta after insert or update on public.vendas_valores for each row execute function public._trg_venda_alta();

revoke execute on function public.avisos_rotina(), public.avisos_rotina_em(timestamp), public._trg_avisos_extra(), public._trg_chegada_consultor(), public._trg_venda_alta(), public._final_cliente(public.chamados), public._hm(timestamp, text, int) from public, anon, authenticated;

select cron.schedule('avisos-rotina', '*/5 * * * *', 'select public.avisos_rotina()');
