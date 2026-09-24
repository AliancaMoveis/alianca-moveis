-- O setor que não fala com o cliente não conclui a partir de "Informar cliente": só o call center.
create or replace function public.mudar_status(p_id text, p_status public.status_chamado) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false); novo public.status_chamado := p_status; trata boolean;
begin
  if public.tipo_presale(c.tipo) then raise exception 'No marketing o status segue as etapas do cliente'; end if;
  trata := public.pode_tratar_chamado(c) is true;
  -- call center conclui o que está em "Informar cliente"
  if not trata and not (public.eh_callcenter() is true and c.status = 'informar' and p_status = 'concluida') then
    raise exception 'Você tem acesso de leitura a este chamado. Quem trata é o setor %', public._setor_nome(c.setor_destino);
  end if;
  -- setor que não fala com o cliente: "concluir" vira "Informar cliente" (o call center avisa e conclui)
  if p_status = 'concluida' and public._via_callcenter(c.setor_destino)
     and public.eh_callcenter() is not true and public.tem_lib('verTudo') is not true then
    novo := 'informar';
  end if;
  if c.status = novo then return; end if;
  update public.chamados set status = novo where id = p_id;
  perform public._reg(p_id, 'Status → ' || public._label_status(novo)
    || case when novo = 'informar' then ' (o call center avisa o cliente)' when not trata then ' (cliente informado pelo call center)' else '' end);
end $$;
