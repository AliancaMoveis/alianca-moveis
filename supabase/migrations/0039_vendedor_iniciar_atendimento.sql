-- App do vendedor: botão "▶️ Iniciar atendimento" no cliente dele.
-- Marca tratativa.emAtendimento (hora) e registra no histórico.
-- Tela da loja: cliente em atendimento mostra "🟢 Em atendimento · desde HH:MM" no lugar do botão "Cliente chegou".
create or replace function public.iniciar_atendimento(p_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados; eu uuid := auth.uid();
begin
  if not public.usuario_ativo() then raise exception 'Usuário sem acesso ao sistema'; end if;
  select * into c from public.chamados where id = p_id for update;
  if not found or not public.tipo_presale(c.tipo) then raise exception 'Cliente não encontrado'; end if;
  if c.atendente_id is distinct from eu and not public.eh_gestao() then raise exception 'Só o vendedor deste cliente pode iniciar o atendimento'; end if;
  if c.tratativa ? 'emAtendimento' then raise exception 'O atendimento já foi iniciado'; end if;
  if public.status_cliente_de(c)::text in ('vendido','vendido_promissoria','vendido_revisao','venda_cancelada','reprovado','nao_compareceu') then
    raise exception 'Este atendimento já foi encerrado';
  end if;
  update public.chamados set tratativa = coalesce(c.tratativa, '{}'::jsonb) || jsonb_build_object('emAtendimento', now(), 'emAtendimentoPor', public._nome(eu))
  where id = p_id;
  perform public._reg(p_id, '▶️ Atendimento iniciado na loja por ' || public._nome(eu));
end $$;
revoke execute on function public.iniciar_atendimento(text) from public, anon;
grant execute on function public.iniciar_atendimento(text) to authenticated;

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
           public.status_cliente_de(c)::text,
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
