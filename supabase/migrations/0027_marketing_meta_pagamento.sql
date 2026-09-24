-- Pagamento das operadoras do marketing:
--  · R$ por venda fechada (efetivada) de cliente que ela agendou (consultor externo ou direto na loja) — valor em config.valor_venda_mkt
--  · bônus diário: a Supervisão Marketing define, dia a dia, meta de agendamentos e valor; quem bate a meta no dia ganha o bônus
--  · a Supervisão Marketing (ou a Gestão) aprova o pagamento do mês de cada operadora
alter table public.config add column if not exists valor_venda_mkt numeric(10,2) not null default 10;

create table if not exists public.mkt_metas (
  dia date primary key,
  meta int not null check (meta > 0),
  valor numeric(10,2) not null default 0 check (valor >= 0),
  obs text not null default '',
  criado_por uuid references public.usuarios(id),
  atualizado_em timestamptz not null default now()
);
create table if not exists public.mkt_pagamentos (
  id uuid primary key default gen_random_uuid(),
  operadora_id uuid not null references public.usuarios(id) on delete cascade,
  de date not null, ate date not null,
  agendamentos int not null default 0,
  vendas int not null default 0, valor_por_venda numeric(10,2) not null default 0, valor_vendas numeric(12,2) not null default 0,
  dias_meta int not null default 0, dias_batidos int not null default 0, bonus numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  detalhe jsonb not null default '{}'::jsonb,
  aprovado_por uuid references public.usuarios(id), aprovado_em timestamptz not null default now(),
  unique (operadora_id, de, ate)
);
alter table public.mkt_metas enable row level security;
alter table public.mkt_pagamentos enable row level security;
revoke insert, update, delete, truncate on public.mkt_metas, public.mkt_pagamentos from anon, authenticated;
revoke all on public.mkt_metas, public.mkt_pagamentos from anon;

create or replace function public.gere_mkt() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.usuario_ativo() and (public.eh_gestao() or 'marketing_supervisao' = any(public.meus_setores()));
$$;
create or replace function public.ve_mkt_pagamento() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.usuario_ativo() and (public.eh_gestao() or public.meus_setores() && array['marketing_operadora','marketing_supervisao','gerente_loja']);
$$;

create policy mkt_metas_ler on public.mkt_metas for select to authenticated using (public.ve_mkt_pagamento());
create policy mkt_pagamentos_ler on public.mkt_pagamentos for select to authenticated
  using (public.gere_mkt() or operadora_id = auth.uid());

create or replace function public.salvar_meta_mkt(p_dia date, p_meta int, p_valor numeric, p_obs text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.gere_mkt() then raise exception 'Só a Supervisão Marketing ou a Gestão definem a meta'; end if;
  if p_dia is null then raise exception 'Informe o dia'; end if;
  if p_meta is null or p_meta <= 0 then raise exception 'Informe a meta de agendamentos (maior que zero)'; end if;
  if p_valor is null or p_valor < 0 then raise exception 'Informe o valor do bônus'; end if;
  insert into public.mkt_metas (dia, meta, valor, obs, criado_por, atualizado_em)
  values (p_dia, p_meta, round(p_valor, 2), btrim(coalesce(p_obs,'')), auth.uid(), now())
  on conflict (dia) do update set meta = excluded.meta, valor = excluded.valor, obs = excluded.obs, criado_por = excluded.criado_por, atualizado_em = now();
end $$;

create or replace function public.remover_meta_mkt(p_dia date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.gere_mkt() then raise exception 'Só a Supervisão Marketing ou a Gestão removem a meta'; end if;
  delete from public.mkt_metas where dia = p_dia;
end $$;

-- cálculo do pagamento (mesma regra da tela): vendas efetivadas no período + bônus dos dias com meta batida
create or replace function public._calc_pagamento_mkt(p_op uuid, p_de date, p_ate date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare vv numeric := (select valor_venda_mkt from public.config where id = 1);
  n_ag int; n_vendas int; dm int; db int; bon numeric; dias jsonb;
begin
  select count(*) into n_ag from public.chamados c join public.tipos t on t.id = c.tipo
   where t.presale and c.solicitante_id = p_op and (c.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate;
  select count(*) into n_vendas from public.chamados c join public.tipos t on t.id = c.tipo join public.vendas v on v.chamado_id = c.id
   where t.presale and c.solicitante_id = p_op and v.status = 'efetivada'
     and coalesce(v.data_venda, (v.registrado_em at time zone 'America/Sao_Paulo')::date) between p_de and p_ate;
  with d as (
    select m.dia, m.meta, m.valor,
      (select count(*) from public.chamados c join public.tipos t on t.id = c.tipo
        where t.presale and c.solicitante_id = p_op and (c.criado_em at time zone 'America/Sao_Paulo')::date = m.dia) as feitos
    from public.mkt_metas m where m.dia between p_de and p_ate)
  select count(*), count(*) filter (where feitos >= meta), coalesce(sum(valor) filter (where feitos >= meta), 0),
         coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'meta', meta, 'feitos', feitos, 'valor', valor, 'bateu', feitos >= meta) order by dia), '[]'::jsonb)
    into dm, db, bon, dias from d;
  return jsonb_build_object('agendamentos', n_ag, 'vendas', n_vendas, 'valorPorVenda', vv, 'valorVendas', n_vendas * vv,
    'diasMeta', dm, 'diasBatidos', db, 'bonus', bon, 'total', n_vendas * vv + bon, 'dias', dias);
end $$;

create or replace function public.aprovar_pagamento_mkt(p_op uuid, p_de date, p_ate date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.gere_mkt() then raise exception 'Só a Supervisão Marketing ou a Gestão aprovam o pagamento'; end if;
  if p_de is null or p_ate is null or p_ate < p_de then raise exception 'Período inválido'; end if;
  if not exists (select 1 from public.usuario_setores where usuario_id = p_op and setor_id in ('marketing_operadora','marketing_supervisao')) then
    raise exception 'Esta pessoa não é do marketing';
  end if;
  r := public._calc_pagamento_mkt(p_op, p_de, p_ate);
  insert into public.mkt_pagamentos (operadora_id, de, ate, agendamentos, vendas, valor_por_venda, valor_vendas, dias_meta, dias_batidos, bonus, total, detalhe, aprovado_por, aprovado_em)
  values (p_op, p_de, p_ate, (r->>'agendamentos')::int, (r->>'vendas')::int, (r->>'valorPorVenda')::numeric, (r->>'valorVendas')::numeric,
          (r->>'diasMeta')::int, (r->>'diasBatidos')::int, (r->>'bonus')::numeric, (r->>'total')::numeric, r, auth.uid(), now())
  on conflict (operadora_id, de, ate) do update set agendamentos = excluded.agendamentos, vendas = excluded.vendas, valor_por_venda = excluded.valor_por_venda,
    valor_vendas = excluded.valor_vendas, dias_meta = excluded.dias_meta, dias_batidos = excluded.dias_batidos, bonus = excluded.bonus,
    total = excluded.total, detalhe = excluded.detalhe, aprovado_por = excluded.aprovado_por, aprovado_em = now();
  return r;
end $$;

create or replace function public.cancelar_aprovacao_mkt(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.gere_mkt() then raise exception 'Só a Supervisão Marketing ou a Gestão desfazem a aprovação'; end if;
  delete from public.mkt_pagamentos where id = p_id;
end $$;

drop function if exists public.salvar_config(numeric, numeric);
create or replace function public.salvar_config(p_pct numeric, p_pagamento numeric, p_valor_mkt numeric default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._exigir_admin();
  if p_pct is null or p_pagamento is null or p_pct < 0 or p_pagamento < 0 or (p_valor_mkt is not null and p_valor_mkt < 0) then raise exception 'Informe valores válidos'; end if;
  update public.config set comissao_pct = p_pct, pagamento_visita = p_pagamento, valor_venda_mkt = coalesce(p_valor_mkt, valor_venda_mkt),
    atualizado_em = now(), atualizado_por = auth.uid() where id = 1;
end $$;

revoke execute on function public.gere_mkt(), public.ve_mkt_pagamento(), public.salvar_meta_mkt(date, int, numeric, text), public.remover_meta_mkt(date),
  public._calc_pagamento_mkt(uuid, date, date), public.aprovar_pagamento_mkt(uuid, date, date), public.cancelar_aprovacao_mkt(uuid),
  public.salvar_config(numeric, numeric, numeric) from anon, public;
grant execute on function public.gere_mkt(), public.ve_mkt_pagamento(), public.salvar_meta_mkt(date, int, numeric, text), public.remover_meta_mkt(date),
  public.aprovar_pagamento_mkt(uuid, date, date), public.cancelar_aprovacao_mkt(uuid), public.salvar_config(numeric, numeric, numeric) to authenticated;
