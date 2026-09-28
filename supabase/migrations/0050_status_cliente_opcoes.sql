-- Novos status do cliente: em obras, standby, em análise, ausente no endereço, vendido (entrada + promissória), 100% promissória
create or replace function public._label_status_cliente(s public.status_cliente) returns text
language sql immutable set search_path to '' as $$
  select case s::text
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
    when 'vendido_entrada' then 'Vendido — entrada + promissória'
    when 'vendido_promissoria' then 'Vendido — 100% promissória'
    when 'vendido' then 'Vendido — efetivado'
    when 'venda_cancelada' then 'Venda cancelada'
    when 'nao_compareceu' then 'Não compareceu'
    when 'em_obras' then 'Em obras'
    when 'standby' then 'Standby'
    when 'em_analise' then 'Em análise'
    when 'ausente_endereco' then 'Ausente no endereço'
    else '—' end;
$$;

create or replace function public._venda_para_cliente(s public.status_venda) returns public.status_cliente
language sql immutable set search_path to '' as $$
  select (case s::text when 'registrada' then 'vendido_revisao' when 'promissoria' then 'vendido_promissoria' when 'entrada' then 'vendido_entrada'
    when 'efetivada' then 'vendido' when 'cancelada' then 'venda_cancelada' end)::public.status_cliente;
$$;

create or replace function public._final_cliente(c public.chamados) returns boolean
language sql stable security definer set search_path to '' as $$
  select public.status_cliente_de(c)::text in ('vendido','vendido_promissoria','vendido_entrada','vendido_revisao','venda_cancelada','nao_compareceu','reprovado');
$$;

create or replace function public.status_cliente_de(c public.chamados) returns public.status_cliente
language plpgsql stable security definer set search_path to '' as $$
declare vs public.status_venda;
begin
  if public.tipo_presale(c.tipo) then
    select status into vs from public.vendas where chamado_id = c.id;
    if vs is not null then return public._venda_para_cliente(vs); end if;
    if c.status_cliente = 'nao_compareceu' then return 'nao_compareceu'; end if;
    if c.setor_destino = 'marketing_supervisao' then return 'aguardando_consultor'; end if;
    if c.setor_destino = 'consultor_externo' then
      if c.status_cliente::text in ('em_obras','standby','em_analise','ausente_endereco') then return c.status_cliente; end if;
      return case when coalesce((c.tratativa->>'realizada')::boolean, false) then 'visita_realizada' else 'direcionado_consultor' end;
    end if;
    if c.setor_destino = 'suporte_consultores' then return 'agendado_loja'; end if;
    if c.setor_destino = 'atendente_cliente' then
      return case when c.status_cliente::text in ('orcamento','sem_resposta','reagendado','reprovado','em_obras','standby','em_analise') then c.status_cliente else 'com_vendedor' end;
    end if;
  end if;
  return coalesce(c.status_cliente, 'aguardando_consultor');
end $$;

create or replace function public.proteger_status_cliente() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.status_cliente is distinct from old.status_cliente
     and new.status_cliente::text in ('vendido','vendido_promissoria','vendido_entrada','venda_cancelada')
     and not public.eh_gestao() then
    raise exception 'Só a Gestão pode confirmar a venda como efetivada';
  end if;
  return new;
end $$;

-- vendedor: novos pareceres em obras / standby / em análise (exigem parecer)
create or replace function public.vendedor_status(p_id text, p_status public.status_cliente, p_data timestamp without time zone default null, p_parecer text default '')
returns void language plpgsql security definer set search_path to '' as $$
declare c public.chamados := public._chamado(p_id, true); txt text := btrim(coalesce(p_parecer,'')); eu text := public._nome(auth.uid());
begin
  if not public.tipo_presale(c.tipo) or c.setor_destino <> 'atendente_cliente' then raise exception 'Ação não disponível nesta etapa'; end if;
  if exists (select 1 from public.vendas where chamado_id = p_id) then raise exception 'Este cliente já tem venda registrada — use o bloco da venda'; end if;
  if p_status::text not in ('com_vendedor','orcamento','sem_resposta','reagendado','reprovado','nao_compareceu','em_obras','standby','em_analise') then raise exception 'Status inválido para o vendedor'; end if;
  if p_status = 'reagendado' then
    if p_data is null then raise exception 'Informe a nova data e horário da vinda à loja'; end if;
  elsif p_status::text in ('orcamento','sem_resposta','reprovado','em_obras','standby','em_analise') and txt = '' then
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

-- consultor externo: situação do cliente na etapa da visita
create or replace function public.consultor_situacao(p_id text, p_status text, p_obs text default '')
returns void language plpgsql security definer set search_path to '' as $$
declare c public.chamados := public._chamado(p_id, true); txt text := btrim(coalesce(p_obs,'')); novo public.status_cliente; antes public.status_cliente;
begin
  if not public.tipo_presale(c.tipo) or c.setor_destino <> 'consultor_externo' then raise exception 'Ação disponível só na etapa do consultor'; end if;
  antes := public.status_cliente_de(c);
  if p_status = 'normal' then
    novo := case when coalesce((c.tratativa->>'realizada')::boolean, false) then 'visita_realizada' else 'direcionado_consultor' end;
  elsif p_status in ('em_obras','standby','em_analise','ausente_endereco') then
    novo := p_status::public.status_cliente;
    if txt = '' then raise exception 'Escreva uma observação: o que aconteceu'; end if;
  else raise exception 'Situação inválida'; end if;
  update public.chamados set status_cliente = novo,
    status = case when status = 'aberta' then 'tratativa'::public.status_chamado else status end,
    tratativa = c.tratativa || jsonb_build_object('situacao', p_status, 'situacaoObs', txt, 'situacaoEm', now(), 'situacaoPor', public._nome(auth.uid()))
  where id = p_id;
  perform public._reg(p_id, 'Consultor: ' || public._label_status_cliente(antes) || ' → ' || public._label_status_cliente(novo) || case when txt <> '' then ' — ' || txt else '' end);
  if p_status = 'ausente_endereco' then
    perform public._notificar(array_remove(public._usuarios_setor(array['marketing_supervisao']) || c.solicitante_id, null),
      '🚪 Cliente ausente no endereço', c.cliente || ' — ' || public._nome(auth.uid()) || ': ' || txt, p_id, 'ausente-' || p_id || '-' || to_char(now(),'YYYYMMDDHH24MI'));
  end if;
end $$;
revoke all on function public.consultor_situacao(text, text, text) from public, anon;
grant execute on function public.consultor_situacao(text, text, text) to authenticated;

-- alterar_status_cliente: libera os novos status nas etapas certas
do $do$ declare d text; begin
  d := pg_get_functiondef('public.alterar_status_cliente(text, public.status_cliente, timestamp without time zone)'::regprocedure);
  d := replace(d, $q$    if p_novo = 'agendado_loja' and c.setor_destino in ('marketing_supervisao','consultor_externo') and c.consultor_id = auth.uid() then
      null;$q$, $q$    if p_novo = 'agendado_loja' and c.setor_destino in ('marketing_supervisao','consultor_externo') and c.consultor_id = auth.uid() then
      null;
    elsif p_novo::text in ('em_obras','standby','em_analise','ausente_endereco') and c.setor_destino = 'consultor_externo' and c.consultor_id = auth.uid() then
      raise exception 'Use a “Situação do cliente” no aplicativo (a observação é obrigatória)';$q$);
  d := replace(d, $q$elsif p_novo in ('com_vendedor','orcamento','sem_resposta','reagendado','reprovado','nao_compareceu') and$q$,
                  $q$elsif p_novo::text in ('com_vendedor','orcamento','sem_resposta','reagendado','reprovado','nao_compareceu','em_obras','standby','em_analise') and$q$);
  d := replace(d, $q$if p_novo in ('vendido','vendido_promissoria','venda_cancelada','vendido_revisao') and not$q$,
                  $q$if p_novo::text in ('vendido','vendido_promissoria','vendido_entrada','venda_cancelada','vendido_revisao') and not$q$);
  if position('vendido_entrada' in d) = 0 or position('em_obras' in d) = 0 then raise exception 'replace falhou'; end if;
  execute d;
end $do$;

-- registrar_venda: o vendedor informa o tipo (à vista, entrada + promissória, 100% promissória) — a Gestão valida
drop function if exists public.registrar_venda(text, text, numeric, date, text, uuid);
create or replace function public.registrar_venda(p_id text, p_numero text, p_valor numeric, p_data date, p_vendedor text, p_gerente uuid default null, p_tipo text default '', p_entrada numeric default null)
returns void language plpgsql security definer set search_path to '' as $$
declare c public.chamados := public._chamado(p_id, false); v public.vendas; editando boolean; gnome text; tp text := coalesce(p_tipo, '');
begin
  if not public.tipo_presale(c.tipo) then raise exception 'Ação disponível só para clientes do marketing'; end if;
  if not (public.pode_tratar_chamado(c) or public.eh_gestao()) then raise exception 'Você não pode registrar venda neste cliente'; end if;
  if btrim(coalesce(p_numero,'')) = '' then raise exception 'Informe o número da venda'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor da venda'; end if;
  if btrim(coalesce(p_vendedor,'')) = '' then raise exception 'Informe o vendedor da loja'; end if;
  if p_gerente is null then raise exception 'Informe o gerente que negociou a venda'; end if;
  if tp not in ('', 'efetivada', 'entrada', 'promissoria') then raise exception 'Tipo de venda inválido'; end if;
  if tp = 'entrada' and (p_entrada is null or p_entrada <= 0 or p_entrada >= p_valor) then raise exception 'Informe o valor da entrada (menor que o total)'; end if;
  select u.nome into gnome from public.usuarios u
    where u.id = p_gerente and u.ativo and exists (select 1 from public.usuario_setores us where us.usuario_id = u.id and us.setor_id in ('gerente_loja', 'gestao', 'proprietario'));
  if gnome is null then raise exception 'Gerente inválido — escolha um gerente da lista'; end if;
  select * into v from public.vendas where chamado_id = p_id for update;
  editando := found;
  if editando and v.status <> 'registrada' then
    raise exception 'Esta venda já foi decidida pela Gestão. Só a Gestão altera.';
  end if;
  insert into public.vendas (chamado_id, numero, data_venda, vendedor, atendente_nome, status, registrado_por, registrado_em, gerente_id, gerente_nome, tipo_informado)
    values (p_id, btrim(p_numero), p_data, btrim(p_vendedor), coalesce((select nome from public.usuarios where id = c.atendente_id), ''),
            'registrada', auth.uid(), now(), p_gerente, gnome, tp)
    on conflict (chamado_id) do update set numero = excluded.numero, data_venda = excluded.data_venda,
      vendedor = excluded.vendedor, atendente_nome = excluded.atendente_nome, registrado_por = excluded.registrado_por,
      registrado_em = excluded.registrado_em, gerente_id = excluded.gerente_id, gerente_nome = excluded.gerente_nome, tipo_informado = excluded.tipo_informado;
  insert into public.vendas_valores (chamado_id, valor, entrada_informada) values (p_id, round(p_valor, 2), case when tp = 'entrada' then round(p_entrada, 2) end)
    on conflict (chamado_id) do update set valor = excluded.valor, entrada_informada = excluded.entrada_informada;
  update public.chamados set status_cliente = 'vendido_revisao', status = 'concluida' where id = p_id;
  perform public._reg(p_id, 'Venda ' || btrim(p_numero) || case when editando then ' atualizada por ' else ' registrada por ' end
    || btrim(p_vendedor) || ' · gerente ' || gnome || case when p_data is not null then ' em ' || public._fmt_data(p_data) else '' end
    || case tp when 'efetivada' then ' · informada como paga (à vista)' when 'entrada' then ' · informada como entrada + promissória'
               when 'promissoria' then ' · informada como 100% promissória' else '' end
    || ' — aguardando análise da Gestão');
end $$;
revoke all on function public.registrar_venda(text, text, numeric, date, text, uuid, text, numeric) from public, anon;
grant execute on function public.registrar_venda(text, text, numeric, date, text, uuid, text, numeric) to authenticated;

-- listas de status finais em iniciar_atendimento e agenda_publica_dia: + vendido_entrada (e pareceres em_obras/standby/em_analise na tela pública)
-- (aplicado via replace em pg_get_functiondef — ver migração status_cliente_opcoes_listas)
