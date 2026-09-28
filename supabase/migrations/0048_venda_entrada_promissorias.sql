-- VENDAS: validação com entrada + promissória(s)
--  Situações (status_venda): registrada = "Pendente de análise" · efetivada · entrada ("Entrada + promissória") · promissoria · cancelada
--  · Entrada + promissória: parte paga (vendas_valores.entrada) gera comissão na hora; o restante fica em uma ou mais promissórias,
--    cada uma com nº de venda próprio e vencimento. Promissória pura: nada pago, sem comissão até quitar.
--  · Quitação (só Gestão): total → promissória quitada; parcial → a paga fica "parcial" com o valor pago e nasce uma NOVA promissória
--    com o restante (novo nº e vencimento). Sem promissória em aberto → a venda vira Efetivada.
--  · Comissão do consultor = pagamentos: entrada (na data da venda) + cada valor pago de promissória (na data da quitação);
--    venda efetivada sem promissórias = total na data da venda.
--  · Operadora do marketing: R$ 10 uma única vez, quando a venda é validada como Efetivada ou Entrada + promissória.

alter table public.vendas_valores add column if not exists entrada numeric(12,2) not null default 0;

create table if not exists public.promissorias (
  id uuid primary key default gen_random_uuid(),
  chamado_id text not null references public.chamados(id) on delete cascade,
  numero text not null,
  valor numeric(12,2) not null check (valor > 0),
  vencimento date,
  status text not null default 'aberta' check (status in ('aberta', 'quitada', 'parcial')),
  valor_pago numeric(12,2) not null default 0,
  quitada_em timestamptz,
  quitada_por uuid references public.usuarios(id),
  origem_id uuid references public.promissorias(id) on delete set null,
  criada_em timestamptz not null default now()
);
create index if not exists promissorias_chamado on public.promissorias (chamado_id);
alter table public.promissorias enable row level security;
revoke all on public.promissorias from anon, authenticated;
grant select on public.promissorias to authenticated;
drop policy if exists promissorias_ler on public.promissorias;
create policy promissorias_ler on public.promissorias for select to authenticated using (public.pode_ver_valor_id(chamado_id));

create or replace function public._label_venda(s public.status_venda) returns text
language sql immutable set search_path = '' as $$
  select case s::text when 'registrada' then 'Pendente de análise' when 'promissoria' then 'Promissória'
    when 'entrada' then 'Entrada + promissória' when 'efetivada' then 'Efetivada' when 'cancelada' then 'Cancelada' end;
$$;
create or replace function public._venda_para_cliente(s public.status_venda) returns public.status_cliente
language sql immutable set search_path = '' as $$
  select (case s::text when 'registrada' then 'vendido_revisao' when 'promissoria' then 'vendido_promissoria' when 'entrada' then 'vendido_promissoria'
    when 'efetivada' then 'vendido' when 'cancelada' then 'venda_cancelada' end)::public.status_cliente;
$$;

-- validação da venda pela Gestão (substitui o decidir_venda nas telas)
create or replace function public.validar_venda(p_id text, p_status text, p_entrada numeric default 0, p_promissorias jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados; v public.vendas; total numeric; soma numeric := 0; it jsonb; n int := 0; ent numeric := round(coalesce(p_entrada, 0), 2); txt text;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão valida a venda'; end if;
  c := public._chamado(p_id, false);
  select * into v from public.vendas where chamado_id = p_id for update;
  if not found then raise exception 'Este cliente não tem venda registrada'; end if;
  if p_status not in ('efetivada', 'entrada', 'promissoria', 'cancelada', 'registrada') then raise exception 'Situação inválida'; end if;
  if exists (select 1 from public.promissorias where chamado_id = p_id and status <> 'aberta') and p_status in ('entrada', 'promissoria', 'registrada') then
    raise exception 'Esta venda já tem promissória quitada — use a quitação para seguir';
  end if;
  select valor into total from public.vendas_valores where chamado_id = p_id;
  if p_status in ('entrada', 'promissoria') then
    if p_status = 'entrada' and (ent <= 0 or ent >= total) then raise exception 'Informe a entrada (maior que zero e menor que o total)'; end if;
    if p_status = 'promissoria' then ent := 0; end if;
    for it in select * from jsonb_array_elements(coalesce(p_promissorias, '[]'::jsonb)) loop
      if btrim(coalesce(it->>'numero', '')) = '' then raise exception 'Informe o nº da venda de cada promissória'; end if;
      if coalesce((it->>'valor')::numeric, 0) <= 0 then raise exception 'Informe o valor de cada promissória'; end if;
      if nullif(it->>'vencimento', '') is null then raise exception 'Informe o vencimento de cada promissória'; end if;
      soma := soma + round((it->>'valor')::numeric, 2); n := n + 1;
    end loop;
    if n = 0 then raise exception 'Informe a promissória'; end if;
    if abs(soma - (total - ent)) > 0.01 then
      raise exception 'A soma das promissórias (%) precisa ser igual ao total menos a entrada (%)', public._moeda(soma), public._moeda(total - ent);
    end if;
  else
    ent := 0;
  end if;
  -- refaz as promissórias em aberto desta venda
  delete from public.promissorias where chamado_id = p_id and status = 'aberta';
  if p_status in ('entrada', 'promissoria') then
    insert into public.promissorias (chamado_id, numero, valor, vencimento)
    select p_id, btrim(x->>'numero'), round((x->>'valor')::numeric, 2), (x->>'vencimento')::date from jsonb_array_elements(p_promissorias) x;
  end if;
  update public.vendas_valores set entrada = ent where chamado_id = p_id;
  update public.vendas set status = p_status::public.status_venda, decidido_por = auth.uid(), decidido_em = now() where chamado_id = p_id;
  update public.chamados set status_cliente = public._venda_para_cliente(p_status::public.status_venda),
    status = case when p_status = 'cancelada' then 'tratativa'::public.status_chamado else 'concluida'::public.status_chamado end
  where id = p_id;
  txt := case p_status
    when 'efetivada' then 'Efetivada — comissão sobre ' || public._moeda(total)
    when 'entrada' then 'Entrada ' || public._moeda(ent) || ' (gera comissão) + ' || n || ' promissória(s) de ' || public._moeda(soma)
    when 'promissoria' then n || ' promissória(s) de ' || public._moeda(soma) || ' — comissão só quando quitar'
    when 'cancelada' then 'Cancelada — não conta em relatórios' else 'Pendente de análise' end;
  perform public._reg(p_id, 'Venda ' || v.numero || ' validada: ' || txt || ' (por ' || public._nome(auth.uid()) || ')');
end $$;

-- mantém o decidir_venda antigo funcionando (efetivar/cancelar direto)
create or replace function public.decidir_venda(p_id text, p_novo public.status_venda, p_origem text default 'detalhe')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_novo::text in ('entrada', 'promissoria') then raise exception 'Para promissória, use "Validar" e informe o nº da promissória'; end if;
  perform public.validar_venda(p_id, p_novo::text, 0, '[]'::jsonb);
end $$;

-- quitação de promissória (total ou parcial)
create or replace function public.quitar_promissoria(p_id uuid, p_valor_pago numeric default null, p_novo_numero text default '', p_novo_venc date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.promissorias; c public.chamados; v public.vendas; pago numeric; resta numeric; abertas int; pct numeric;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão marca a promissória como paga'; end if;
  select * into p from public.promissorias where id = p_id for update;
  if not found then raise exception 'Promissória não encontrada'; end if;
  if p.status <> 'aberta' then raise exception 'Esta promissória já foi baixada'; end if;
  pago := round(coalesce(p_valor_pago, p.valor), 2);
  if pago <= 0 or pago > p.valor then raise exception 'Valor pago inválido (entre R$ 0,01 e %)', public._moeda(p.valor); end if;
  resta := p.valor - pago;
  select * into c from public.chamados where id = p.chamado_id;
  select * into v from public.vendas where chamado_id = p.chamado_id for update;
  if resta > 0 then
    if btrim(coalesce(p_novo_numero, '')) = '' or p_novo_venc is null then raise exception 'Pagamento parcial: informe o nº e o vencimento da nova promissória (restante %)', public._moeda(resta); end if;
    update public.promissorias set status = 'parcial', valor_pago = pago, quitada_em = now(), quitada_por = auth.uid() where id = p_id;
    insert into public.promissorias (chamado_id, numero, valor, vencimento, origem_id) values (p.chamado_id, btrim(p_novo_numero), resta, p_novo_venc, p_id);
    perform public._reg(p.chamado_id, '💰 Promissória ' || p.numero || ': pago ' || public._moeda(pago) || ' — restante ' || public._moeda(resta) || ' na nova promissória ' || btrim(p_novo_numero) || ' (vence ' || public._fmt_data(p_novo_venc) || ')');
  else
    update public.promissorias set status = 'quitada', valor_pago = pago, quitada_em = now(), quitada_por = auth.uid() where id = p_id;
    perform public._reg(p.chamado_id, '💰 Promissória ' || p.numero || ' quitada: ' || public._moeda(pago));
  end if;
  select count(*) into abertas from public.promissorias where chamado_id = p.chamado_id and status = 'aberta';
  if abertas = 0 then
    update public.vendas set status = 'efetivada', decidido_por = auth.uid(), decidido_em = now() where chamado_id = p.chamado_id;
    update public.chamados set status_cliente = 'vendido' where id = p.chamado_id;
    perform public._reg(p.chamado_id, '✅ Todas as promissórias pagas — venda ' || v.numero || ' efetivada');
  end if;
  select comissao_pct into pct from public.config where id = 1;
  if c.consultor_id is not null then
    perform public._notificar(array[c.consultor_id], '💰 Promissória paga', c.cliente || ' · prom. ' || p.numero || ' · ' || public._moeda(pago) || ' · + ' || public._moeda(round(pago * pct / 100, 2)) || ' de comissão liberada', c.id, 'promq-c:' || p_id);
  end if;
  if c.atendente_id is not null then
    perform public._notificar(array[c.atendente_id], '💰 Promissória paga', c.cliente || ' · prom. ' || p.numero || ' · ' || public._moeda(pago) || case when abertas = 0 then ' · venda efetivada' else '' end, c.id, 'promq-v:' || p_id);
  end if;
end $$;

-- avisos da venda: efetivada / entrada + promissória / promissória
create or replace function public._trg_venda_avisos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.chamados; val numeric; ent numeric; pct numeric; vmk numeric; prom text; tit text; corpo text; com numeric;
begin
  select * into c from public.chamados where id = new.chamado_id;
  if not found or not public.tipo_presale(c.tipo) then return null; end if;
  if tg_op = 'INSERT' and new.status = 'registrada' then
    perform public._notificar(public._usuarios_setor(array['gestao']), '🧾 Venda para validar', c.cliente || ' · venda nº ' || new.numero || coalesce(' · ' || public._nome(c.atendente_id), ''), c.id, 'vreg:' || c.id || ':' || new.numero);
  end if;
  if new.status::text in ('efetivada', 'entrada', 'promissoria') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    -- efetivada vinda da quitação das promissórias: o aviso é o da quitação
    if tg_op = 'UPDATE' and new.status::text = 'efetivada' and old.status::text in ('entrada', 'promissoria') then return null; end if;
    select valor, entrada into val, ent from public.vendas_valores where chamado_id = c.id;
    select comissao_pct, valor_venda_mkt into pct, vmk from public.config where id = 1;
    select string_agg('nº ' || numero || ' ' || public._moeda(valor) || coalesce(' (vence ' || to_char(vencimento, 'DD/MM') || ')', ''), ' + ') into prom
      from public.promissorias where chamado_id = c.id and status = 'aberta';
    if new.status::text = 'efetivada' then
      tit := '✅ Venda efetivada'; corpo := c.cliente || ' · venda nº ' || new.numero || coalesce(' · ' || public._moeda(val), ''); com := val;
    elsif new.status::text = 'entrada' then
      tit := '🟡 Venda com entrada + promissória'; corpo := c.cliente || ' · venda nº ' || new.numero || ' · entrada ' || public._moeda(ent) || ' paga · promissória ' || coalesce(prom, ''); com := ent;
    else
      tit := '📄 Venda em promissória'; corpo := c.cliente || ' · venda nº ' || new.numero || ' · ' || coalesce(prom, '') || ' · comissão quando quitar'; com := 0;
    end if;
    perform public._notificar(public._usuarios_setor(array['gestao']), tit, corpo
      || case when c.atendente_id is not null then ' · vendedor ' || public._nome(c.atendente_id) else '' end, c.id, 'vok-g:' || c.id || ':' || new.status::text);
    if c.consultor_id is not null then
      perform public._notificar(array[c.consultor_id], tit, corpo || case when com > 0 then ' · sua comissão ' || public._moeda(round(com * pct / 100, 2)) else '' end, c.id, 'vok-c:' || c.id || ':' || new.status::text);
    end if;
    if c.atendente_id is not null then
      perform public._notificar(array[c.atendente_id], tit, corpo, c.id, 'vok-v:' || c.id || ':' || new.status::text);
    end if;
    -- operadora: R$ 10 uma única vez (efetivada ou entrada)
    if new.status::text in ('efetivada', 'entrada') and c.solicitante_id is not null
       and exists (select 1 from public.usuario_setores where usuario_id = c.solicitante_id and setor_id = 'marketing_operadora') then
      perform public._notificar(array[c.solicitante_id], '💰 Venda confirmada', c.cliente || ' comprou! + ' || public._moeda(vmk) || ' na sua comissão.', c.id, 'vok-o:' || c.id);
    end if;
  end if;
  return null;
end $$;

-- operadora: conta venda efetivada OU com entrada (uma vez)
do $do$ declare d text; begin
  d := pg_get_functiondef('public._calc_pagamento_mkt(uuid,date,date)'::regprocedure);
  if position($x$v.status = 'efetivada'$x$ in d) = 0 then raise exception '_calc_pagamento_mkt: trecho nao encontrado'; end if;
  execute replace(d, $x$v.status = 'efetivada'$x$, $x$v.status::text in ('efetivada', 'entrada')$x$);
end $do$;

-- medida automática também na venda com entrada
do $do$ declare d text; begin
  d := pg_get_functiondef('public._trg_venda_cria_medida()'::regprocedure);
  d := replace(d, $x$if new.status not in ('efetivada', 'promissoria') then return null; end if;$x$, $x$if new.status::text not in ('efetivada', 'promissoria', 'entrada') then return null; end if;$x$);
  d := replace(d, $x$if tg_op = 'UPDATE' and old.status in ('efetivada', 'promissoria') then return null; end if;$x$, $x$if tg_op = 'UPDATE' and old.status::text in ('efetivada', 'promissoria', 'entrada') then return null; end if;$x$);
  execute d;
end $do$;

-- extrato de campo: comissão pelos PAGAMENTOS (entrada na data da venda + promissórias na data da quitação)
create or replace function public._extrato_campo(p_uid uuid, p_de date, p_ate date)
returns table(visitas int, medidas int, vendas int, vendido numeric, reembolsos numeric, total numeric)
language sql stable security definer set search_path = '' as $$
  with cf as (select pagamento_visita pv, comissao_pct pct from public.config where id = 1),
  v as (select count(*)::int n from public.chamados c where c.consultor_id = p_uid and coalesce((c.tratativa->>'realizada')::boolean, false) and c.data_loja is not null and c.data_loja::date between p_de and p_ate),
  m as (select count(*)::int n from public.chamados c where c.tipo = 'medidas' and c.medidor_id = p_uid and (c.tratativa->'medida'->>'realizadaEm') is not null
          and ((c.tratativa->'medida'->>'realizadaEm')::timestamptz at time zone 'America/Sao_Paulo')::date between p_de and p_ate),
  pg as (
    -- efetivada sem promissórias: total na data da venda
    select vv.chamado_id, vl.valor val, coalesce(vv.data_venda, (vv.registrado_em at time zone 'America/Sao_Paulo')::date) dia
      from public.vendas vv join public.vendas_valores vl on vl.chamado_id = vv.chamado_id join public.chamados c on c.id = vv.chamado_id
     where c.consultor_id = p_uid and vv.status = 'efetivada' and not exists (select 1 from public.promissorias p where p.chamado_id = vv.chamado_id)
    union all
    -- entrada na data da venda
    select vv.chamado_id, vl.entrada, coalesce(vv.data_venda, (vv.registrado_em at time zone 'America/Sao_Paulo')::date)
      from public.vendas vv join public.vendas_valores vl on vl.chamado_id = vv.chamado_id join public.chamados c on c.id = vv.chamado_id
     where c.consultor_id = p_uid and vv.status::text in ('entrada', 'efetivada') and vl.entrada > 0
    union all
    -- promissórias pagas na data da quitação
    select p.chamado_id, p.valor_pago, (p.quitada_em at time zone 'America/Sao_Paulo')::date
      from public.promissorias p join public.chamados c on c.id = p.chamado_id join public.vendas vv on vv.chamado_id = p.chamado_id
     where c.consultor_id = p_uid and p.valor_pago > 0 and vv.status <> 'cancelada'),
  s as (select count(distinct chamado_id)::int n, coalesce(sum(val), 0) val from pg where dia between p_de and p_ate),
  r as (select coalesce(sum(valor), 0) val from public.reembolsos where usuario_id = p_uid and status = 'aprovado' and data between p_de and p_ate)
  select v.n, m.n, s.n, s.val, r.val, (v.n + m.n) * cf.pv + s.val * cf.pct / 100 + r.val from v, m, s, r, cf;
$$;

revoke execute on function public.validar_venda(text, text, numeric, jsonb), public.quitar_promissoria(uuid, numeric, text, date) from public, anon;
grant execute on function public.validar_venda(text, text, numeric, jsonb), public.quitar_promissoria(uuid, numeric, text, date) to authenticated;
revoke execute on function public._extrato_campo(uuid, date, date) from public, anon, authenticated;
