-- "Agendado loja" exige data e horário na loja. Ao agendar, o cliente sai do consultor/supervisão
-- e vai para a fila do Suporte Consultores, para ser designado a um vendedor/projetista.
drop function if exists public.alterar_status_cliente(text, public.status_cliente);
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
      || case when c.setor_destino in ('marketing_supervisao','consultor_externo') then ' — encaminhado ao Suporte Consultores para designar o vendedor' else '' end);
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
    status = case when p_novo in ('vendido','nao_compareceu') then 'concluida'::public.status_chamado
                  when c.status = 'concluida' then 'tratativa'::public.status_chamado else c.status end
  where id = p_id;
  perform public._reg(p_id, 'Status do cliente alterado: ' || public._label_status_cliente(antes) || ' → ' || public._label_status_cliente(p_novo));
end $$;

-- agendar pelo consultor: registra também o horário no histórico
create or replace function public.agendar_loja(p_id text, p_data_loja timestamp, p_medidas text, p_obs text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true);
begin
  if not public.tipo_presale(c.tipo) or c.setor_destino <> 'consultor_externo' then
    raise exception 'Ação não disponível nesta etapa';
  end if;
  if p_data_loja is null then raise exception 'Informe a data e o horário da vinda à loja'; end if;
  update public.chamados set
    tratativa = c.tratativa || jsonb_build_object('medidas', btrim(coalesce(p_medidas,'')), 'obs', btrim(coalesce(p_obs,''))),
    data_loja = p_data_loja, setor_destino = 'suporte_consultores', status = 'respondida', status_cliente = 'agendado_loja'
  where id = p_id;
  perform public._reg(p_id, 'Vinda à loja agendada para ' || to_char(p_data_loja, 'DD/MM/YYYY "às" HH24:MI') || ' — encaminhado ao Suporte Consultores para designar o vendedor');
end $$;

revoke execute on function public.alterar_status_cliente(text, public.status_cliente, timestamp), public.agendar_loja(text, timestamp, text, text) from anon, public;
grant execute on function public.alterar_status_cliente(text, public.status_cliente, timestamp), public.agendar_loja(text, timestamp, text, text) to authenticated;
