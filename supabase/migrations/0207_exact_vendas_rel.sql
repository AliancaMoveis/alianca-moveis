-- 🧾 Relatório de vendas do Exact puxado sozinho (rota tickets/sales-report) → Encontrar vendas / Confirmação de vendas
-- · exact_vendas_rel: 1 linha por venda (ID), com as colunas do relatório do Exact (jsonb, mesmos nomes do CSV) e "Incluído por"
-- · _exact_vendas_rel_aplicar(p): chamada pela função exact-vendas (service role); a mesma venda atualiza a linha (reserva que virou efetivada)
-- · exact_vendas_atualizar(de, ate): Gestão pede a atualização agora (pg_net → exact-vendas) · exact_vendas_resultado(req)
-- · exact_vendas_rel_lista(de, ate): linhas do período pela data da situação (como o relatório do Exact)
-- · exact_vendas_auto() + cron "vendas-exact" (a cada 2 h, 7h–21h): do dia 1 do mês anterior até hoje
-- · venda_confirmacao.incluido_por (quem incluiu: VENDAS01 = loja; Checklist.* = pedido da fábrica, não é venda)
alter table public.venda_confirmacao add column if not exists incluido_por text not null default '';

create table if not exists public.exact_vendas_rel (
  numero text primary key,
  linha jsonb not null,
  data_situacao date,
  incluido_por text not null default '',
  atualizado_em timestamptz not null default now()
);
create index if not exists exact_vendas_rel_data on public.exact_vendas_rel (data_situacao);
alter table public.exact_vendas_rel enable row level security;

create or replace function public._exact_vendas_rel_aplicar(p jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare r jsonb; n_novo int := 0; n_at int := 0; num text; ds date; novo boolean;
begin
  for r in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    num := regexp_replace(coalesce(r->>'ID', ''), '\D', '', 'g');
    if num = '' then continue; end if;
    ds := case when (r->>'DataSituação') ~ '^\d{2}/\d{2}/\d{4}' then to_date(substr(r->>'DataSituação', 1, 10), 'DD/MM/YYYY') end;
    novo := null;
    insert into public.exact_vendas_rel as t (numero, linha, data_situacao, incluido_por)
    values (num, r, ds, coalesce(r->>'Incluído por', ''))
    on conflict (numero) do update set linha = excluded.linha, data_situacao = excluded.data_situacao, incluido_por = excluded.incluido_por, atualizado_em = now()
      where t.linha is distinct from excluded.linha
    returning (xmax = 0) into novo;
    if novo is true then n_novo := n_novo + 1; elsif novo is false then n_at := n_at + 1; end if;
  end loop;
  return jsonb_build_object('novos', n_novo, 'atualizados', n_at);
end $$;
revoke all on function public._exact_vendas_rel_aplicar(jsonb) from public, anon, authenticated;

-- Gestão pede a atualização agora (o banco chama a função exact-vendas)
create or replace function public.exact_vendas_atualizar(p_de date, p_ate date) returns bigint
language plpgsql security definer set search_path to '' as $$
declare cfg record; rid bigint;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão'; end if;
  if p_de is null or p_ate is null or p_ate < p_de then raise exception 'Período inválido'; end if;
  if p_ate - p_de > 124 then raise exception 'Período máximo: 4 meses'; end if;
  select * into cfg from public.exact_config where id = 1;
  select net.http_post(url := regexp_replace(cfg.url_funcao, '/exact$', '/exact-vendas'),
    body := jsonb_build_object('acao', 'vendas', 'de', p_de, 'ate', p_ate, 'quem', coalesce((select nome from public.usuarios where id = auth.uid()), '')),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-exact-segredo', cfg.segredo), timeout_milliseconds := 150000) into rid;
  return rid;
end $$;

create or replace function public.exact_vendas_resultado(p_req bigint) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare r record;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão'; end if;
  select status_code, content, timed_out, error_msg into r from net._http_response where id = p_req;
  if not found then return null; end if;
  if r.status_code = 200 then return r.content::jsonb; end if;
  return jsonb_build_object('erro', coalesce((case when r.content ~ '^\s*\{' then r.content::jsonb->>'erro' end), r.error_msg, 'Exact não respondeu (' || coalesce(r.status_code::text, 'tempo esgotado') || ')'));
end $$;

-- linhas do período (pela data da situação), com as colunas do relatório do Exact
create or replace function public.exact_vendas_rel_lista(p_de date, p_ate date) returns jsonb
language sql stable security definer set search_path to '' as $$
  select case when public.eh_gestao() then coalesce(jsonb_agg(linha order by data_situacao, numero), '[]'::jsonb) else '[]'::jsonb end
  from public.exact_vendas_rel where data_situacao between p_de and p_ate $$;

-- última atualização (para mostrar "atualizado às …")
create or replace function public.exact_vendas_ultima() returns timestamptz
language sql stable security definer set search_path to '' as $$
  select case when public.eh_gestao() then max(atualizado_em) end from public.exact_vendas_rel $$;

create or replace function public.exact_vendas_auto() returns void
language plpgsql security definer set search_path to '' as $$
declare cfg record; d0 date := date_trunc('month', (now() at time zone 'America/Sao_Paulo') - interval '1 month')::date; d1 date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into cfg from public.exact_config where id = 1;
  if not found or not cfg.ler_ativo then return; end if;
  perform net.http_post(url := regexp_replace(cfg.url_funcao, '/exact$', '/exact-vendas'), body := jsonb_build_object('acao', 'vendas', 'de', d0, 'ate', d1, 'quem', 'automático'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-exact-segredo', cfg.segredo), timeout_milliseconds := 150000);
end $$;
revoke all on function public.exact_vendas_auto() from public, anon, authenticated;

select cron.schedule('vendas-exact', '41 10-23/2 * * *', 'select public.exact_vendas_auto()');

-- venda_conf_enviar passa a guardar quem incluiu a venda no Exact
create or replace function public.venda_conf_enviar(p jsonb) returns integer
language plpgsql security definer set search_path to '' as $$
declare x jsonb; n int := 0; num text; k int;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão confirma vendas'; end if;
  for x in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    num := btrim(coalesce(x->>'numero', ''));
    if num = '' or coalesce((x->>'valor')::numeric, 0) <= 0 then continue; end if;
    if (coalesce(x->>'fonte','360') <> '360' and exists (select 1 from public.venda_itens vi join public.chamados c on c.id = vi.chamado_id where vi.numero = num and vi.status = 'efetivada' and vi.tipo <> 'pagamento' and public.tipo_presale(c.tipo)))
       or exists (select 1 from public.exact_venda_checklist where numero = num) then continue; end if;
    insert into public.venda_confirmacao (numero, fonte, tipo, chamado_id, cands, cliente_ref, consultor_id, consultor_nome, mv, ex_cliente, ex_tel1, ex_tel2, ex_end, ex_idpessoa, ex_vendedor, vendedor_id, ex_situacao, valor, valor_exact, data, como, motivo, ex_total, ex_recebido, incluido_por)
    values (num, coalesce(nullif(x->>'fonte',''), '360'), coalesce(nullif(x->>'tipo',''), 'consultor'),
            (select id from public.chamados where id = nullif(x->>'chamado_id','')), coalesce(x->'cands', '[]'::jsonb), coalesce(x->>'cliente_ref',''),
            (select id from public.usuarios where id = nullif(x->>'consultor_id','')::uuid), coalesce(x->>'consultor_nome',''), coalesce(x->'mv', '{}'::jsonb),
            coalesce(x->>'ex_cliente',''), coalesce(x->>'ex_tel1',''), coalesce(x->>'ex_tel2',''), coalesce(x->>'ex_end',''), coalesce(x->>'ex_idpessoa',''),
            coalesce(x->>'ex_vendedor',''), (select id from public.usuarios where id = nullif(x->>'vendedor_id','')::uuid), coalesce(x->>'ex_situacao',''),
            round((x->>'valor')::numeric, 2), round((x->>'valor')::numeric, 2), nullif(x->>'data','')::date, coalesce(x->>'como',''), coalesce(x->>'motivo',''), nullif(x->>'ex_total','')::numeric, nullif(x->>'ex_recebido','')::numeric,
            coalesce(x->>'incluido_por',''))
    on conflict (numero) do update set incluido_por = excluded.incluido_por where public.venda_confirmacao.incluido_por = '' and excluded.incluido_por <> '';
    get diagnostics k = row_count; n := n + k;
  end loop;
  return n;
end $$;
