-- 0123 · Marketing: "É litoral" (Supervisão Marketing aprova) e "pedir vendedor" no agendamento direto na loja

-- criar_chamado grava as marcas do agendamento (só clientes do marketing)
DO $$
declare d text; a text := '  perform public._reg(v_id, ''Solicitação aberta (';
begin
  d := pg_get_functiondef('public.criar_chamado'::regproc);
  if position(a in d) = 0 then raise exception 'âncora não encontrada'; end if;
  d := replace(d, a, '  if t.presale and (coalesce((p->>''litoral'')::boolean, false) or coalesce((p->>''pedeVendedor'')::boolean, false)) then
    update public.chamados set tratativa = coalesce(tratativa, ''{}''::jsonb)
      || case when coalesce((p->>''litoral'')::boolean, false) and not t.direto then jsonb_build_object(''litoral'', jsonb_build_object(''status'', ''pendente'', ''em'', now(), ''por'', eu.nome)) else ''{}''::jsonb end
      || case when coalesce((p->>''pedeVendedor'')::boolean, false) and t.direto then jsonb_build_object(''pedeVendedor'', true) else ''{}''::jsonb end
    where id = v_id;
    if coalesce((p->>''litoral'')::boolean, false) and not t.direto then
      perform public._notificar(public._usuarios_setor(array[''marketing_supervisao'']), ''🏖 Litoral para aprovar'', btrim(p->>''cliente'') || '' · agendado por '' || eu.nome, v_id, ''litoral:'' || v_id);
    end if;
  end if;
' || a);
  execute d;
end $$;

-- marcar / desmarcar litoral depois do cadastro (quem cadastrou, Supervisão Marketing ou Gestão)
CREATE OR REPLACE FUNCTION public.marcar_litoral(p_id text, p_sim boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare c public.chamados := public._chamado(p_id, false); eu public.usuarios := public._eu();
begin
  if not public.tipo_presale(c.tipo) then raise exception 'Só para clientes do marketing'; end if;
  if not (public.eh_gestao() or 'marketing_supervisao' = any(public.meus_setores()) or c.solicitante_id = eu.id) then raise exception 'Sem permissão'; end if;
  if p_sim then
    if c.tratativa ? 'litoral' then return; end if;
    update public.chamados set tratativa = tratativa || jsonb_build_object('litoral', jsonb_build_object('status', 'pendente', 'em', now(), 'por', eu.nome)) where id = p_id;
    perform public._reg(p_id, '🏖 Marcado como LITORAL — aguardando aprovação da Supervisão Marketing');
    perform public._notificar(public._usuarios_setor(array['marketing_supervisao']), '🏖 Litoral para aprovar', c.cliente || ' · marcado por ' || eu.nome, p_id, 'litoral:' || p_id);
  else
    update public.chamados set tratativa = tratativa - 'litoral' where id = p_id;
    perform public._reg(p_id, 'Desmarcado como litoral');
  end if;
end $function$;

-- Supervisão Marketing (ou Gestão) aprova ou recusa o litoral
CREATE OR REPLACE FUNCTION public.litoral_decidir(p_id text, p_aprovar boolean, p_obs text DEFAULT '')
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare c public.chamados := public._chamado(p_id, false); eu public.usuarios := public._eu(); obs text := btrim(coalesce(p_obs, ''));
begin
  if not (public.eh_gestao() or 'marketing_supervisao' = any(public.meus_setores())) then raise exception 'Só a Supervisão Marketing aprova o litoral'; end if;
  if not (c.tratativa ? 'litoral') then raise exception 'Este cliente não está marcado como litoral'; end if;
  if not p_aprovar and length(obs) < 3 then raise exception 'Escreva o motivo da recusa'; end if;
  update public.chamados set tratativa = jsonb_set(tratativa, '{litoral}', (tratativa->'litoral') || jsonb_build_object('status', case when p_aprovar then 'aprovado' else 'recusado' end,
    'decididoEm', now(), 'decididoPor', eu.nome, 'obs', obs)) where id = p_id;
  perform public._reg(p_id, case when p_aprovar then '🏖 Litoral APROVADO pela Supervisão Marketing' else '🏖 Litoral RECUSADO pela Supervisão Marketing' end || coalesce(' — ' || nullif(obs, ''), ''));
  perform public._notificar(array_remove(array[c.solicitante_id, c.consultor_id, c.atendente_id], null),
    case when p_aprovar then '🏖 Litoral aprovado' else '🏖 Litoral recusado' end, c.cliente || coalesce(' — ' || nullif(obs, ''), ''), p_id, 'litdec:' || p_id || ':' || extract(epoch from now())::bigint);
end $function$;

-- pedir (ou retirar o pedido de) vendedor para cliente direto na loja
CREATE OR REPLACE FUNCTION public.pedir_vendedor_loja(p_id text, p_sim boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare c public.chamados := public._chamado(p_id, false); eu public.usuarios := public._eu();
begin
  if not public.tipo_presale(c.tipo) then raise exception 'Só para clientes do marketing'; end if;
  if not (public.eh_gestao() or public.meus_setores() && array['marketing_supervisao','marketing_operadora','suporte_consultores'] or c.solicitante_id = eu.id) then raise exception 'Sem permissão'; end if;
  update public.chamados set tratativa = case when p_sim then tratativa || '{"pedeVendedor": true}'::jsonb else tratativa - 'pedeVendedor' end where id = p_id;
  perform public._reg(p_id, case when p_sim then '🙋 Pedido à Supervisão Marketing: definir um vendedor' else 'Pedido de vendedor retirado' end);
end $function$;

REVOKE ALL ON FUNCTION public.marcar_litoral(text, boolean), public.litoral_decidir(text, boolean, text), public.pedir_vendedor_loja(text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.marcar_litoral(text, boolean), public.litoral_decidir(text, boolean, text), public.pedir_vendedor_loja(text, boolean) TO authenticated, service_role;
