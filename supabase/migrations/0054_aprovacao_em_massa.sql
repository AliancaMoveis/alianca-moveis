-- Aprovação em massa (Gestão): vendas (efetivar / cancelar), reembolsos (aprovar) e fechamento por pessoa
create or replace function public.validar_vendas_lote(p_ids text[], p_status text)
returns int language plpgsql security definer set search_path to '' as $$
declare i text; n int := 0; v public.vendas;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão valida vendas'; end if;
  if p_status not in ('efetivada', 'cancelada') then raise exception 'Em massa só dá para efetivar ou cancelar. Entrada + promissória e promissória são validadas uma a uma.'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'Selecione ao menos uma venda'; end if;
  foreach i in array p_ids loop
    select * into v from public.vendas where chamado_id = i;
    if not found then raise exception 'Venda do cliente % não encontrada', i; end if;
    if v.status <> 'registrada' then raise exception 'A venda % já foi analisada — atualize a tela', v.numero; end if;
    if p_status = 'efetivada' and v.tipo_informado in ('entrada', 'promissoria') then
      raise exception 'A venda % foi informada como %: valide individualmente', v.numero, case v.tipo_informado when 'entrada' then 'entrada + promissória' else '100% promissória' end;
    end if;
    perform public.validar_venda(i, p_status, 0, '[]'::jsonb);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.validar_vendas_lote(text[], text) from public, anon;
grant execute on function public.validar_vendas_lote(text[], text) to authenticated;

create or replace function public.aprovar_reembolsos_lote(p_ids uuid[])
returns int language plpgsql security definer set search_path to '' as $$
declare i uuid; n int := 0;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão aprova reembolsos'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'Selecione ao menos um reembolso'; end if;
  foreach i in array p_ids loop perform public.decidir_reembolso(i, true, ''); n := n + 1; end loop;
  return n;
end $$;
revoke all on function public.aprovar_reembolsos_lote(uuid[]) from public, anon;
grant execute on function public.aprovar_reembolsos_lote(uuid[]) to authenticated;

-- fechamento: pode confirmar só algumas pessoas (p_usuarios); sem lista = todos
drop function if exists public.fechar_mes_campo(date);
create or replace function public.fechar_mes_campo(p_ate date default null, p_usuarios uuid[] default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d date := coalesce(p_ate, (now() at time zone 'America/Sao_Paulo')::date); lt uuid := gen_random_uuid();
  u uuid; fid uuid; tot numeric; n int := 0; soma numeric := 0; comp date := date_trunc('month', d)::date; pg date := (date_trunc('month', d) + interval '1 month')::date;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão confirma o fechamento'; end if;
  if d > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'A data do fechamento não pode ser no futuro'; end if;
  if p_usuarios is not null and cardinality(p_usuarios) = 0 then raise exception 'Selecione ao menos uma pessoa'; end if;
  for u in select x from public._pessoas_campo() x where p_usuarios is null or x = any(p_usuarios) loop
    if not exists (select 1 from public._pendente_campo(u, d)) then continue; end if;
    select coalesce(sum(x.valor), 0) into tot from public._pendente_campo(u, d) x;
    insert into public.campo_fechamentos (lote, usuario_id, ate, competencia, pagar_em, total, fechado_por)
      values (lt, u, d, comp, pg, tot, auth.uid()) returning id into fid;
    insert into public.campo_fechamento_itens (fechamento_id, usuario_id, chave, tipo, chamado_id, descricao, dia, base, valor)
      select fid, u, x.chave, x.tipo, x.chamado_id, x.descricao, x.dia, x.base, x.valor from public._pendente_campo(u, d) x;
    perform public._notificar(array[u], '✅ Pagamento confirmado pela Gestão',
      'Fechamento até ' || to_char(d, 'DD/MM') || ': ' || public._moeda(tot) || ' — será pago em ' || public._mes_pt(pg) || '.', null, 'fech-' || lt || '-' || u);
    n := n + 1; soma := soma + tot;
  end loop;
  if n = 0 then raise exception 'Nada pendente para confirmar até %', to_char(d, 'DD/MM/YYYY'); end if;
  return jsonb_build_object('lote', lt, 'pessoas', n, 'total', soma, 'pagar_em', pg);
end $$;
revoke execute on function public.fechar_mes_campo(date, uuid[]) from public, anon;
grant execute on function public.fechar_mes_campo(date, uuid[]) to authenticated;
