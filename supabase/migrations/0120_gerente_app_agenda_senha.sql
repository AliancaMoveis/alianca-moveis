-- 0120 · Gerentes de loja (app simplificado) + agenda da loja (busca, senha ao assumir, reassumir após 2 chamadas)

-- 1) Gerente de loja não vê valores de venda nem pagamentos do marketing
CREATE OR REPLACE FUNCTION public.pode_ver_valor_ctx(c chamados, x jsonb)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select coalesce((x->>'ok')::boolean, false) and ((x->>'ges')::boolean
    or coalesce(c.atendente_id = (x->>'uid')::uuid, false) or coalesce(c.consultor_id = (x->>'uid')::uuid, false));
$function$;

CREATE OR REPLACE FUNCTION public.pode_ver_valor_id(p_id text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select (public.usuario_ativo() and public.pode_ver_id(p_id) and (
    public.eh_gestao()
    or exists (select 1 from public.chamados c where c.id = p_id
               and (c.atendente_id = auth.uid() or c.consultor_id = auth.uid())))) is true;
$function$;

CREATE OR REPLACE FUNCTION public.ve_mkt_pagamento()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select public.usuario_ativo() and (public.eh_gestao() or public.meus_setores() && array['marketing_operadora','marketing_supervisao']);
$function$;

-- 2) Gerente de loja abre solicitação do call center (direcionada ao setor do motivo)
CREATE OR REPLACE FUNCTION public.pode_criar_tipo(p_tipo text)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare ms text[]; t public.tipos;
begin
  select * into t from public.tipos where id = p_tipo;
  if not found then return false; end if;
  if not public.tem_lib('criar') then return false; end if;
  if public.eh_gestao() then return true; end if;
  ms := public.meus_setores();
  if t.presale then
    return ms && array['marketing_operadora','marketing_supervisao','consultor_externo'];
  end if;
  return 'gerente_loja' = any(ms) or exists (select 1 from unnest(ms) s where not (s = any(public.setores_marketing())));
end $function$;

-- 3) Disponibilidade do vendedor agora: '' = disponível; senão o motivo (folga, ainda não entrou, almoço)
CREATE OR REPLACE FUNCTION public._vend_motivo_indisp(p uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  with a as (select (now() at time zone 'America/Sao_Paulo') t)
  select case
    when not public._eh_projetista_valido(p) then 'inativo'
    when u.folga is not null and extract(dow from a.t)::int = u.folga then 'folga'
    when u.turno = 'manha' and (extract(hour from a.t) * 60 + extract(minute from a.t)) < 540 then 'ainda não entrou'
    when u.turno = 'manha' and (extract(hour from a.t) * 60 + extract(minute from a.t)) >= 660 and (extract(hour from a.t) * 60 + extract(minute from a.t)) < 780 then 'almoço'
    when u.turno = 'tarde' and (extract(hour from a.t) * 60 + extract(minute from a.t)) < 640 then 'ainda não entrou'
    when u.turno = 'tarde' and (extract(hour from a.t) * 60 + extract(minute from a.t)) >= 810 and (extract(hour from a.t) * 60 + extract(minute from a.t)) < 930 then 'almoço'
    else '' end
  from public.usuarios u, a where u.id = p;
$function$;

-- registro das chamadas feitas pelos gerentes
CREATE TABLE IF NOT EXISTS public.vendedor_chamadas (
  id bigserial primary key,
  por uuid not null,
  por_nome text not null default '',
  para uuid,
  todos boolean not null default false,
  obs text not null default '',
  chamados int not null default 1,
  quando timestamptz not null default now()
);
ALTER TABLE public.vendedor_chamadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendedor_chamadas FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._pode_chamar_vendedor()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select public.usuario_ativo() and (public.eh_gestao() or 'gerente_loja' = any(public.meus_setores()));
$function$;

-- 4) Chamar um vendedor (apita no app dele)
CREATE OR REPLACE FUNCTION public.chamar_vendedor(p_vendedor uuid, p_obs text DEFAULT '')
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare eu public.usuarios := public._eu(); obs text := left(btrim(coalesce(p_obs, '')), 140); mot text;
begin
  if not public._pode_chamar_vendedor() then raise exception 'Só os gerentes de loja chamam vendedores'; end if;
  if p_vendedor is null or not public._eh_projetista_valido(p_vendedor) then raise exception 'Escolha um vendedor da lista'; end if;
  if exists (select 1 from public.vendedor_chamadas v where v.para = p_vendedor and v.quando > now() - interval '1 minute') then
    raise exception '% já foi chamado(a) agora há pouco — aguarde 1 minuto para chamar de novo', public._nome(p_vendedor);
  end if;
  mot := public._vend_motivo_indisp(p_vendedor);
  insert into public.notificacoes (usuario_id, titulo, corpo, chamado_id, chave)
  values (p_vendedor, '📣 ' || split_part(eu.nome, ' ', 1) || ' está te chamando', coalesce(nullif(obs, ''), 'Vá até a gerência agora.'), null,
          'chamar:' || p_vendedor || ':' || extract(epoch from clock_timestamp())::bigint);
  insert into public.vendedor_chamadas (por, por_nome, para, todos, obs) values (eu.id, eu.nome, p_vendedor, false, obs);
  return jsonb_build_object('nome', public._nome(p_vendedor), 'motivo', mot);
end $function$;

-- 5) Chamar todos os vendedores disponíveis para a fila (URGENTE) — sem folga, almoço ou fora do horário
CREATE OR REPLACE FUNCTION public.chamar_vendedores_fila(p_obs text DEFAULT '')
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare eu public.usuarios := public._eu(); obs text := left(btrim(coalesce(p_obs, '')), 140); ids uuid[]; fora jsonb; ep bigint := extract(epoch from clock_timestamp())::bigint;
begin
  if not public._pode_chamar_vendedor() then raise exception 'Só os gerentes de loja chamam vendedores'; end if;
  if exists (select 1 from public.vendedor_chamadas v where v.todos and v.quando > now() - interval '2 minutes') then
    raise exception 'Os vendedores já foram chamados para a fila há menos de 2 minutos';
  end if;
  select array_agg(u.id order by u.nome) into ids from public.usuarios u
   where public._eh_projetista_valido(u.id) and public._vend_motivo_indisp(u.id) = '';
  select coalesce(jsonb_agg(jsonb_build_object('nome', u.nome, 'motivo', public._vend_motivo_indisp(u.id)) order by u.nome), '[]'::jsonb) into fora
    from public.usuarios u where public._eh_projetista_valido(u.id) and public._vend_motivo_indisp(u.id) <> '';
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Nenhum vendedor disponível agora (folga, almoço ou fora do horário)'; end if;
  insert into public.notificacoes (usuario_id, titulo, corpo, chamado_id, chave)
  select x, '🚨 URGENTE — venha para a fila!', split_part(eu.nome, ' ', 1) || ' está chamando todos os vendedores disponíveis.' || coalesce(' ' || nullif(obs, ''), ''), null, 'fila:' || ep || ':' || x
    from unnest(ids) x;
  insert into public.vendedor_chamadas (por, por_nome, para, todos, obs, chamados) values (eu.id, eu.nome, null, true, obs, array_length(ids, 1));
  return jsonb_build_object('chamados', (select jsonb_agg(public._nome(x)) from unnest(ids) x), 'fora', fora);
end $function$;

-- 6) Senha do vendedor para assumir cliente na tela da loja (5 erros em 15 min bloqueiam)
CREATE TABLE IF NOT EXISTS public.agenda_senha_falhas (
  id bigserial primary key,
  vendedor uuid not null,
  quando timestamptz not null default now()
);
ALTER TABLE public.agenda_senha_falhas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agenda_senha_falhas FROM anon, authenticated;

-- devolve '' se a senha confere; senão a mensagem de erro (e registra a falha)
CREATE OR REPLACE FUNCTION public._senha_vendedor(p uuid, p_senha text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  if (select count(*) from public.agenda_senha_falhas f where f.vendedor = p and f.quando > now() - interval '15 minutes') >= 5 then
    return 'Muitas tentativas com senha errada — aguarde 15 minutos';
  end if;
  if coalesce(p_senha, '') <> '' and exists (select 1 from auth.users a where a.id = p and a.encrypted_password is not null
       and a.encrypted_password = extensions.crypt(p_senha, a.encrypted_password)) then
    return '';
  end if;
  insert into public.agenda_senha_falhas (vendedor) values (p);
  return 'Senha incorreta';
end $function$;
REVOKE ALL ON FUNCTION public._senha_vendedor(uuid, text) FROM public, anon, authenticated;

-- 7) Assumir cliente na tela da loja — com senha. Cliente com vendedor: só depois de chamar 2x e ele não aparecer (3 min após o 2º aviso)
CREATE OR REPLACE FUNCTION public.agenda_publica_assumir_v2(p_token text, p_id text, p_vendedor uuid, p_senha text, p_nome_outro text DEFAULT '')
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare c public.chamados; ch public.agenda_chegadas; hoje date := (now() at time zone 'America/Sao_Paulo')::date; nome text; outro text := btrim(coalesce(p_nome_outro, ''));
  ant uuid; erro text;
begin
  if p_token is null or length(p_token) < 40 or not exists (select 1 from public.agenda_publica a where a.id = 1 and a.ativo and a.token = p_token) then
    raise exception 'Link inválido ou desligado';
  end if;
  select * into c from public.chamados where id = p_id for update;
  if not found or not public.tipo_presale(c.tipo) or c.data_loja is null or c.data_loja::date <> hoje then raise exception 'Cliente não está na agenda de hoje'; end if;
  if nullif(c.tratativa->>'atendenteExterno', '') is not null then raise exception 'Este cliente já foi assumido por %', c.tratativa->>'atendenteExterno'; end if;
  if public._final_cliente(c) or exists (select 1 from public.vendas v where v.chamado_id = c.id) then raise exception 'Este atendimento já foi finalizado'; end if;

  if p_vendedor is null then
    -- freelancer / sem cadastro (não tem senha): só cliente da fila
    if c.atendente_id is not null or c.setor_destino <> 'suporte_consultores' then raise exception 'Este cliente já tem vendedor'; end if;
    if length(outro) < 2 then raise exception 'Escreva o seu nome'; end if;
    nome := left(outro, 60);
    update public.chamados set tratativa = (tratativa - 'pedidoAtend' - 'pedidoAtendNome' - 'pedidoAtendEm')
      || jsonb_build_object('assumidoFila', true, 'assumidoEm', now(), 'assumidoPor', nome, 'atendenteExterno', nome)
    where id = p_id;
    insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto)
    values (p_id, now(), null, 'Tela da loja', nome || ' (não cadastrado — "Outro"/freelancer) assumiu o atendimento pela tela da loja');
    perform public._notificar(public._usuarios_setor(array['suporte_consultores','marketing_supervisao','gerente_loja']), '⚠️ Cliente assumido por freelancer',
      nome || ' (sem cadastro) assumiu ' || c.cliente || ' pela tela da loja — verificar.', c.id, 'assumiu:' || c.id);
    return jsonb_build_object('nome', nome, 'externo', true);
  end if;

  if not public._eh_projetista_valido(p_vendedor) then raise exception 'Vendedor inválido'; end if;
  erro := public._senha_vendedor(p_vendedor, p_senha);
  if erro <> '' then return jsonb_build_object('erro', erro); end if;
  nome := public._nome(p_vendedor); ant := c.atendente_id;

  if ant is null then
    if c.setor_destino <> 'suporte_consultores' then raise exception 'Este cliente não está na fila'; end if;
    if (c.tratativa->>'pedidoAtend') is not null and (c.tratativa->>'pedidoAtend')::uuid <> p_vendedor then
      raise exception '% já pediu este cliente — fale com a coordenação', coalesce(c.tratativa->>'pedidoAtendNome', 'Outro vendedor');
    end if;
    update public.chamados set atendente_id = p_vendedor, setor_destino = 'atendente_cliente', status_cliente = 'com_vendedor',
      tratativa = (tratativa - 'pedidoAtend' - 'pedidoAtendNome' - 'pedidoAtendEm') || jsonb_build_object('assumidoFila', true, 'assumidoEm', now(), 'assumidoPor', nome),
      status = case when c.status = 'aberta' then 'tratativa'::public.status_chamado else c.status end
    where id = p_id;
    insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto)
    values (p_id, now(), p_vendedor, 'Tela da loja', nome || ' assumiu o atendimento pela tela da loja com a senha (cliente da fila, sem direcionamento)');
    perform public._notificar(public._usuarios_setor(array['suporte_consultores','marketing_supervisao','gerente_loja']), 'ℹ️ Cliente assumido da fila',
      nome || ' assumiu ' || c.cliente || ' pela tela da loja.', c.id, 'assumiu:' || c.id);
    return jsonb_build_object('nome', nome, 'externo', false);
  end if;

  if ant = p_vendedor then raise exception 'Você já é o vendedor deste cliente'; end if;
  -- cliente já tem vendedor: só se ele foi chamado 2x e não apareceu
  if c.tratativa ? 'emAtendimento' then raise exception 'O atendimento deste cliente já começou'; end if;
  select * into ch from public.agenda_chegadas where chamado_id = p_id;
  if not found or ch.vezes < 2 then raise exception 'Chame o vendedor % pelo menos 2 vezes antes de outro assumir', public._nome(ant); end if;
  if ch.avisado_em > now() - interval '3 minutes' then
    raise exception 'Aguarde % s depois da 2ª chamada — o vendedor pode estar a caminho', ceil(extract(epoch from (ch.avisado_em + interval '3 minutes' - now())))::int;
  end if;
  update public.chamados set atendente_id = p_vendedor, setor_destino = 'atendente_cliente',
    status_cliente = case when status_cliente::text in ('aguardando_consultor','visita_realizada','agendado_loja') or status_cliente is null then 'com_vendedor'::public.status_cliente else status_cliente end,
    tratativa = (tratativa - 'pedidoAtend' - 'pedidoAtendNome' - 'pedidoAtendEm') || jsonb_build_object('assumidoFila', true, 'assumidoEm', now(), 'assumidoPor', nome,
      'vendedorNaoApareceu', jsonb_build_object('de', ant, 'deNome', public._nome(ant), 'chamadas', ch.vezes, 'em', now()))
  where id = p_id;
  insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto)
  values (p_id, now(), p_vendedor, 'Tela da loja', nome || ' assumiu o atendimento com a senha: ' || public._nome(ant) || ' foi chamado(a) ' || ch.vezes || 'x e não apareceu');
  perform public._notificar(array[ant], '⚠️ Seu cliente foi assumido', c.cliente || ' chegou, você foi chamado(a) ' || ch.vezes || 'x e não apareceu — ' || nome || ' assumiu o atendimento.', c.id, 'naoapareceu:' || c.id || ':' || p_vendedor);
  perform public._notificar(public._usuarios_setor(array['suporte_consultores','marketing_supervisao','gerente_loja']), '🔁 Vendedor não apareceu',
    nome || ' assumiu ' || c.cliente || ' — ' || public._nome(ant) || ' foi chamado(a) ' || ch.vezes || 'x e não apareceu.', c.id, 'naoapareceu:' || c.id || ':' || p_vendedor);
  return jsonb_build_object('nome', nome, 'externo', false, 'trocou', true);
end $function$;

-- versão antiga (telas abertas antes da atualização): vendedor cadastrado agora precisa de senha
CREATE OR REPLACE FUNCTION public.agenda_publica_assumir(p_token text, p_id text, p_vendedor uuid, p_nome_outro text DEFAULT ''::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  if p_vendedor is not null then raise exception 'Atualize a página da agenda (agora o vendedor confirma com a senha)'; end if;
  return public.agenda_publica_assumir_v2(p_token, p_id, null, null, p_nome_outro);
end $function$;

-- 8) Ver imagens / assumir o projeto na tela da loja — trocar o projetista exige a senha
CREATE OR REPLACE FUNCTION public.agenda_publica_imagens_v2(p_token text, p_id text, p_vendedor uuid, p_assumir boolean DEFAULT false, p_senha text DEFAULT '')
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare c public.chamados; hoje date := (now() at time zone 'America/Sao_Paulo')::date; nome text; ant uuid; arqs jsonb; erro text;
begin
  if p_token is null or length(p_token) < 40 or not exists (select 1 from public.agenda_publica a where a.id = 1 and a.ativo and a.token = p_token) then
    raise exception 'Link inválido ou desligado';
  end if;
  select * into c from public.chamados where id = p_id for update;
  if not found or not public.tipo_presale(c.tipo) or c.data_loja is null or c.data_loja::date < hoje - 1 or c.data_loja::date > hoje + 7 then
    raise exception 'Cliente fora da agenda da loja';
  end if;
  if p_vendedor is null or not public._eh_projetista_valido(p_vendedor) then raise exception 'Escolha o seu nome'; end if;
  nome := public._nome(p_vendedor); ant := c.atendente_id;
  if ant is distinct from p_vendedor then
    if not coalesce(p_assumir, false) then
      return jsonb_build_object('confirmar', true, 'programado', coalesce(public._nome(ant), ''));
    end if;
    erro := public._senha_vendedor(p_vendedor, p_senha);
    if erro <> '' then return jsonb_build_object('erro', erro); end if;
    if ant is null then
      update public.chamados set atendente_id = p_vendedor, setor_destino = 'atendente_cliente',
        status_cliente = case when status_cliente is null or status_cliente::text in ('aguardando_consultor','visita_realizada','agendado_loja') then 'com_vendedor'::public.status_cliente else status_cliente end,
        tratativa = (tratativa - 'pedidoAtend' - 'pedidoAtendNome' - 'pedidoAtendEm') || jsonb_build_object('assumidoFila', true, 'assumidoEm', now(), 'assumidoPor', nome),
        status = case when status = 'aberta' then 'tratativa'::public.status_chamado else status end
      where id = p_id;
    else
      update public.chamados set atendente_id = p_vendedor,
        tratativa = tratativa || jsonb_build_object('projetistaTrocadoLoja', jsonb_build_object('de', ant, 'para', p_vendedor, 'em', now()))
      where id = p_id;
    end if;
    insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto)
    values (p_id, now(), p_vendedor, 'Tela da loja', nome || ' assumiu o projeto pela tela da loja (com senha) ao abrir as imagens' || case when ant is not null then ' (projetista programado: ' || public._nome(ant) || ')' else ' (estava sem projetista)' end);
    perform public._notificar(array_remove(array_cat(case when ant is not null then array[ant] else array[]::uuid[] end, public._usuarios_setor(array['suporte_consultores','marketing_supervisao','gerente_loja'])), null),
      '🔁 Projetista trocado na loja', nome || ' assumiu o projeto de ' || c.cliente || case when ant is not null then ' (era ' || public._nome(ant) || ')' else '' end || '.', c.id, 'trocaproj:' || c.id || ':' || p_vendedor);
  else
    insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto)
    values (p_id, now(), null, 'Tela da loja', nome || ' abriu as imagens do cliente pela tela da loja');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('tipo', a.tipo, 'nome', a.nome, 'path', a.storage_path, 'url', a.url) order by a.criado_em), '[]'::jsonb) into arqs
  from public.anexos a where a.chamado_id = p_id and a.tipo::text in ('img', 'pdf', 'link', 'video');
  return jsonb_build_object('ok', true, 'nome', nome, 'trocou', ant is distinct from p_vendedor, 'cliente', c.cliente, 'arquivos', arqs);
end $function$;

CREATE OR REPLACE FUNCTION public.agenda_publica_imagens(p_token text, p_id text, p_vendedor uuid, p_assumir boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  if coalesce(p_assumir, false) then raise exception 'Atualize a página da agenda (agora o vendedor confirma com a senha)'; end if;
  return public.agenda_publica_imagens_v2(p_token, p_id, p_vendedor, false, '');
end $function$;

-- 9) Busca de cliente na tela da loja (qualquer dia: 90 dias para trás e para frente) — nome, telefone ou endereço
CREATE OR REPLACE FUNCTION public.agenda_publica_buscar(p_token text, p_q text)
 RETURNS TABLE(id text, dia date, hora text, cliente text, telefone text, consultor text, vendedor text, origem text, situacao text, obs text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date; q text := btrim(coalesce(p_q, '')); d text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
begin
  if p_token is null or length(p_token) < 40 or not exists (select 1 from public.agenda_publica a where a.id = 1 and a.ativo and a.token = p_token) then
    raise exception 'Link inválido ou desligado';
  end if;
  if length(q) < 3 then return; end if;
  return query
    select c.id, c.data_loja::date, to_char(c.data_loja, 'HH24:MI'), c.cliente, coalesce(c.telefone, ''),
           coalesce((select u.nome from public.usuarios u where u.id = c.consultor_id), ''),
           coalesce((select u.nome from public.usuarios u where u.id = c.atendente_id), nullif(c.tratativa->>'atendenteExterno', ''), ''),
           case when t.direto then 'marketing' else 'externo' end,
           case when public.status_cliente_de(c)::text in ('vendido','vendido_promissoria','vendido_entrada','vendido_revisao','atendido','venda_cancelada','reprovado','orcamento','sem_resposta','em_obras','standby','em_analise') then 'finalizado'
                when public.status_cliente_de(c)::text = 'nao_compareceu' then 'nao_compareceu'
                when public.status_cliente_de(c)::text = 'reagendado' then 'reagendado'
                when c.tratativa ? 'emAtendimento' then 'em_atendimento'
                when c.atendente_id is not null or nullif(c.tratativa->>'atendenteExterno', '') is not null then 'com_vendedor'
                else 'sem_vendedor' end,
           coalesce(nullif(btrim(coalesce(c.produto, '')), ''), '')
    from public.chamados c join public.tipos t on t.id = c.tipo
    where t.presale and c.data_loja is not null and c.data_loja::date between hoje - 90 and hoje + 90
      and not (c.tratativa ? 'importadoVisita' or c.tratativa ? 'visitaImportada')
      and ((length(d) >= 4 and regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g') like '%' || d || '%')
           or (length(d) < 4 and (c.cliente ilike '%' || q || '%' or coalesce(c.endereco, '') ilike '%' || q || '%')))
    order by abs(c.data_loja::date - hoje), c.data_loja
    limit 30;
end $function$;
REVOKE ALL ON FUNCTION public.agenda_publica_buscar(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.agenda_publica_buscar(text, text) TO anon, authenticated, service_role;

-- 10) Busca na agenda (logado) — qualquer dia; consultor só vê os próprios
CREATE OR REPLACE FUNCTION public.agenda_loja_buscar(p_q text)
 RETURNS TABLE(id text, cliente text, data_loja timestamp without time zone, telefone text, endereco text, produto text, atendente_id uuid, consultor_id uuid, status_cliente status_cliente, direto boolean, meu boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare mascara boolean; q text := btrim(coalesce(p_q, '')); d text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
begin
  if not public.usuario_ativo() then raise exception 'Usuário sem acesso ao sistema'; end if;
  if not (public.eh_gestao() or public.meus_setores() && public.setores_marketing()) then raise exception 'Sem acesso à agenda da loja'; end if;
  if length(q) < 3 then return; end if;
  mascara := public.somente_atribuidos() and not ('atendente_cliente' = any(public.meus_setores()));
  return query
    select c.id, c.cliente, c.data_loja,
           case when public.pode_ver_chamado(c) then c.telefone else '' end,
           case when public.pode_ver_chamado(c) then coalesce(c.endereco, '') else '' end,
           c.produto, c.atendente_id, c.consultor_id, public.status_cliente_de(c), t.direto, public.pode_ver_chamado(c)
    from public.chamados c join public.tipos t on t.id = c.tipo
    where t.presale and c.data_loja is not null and not (c.tratativa ? 'importadoVisita' or c.tratativa ? 'visitaImportada')
      and (not mascara or public.pode_ver_chamado(c))
      and ((length(d) >= 4 and regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g') like '%' || d || '%')
           or (length(d) < 4 and (c.cliente ilike '%' || q || '%' or coalesce(c.endereco, '') ilike '%' || q || '%')))
    order by abs(c.data_loja::date - (now() at time zone 'America/Sao_Paulo')::date), c.data_loja
    limit 40;
end $function$;
REVOKE ALL ON FUNCTION public.agenda_loja_buscar(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.agenda_loja_buscar(text) TO authenticated, service_role;

-- 11) Consulta de clientes para o gerente (base de clientes sem valores)
CREATE OR REPLACE FUNCTION public.base_clientes_consulta(p_q text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare q text := btrim(coalesce(p_q, '')); d text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g'); r jsonb;
begin
  if not (public.pode_base_clientes() or (public.usuario_ativo() and 'gerente_loja' = any(public.meus_setores()))) then raise exception 'Sem acesso à base de clientes'; end if;
  if length(q) < 3 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nome), '[]'::jsonb) into r from (
    select c.id, c.cpf_cnpj, c.nome, c.telefone1, c.telefone2,
           concat_ws(', ', nullif(btrim(concat_ws(' ', c.logradouro, c.numero)), ''), nullif(c.complemento, ''), nullif(c.bairro, ''), nullif(concat_ws('/', nullif(c.cidade, ''), nullif(c.uf, '')), '')) endereco,
           (select coalesce(jsonb_agg(jsonb_build_object('num', v.num_venda, 'data', v.data_venda, 'situacao', v.situacao, 'vendedor', v.vendedor) order by v.data_venda desc nulls last), '[]'::jsonb)
              from public.base_clientes_vendas v where v.cliente_id = c.id) vendas
      from public.base_clientes c
     where (length(d) >= 11 and c.cpf_cnpj = d)
        or (length(d) >= 8 and length(d) < 11 and (c.telefone1 like '%' || d or c.telefone2 like '%' || d))
        or (length(d) >= 3 and length(d) < 8 and c.cpf_cnpj like d || '%')
        or (d = '' and (c.nome ilike '%' || q || '%' or c.logradouro ilike '%' || q || '%'))
     order by c.nome limit 30) x;
  return r;
end $function$;

REVOKE ALL ON FUNCTION public.chamar_vendedor(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.chamar_vendedores_fila(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.base_clientes_consulta(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.chamar_vendedor(uuid, text), public.chamar_vendedores_fila(text), public.base_clientes_consulta(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.agenda_publica_assumir_v2(text, text, uuid, text, text) FROM public;
REVOKE ALL ON FUNCTION public.agenda_publica_imagens_v2(text, text, uuid, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.agenda_publica_assumir_v2(text, text, uuid, text, text), public.agenda_publica_imagens_v2(text, text, uuid, boolean, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._vend_motivo_indisp(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public._pode_chamar_vendedor() FROM public, anon;
