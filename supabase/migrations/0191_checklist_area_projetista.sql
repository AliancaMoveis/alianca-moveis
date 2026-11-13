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
-- Etapas (aba Checklist): 1 ambientes da venda · 2 conferência por ambiente · 3 gerar impressão (PDF único) · 4 subir assinado · 5 marcar realizado
-- tratativa.checklist.termo = { iniciadoEm, iniciadoPor, ambientesConfirmados,
--   ambientes[{nome, origem, escritoPor, caixa{mat,esp}, porta{mat,esp,vidro,naoSeAplica}, cor, codigos[], itens[], conferir[], ficha{}, fichaObs, obs, imagens[], listagens[]}],
--   naoInclusos[], obs, ferragens[], arquivos[], listagem{cliente, projeto, data},
--   impressao{em, por, paginas}, assinados[{nome, path, em, por, exact}], salvoEm, salvoPor, finalizadoEm, finalizadoPor }

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

-- agenda do projetista: checklists agendados/realizados e reservas (horário oferecido, aguardando o cliente) — sem valores
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
    select jsonb_agg(x order by coalesce(x->>'agendadoPara', x->>'proposta')) from (
      select jsonb_build_object(
        'id', c.id, 'cliente', c.cliente, 'pedido', c.pedido, 'telefone', c.telefone, 'status', c.status,
        'etapa', coalesce(k->>'etapa', 'a_contatar'), 'agendadoPara', k->>'agendadoPara', 'duracaoMin', k->'duracaoMin',
        'projetista', k->>'projetista', 'diasExtras', k->'diasExtras', 'confirmacao', coalesce(k->>'confirmacao', ''),
        'proposta', case when k->>'etapa' = 'aguardando' then k->>'proposta' end, 'propostaDiasExtras', k->'propostaDiasExtras',
        'propostaProjetista', k->>'propostaProjetista', 'ultimoContato', k->>'ultimoContato',
        'telefone2', k->>'telefone2', 'local', k->'local', 'ambiente', k->>'ambiente', 'encaixe', k->'encaixe',
        'medidaId', k->'medidaId', 'medidaOk', k->'medidaOk', 'realizadoEm', k->>'realizadoEm',
        'vendedor', k->'planilha'->>'vendedor', 'medidor', k->'planilha'->>'medidor', 'minhaVisita', k->'planilha'->>'minhaVisita',
        'medida', (select jsonb_build_object('etapa', coalesce(m.tratativa->'medida'->>'etapa', case when m.status = 'concluida' then 'liberada' else 'validar' end),
                     'medidor', public._nome(m.medidor_id), 'obs', nullif(btrim(coalesce(m.tratativa->'medida'->>'obs', '')), ''), 'em', m.criado_em)
                   from public.chamados m where m.tipo = 'medidas' and m.pedido = c.pedido order by m.criado_em desc limit 1),
        'historico', (select coalesce(jsonb_agg(jsonb_build_object('quando', h.quando, 'quem', h.quem_nome, 'texto', h.texto) order by h.quando desc), '[]'::jsonb)
                      from (select * from public.historico h0 where h0.chamado_id = c.id order by h0.quando desc limit 40) h),
        'termo', k->'termo') x
      from public.chamados c, lateral (select coalesce(c.tratativa->'checklist', '{}'::jsonb) k) kk
      where c.tipo = 'checklist'
        and ((coalesce(k->>'etapa', '') in ('agendado', 'realizado') and public._ck_do_projetista(k, alvo)
              and exists (select 1 from (select nullif(k->>'agendadoPara', '')::timestamp t
                                         union all select nullif(e->>'data', '')::timestamp
                                           from jsonb_array_elements(case when jsonb_typeof(k->'diasExtras') = 'array' then k->'diasExtras' else '[]'::jsonb end) e) d
                           where d.t::date between de and ate))
          or (c.status <> 'concluida' and k->>'etapa' = 'aguardando' and coalesce(k->>'propostaProjetista', '') = alvo
              and nullif(k->>'proposta', '')::timestamp::date between de and ate))
    ) s), '[]'::jsonb);
end $$;
revoke all on function public.ck_projetista_agenda(text, date, date) from public, anon;
grant execute on function public.ck_projetista_agenda(text, date, date) to authenticated;

-- contexto para a função "exact" (arquivos da venda, fotos da medição, anexos do 360, envio do assinado):
-- confere a permissão de quem chama e devolve a venda, o ticket do Exact e os chamados do 360 ligados a ela
create or replace function public.ck_projetista_contexto(p_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.chamados; k jsonb; eu text := public._ck_meu_projetista();
begin
  select * into c from public.chamados where id = p_id;
  if not found or c.tipo <> 'checklist' then raise exception 'Checklist não encontrado'; end if;
  k := coalesce(c.tratativa->'checklist', '{}'::jsonb);
  if not public.pode_checklist() and not (eu is not null and (public._ck_do_projetista(k, eu) or coalesce(k->>'propostaProjetista', '') = eu)) then
    raise exception 'Este checklist não está na sua agenda';
  end if;
  return jsonb_build_object('id', c.id, 'pedido', c.pedido, 'usuario', auth.uid(), 'nome', public._nome(auth.uid()),
    'ticketId', (select t.ticket_id from public.exact_ticket t where t.sale_id = c.pedido),
    'medidas', (select coalesce(jsonb_agg(m.id), '[]'::jsonb) from public.chamados m where m.tipo = 'medidas' and m.pedido = c.pedido),
    'venda', c.vinculado_a);
end $$;
revoke all on function public.ck_projetista_contexto(text) from public, anon;
grant execute on function public.ck_projetista_contexto(text) to authenticated;

drop function if exists public.ck_projetista_salvar(text, jsonb, boolean);
-- salva o checklist do projetista. p_acao: salvar · iniciar · impressao · assinado · realizado
--   realizado só com a impressão gerada e o digitalizado assinado anexado
create or replace function public.ck_projetista_salvar(p_id text, p jsonb, p_acao text default 'salvar') returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados; k jsonb; t0 jsonb; eu text := public._ck_meu_projetista(); t jsonb; n int; quem text := public._nome(auth.uid());
        acao text := coalesce(nullif(p_acao, ''), 'salvar'); txt text;
begin
  if acao not in ('salvar', 'iniciar', 'impressao', 'assinado', 'realizado') then raise exception 'Ação inválida'; end if;
  select * into c from public.chamados where id = p_id for update;
  if not found or c.tipo <> 'checklist' then raise exception 'Checklist não encontrado'; end if;
  k := coalesce(c.tratativa->'checklist', '{}'::jsonb); t0 := coalesce(k->'termo', '{}'::jsonb);
  if not public.pode_checklist() and not (eu is not null and public._ck_do_projetista(k, eu)) then
    raise exception 'Este checklist não está na sua agenda';
  end if;
  if coalesce(k->>'etapa', '') not in ('agendado', 'realizado') then raise exception 'O checklist precisa estar agendado'; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'Dados do checklist inválidos'; end if;
  if length(p::text) > 600000 then raise exception 'Checklist grande demais — divida a listagem por ambiente'; end if;
  if jsonb_typeof(p->'ambientes') <> 'array' then p := p || jsonb_build_object('ambientes', coalesce(t0->'ambientes', '[]'::jsonb)); end if;
  n := jsonb_array_length(p->'ambientes');
  if acao in ('impressao', 'realizado') and n = 0 then raise exception 'Escreva pelo menos um ambiente'; end if;
  if acao in ('impressao', 'realizado') and exists (select 1 from jsonb_array_elements(p->'ambientes') a where btrim(coalesce(a->>'nome', '')) = '') then
    raise exception 'Dê nome a todos os ambientes';
  end if;
  -- só o que é do checklist (sem valores): descarta qualquer outra chave que venha do navegador
  t := jsonb_build_object(
    'ambientes', (select coalesce(jsonb_agg(jsonb_build_object(
        'nome', btrim(coalesce(a->>'nome', '')), 'origem', coalesce(a->>'origem', ''), 'escritoPor', coalesce(a->>'escritoPor', ''),
        'caixa', coalesce(a->'caixa', '{}'::jsonb), 'porta', coalesce(a->'porta', '{}'::jsonb),
        'cor', coalesce(a->>'cor', ''), 'codigos', coalesce(a->'codigos', '[]'::jsonb), 'conferir', coalesce(a->'conferir', '[]'::jsonb),
        'ficha', coalesce(a->'ficha', '{}'::jsonb), 'obs', coalesce(a->>'obs', ''), 'itensDe', a->'itensDe',
        'imagens', (select coalesce(jsonb_agg(jsonb_build_object('fonte', i->>'fonte', 'id', i->>'id', 'url', i->>'url', 'path', i->>'path', 'nome', i->>'nome')), '[]'::jsonb)
                    from jsonb_array_elements(case when jsonb_typeof(a->'imagens') = 'array' then a->'imagens' else '[]'::jsonb end) i),
        'listagens', coalesce(a->'listagens', '[]'::jsonb),
        'itens', (select coalesce(jsonb_agg(jsonb_build_object('item', l->'item', 'qtd', l->>'qtd', 'ref', l->>'ref', 'descricao', l->>'descricao',
                    'medidas', l->>'medidas', 'linha', l->>'linha', 'tipo', l->>'tipo', 'material', l->'material', 'espessura', l->'espessura',
                    'cor', l->'cor', 'acabamento', l->'acabamento')), '[]'::jsonb)
                  from jsonb_array_elements(case when jsonb_typeof(a->'itens') = 'array' then a->'itens' else '[]'::jsonb end) l)) order by o.i), '[]'::jsonb)
      from jsonb_array_elements(p->'ambientes') with ordinality o(a, i)),
    'ambientesConfirmados', coalesce((p->>'ambientesConfirmados')::boolean, false),
    'naoInclusos', coalesce(p->'naoInclusos', t0->'naoInclusos', '[]'::jsonb), 'obs', btrim(coalesce(p->>'obs', t0->>'obs', '')),
    'ferragens', coalesce(p->'ferragens', t0->'ferragens', '[]'::jsonb), 'arquivos', coalesce(p->'arquivos', t0->'arquivos', '[]'::jsonb),
    'listagem', jsonb_build_object('cliente', p->'listagem'->>'cliente', 'projeto', p->'listagem'->>'projeto', 'data', p->'listagem'->>'data'),
    'iniciadoEm', t0->'iniciadoEm', 'iniciadoPor', t0->'iniciadoPor',
    'impressao', t0->'impressao', 'assinados', coalesce(t0->'assinados', '[]'::jsonb),
    'salvoEm', now(), 'salvoPor', quem, 'finalizadoEm', t0->'finalizadoEm', 'finalizadoPor', t0->'finalizadoPor');
  case acao
    when 'iniciar' then
      if t0->>'iniciadoEm' is null then t := t || jsonb_build_object('iniciadoEm', now(), 'iniciadoPor', quem); txt := '▶ Checklist iniciado por ' || quem; end if;
    when 'impressao' then
      if exists (select 1 from jsonb_array_elements(t->'ambientes') a where jsonb_array_length(coalesce(a->'conferir', '[]'::jsonb)) > 0) then
        raise exception 'Ainda há itens em amarelo (conferir) — preencha antes de gerar a impressão';
      end if;
      t := t || jsonb_build_object('impressao', jsonb_build_object('em', now(), 'por', quem, 'paginas', p->'impressao'->'paginas'));
      txt := '🖨 Impressão do checklist gerada por ' || quem || ' (' || n || ' ambiente' || case when n = 1 then '' else 's' end || ')';
    when 'assinado' then
      if jsonb_typeof(p->'assinado') <> 'object' or coalesce(p->'assinado'->>'path', '') = '' then raise exception 'Anexe o digitalizado assinado'; end if;
      t := t || jsonb_build_object('assinados', coalesce(t0->'assinados', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
             'nome', p->'assinado'->>'nome', 'path', p->'assinado'->>'path', 'em', now(), 'por', quem, 'exact', p->'assinado'->'exact')));
      txt := '📎 Digitalizado assinado anexado: ' || coalesce(p->'assinado'->>'nome', 'arquivo')
             || case when coalesce((p->'assinado'->>'exact')::boolean, false) then ' · enviado ao Exact (Outros)' else ' · NÃO foi para o Exact' end;
    when 'realizado' then
      if t0->'impressao' is null then raise exception 'Gere a impressão antes de marcar realizado'; end if;
      if jsonb_array_length(coalesce(t0->'assinados', '[]'::jsonb)) = 0 then raise exception 'Anexe o digitalizado assinado antes de marcar realizado'; end if;
      t := t || jsonb_build_object('finalizadoEm', now(), 'finalizadoPor', quem);
      txt := '✅ Checklist realizado pelo projetista ' || coalesce(eu, quem) || ' — ' || n || ' ambiente' || case when n = 1 then '' else 's' end;
    else null;
  end case;
  k := k || jsonb_build_object('termo', t);
  if acao = 'realizado' and coalesce(k->>'etapa', '') <> 'realizado' then
    k := k || jsonb_build_object('etapa', 'realizado', 'realizadoEm', now(), 'realizadoPor', quem);
  end if;
  update public.chamados set tratativa = jsonb_set(coalesce(tratativa, '{}'::jsonb), '{checklist}', k),
    status = case when acao = 'realizado' then 'concluida'::public.status_chamado else status end
   where id = p_id;
  if txt is not null then perform public._reg(p_id, txt); end if;
end $$;
revoke all on function public.ck_projetista_salvar(text, jsonb, text) from public, anon;
grant execute on function public.ck_projetista_salvar(text, jsonb, text) to authenticated;

-- arquivos que o checklist sobe (digitalizado assinado, imagens do projeto, listagem, .promob): bucket privado próprio,
-- gravado só pela função "checklist-arquivos" (chave de serviço). O setor Checklist e a Gestão leem.
insert into storage.buckets (id, name, public, file_size_limit) values ('checklist', 'checklist', false, 52428800) on conflict (id) do nothing;
drop policy if exists checklist_storage_ler on storage.objects;
create policy checklist_storage_ler on storage.objects for select to authenticated using (bucket_id = 'checklist' and (select public.pode_checklist()));

select 'ok — área do projetista do checklist' as resultado;
