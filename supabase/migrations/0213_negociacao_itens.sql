-- Negociação: o gerente mexe nos produtos durante a conversa com o cliente.
--
-- Na mesa, o cliente pede para tirar um item ou incluir mais coisa. Até aqui só o vendedor
-- dono do pré-pedido podia alterar a lista (pre_pedido_salvar exige usuario_id = auth.uid()),
-- então o gerente teria que ligar para ele no meio da negociação. Esta função deixa quem
-- negocia alterar a lista do pré-pedido que ESTÁ na negociação — e só esses.
create or replace function public.negociacao_itens(p_id uuid, p_itens jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not public.pode_negociacao() then raise exception 'Só gerentes e proprietários negociam'; end if;
  if jsonb_typeof(p_itens) <> 'array' then raise exception 'Lista de produtos inválida'; end if;
  if jsonb_array_length(p_itens) = 0 then raise exception 'A negociação precisa de pelo menos um produto'; end if;
  update public.pre_pedidos set itens = p_itens, atualizado_em = now()
   where id = p_id and neg_status <> '' and neg_status is not null;
  if not found then raise exception 'Pré-pedido não está na negociação'; end if;
end $function$;

revoke all on function public.negociacao_itens(uuid, jsonb) from public;
grant execute on function public.negociacao_itens(uuid, jsonb) to authenticated, service_role;
