-- ALIANÇA 360 — ações (RPC). Cada função confere a permissão no banco e grava o histórico
-- com os mesmos textos do protótipo.

-- ================= utilitários =================
create or replace function public._eu() returns public.usuarios
language plpgsql stable security definer set search_path = '' as $$
declare u public.usuarios;
begin
  select * into u from public.usuarios where id = auth.uid();
  if not found or not u.ativo then
    raise exception 'Usuário sem acesso ao sistema';
  end if;
  return u;
end $$;

create or replace function public._nome(p uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select nome from public.usuarios where id = p), '—');
$$;

create or replace function public._setor_nome(p text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select nome from public.setores where id = p), coalesce(p, '—'));
$$;

create or replace function public._setores_label(p uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(string_agg(s.nome, ', ' order by us.ordem), ''), '—')
  from public.usuario_setores us join public.setores s on s.id = us.setor_id where us.usuario_id = p;
$$;

create or replace function public._tipo_nome(p text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select nome from public.tipos where id = p), coalesce(p, '—'));
$$;

create or replace function public._fmt_data(d date) returns text
language sql immutable set search_path = '' as $$ select to_char(d, 'DD/MM/YYYY'); $$;

create or replace function public._fmt_data_ts(t timestamptz) returns text
language sql stable set search_path = '' as $$ select to_char(t at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'); $$;

create or replace function public._fmt_dt_local(t timestamp) returns text
language sql immutable set search_path = '' as $$ select to_char(t, 'DD/MM/YYYY, HH24:MI'); $$;

create or replace function public.add_dias_uteis(base timestamptz, dias integer) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare d timestamp := base at time zone 'America/Sao_Paulo'; a integer := 0;
begin
  while a < dias loop
    d := d + interval '1 day';
    if extract(isodow from d) < 6 then a := a + 1; end if;
  end loop;
  return d at time zone 'America/Sao_Paulo';
end $$;

create or replace function public._reg(p_chamado text, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.historico (chamado_id, quem_id, quem_nome, texto)
  values (p_chamado, auth.uid(), public._nome(auth.uid()), p_texto);
end $$;

-- rótulos
create or replace function public._label_status(s public.status_chamado) returns text
language sql immutable set search_path = '' as $$
  select case s when 'aberta' then 'Aberta' when 'tratativa' then 'Em tratativa'
    when 'respondida' then 'Respondida' when 'concluida' then 'Concluída' end;
$$;

create or replace function public._label_status_cliente(s public.status_cliente) returns text
language sql immutable set search_path = '' as $$
  select case s
    when 'aguardando_consultor' then 'Aguardando consultor'
    when 'direcionado_consultor' then 'Direcionado ao consultor'
    when 'visita_realizada' then 'Visita realizada'
    when 'agendado_loja' then 'Agendado loja'
    when 'com_vendedor' then 'Com vendedor'
    when 'vendido_revisao' then 'Vendido — a confirmar'
    when 'vendido_promissoria' then 'Vendido — promissória'
    when 'vendido' then 'Vendido — efetivado'
    when 'venda_cancelada' then 'Venda cancelada'
    when 'nao_compareceu' then 'Não compareceu'
    else '—' end;
$$;

create or replace function public._label_venda(s public.status_venda) returns text
language sql immutable set search_path = '' as $$
  select case s when 'registrada' then 'Aguardando confirmação da Gestão'
    when 'promissoria' then 'Promissória — sem pagamento'
    when 'efetivada' then 'Efetivada' when 'cancelada' then 'Cancelada' end;
$$;

create or replace function public._venda_para_cliente(s public.status_venda) returns public.status_cliente
language sql immutable set search_path = '' as $$
  select (case s when 'registrada' then 'vendido_revisao' when 'promissoria' then 'vendido_promissoria'
    when 'efetivada' then 'vendido' when 'cancelada' then 'venda_cancelada' end)::public.status_cliente;
$$;

-- status do cliente derivado (normalizarStatusCliente do protótipo)
create or replace function public.status_cliente_de(c public.chamados) returns public.status_cliente
language plpgsql stable security definer set search_path = '' as $$
declare vs public.status_venda;
begin
  if public.tipo_presale(c.tipo) then
    select status into vs from public.vendas where chamado_id = c.id;
    if vs is not null then return public._venda_para_cliente(vs); end if;
    if c.status_cliente = 'nao_compareceu' then return 'nao_compareceu'; end if;
    if c.setor_destino = 'marketing_supervisao' then return 'aguardando_consultor'; end if;
    if c.setor_destino = 'consultor_externo' then
      return case when coalesce((c.tratativa->>'realizada')::boolean, false) then 'visita_realizada' else 'direcionado_consultor' end;
    end if;
    if c.setor_destino = 'suporte_consultores' then return 'agendado_loja'; end if;
    if c.setor_destino = 'atendente_cliente' then return 'com_vendedor'; end if;
  end if;
  return coalesce(c.status_cliente, 'aguardando_consultor');
end $$;

-- carrega o chamado (travado) conferindo leitura; opcionalmente exige "tratar"
create or replace function public._chamado(p_id text, p_tratar boolean default false) returns public.chamados
language plpgsql security definer set search_path = '' as $$
declare c public.chamados;
begin
  perform public._eu();
  select * into c from public.chamados where id = p_id for update;
  if not found or not public.pode_ver_chamado(c) then
    raise exception 'Chamado não encontrado';
  end if;
  if p_tratar and not public.pode_tratar_chamado(c) then
    raise exception 'Você tem acesso de leitura a este chamado. Quem trata é o setor %', public._setor_nome(c.setor_destino);
  end if;
  return c;
end $$;

create or replace function public._eh_consultor_valido(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.usuarios u join public.usuario_setores us on us.usuario_id = u.id
    where u.id = p and u.ativo and u.somente_atribuidos and us.setor_id = 'consultor_externo');
$$;

create or replace function public._eh_projetista_valido(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.usuarios u join public.usuario_setores us on us.usuario_id = u.id
    where u.id = p and u.ativo and u.somente_atribuidos and us.setor_id = 'atendente_cliente');
$$;

-- ================= abertura =================
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
    if v_fab is null or not exists (select 1 from public.fabricas where id = v_fab) then
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

-- ================= tratativa (call center e setores) =================
create or replace function public.alternar_urgente(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true);
begin
  update public.chamados set urgente = not c.urgente where id = p_id;
  perform public._reg(p_id, case when not c.urgente then 'Marcado como URGENTE' else 'Urgência removida' end);
end $$;

create or replace function public.mudar_status(p_id text, p_status public.status_chamado) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true);
begin
  if public.tipo_presale(c.tipo) then raise exception 'No marketing o status segue as etapas do cliente'; end if;
  if c.status = p_status then return; end if;
  update public.chamados set status = p_status where id = p_id;
  perform public._reg(p_id, 'Status → ' || public._label_status(p_status));
end $$;

create or replace function public.registrar_retorno(p_id text, p_previsao date, p_quem text, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true);
begin
  if public.tipo_presale(c.tipo) then raise exception 'Ação não disponível para clientes do marketing'; end if;
  if p_previsao is null and btrim(coalesce(p_texto,'')) = '' then raise exception 'Preencha previsão ou observação'; end if;
  update public.chamados set
    resposta_previsao = p_previsao, resposta_quem = btrim(coalesce(p_quem,'')), resposta_texto = btrim(coalesce(p_texto,'')),
    resposta_quando = now(),
    status = case when c.status in ('aberta','tratativa') then 'respondida'::public.status_chamado else c.status end
  where id = p_id;
  perform public._reg(p_id, 'Retorno registrado' || case when p_previsao is not null then ' · previsão ' || public._fmt_data(p_previsao) else '' end);
end $$;

create or replace function public.alterar_prazo(p_id text, p_data date) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true); v timestamptz;
begin
  if p_data is null then raise exception 'Informe a data limite'; end if;
  if public.tipo_presale(c.tipo) then raise exception 'Ação não disponível para clientes do marketing'; end if;
  v := (p_data + time '18:00') at time zone 'America/Sao_Paulo';
  update public.chamados set sla_resposta = v where id = p_id;
  perform public._reg(p_id, 'Prazo alterado para ' || public._fmt_data_ts(v));
end $$;

create or replace function public.adicionar_nota(p_id text, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true);
begin
  if btrim(coalesce(p_texto,'')) = '' then raise exception 'Escreva a anotação'; end if;
  perform public._reg(p_id, btrim(p_texto));
end $$;

create or replace function public.salvar_tratativa(p_id text, p_campos jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.chamados := public._chamado(p_id, true);
  t jsonb := c.tratativa;
  k text;
begin
  foreach k in array array['agenda','montador','peca','data','medidas','obs','vendedor'] loop
    if p_campos ? k then t := t || jsonb_build_object(k, btrim(coalesce(p_campos->>k,''))); end if;
  end loop;
  update public.chamados set tratativa = t where id = p_id;
  perform public._reg(p_id, 'Tratativa atualizada');
end $$;

create or replace function public.alternar_marcacao(p_id text, p_campo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.chamados := public._chamado(p_id, true);
  atual boolean := coalesce((c.tratativa->>p_campo)::boolean, false);
  novo boolean := not atual;
  txt text;
  novo_status public.status_chamado := c.status;
  novo_sc public.status_cliente := c.status_cliente;
begin
  if p_campo = 'aprovada' and c.tipo = 'vistoria' then
    txt := case when novo then 'Vistoria aprovada' else 'Aprovação de vistoria removida' end;
  elsif p_campo = 'confirmado' and c.tipo = 'medidas' then
    txt := case when novo then 'Medidas confirmadas com o cliente' else 'Confirmação removida' end;
  elsif p_campo = 'entregaTatico' and c.tipo = 'entrega' then
    txt := case when novo then 'Colocado para entrega no Tático' else 'Removido do Tático' end;
    if novo and c.status = 'aberta' then novo_status := 'tratativa'; end if;
  elsif p_campo = 'contatoIniciado' and c.setor_destino = 'consultor_externo' then
    txt := case when novo then 'Contato com o cliente iniciado' else 'Marcação de contato iniciado removida' end;
    if novo and c.status = 'aberta' then novo_status := 'tratativa'; end if;
  elsif p_campo = 'realizada' and c.setor_destino = 'consultor_externo' then
    txt := case when novo then 'Visita marcada como realizada' else 'Marcação de visita realizada removida' end;
    if novo then
      novo_sc := 'visita_realizada';
      if c.status = 'aberta' then novo_status := 'tratativa'; end if;
    end if;
  else
    raise exception 'Ação não disponível nesta etapa';
  end if;
  update public.chamados set tratativa = c.tratativa || jsonb_build_object(p_campo, novo),
    status = novo_status, status_cliente = novo_sc where id = p_id;
  perform public._reg(p_id, txt);
end $$;

create or replace function public.entrega_para_fabrica(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true); dest text;
begin
  if c.tipo <> 'entrega' then raise exception 'Ação disponível só para entrega'; end if;
  select setor_destino into dest from public.tipos where id = 'prazo_fabrica';
  update public.chamados set tipo = 'prazo_fabrica', setor_destino = dest where id = p_id;
  perform public._reg(p_id, 'Sem disponibilidade para entrega — encaminhado para Prazo de fábrica');
end $$;

create or replace function public.encaminhar_setor(p_id text, p_setor text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false); s public.setores;
begin
  if not (public.tem_lib('verTudo') or (public.pode_tratar_chamado(c) and c.setor_destino = 'callcenter')) then
    raise exception 'Você não pode encaminhar este chamado';
  end if;
  select * into s from public.setores where id = p_setor;
  if not found or s.lib_ver_tudo then raise exception 'Setor inválido'; end if;
  if p_setor = any(public.setores_marketing()) and not (public.eh_gestao() or public.tem_lib('verMarketing')) then
    raise exception 'Setor inválido';
  end if;
  if p_setor = c.setor_destino then raise exception 'Já está neste setor'; end if;
  update public.chamados set setor_destino = p_setor where id = p_id;
  perform public._reg(p_id, 'Encaminhado para ' || s.nome);
end $$;

-- ================= funil de marketing =================
create or replace function public.alterar_status_cliente(p_id text, p_novo public.status_cliente) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.chamados := public._chamado(p_id, false);
  antes public.status_cliente;
  v public.vendas;
begin
  if not public.tipo_presale(c.tipo) then raise exception 'Ação disponível só para clientes do marketing'; end if;
  if not (public.pode_tratar_chamado(c) or public.eh_gestao()) then raise exception 'Você não pode alterar este cliente'; end if;
  antes := public.status_cliente_de(c);
  if p_novo = antes then raise exception 'O status já é esse'; end if;
  -- situação de venda é decisão exclusiva da Gestão
  if p_novo in ('vendido','vendido_promissoria','venda_cancelada','vendido_revisao') and not public.eh_gestao() then
    raise exception 'Só a Gestão pode confirmar a venda como efetivada';
  end if;
  select * into v from public.vendas where chamado_id = p_id for update;
  if p_novo = 'vendido' and not found then
    raise exception 'Registre os dados da venda abaixo — número e valor são obrigatórios';
  end if;
  if p_novo = 'vendido' and v.status <> 'efetivada' then
    update public.vendas set status = 'efetivada', decidido_por = auth.uid(), decidido_em = now() where chamado_id = p_id;
  end if;
  update public.chamados set status_cliente = p_novo,
    status = case when p_novo in ('vendido','nao_compareceu') then 'concluida'::public.status_chamado
                  when c.status = 'concluida' then 'tratativa'::public.status_chamado else c.status end
  where id = p_id;
  perform public._reg(p_id, 'Status do cliente alterado: ' || public._label_status_cliente(antes) || ' → ' || public._label_status_cliente(p_novo));
end $$;

create or replace function public.direcionar_consultor(p_id text, p_consultor uuid, p_data_visita timestamp, p_endereco text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true); dv timestamp;
begin
  if not public.tipo_presale(c.tipo) or c.setor_destino <> 'marketing_supervisao' then
    raise exception 'Ação não disponível nesta etapa';
  end if;
  if p_consultor is null then raise exception 'Selecione o consultor'; end if;
  if not public._eh_consultor_valido(p_consultor) then raise exception 'Consultor inválido'; end if;
  dv := coalesce(p_data_visita, c.data_visita);
  update public.chamados set consultor_id = p_consultor, setor_destino = 'consultor_externo',
    status_cliente = 'direcionado_consultor', data_visita = dv,
    endereco = case when btrim(coalesce(p_endereco,'')) <> '' then btrim(p_endereco) else c.endereco end,
    status = case when c.status = 'aberta' then 'tratativa'::public.status_chamado else c.status end
  where id = p_id;
  perform public._reg(p_id, 'Direcionado ao consultor ' || public._nome(p_consultor)
    || case when dv is not null then ' · visita ' || public._fmt_data(dv::date) else '' end);
end $$;

create or replace function public.agendar_loja(p_id text, p_data_loja timestamp, p_medidas text, p_obs text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true);
begin
  if not public.tipo_presale(c.tipo) or c.setor_destino <> 'consultor_externo' then
    raise exception 'Ação não disponível nesta etapa';
  end if;
  if p_data_loja is null then raise exception 'Informe a data da vinda à loja'; end if;
  update public.chamados set
    tratativa = c.tratativa || jsonb_build_object('medidas', btrim(coalesce(p_medidas,'')), 'obs', btrim(coalesce(p_obs,''))),
    data_loja = p_data_loja, setor_destino = 'suporte_consultores', status = 'respondida', status_cliente = 'agendado_loja'
  where id = p_id;
  perform public._reg(p_id, 'Vinda à loja agendada para ' || public._fmt_data(p_data_loja::date) || ' — encaminhado ao Suporte Consultores Externos');
end $$;

create or replace function public.designar_projetista(p_id text, p_atendente uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true);
begin
  if not public.pode_editar_agenda() then
    raise exception 'O Suporte a Consultores, a Supervisão de Marketing ou a Gestão fazem esse direcionamento.';
  end if;
  if not public.tipo_presale(c.tipo) or c.setor_destino <> 'suporte_consultores' then
    raise exception 'Ação não disponível nesta etapa';
  end if;
  if p_atendente is null then raise exception 'Selecione o atendente'; end if;
  if not public._eh_projetista_valido(p_atendente) then raise exception 'Projetista inválido'; end if;
  update public.chamados set atendente_id = p_atendente, setor_destino = 'atendente_cliente', status_cliente = 'com_vendedor',
    status = case when c.status = 'aberta' then 'tratativa'::public.status_chamado else c.status end
  where id = p_id;
  perform public._reg(p_id, 'Direcionado ao projetista ' || public._nome(p_atendente) || ' — cliente com vendedor');
end $$;

create or replace function public.marcar_comparecimento(p_id text, p_acao text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true);
begin
  if not public.tipo_presale(c.tipo) or c.setor_destino <> 'atendente_cliente' then
    raise exception 'Ação não disponível nesta etapa';
  end if;
  if exists (select 1 from public.vendas where chamado_id = p_id) then
    raise exception 'Este cliente já tem venda registrada';
  end if;
  if p_acao = 'chegou' then
    update public.chamados set status_cliente = 'com_vendedor' where id = p_id;
    perform public._reg(p_id, 'Cliente chegou — atendimento iniciado com vendedor');
  elsif p_acao = 'nao_compareceu' then
    update public.chamados set status_cliente = 'nao_compareceu', status = 'concluida' where id = p_id;
    perform public._reg(p_id, 'Cliente não compareceu à loja');
  elsif p_acao = 'voltou' then
    update public.chamados set status_cliente = 'com_vendedor', status = 'tratativa' where id = p_id;
    perform public._reg(p_id, 'Cliente veio afinal — reaberto');
  else
    raise exception 'Ação inválida';
  end if;
end $$;

create or replace function public.reagendar_loja(p_id text, p_nova timestamp) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false);
begin
  if not public.tipo_presale(c.tipo) or c.data_loja is null then raise exception 'Este cliente não tem vinda à loja agendada'; end if;
  if not (public.pode_editar_agenda() or c.consultor_id is not distinct from auth.uid()) then
    raise exception 'Reagendamento feito pelo consultor, Suporte, Supervisão de Marketing ou Gestão.';
  end if;
  if p_nova is null then raise exception 'Informe a nova data'; end if;
  if date_trunc('minute', p_nova) = date_trunc('minute', c.data_loja) then raise exception 'A data já é essa'; end if;
  update public.chamados set data_loja = p_nova where id = p_id;
  perform public._reg(p_id, 'Reagendamento da vinda à loja: ' || public._fmt_dt_local(c.data_loja) || ' → '
    || public._fmt_dt_local(p_nova) || ' (por ' || public._nome(auth.uid()) || ')');
end $$;

-- ================= vendedor designado / transferências =================
create or replace function public.trocar_vendedor(p_id text, p_novo uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false);
begin
  if not public.pode_editar_agenda() then raise exception 'Só Gestão, Supervisão de Marketing ou Suporte trocam o vendedor direto'; end if;
  if c.atendente_id is null then raise exception 'Este cliente ainda não tem vendedor'; end if;
  if p_novo is null then raise exception 'Selecione o vendedor'; end if;
  if not public._eh_projetista_valido(p_novo) or p_novo = c.atendente_id then raise exception 'Vendedor inválido'; end if;
  update public.transferencias set status = 'cancelada', decidido_por = auth.uid(), decidido_em = now()
    where chamado_id = p_id and status = 'pendente';
  update public.chamados set atendente_id = p_novo where id = p_id;
  perform public._reg(p_id, 'Vendedor alterado: ' || public._nome(c.atendente_id) || ' → ' || public._nome(p_novo)
    || ' (troca direta por ' || public._nome(auth.uid()) || ')');
end $$;

create or replace function public.solicitar_transferencia(p_id text, p_para uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false);
begin
  if p_para is null then raise exception 'Indique o vendedor'; end if;
  -- quem tem autoridade nunca gera pendência: a troca é aplicada na hora
  if public.pode_editar_agenda() then
    perform public.trocar_vendedor(p_id, p_para);
    return 'direta';
  end if;
  if c.atendente_id is distinct from auth.uid() then raise exception 'Só o vendedor atual pode pedir a transferência'; end if;
  if not public._eh_projetista_valido(p_para) or p_para = c.atendente_id then raise exception 'Vendedor inválido'; end if;
  if exists (select 1 from public.transferencias where chamado_id = p_id and status = 'pendente') then
    raise exception 'Já existe uma transferência pendente para este cliente';
  end if;
  insert into public.transferencias (chamado_id, de_usuario, para_usuario, solicitado_por)
    values (p_id, c.atendente_id, p_para, auth.uid());
  perform public._reg(p_id, 'Transferência solicitada: ' || public._nome(c.atendente_id) || ' → ' || public._nome(p_para)
    || ' — aguardando aceite/aprovação');
  return 'pendente';
end $$;

create or replace function public.responder_transferencia(p_id text, p_aceitar boolean, p_origem text default 'detalhe') returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false); tr public.transferencias;
begin
  select * into tr from public.transferencias where chamado_id = p_id and status = 'pendente' for update;
  if not found then raise exception 'Não há transferência pendente'; end if;
  if not (tr.para_usuario = auth.uid() or public.pode_editar_agenda()) then
    raise exception 'Aguardando aceite do vendedor indicado ou aprovação da Gestão/Supervisão/Suporte';
  end if;
  update public.transferencias set status = case when p_aceitar then 'aceita'::public.status_transferencia else 'recusada'::public.status_transferencia end,
    decidido_por = auth.uid(), decidido_em = now() where id = tr.id;
  if p_aceitar then
    update public.chamados set atendente_id = tr.para_usuario where id = p_id;
    if p_origem = 'aprovacoes' then
      perform public._reg(p_id, 'Transferência aprovada: ' || public._nome(tr.de_usuario) || ' → ' || public._nome(tr.para_usuario));
    else
      perform public._reg(p_id, 'Transferência confirmada: ' || public._nome(tr.de_usuario) || ' → ' || public._nome(tr.para_usuario)
        || ' (por ' || public._nome(auth.uid()) || ')');
    end if;
  else
    if p_origem = 'aprovacoes' then
      perform public._reg(p_id, 'Transferência recusada — cliente permanece com ' || public._nome(tr.de_usuario));
    else
      perform public._reg(p_id, 'Transferência recusada por ' || public._nome(auth.uid()) || ' — cliente permanece com ' || public._nome(c.atendente_id));
    end if;
  end if;
end $$;

create or replace function public.cancelar_transferencia(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false);
begin
  if not (public.pode_editar_agenda() or c.atendente_id is not distinct from auth.uid()) then raise exception 'Você não pode cancelar esta solicitação'; end if;
  update public.transferencias set status = 'cancelada', decidido_por = auth.uid(), decidido_em = now()
    where chamado_id = p_id and status = 'pendente';
  if not found then raise exception 'Não há transferência pendente'; end if;
  perform public._reg(p_id, 'Solicitação de transferência cancelada por ' || public._nome(auth.uid()));
end $$;

-- ================= vendas =================
create or replace function public.registrar_venda(p_id text, p_numero text, p_valor numeric, p_data date, p_vendedor text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false); v public.vendas; editando boolean;
begin
  if not public.tipo_presale(c.tipo) then raise exception 'Ação disponível só para clientes do marketing'; end if;
  if not (public.pode_tratar_chamado(c) or public.eh_gestao()) then raise exception 'Você não pode registrar venda neste cliente'; end if;
  if btrim(coalesce(p_numero,'')) = '' then raise exception 'Informe o número da venda'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor da venda'; end if;
  if btrim(coalesce(p_vendedor,'')) = '' then raise exception 'Informe o vendedor da loja'; end if;
  select * into v from public.vendas where chamado_id = p_id for update;
  editando := found;
  if editando and v.status <> 'registrada' then
    raise exception 'Esta venda já foi decidida pela Gestão. Só a Gestão altera.';
  end if;
  insert into public.vendas (chamado_id, numero, data_venda, vendedor, atendente_nome, status, registrado_por, registrado_em)
    values (p_id, btrim(p_numero), p_data, btrim(p_vendedor), coalesce((select nome from public.usuarios where id = c.atendente_id), ''),
            'registrada', auth.uid(), now())
    on conflict (chamado_id) do update set numero = excluded.numero, data_venda = excluded.data_venda,
      vendedor = excluded.vendedor, atendente_nome = excluded.atendente_nome, registrado_por = excluded.registrado_por,
      registrado_em = excluded.registrado_em;
  insert into public.vendas_valores (chamado_id, valor) values (p_id, round(p_valor, 2))
    on conflict (chamado_id) do update set valor = excluded.valor;
  update public.chamados set status_cliente = 'vendido_revisao', status = 'concluida' where id = p_id;
  perform public._reg(p_id, 'Venda ' || btrim(p_numero) || case when editando then ' atualizada por ' else ' registrada por ' end
    || btrim(p_vendedor) || case when p_data is not null then ' em ' || public._fmt_data(p_data) else '' end
    || ' — aguardando confirmação da Gestão');
end $$;

create or replace function public.decidir_venda(p_id text, p_novo public.status_venda, p_origem text default 'detalhe') returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados; v public.vendas; efeito text;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão pode decidir a situação da venda'; end if;
  c := public._chamado(p_id, false);
  select * into v from public.vendas where chamado_id = p_id for update;
  if not found then raise exception 'Este cliente não tem venda registrada'; end if;
  if v.status = p_novo then raise exception 'A situação já é essa'; end if;
  update public.vendas set status = p_novo, decidido_por = auth.uid(), decidido_em = now() where chamado_id = p_id;
  update public.chamados set status_cliente = public._venda_para_cliente(p_novo),
    status = case when p_novo = 'cancelada' then 'tratativa'::public.status_chamado else 'concluida'::public.status_chamado end
  where id = p_id;
  efeito := case p_novo when 'efetivada' then ' — passa a gerar comissão'
    when 'promissoria' then ' — conta como venda, sem comissão'
    when 'cancelada' then ' — não conta em relatórios' else '' end;
  perform public._reg(p_id, 'Situação da venda ' || v.numero || ': ' || public._label_venda(v.status) || ' → '
    || public._label_venda(p_novo) || efeito
    || case when p_origem = 'aprovacoes' then '' else ' (por ' || public._nome(auth.uid()) || ')' end);
end $$;

create or replace function public.corrigir_venda(p_id text, p_numero text, p_valor numeric, p_data date, p_vendedor text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados; v public.vendas; val numeric;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão corrige os dados da venda'; end if;
  c := public._chamado(p_id, false);
  select * into v from public.vendas where chamado_id = p_id for update;
  if not found then raise exception 'Este cliente não tem venda registrada'; end if;
  if btrim(coalesce(p_numero,'')) = '' then raise exception 'Informe o número da venda'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor da venda'; end if;
  select valor into val from public.vendas_valores where chamado_id = p_id;
  if v.numero = btrim(p_numero) and val = round(p_valor,2) and v.data_venda is not distinct from p_data
     and v.vendedor = btrim(coalesce(p_vendedor,'')) then
    raise exception 'Nada mudou';
  end if;
  update public.vendas set numero = btrim(p_numero), data_venda = p_data,
    vendedor = coalesce(nullif(btrim(coalesce(p_vendedor,'')),''), v.vendedor) where chamado_id = p_id;
  insert into public.vendas_valores (chamado_id, valor) values (p_id, round(p_valor,2))
    on conflict (chamado_id) do update set valor = excluded.valor;
  perform public._reg(p_id, 'Dados da venda corrigidos pela Gestão: nº ' || btrim(p_numero) || ' · R$ '
    || to_char(round(p_valor,2), 'FM999G999G990D00') || ' · '
    || coalesce(public._fmt_data(p_data), '—') || ' · ' || coalesce(nullif(btrim(coalesce(p_vendedor,'')),''), v.vendedor));
end $$;

-- ================= anexos =================
create or replace function public.adicionar_anexos(p_id text, p_itens jsonb, p_registrar boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare it jsonb; tem_img boolean := false; n_links integer := 0;
begin
  perform public._eu();
  if not public.pode_anexar_id(p_id) then raise exception 'Você não pode anexar neste chamado'; end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    if it->>'tipo' = 'img' then
      if coalesce(it->>'storage_path','') not like p_id || '/%' then raise exception 'Arquivo inválido'; end if;
      insert into public.anexos (chamado_id, tipo, nome, storage_path, criado_por)
        values (p_id, 'img', coalesce(it->>'nome','foto'), it->>'storage_path', auth.uid());
      tem_img := true;
    elsif it->>'tipo' = 'link' then
      if btrim(coalesce(it->>'url','')) = '' then continue; end if;
      insert into public.anexos (chamado_id, tipo, nome, url, criado_por)
        values (p_id, 'link', btrim(it->>'url'), btrim(it->>'url'), auth.uid());
      n_links := n_links + 1;
    end if;
  end loop;
  if p_registrar then
    if tem_img then perform public._reg(p_id, 'Anexo(s) adicionado(s)'); end if;
    for i in 1..n_links loop perform public._reg(p_id, 'Link anexado'); end loop;
  end if;
end $$;

create or replace function public.remover_anexo(p_anexo uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare a public.anexos; c public.chamados;
begin
  select * into a from public.anexos where id = p_anexo for update;
  if not found then raise exception 'Anexo não encontrado'; end if;
  c := public._chamado(a.chamado_id, false);
  if not public.pode_anexar_chamado(c) then raise exception 'Você não pode remover anexos deste chamado'; end if;
  delete from public.anexos where id = p_anexo;
  perform public._reg(a.chamado_id, 'Anexo removido: ' || a.nome);
  return a.storage_path;
end $$;

-- ================= cadastros (Fábricas) =================
create or replace function public.salvar_fabrica(p_id uuid, p_nome text, p_emails text, p_rep uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform public._eu();
  if not public.tem_lib('cadastros') then raise exception 'Sem acesso a Fábricas'; end if;
  if btrim(coalesce(p_nome,'')) = '' then raise exception 'Informe o nome'; end if;
  if p_id is null then
    insert into public.fabricas (nome, emails, representante_id) values (btrim(p_nome), btrim(coalesce(p_emails,'')), p_rep) returning id into v;
  else
    update public.fabricas set nome = btrim(p_nome), emails = btrim(coalesce(p_emails,'')), representante_id = p_rep where id = p_id returning id into v;
  end if;
  return v;
end $$;

create or replace function public.remover_fabrica(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._eu();
  if not public.tem_lib('cadastros') then raise exception 'Sem acesso a Fábricas'; end if;
  if exists (select 1 from public.chamados where fabrica_id = p_id) then raise exception 'Há chamados usando esta fábrica'; end if;
  delete from public.fabricas where id = p_id;
end $$;

create or replace function public.salvar_representante(p_id uuid, p_nome text, p_whats text, p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform public._eu();
  if not public.tem_lib('cadastros') then raise exception 'Sem acesso a Fábricas'; end if;
  if btrim(coalesce(p_nome,'')) = '' then raise exception 'Informe o nome'; end if;
  if p_id is null then
    insert into public.representantes (nome, whats, email) values (btrim(p_nome), btrim(coalesce(p_whats,'')), btrim(coalesce(p_email,''))) returning id into v;
  else
    update public.representantes set nome = btrim(p_nome), whats = btrim(coalesce(p_whats,'')), email = btrim(coalesce(p_email,'')) where id = p_id returning id into v;
  end if;
  return v;
end $$;

create or replace function public.remover_representante(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._eu();
  if not public.tem_lib('cadastros') then raise exception 'Sem acesso a Fábricas'; end if;
  if exists (select 1 from public.fabricas where representante_id = p_id) then raise exception 'Há fábricas usando este representante'; end if;
  delete from public.representantes where id = p_id;
end $$;

-- ================= administração (Gestão) =================
create or replace function public._exigir_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._eu();
  if not public.eh_gestao() then raise exception 'Acesso restrito à Administração'; end if;
end $$;

create or replace function public.salvar_setor(p_id text, p_nome text, p_libs jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  perform public._exigir_admin();
  if btrim(coalesce(p_nome,'')) = '' then raise exception 'Informe o nome'; end if;
  if p_id is null then
    v := 'set_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
    insert into public.setores (id, nome, lib_criar, lib_ver_tudo, lib_cadastros, lib_admin, lib_ver_marketing, ordem)
      values (v, btrim(p_nome), coalesce((p_libs->>'criar')::boolean,false), coalesce((p_libs->>'verTudo')::boolean,false),
              coalesce((p_libs->>'cadastros')::boolean,false), coalesce((p_libs->>'admin')::boolean,false),
              coalesce((p_libs->>'verMarketing')::boolean,false), (select coalesce(max(ordem),0)+1 from public.setores));
  else
    v := p_id;
    update public.setores set nome = btrim(p_nome),
      lib_criar = coalesce((p_libs->>'criar')::boolean,false), lib_ver_tudo = coalesce((p_libs->>'verTudo')::boolean,false),
      lib_cadastros = coalesce((p_libs->>'cadastros')::boolean,false), lib_admin = coalesce((p_libs->>'admin')::boolean,false),
      lib_ver_marketing = coalesce((p_libs->>'verMarketing')::boolean,false)
    where id = p_id;
    -- nunca deixar o sistema sem ninguém com Administração
    if not exists (select 1 from public.setores s join public.usuario_setores us on us.setor_id = s.id
                   join public.usuarios u on u.id = us.usuario_id where s.lib_admin and u.ativo) then
      raise exception 'Pelo menos um setor com usuários ativos precisa manter a liberação de Administração';
    end if;
  end if;
  return v;
end $$;

create or replace function public.remover_setor(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._exigir_admin();
  if exists (select 1 from public.chamados where setor_destino = p_id) then raise exception 'Há chamados encaminhados a este setor'; end if;
  if exists (select 1 from public.usuario_setores where setor_id = p_id) then raise exception 'Há usuários vinculados a este setor'; end if;
  if exists (select 1 from public.tipos where setor_destino = p_id) then raise exception 'Este setor está no roteamento de um motivo — ajuste o roteamento antes'; end if;
  if p_id in ('callcenter','prazo_fabrica','montagem','assistencia','checklist','medidas','marketing_operadora',
              'marketing_supervisao','consultor_externo','suporte_consultores','atendente_cliente','supervisao','gestao') then
    raise exception 'Este setor faz parte dos fluxos do sistema e não pode ser removido';
  end if;
  delete from public.setores where id = p_id;
end $$;

create or replace function public.salvar_roteamento(p_tipo text, p_setor text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._exigir_admin();
  if not exists (select 1 from public.setores where id = p_setor and not lib_ver_tudo) then raise exception 'Setor inválido'; end if;
  update public.tipos set setor_destino = p_setor where id = p_tipo;
  if not found then raise exception 'Motivo inválido'; end if;
end $$;

create or replace function public.salvar_config(p_pct numeric, p_pagamento numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._exigir_admin();
  if p_pct is null or p_pagamento is null or p_pct < 0 or p_pagamento < 0 then raise exception 'Informe valores válidos'; end if;
  update public.config set comissao_pct = p_pct, pagamento_visita = p_pagamento, atualizado_em = now(), atualizado_por = auth.uid() where id = 1;
end $$;

create or replace function public.salvar_usuario(p_id uuid, p_nome text, p_setores text[], p_somente boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare i integer;
begin
  perform public._exigir_admin();
  if btrim(coalesce(p_nome,'')) = '' then raise exception 'Informe o nome'; end if;
  if coalesce(array_length(p_setores,1),0) = 0 then raise exception 'Marque ao menos um setor'; end if;
  if not exists (select 1 from public.usuarios where id = p_id) then raise exception 'Usuário não encontrado'; end if;
  update public.usuarios set nome = btrim(p_nome), somente_atribuidos = coalesce(p_somente,false) where id = p_id;
  delete from public.usuario_setores where usuario_id = p_id;
  for i in 1..array_length(p_setores,1) loop
    insert into public.usuario_setores (usuario_id, setor_id, ordem) values (p_id, p_setores[i], i) on conflict do nothing;
  end loop;
  if not exists (select 1 from public.setores s join public.usuario_setores us on us.setor_id = s.id
                 join public.usuarios u on u.id = us.usuario_id where s.lib_admin and u.ativo) then
    raise exception 'Pelo menos um usuário ativo precisa manter a Administração';
  end if;
end $$;

create or replace function public.desativar_usuario(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._exigir_admin();
  if p_id = auth.uid() then raise exception 'Você não pode remover o próprio usuário'; end if;
  update public.usuarios set ativo = false where id = p_id;
end $$;

-- ================= escalonamento automático (roda no servidor via pg_cron) =================
create or replace function public.autoescalonar() returns integer
language plpgsql security definer set search_path = '' as $$
declare c record; n integer := 0;
begin
  for c in select * from public.chamados where status in ('aberta','tratativa') or escalonado_auto for update loop
    if c.status in ('aberta','tratativa') and now() > c.sla_resposta then
      if not c.escalonado_auto then
        update public.chamados set urgente = true, escalonado_auto = true, escalado_em = now() where id = c.id;
        insert into public.historico (chamado_id, quem_id, quem_nome, texto)
          values (c.id, null, 'Sistema', 'Escalonado automaticamente para urgente — prazo de resposta vencido sem retorno');
        n := n + 1;
      end if;
      if now() - c.sla_resposta >= interval '24 hours' and not c.escalado_critico then
        update public.chamados set escalado_critico = true where id = c.id;
        insert into public.historico (chamado_id, quem_id, quem_nome, texto)
          values (c.id, null, 'Sistema', 'Atraso crítico — mais de 24h sem resposta, destacado para Supervisão e Gestão');
        n := n + 1;
      end if;
    elsif c.escalonado_auto and not (c.status in ('aberta','tratativa') and now() > c.sla_resposta) then
      update public.chamados set escalonado_auto = false, escalado_critico = false where id = c.id;
    end if;
  end loop;
  return n;
end $$;

-- ================= defesa em profundidade: venda só muda de situação pela Gestão =================
create or replace function public.proteger_venda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if; -- tarefas internas / carga de dados
  if tg_op = 'INSERT' and new.status <> 'registrada' and not public.eh_gestao() then
    raise exception 'Só a Gestão pode definir a situação da venda';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and not public.eh_gestao() then
    raise exception 'Só a Gestão pode definir a situação da venda';
  end if;
  return new;
end $$;
create trigger vendas_protecao before insert or update on public.vendas
  for each row execute function public.proteger_venda();

create or replace function public.proteger_status_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.status_cliente is distinct from old.status_cliente
     and new.status_cliente in ('vendido','vendido_promissoria','venda_cancelada')
     and not public.eh_gestao() then
    raise exception 'Só a Gestão pode confirmar a venda como efetivada';
  end if;
  return new;
end $$;
create trigger chamados_protecao_status before update on public.chamados
  for each row execute function public.proteger_status_cliente();

-- ================= permissões de execução =================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;
-- funções internas: não expostas
revoke execute on function public.autoescalonar() from authenticated;
revoke execute on function public._reg(text, text) from authenticated;
revoke execute on function public._chamado(text, boolean) from authenticated;
revoke execute on function public.historico_imutavel() from authenticated;
revoke execute on function public.tocar_atualizado() from authenticated;
revoke execute on function public.proteger_venda() from authenticated;
revoke execute on function public.proteger_status_cliente() from authenticated;
revoke execute on function public.proximo_id_chamado() from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
