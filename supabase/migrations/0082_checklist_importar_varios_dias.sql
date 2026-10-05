-- Checklist: "Data do Agendamento" da planilha com várias datas ("22/10/26, 09:00, 23/10/26, 09:00")
-- = atendimento em mais de um dia. A tela manda as datas seguintes em r.diasExtras; a importação grava em ck.diasExtras.
do $do$ declare d text; begin
  d := pg_get_functiondef('public.checklist_importar(jsonb)'::regprocedure);
  if d like '%diasExtras%' then return; end if;
  d := replace(d, $x$'agendadoPara', ag, 'contatos', 0,$x$, $x$'agendadoPara', ag, 'contatos', 0,
              'diasExtras', case when ag is not null and jsonb_typeof(r->'diasExtras') = 'array' and jsonb_array_length(r->'diasExtras') > 0
                then (select jsonb_agg(jsonb_build_object('data', to_char((e->>'data')::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS')) order by e->>'data')
                        from jsonb_array_elements(r->'diasExtras') e where nullif(e->>'data', '') is not null and (e->>'data')::timestamp::date <> ag::date) end,$x$);
  if d not like '%diasExtras%' then raise exception 'anchor'; end if;
  execute d;
end $do$;
