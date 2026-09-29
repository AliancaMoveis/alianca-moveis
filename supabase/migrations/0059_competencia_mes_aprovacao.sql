-- Competência da venda = mês da aprovação da Gestão (decidido_em). Venda com data de mês anterior conta no 1º dia do mês da aprovação.
create or replace function public._competencia(v public.vendas) returns date
language sql stable set search_path = '' as $$
  select case when date_trunc('month', d) < date_trunc('month', b) then date_trunc('month', b)::date else d end
  from (select coalesce(v.data_venda, (v.registrado_em at time zone 'America/Sao_Paulo')::date) d,
               (coalesce(v.decidido_em, v.registrado_em) at time zone 'America/Sao_Paulo')::date b) x;
$$;
-- _calc_pagamento_mkt, _extrato_campo, _itens_campo e avisos_rotina_em passaram a usar public._competencia(v) (replace aplicado via MCP).
