-- valores em reais no formato brasileiro (R$ 1.234,56) nos avisos
create or replace function public._moeda(v numeric) returns text
language sql immutable set search_path = '' as $$
  select 'R$ ' || translate(to_char(coalesce(v,0), 'FM999,999,990.00'), ',.', '.,');
$$;

create or replace function public._trg_chamado_avisos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  presale boolean := public.tipo_presale(new.tipo);
  coord uuid[];
  ped_ant uuid; ped_novo uuid; m public.mkt_metas; n int;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  quando text;
begin
  if not presale then return null; end if;
  coord := public._usuarios_setor(array['suporte_consultores','marketing_supervisao','gerente_loja']);
  ped_ant := case when tg_op = 'UPDATE' then nullif(old.tratativa->>'pedidoAtend','')::uuid end;
  ped_novo := nullif(new.tratativa->>'pedidoAtend','')::uuid;

  -- consultor: novo cliente para visitar
  if new.consultor_id is not null and (tg_op = 'INSERT' or old.consultor_id is distinct from new.consultor_id) then
    perform public._notificar(array[new.consultor_id], '📍 Novo cliente para visita',
      new.cliente || coalesce(' · visita ' || to_char(new.data_visita, 'DD/MM HH24:MI'), '') || coalesce(' · ' || nullif(new.endereco,''), ''),
      new.id, 'consultor:' || new.id || ':' || new.consultor_id);
  end if;

  -- vendedor: pedido de atendimento aprovado / recusado, ou cliente designado
  if ped_ant is not null and ped_novo is null then
    if new.atendente_id = ped_ant then
      perform public._notificar(array[ped_ant], '✅ Pedido aprovado', 'Você está atendendo ' || new.cliente || coalesce(' · loja ' || to_char(new.data_loja, 'DD/MM HH24:MI'), ''), new.id, 'pedok:' || new.id || ':' || extract(epoch from now())::bigint);
    elsif new.atendente_id is null then
      perform public._notificar(array[ped_ant], '❌ Pedido recusado', 'Seu pedido para atender ' || new.cliente || ' não foi aprovado.', new.id, 'pednao:' || new.id || ':' || extract(epoch from now())::bigint);
    end if;
  end if;
  if new.atendente_id is not null and (tg_op = 'INSERT' or old.atendente_id is distinct from new.atendente_id) and new.atendente_id is distinct from ped_ant then
    perform public._notificar(array[new.atendente_id], '🏬 Cliente designado para você',
      new.cliente || coalesce(' · loja ' || to_char(new.data_loja, 'DD/MM HH24:MI'), '') || case when new.tratativa->>'querProjeto' = 'sim' then ' · quer projeto' else '' end,
      new.id, 'vend:' || new.id || ':' || new.atendente_id);
  end if;

  -- coordenação: novo pedido de atendimento de vendedor
  if ped_novo is not null and ped_novo is distinct from ped_ant then
    perform public._notificar(coord, '🙋 Pedido de atendimento', public._nome(ped_novo) || ' quer atender ' || new.cliente || ' — aprovar?', new.id, 'pedido:' || new.id || ':' || ped_novo);
  end if;

  -- vendedor: parecer cobrado pelo Suporte
  if new.atendente_id is not null and (new.tratativa->>'cobradoEm') is not null
     and (tg_op = 'INSERT' or (old.tratativa->>'cobradoEm') is distinct from (new.tratativa->>'cobradoEm')) then
    perform public._notificar(array[new.atendente_id], '⚠️ Parecer cobrado', 'O Suporte está pedindo seu parecer sobre ' || new.cliente || '.', new.id, 'cobrado:' || new.id || ':' || (new.tratativa->>'cobradoEm'));
  end if;

  -- coordenação: cliente agendado na loja ainda sem vendedor
  if new.data_loja is not null and new.atendente_id is null and (tg_op = 'INSERT' or old.data_loja is distinct from new.data_loja) then
    quando := to_char(new.data_loja, 'DD/MM HH24:MI');
    perform public._notificar(coord, '🏬 Cliente na loja sem vendedor', new.cliente || ' · ' || quando || ' — definir vendedor', new.id, 'semvend:' || new.id || ':' || quando);
  end if;

  -- operadora: meta do dia batida (no cadastro do cliente)
  if tg_op = 'INSERT' and new.solicitante_id is not null then
    select * into m from public.mkt_metas where dia = hoje;
    if found then
      select count(*) into n from public.chamados c join public.tipos t on t.id = c.tipo
       where t.presale and c.solicitante_id = new.solicitante_id and (c.criado_em at time zone 'America/Sao_Paulo')::date = hoje;
      if n = m.meta then
        insert into public.notificacoes (usuario_id, titulo, corpo, chave)
        select new.solicitante_id, '🎉 Meta do dia batida!', 'Você fez ' || n || ' agendamentos hoje. Bônus de ' || public._moeda(m.valor) || ' garantido.', 'meta:' || hoje || ':' || new.solicitante_id
        on conflict (chave) do nothing;
      end if;
    end if;
  end if;
  return null;
end $$;

create or replace function public._trg_venda_avisos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.chamados; val numeric; pct numeric; vmk numeric;
begin
  select * into c from public.chamados where id = new.chamado_id;
  if not found or not public.tipo_presale(c.tipo) then return null; end if;
  -- Gestão: venda registrada aguardando confirmação
  if tg_op = 'INSERT' and new.status = 'registrada' then
    perform public._notificar(public._usuarios_setor(array['gestao']), '🧾 Venda para confirmar', c.cliente || ' · venda nº ' || new.numero || coalesce(' · ' || public._nome(c.atendente_id), ''), c.id, 'vreg:' || c.id || ':' || new.numero);
  end if;
  -- venda confirmada (efetivada): consultor, vendedor e operadora que agendou
  if new.status = 'efetivada' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select valor into val from public.vendas_valores where chamado_id = c.id;
    select comissao_pct, valor_venda_mkt into pct, vmk from public.config where id = 1;
    if c.consultor_id is not null then
      perform public._notificar(array[c.consultor_id], '✅ Venda confirmada', c.cliente || ' · venda nº ' || new.numero
        || case when val is not null then ' · sua comissão ' || public._moeda(round(val * pct / 100, 2)) else '' end, c.id, 'vok-c:' || c.id);
    end if;
    if c.atendente_id is not null then
      perform public._notificar(array[c.atendente_id], '✅ Venda confirmada', c.cliente || ' · venda nº ' || new.numero, c.id, 'vok-v:' || c.id);
    end if;
    if c.solicitante_id is not null and exists (select 1 from public.usuario_setores where usuario_id = c.solicitante_id and setor_id = 'marketing_operadora') then
      perform public._notificar(array[c.solicitante_id], '💰 Venda confirmada', c.cliente || ' comprou! + ' || public._moeda(vmk) || ' na sua comissão.', c.id, 'vok-o:' || c.id);
    end if;
  end if;
  return null;
end $$;

create or replace function public._trg_pag_mkt_avisos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._notificar(array[new.operadora_id], '💵 Pagamento aprovado', 'Seu pagamento de ' || to_char(new.de, 'MM/YYYY') || ' foi aprovado: ' || public._moeda(new.total), null,
    'pag:' || new.id || ':' || new.total);
  return null;
end $$;

revoke execute on function public._moeda(numeric) from anon;
