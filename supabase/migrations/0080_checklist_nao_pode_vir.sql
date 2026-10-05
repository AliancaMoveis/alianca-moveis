-- Checklist: "cliente não pode vir" — ao remarcar pela ação "mover", o motivo informado vai para o histórico
-- e o cliente ganha um contador de faltas/remarcações por indisponibilidade.
do $do$ declare d text; begin
  d := pg_get_functiondef('public.checklist_registrar(text,jsonb)'::regprocedure);
  d := replace(d, $x$|| coalesce(' · ' || round(v_dur / 60.0, 1)::text || 'h', '') || ' — alterar também no sistema interno';$x$,
                  $x$|| coalesce(' · ' || round(v_dur / 60.0, 1)::text || 'h', '') || ' — alterar também no sistema interno';
      if coalesce((p->>'naoPodeVir')::boolean, false) then
        if obs = '' then raise exception 'Informe o motivo de o cliente não poder vir'; end if;
        txt := '🚫 Cliente não pode vir (' || obs || ') — nova data: ' || to_char(dt, 'DD/MM/YYYY HH24:MI') || ' com ' || v_proj || ' — alterar também no sistema interno';
        ck := ck || jsonb_build_object('naoPodeVir', coalesce((ck->>'naoPodeVir')::int, 0) + 1);
      end if;$x$);
  d := replace(d, $x$      txt := '❌ Agendamento de ' ||$x$, $x$      if coalesce((p->>'naoPodeVir')::boolean, false) then ck := ck || jsonb_build_object('naoPodeVir', coalesce((ck->>'naoPodeVir')::int, 0) + 1); end if;
      txt := case when coalesce((p->>'naoPodeVir')::boolean, false) then '🚫 Cliente não pode vir (' || obs || ') — ' else '' end || '❌ Agendamento de ' ||$x$);
  if d not like '%Cliente não pode vir (%' or (length(d) - length(replace(d, 'naoPodeVir'')::boolean', ''))) < 2 * length('naoPodeVir'')::boolean') then raise exception 'npv'; end if;
  execute d;
end $do$;
