-- 0132 · Gerente de loja acompanha todo o call center no computador (menos Checklist, Medidas e Pós-venda, que têm módulo próprio)
DO $$
declare d text; a text := '    when x->''ms'' ? ''callcenter'' then true';
begin
  d := pg_get_functiondef('public.pode_ver_chamado_ctx'::regproc);
  if position(a in d) = 0 then raise exception 'âncora não encontrada'; end if;
  d := replace(d, a, '    when x->''ms'' ? ''gerente_loja'' and c.tipo not in (''checklist'', ''medidas'', ''posvenda'') then true
' || a);
  execute d;
end $$;
