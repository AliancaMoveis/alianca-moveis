-- Atalho de Gestão nas tabelas ligadas a chamados.
--
-- Problema: as políticas de historico/anexos/vendas/vendas_valores/venda_itens resolviam
-- "chamado_id in (select id from chamados)", e esse subplano varria as 7.4k linhas largas de
-- chamados aplicando a regra de visibilidade por linha — a cada requisição, em cada tabela.
-- Em produção isso custava 619 ms só em vendas_valores.
--
-- Quem é da Gestão vê tudo, então o teste de Gestão vem primeiro: quando é verdadeiro o
-- subplano é marcado como "never executed" e nem roda. O guarda "not som" é obrigatório,
-- porque na regra de chamados o teste de somente_atribuidos é avaliado ANTES do de Gestão.

alter policy historico_ler on public.historico using (
  coalesce((select ((x->>'ges')::boolean and not coalesce((x->>'som')::boolean, false))
            from (select public._ctx_ver() as x) t), false)
  or chamado_id in (select c.id from public.chamados c));

alter policy anexos_ler on public.anexos using (
  coalesce((select ((x->>'ges')::boolean and not coalesce((x->>'som')::boolean, false))
            from (select public._ctx_ver() as x) t), false)
  or chamado_id in (select c.id from public.chamados c));

alter policy vendas_ler on public.vendas using (
  coalesce((select ((x->>'ges')::boolean and not coalesce((x->>'som')::boolean, false))
            from (select public._ctx_ver() as x) t), false)
  or chamado_id in (select c.id from public.chamados c));

-- Valores: além do atalho de Gestão na própria tabela, o filtro de valor interno também ganha
-- o atalho, para não chamar pode_ver_valor_ctx por linha quando o usuário é da Gestão.
alter policy vendas_valores_ler on public.vendas_valores using (
  coalesce((select ((x->>'ges')::boolean and not coalesce((x->>'som')::boolean, false))
            from (select public._ctx_ver() as x) t), false)
  or chamado_id in (
       select c.id from public.chamados c
        where coalesce((select ((y->>'ges')::boolean) from (select public._ctx_ver() as y) u), false)
           or public.pode_ver_valor_ctx(c.*, (select public._ctx_ver()))));

alter policy venda_itens_ler on public.venda_itens using (
  coalesce((select ((x->>'ges')::boolean and not coalesce((x->>'som')::boolean, false))
            from (select public._ctx_ver() as x) t), false)
  or chamado_id in (
       select c.id from public.chamados c
        where coalesce((select ((y->>'ges')::boolean) from (select public._ctx_ver() as y) u), false)
           or public.pode_ver_valor_ctx(c.*, (select public._ctx_ver()))));
