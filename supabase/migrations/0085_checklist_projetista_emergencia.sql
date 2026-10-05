-- Checklist: projetistas só para emergência (ex.: Giovanni, gerente de loja) — ficam na agenda e podem ser escolhidos à mão,
-- mas não entram nas sugestões de horário.
do $do$ declare d text; begin
  d := pg_get_functiondef('public.salvar_checklist_agenda(jsonb)'::regprocedure);
  if d like '%''emergencia''%' then return; end if;
  d := replace(d, $x$'confirmarDias', least(15, greatest(0, coalesce((p->>'confirmarDias')::int, 2)))),$x$,
    $x$'confirmarDias', least(15, greatest(0, coalesce((p->>'confirmarDias')::int, 2))),
      'emergencia', (select coalesce(jsonb_agg(distinct btrim(x)), '[]'::jsonb) from jsonb_array_elements_text(coalesce(p->'emergencia', '[]'::jsonb)) x where btrim(x) <> '')),$x$);
  if d not like '%''emergencia''%' then raise exception 'anchor'; end if;
  execute d;
end $do$;
update public.config set checklist_agenda = checklist_agenda || '{"emergencia":["Giovanni"]}'::jsonb where id = 1 and not (checklist_agenda ? 'emergencia');
