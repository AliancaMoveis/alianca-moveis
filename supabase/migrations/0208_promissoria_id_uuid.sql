-- Confirmação de vendas · Promissória: o id do item é UUID, não número.
--
-- venda_conf_promissoria guardava o id do item de venda em variáveis bigint
-- (i1, i2), mas public.venda_itens.id é uuid. Quando a venda já tinha item
-- lançado — toda venda que o vendedor lançou no cliente — o SELECT ... INTO
-- estourava com "invalid input syntax for type bigint" e a promissória não
-- era confirmada. Só o tipo das duas variáveis muda; o resto da função fica
-- como está (por isso o patch no texto da função, e não um CREATE inteiro).
do $do$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'venda_conf_promissoria';
  if d is null then raise exception 'venda_conf_promissoria não existe'; end if;
  if position('i1 bigint; i2 bigint;' in d) = 0 then
    if position('i1 uuid; i2 uuid;' in d) > 0 then return; end if; -- já corrigida
    raise exception 'declaração de i1/i2 não encontrada';
  end if;
  execute replace(d, 'i1 bigint; i2 bigint;', 'i1 uuid; i2 uuid;');
end $do$;
