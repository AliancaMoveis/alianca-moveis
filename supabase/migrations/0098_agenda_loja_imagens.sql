-- Agenda da loja (tela aberta): "Ver imagens" do cliente agendado.
-- Quem vai ver confirma o nome. Se não for o projetista programado, confirma que vai assumir o projeto e o projetista muda
-- na hora (fica no histórico; o anterior e a coordenação são avisados). As imagens saem por uma função do servidor
-- (agenda-imagens), que gera links temporários — a tela aberta não tem acesso direto aos arquivos.
create or replace function public.agenda_publica_imagens(p_token text, p_id text, p_vendedor uuid, p_assumir boolean default false)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c public.chamados; hoje date := (now() at time zone 'America/Sao_Paulo')::date; nome text; ant uuid; arqs jsonb;
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
    values (p_id, now(), null, 'Tela da loja', nome || ' assumiu o projeto pela tela da loja ao abrir as imagens' || case when ant is not null then ' (projetista programado: ' || public._nome(ant) || ')' else ' (estava sem projetista)' end);
    perform public._notificar(array_remove(array_cat(case when ant is not null then array[ant] else array[]::uuid[] end, public._usuarios_setor(array['suporte_consultores','marketing_supervisao','gerente_loja'])), null),
      '🔁 Projetista trocado na loja', nome || ' assumiu o projeto de ' || c.cliente || case when ant is not null then ' (era ' || public._nome(ant) || ')' else '' end || '.', c.id, 'trocaproj:' || c.id || ':' || p_vendedor);
  else
    insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto)
    values (p_id, now(), null, 'Tela da loja', nome || ' abriu as imagens do cliente pela tela da loja');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('tipo', a.tipo, 'nome', a.nome, 'path', a.storage_path, 'url', a.url) order by a.criado_em), '[]'::jsonb) into arqs
  from public.anexos a where a.chamado_id = p_id and a.tipo::text in ('img', 'pdf', 'link', 'video');
  return jsonb_build_object('ok', true, 'nome', nome, 'trocou', ant is distinct from p_vendedor, 'cliente', c.cliente, 'arquivos', arqs);
end $$;
revoke all on function public.agenda_publica_imagens(text, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.agenda_publica_imagens(text, text, uuid, boolean) to service_role;

-- quantos arquivos cada cliente do dia tem (para mostrar o botão só quando houver)
create or replace function public.agenda_publica_anexos_qtd(p_token text, p_dia date)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare r jsonb;
begin
  if p_token is null or length(p_token) < 40 or not exists (select 1 from public.agenda_publica a where a.id = 1 and a.ativo and a.token = p_token) then
    raise exception 'Link inválido ou desligado';
  end if;
  select coalesce(jsonb_object_agg(x.id, x.n), '{}'::jsonb) into r from (
    select c.id, count(a.id) n from public.chamados c join public.anexos a on a.chamado_id = c.id and a.tipo::text in ('img', 'pdf', 'link', 'video')
    where c.data_loja is not null and c.data_loja::date = p_dia and public.tipo_presale(c.tipo) group by c.id) x;
  return r;
end $$;
revoke all on function public.agenda_publica_anexos_qtd(text, date) from public;
grant execute on function public.agenda_publica_anexos_qtd(text, date) to anon, authenticated;
