-- Gestão também recebe "✅ Venda confirmada" (com valor, vendedor e consultor) — inclusive quem confirmou, para ter o registro no celular.
do $$ declare f text; ancora text := $a$    if c.consultor_id is not null then
      perform public._notificar(array[c.consultor_id], '✅ Venda confirmada'$a$;
begin
  select pg_get_functiondef('public._trg_venda_avisos()'::regprocedure) into f;
  if position('vok-g:' in f) > 0 then return; end if;
  if position(ancora in f) = 0 then raise exception 'âncora não encontrada'; end if;
  f := replace(f, ancora, $b$    -- Gestão: toda venda confirmada (inclusive quem confirmou, para registro no celular)
    insert into public.notificacoes (usuario_id, titulo, corpo, chamado_id, chave)
    select u, '✅ Venda confirmada', c.cliente || ' · venda nº ' || new.numero || coalesce(' · ' || public._moeda(val), '')
      || case when c.atendente_id is not null then ' · vendedor ' || public._nome(c.atendente_id) else '' end
      || case when c.consultor_id is not null then ' · consultor ' || public._nome(c.consultor_id) else '' end,
      c.id, 'vok-g:' || c.id || ':' || u
    from unnest(public._usuarios_setor(array['gestao'])) u
    on conflict (chave) do nothing;
$b$ || ancora);
  execute f;
end $$;
