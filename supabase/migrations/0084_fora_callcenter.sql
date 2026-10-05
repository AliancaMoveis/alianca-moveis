-- Checklist, Medidas e Pós-venda têm módulo próprio: não entram no escalonamento automático (urgente / crítico) do call center.
do $do$ declare d text; begin
  d := pg_get_functiondef('public.autoescalonar()'::regprocedure);
  d := replace(d, $x$where not t.presale and (ch.status$x$, $x$where not t.presale and ch.tipo not in ('checklist', 'medidas', 'posvenda') and (ch.status$x$);
  if d not like '%not in (''checklist'', ''medidas'', ''posvenda'')%' then raise exception 'anchor'; end if;
  execute d;
end $do$;
update public.chamados set urgente = false, escalonado_auto = false, escalado_critico = false
 where tipo in ('checklist', 'medidas', 'posvenda') and escalonado_auto;
