-- Tela da loja: "Assumir atendimento" (substitui "Iniciar atendimento").
--  · vendedor cadastrado: o cliente fica direto no nome dele, marcado como "assumido da fila" (responsabilidade igual à de um direcionado)
--  · "Outro" (freelancer de fim de semana, sem cadastro): guarda o nome digitado, marca como freelancer; a coordenação é avisada
drop function if exists public.agenda_publica_iniciar(text, text, uuid);

create or replace function public.agenda_publica_assumir(p_token text, p_id text, p_vendedor uuid, p_nome_outro text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.chamados; hoje date := (now() at time zone 'America/Sao_Paulo')::date; nome text; outro text := btrim(coalesce(p_nome_outro, ''));
begin
  if p_token is null or length(p_token) < 40 or not exists (select 1 from public.agenda_publica a where a.id = 1 and a.ativo and a.token = p_token) then
    raise exception 'Link inválido ou desligado';
  end if;
  select * into c from public.chamados where id = p_id for update;
  if not found or not public.tipo_presale(c.tipo) or c.data_loja is null or c.data_loja::date <> hoje then raise exception 'Cliente não está na agenda de hoje'; end if;
  if c.atendente_id is not null or c.setor_destino <> 'suporte_consultores' then raise exception 'Este cliente já tem vendedor'; end if;
  if nullif(c.tratativa->>'atendenteExterno', '') is not null then raise exception 'Este cliente já foi assumido por %', c.tratativa->>'atendenteExterno'; end if;
  if p_vendedor is not null then
    if not public._eh_projetista_valido(p_vendedor) then raise exception 'Vendedor inválido'; end if;
    if (c.tratativa->>'pedidoAtend') is not null and (c.tratativa->>'pedidoAtend')::uuid <> p_vendedor then
      raise exception '% já pediu este cliente — fale com a coordenação', coalesce(c.tratativa->>'pedidoAtendNome', 'Outro vendedor');
    end if;
    nome := public._nome(p_vendedor);
    update public.chamados set atendente_id = p_vendedor, setor_destino = 'atendente_cliente', status_cliente = 'com_vendedor',
      tratativa = (tratativa - 'pedidoAtend' - 'pedidoAtendNome' - 'pedidoAtendEm') || jsonb_build_object('assumidoFila', true, 'assumidoEm', now(), 'assumidoPor', nome),
      status = case when c.status = 'aberta' then 'tratativa'::public.status_chamado else c.status end
    where id = p_id;
    insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto)
    values (p_id, now(), null, 'Tela da loja', nome || ' assumiu o atendimento pela tela da loja (cliente da fila, sem direcionamento)');
    perform public._notificar(public._usuarios_setor(array['suporte_consultores','marketing_supervisao','gerente_loja']), 'ℹ️ Cliente assumido da fila',
      nome || ' assumiu ' || c.cliente || ' pela tela da loja.', c.id, 'assumiu:' || c.id);
  else
    if length(outro) < 2 then raise exception 'Escreva o seu nome'; end if;
    nome := left(outro, 60);
    update public.chamados set tratativa = (tratativa - 'pedidoAtend' - 'pedidoAtendNome' - 'pedidoAtendEm')
      || jsonb_build_object('assumidoFila', true, 'assumidoEm', now(), 'assumidoPor', nome, 'atendenteExterno', nome)
    where id = p_id;
    insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto)
    values (p_id, now(), null, 'Tela da loja', nome || ' (não cadastrado — "Outro"/freelancer) assumiu o atendimento pela tela da loja');
    perform public._notificar(public._usuarios_setor(array['suporte_consultores','marketing_supervisao','gerente_loja']), '⚠️ Cliente assumido por freelancer',
      nome || ' (sem cadastro) assumiu ' || c.cliente || ' pela tela da loja — verificar.', c.id, 'assumiu:' || c.id);
  end if;
  return jsonb_build_object('nome', nome, 'externo', p_vendedor is null);
end $$;

drop function if exists public.agenda_publica_dia(text, date);
create or replace function public.agenda_publica_dia(p_token text, p_dia date)
returns table(id text, hora text, cliente text, vendedor text, consultor text, origem text, situacao text, quer_projeto boolean, pedido_vendedor text,
  avisado_em timestamptz, avisos int, assumido boolean, externo boolean)
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
           c.atendente_id is null and nullif(c.tratativa->>'atendenteExterno', '') is not null
    from public.chamados c join public.tipos t on t.id = c.tipo
    left join public.agenda_chegadas ch on ch.chamado_id = c.id
    where t.presale and c.data_loja is not null and c.data_loja::date = p_dia
    order by c.data_loja;
end $$;

-- designar um vendedor cadastrado depois limpa a marca de freelancer (a marca "assumido da fila" continua)
create or replace function public._trg_limpa_externo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.atendente_id is not null and nullif(new.tratativa->>'atendenteExterno', '') is not null then
    new.tratativa := (new.tratativa - 'atendenteExterno') || jsonb_build_object('freelancerAntes', new.tratativa->>'atendenteExterno');
  end if;
  return new;
end $$;
drop trigger if exists chamados_limpa_externo on public.chamados;
create trigger chamados_limpa_externo before update of atendente_id on public.chamados for each row execute function public._trg_limpa_externo();

revoke execute on function public.agenda_publica_assumir(text, text, uuid, text), public.agenda_publica_dia(text, date), public._trg_limpa_externo() from public;
grant execute on function public.agenda_publica_assumir(text, text, uuid, text), public.agenda_publica_dia(text, date) to anon, authenticated;
