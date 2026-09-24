-- Lead cadastrado já com consultor vai direto para o consultor (não fica parado na Supervisão Marketing).
create or replace function public.criar_chamado(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  eu public.usuarios := public._eu();
  t public.tipos;
  v_id text;
  v_consultor uuid;
  v_vinc text;
  v_sla timestamptz;
  v_data timestamp;
  v_fab uuid;
begin
  select * into t from public.tipos where id = p->>'tipo';
  if not found then raise exception 'Escolha o motivo do contato'; end if;
  if not public.pode_criar_tipo(t.id) then raise exception 'Você não tem permissão para abrir este motivo'; end if;
  if btrim(coalesce(p->>'cliente','')) = '' then raise exception 'Informe o nome do cliente'; end if;
  if btrim(coalesce(p->>'produto','')) = '' then raise exception 'Informe o produto'; end if;
  if btrim(coalesce(p->>'motivo','')) = '' then raise exception 'Descreva o detalhe do atendimento'; end if;
  if not t.presale then
    if btrim(coalesce(p->>'clienteDoc','')) = '' then raise exception 'Informe o CPF/CNPJ do cliente'; end if;
    if btrim(coalesce(p->>'pedido','')) = '' then raise exception 'Informe o nº da venda'; end if;
    v_fab := nullif(p->>'fabrica','')::uuid;
    if v_fab is not null and not exists (select 1 from public.fabricas where id = v_fab) then v_fab := null; end if;
    if t.id = 'prazo_fabrica' and v_fab is null then
      raise exception 'Selecione a fábrica / fornecedor';
    end if;
  end if;

  v_consultor := case when t.presale and not t.direto then nullif(p->>'consultorId','')::uuid end;
  if v_consultor is not null and not public._eh_consultor_valido(v_consultor) then
    raise exception 'Consultor inválido';
  end if;
  v_data := case when t.presale then nullif(p->>'dataVisita','')::timestamp end;

  v_sla := case when nullif(p->>'slaManual','') is not null
    then ((p->>'slaManual')::date + time '18:00') at time zone 'America/Sao_Paulo'
    else public.add_dias_uteis(now(), 2) end;

  v_vinc := nullif(p->>'vinculadoA','');
  if v_vinc is not null and not public.pode_ver_id(v_vinc) then v_vinc := null; end if;

  insert into public.chamados (
    tipo, setor_destino, status, sla_resposta, solicitante_id, solicitante_nome, solicitante_setor,
    cliente, cliente_doc, telefone, email, pedido, data_venda, pedido_fabrica, produto, fabrica_id,
    prazo_tatico, motivo, consultor_id, data_visita, endereco, data_loja, status_cliente, vinculado_a
  ) values (
    t.id, case when v_consultor is not null then 'consultor_externo' else t.setor_destino end,
    case when v_consultor is not null then 'tratativa'::public.status_chamado else 'aberta'::public.status_chamado end, v_sla, eu.id, eu.nome, public._setores_label(eu.id),
    btrim(p->>'cliente'), case when t.presale then '' else btrim(coalesce(p->>'clienteDoc','')) end, btrim(coalesce(p->>'telefone','')),
    case when t.presale then btrim(coalesce(p->>'email','')) else '' end,
    case when t.presale then '' else btrim(coalesce(p->>'pedido','')) end,
    case when t.presale then null else nullif(p->>'dataVenda','')::date end,
    case when t.presale then '' else btrim(coalesce(p->>'pedidoFabrica','')) end,
    btrim(p->>'produto'),
    case when t.presale then null else v_fab end,
    case when t.presale then null else nullif(p->>'prazoTatico','')::date end,
    btrim(p->>'motivo'),
    v_consultor,
    case when t.presale and not t.direto then v_data end,
    case when t.presale and not t.direto then btrim(coalesce(p->>'endereco','')) else '' end,
    case when t.direto then v_data end,
    case when t.direto then 'agendado_loja'::public.status_cliente when v_consultor is not null then 'direcionado_consultor'::public.status_cliente end,
    v_vinc
  ) returning id into v_id;

  perform public._reg(v_id, 'Solicitação aberta (' || t.nome || ') → ' || public._setor_nome(case when v_consultor is not null then 'consultor_externo' else t.setor_destino end)
    || case when v_consultor is not null then ' · atribuída a ' || public._nome(v_consultor) else '' end
    || case when v_vinc is not null then ' · vinculada ao atendimento ' || v_vinc else '' end);
  return v_id;
end $$;

-- leads que já tinham consultor escolhido e ficaram parados na Supervisão Marketing
update public.chamados c set setor_destino = 'consultor_externo', status_cliente = 'direcionado_consultor',
  status = case when c.status = 'aberta' then 'tratativa'::public.status_chamado else c.status end
from public.tipos t
where t.id = c.tipo and t.presale and not t.direto and c.setor_destino = 'marketing_supervisao' and c.consultor_id is not null;
