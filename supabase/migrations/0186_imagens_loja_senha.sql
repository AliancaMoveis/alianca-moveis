-- 0186 Tela da loja — "Ver imagens": sempre com a SENHA do vendedor.
--  · cliente já tem vendedor: só ele (com a senha dele) vê as imagens; outro vendedor é barrado (não "rouba" o cliente);
--  · cliente sem vendedor: o vendedor que abrir (nome + senha) assume o projeto, como já era.
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
  -- cliente de outro vendedor: não abre
  if ant is not null and ant is distinct from p_vendedor then
    return jsonb_build_object('erro', 'Este cliente já está com ' || public._nome(ant) || '. Só ele vê as imagens.');
  end if;
  -- sem vendedor: abrir as imagens = assumir o projeto (pede confirmação antes)
  if ant is null and not coalesce(p_assumir, false) then
    return jsonb_build_object('confirmar', true, 'programado', '');
  end if;
  -- sempre com a senha do vendedor
  erro := public._senha_vendedor(p_vendedor, p_senha);
  if erro <> '' then return jsonb_build_object('erro', erro); end if;
  if ant is null then
    update public.chamados set atendente_id = p_vendedor, setor_destino = 'atendente_cliente',
      status_cliente = case when status_cliente is null or status_cliente::text in ('aguardando_consultor','visita_realizada','agendado_loja') then 'com_vendedor'::public.status_cliente else status_cliente end,
      tratativa = (tratativa - 'pedidoAtend' - 'pedidoAtendNome' - 'pedidoAtendEm') || jsonb_build_object('assumidoFila', true, 'assumidoEm', now(), 'assumidoPor', nome),
      status = case when status = 'aberta' then 'tratativa'::public.status_chamado else status end
    where id = p_id;
    insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto)
    values (p_id, now(), p_vendedor, 'Tela da loja', nome || ' assumiu o projeto pela tela da loja (com senha) ao abrir as imagens (estava sem projetista)');
    perform public._notificar(array_remove(public._usuarios_setor(array['suporte_consultores','marketing_supervisao','gerente_loja']), null),
      '🔁 Projetista definido na loja', nome || ' assumiu o projeto de ' || c.cliente || '.', c.id, 'trocaproj:' || c.id || ':' || p_vendedor);
  else
    insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto)
    values (p_id, now(), p_vendedor, 'Tela da loja', nome || ' abriu as imagens do cliente pela tela da loja (com senha)');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('tipo', a.tipo, 'nome', a.nome, 'path', a.storage_path, 'url', a.url) order by a.criado_em), '[]'::jsonb) into arqs
  from public.anexos a where a.chamado_id = p_id and a.tipo::text in ('img', 'pdf', 'link', 'video');
  return jsonb_build_object('ok', true, 'nome', nome, 'trocou', ant is null, 'cliente', c.cliente, 'arquivos', arqs);
end $function$;
