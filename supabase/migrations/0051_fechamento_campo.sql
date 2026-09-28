-- Fechamento mensal de consultores/medidores: a Gestão confere e confirma; até lá tudo é PREVISÃO.
-- O que for confirmado é pago no mês seguinte. Venda cancelada depois de confirmada gera estorno no próximo fechamento.
create table if not exists public.campo_fechamentos (
  id uuid primary key default gen_random_uuid(),
  lote uuid not null,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  ate date not null, competencia date not null, pagar_em date not null,
  total numeric(12,2) not null default 0,
  fechado_por uuid references public.usuarios(id), fechado_em timestamptz not null default now()
);
create table if not exists public.campo_fechamento_itens (
  id bigserial primary key,
  fechamento_id uuid not null references public.campo_fechamentos(id) on delete cascade,
  usuario_id uuid not null,
  chave text not null, tipo text not null, chamado_id text, descricao text not null default '',
  dia date, base numeric(12,2) not null default 0, valor numeric(12,2) not null default 0
);
create index if not exists campo_fech_itens_u on public.campo_fechamento_itens (usuario_id, chave);
alter table public.campo_fechamentos enable row level security;
alter table public.campo_fechamento_itens enable row level security;
revoke all on public.campo_fechamentos, public.campo_fechamento_itens from anon;
revoke insert, update, delete, truncate on public.campo_fechamentos, public.campo_fechamento_itens from authenticated;
drop policy if exists campo_fech_ler on public.campo_fechamentos;
create policy campo_fech_ler on public.campo_fechamentos for select to authenticated using (public.eh_gestao() or usuario_id = auth.uid());
drop policy if exists campo_fech_itens_ler on public.campo_fechamento_itens;
create policy campo_fech_itens_ler on public.campo_fechamento_itens for select to authenticated using (public.eh_gestao() or usuario_id = auth.uid());

-- tudo o que gera pagamento para a pessoa, até a data (visitas, medidas, comissão por pagamento, reembolsos)
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
  select 'venda:' || vv.chamado_id || ':total', 'comissao', vv.chamado_id, 'Comissão venda ' || vv.numero || ' · ' || c.cliente,
         coalesce(vv.data_venda, (vv.registrado_em at time zone 'America/Sao_Paulo')::date), vl.valor, round(vl.valor * cf.pct / 100, 2)
    from public.vendas vv join public.vendas_valores vl on vl.chamado_id = vv.chamado_id join public.chamados c on c.id = vv.chamado_id, cf
   where c.consultor_id = p_uid and vv.status = 'efetivada' and not exists (select 1 from public.promissorias p where p.chamado_id = vv.chamado_id)
     and coalesce(vv.data_venda, (vv.registrado_em at time zone 'America/Sao_Paulo')::date) <= p_ate
  union all
  select 'venda:' || vv.chamado_id || ':entrada', 'comissao', vv.chamado_id, 'Comissão entrada venda ' || vv.numero || ' · ' || c.cliente,
         coalesce(vv.data_venda, (vv.registrado_em at time zone 'America/Sao_Paulo')::date), vl.entrada, round(vl.entrada * cf.pct / 100, 2)
    from public.vendas vv join public.vendas_valores vl on vl.chamado_id = vv.chamado_id join public.chamados c on c.id = vv.chamado_id, cf
   where c.consultor_id = p_uid and vv.status::text in ('entrada', 'efetivada') and vl.entrada > 0
     and coalesce(vv.data_venda, (vv.registrado_em at time zone 'America/Sao_Paulo')::date) <= p_ate
  union all
  select 'prom:' || p.id, 'comissao', p.chamado_id, 'Comissão promissória ' || p.numero || ' · ' || c.cliente,
         (p.quitada_em at time zone 'America/Sao_Paulo')::date, p.valor_pago, round(p.valor_pago * cf.pct / 100, 2)
    from public.promissorias p join public.chamados c on c.id = p.chamado_id join public.vendas vv on vv.chamado_id = p.chamado_id, cf
   where c.consultor_id = p_uid and p.valor_pago > 0 and vv.status <> 'cancelada' and (p.quitada_em at time zone 'America/Sao_Paulo')::date <= p_ate
  union all
  select 'reemb:' || r.id, 'reembolso', null, 'Reembolso · ' || r.tipo || case when coalesce(r.descricao,'') <> '' then ' · ' || r.descricao else '' end, r.data, r.valor, r.valor
    from public.reembolsos r
   where r.usuario_id = p_uid and r.status = 'aprovado' and r.data <= p_ate;
$$;

-- o que ainda falta confirmar (novos itens + ajustes/estornos do que já foi confirmado)
create or replace function public._pendente_campo(p_uid uuid, p_ate date)
returns table(chave text, tipo text, chamado_id text, descricao text, dia date, base numeric, valor numeric)
language sql stable security definer set search_path = '' as $$
  with atual as (select * from public._itens_campo(p_uid, p_ate)),
  conf as (select i.chave, max(i.tipo) tipo, max(i.chamado_id) chamado_id, max(i.descricao) descricao, sum(i.base) base, sum(i.valor) valor
             from public.campo_fechamento_itens i where i.usuario_id = p_uid group by i.chave)
  select a.chave, a.tipo, a.chamado_id, a.descricao, a.dia, a.base, a.valor
    from atual a left join conf k on k.chave = a.chave where k.chave is null
  union all
  select a.chave, a.tipo, a.chamado_id, 'Ajuste · ' || a.descricao, a.dia, a.base - k.base, a.valor - k.valor
    from atual a join conf k on k.chave = a.chave where a.base <> k.base
  union all
  select k.chave, k.tipo, k.chamado_id, 'Estorno · ' || regexp_replace(k.descricao, '^(Ajuste|Estorno) · ', ''), null::date, -k.base, -k.valor
    from conf k where k.valor <> 0 and not exists (select 1 from atual a where a.chave = k.chave);
$$;
revoke execute on function public._itens_campo(uuid, date), public._pendente_campo(uuid, date) from public, anon, authenticated;

-- quem entra no fechamento: consultores externos e medidores
create or replace function public._pessoas_campo() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct us.usuario_id from public.usuario_setores us join public.usuarios u on u.id = us.usuario_id
   where us.setor_id in ('consultor_externo', 'medidas') and u.ativo;
$$;
revoke execute on function public._pessoas_campo() from public, anon, authenticated;

-- prévia: a Gestão vê de todos; cada um vê a própria
create or replace function public.previa_fechamento_campo(p_ate date default null)
returns table(usuario_id uuid, nome text, chave text, tipo text, chamado_id text, descricao text, dia date, base numeric, valor numeric)
language plpgsql stable security definer set search_path = '' as $$
declare d date := coalesce(p_ate, (now() at time zone 'America/Sao_Paulo')::date);
begin
  if not public.usuario_ativo() then raise exception 'Sem acesso'; end if;
  return query
    select u.id, u.nome, x.chave, x.tipo, x.chamado_id, x.descricao, x.dia, x.base, x.valor
      from public.usuarios u, lateral public._pendente_campo(u.id, d) x
     where (public.eh_gestao() and u.id in (select public._pessoas_campo())) or u.id = auth.uid()
     order by u.nome, x.dia nulls last;
end $$;
revoke execute on function public.previa_fechamento_campo(date) from public, anon;
grant execute on function public.previa_fechamento_campo(date) to authenticated;

create or replace function public._mes_pt(d date) returns text language sql immutable set search_path = '' as $$
  select (array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'])[extract(month from d)::int] || '/' || extract(year from d)::int;
$$;

-- confirmar o fechamento (só Gestão): congela tudo o que está pendente até a data; paga no mês seguinte
create or replace function public.fechar_mes_campo(p_ate date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d date := coalesce(p_ate, (now() at time zone 'America/Sao_Paulo')::date); lt uuid := gen_random_uuid();
  u uuid; fid uuid; tot numeric; n int := 0; soma numeric := 0; comp date := date_trunc('month', d)::date; pg date := (date_trunc('month', d) + interval '1 month')::date;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão confirma o fechamento'; end if;
  if d > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'A data do fechamento não pode ser no futuro'; end if;
  for u in select public._pessoas_campo() loop
    select coalesce(sum(x.valor), 0) into tot from public._pendente_campo(u, d) x;
    if not exists (select 1 from public._pendente_campo(u, d)) then continue; end if;
    insert into public.campo_fechamentos (lote, usuario_id, ate, competencia, pagar_em, total, fechado_por)
      values (lt, u, d, comp, pg, tot, auth.uid()) returning id into fid;
    insert into public.campo_fechamento_itens (fechamento_id, usuario_id, chave, tipo, chamado_id, descricao, dia, base, valor)
      select fid, u, x.chave, x.tipo, x.chamado_id, x.descricao, x.dia, x.base, x.valor from public._pendente_campo(u, d) x;
    perform public._notificar(array[u], '✅ Pagamento confirmado pela Gestão',
      'Fechamento até ' || to_char(d, 'DD/MM') || ': ' || public._moeda(tot) || ' — será pago em ' || public._mes_pt(pg) || '.', null, 'fech-' || lt || '-' || u);
    n := n + 1; soma := soma + tot;
  end loop;
  if n = 0 then raise exception 'Nada pendente para confirmar até %', to_char(d, 'DD/MM/YYYY'); end if;
  return jsonb_build_object('lote', lt, 'pessoas', n, 'total', soma, 'pagar_em', pg);
end $$;
revoke execute on function public.fechar_mes_campo(date) from public, anon;
grant execute on function public.fechar_mes_campo(date) to authenticated;

-- desfazer o último fechamento (só Gestão)
create or replace function public.desfazer_fechamento_campo(p_lote uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare quando timestamptz;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão desfaz o fechamento'; end if;
  select max(fechado_em) into quando from public.campo_fechamentos where lote = p_lote;
  if quando is null then raise exception 'Fechamento não encontrado'; end if;
  if exists (select 1 from public.campo_fechamentos where fechado_em > quando and lote <> p_lote) then
    raise exception 'Só dá para desfazer o fechamento mais recente';
  end if;
  delete from public.campo_fechamentos where lote = p_lote;
end $$;
revoke execute on function public.desfazer_fechamento_campo(uuid) from public, anon;
grant execute on function public.desfazer_fechamento_campo(uuid) to authenticated;

-- lembrete à Gestão no penúltimo e no último dia do mês, às 10h
create or replace function public.lembrete_fechamento_campo() returns void
language plpgsql security definer set search_path = '' as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date; fim date := (date_trunc('month', hoje) + interval '1 month - 1 day')::date;
begin
  if hoje not in (fim - 1, fim) then return; end if;
  if exists (select 1 from public.campo_fechamentos where competencia = date_trunc('month', hoje)::date and fechado_em::date >= fim - 1) then return; end if;
  perform public._notificar(public._usuarios_setor(array['gestao']), '🔒 Fechamento de consultores e medidores',
    'Confira as vendas com o Financeiro e confirme o fechamento em Financeiro → Fechamento do mês. O que for confirmado é pago em ' || public._mes_pt((date_trunc('month', hoje) + interval '1 month')::date) || '.',
    null, 'fech-lembrete-' || hoje);
end $$;
revoke execute on function public.lembrete_fechamento_campo() from public, anon, authenticated;
select cron.schedule('fechamento-lembrete', '0 13 * * *', 'select public.lembrete_fechamento_campo()');
