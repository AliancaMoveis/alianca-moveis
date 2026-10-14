-- 0127 · salvar_checklist_agenda mantém a ordem dos projetistas (antes o "distinct" ordenava em ordem alfabética)
DO $$
declare d text; a text := '(select jsonb_agg(distinct btrim(x)) from jsonb_array_elements_text(p->''projetistas'') x where btrim(x) <> '''')';
begin
  d := pg_get_functiondef('public.salvar_checklist_agenda'::regproc);
  if position(a in d) = 0 then raise exception 'âncora não encontrada'; end if;
  d := replace(d, a, '(select jsonb_agg(x order by o) from (select distinct on (btrim(x)) btrim(x) x, o from jsonb_array_elements_text(p->''projetistas'') with ordinality t(x, o) where btrim(x) <> '''' order by btrim(x), o) z)');
  execute d;
end $$;
update public.config set checklist_agenda = jsonb_set(checklist_agenda, '{projetistas}', '["Angela","Silvane","Cleberson","Gislaine","Juliana","Rafael","Eduardo","Giovanni"]') where id = 1;
