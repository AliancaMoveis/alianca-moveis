-- Jurídico: casos delicados (reclamações, Reclame Aqui, Procon, processos). Só o Jurídico e a Gestão veem e abrem.
insert into public.tipos (id, nome, ordem, anexos, direto, rapido, presale, setor_destino)
values ('juridico', 'Jurídico — reclamação / Reclame Aqui / processo', 12, true, false, false, false, 'juridico')
on conflict (id) do nothing;

-- visibilidade: caso jurídico só para o Jurídico e a Gestão (nem a supervisão nem o call center veem)
do $$ declare f text; begin
  f := pg_get_functiondef('public.pode_ver_chamado_ctx(public.chamados, jsonb)'::regprocedure);
  if position('c.tipo = ''juridico''' in f) = 0 then
    if position('select coalesce((x->>''ok'')::boolean, false) and coalesce(case' in f) = 0 or position('end, false);' in f) = 0 then raise exception 'âncora não encontrada'; end if;
    f := replace(f, 'select coalesce((x->>''ok'')::boolean, false) and coalesce(case',
      'select coalesce((x->>''ok'')::boolean, false) and case when c.tipo = ''juridico'' then coalesce((x->>''ges'')::boolean, false) or coalesce(x->''ms'' ? ''juridico'', false) else coalesce(case');
    f := replace(f, 'end, false);', 'end, false) end;');
    execute f;
  end if;
end $$;

create or replace function public.eh_juridico() returns boolean
language sql stable security definer set search_path to '' as $$ select public.eh_gestao() or 'juridico' = any(public.meus_setores()) $$;
grant execute on function public.eh_juridico() to authenticated;

-- o banco proíbe abrir caso jurídico fora do Jurídico/Gestão
create or replace function public._trg_juridico_so_setor() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.tipo = 'juridico' and auth.uid() is not null and not public.eh_juridico() then
    raise exception 'Só o Jurídico abre caso jurídico';
  end if;
  return new;
end $$;
create or replace trigger trg_juridico_so_setor before insert or update of tipo on public.chamados
  for each row execute function public._trg_juridico_so_setor();

-- dados do caso: categoria, protocolo, nº do processo, órgão/vara, prazo, valor, situação e informações sensíveis
create or replace function public.juridico_salvar(p_id text, p jsonb) returns void
language plpgsql security definer set search_path to '' as $$
declare c public.chamados; ant jsonb; novo jsonb; k text;
begin
  if not public.eh_juridico() then raise exception 'Só o Jurídico altera o caso'; end if;
  select * into c from public.chamados where id = p_id for update;
  if not found or c.tipo <> 'juridico' then raise exception 'Caso não encontrado'; end if;
  ant := coalesce(c.tratativa->'juridico', '{}'::jsonb); novo := ant;
  foreach k in array array['categoria','protocolo','processo','orgao','prazo','valor','situacao','resumo','parteContraria','link'] loop
    if p ? k then novo := novo || jsonb_build_object(k, left(btrim(coalesce(p->>k, '')), case when k = 'resumo' then 6000 else 300 end)); end if;
  end loop;
  if (novo->>'categoria') is not null and (novo->>'categoria') not in ('', 'reclame_aqui', 'procon', 'processo', 'reclamacao', 'notificacao', 'outro') then raise exception 'Categoria inválida'; end if;
  if (novo->>'situacao') is not null and (novo->>'situacao') not in ('', 'andamento', 'aguardando_cliente', 'aguardando_terceiro', 'acordo', 'encerrado') then raise exception 'Situação inválida'; end if;
  update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('juridico', novo),
    status = case when status = 'aberta' then 'tratativa'::public.status_chamado else status end
  where id = p_id;
  perform public._reg(p_id, '⚖️ Caso jurídico atualizado' || case when (novo->>'situacao') is distinct from (ant->>'situacao') and coalesce(novo->>'situacao', '') <> '' then ' · situação: ' || (novo->>'situacao') else '' end);
end $$;
revoke all on function public.juridico_salvar(text, jsonb) from public, anon;
grant execute on function public.juridico_salvar(text, jsonb) to authenticated;

-- abrir caso jurídico (cliente pode não ter venda/CPF; tudo opcional menos o nome e o resumo)
create or replace function public.juridico_criar(p jsonb) returns text
language plpgsql security definer set search_path to '' as $$
declare eu uuid := auth.uid(); novo text; pz date := nullif(p->>'prazo', '')::date;
begin
  if not public.eh_juridico() then raise exception 'Só o Jurídico abre caso jurídico'; end if;
  if length(btrim(coalesce(p->>'cliente', ''))) < 2 then raise exception 'Informe o nome do cliente / reclamante'; end if;
  if length(btrim(coalesce(p->>'motivo', ''))) < 3 then raise exception 'Descreva o caso'; end if;
  perform set_config('alianca.sistema', '1', true); -- telefone opcional no caso jurídico
  insert into public.chamados (tipo, setor_destino, status, sla_resposta, solicitante_id, solicitante_nome, solicitante_setor, cliente, cliente_doc, telefone, email, pedido, produto, motivo, vinculado_a, tratativa)
  values ('juridico', 'juridico', 'aberta', coalesce(pz::timestamp + interval '18 hours', now() + interval '15 days'), eu, public._nome(eu), 'Jurídico',
          btrim(p->>'cliente'), coalesce(p->>'clienteDoc', ''), coalesce(p->>'telefone', ''), coalesce(p->>'email', ''), coalesce(p->>'pedido', ''),
          coalesce(nullif(p->>'categoriaNome', ''), 'Jurídico'), btrim(p->>'motivo'), nullif(p->>'vinculadoA', ''),
          jsonb_build_object('juridico', jsonb_build_object('categoria', coalesce(p->>'categoria', ''), 'protocolo', coalesce(p->>'protocolo', ''), 'processo', coalesce(p->>'processo', ''),
            'orgao', coalesce(p->>'orgao', ''), 'prazo', coalesce(p->>'prazo', ''), 'valor', coalesce(p->>'valor', ''), 'situacao', 'andamento', 'resumo', coalesce(p->>'resumo', ''), 'parteContraria', coalesce(p->>'parteContraria', ''), 'link', coalesce(p->>'link', ''))))
  returning id into novo;
  perform set_config('alianca.sistema', '0', true);
  insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (novo, eu, public._nome(eu), '⚖️ Caso jurídico aberto');
  return novo;
end $$;
revoke all on function public.juridico_criar(jsonb) from public, anon;
grant execute on function public.juridico_criar(jsonb) to authenticated;
