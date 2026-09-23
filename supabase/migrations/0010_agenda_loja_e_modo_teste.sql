-- Agenda da loja completa para o vendedor/projetista (só dados de agenda; a ficha continua restrita)
create or replace function public.agenda_loja(p_dia date)
returns table(id text, cliente text, data_loja timestamp, produto text, telefone text, atendente_id uuid, consultor_id uuid,
              status_cliente public.status_cliente, direto boolean, transf_pendente boolean, venda_numero text, meu boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.usuario_ativo() then raise exception 'Usuário sem acesso ao sistema'; end if;
  if not (public.eh_gestao() or public.meus_setores() && public.setores_marketing()) then
    raise exception 'Sem acesso à agenda da loja';
  end if;
  return query
    select c.id, c.cliente, c.data_loja, c.produto,
           case when public.pode_ver_chamado(c) then c.telefone else '' end,
           c.atendente_id, c.consultor_id, public.status_cliente_de(c), t.direto,
           exists (select 1 from public.transferencias x where x.chamado_id = c.id and x.status = 'pendente'),
           (select v.numero from public.vendas v where v.chamado_id = c.id),
           public.pode_ver_chamado(c)
    from public.chamados c join public.tipos t on t.id = c.tipo
    where t.presale and c.data_loja is not null and c.data_loja::date = p_dia
    order by c.data_loja;
end $$;
revoke execute on function public.agenda_loja(date) from public, anon;
grant execute on function public.agenda_loja(date) to authenticated;

-- Modo de teste: Gestão pode entrar como qualquer usuário (desligável em Administração)
alter table public.config add column if not exists modo_teste boolean not null default true;
create or replace function public.salvar_modo_teste(p_ligado boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._exigir_admin();
  update public.config set modo_teste = coalesce(p_ligado, false), atualizado_em = now(), atualizado_por = auth.uid() where id = 1;
end $$;
revoke execute on function public.salvar_modo_teste(boolean) from public, anon;
grant execute on function public.salvar_modo_teste(boolean) to authenticated;
