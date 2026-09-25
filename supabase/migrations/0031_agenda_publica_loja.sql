-- Agenda da loja em tela aberta (sem login), para os computadores da loja.
-- Acesso só com o link secreto (token). Entrega o mínimo: horário, nome do cliente, vendedor, consultor, origem e situação.
-- Nada de telefone, endereço, valores, observações ou anexos. A Gestão gera, troca ou desliga o link.
create table if not exists public.agenda_publica (
  id int primary key default 1 check (id = 1),
  token text,
  ativo boolean not null default false,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios(id)
);
insert into public.agenda_publica (id) values (1) on conflict do nothing;
alter table public.agenda_publica enable row level security;
revoke all on public.agenda_publica from anon, authenticated;  -- ninguém lê a tabela direto

-- Gestão: ver o link atual
create or replace function public.link_agenda_publica() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.agenda_publica;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão gerencia o link da agenda da loja'; end if;
  select * into a from public.agenda_publica where id = 1;
  return jsonb_build_object('token', case when a.ativo then a.token else null end, 'ativo', a.ativo, 'atualizadoEm', a.atualizado_em);
end $$;

-- Gestão: gerar novo link (o anterior para de funcionar) ou desligar
create or replace function public.gerar_link_agenda_publica(p_ativar boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão gerencia o link da agenda da loja'; end if;
  if p_ativar then
    t := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update public.agenda_publica set token = t, ativo = true, atualizado_em = now(), atualizado_por = auth.uid() where id = 1;
  else
    update public.agenda_publica set token = null, ativo = false, atualizado_em = now(), atualizado_por = auth.uid() where id = 1;
  end if;
  return t;
end $$;

-- Tela aberta: agenda de um dia (hoje até +7 dias, ou ontem)
create or replace function public.agenda_publica_dia(p_token text, p_dia date)
returns table(hora text, cliente text, vendedor text, consultor text, origem text, situacao text, quer_projeto boolean, pedido_vendedor text)
language plpgsql stable security definer set search_path = '' as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_token is null or length(p_token) < 40 or not exists (select 1 from public.agenda_publica a where a.id = 1 and a.ativo and a.token = p_token) then
    raise exception 'Link inválido ou desligado';
  end if;
  if p_dia is null or p_dia < hoje - 1 or p_dia > hoje + 7 then raise exception 'Dia fora do período da agenda'; end if;
  return query
    select to_char(c.data_loja, 'HH24:MI'), c.cliente,
           coalesce((select u.nome from public.usuarios u where u.id = c.atendente_id), ''),
           coalesce((select u.nome from public.usuarios u where u.id = c.consultor_id), ''),
           case when t.direto then 'marketing' else 'externo' end,
           public.status_cliente_de(c)::text,
           coalesce(c.tratativa->>'querProjeto', '') = 'sim',
           case when c.atendente_id is null then coalesce((select u.nome from public.usuarios u where u.id::text = c.tratativa->>'pedidoAtend'), '') else '' end
    from public.chamados c join public.tipos t on t.id = c.tipo
    where t.presale and c.data_loja is not null and c.data_loja::date = p_dia
    order by c.data_loja;
end $$;

revoke execute on function public.link_agenda_publica(), public.gerar_link_agenda_publica(boolean), public.agenda_publica_dia(text, date) from public;
grant execute on function public.link_agenda_publica(), public.gerar_link_agenda_publica(boolean) to authenticated;
grant execute on function public.agenda_publica_dia(text, date) to anon, authenticated;
