-- Valor da venda: Supervisão Marketing (e operadoras) não veem o valor vendido.
-- Veem: Gestão, Gerente de Loja e o próprio vendedor/consultor do cliente.
create or replace function public.pode_ver_valor_id(p_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.usuario_ativo() and public.pode_ver_id(p_id) and (
    public.eh_gestao() or 'gerente_loja' = any(public.meus_setores())
    or exists (select 1 from public.chamados c where c.id = p_id
               and (c.atendente_id = auth.uid() or c.consultor_id = auth.uid())))) is true;
$$;

-- histórico não mostra mais o valor (quem lê o histórico pode não poder ver o valor)
create or replace function public.corrigir_venda(p_id text, p_numero text, p_valor numeric, p_data date, p_vendedor text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados; v public.vendas; val numeric;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão corrige os dados da venda'; end if;
  c := public._chamado(p_id, false);
  select * into v from public.vendas where chamado_id = p_id for update;
  if not found then raise exception 'Este cliente não tem venda registrada'; end if;
  if btrim(coalesce(p_numero,'')) = '' then raise exception 'Informe o número da venda'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor da venda'; end if;
  select valor into val from public.vendas_valores where chamado_id = p_id;
  if v.numero = btrim(p_numero) and val = round(p_valor,2) and v.data_venda is not distinct from p_data
     and v.vendedor = btrim(coalesce(p_vendedor,'')) then
    raise exception 'Nada mudou';
  end if;
  update public.vendas set numero = btrim(p_numero), data_venda = p_data,
    vendedor = coalesce(nullif(btrim(coalesce(p_vendedor,'')),''), v.vendedor) where chamado_id = p_id;
  insert into public.vendas_valores (chamado_id, valor) values (p_id, round(p_valor,2))
    on conflict (chamado_id) do update set valor = excluded.valor;
  perform public._reg(p_id, 'Dados da venda corrigidos pela Gestão: nº ' || btrim(p_numero) || case when val is distinct from round(p_valor,2) then ' · valor alterado' else '' end || ' · '
    || coalesce(public._fmt_data(p_data), '—') || ' · ' || coalesce(nullif(btrim(coalesce(p_vendedor,'')),''), v.vendedor));
end $$;
