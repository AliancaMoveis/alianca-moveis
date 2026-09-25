-- Registro de venda: o vendedor informa OBRIGATORIAMENTE o gerente que negociou a venda
-- (usuário do setor Gerente de Loja ou Gestão). Guardado em vendas.gerente_id / gerente_nome.
alter table public.vendas add column if not exists gerente_id uuid references public.usuarios(id);
alter table public.vendas add column if not exists gerente_nome text;

drop function if exists public.registrar_venda(text, text, numeric, date, text);
create or replace function public.registrar_venda(p_id text, p_numero text, p_valor numeric, p_data date, p_vendedor text, p_gerente uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false); v public.vendas; editando boolean; gnome text;
begin
  if not public.tipo_presale(c.tipo) then raise exception 'Ação disponível só para clientes do marketing'; end if;
  if not (public.pode_tratar_chamado(c) or public.eh_gestao()) then raise exception 'Você não pode registrar venda neste cliente'; end if;
  if btrim(coalesce(p_numero,'')) = '' then raise exception 'Informe o número da venda'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor da venda'; end if;
  if btrim(coalesce(p_vendedor,'')) = '' then raise exception 'Informe o vendedor da loja'; end if;
  if p_gerente is null then raise exception 'Informe o gerente que negociou a venda'; end if;
  select u.nome into gnome from public.usuarios u
    where u.id = p_gerente and u.ativo and exists (select 1 from public.usuario_setores us where us.usuario_id = u.id and us.setor_id in ('gerente_loja', 'gestao'));
  if gnome is null then raise exception 'Gerente inválido — escolha um gerente da lista'; end if;
  select * into v from public.vendas where chamado_id = p_id for update;
  editando := found;
  if editando and v.status <> 'registrada' then
    raise exception 'Esta venda já foi decidida pela Gestão. Só a Gestão altera.';
  end if;
  insert into public.vendas (chamado_id, numero, data_venda, vendedor, atendente_nome, status, registrado_por, registrado_em, gerente_id, gerente_nome)
    values (p_id, btrim(p_numero), p_data, btrim(p_vendedor), coalesce((select nome from public.usuarios where id = c.atendente_id), ''),
            'registrada', auth.uid(), now(), p_gerente, gnome)
    on conflict (chamado_id) do update set numero = excluded.numero, data_venda = excluded.data_venda,
      vendedor = excluded.vendedor, atendente_nome = excluded.atendente_nome, registrado_por = excluded.registrado_por,
      registrado_em = excluded.registrado_em, gerente_id = excluded.gerente_id, gerente_nome = excluded.gerente_nome;
  insert into public.vendas_valores (chamado_id, valor) values (p_id, round(p_valor, 2))
    on conflict (chamado_id) do update set valor = excluded.valor;
  update public.chamados set status_cliente = 'vendido_revisao', status = 'concluida' where id = p_id;
  perform public._reg(p_id, 'Venda ' || btrim(p_numero) || case when editando then ' atualizada por ' else ' registrada por ' end
    || btrim(p_vendedor) || ' · gerente ' || gnome || case when p_data is not null then ' em ' || public._fmt_data(p_data) else '' end
    || ' — aguardando confirmação da Gestão');
end $$;
revoke execute on function public.registrar_venda(text, text, numeric, date, text, uuid) from public, anon;
grant execute on function public.registrar_venda(text, text, numeric, date, text, uuid) to authenticated;
