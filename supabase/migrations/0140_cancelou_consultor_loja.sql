-- 0140 · Dois status de cancelamento no cliente do marketing:
--   • "Cancelou visita do consultor" (visita_cancelada): o cliente volta para a Haisla (Supervisão Marketing) direcionar de novo
--   • "Cancelou visita na loja" (loja_cancelada, enum em 0140a): o cliente fica na etapa da loja; Suporte, consultor e vendedor são avisados
DO $$
declare d text;
begin
  -- rótulos
  d := pg_get_functiondef('public._label_status_cliente'::regproc);
  if position('when ''visita_cancelada'' then ''Cliente cancelou a visita''' in d) = 0 then raise exception 'âncora label'; end if;
  d := replace(d, 'when ''visita_cancelada'' then ''Cliente cancelou a visita''', 'when ''visita_cancelada'' then ''Cancelou visita do consultor''
    when ''loja_cancelada'' then ''Cancelou visita na loja''');
  execute d;

  -- status_cliente_de: na Haisla mostra "cancelou visita do consultor"; na loja vale "cancelou visita na loja"
  d := pg_get_functiondef('public.status_cliente_de'::regproc);
  if position('if c.setor_destino = ''marketing_supervisao'' then return ''aguardando_consultor''; end if;' in d) = 0 then raise exception 'âncora scd1'; end if;
  d := replace(d, 'if c.setor_destino = ''marketing_supervisao'' then return ''aguardando_consultor''; end if;',
    'if c.setor_destino = ''marketing_supervisao'' then return case when c.status_cliente::text = ''visita_cancelada'' then c.status_cliente else ''aguardando_consultor'' end; end if;');
  if position('''atendido'',''visita_cancelada'') then c.status_cliente else ''agendado_loja''' in d) = 0 then raise exception 'âncora scd2'; end if;
  d := replace(d, '''atendido'',''visita_cancelada'') then c.status_cliente else ''agendado_loja''', '''atendido'',''visita_cancelada'',''loja_cancelada'') then c.status_cliente else ''agendado_loja''');
  if position('''em_analise'',''atendido'') then c.status_cliente else ''com_vendedor''' in d) = 0 then raise exception 'âncora scd3'; end if;
  d := replace(d, '''em_analise'',''atendido'') then c.status_cliente else ''com_vendedor''', '''em_analise'',''atendido'',''loja_cancelada'') then c.status_cliente else ''com_vendedor''');
  execute d;

  -- consultor marca "cancelou a visita": volta para a Supervisão Marketing (Haisla) direcionar de novo
  d := pg_get_functiondef('public.consultor_situacao'::regproc);
  if position('  if p_status = ''visita_cancelada'' then
    perform public._notificar(' in d) = 0 then raise exception 'âncora consultor_situacao'; end if;
  d := replace(d, '  if p_status = ''visita_cancelada'' then
    perform public._notificar(', '  if p_status = ''visita_cancelada'' then
    update public.chamados set setor_destino = ''marketing_supervisao'', consultor_id = null,
      tratativa = tratativa || jsonb_build_object(''cancelouConsultor'', public._nome(c.consultor_id), ''cancelouConsultorId'', c.consultor_id, ''cancelouEm'', now())
    where id = p_id;
    perform public._reg(p_id, ''Voltou para a Supervisão Marketing direcionar de novo (cliente cancelou a visita do consultor '' || coalesce(public._nome(c.consultor_id), ''—'') || '')'');
    perform public._notificar(');
  d := replace(d, '''❌ Cliente cancelou a visita''', '''❌ Cancelou visita do consultor — direcionar de novo''');
  execute d;
end $$;

-- "Cancelou visita na loja": consultor do cliente, vendedor do cliente, Suporte, Supervisão Marketing ou Gestão
CREATE OR REPLACE FUNCTION public.cancelou_loja(p_id text, p_obs text, p_desfazer boolean DEFAULT false)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare c public.chamados := public._chamado(p_id, false); txt text := btrim(coalesce(p_obs,'')); eu text := public._nome(auth.uid()); novo public.status_cliente;
begin
  if not public.tipo_presale(c.tipo) then raise exception 'Só para clientes do marketing'; end if;
  if not (public.eh_gestao() or public.gere_mkt() or 'suporte_consultores' = any(public.meus_setores()) or c.consultor_id = auth.uid() or c.atendente_id = auth.uid()) then
    raise exception 'Só o consultor ou o vendedor do cliente, o Suporte, a Supervisão Marketing ou a Gestão'; end if;
  if c.setor_destino not in ('suporte_consultores','atendente_cliente') or c.data_loja is null then raise exception 'O cliente não tem visita na loja agendada'; end if;
  if exists (select 1 from public.vendas where chamado_id = p_id) then raise exception 'Este cliente já tem venda registrada'; end if;
  if p_desfazer then
    if c.status_cliente::text <> 'loja_cancelada' then return; end if;
    novo := case when c.setor_destino = 'atendente_cliente' then 'com_vendedor' else 'agendado_loja' end;
    update public.chamados set status_cliente = novo, status = case when status = 'concluida' then 'tratativa'::public.status_chamado else status end,
      tratativa = tratativa - 'lojaCancelada' where id = p_id;
    perform public._reg(p_id, 'Cancelamento da visita na loja desfeito — ' || public._label_status_cliente(novo));
    return;
  end if;
  if txt = '' then raise exception 'Escreva o motivo: o que o cliente disse'; end if;
  update public.chamados set status_cliente = 'loja_cancelada',
    status = case when status = 'aberta' then 'tratativa'::public.status_chamado else status end,
    tratativa = tratativa || jsonb_build_object('lojaCancelada', jsonb_build_object('em', now(), 'por', eu, 'obs', txt))
  where id = p_id;
  perform public._reg(p_id, '❌ Cancelou visita na loja (' || to_char(c.data_loja, 'DD/MM HH24:MI') || ') — ' || txt);
  perform public._notificar(array_remove(array_remove(public._usuarios_setor(array['suporte_consultores']) || c.consultor_id || c.atendente_id, null), auth.uid()),
    '❌ Cancelou visita na loja', c.cliente || ' — ' || eu || ': ' || txt, p_id, 'lojacanc-' || p_id || '-' || to_char(now(),'YYYYMMDDHH24MI'));
end $function$;
GRANT EXECUTE ON FUNCTION public.cancelou_loja(text, text, boolean) TO authenticated;

-- Gestão / Supervisão pelo "Status do cliente": os dois cancelamentos seguem a mesma regra
DO $$
declare d text; a text := '  antes := public.status_cliente_de(c);';
begin
  d := pg_get_functiondef('public.alterar_status_cliente'::regproc);
  if position(a in d) = 0 then raise exception 'âncora alterar_status_cliente'; end if;
  d := replace(d, a, a || '
  if p_novo::text = ''loja_cancelada'' then perform public.cancelou_loja(p_id, ''Marcado pelo status do cliente''); return; end if;
  if p_novo::text = ''visita_cancelada'' then
    if coalesce((select t.direto from public.tipos t where t.id = c.tipo), false) then raise exception ''Cliente direto na loja: use “Cancelou visita na loja”''; end if;
    if exists (select 1 from public.vendas where chamado_id = p_id) then raise exception ''Este cliente já tem venda registrada''; end if;
    update public.chamados set status_cliente = ''visita_cancelada'', setor_destino = ''marketing_supervisao'', consultor_id = null,
      status = case when c.status = ''concluida'' then ''tratativa''::public.status_chamado else c.status end,
      tratativa = c.tratativa || jsonb_build_object(''cancelouConsultor'', public._nome(c.consultor_id), ''cancelouConsultorId'', c.consultor_id, ''cancelouEm'', now())
    where id = p_id;
    perform public._reg(p_id, ''Status do cliente alterado: '' || public._label_status_cliente(antes) || '' → Cancelou visita do consultor — voltou para a Supervisão Marketing direcionar de novo'');
    return;
  end if;');
  execute d;
end $$;

-- dados: quem já estava como "cancelou a visita" com o consultor volta para a Haisla; o direto na loja vira "cancelou visita na loja"
select set_config('alianca.sistema','1',true);
with m as (update public.chamados c set setor_destino = 'marketing_supervisao', consultor_id = null,
  tratativa = c.tratativa || jsonb_build_object('cancelouConsultor', public._nome(c.consultor_id), 'cancelouConsultorId', c.consultor_id, 'cancelouEm', now())
  where c.status_cliente = 'visita_cancelada' and c.setor_destino = 'consultor_externo' returning c.id)
insert into public.historico(chamado_id, quando, quem_id, quem_nome, texto)
select id, now(), null, 'Sistema', 'Voltou para a Supervisão Marketing direcionar de novo (cliente cancelou a visita do consultor)' from m;
with m as (update public.chamados c set status_cliente = 'loja_cancelada',
  tratativa = c.tratativa || jsonb_build_object('lojaCancelada', jsonb_build_object('em', now(), 'por', 'Sistema', 'obs', 'Convertido de "cancelou a visita"'))
  where c.status_cliente = 'visita_cancelada' and c.setor_destino in ('suporte_consultores','atendente_cliente') returning c.id)
insert into public.historico(chamado_id, quando, quem_id, quem_nome, texto)
select id, now(), null, 'Sistema', 'Status ajustado: Cancelou visita na loja' from m;
