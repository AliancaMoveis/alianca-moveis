-- Transferência de cliente entre vendedores: avisos
--  · pedido feito por um colega → o vendedor indicado é avisado para aceitar/recusar
--  · aceita ou recusada → quem pediu é avisado
--  · cliente trocou de vendedor → o novo recebe "Cliente transferido para você (de X)" e o anterior "Cliente saiu da sua lista"
do $do$ declare d text; begin
  d := pg_get_functiondef('public.solicitar_transferencia(text,uuid)'::regprocedure);
  d := replace(d, $x$  return 'pendente';$x$, $x$  perform public._notificar(array[p_para], '🔁 ' || public._nome(c.atendente_id) || ' quer transferir um cliente para você',
    c.cliente || coalesce(' · loja ' || to_char(c.data_loja, 'DD/MM HH24:MI'), '') || ' — abra para aceitar ou recusar', p_id, 'transfpede:' || p_id || ':' || p_para || ':' || extract(epoch from now())::bigint);
  return 'pendente';$x$);
  if d not like '%transfpede%' then raise exception 'solicitar'; end if;
  execute d;

  d := pg_get_functiondef('public.responder_transferencia(text,boolean,text)'::regprocedure);
  d := replace(d, $x$  if p_aceitar then
    update public.chamados$x$, $x$  if tr.solicitado_por is not null and tr.solicitado_por is distinct from auth.uid() then
    perform public._notificar(array[tr.solicitado_por], case when p_aceitar then '✅ Transferência aceita' else '❌ Transferência recusada' end,
      c.cliente || case when p_aceitar then ' agora está com ' || public._nome(tr.para_usuario) else ' continua com você (recusada por ' || public._nome(auth.uid()) || ')' end || '.',
      p_id, 'transfresp:' || tr.id);
  end if;
  if p_aceitar then
    update public.chamados$x$);
  if d not like '%transfresp%' then raise exception 'responder'; end if;
  execute d;

  d := pg_get_functiondef('public._trg_chamado_avisos()'::regprocedure);
  d := replace(d, $x$    perform public._notificar(array[new.atendente_id], '🏬 Cliente designado para você',$x$,
    $x$    perform public._notificar(array[new.atendente_id], case when tg_op = 'UPDATE' and old.atendente_id is not null then '🔁 Cliente transferido para você (de ' || public._nome(old.atendente_id) || ')' else '🏬 Cliente designado para você' end,$x$);
  d := replace(d, $x$  if ped_novo is not null and ped_novo is distinct from ped_ant then$x$, $x$  if tg_op = 'UPDATE' and old.atendente_id is not null and old.atendente_id is distinct from new.atendente_id and old.atendente_id is distinct from auth.uid()
     and not exists (select 1 from public.transferencias t where t.chamado_id = new.id and t.de_usuario = old.atendente_id and t.status = 'aceita' and t.decidido_em = now()) then
    perform public._notificar(array[old.atendente_id], '↪️ Cliente saiu da sua lista', new.cliente || ' agora está com ' || coalesce(public._nome(new.atendente_id), 'ninguém') || '.', new.id, 'vendsaiu:' || new.id || ':' || old.atendente_id || ':' || extract(epoch from now())::bigint);
  end if;

  if ped_novo is not null and ped_novo is distinct from ped_ant then$x$);
  if d not like '%vendsaiu%' or d not like '%transferido para você%' then raise exception 'trigger'; end if;
  execute d;
end $do$;
