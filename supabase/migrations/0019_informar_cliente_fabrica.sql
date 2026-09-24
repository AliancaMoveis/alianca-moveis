-- 1) Setores que não falam com o cliente (ex.: Solicitação Fábrica): quando resolvem, o chamado vai para
--    "Informar cliente" e o call center avisa o cliente e conclui.
alter table public.setores add column if not exists via_callcenter boolean not null default false;
update public.setores set via_callcenter = true where id = 'prazo_fabrica';

create or replace function public._via_callcenter(p_setor text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select via_callcenter from public.setores where id = p_setor), false);
$$;
revoke execute on function public._via_callcenter(text) from authenticated, anon, public;

create or replace function public._label_status(s public.status_chamado) returns text
language sql immutable set search_path = '' as $$
  select case s when 'aberta' then 'Aberta' when 'tratativa' then 'Em tratativa'
    when 'respondida' then 'Respondida' when 'informar' then 'Informar cliente' when 'concluida' then 'Concluída' end;
$$;

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
  if p_status = 'concluida' and c.status <> 'informar' and public._via_callcenter(c.setor_destino)
     and public.eh_callcenter() is not true and public.tem_lib('verTudo') is not true then
    novo := 'informar';
  end if;
  if c.status = novo then return; end if;
  update public.chamados set status = novo where id = p_id;
  perform public._reg(p_id, 'Status → ' || public._label_status(novo)
    || case when novo = 'informar' then ' (o call center avisa o cliente)' when not trata then ' (cliente informado pelo call center)' else '' end);
end $$;

create or replace function public.registrar_retorno(p_id text, p_previsao date, p_quem text, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true); via boolean := public._via_callcenter(c.setor_destino);
begin
  if public.tipo_presale(c.tipo) then raise exception 'Ação não disponível para clientes do marketing'; end if;
  if p_previsao is null and btrim(coalesce(p_texto,'')) = '' then raise exception 'Preencha previsão ou observação'; end if;
  update public.chamados set
    resposta_previsao = p_previsao, resposta_quem = btrim(coalesce(p_quem,'')), resposta_texto = btrim(coalesce(p_texto,'')),
    resposta_quando = now(),
    status = case when via and c.status in ('aberta','tratativa','respondida') then 'informar'::public.status_chamado
                  when c.status in ('aberta','tratativa') then 'respondida'::public.status_chamado else c.status end
  where id = p_id;
  perform public._reg(p_id, 'Retorno registrado' || case when p_previsao is not null then ' · previsão ' || public._fmt_data(p_previsao) else '' end
    || case when via then ' · call center informa o cliente' else '' end);
end $$;

-- 2) Fábrica: obrigatória só em "Prazo de fábrica"; nos demais motivos é opcional
create or replace function public.definir_fabrica(p_id text, p_fab uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true);
begin
  if p_fab is null or not exists (select 1 from public.fabricas where id = p_fab) then raise exception 'Selecione a fábrica'; end if;
  update public.chamados set fabrica_id = p_fab where id = p_id;
  perform public._reg(p_id, 'Fábrica definida: ' || (select nome from public.fabricas where id = p_fab));
end $$;

create or replace function public.salvar_setor(p_id text, p_nome text, p_libs jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  perform public._exigir_admin();
  if btrim(coalesce(p_nome,'')) = '' then raise exception 'Informe o nome'; end if;
  if p_id is null then
    v := 'set_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
    insert into public.setores (id, nome, lib_criar, lib_ver_tudo, lib_cadastros, lib_admin, lib_ver_marketing, via_callcenter, ordem)
      values (v, btrim(p_nome), coalesce((p_libs->>'criar')::boolean,false), coalesce((p_libs->>'verTudo')::boolean,false),
              coalesce((p_libs->>'cadastros')::boolean,false), coalesce((p_libs->>'admin')::boolean,false),
              coalesce((p_libs->>'verMarketing')::boolean,false), coalesce((p_libs->>'viaCallcenter')::boolean,false),
              (select coalesce(max(ordem),0)+1 from public.setores));
  else
    v := p_id;
    update public.setores set nome = btrim(p_nome),
      lib_criar = coalesce((p_libs->>'criar')::boolean,false), lib_ver_tudo = coalesce((p_libs->>'verTudo')::boolean,false),
      lib_cadastros = coalesce((p_libs->>'cadastros')::boolean,false), lib_admin = coalesce((p_libs->>'admin')::boolean,false),
      lib_ver_marketing = coalesce((p_libs->>'verMarketing')::boolean,false), via_callcenter = coalesce((p_libs->>'viaCallcenter')::boolean,false)
    where id = p_id;
    if not exists (select 1 from public.setores s join public.usuario_setores us on us.setor_id = s.id
                   join public.usuarios u on u.id = us.usuario_id where s.lib_admin and u.ativo) then
      raise exception 'Pelo menos um setor com usuários ativos precisa manter a liberação de Administração';
    end if;
  end if;
  return v;
end $$;

revoke execute on all functions in schema public from anon, public;
grant execute on function public.definir_fabrica(text, uuid) to authenticated;

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
    t.id, t.setor_destino, 'aberta', v_sla, eu.id, eu.nome, public._setores_label(eu.id),
    btrim(p->>'cliente'), btrim(coalesce(p->>'clienteDoc','')), btrim(coalesce(p->>'telefone','')),
    case when t.presale then btrim(coalesce(p->>'email','')) else '' end,
    case when t.presale then '' else btrim(coalesce(p->>'pedido','')) end,
    nullif(p->>'dataVenda','')::date,
    btrim(coalesce(p->>'pedidoFabrica','')),
    btrim(p->>'produto'),
    case when t.presale then null else v_fab end,
    nullif(p->>'prazoTatico','')::date,
    btrim(p->>'motivo'),
    v_consultor,
    case when t.presale and not t.direto then v_data end,
    case when t.presale and not t.direto then btrim(coalesce(p->>'endereco','')) else '' end,
    case when t.direto then v_data end,
    case when t.direto then 'agendado_loja'::public.status_cliente end,
    v_vinc
  ) returning id into v_id;

  perform public._reg(v_id, 'Solicitação aberta (' || t.nome || ') → ' || public._setor_nome(t.setor_destino)
    || case when v_consultor is not null then ' · atribuída a ' || public._nome(v_consultor) else '' end
    || case when v_vinc is not null then ' · vinculada ao atendimento ' || v_vinc else '' end);
  return v_id;
end $$;
