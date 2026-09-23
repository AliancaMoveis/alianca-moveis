-- Call center: todo o setor vê as solicitações de pós-venda (não marketing), pode anotar novos contatos,
-- marcar urgente e concluir depois que o setor respondeu (cliente avisado). Tratar continua com o setor de destino.

create or replace function public.eh_callcenter() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.usuario_ativo() and 'callcenter' = any(public.meus_setores());
$$;

create or replace function public.pode_ver_chamado(c public.chamados) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ms text[];
begin
  if uid is null or not public.usuario_ativo() then return false; end if;
  if public.somente_atribuidos() then
    return coalesce(c.consultor_id = uid, false) or coalesce(c.atendente_id = uid, false)
      or exists (select 1 from public.transferencias t
                 where t.chamado_id = c.id and t.status = 'pendente' and t.para_usuario = uid);
  end if;
  if public.eh_gestao() then return true; end if;
  ms := public.meus_setores();
  if public.tipo_presale(c.tipo) then
    return public.tem_lib('verMarketing') or 'suporte_consultores' = any(ms)
      or coalesce(c.setor_destino = any(ms), false) or coalesce(c.solicitante_id = uid, false);
  end if;
  if public.tem_lib('verTudo') then return true; end if;
  if 'callcenter' = any(ms) then return true; end if;
  return coalesce(c.setor_destino = any(ms), false) or coalesce(c.solicitante_id = uid, false);
end $$;

-- call center pode registrar contato (anotação) e marcar urgente em qualquer solicitação de pós-venda
create or replace function public._pode_acompanhar(c public.chamados) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.pode_tratar_chamado(c) is true)
      or (public.eh_callcenter() is true and public.tipo_presale(c.tipo) is not true);
$$;
revoke execute on function public._pode_acompanhar(public.chamados) from authenticated, public, anon;

create or replace function public.adicionar_nota(p_id text, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false);
begin
  if not public._pode_acompanhar(c) then
    raise exception 'Você tem acesso de leitura a este chamado. Quem trata é o setor %', public._setor_nome(c.setor_destino);
  end if;
  if btrim(coalesce(p_texto,'')) = '' then raise exception 'Escreva a anotação'; end if;
  perform public._reg(p_id, btrim(p_texto));
end $$;

create or replace function public.alternar_urgente(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false);
begin
  if not public._pode_acompanhar(c) then
    raise exception 'Você tem acesso de leitura a este chamado. Quem trata é o setor %', public._setor_nome(c.setor_destino);
  end if;
  update public.chamados set urgente = not c.urgente where id = p_id;
  perform public._reg(p_id, case when not c.urgente then 'Marcado como URGENTE' else 'Urgência removida' end);
end $$;

-- o call center conclui depois de avisar o cliente (só a partir de "Respondida")
create or replace function public.mudar_status(p_id text, p_status public.status_chamado) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false);
begin
  if public.tipo_presale(c.tipo) then raise exception 'No marketing o status segue as etapas do cliente'; end if;
  if public.pode_tratar_chamado(c) is not true then
    if not (public.eh_callcenter() is true and p_status = 'concluida' and c.status = 'respondida') then
      raise exception 'Você tem acesso de leitura a este chamado. Quem trata é o setor %', public._setor_nome(c.setor_destino);
    end if;
  end if;
  if c.status = p_status then return; end if;
  update public.chamados set status = p_status where id = p_id;
  perform public._reg(p_id, 'Status → ' || public._label_status(p_status)
    || case when public.pode_tratar_chamado(c) is not true then ' (cliente avisado pelo call center)' else '' end);
end $$;
revoke execute on function public.eh_callcenter() from anon, public;
