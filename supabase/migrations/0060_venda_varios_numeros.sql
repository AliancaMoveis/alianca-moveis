-- VENDAS COM VÁRIOS Nºs NO MESMO CLIENTE + PROMISSÓRIAS
--  Cada cliente tem uma venda (vendas) com uma lista de lançamentos (venda_itens):
--   · pago        — nº de venda pago (gera comissão quando a Gestão efetiva; conta no mês da aprovação)
--   · promissoria — nº de venda em promissória (valor pendente; sem comissão até ser paga)
--   · pagamento   — pagamento de uma promissória, com nº de venda próprio (gera comissão na data do pagamento)
--  Resumo mantido pelo banco (_recalc_venda): vendas_valores.valor = total (pagos + promissórias),
--  vendas_valores.entrada = total pago, vendas.status = registrada | efetivada | entrada | promissoria | cancelada.
--  Substitui a tabela antiga "promissorias" (vazia).

create table if not exists public.venda_itens (
  id uuid primary key default gen_random_uuid(),
  chamado_id text not null references public.vendas(chamado_id) on delete cascade,
  tipo text not null check (tipo in ('pago', 'promissoria', 'pagamento')),
  numero text not null check (btrim(numero) <> ''),
  valor numeric(12,2) not null check (valor > 0),
  data_venda date,
  vencimento date,
  status text not null default 'registrada' check (status in ('registrada', 'efetivada', 'cancelada')),
  valor_pago numeric(12,2) not null default 0,
  promissoria_id uuid references public.venda_itens(id) on delete cascade,
  registrado_por uuid references public.usuarios(id),
  registrado_em timestamptz not null default now(),
  decidido_por uuid references public.usuarios(id),
  decidido_em timestamptz
);
create index if not exists venda_itens_chamado on public.venda_itens (chamado_id);
alter table public.venda_itens enable row level security;
revoke all on public.venda_itens from anon, authenticated;
grant select on public.venda_itens to authenticated;
drop policy if exists venda_itens_ler on public.venda_itens;
create policy venda_itens_ler on public.venda_itens for select to authenticated using (public.pode_ver_valor_id(chamado_id));

-- competência de um lançamento: mês da aprovação quando a data é de mês anterior
create or replace function public._comp_item(p_d date, p_dec timestamptz, p_reg timestamptz) returns date
language sql stable set search_path = '' as $$
  select case when date_trunc('month', dd) < date_trunc('month', b) then date_trunc('month', b)::date else dd end
  from (select coalesce(p_d, (p_reg at time zone 'America/Sao_Paulo')::date) dd, (coalesce(p_dec, p_reg) at time zone 'America/Sao_Paulo')::date b) x;
$$;

-- a situação da venda passa a ser calculada pelo banco a partir dos lançamentos
create or replace function public.proteger_venda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or current_setting('alianca.venda_recalc', true) = '1' then return new; end if;
  if tg_op = 'INSERT' and new.status <> 'registrada' and not public.eh_gestao() then
    raise exception 'Só a Gestão pode definir a situação da venda';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and not public.eh_gestao() then
    raise exception 'Só a Gestão pode definir a situação da venda';
  end if;
  return new;
end $$;

create or replace function public._recalc_venda(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.vendas; tot numeric; pago numeric; n_at int; n_ef int; pend numeric; st text; num text;
begin
  select * into v from public.vendas where chamado_id = p_id for update;
  if not found then return; end if;
  -- promissórias: valor pago = soma dos pagamentos efetivados
  update public.venda_itens p set valor_pago = coalesce((select sum(x.valor) from public.venda_itens x where x.promissoria_id = p.id and x.tipo = 'pagamento' and x.status = 'efetivada'), 0)
   where p.chamado_id = p_id and p.tipo = 'promissoria';
  select coalesce(sum(valor) filter (where tipo in ('pago', 'promissoria') and status <> 'cancelada'), 0),
         coalesce(sum(valor) filter (where tipo in ('pago', 'pagamento') and status = 'efetivada'), 0),
         count(*) filter (where tipo in ('pago', 'promissoria') and status <> 'cancelada'),
         count(*) filter (where tipo in ('pago', 'promissoria') and status = 'efetivada'),
         coalesce(sum(valor - valor_pago) filter (where tipo = 'promissoria' and status = 'efetivada'), 0)
    into tot, pago, n_at, n_ef, pend
    from public.venda_itens where chamado_id = p_id;
  st := case when n_at = 0 then 'cancelada' when n_ef = 0 then 'registrada'
             when pend > 0.004 then case when pago > 0 then 'entrada' else 'promissoria' end else 'efetivada' end;
  select numero into num from public.venda_itens where chamado_id = p_id and tipo in ('pago', 'promissoria')
   order by (status = 'cancelada'), coalesce(data_venda, (registrado_em at time zone 'America/Sao_Paulo')::date), registrado_em limit 1;
  perform set_config('alianca.venda_recalc', '1', true);
  if tot > 0 then
    update public.vendas_valores set valor = tot, entrada = pago where chamado_id = p_id and (valor <> tot or entrada <> pago);
  end if;
  if v.status::text <> st or v.numero is distinct from coalesce(num, v.numero) then
    update public.vendas set status = st::public.status_venda, numero = coalesce(num, numero),
      decidido_em = case when st = 'registrada' then null when v.status::text = 'registrada' or decidido_em is null then now() else decidido_em end,
      decidido_por = case when st = 'registrada' then null when v.status::text = 'registrada' or decidido_por is null then auth.uid() else decidido_por end
     where chamado_id = p_id;
  end if;
  perform set_config('alianca.venda_recalc', '0', true);
  update public.chamados set status_cliente = public._venda_para_cliente(st::public.status_venda),
    status = case when st = 'cancelada' then 'tratativa'::public.status_chamado else 'concluida'::public.status_chamado end
   where id = p_id and (status_cliente is distinct from public._venda_para_cliente(st::public.status_venda)
                        or status is distinct from case when st = 'cancelada' then 'tratativa'::public.status_chamado else 'concluida'::public.status_chamado end);
end $$;

-- lista legível dos lançamentos (histórico e avisos)
create or replace function public._txt_itens(p_itens jsonb) returns text
language sql stable set search_path = '' as $$
  select string_agg(case when coalesce(x->>'tipo', 'pago') = 'promissoria' then 'promissória nº ' else 'nº ' end || btrim(x->>'numero') || ' ' || public._moeda((x->>'valor')::numeric), ' + ')
  from jsonb_array_elements(p_itens) x;
$$;

-- REGISTRAR (vendedor / Gestão): um ou mais nºs pagos e/ou promissórias. p_substituir = corrigir a venda ainda não analisada.
create or replace function public.registrar_venda_itens(p_id text, p_itens jsonb, p_data date, p_vendedor text, p_gerente uuid, p_substituir boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false); v public.vendas; existe boolean; gnome text; it jsonb;
  tp text; num text; val numeric; nums text[] := '{}'; soma numeric := 0; npago int := 0; nprom int := 0; dup text; txt text;
begin
  if not public.tipo_presale(c.tipo) then raise exception 'Ação disponível só para clientes do marketing'; end if;
  if not (public.pode_tratar_chamado(c) or public.eh_gestao()) then raise exception 'Você não pode registrar venda neste cliente'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'Informe ao menos um nº de venda com valor'; end if;
  if btrim(coalesce(p_vendedor, '')) = '' then raise exception 'Informe o vendedor da loja'; end if;
  if p_gerente is null then raise exception 'Informe o gerente que negociou a venda'; end if;
  select u.nome into gnome from public.usuarios u
   where u.id = p_gerente and u.ativo and exists (select 1 from public.usuario_setores us where us.usuario_id = u.id and us.setor_id in ('gerente_loja', 'gestao', 'proprietario'));
  if gnome is null then raise exception 'Gerente inválido — escolha um gerente da lista'; end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    tp := coalesce(nullif(it->>'tipo', ''), 'pago');
    if tp not in ('pago', 'promissoria') then raise exception 'Tipo inválido'; end if;
    num := btrim(coalesce(it->>'numero', ''));
    if num = '' then raise exception 'Informe o nº da venda de cada valor'; end if;
    val := round(coalesce(nullif(it->>'valor', '')::numeric, 0), 2);
    if val <= 0 then raise exception 'Informe o valor do nº %', num; end if;
    if num = any(nums) then raise exception 'O nº % está repetido', num; end if;
    nums := nums || num; soma := soma + val;
    if tp = 'pago' then npago := npago + 1; else nprom := nprom + 1; end if;
  end loop;
  select * into v from public.vendas where chamado_id = p_id for update;
  existe := found;
  if existe and p_substituir then
    if exists (select 1 from public.venda_itens where chamado_id = p_id and status <> 'registrada') then
      raise exception 'Esta venda já foi analisada pela Gestão. Para lançar outro nº, use "＋ Adicionar venda".';
    end if;
    delete from public.venda_itens where chamado_id = p_id;
  end if;
  select string_agg(numero, ', ') into dup from public.venda_itens where chamado_id = p_id and status <> 'cancelada' and tipo <> 'pagamento' and numero = any(nums);
  if dup is not null then raise exception 'O nº % já está lançado neste cliente', dup; end if;
  if not existe then
    insert into public.vendas (chamado_id, numero, data_venda, vendedor, atendente_nome, status, registrado_por, registrado_em, gerente_id, gerente_nome, tipo_informado)
    values (p_id, nums[1], p_data, btrim(p_vendedor), coalesce((select nome from public.usuarios where id = c.atendente_id), ''), 'registrada', auth.uid(), now(),
            p_gerente, gnome, case when nprom > 0 and npago > 0 then 'entrada' when nprom > 0 then 'promissoria' else 'efetivada' end);
    insert into public.vendas_valores (chamado_id, valor) values (p_id, soma);
  elsif p_substituir then
    update public.vendas set numero = nums[1], data_venda = p_data, vendedor = btrim(p_vendedor), registrado_por = auth.uid(), registrado_em = now(),
      gerente_id = p_gerente, gerente_nome = gnome, tipo_informado = case when nprom > 0 and npago > 0 then 'entrada' when nprom > 0 then 'promissoria' else 'efetivada' end
     where chamado_id = p_id;
  end if;
  insert into public.venda_itens (chamado_id, tipo, numero, valor, data_venda, vencimento, registrado_por)
  select p_id, coalesce(nullif(x->>'tipo', ''), 'pago'), btrim(x->>'numero'), round((x->>'valor')::numeric, 2), p_data,
         case when coalesce(x->>'tipo', '') = 'promissoria' then nullif(x->>'vencimento', '')::date end, auth.uid()
    from jsonb_array_elements(p_itens) x;
  perform public._recalc_venda(p_id);
  txt := public._txt_itens(p_itens);
  perform public._reg(p_id, case when not existe then 'Venda registrada: ' when p_substituir then 'Venda corrigida: ' else '➕ Nova venda no mesmo cliente: ' end
    || txt || ' · vendedor ' || btrim(p_vendedor) || ' · gerente ' || gnome || coalesce(' em ' || public._fmt_data(p_data), '') || ' — aguardando análise da Gestão');
  if existe and not p_substituir then
    perform public._notificar(public._usuarios_setor(array['gestao']), '🧾 Nova venda para validar', c.cliente || ' · ' || txt, c.id, 'vadd:' || c.id || ':' || nums[1]);
  end if;
end $$;

-- compatibilidade: assinatura antiga (um nº só)
create or replace function public.registrar_venda(p_id text, p_numero text, p_valor numeric, p_data date, p_vendedor text, p_gerente uuid default null, p_tipo text default '', p_entrada numeric default null)
returns void language plpgsql security definer set search_path = '' as $$
declare sub boolean;
begin
  sub := exists (select 1 from public.vendas where chamado_id = p_id) and not exists (select 1 from public.venda_itens where chamado_id = p_id and status <> 'registrada');
  perform public.registrar_venda_itens(p_id, jsonb_build_array(jsonb_build_object('tipo', case when p_tipo = 'promissoria' then 'promissoria' else 'pago' end, 'numero', p_numero, 'valor', p_valor)),
    p_data, p_vendedor, p_gerente, sub);
end $$;

-- DECIDIR lançamentos (Gestão): [{id, status}] — efetivada / cancelada / registrada
create or replace function public.decidir_itens_venda(p_id text, p_itens jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados; v public.vendas; it jsonb; i public.venda_itens; st text; antes text; pct numeric; ok_txt text := ''; can_txt text := ''; com numeric := 0;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão valida a venda'; end if;
  c := public._chamado(p_id, false);
  select * into v from public.vendas where chamado_id = p_id for update;
  if not found then raise exception 'Este cliente não tem venda registrada'; end if;
  antes := v.status::text;
  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    st := it->>'status';
    if st not in ('efetivada', 'cancelada', 'registrada') then raise exception 'Situação inválida'; end if;
    select * into i from public.venda_itens where id = (it->>'id')::uuid and chamado_id = p_id for update;
    if not found then raise exception 'Lançamento não encontrado — atualize a tela'; end if;
    if i.status = st then continue; end if;
    if i.tipo = 'pagamento' and st <> 'cancelada' then raise exception 'Pagamento de promissória só pode ser estornado (cancelado)'; end if;
    if i.tipo = 'promissoria' and st <> 'efetivada' and exists (select 1 from public.venda_itens x where x.promissoria_id = i.id and x.status = 'efetivada') then
      raise exception 'A promissória nº % já tem pagamento — estorne o pagamento antes', i.numero;
    end if;
    update public.venda_itens set status = st, decidido_por = case when st = 'registrada' then null else auth.uid() end,
      decidido_em = case when st = 'registrada' then null else now() end where id = i.id;
    if st = 'efetivada' then
      ok_txt := ok_txt || case when ok_txt = '' then '' else ' + ' end || case i.tipo when 'promissoria' then 'promissória nº ' else 'nº ' end || i.numero || ' ' || public._moeda(i.valor);
      if i.tipo = 'pago' then com := com + i.valor; end if;
    elsif st = 'cancelada' then
      can_txt := can_txt || case when can_txt = '' then '' else ', ' end || case i.tipo when 'pagamento' then 'pagamento nº ' when 'promissoria' then 'promissória nº ' else 'nº ' end || i.numero;
    end if;
  end loop;
  perform public._recalc_venda(p_id);
  if ok_txt <> '' then perform public._reg(p_id, '✅ Gestão efetivou: ' || ok_txt || ' (por ' || public._nome(auth.uid()) || ')'); end if;
  if can_txt <> '' then perform public._reg(p_id, '❌ Gestão cancelou: ' || can_txt || ' (por ' || public._nome(auth.uid()) || ')'); end if;
  -- venda que já estava validada e ganhou um nº novo: o aviso não sai pelo gatilho da venda
  select * into v from public.vendas where chamado_id = p_id;
  if com > 0 and antes <> 'registrada' and v.status::text = antes then
    select comissao_pct into pct from public.config where id = 1;
    if c.consultor_id is not null then
      perform public._notificar(array[c.consultor_id], '✅ Nova venda confirmada', c.cliente || ' · ' || ok_txt || ' · sua comissão ' || public._moeda(round(com * pct / 100, 2)), c.id, 'vitem-c:' || c.id || ':' || md5(ok_txt));
    end if;
    if c.atendente_id is not null then
      perform public._notificar(array[c.atendente_id], '✅ Nova venda confirmada', c.cliente || ' · ' || ok_txt, c.id, 'vitem-v:' || c.id || ':' || md5(ok_txt));
    end if;
  end if;
end $$;

-- validação "em bloco" (mantém as telas e o lote funcionando): efetivar / cancelar / voltar para análise
create or replace function public.validar_venda(p_id text, p_status text, p_entrada numeric default 0, p_promissorias jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare lst jsonb;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão valida a venda'; end if;
  if p_status in ('entrada', 'promissoria') then raise exception 'Informe cada nº como pago ou promissória e efetive'; end if;
  if p_status not in ('efetivada', 'cancelada', 'registrada') then raise exception 'Situação inválida'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'status', p_status)), '[]'::jsonb) into lst from public.venda_itens
   where chamado_id = p_id and case p_status when 'efetivada' then status = 'registrada'
                                             when 'cancelada' then status <> 'cancelada'
                                             else status = 'efetivada' and tipo <> 'pagamento' end;
  if p_status = 'registrada' and exists (select 1 from public.venda_itens where chamado_id = p_id and tipo = 'pagamento' and status = 'efetivada') then
    raise exception 'Esta venda já tem pagamento de promissória — ajuste nº a nº';
  end if;
  perform public.decidir_itens_venda(p_id, lst);
end $$;

create or replace function public.validar_vendas_lote(p_ids text[], p_status text)
returns int language plpgsql security definer set search_path to '' as $$
declare i text; n int := 0; lst jsonb;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão valida vendas'; end if;
  if p_status not in ('efetivada', 'cancelada') then raise exception 'Em massa só dá para efetivar ou cancelar'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'Selecione ao menos uma venda'; end if;
  foreach i in array p_ids loop
    select jsonb_agg(jsonb_build_object('id', id, 'status', p_status)) into lst from public.venda_itens where chamado_id = i and status = 'registrada';
    if lst is null then raise exception 'A venda do cliente % já foi analisada — atualize a tela', i; end if;
    perform public.decidir_itens_venda(i, lst);
    n := n + 1;
  end loop;
  return n;
end $$;

-- PAGAMENTO de promissória (Gestão): valor + nº da venda do pagamento; o saldo continua na mesma promissória
drop function if exists public.quitar_promissoria(uuid, numeric, text, date);
create or replace function public.quitar_promissoria(p_id uuid, p_valor numeric, p_numero text, p_data date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.venda_itens; c public.chamados; saldo numeric; pago numeric; pct numeric; num text := btrim(coalesce(p_numero, ''));
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão registra o pagamento da promissória'; end if;
  select * into p from public.venda_itens where id = p_id and tipo = 'promissoria' for update;
  if not found then raise exception 'Promissória não encontrada'; end if;
  if p.status <> 'efetivada' then raise exception 'Valide a promissória antes de registrar pagamento'; end if;
  saldo := p.valor - p.valor_pago;
  if saldo <= 0 then raise exception 'Esta promissória já está paga'; end if;
  pago := round(coalesce(p_valor, saldo), 2);
  if pago <= 0 or pago > saldo then raise exception 'Valor pago inválido (entre R$ 0,01 e %)', public._moeda(saldo); end if;
  if num = '' then raise exception 'Informe o nº da venda do pagamento'; end if;
  if exists (select 1 from public.venda_itens where chamado_id = p.chamado_id and tipo = 'pagamento' and status <> 'cancelada' and numero = num) then
    raise exception 'O nº % já foi usado em outro pagamento deste cliente', num;
  end if;
  select * into c from public.chamados where id = p.chamado_id;
  insert into public.venda_itens (chamado_id, tipo, numero, valor, data_venda, status, promissoria_id, registrado_por, decidido_por, decidido_em)
  values (p.chamado_id, 'pagamento', num, pago, coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date), 'efetivada', p.id, auth.uid(), auth.uid(), now());
  perform public._recalc_venda(p.chamado_id);
  perform public._reg(p.chamado_id, '💰 Pagamento da promissória nº ' || p.numero || ': ' || public._moeda(pago) || ' (nº ' || num || ')'
    || case when saldo - pago > 0 then ' — ainda pendente ' || public._moeda(saldo - pago) else ' — promissória quitada' end);
  select comissao_pct into pct from public.config where id = 1;
  if c.consultor_id is not null then
    perform public._notificar(array[c.consultor_id], '💰 Promissória paga', c.cliente || ' · nº ' || num || ' · ' || public._moeda(pago) || ' · + ' || public._moeda(round(pago * pct / 100, 2)) || ' de comissão'
      || case when saldo - pago > 0 then ' · pendente ' || public._moeda(saldo - pago) else '' end, c.id, 'promq-c:' || p_id || ':' || num);
  end if;
  if c.atendente_id is not null then
    perform public._notificar(array[c.atendente_id], '💰 Promissória paga', c.cliente || ' · nº ' || num || ' · ' || public._moeda(pago)
      || case when saldo - pago > 0 then ' · pendente ' || public._moeda(saldo - pago) else ' · quitada' end, c.id, 'promq-v:' || p_id || ':' || num);
  end if;
end $$;

-- CORRIGIR um lançamento (Gestão): nº, valor, data, vencimento
create or replace function public.corrigir_item_venda(p_item uuid, p_numero text, p_valor numeric, p_data date, p_vencimento date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.venda_itens; num text := btrim(coalesce(p_numero, ''));
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão corrige os dados da venda'; end if;
  select * into i from public.venda_itens where id = p_item for update;
  if not found then raise exception 'Lançamento não encontrado'; end if;
  if num = '' then raise exception 'Informe o nº da venda'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor'; end if;
  if i.tipo = 'promissoria' and round(p_valor, 2) < i.valor_pago then raise exception 'A promissória já tem % pago — o valor não pode ser menor', public._moeda(i.valor_pago); end if;
  if exists (select 1 from public.venda_itens where chamado_id = i.chamado_id and id <> i.id and status <> 'cancelada' and numero = num and (tipo = 'pagamento') = (i.tipo = 'pagamento')) then
    raise exception 'O nº % já está lançado neste cliente', num;
  end if;
  update public.venda_itens set numero = num, valor = round(p_valor, 2), data_venda = p_data,
    vencimento = case when tipo = 'promissoria' then p_vencimento else vencimento end where id = p_item;
  perform public._recalc_venda(i.chamado_id);
  perform public._reg(i.chamado_id, 'Gestão corrigiu o lançamento nº ' || i.numero || ' → nº ' || num || ' · ' || public._moeda(round(p_valor, 2)) || coalesce(' · ' || public._fmt_data(p_data), ''));
end $$;

-- corrigir_venda (tela antiga): só quando há um único nº
create or replace function public.corrigir_venda(p_id text, p_numero text, p_valor numeric, p_data date, p_vendedor text)
returns void language plpgsql security definer set search_path = '' as $$
declare n int; it uuid; v public.vendas;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão corrige os dados da venda'; end if;
  select * into v from public.vendas where chamado_id = p_id for update;
  if not found then raise exception 'Este cliente não tem venda registrada'; end if;
  select count(*), min(id::text)::uuid into n, it from public.venda_itens where chamado_id = p_id and tipo <> 'pagamento' and status <> 'cancelada';
  if n <> 1 then raise exception 'Esta venda tem mais de um nº — corrija cada nº na lista de vendas do cliente'; end if;
  update public.vendas set data_venda = p_data, vendedor = coalesce(nullif(btrim(coalesce(p_vendedor, '')), ''), v.vendedor) where chamado_id = p_id;
  perform public.corrigir_item_venda(it, p_numero, p_valor, p_data, (select vencimento from public.venda_itens where id = it));
end $$;

-- COMISSÃO: pelos lançamentos pagos (pago e pagamento de promissória), no mês de competência de cada um
create or replace function public._extrato_campo(p_uid uuid, p_de date, p_ate date)
returns table(visitas int, medidas int, vendas int, vendido numeric, reembolsos numeric, total numeric)
language sql stable security definer set search_path = '' as $$
  with cf as (select pagamento_visita pv, comissao_pct pct from public.config where id = 1),
  v as (select count(*)::int n from public.chamados c where c.consultor_id = p_uid and coalesce((c.tratativa->>'realizada')::boolean, false) and c.data_loja is not null and c.data_loja::date between p_de and p_ate),
  m as (select count(*)::int n from public.chamados c where c.tipo = 'medidas' and c.medidor_id = p_uid and (c.tratativa->'medida'->>'realizadaEm') is not null
          and ((c.tratativa->'medida'->>'realizadaEm')::timestamptz at time zone 'America/Sao_Paulo')::date between p_de and p_ate),
  pg as (select i.chamado_id, i.valor val, public._comp_item(i.data_venda, i.decidido_em, i.registrado_em) dia
           from public.venda_itens i join public.chamados c on c.id = i.chamado_id
          where c.consultor_id = p_uid and i.tipo in ('pago', 'pagamento') and i.status = 'efetivada'),
  s as (select count(distinct chamado_id)::int n, coalesce(sum(val), 0) val from pg where dia between p_de and p_ate),
  r as (select coalesce(sum(valor), 0) val from public.reembolsos where usuario_id = p_uid and status = 'aprovado' and data between p_de and p_ate)
  select v.n, m.n, s.n, s.val, r.val, (v.n + m.n) * cf.pv + s.val * cf.pct / 100 + r.val from v, m, s, r, cf;
$$;

create or replace function public._itens_campo(p_uid uuid, p_ate date)
returns table(chave text, tipo text, chamado_id text, descricao text, dia date, base numeric, valor numeric)
language sql stable security definer set search_path = '' as $$
  with cf as (select pagamento_visita pv, comissao_pct pct from public.config where id = 1)
  select 'visita:' || c.id, 'visita', c.id, 'Visita · ' || c.cliente, c.data_loja::date, 1::numeric, cf.pv
    from public.chamados c, cf
   where c.consultor_id = p_uid and coalesce((c.tratativa->>'realizada')::boolean, false) and c.data_loja is not null and c.data_loja::date <= p_ate
  union all
  select 'medida:' || c.id, 'medida', c.id, 'Medida · ' || c.cliente, ((c.tratativa->'medida'->>'realizadaEm')::timestamptz at time zone 'America/Sao_Paulo')::date, 1, cf.pv
    from public.chamados c, cf
   where c.tipo = 'medidas' and c.medidor_id = p_uid and (c.tratativa->'medida'->>'realizadaEm') is not null
     and ((c.tratativa->'medida'->>'realizadaEm')::timestamptz at time zone 'America/Sao_Paulo')::date <= p_ate
  union all
  select 'item:' || i.id, 'comissao', i.chamado_id,
         case when i.tipo = 'pagamento' then 'Comissão pagamento de promissória nº ' else 'Comissão venda nº ' end || i.numero || ' · ' || c.cliente,
         public._comp_item(i.data_venda, i.decidido_em, i.registrado_em), i.valor, round(i.valor * cf.pct / 100, 2)
    from public.venda_itens i join public.chamados c on c.id = i.chamado_id, cf
   where c.consultor_id = p_uid and i.tipo in ('pago', 'pagamento') and i.status = 'efetivada'
     and public._comp_item(i.data_venda, i.decidido_em, i.registrado_em) <= p_ate
  union all
  select 'reemb:' || r.id, 'reembolso', null, 'Reembolso · ' || r.tipo || case when coalesce(r.descricao,'') <> '' then ' · ' || r.descricao else '' end, r.data, r.valor, r.valor
    from public.reembolsos r
   where r.usuario_id = p_uid and r.status = 'aprovado' and r.data <= p_ate;
$$;

-- avisos: promissórias pendentes vêm dos lançamentos
do $do$ declare d text; n int; begin
  d := pg_get_functiondef('public._trg_venda_avisos()'::regprocedure);
  n := length(d);
  d := replace(d, $x$'nº ' || numero || ' ' || public._moeda(valor) || coalesce(' (vence '$x$, $x$'nº ' || numero || ' ' || public._moeda(valor - valor_pago) || coalesce(' (vence '$x$);
  d := replace(d, $x$from public.promissorias where chamado_id = c.id and status = 'aberta'$x$, $x$from public.venda_itens where chamado_id = c.id and tipo = 'promissoria' and status = 'efetivada' and valor > valor_pago$x$);
  if position('public.promissorias' in d) > 0 or position('valor - valor_pago' in d) = 0 then raise exception '_trg_venda_avisos: trecho nao encontrado'; end if;
  execute d;

  d := pg_get_functiondef('public.avisos_rotina_em(timestamp without time zone)'::regprocedure);
  d := replace(d, $x$from public.promissorias p join public.chamados c on c.id = p.chamado_id$x$, $x$from public.venda_itens p join public.chamados c on c.id = p.chamado_id$x$);
  d := replace(d, $x$where p.status = 'aberta'$x$, $x$where p.tipo = 'promissoria' and p.status = 'efetivada' and p.valor > p.valor_pago$x$);
  d := replace(d, $x$coalesce(sum(p.valor), 0)$x$, $x$coalesce(sum(p.valor - p.valor_pago), 0)$x$);
  if position('public.promissorias' in d) > 0 or position('p.valor > p.valor_pago' in d) = 0 then raise exception 'avisos_rotina_em: trecho nao encontrado'; end if;
  execute d;
end $do$;

-- JUNTAR clientes duplicados (uso interno): tudo da origem passa para o destino
create or replace function public._juntar_clientes(p_destino text, p_origem text) returns void
language plpgsql security definer set search_path = '' as $$
declare nums text;
begin
  select string_agg(numero, ', ') into nums from public.venda_itens where chamado_id = p_origem;
  if not exists (select 1 from public.vendas where chamado_id = p_destino) then
    update public.vendas set chamado_id = p_destino where chamado_id = p_origem;
  else
    update public.venda_itens set chamado_id = p_destino where chamado_id = p_origem;
    delete from public.vendas where chamado_id = p_origem;
  end if;
  update public.historico set chamado_id = p_destino where chamado_id = p_origem;
  update public.anexos set chamado_id = p_destino where chamado_id = p_origem;
  update public.notificacoes set chamado_id = p_destino where chamado_id = p_origem;
  update public.reembolsos set chamado_id = p_destino where chamado_id = p_origem;
  update public.chamados set vinculado_a = p_destino where vinculado_a = p_origem;
  update public.chamados d set telefone = coalesce(nullif(d.telefone, ''), o.telefone), endereco = coalesce(nullif(d.endereco, ''), o.endereco)
    from public.chamados o where d.id = p_destino and o.id = p_origem;
  delete from public.chamados where id = p_origem;
  perform public._recalc_venda(p_destino);
  perform public._reg(p_destino, '🔗 Cliente duplicado ' || p_origem || ' juntado a este cliente' || coalesce(' (venda nº ' || nums || ')', ''));
end $$;

revoke all on function public._recalc_venda(text), public._juntar_clientes(text, text), public._txt_itens(jsonb) from public, anon, authenticated;
revoke all on function public._extrato_campo(uuid, date, date), public._itens_campo(uuid, date) from public, anon, authenticated;
revoke all on function public.registrar_venda_itens(text, jsonb, date, text, uuid, boolean), public.decidir_itens_venda(text, jsonb),
  public.quitar_promissoria(uuid, numeric, text, date), public.corrigir_item_venda(uuid, text, numeric, date, date) from public, anon;
grant execute on function public.registrar_venda_itens(text, jsonb, date, text, uuid, boolean), public.decidir_itens_venda(text, jsonb),
  public.quitar_promissoria(uuid, numeric, text, date), public.corrigir_item_venda(uuid, text, numeric, date, date) to authenticated;

-- DADOS: cada venda existente vira um lançamento "pago" com a mesma situação
insert into public.venda_itens (chamado_id, tipo, numero, valor, data_venda, status, registrado_por, registrado_em, decidido_por, decidido_em)
select v.chamado_id, 'pago', v.numero, vv.valor, v.data_venda,
       case v.status::text when 'cancelada' then 'cancelada' when 'registrada' then 'registrada' else 'efetivada' end,
       v.registrado_por, v.registrado_em, v.decidido_por, v.decidido_em
  from public.vendas v join public.vendas_valores vv on vv.chamado_id = v.chamado_id
 where not exists (select 1 from public.venda_itens i where i.chamado_id = v.chamado_id);

drop table if exists public.promissorias;
