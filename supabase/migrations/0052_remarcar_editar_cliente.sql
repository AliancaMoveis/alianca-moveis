-- Alterar a data da visita do consultor (consultor do cliente, Supervisão de Marketing ou Gestão)
create or replace function public.reagendar_visita(p_id text, p_nova timestamp without time zone, p_motivo text default '')
returns void language plpgsql security definer set search_path to '' as $$
declare c public.chamados := public._chamado(p_id, false); eu uuid := auth.uid(); mot text := btrim(coalesce(p_motivo,''));
begin
  if not public.tipo_presale(c.tipo) or c.setor_destino not in ('marketing_supervisao','consultor_externo') then
    raise exception 'A data da visita só pode ser alterada antes do agendamento na loja';
  end if;
  if not (public.eh_gestao() or public.tem_lib('verMarketing') or c.consultor_id is not distinct from eu) then
    raise exception 'A data da visita é alterada pelo consultor, pela Supervisão de Marketing ou pela Gestão';
  end if;
  if p_nova is null then raise exception 'Informe a nova data e horário da visita'; end if;
  if c.data_visita is not null and date_trunc('minute', p_nova) = date_trunc('minute', c.data_visita) then raise exception 'A data já é essa'; end if;
  update public.chamados set data_visita = p_nova,
    status_cliente = case when status_cliente = 'ausente_endereco' then 'direcionado_consultor'::public.status_cliente else status_cliente end
  where id = p_id;
  perform public._reg(p_id, 'Visita do consultor remarcada: ' || coalesce(public._fmt_dt_local(c.data_visita), 'sem data') || ' → '
    || public._fmt_dt_local(p_nova) || ' (por ' || public._nome(eu) || ')' || case when mot <> '' then ' — ' || mot else '' end);
  if c.consultor_id is not null and c.consultor_id <> eu then
    perform public._notificar(array[c.consultor_id], '📅 Visita remarcada', c.cliente || ': nova data ' || public._fmt_dt_local(p_nova) || case when mot <> '' then ' — ' || mot else '' end, p_id, 'revis-' || p_id || '-' || to_char(now(),'YYYYMMDDHH24MISS'));
  end if;
  if c.consultor_id is not distinct from eu then
    perform public._notificar(array_remove(public._usuarios_setor(array['marketing_supervisao']), eu), '📅 Consultor remarcou a visita', c.cliente || ': ' || public._nome(eu) || ' → ' || public._fmt_dt_local(p_nova) || case when mot <> '' then ' — ' || mot else '' end, p_id, 'revis-' || p_id || '-' || to_char(now(),'YYYYMMDDHH24MISS'));
  end if;
end $$;
revoke all on function public.reagendar_visita(text, timestamp without time zone, text) from public, anon;
grant execute on function public.reagendar_visita(text, timestamp without time zone, text) to authenticated;

-- Reagendar a vinda à loja: também reabre quem "não compareceu" e avisa vendedor/consultor
drop function if exists public.reagendar_loja(text, timestamp without time zone);
create or replace function public.reagendar_loja(p_id text, p_nova timestamp without time zone, p_motivo text default '')
returns void language plpgsql security definer set search_path to '' as $$
declare c public.chamados := public._chamado(p_id, false); eu uuid := auth.uid(); mot text := btrim(coalesce(p_motivo,'')); quem uuid[];
begin
  if not public.tipo_presale(c.tipo) or c.data_loja is null then raise exception 'Este cliente não tem vinda à loja agendada'; end if;
  if not (public.pode_editar_agenda() or c.consultor_id is not distinct from eu or (c.atendente_id is not distinct from eu and c.setor_destino = 'atendente_cliente')) then
    raise exception 'Reagendamento feito pelo consultor, vendedor do cliente, Suporte, Supervisão de Marketing ou Gestão.';
  end if;
  if exists (select 1 from public.vendas where chamado_id = p_id and status <> 'cancelada') then raise exception 'Este cliente já tem venda registrada'; end if;
  if p_nova is null then raise exception 'Informe a nova data'; end if;
  if date_trunc('minute', p_nova) = date_trunc('minute', c.data_loja) then raise exception 'A data já é essa'; end if;
  update public.chamados set data_loja = p_nova,
    status_cliente = case when setor_destino = 'atendente_cliente' then 'reagendado'::public.status_cliente else status_cliente end,
    status = case when status = 'concluida' then 'tratativa'::public.status_chamado else status end,
    tratativa = tratativa - 'emAtendimento'
  where id = p_id;
  perform public._reg(p_id, 'Reagendamento da vinda à loja: ' || public._fmt_dt_local(c.data_loja) || ' → '
    || public._fmt_dt_local(p_nova) || ' (por ' || public._nome(eu) || ')' || case when mot <> '' then ' — ' || mot else '' end);
  quem := array_remove(array_remove(array[c.atendente_id, c.consultor_id], null), eu);
  if array_length(quem, 1) > 0 then
    perform public._notificar(quem, '📅 Vinda à loja reagendada', c.cliente || ': nova data ' || public._fmt_dt_local(p_nova) || case when mot <> '' then ' — ' || mot else '' end, p_id, 'reloja-' || p_id || '-' || to_char(now(),'YYYYMMDDHH24MISS'));
  end if;
end $$;
revoke all on function public.reagendar_loja(text, timestamp without time zone, text) from public, anon;
grant execute on function public.reagendar_loja(text, timestamp without time zone, text) to authenticated;

-- Dados do cliente: só Gestão e supervisores (Supervisão / Supervisão de Marketing) alteram
create or replace function public.pode_editar_cliente() returns boolean
language sql stable security definer set search_path to '' as $$
  select public.usuario_ativo() and (public.eh_gestao() or public.meus_setores() && array['supervisao','marketing_supervisao']);
$$;
grant execute on function public.pode_editar_cliente() to authenticated;

create or replace function public.editar_cliente(p_id text, p jsonb)
returns void language plpgsql security definer set search_path to '' as $$
declare c public.chamados := public._chamado(p_id, false);
  nome text := btrim(coalesce(p->>'cliente', c.cliente)); doc text := btrim(coalesce(p->>'clienteDoc', c.cliente_doc));
  tel text := btrim(coalesce(p->>'telefone', c.telefone)); mail text := btrim(coalesce(p->>'email', c.email));
  ender text := btrim(coalesce(p->>'endereco', c.endereco)); mud text[] := '{}'; d int;
begin
  if not public.pode_editar_cliente() then raise exception 'Só a Gestão e os supervisores alteram os dados do cliente'; end if;
  if not public.pode_ver_chamado(c) then raise exception 'Sem acesso a este cliente'; end if;
  if nome = '' then raise exception 'Informe o nome do cliente'; end if;
  if regexp_replace(tel, '\D', '', 'g') = '' then raise exception 'Informe o telefone do cliente'; end if;
  d := length(regexp_replace(doc, '\D', '', 'g'));
  if doc <> '' and d not in (11, 14) then raise exception 'CPF deve ter 11 dígitos (ou CNPJ 14)'; end if;
  if not public.tipo_presale(c.tipo) and doc = '' then raise exception 'Informe o CPF/CNPJ do cliente'; end if;
  if nome <> c.cliente then mud := mud || ('nome: ' || c.cliente || ' → ' || nome); end if;
  if doc <> c.cliente_doc then mud := mud || ('CPF: ' || coalesce(nullif(c.cliente_doc,''),'—') || ' → ' || coalesce(nullif(doc,''),'—')); end if;
  if tel <> c.telefone then mud := mud || ('telefone: ' || coalesce(nullif(c.telefone,''),'—') || ' → ' || tel); end if;
  if mail <> c.email then mud := mud || ('e-mail: ' || coalesce(nullif(c.email,''),'—') || ' → ' || coalesce(nullif(mail,''),'—')); end if;
  if ender <> c.endereco then mud := mud || ('endereço: ' || coalesce(nullif(c.endereco,''),'—') || ' → ' || coalesce(nullif(ender,''),'—')); end if;
  if cardinality(mud) = 0 then raise exception 'Nada foi alterado'; end if;
  update public.chamados set cliente = nome, cliente_doc = doc, telefone = tel, email = mail, endereco = ender where id = p_id;
  perform public._reg(p_id, 'Dados do cliente alterados por ' || public._nome(auth.uid()) || ' — ' || array_to_string(mud, '; '));
end $$;
revoke all on function public.editar_cliente(text, jsonb) from public, anon;
grant execute on function public.editar_cliente(text, jsonb) to authenticated;
