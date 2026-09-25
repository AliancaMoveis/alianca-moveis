-- Tela aberta da loja: situação resumida sem revelar venda (vendido/orçamento/etc. = 'finalizado').
-- Situações: sem_vendedor, com_vendedor, em_atendimento, finalizado, reagendado, nao_compareceu.
drop function if exists public.agenda_publica_dia(text, date);
create or replace function public.agenda_publica_dia(p_token text, p_dia date)
returns table(id text, hora text, cliente text, vendedor text, consultor text, origem text, situacao text, quer_projeto boolean, pedido_vendedor text,
  avisado_em timestamptz, avisos int, assumido boolean, externo boolean, em_atendimento timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_token is null or length(p_token) < 40 or not exists (select 1 from public.agenda_publica a where a.id = 1 and a.ativo and a.token = p_token) then
    raise exception 'Link inválido ou desligado';
  end if;
  if p_dia is null or p_dia < hoje - 1 or p_dia > hoje + 7 then raise exception 'Dia fora do período da agenda'; end if;
  return query
    select c.id, to_char(c.data_loja, 'HH24:MI'), c.cliente,
           coalesce((select u.nome from public.usuarios u where u.id = c.atendente_id), nullif(c.tratativa->>'atendenteExterno', ''), ''),
           coalesce((select u.nome from public.usuarios u where u.id = c.consultor_id), ''),
           case when t.direto then 'marketing' else 'externo' end,
           -- a tela aberta NUNCA mostra venda: todo desfecho vira 'finalizado'
           case when public.status_cliente_de(c)::text in ('vendido','vendido_promissoria','vendido_revisao','venda_cancelada','reprovado','orcamento','sem_resposta') then 'finalizado'
                when public.status_cliente_de(c)::text = 'nao_compareceu' then 'nao_compareceu'
                when public.status_cliente_de(c)::text = 'reagendado' then 'reagendado'
                when c.tratativa ? 'emAtendimento' then 'em_atendimento'
                when c.atendente_id is not null or nullif(c.tratativa->>'atendenteExterno', '') is not null then 'com_vendedor'
                else 'sem_vendedor' end,
           coalesce(c.tratativa->>'querProjeto', '') = 'sim',
           case when c.atendente_id is null then coalesce((select u.nome from public.usuarios u where u.id::text = c.tratativa->>'pedidoAtend'), '') else '' end,
           ch.avisado_em, coalesce(ch.vezes, 0),
           coalesce((c.tratativa->>'assumidoFila')::boolean, false),
           c.atendente_id is null and nullif(c.tratativa->>'atendenteExterno', '') is not null,
           (c.tratativa->>'emAtendimento')::timestamptz
    from public.chamados c join public.tipos t on t.id = c.tipo
    left join public.agenda_chegadas ch on ch.chamado_id = c.id
    where t.presale and c.data_loja is not null and c.data_loja::date = p_dia
    order by c.data_loja;
end $$;
revoke execute on function public.agenda_publica_dia(text, date) from public;
grant execute on function public.agenda_publica_dia(text, date) to anon, authenticated;
