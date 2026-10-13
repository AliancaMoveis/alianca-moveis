-- 0125 · Trocar o consultor de um cliente já direcionado (mesmas pessoas que direcionam)
CREATE OR REPLACE FUNCTION public.trocar_consultor(p_id text, p_consultor uuid, p_motivo text DEFAULT '')
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare c public.chamados := public._chamado(p_id, true); ant uuid; mot text := btrim(coalesce(p_motivo, ''));
begin
  if not (public.eh_gestao() or public.tem_lib('verMarketing') or 'suporte_consultores' = any(public.meus_setores())) then
    raise exception 'Só a Gestão, a Supervisão de Marketing ou o Suporte a Consultores trocam o consultor';
  end if;
  if not public.tipo_presale(c.tipo) or c.setor_destino <> 'consultor_externo' then raise exception 'O cliente precisa estar direcionado a um consultor'; end if;
  if p_consultor is null or not public._eh_consultor_valido(p_consultor) then raise exception 'Selecione um consultor válido'; end if;
  ant := c.consultor_id;
  if ant = p_consultor then raise exception 'O cliente já está com este consultor'; end if;
  update public.chamados set consultor_id = p_consultor,
    tratativa = tratativa || jsonb_build_object('consultorTrocado', jsonb_build_object('de', ant, 'para', p_consultor, 'em', now(), 'por', public._nome(auth.uid()), 'motivo', mot))
  where id = p_id;
  perform public._reg(p_id, 'Consultor trocado: ' || coalesce(public._nome(ant), '—') || ' → ' || public._nome(p_consultor) || case when mot <> '' then ' — ' || mot else '' end);
  if ant is not null then
    perform public._notificar(array[ant], '🔁 Cliente passou para outro consultor', c.cliente || ' agora está com ' || public._nome(p_consultor) || case when mot <> '' then ' — ' || mot else '' end, p_id, 'trocacons:' || p_id || ':' || p_consultor);
  end if;
end $function$;
REVOKE ALL ON FUNCTION public.trocar_consultor(text, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trocar_consultor(text, uuid, text) TO authenticated, service_role;
