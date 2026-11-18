-- Negociação: frete no pré-pedido e no fechamento do gerente.
--
-- O vendedor marca que a venda tem frete (entra fixo em R$ 100 — Curitiba e região) e o gerente
-- ajusta na mesa de negociação, porque litoral e fora são mais caros. O frete não recebe desconto,
-- por isso fica numa coluna própria e não no valor bruto.
--
-- Promoção não precisou de coluna: é marcada item a item dentro de `itens` (jsonb), que já é gravado
-- inteiro pelas duas funções — `promo` e `precoPromo` passam por elas sem mudança.
alter table public.pre_pedidos add column if not exists frete numeric;      -- o que o vendedor marcou
alter table public.pre_pedidos add column if not exists neg_frete numeric;  -- o que o gerente ajustou

do $do$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'pre_pedido_salvar';
  if d is null then raise exception 'pre_pedido_salvar não existe'; end if;
  if position('frete' in d) > 0 then return; end if;   -- já aplicada
  d := replace(d,
    'insert into public.pre_pedidos (usuario_id, cliente_nome, telefone, endereco, itens, valor_bruto, valor_negociado, pagamento, obs)',
    'insert into public.pre_pedidos (usuario_id, cliente_nome, telefone, endereco, itens, frete, valor_bruto, valor_negociado, pagamento, obs)');
  d := replace(d,
    'values (auth.uid(), btrim(coalesce(p->>''cliente_nome'','''')), btrim(coalesce(p->>''telefone'','''')), btrim(coalesce(p->>''endereco'','''')), p->''itens'',',
    'values (auth.uid(), btrim(coalesce(p->>''cliente_nome'','''')), btrim(coalesce(p->>''telefone'','''')), btrim(coalesce(p->>''endereco'','''')), p->''itens'', nullif(replace(p->>''frete'', '','', ''.''),'''')::numeric,');
  d := replace(d,
    'itens = p->''itens'', valor_bruto =',
    'itens = p->''itens'', frete = nullif(replace(p->>''frete'', '','', ''.''),'''')::numeric, valor_bruto =');
  execute d;
end $do$;

do $do$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'negociacao_salvar';
  if d is null then raise exception 'negociacao_salvar não existe'; end if;
  if position('neg_frete' in d) > 0 then return; end if;   -- já aplicada
  execute replace(d,
    'neg_pagamento = btrim(coalesce(p->>''pagamento'','''')),',
    'neg_frete = nullif(replace(p->>''frete'', '','', ''.''),'''')::numeric, neg_pagamento = btrim(coalesce(p->>''pagamento'','''')),');
end $do$;
