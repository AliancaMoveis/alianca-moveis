-- Pelo CPF, devolve o que a tela de nova solicitação precisa: o nome, as vendas do cliente (da mais
-- nova para a mais velha, para escolher em vez de digitar de cabeça) e a última montagem de origem,
-- para já vir marcado quem montou e quem agendou no retorno do montador.
--
-- Três fontes de venda, porque nenhuma cobre tudo:
--   exact_vendas_rel        relatório puxado do Exact — de 01/10/2026 em diante
--   base_clientes_vendas    importação da base — de 02/01/2026 a 08/10/2026
--   chamados                venda que só aparece em ticket (pedido com 6 a 8 dígitos)
-- Juntas cobrem 2026 inteiro. Venda mais antiga que isso não aparece: precisa de nova importação
-- da base, ou puxar o relatório do Exact para o período.
--
-- Valor da venda fica de fora de propósito: a tela precisa do número e da data, e preço não deve
-- vazar para quem abre solicitação.
create index if not exists exact_vendas_rel_doc_idx
  on public.exact_vendas_rel (regexp_replace(coalesce(linha->>'CPFCNPJCli', ''), '\D', '', 'g'));
create index if not exists chamados_cliente_doc_idx
  on public.chamados (regexp_replace(coalesce(cliente_doc, ''), '\D', '', 'g')) where coalesce(pedido, '') <> '';

create or replace function public.cliente_para_solicitacao(p_doc text, p_nome text default '')
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare d text := regexp_replace(coalesce(p_doc, ''), '\D', '', 'g'); nome text; vendas jsonb;
begin
  if not public.usuario_ativo() then raise exception 'Sem acesso'; end if;
  if length(d) not in (11, 14) then return null; end if;

  with ex as (
    select v.numero as num,
           case when (v.linha->>'IncluidaEm') ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}'
                then to_date(left(v.linha->>'IncluidaEm', 10), 'DD/MM/YYYY') else v.data_situacao end as dt,
           nullif(btrim(coalesce(v.linha->>'SituaçãoVenda', '')), '') as sit,
           nullif(btrim(coalesce(v.linha->>'Vendedor', '')), '') as vend,
           nullif(btrim(coalesce(v.linha->>'Cliente', '')), '') as cli,
           1 as pri
      from public.exact_vendas_rel v
     where regexp_replace(coalesce(v.linha->>'CPFCNPJCli', ''), '\D', '', 'g') = d
  ), ba as (
    select v.num_venda, v.data_venda::date, nullif(btrim(coalesce(v.situacao, '')), ''),
           nullif(btrim(coalesce(v.vendedor, '')), ''), c.nome, 2
      from public.base_clientes c join public.base_clientes_vendas v on v.cliente_id = c.id
     where c.cpf_cnpj = d
  ), ch as (
    select distinct on (k.pedido) k.pedido, k.data_venda, null::text, null::text, k.cliente, 3
      from public.chamados k
     where regexp_replace(coalesce(k.cliente_doc, ''), '\D', '', 'g') = d
       and coalesce(k.pedido, '') ~ '^[0-9]{6,8}$'
     order by k.pedido, k.criado_em desc
  ), tudo as (select * from ex union all select * from ba union all select * from ch),
  unica as (select distinct on (num) * from tudo order by num, pri)
  select (select cli from tudo order by pri, dt desc nulls last limit 1),
         coalesce(jsonb_agg(jsonb_build_object('numero', num, 'data', dt, 'situacao', sit, 'vendedor', vend)
                            order by dt desc nulls last, num desc), '[]'::jsonb)
    into nome, vendas
    from unica;

  -- o nome digitado serve de reserva: cliente com montagem no histórico cuja venda é mais antiga
  -- que a janela coberta não traz nome pelas vendas, mas o montador ainda é achável pelo nome
  return jsonb_build_object('nome', nome, 'vendas', vendas,
    'montagem', public._montagem_escolhida(coalesce(nullif(btrim(coalesce(nome, '')), ''), btrim(coalesce(p_nome, '')))));
end $$;

revoke all on function public.cliente_para_solicitacao(text, text) from public, anon;
grant execute on function public.cliente_para_solicitacao(text, text) to authenticated;

-- operadoraId em montagem_do_cliente, para a tela poder pré-selecionar a atendente da montagem:
-- ver a versão completa da função em 0252; aqui só o acréscimo dos dois ids resolvidos.
