-- 0191: Checklist · ÁREA DO PROJETISTA
-- O projetista do checklist (Silvane, Rafael, Angela…) entra no 360 e vê só a agenda DELE: os clientes do dia, os próximos e os já feitos.
-- Ao atender, anexa a listagem do Promob (PDF): o 360 lê no navegador e guarda SÓ material, espessura, cor, módulos e medidas —
-- nenhum valor (preço, desconto, condição de pagamento) é gravado, e o PDF em si não é guardado.
-- Com isso monta o TERMO DE CIÊNCIA por ambiente (para o cliente assinar) e finaliza o checklist (etapa "realizado").
--
-- Quem é projetista: acesso extra "projetista_checklist" no cadastro do usuário (Cadastros › Usuários › Acessos extras).
--   O nome do usuário (nome, primeiro nome ou nome completo) é casado com a lista de projetistas da agenda do checklist
--   (config.checklist_agenda.projetistas), ignorando acento e maiúscula.
-- Setor Checklist e Gestão veem a área de qualquer projetista (para conferir e ajudar).
--
-- tratativa.checklist.termo = { ambientes[{nome, caixa{mat,esp}, porta{mat,esp,vidro,naoSeAplica}, cor, itens[], conferir[]}],
--   naoInclusos[], obs, ferragens[], arquivos[], listagem{cliente, projeto, data}, salvoEm, salvoPor, finalizadoEm, finalizadoPor }

-- nome do projetista (da lista da agenda) ligado ao usuário logado; null se não for projetista
create or replace function public._ck_meu_projetista() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(public._ck_nome_proj(u.nome), public._ck_nome_proj(split_part(btrim(u.nome), ' ', 1)), public._ck_nome_proj(u.nome_completo))
    from public.usuarios u
   where u.id = auth.uid() and u.ativo
     and exists (select 1 from public.usuario_acessos a where a.usuario_id = u.id and a.acesso = 'projetista_checklist');
$$;
revoke all on function public._ck_meu_projetista() from public, anon, authenticated;

-- o checklist tem o projetista em algum dos dias (principal ou adicionais)?
create or replace function public._ck_do_projetista(k jsonb, p_nome text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(k->>'projetista', '') = p_nome
      or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(k->'diasExtras') = 'array' then k->'diasExtras' else '[]'::jsonb end) e
                  where coalesce(nullif(e->>'projetista', ''), k->>'projetista', '') = p_nome);
$$;
revoke all on function public._ck_do_projetista(jsonb, text) from public, anon;

-- quem sou eu na área do projetista: { projetista, podeTodos, projetistas[] }
create or replace function public.ck_projetista_eu() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare eu text := public._ck_meu_projetista(); todos boolean := public.pode_checklist();
begin
  if eu is null and not todos then return jsonb_build_object('projetista', null, 'podeTodos', false, 'projetistas', '[]'::jsonb); end if;
  return jsonb_build_object('projetista', eu, 'podeTodos', todos,
    'projetistas', case when todos then (select coalesce(checklist_agenda->'projetistas', '[]'::jsonb) from public.config where id = 1) else to_jsonb(array[eu]) end);
end $$;
revoke all on function public.ck_projetista_eu() from public, anon;
grant execute on function public.ck_projetista_eu() to authenticated;

-- agenda do projetista: checklists agendados/realizados em que ele atende algum dia no período (sem valores)
create or replace function public.ck_projetista_agenda(p_proj text default null, p_de date default null, p_ate date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare eu text := public._ck_meu_projetista(); alvo text; de date; ate date;
begin
  if public.pode_checklist() then alvo := coalesce(nullif(btrim(p_proj), ''), eu);
  elsif eu is not null then alvo := eu;            -- projetista só vê a própria agenda
  else raise exception 'Só o projetista do checklist (ou o setor Checklist / Gestão) abre esta área'; end if;
  if alvo is null then raise exception 'Escolha o projetista'; end if;
  de := coalesce(p_de, (now() at time zone 'America/Sao_Paulo')::date - 30);
  ate := coalesce(p_ate, (now() at time zone 'America/Sao_Paulo')::date + 60);
  return coalesce((
    select jsonb_agg(x order by x->>'agendadoPara') from (
      select jsonb_build_object(
        'id', c.id, 'cliente', c.cliente, 'pedido', c.pedido, 'telefone', c.telefone, 'status', c.status,
        'etapa', coalesce(k->>'etapa', 'a_contatar'), 'agendadoPara', k->>'agendadoPara', 'duracaoMin', k->'duracaoMin',
        'projetista', k->>'projetista', 'diasExtras', k->'diasExtras', 'confirmacao', coalesce(k->>'confirmacao', ''),
        'telefone2', k->>'telefone2', 'local', k->'local', 'ambiente', k->>'ambiente', 'encaixe', k->'encaixe',
        'medidaId', k->'medidaId', 'medidaOk', k->'medidaOk', 'realizadoEm', k->>'realizadoEm',
        'vendedor', k->'planilha'->>'vendedor', 'medidor', k->'planilha'->>'medidor', 'minhaVisita', k->'planilha'->>'minhaVisita',
        'termo', k->'termo') x
      from public.chamados c, lateral (select coalesce(c.tratativa->'checklist', '{}'::jsonb) k) kk
      where c.tipo = 'checklist'
        and coalesce(k->>'etapa', '') in ('agendado', 'realizado')
        and public._ck_do_projetista(k, alvo)
        and exists (select 1 from (select nullif(k->>'agendadoPara', '')::timestamp t
                                   union all select nullif(e->>'data', '')::timestamp
                                     from jsonb_array_elements(case when jsonb_typeof(k->'diasExtras') = 'array' then k->'diasExtras' else '[]'::jsonb end) e) d
                     where d.t::date between de and ate)
    ) s), '[]'::jsonb);
end $$;
revoke all on function public.ck_projetista_agenda(text, date, date) from public, anon;
grant execute on function public.ck_projetista_agenda(text, date, date) to authenticated;

-- salva o checklist do projetista (rascunho) e, com p_finalizar, marca o checklist como realizado
create or replace function public.ck_projetista_salvar(p_id text, p jsonb, p_finalizar boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados; k jsonb; eu text := public._ck_meu_projetista(); t jsonb; n int; quem text := public._nome(auth.uid());
begin
  select * into c from public.chamados where id = p_id for update;
  if not found or c.tipo <> 'checklist' then raise exception 'Checklist não encontrado'; end if;
  k := coalesce(c.tratativa->'checklist', '{}'::jsonb);
  if not public.pode_checklist() and not (eu is not null and public._ck_do_projetista(k, eu)) then
    raise exception 'Este checklist não está na sua agenda';
  end if;
  if coalesce(k->>'etapa', '') not in ('agendado', 'realizado') then raise exception 'O checklist precisa estar agendado'; end if;
  if jsonb_typeof(p) <> 'object' or jsonb_typeof(p->'ambientes') <> 'array' then raise exception 'Dados do checklist inválidos'; end if;
  if length(p::text) > 400000 then raise exception 'Checklist grande demais — divida a listagem por ambiente'; end if;
  n := jsonb_array_length(p->'ambientes');
  if p_finalizar and n = 0 then raise exception 'Informe pelo menos um ambiente (anexe a listagem do Promob)'; end if;
  if p_finalizar and exists (select 1 from jsonb_array_elements(p->'ambientes') a where btrim(coalesce(a->>'nome', '')) = '') then
    raise exception 'Dê nome a todos os ambientes';
  end if;
  -- só o que é do termo (sem valores): descarta qualquer outra chave que venha do navegador
  t := jsonb_build_object(
    'ambientes', (select coalesce(jsonb_agg(jsonb_build_object(
        'nome', btrim(coalesce(a->>'nome', '')), 'caixa', coalesce(a->'caixa', '{}'::jsonb), 'porta', coalesce(a->'porta', '{}'::jsonb),
        'cor', coalesce(a->>'cor', ''), 'conferir', coalesce(a->'conferir', '[]'::jsonb),
        'itens', (select coalesce(jsonb_agg(jsonb_build_object('item', l->'item', 'qtd', l->>'qtd', 'ref', l->>'ref', 'descricao', l->>'descricao',
                    'medidas', l->>'medidas', 'linha', l->>'linha', 'tipo', l->>'tipo', 'material', l->'material', 'espessura', l->'espessura',
                    'cor', l->'cor', 'acabamento', l->'acabamento')), '[]'::jsonb)
                  from jsonb_array_elements(case when jsonb_typeof(a->'itens') = 'array' then a->'itens' else '[]'::jsonb end) l))), '[]'::jsonb)
      from jsonb_array_elements(p->'ambientes') a),
    'naoInclusos', coalesce(p->'naoInclusos', '[]'::jsonb), 'obs', btrim(coalesce(p->>'obs', '')), 'ferragens', coalesce(p->'ferragens', '[]'::jsonb),
    'arquivos', coalesce(p->'arquivos', '[]'::jsonb),
    'listagem', jsonb_build_object('cliente', p->'listagem'->>'cliente', 'projeto', p->'listagem'->>'projeto', 'data', p->'listagem'->>'data'),
    'salvoEm', now(), 'salvoPor', quem,
    'finalizadoEm', case when p_finalizar then to_jsonb(now()) else k->'termo'->'finalizadoEm' end,
    'finalizadoPor', case when p_finalizar then to_jsonb(quem) else k->'termo'->'finalizadoPor' end);
  k := k || jsonb_build_object('termo', t);
  if p_finalizar and coalesce(k->>'etapa', '') <> 'realizado' then
    k := k || jsonb_build_object('etapa', 'realizado', 'realizadoEm', now(), 'realizadoPor', quem);
  end if;
  update public.chamados set tratativa = jsonb_set(coalesce(tratativa, '{}'::jsonb), '{checklist}', k),
    status = case when p_finalizar then 'concluida'::public.status_chamado else status end
   where id = p_id;
  if p_finalizar then
    perform public._reg(p_id, '✅ Checklist realizado pelo projetista ' || coalesce(eu, quem) || ' — termo de ciência gerado com ' || n || ' ambiente' || case when n = 1 then '' else 's' end
      || case when jsonb_array_length(t->'arquivos') > 0 then ' (listagem: ' || (select string_agg(x, ', ') from jsonb_array_elements_text(t->'arquivos') x) || ')' else '' end);
  end if;
end $$;
revoke all on function public.ck_projetista_salvar(text, jsonb, boolean) from public, anon;
grant execute on function public.ck_projetista_salvar(text, jsonb, boolean) to authenticated;

select 'ok — área do projetista do checklist' as resultado;
