-- Botão "🚨 Pedir acompanhamento da supervisão" (chamados do call center / pós-venda).
--  · Quem pede: atendentes do Call center (setor 'callcenter'). Escreve o motivo.
--  · Avisados na hora (celular): Supervisão (Call center) e Gestão.
--  · Supervisão/Gestão marcam "Estou acompanhando" (quem pediu é avisado) e depois "Encerrar acompanhamento".
--  · Fica em tratativa.acomp = {status: pendente|acompanhando|encerrado, porId, porNome, motivo, em, supId, supNome, supEm, fimEm, fimObs}
--  · Lembrete: se ninguém assumir em 15 min, a supervisão é avisada de novo (a cada 15 min, até 4 vezes).

create or replace function public.pedir_acompanhamento(p_id text, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados; eu uuid := auth.uid(); m text := btrim(coalesce(p_motivo, ''));
begin
  if not public.usuario_ativo() or not ('callcenter' = any(public.meus_setores())) then
    raise exception 'Só as atendentes do call center podem pedir acompanhamento da supervisão';
  end if;
  select * into c from public.chamados where id = p_id for update;
  if not found or not public.pode_ver_chamado(c) then raise exception 'Chamado não encontrado'; end if;
  if public.tipo_presale(c.tipo) then raise exception 'Acompanhamento da supervisão é só para chamados do call center'; end if;
  if c.status = 'concluida' then raise exception 'Este chamado já está concluído'; end if;
  if length(m) < 5 then raise exception 'Escreva o motivo (o que a supervisão precisa acompanhar)'; end if;
  if coalesce(c.tratativa->'acomp'->>'status', '') in ('pendente', 'acompanhando') then
    raise exception 'A supervisão já foi chamada para este chamado';
  end if;
  update public.chamados set tratativa = coalesce(c.tratativa, '{}'::jsonb) || jsonb_build_object('acomp', jsonb_build_object(
    'status', 'pendente', 'porId', eu, 'porNome', public._nome(eu), 'motivo', left(m, 500), 'em', now(), 'lembretes', 0))
  where id = p_id;
  perform public._reg(p_id, '🚨 Pediu acompanhamento da supervisão: ' || left(m, 500));
  perform public._notificar(public._usuarios_setor(array['supervisao', 'gestao']),
    '🚨 Acompanhamento urgente', public._nome(eu) || ' · ' || c.cliente || ' (' || c.id || '): ' || left(m, 140),
    c.id, 'acomp:' || c.id || ':' || extract(epoch from now())::bigint);
end $$;

create or replace function public.assumir_acompanhamento(p_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados; eu uuid := auth.uid(); a jsonb;
begin
  if not public.usuario_ativo() or not (public.eh_gestao() or 'supervisao' = any(public.meus_setores())) then
    raise exception 'Só a Supervisão ou a Gestão podem assumir o acompanhamento';
  end if;
  select * into c from public.chamados where id = p_id for update;
  if not found then raise exception 'Chamado não encontrado'; end if;
  a := c.tratativa->'acomp';
  if a is null or a->>'status' <> 'pendente' then raise exception 'Não há pedido de acompanhamento pendente'; end if;
  update public.chamados set tratativa = c.tratativa || jsonb_build_object('acomp', a || jsonb_build_object(
    'status', 'acompanhando', 'supId', eu, 'supNome', public._nome(eu), 'supEm', now()))
  where id = p_id;
  perform public._reg(p_id, 'Supervisão: ' || public._nome(eu) || ' está acompanhando este chamado');
  if (a->>'porId') is not null and (a->>'porId')::uuid <> eu then
    perform public._notificar(array[(a->>'porId')::uuid], '👀 Supervisão acompanhando',
      public._nome(eu) || ' está acompanhando ' || c.cliente || ' (' || c.id || ').', c.id, 'acompok:' || c.id || ':' || extract(epoch from now())::bigint);
  end if;
end $$;

create or replace function public.encerrar_acompanhamento(p_id text, p_obs text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados; eu uuid := auth.uid(); a jsonb; o text := btrim(coalesce(p_obs, ''));
begin
  if not public.usuario_ativo() or not (public.eh_gestao() or 'supervisao' = any(public.meus_setores())) then
    raise exception 'Só a Supervisão ou a Gestão podem encerrar o acompanhamento';
  end if;
  select * into c from public.chamados where id = p_id for update;
  if not found then raise exception 'Chamado não encontrado'; end if;
  a := c.tratativa->'acomp';
  if a is null or a->>'status' not in ('pendente', 'acompanhando') then raise exception 'Não há acompanhamento aberto'; end if;
  update public.chamados set tratativa = c.tratativa || jsonb_build_object('acomp', a || jsonb_build_object(
    'status', 'encerrado', 'fimId', eu, 'fimNome', public._nome(eu), 'fimEm', now(), 'fimObs', left(o, 500),
    'supId', coalesce(a->'supId', to_jsonb(eu)), 'supNome', coalesce(a->>'supNome', public._nome(eu))))
  where id = p_id;
  perform public._reg(p_id, 'Acompanhamento da supervisão encerrado por ' || public._nome(eu) || case when o <> '' then ': ' || left(o, 500) else '' end);
  if (a->>'porId') is not null and (a->>'porId')::uuid <> eu then
    perform public._notificar(array[(a->>'porId')::uuid], '✅ Acompanhamento encerrado',
      c.cliente || ' (' || c.id || ')' || case when o <> '' then ': ' || left(o, 140) else '' end, c.id, 'acompfim:' || c.id || ':' || extract(epoch from now())::bigint);
  end if;
end $$;

-- lembrete: pedido pendente há 15 min sem ninguém assumir → avisa a supervisão de novo (máx. 4 vezes)
create or replace function public.acomp_lembretes() returns void
language plpgsql security definer set search_path = '' as $$
declare r record; n int;
begin
  for r in select * from public.chamados
    where tratativa->'acomp'->>'status' = 'pendente'
      and coalesce((tratativa->'acomp'->>'lembretes')::int, 0) < 4
      and (tratativa->'acomp'->>'em')::timestamptz < now() - ((coalesce((tratativa->'acomp'->>'lembretes')::int, 0) + 1) * interval '15 minutes')
  loop
    n := coalesce((r.tratativa->'acomp'->>'lembretes')::int, 0) + 1;
    update public.chamados set tratativa = jsonb_set(tratativa, '{acomp,lembretes}', to_jsonb(n)) where id = r.id;
    perform public._notificar(public._usuarios_setor(array['supervisao']),
      '⏰ Acompanhamento ainda sem resposta', coalesce(r.tratativa->'acomp'->>'porNome', '') || ' pediu há ' || (n * 15) || ' min · ' || r.cliente || ' (' || r.id || ')',
      r.id, 'acomplem:' || r.id || ':' || n);
  end loop;
end $$;

revoke execute on function public.pedir_acompanhamento(text, text), public.assumir_acompanhamento(text), public.encerrar_acompanhamento(text, text), public.acomp_lembretes() from public, anon;
grant execute on function public.pedir_acompanhamento(text, text), public.assumir_acompanhamento(text), public.encerrar_acompanhamento(text, text) to authenticated;

select cron.schedule('acomp-lembretes', '*/5 * * * *', 'select public.acomp_lembretes()');
