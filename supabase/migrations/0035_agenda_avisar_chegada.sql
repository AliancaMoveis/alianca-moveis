-- Tela aberta da loja: botão "Cliente chegou" avisa o vendedor no celular.
-- Sem vendedor definido, avisa a coordenação (Suporte, Supervisão Mkt, Gerente de loja).
-- Pode repetir o aviso a cada 3 minutos. Fica registrado no histórico do cliente.
create table if not exists public.agenda_chegadas (
  chamado_id text primary key references public.chamados(id) on delete cascade,
  avisado_em timestamptz not null default now(),
  vezes int not null default 1
);
alter table public.agenda_chegadas enable row level security;
revoke all on public.agenda_chegadas from anon, authenticated;

drop function if exists public.agenda_publica_dia(text, date);
create or replace function public.agenda_publica_dia(p_token text, p_dia date)
returns table(id text, hora text, cliente text, vendedor text, consultor text, origem text, situacao text, quer_projeto boolean, pedido_vendedor text, avisado_em timestamptz, avisos int)
language plpgsql stable security definer set search_path = '' as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_token is null or length(p_token) < 40 or not exists (select 1 from public.agenda_publica a where a.id = 1 and a.ativo and a.token = p_token) then
    raise exception 'Link inválido ou desligado';
  end if;
  if p_dia is null or p_dia < hoje - 1 or p_dia > hoje + 7 then raise exception 'Dia fora do período da agenda'; end if;
  return query
    select c.id, to_char(c.data_loja, 'HH24:MI'), c.cliente,
           coalesce((select u.nome from public.usuarios u where u.id = c.atendente_id), ''),
           coalesce((select u.nome from public.usuarios u where u.id = c.consultor_id), ''),
           case when t.direto then 'marketing' else 'externo' end,
           public.status_cliente_de(c)::text,
           coalesce(c.tratativa->>'querProjeto', '') = 'sim',
           case when c.atendente_id is null then coalesce((select u.nome from public.usuarios u where u.id::text = c.tratativa->>'pedidoAtend'), '') else '' end,
           ch.avisado_em, coalesce(ch.vezes, 0)
    from public.chamados c join public.tipos t on t.id = c.tipo
    left join public.agenda_chegadas ch on ch.chamado_id = c.id
    where t.presale and c.data_loja is not null and c.data_loja::date = p_dia
    order by c.data_loja;
end $$;

create or replace function public.agenda_publica_avisar(p_token text, p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.chamados; ch public.agenda_chegadas; hoje date := (now() at time zone 'America/Sao_Paulo')::date; quem uuid[]; msg text;
begin
  if p_token is null or length(p_token) < 40 or not exists (select 1 from public.agenda_publica a where a.id = 1 and a.ativo and a.token = p_token) then
    raise exception 'Link inválido ou desligado';
  end if;
  select * into c from public.chamados where id = p_id;
  if not found or not public.tipo_presale(c.tipo) or c.data_loja is null or c.data_loja::date <> hoje then raise exception 'Cliente não está na agenda de hoje'; end if;
  select * into ch from public.agenda_chegadas where chamado_id = p_id for update;
  if found and ch.avisado_em > now() - interval '3 minutes' then
    raise exception 'Aviso já enviado — aguarde % s para avisar de novo', ceil(extract(epoch from (ch.avisado_em + interval '3 minutes' - now())))::int;
  end if;
  if c.atendente_id is not null then
    quem := array[c.atendente_id];
    insert into public.notificacoes (usuario_id, titulo, corpo, chamado_id, chave)
    values (c.atendente_id, '🔔 Seu cliente chegou!', c.cliente || ' chegou e está te aguardando na loja.', c.id, 'chegou:' || c.id || ':' || extract(epoch from now())::bigint);
    msg := 'Cliente chegou — vendedor ' || public._nome(c.atendente_id) || ' avisado pela tela da loja';
  else
    quem := public._usuarios_setor(array['suporte_consultores','marketing_supervisao','gerente_loja']);
    insert into public.notificacoes (usuario_id, titulo, corpo, chamado_id, chave)
    select u, '🔔 Cliente chegou sem vendedor', c.cliente || ' chegou na loja e ainda não tem vendedor — definir agora.', c.id, 'chegou:' || c.id || ':' || extract(epoch from now())::bigint || ':' || u
    from unnest(quem) u;
    msg := 'Cliente chegou (sem vendedor) — coordenação avisada pela tela da loja';
  end if;
  insert into public.agenda_chegadas (chamado_id, avisado_em, vezes) values (p_id, now(), 1)
  on conflict (chamado_id) do update set avisado_em = now(), vezes = public.agenda_chegadas.vezes + 1;
  insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (p_id, now(), null, 'Tela da loja', msg);
  return jsonb_build_object('avisados', coalesce(array_length(quem, 1), 0), 'vendedor', c.atendente_id is not null);
end $$;

revoke execute on function public.agenda_publica_dia(text, date), public.agenda_publica_avisar(text, text) from public;
grant execute on function public.agenda_publica_dia(text, date), public.agenda_publica_avisar(text, text) to anon, authenticated;
