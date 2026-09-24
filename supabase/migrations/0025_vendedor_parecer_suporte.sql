-- Vendedor (loja): status do atendimento com parecer; Suporte cobra parecer; "quer projeto pronto" no agendamento;
-- marcações do vendedor (em contato / projeto pronto no sistema); travas: consultor não troca consultor nem vê clientes
-- de outros na agenda; setor Gerente de Loja (coordena vendedores). (0024 = novos valores do enum status_cliente)

create or replace function public._label_status_cliente(s public.status_cliente) returns text
language sql immutable set search_path = '' as $$
  select case s
    when 'aguardando_consultor' then 'Aguardando consultor'
    when 'direcionado_consultor' then 'Direcionado ao consultor'
    when 'visita_realizada' then 'Visita realizada'
    when 'agendado_loja' then 'Agendado loja'
    when 'com_vendedor' then 'Com vendedor'
    when 'orcamento' then 'Orçamento'
    when 'sem_resposta' then 'Sem resposta'
    when 'reagendado' then 'Reagendado'
    when 'reprovado' then 'Reprovado'
    when 'vendido_revisao' then 'Vendido — a confirmar'
    when 'vendido_promissoria' then 'Vendido — promissória'
    when 'vendido' then 'Vendido — efetivado'
    when 'venda_cancelada' then 'Venda cancelada'
    when 'nao_compareceu' then 'Não compareceu'
    else '—' end;
$$;

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
    if c.setor_destino = 'atendente_cliente' then
      return case when c.status_cliente in ('orcamento','sem_resposta','reagendado','reprovado') then c.status_cliente else 'com_vendedor' end;
    end if;
  end if;
  return coalesce(c.status_cliente, 'aguardando_consultor');
end $$;

-- parecer do vendedor: status do atendimento + texto; limpa a cobrança do Suporte
create or replace function public.vendedor_status(p_id text, p_status public.status_cliente, p_data timestamp default null, p_parecer text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true); txt text := btrim(coalesce(p_parecer,'')); eu text := public._nome(auth.uid());
begin
  if not public.tipo_presale(c.tipo) or c.setor_destino <> 'atendente_cliente' then raise exception 'Ação não disponível nesta etapa'; end if;
  if exists (select 1 from public.vendas where chamado_id = p_id) then raise exception 'Este cliente já tem venda registrada — use o bloco da venda'; end if;
  if p_status not in ('com_vendedor','orcamento','sem_resposta','reagendado','reprovado','nao_compareceu') then raise exception 'Status inválido para o vendedor'; end if;
  if p_status = 'reagendado' then
    if p_data is null then raise exception 'Informe a nova data e horário da vinda à loja'; end if;
  elsif p_status in ('orcamento','sem_resposta','reprovado') and txt = '' then
    raise exception 'Escreva o parecer: o que aconteceu com o cliente';
  end if;
  update public.chamados set
    status_cliente = p_status,
    data_loja = case when p_status = 'reagendado' then p_data else data_loja end,
    status = case when p_status in ('reprovado','nao_compareceu') then 'concluida'::public.status_chamado else 'tratativa'::public.status_chamado end,
    tratativa = (c.tratativa - 'cobradoEm' - 'cobradoPor') || jsonb_build_object('parecer', txt, 'parecerStatus', p_status::text, 'parecerEm', now(), 'parecerPor', eu)
  where id = p_id;
  perform public._reg(p_id, 'Parecer do vendedor: ' || public._label_status_cliente(p_status)
    || case when p_status = 'reagendado' then ' para ' || to_char(p_data, 'DD/MM/YYYY "às" HH24:MI') else '' end
    || case when txt <> '' then ' — ' || txt else '' end);
end $$;

-- Suporte / Supervisão Marketing / Gerente / Gestão cobram o parecer do vendedor
create or replace function public.cobrar_parecer(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false);
begin
  if not public.pode_editar_agenda() then raise exception 'Só o Suporte, a Supervisão de Marketing ou a Gestão cobram o parecer'; end if;
  if not public.tipo_presale(c.tipo) or c.setor_destino <> 'atendente_cliente' or c.atendente_id is null then raise exception 'Este cliente não está com vendedor'; end if;
  update public.chamados set tratativa = c.tratativa || jsonb_build_object('cobradoEm', now(), 'cobradoPor', public._nome(auth.uid())) where id = p_id;
  perform public._reg(p_id, 'Parecer cobrado do vendedor ' || public._nome(c.atendente_id) || ' por ' || public._nome(auth.uid()));
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
  elsif p_campo = 'emContato' and c.setor_destino = 'atendente_cliente' then
    txt := case when novo then 'Vendedor já está em contato com o cliente' else 'Marcação "em contato" removida' end;
  elsif p_campo = 'projetoSistema' and c.setor_destino = 'atendente_cliente' then
    txt := case when novo then 'Projeto já está pronto no sistema' else 'Marcação "projeto pronto no sistema" removida' end;
  else
    raise exception 'Ação não disponível nesta etapa';
  end if;
  update public.chamados set tratativa = c.tratativa || jsonb_build_object(p_campo, novo),
    status = novo_status, status_cliente = novo_sc where id = p_id;
  perform public._reg(p_id, txt);
end $$;

-- agendamento pelo consultor: também registra se o cliente quer projeto pronto
drop function if exists public.agendar_loja(text, timestamp, text, text);
create or replace function public.agendar_loja(p_id text, p_data_loja timestamp, p_medidas text, p_obs text, p_quer_projeto text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true); qp text := nullif(btrim(coalesce(p_quer_projeto,'')), '');
begin
  if not public.tipo_presale(c.tipo) or c.setor_destino <> 'consultor_externo' then
    raise exception 'Ação não disponível nesta etapa';
  end if;
  if p_data_loja is null then raise exception 'Informe a data e o horário da vinda à loja'; end if;
  if qp is not null and qp not in ('sim','nao') then raise exception 'Informe se o cliente quer projeto pronto'; end if;
  update public.chamados set
    tratativa = c.tratativa || jsonb_build_object('medidas', btrim(coalesce(p_medidas,'')), 'obs', btrim(coalesce(p_obs,'')))
      || case when qp is not null then jsonb_build_object('querProjeto', qp) else '{}'::jsonb end,
    data_loja = p_data_loja, setor_destino = 'suporte_consultores', status = 'respondida', status_cliente = 'agendado_loja'
  where id = p_id;
  perform public._reg(p_id, 'Vinda à loja agendada para ' || to_char(p_data_loja, 'DD/MM/YYYY "às" HH24:MI')
    || case qp when 'sim' then ' · cliente QUER projeto pronto' when 'nao' then ' · cliente não quer projeto pronto' else '' end
    || ' — encaminhado ao Suporte Consultores para definir o vendedor');
end $$;

-- consultor nunca troca o consultor: direcionar é só de quem coordena
create or replace function public.direcionar_consultor(p_id text, p_consultor uuid, p_data_visita timestamp, p_endereco text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true); dv timestamp;
begin
  if not public.pode_editar_agenda() then raise exception 'Só a Supervisão de Marketing ou a Gestão direcionam o consultor'; end if;
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

create or replace function public.designar_projetista(p_id text, p_atendente uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true);
begin
  if not public.pode_editar_agenda() then
    raise exception 'O Suporte a Consultores, a Supervisão de Marketing ou a Gestão definem o vendedor.';
  end if;
  if not public.tipo_presale(c.tipo) or c.setor_destino <> 'suporte_consultores' then
    raise exception 'Ação não disponível nesta etapa';
  end if;
  if p_atendente is null then raise exception 'Selecione o vendedor'; end if;
  if not public._eh_projetista_valido(p_atendente) then raise exception 'Vendedor inválido'; end if;
  update public.chamados set atendente_id = p_atendente, setor_destino = 'atendente_cliente', status_cliente = 'com_vendedor',
    status = case when c.status = 'aberta' then 'tratativa'::public.status_chamado else c.status end
  where id = p_id;
  perform public._reg(p_id, 'Vendedor definido: ' || public._nome(p_atendente));
end $$;

-- agenda da loja: consultor externo vê só os próprios clientes (vendedores continuam vendo a loja toda, só o essencial)
create or replace function public.agenda_loja(p_dia date)
returns table(id text, cliente text, data_loja timestamp, produto text, telefone text, atendente_id uuid, consultor_id uuid,
  status_cliente public.status_cliente, direto boolean, transf_pendente boolean, venda_numero text, meu boolean)
language plpgsql stable security definer set search_path = '' as $$
declare so_meus boolean;
begin
  if not public.usuario_ativo() then raise exception 'Usuário sem acesso ao sistema'; end if;
  if not (public.eh_gestao() or public.meus_setores() && public.setores_marketing()) then
    raise exception 'Sem acesso à agenda da loja';
  end if;
  so_meus := public.somente_atribuidos() and not ('atendente_cliente' = any(public.meus_setores()));
  return query
    select c.id, c.cliente, c.data_loja, c.produto,
           case when public.pode_ver_chamado(c) then c.telefone else '' end,
           c.atendente_id, c.consultor_id, public.status_cliente_de(c), t.direto,
           exists (select 1 from public.transferencias x where x.chamado_id = c.id and x.status = 'pendente'),
           (select v.numero from public.vendas v where v.chamado_id = c.id),
           public.pode_ver_chamado(c)
    from public.chamados c join public.tipos t on t.id = c.tipo
    where t.presale and c.data_loja is not null and c.data_loja::date = p_dia
      and (not so_meus or public.pode_ver_chamado(c))
    order by c.data_loja;
end $$;

-- status do cliente: quem só vê os próprios clientes (consultor/vendedor) só aplica o que é da etapa dele
create or replace function public.alterar_status_cliente(p_id text, p_novo public.status_cliente, p_data_loja timestamp default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.chamados := public._chamado(p_id, false);
  antes public.status_cliente;
  v public.vendas;
  v_data timestamp;
begin
  if not public.tipo_presale(c.tipo) then raise exception 'Ação disponível só para clientes do marketing'; end if;
  if not (public.pode_tratar_chamado(c) or public.eh_gestao()) then raise exception 'Você não pode alterar este cliente'; end if;
  if public.somente_atribuidos() then
    if p_novo = 'agendado_loja' and c.setor_destino in ('marketing_supervisao','consultor_externo') and c.consultor_id = auth.uid() then
      null;
    elsif p_novo in ('com_vendedor','orcamento','sem_resposta','reagendado','reprovado','nao_compareceu') and c.setor_destino = 'atendente_cliente' and c.atendente_id = auth.uid() then
      perform public.vendedor_status(p_id, p_novo, p_data_loja, '');
      return;
    else
      raise exception 'Este status não é da sua etapa';
    end if;
  end if;
  antes := public.status_cliente_de(c);
  if p_novo = antes and not (p_novo = 'agendado_loja' and p_data_loja is not null) then raise exception 'O status já é esse'; end if;
  if p_novo in ('vendido','vendido_promissoria','venda_cancelada','vendido_revisao') and not public.eh_gestao() then
    raise exception 'Só a Gestão pode confirmar a venda como efetivada';
  end if;

  if p_novo = 'agendado_loja' then
    v_data := coalesce(p_data_loja, c.data_loja);
    if v_data is null then raise exception 'Informe a data e o horário da vinda à loja'; end if;
    update public.chamados set status_cliente = 'agendado_loja', data_loja = v_data,
      setor_destino = case when setor_destino in ('marketing_supervisao','consultor_externo') then 'suporte_consultores' else setor_destino end,
      status = case when setor_destino in ('marketing_supervisao','consultor_externo') then 'respondida'::public.status_chamado
                    when status = 'concluida' then 'tratativa'::public.status_chamado else status end
    where id = p_id;
    perform public._reg(p_id, 'Status do cliente alterado: ' || public._label_status_cliente(antes) || ' → Agendado loja · vinda à loja '
      || to_char(v_data, 'DD/MM/YYYY "às" HH24:MI')
      || case when c.setor_destino in ('marketing_supervisao','consultor_externo') then ' — encaminhado ao Suporte Consultores para definir o vendedor' else '' end);
    return;
  end if;

  select * into v from public.vendas where chamado_id = p_id for update;
  if p_novo = 'vendido' and not found then
    raise exception 'Registre os dados da venda abaixo — número e valor são obrigatórios';
  end if;
  if p_novo = 'vendido' and v.status <> 'efetivada' then
    update public.vendas set status = 'efetivada', decidido_por = auth.uid(), decidido_em = now() where chamado_id = p_id;
  end if;
  update public.chamados set status_cliente = p_novo,
    status = case when p_novo in ('vendido','nao_compareceu','reprovado') then 'concluida'::public.status_chamado
                  when c.status = 'concluida' then 'tratativa'::public.status_chamado else c.status end
  where id = p_id;
  perform public._reg(p_id, 'Status do cliente alterado: ' || public._label_status_cliente(antes) || ' → ' || public._label_status_cliente(p_novo));
end $$;

-- Gerente de Loja: coordena os vendedores (mesmo acesso da Supervisão Marketing aos clientes do marketing)
create or replace function public.setores_marketing() returns text[]
language sql immutable set search_path = '' as $$
  select array['marketing_operadora','marketing_supervisao','consultor_externo','suporte_consultores','atendente_cliente','gerente_loja']::text[];
$$;
insert into public.setores (id, nome, lib_criar, lib_ver_tudo, lib_cadastros, lib_admin, lib_ver_marketing, ordem, via_callcenter)
values ('gerente_loja', 'Gerente de Loja', true, false, false, false, true, 12, false)
on conflict (id) do nothing;

revoke execute on function public.vendedor_status(text, public.status_cliente, timestamp, text), public.cobrar_parecer(text),
  public.agendar_loja(text, timestamp, text, text, text) from anon, public;
grant execute on function public.vendedor_status(text, public.status_cliente, timestamp, text), public.cobrar_parecer(text),
  public.agendar_loja(text, timestamp, text, text, text) to authenticated;
