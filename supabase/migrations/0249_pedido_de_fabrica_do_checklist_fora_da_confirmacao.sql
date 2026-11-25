-- Venda "incluida por Checklist.*" no Exact e o pedido da fabrica de um checklist ja
-- concluido -- nao e venda nova e nao entra em comissao. A tela de Encontrar Vendas ja
-- tinha essa regra, mas lia o cabecalho "Incluido por" numa grafia so enquanto a planilha
-- do Exact usa tres; a trava nao enxergava e 61 pedidos (R$ 1,34 mi, o ultimo em 16/11)
-- foram parar na fila de confirmacao como se fossem venda a aprovar.
create table if not exists public.venda_conf_ck_backup (
  numero text, status_antes text, incluido_por text, valor numeric, salvo_em timestamptz default now()
);
insert into public.venda_conf_ck_backup(numero, status_antes, incluido_por, valor)
select v.numero, v.status, v.incluido_por, v.valor
from public.venda_confirmacao v
where v.incluido_por ilike 'checklist%' and v.status = 'pendente';

update public.venda_confirmacao v
   set status = 'checklist',
       motivo = btrim(coalesce(v.motivo,'') || ' · pedido de fabrica (incluido por ' || v.incluido_por || ')'),
       decidido_em = now()
 where v.incluido_por ilike 'checklist%' and v.status = 'pendente';

do $mig$
declare d text; de text; para text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'venda_conf_enviar';
  if d is null then raise exception 'venda_conf_enviar nao encontrada'; end if;
  de := 'if num = '''' or coalesce((x->>''valor'')::numeric, 0) <= 0 then continue; end if;';
  para := de || E'\n'
       || '    -- pedido da fabrica de um checklist concluido: nunca e venda nova' || E'\n'
       || '    if coalesce(x->>''incluido_por'', '''') ~* ''^[[:space:]]*checklist'' then continue; end if;';
  if position(de in d) = 0 then raise exception 'ancora nao achada em venda_conf_enviar'; end if;
  execute replace(d, de, para);
end $mig$;
