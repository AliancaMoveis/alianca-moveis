-- Clientes com mais de um nº de venda que tinham virado dois cadastros: junta num só (o histórico é copiado, pois é imutável)
create or replace function public._juntar_clientes(p_destino text, p_origem text) returns void
language plpgsql security definer set search_path = '' as $$
declare nums text;
begin
  select string_agg(numero, ', ') into nums from public.venda_itens where chamado_id = p_origem;
  if not exists (select 1 from public.vendas where chamado_id = p_destino) then
    update public.vendas set chamado_id = p_destino where chamado_id = p_origem;
  else
    update public.venda_itens set chamado_id = p_destino where chamado_id = p_origem;
    delete from public.vendas where chamado_id = p_origem;
  end if;
  insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto)
    select p_destino, quando, quem_id, quem_nome, '[' || p_origem || '] ' || texto from public.historico where chamado_id = p_origem order by quando;
  update public.anexos set chamado_id = p_destino where chamado_id = p_origem;
  update public.notificacoes set chamado_id = p_destino where chamado_id = p_origem;
  update public.reembolsos set chamado_id = p_destino where chamado_id = p_origem;
  update public.chamados set vinculado_a = p_destino where vinculado_a = p_origem;
  update public.chamados d set telefone = coalesce(nullif(d.telefone, ''), o.telefone), endereco = coalesce(nullif(d.endereco, ''), o.endereco)
    from public.chamados o where d.id = p_destino and o.id = p_origem;
  delete from public.chamados where id = p_origem;
  perform public._recalc_venda(p_destino);
  perform public._reg(p_destino, '🔗 Cliente duplicado ' || p_origem || ' juntado a este cliente' || coalesce(' (venda nº ' || nums || ')', ''));
end $$;
revoke all on function public._juntar_clientes(text, text) from public, anon, authenticated;

select public._juntar_clientes('ALM-0180', 'ALM-0181');
select public._juntar_clientes('ALM-0107', 'ALM-0108');
select public._juntar_clientes('ALM-0139', 'ALM-0127');
-- Marcelo de Freitas: vendedor Evaristo, + nº 1309059 (R$ 50.000 pago) e promissória 1308770 (R$ 100.000), a validar pela Gestão
update public.chamados set atendente_id = '82eb3fe8-68fd-4b3e-81b9-32e9c567ba51', cliente = 'Marcelo de Freitas - PJ EVARISTO' where id = 'ALM-0180';
update public.vendas set vendedor = 'Evaristo', atendente_nome = 'Evaristo' where chamado_id = 'ALM-0180';
insert into public.venda_itens (chamado_id, tipo, numero, valor, data_venda, status) values
  ('ALM-0180', 'pago', '1309059', 50000, '2026-09-25', 'registrada'),
  ('ALM-0180', 'promissoria', '1308770', 100000, '2026-09-25', 'registrada');
select public._recalc_venda('ALM-0180');
select public._reg('ALM-0180', '➕ Lançados: nº 1309059 R$ 50.000,00 (pago) + promissória nº 1308770 R$ 100.000,00 — aguardando análise da Gestão');
delete from public.notificacoes where criado_em >= now();

-- _recalc_venda: o total da venda (relatórios) conta só os nºs já efetivados; enquanto nada foi analisado, vale o valor informado
do $do$ declare d text; begin
  d := pg_get_functiondef('public._recalc_venda(text)'::regprocedure);
  d := replace(d, $x$  st := case when n_at = 0$x$, $x$  if n_ef > 0 then
    select coalesce(sum(valor), 0) into tot from public.venda_itens where chamado_id = p_id and tipo in ('pago', 'promissoria') and status = 'efetivada';
  end if;
  st := case when n_at = 0$x$);
  execute d;
end $do$;
