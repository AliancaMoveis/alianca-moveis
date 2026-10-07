-- Call center: novo motivo "Solicitação de retorno do montador" → vai para a Montagem, com o montador e a atendente
-- da montagem que vai tratar. Fica como pendência prioritária dessa atendente (e ela recebe aviso na hora).
insert into public.tipos (id, nome, setor_destino, anexos, presale, direto, ordem, rapido)
values ('retorno_montador', 'Solicitação de retorno do montador', 'montagem', true, false, false, 4, false)
on conflict (id) do update set nome = excluded.nome, setor_destino = excluded.setor_destino;

create or replace function public.retorno_montador_definir(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false); v_mont uuid := nullif(p->>'montadorId', '')::uuid; v_at uuid := nullif(p->>'atendenteId', '')::uuid; antes uuid; nm text;
begin
  if c.tipo <> 'retorno_montador' then raise exception 'Disponível só para retorno do montador'; end if;
  if not (public.pode_tratar_chamado(c) is true or (c.solicitante_id = auth.uid() and c.criado_em > now() - interval '30 minutes')) then
    raise exception 'Você não pode alterar este retorno';
  end if;
  if v_mont is null or not exists (select 1 from public.montadores where id = v_mont) then raise exception 'Selecione o montador'; end if;
  if v_at is null or not exists (select 1 from public.usuario_setores us join public.usuarios u on u.id = us.usuario_id where us.usuario_id = v_at and us.setor_id = 'montagem' and u.ativo) then
    raise exception 'Selecione a atendente da montagem';
  end if;
  antes := nullif(c.tratativa->'retorno'->>'atendenteId', '')::uuid;
  select nome into nm from public.montadores where id = v_mont;
  update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('retorno', jsonb_build_object('montadorId', v_mont, 'atendenteId', v_at))
   where id = p_id;
  perform public._reg(p_id, '🔧 Retorno do montador ' || nm || ' · atendente da montagem: ' || public._nome(v_at));
  if antes is distinct from v_at then
    perform public._notificar(array[v_at], '🔧 Retorno de montador para você', c.cliente || ' · ' || nm || ' · ' || left(c.motivo, 120), p_id, 'retmont:' || p_id || ':' || v_at);
  end if;
end $$;
revoke all on function public.retorno_montador_definir(text, jsonb) from public, anon;
grant execute on function public.retorno_montador_definir(text, jsonb) to authenticated;
