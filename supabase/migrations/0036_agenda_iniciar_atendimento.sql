-- Tela aberta da loja: cliente sem vendedor → "Iniciar atendimento": o vendedor escolhe o próprio nome.
-- Vira pedido de atendimento (mesmo fluxo do sistema): a coordenação recebe o aviso e confirma.
create or replace function public.agenda_publica_vendedores(p_token text)
returns table(id uuid, nome text) language plpgsql stable security definer set search_path = '' as $$
begin
  if p_token is null or length(p_token) < 40 or not exists (select 1 from public.agenda_publica a where a.id = 1 and a.ativo and a.token = p_token) then
    raise exception 'Link inválido ou desligado';
  end if;
  return query select u.id, u.nome from public.usuarios u
    where public._eh_projetista_valido(u.id) order by u.nome;
end $$;

create or replace function public.agenda_publica_iniciar(p_token text, p_id text, p_vendedor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_token is null or length(p_token) < 40 or not exists (select 1 from public.agenda_publica a where a.id = 1 and a.ativo and a.token = p_token) then
    raise exception 'Link inválido ou desligado';
  end if;
  select * into c from public.chamados where id = p_id for update;
  if not found or not public.tipo_presale(c.tipo) or c.data_loja is null or c.data_loja::date <> hoje then raise exception 'Cliente não está na agenda de hoje'; end if;
  if c.atendente_id is not null or c.setor_destino <> 'suporte_consultores' then raise exception 'Este cliente já tem vendedor'; end if;
  if p_vendedor is null or not public._eh_projetista_valido(p_vendedor) then raise exception 'Selecione o seu nome'; end if;
  if (c.tratativa->>'pedidoAtend') is not null and (c.tratativa->>'pedidoAtend')::uuid <> p_vendedor then
    raise exception '% já iniciou este atendimento — aguardando confirmação', coalesce(c.tratativa->>'pedidoAtendNome', 'Outro vendedor');
  end if;
  update public.chamados set tratativa = c.tratativa || jsonb_build_object('pedidoAtend', p_vendedor, 'pedidoAtendNome', public._nome(p_vendedor), 'pedidoAtendEm', now(), 'pedidoAtendOrigem', 'tela da loja')
  where id = p_id;
  insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto)
  values (p_id, now(), null, 'Tela da loja', public._nome(p_vendedor) || ' iniciou o atendimento pela tela da loja — aguardando confirmação');
end $$;

revoke execute on function public.agenda_publica_vendedores(text), public.agenda_publica_iniciar(text, text, uuid) from public;
grant execute on function public.agenda_publica_vendedores(text), public.agenda_publica_iniciar(text, text, uuid) to anon, authenticated;
