-- Call center: novos motivos e fluxos
--  • "Solicitação de entrega" passa a se chamar "Previsão de entrega", com marcação interna "Aguardando compra" (não vai para o cliente)
--  • novos motivos: Agendamento de entrega, Garantia expirada, Atualização de endereço, Previsão de assistência,
--    Desmontagem de estofado (Salete → Tatiana/depósito → Valdir, estofador) e Erro de venda (Salete → vendedor responde no app)
update public.tipos set nome = 'Previsão de entrega' where id = 'entrega';
insert into public.tipos (id, nome, ordem, anexos, direto, rapido, presale, setor_destino) values
  ('agendamento_entrega', 'Agendamento de entrega', 2, false, false, false, false, 'callcenter'),
  ('atualizacao_endereco', 'Atualização de endereço', 2, false, false, false, false, 'callcenter'),
  ('previsao_assistencia', 'Previsão de assistência', 5, false, false, false, false, 'assistencia'),
  ('garantia_expirada', 'Garantia expirada', 5, true, false, false, false, 'assistencia'),
  ('desmontagem_estofado', 'Desmontagem de estofado', 6, true, false, false, false, 'supervisao'),
  ('erro_venda', 'Erro de venda', 6, true, false, false, false, 'supervisao')
on conflict (id) do nothing;

-- marcações: aguardando compra (previsão de entrega), enviada ao estofador (desmontagem), vendedor informado (erro de venda)
do $$ declare f text; begin
  f := pg_get_functiondef('public.alternar_marcacao(text, text)'::regprocedure);
  if position('aguardandoCompra' in f) = 0 then
    if position('  elsif p_campo = ''contatoIniciado''' in f) = 0 then raise exception 'âncora não encontrada'; end if;
    f := replace(f, '  elsif p_campo = ''contatoIniciado''',
'  elsif p_campo = ''aguardandoCompra'' and c.tipo = ''entrega'' then
    txt := case when novo then ''🛒 Interno: aguardando compra (Compras ainda não comprou) — não informar assim ao cliente'' else ''Marcação "aguardando compra" removida'' end;
    if novo and c.status = ''aberta'' then novo_status := ''tratativa''; end if;
  elsif p_campo = ''estofadorEnviado'' and c.tipo = ''desmontagem_estofado'' then
    txt := case when novo then ''🛋 Solicitação enviada para o estofador (depósito → Valdir)'' else ''Marcação "enviada ao estofador" removida'' end;
    if novo and c.status = ''aberta'' then novo_status := ''tratativa''; end if;
  elsif p_campo = ''vendedorInformado'' and c.tipo = ''erro_venda'' then
    txt := case when novo then ''📣 Vendedor informado do erro de venda'' else ''Marcação "vendedor informado" removida'' end;
    if novo and c.status = ''aberta'' then novo_status := ''tratativa''; end if;
  elsif p_campo = ''contatoIniciado''');
    execute f;
  end if;
end $$;

-- Erro de venda: vendedor responsável + o que o cliente comprou x o que foi lançado/enviado
create or replace function public.erro_venda_definir(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false); v uuid := nullif(p->>'vendedorId', '')::uuid; ant jsonb;
begin
  if c.tipo <> 'erro_venda' then raise exception 'Disponível só para erro de venda'; end if;
  if not (public.pode_tratar_chamado(c) is true or (c.solicitante_id = auth.uid() and c.criado_em > now() - interval '30 minutes')) then
    raise exception 'Você não pode alterar este registro';
  end if;
  if v is null or not exists (select 1 from public.usuario_setores us join public.usuarios u on u.id = us.usuario_id where us.usuario_id = v and us.setor_id = 'atendente_cliente' and u.ativo) then
    raise exception 'Selecione o vendedor';
  end if;
  if length(btrim(coalesce(p->>'comprado', ''))) < 2 or length(btrim(coalesce(p->>'lancado', ''))) < 2 then
    raise exception 'Informe o que o cliente comprou e o que foi lançado/enviado';
  end if;
  ant := coalesce(c.tratativa->'erroVenda', '{}'::jsonb);
  update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('erroVenda',
    ant || jsonb_build_object('vendedorId', v, 'comprado', left(btrim(p->>'comprado'), 600), 'lancado', left(btrim(p->>'lancado'), 600)))
  where id = p_id;
  perform public._reg(p_id, '⚠️ Erro de venda · vendedor ' || public._nome(v) || ' · comprou: ' || left(btrim(p->>'comprado'), 200) || ' · lançado/enviado: ' || left(btrim(p->>'lancado'), 200));
  if (ant->>'vendedorId') is distinct from v::text then
    perform public._notificar(array[v], '🚨 Erro de venda para você tratar', c.cliente || coalesce(' · venda ' || nullif(c.pedido, ''), '') || ' · ' || left(btrim(p->>'comprado'), 100), p_id, 'errovenda:' || p_id || ':' || v);
  end if;
end $$;
revoke all on function public.erro_venda_definir(text, jsonb) from public, anon;
grant execute on function public.erro_venda_definir(text, jsonb) to authenticated;

-- Erro de venda: o vendedor responde pelo app (tratativa dele); a Salete acompanha e finaliza
create or replace function public.erro_venda_responder(p_id text, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false); tx text := btrim(coalesce(p_texto, '')); r jsonb;
begin
  if c.tipo <> 'erro_venda' then raise exception 'Disponível só para erro de venda'; end if;
  if (c.tratativa->'erroVenda'->>'vendedorId') is distinct from auth.uid()::text then raise exception 'Só o vendedor responsável responde'; end if;
  if c.status = 'concluida' then raise exception 'Este atendimento já foi finalizado'; end if;
  if length(tx) < 3 then raise exception 'Escreva o que foi feito'; end if;
  r := coalesce(c.tratativa->'erroVenda'->'respostas', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('texto', left(tx, 1000), 'em', now()));
  update public.chamados set tratativa = jsonb_set(coalesce(tratativa, '{}'::jsonb), '{erroVenda}', coalesce(tratativa->'erroVenda', '{}'::jsonb) || jsonb_build_object('respostas', r, 'respondidoEm', now())),
    status = case when status = 'aberta' then 'tratativa' else status end
  where id = p_id;
  perform public._reg(p_id, '💬 Tratativa do vendedor ' || public._nome(auth.uid()) || ': ' || left(tx, 400));
  perform public._notificar(array(select us.usuario_id from public.usuario_setores us join public.usuarios u on u.id = us.usuario_id where us.setor_id = 'supervisao' and u.ativo),
    '💬 Vendedor respondeu o erro de venda', public._nome(auth.uid()) || ' · ' || c.cliente || ' · ' || left(tx, 100), p_id, 'errovresp:' || p_id || ':' || extract(epoch from now())::bigint);
end $$;
revoke all on function public.erro_venda_responder(text, text) from public, anon;
grant execute on function public.erro_venda_responder(text, text) to authenticated;

-- o vendedor vê o erro de venda que é dele
do $$ declare f text; begin
  f := pg_get_functiondef('public.pode_ver_chamado_ctx(public.chamados, jsonb)'::regprocedure);
  if position('erroVenda' in f) = 0 then
    if position('or coalesce(c.medidor_id = (x->>''uid'')::uuid, false)
      or exists' in f) = 0 then raise exception 'âncora não encontrada (ctx)'; end if;
    f := replace(f, 'or coalesce(c.medidor_id = (x->>''uid'')::uuid, false)
      or exists', 'or coalesce(c.medidor_id = (x->>''uid'')::uuid, false)
      or (c.tipo = ''erro_venda'' and c.tratativa->''erroVenda''->>''vendedorId'' = x->>''uid'')
      or exists');
    execute f;
  end if;
end $$;

-- o banco garante: desmontagem e erro de venda só a Supervisão (Salete) / Gestão finalizam; desmontagem só depois de enviada ao estofador
create or replace function public._trg_finalizar_supervisao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'concluida' and old.status is distinct from 'concluida' and new.tipo in ('desmontagem_estofado', 'erro_venda') and auth.uid() is not null then
    if not (public.eh_gestao() or 'supervisao' = any(public.meus_setores())) then
      raise exception 'Só a Supervisão (Salete) finaliza este atendimento';
    end if;
    if new.tipo = 'desmontagem_estofado' and coalesce((new.tratativa->>'estofadorEnviado')::boolean, false) is not true then
      raise exception 'Marque primeiro "Solicitação enviada para o estofador"';
    end if;
  end if;
  return new;
end $$;

create or replace trigger trg_finalizar_supervisao before update of status on public.chamados
  for each row execute function public._trg_finalizar_supervisao();
