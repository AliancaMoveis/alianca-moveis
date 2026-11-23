-- A base de clientes deixa de depender de importação à mão. O relatório de vendas do Exact já
-- chega sozinho de 2 em 2 horas (cron vendas-exact, minuto 41, 10h às 23h); agora ele alimenta
-- base_clientes e base_clientes_vendas.
--
-- Decisões, todas medidas antes:
--  · editado_manual é respeitado campo por campo: o que foi corrigido à mão na ficha do cliente
--    nunca é sobrescrito pelo Exact;
--  · o endereço vem numa string só ("RUA X, 123 - CASA, BAIRRO - CIDADE") e é quebrada por regex.
--    4.799 das 4.801 linhas estão no padrão; as 2 fora entram SEM endereço, não com endereço
--    errado. UF não existe no relatório, então nunca é tocada;
--  · ValorDesc do Exact NÃO é desconto. Em toda a amostra total - ValorDesc = recebido, ou seja,
--    é saldo a receber. Por isso desconto fica 0 em vez de gravar um número errado num campo que
--    alimenta relatório;
--  · origem só aceitava exemplo/tatico/manual, daí o CHECK novo com 'exact'. Em cliente que já
--    existia, origem não muda (ela registra de onde o cadastro nasceu) — quem conta a história da
--    atualização é atualizado_por.
alter table public.base_clientes
  add constraint base_clientes_origem_check2
  check (origem = any (array['exemplo', 'tatico', 'manual', 'exact'])) not valid;
alter table public.base_clientes_vendas
  add constraint base_clientes_vendas_origem_check2
  check (origem = any (array['exemplo', 'tatico', 'manual', 'exact'])) not valid;
alter table public.base_clientes drop constraint if exists base_clientes_origem_check;
alter table public.base_clientes_vendas drop constraint if exists base_clientes_vendas_origem_check;
alter table public.base_clientes validate constraint base_clientes_origem_check2;
alter table public.base_clientes_vendas validate constraint base_clientes_vendas_origem_check2;

create or replace function public.base_clientes_do_exact(p_desde timestamptz default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare n_cli int := 0; n_ven int := 0;
begin
  with bruto as (
    select regexp_replace(coalesce(v.linha->>'CPFCNPJCli', ''), '\D', '', 'g') as doc,
           upper(btrim(coalesce(v.linha->>'Cliente', ''))) as nome,
           regexp_replace(coalesce(v.linha->>'ClienteTel1', ''), '\D', '', 'g') as tel1,
           regexp_replace(coalesce(v.linha->>'ClienteTel2', ''), '\D', '', 'g') as tel2,
           upper(btrim(coalesce(m[1], ''))) as lograd, btrim(coalesce(m[2], '')) as num,
           upper(btrim(coalesce(m[3], ''))) as compl, upper(btrim(coalesce(m[4], ''))) as bairro,
           upper(btrim(coalesce(m[5], ''))) as cidade,
           v.data_situacao, v.atualizado_em
      from public.exact_vendas_rel v
      left join lateral regexp_match(coalesce(v.linha->>'Orçamento', ''), '^(.+?), (.+?) - (.*), (.+?) - (.+)$') m on true
     where (p_desde is null or v.atualizado_em >= p_desde)
       and length(regexp_replace(coalesce(v.linha->>'CPFCNPJCli', ''), '\D', '', 'g')) in (11, 14)
       and btrim(coalesce(v.linha->>'Cliente', '')) <> ''
  ), src as (
    select distinct on (doc) * from bruto order by doc, data_situacao desc nulls last, atualizado_em desc
  ), ins as (
    insert into public.base_clientes as b
      (cpf_cnpj, nome, telefone1, telefone2, logradouro, numero, complemento, bairro, cidade, origem, atualizado_por)
    select doc, nome, tel1, tel2, lograd, num, compl, bairro, cidade, 'exact', 'Exact (automático)' from src
    on conflict (cpf_cnpj) do update set
      nome        = case when 'nome'        = any(b.editado_manual) or excluded.nome        = '' then b.nome        else excluded.nome end,
      telefone1   = case when 'telefone1'   = any(b.editado_manual) or excluded.telefone1   = '' then b.telefone1   else excluded.telefone1 end,
      telefone2   = case when 'telefone2'   = any(b.editado_manual) or excluded.telefone2   = '' then b.telefone2   else excluded.telefone2 end,
      logradouro  = case when 'logradouro'  = any(b.editado_manual) or excluded.logradouro  = '' then b.logradouro  else excluded.logradouro end,
      numero      = case when 'numero'      = any(b.editado_manual) or excluded.numero      = '' then b.numero      else excluded.numero end,
      complemento = case when 'complemento' = any(b.editado_manual) or excluded.complemento = '' then b.complemento else excluded.complemento end,
      bairro      = case when 'bairro'      = any(b.editado_manual) or excluded.bairro      = '' then b.bairro      else excluded.bairro end,
      cidade      = case when 'cidade'      = any(b.editado_manual) or excluded.cidade      = '' then b.cidade      else excluded.cidade end,
      atualizado_em = now(), atualizado_por = 'Exact (automático)'
    returning 1)
  select count(*) into n_cli from ins;

  with v as (
    select v.numero as num, c.id as cliente_id,
           case when (v.linha->>'IncluidaEm') ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}'
                then to_timestamp(v.linha->>'IncluidaEm', 'DD/MM/YYYY HH24:MI')
                else v.data_situacao::timestamptz end as dt,
           btrim(coalesce(v.linha->>'SituaçãoVenda', '')) as sit,
           upper(btrim(coalesce(v.linha->>'Vendedor', ''))) as vend,
           coalesce(nullif(v.linha->>'ValorTotal', '')::numeric, 0) as total,
           coalesce(nullif(v.linha->>'ValorTotaRecebido', '')::numeric, 0) as receb,
           btrim(coalesce(v.linha->>'Orçamento', '')) as ender
      from public.exact_vendas_rel v
      join public.base_clientes c
        on c.cpf_cnpj = regexp_replace(coalesce(v.linha->>'CPFCNPJCli', ''), '\D', '', 'g')
     where (p_desde is null or v.atualizado_em >= p_desde)
       and v.numero ~ '^[0-9]+$'
  ), insv as (
    insert into public.base_clientes_vendas as z
      (cliente_id, num_venda, data_venda, situacao, vendedor, valor_total, desconto, valor_recebido, endereco_venda, origem)
    select cliente_id, num, dt, sit, vend, total, 0, receb, ender, 'exact' from v
    on conflict (num_venda) do update set
      cliente_id = excluded.cliente_id,
      data_venda = coalesce(excluded.data_venda, z.data_venda),
      situacao   = case when excluded.situacao = '' then z.situacao else excluded.situacao end,
      vendedor   = case when excluded.vendedor = '' then z.vendedor else excluded.vendedor end,
      valor_total = excluded.valor_total, valor_recebido = excluded.valor_recebido,
      endereco_venda = case when excluded.endereco_venda = '' then z.endereco_venda else excluded.endereco_venda end,
      origem = 'exact'
    returning 1)
  select count(*) into n_ven from insv;

  return jsonb_build_object('clientes', n_cli, 'vendas', n_ven, 'em', now());
end $$;

-- 15 min depois do vendas-exact, para o relatório já ter chegado
select cron.schedule('base-clientes-exact', '56 10-23/2 * * *', 'select public.base_clientes_do_exact()');

-- Montagem: o nome do cliente da O.S. vive dentro do bruto. O backfill de 0246 resolveu o passado;
-- este gatilho resolve o futuro — toda O.S. que chega ou muda pelo import entra com cliente e
-- cliente_norm preenchidos, senão o montador sumiria da ficha nas montagens novas.
create or replace function public._trg_montagem_cliente() returns trigger
language plpgsql set search_path to '' as $$
begin
  if new.bruto is not null then
    new.cliente := btrim(split_part(new.bruto->0->>'os', '|', 2));
    new.cliente_norm := public._nome_norm(new.cliente);
  end if;
  return new;
end $$;

drop trigger if exists montagem_agend_cliente on public.montagem_agend;
create trigger montagem_agend_cliente before insert or update of bruto on public.montagem_agend
  for each row execute function public._trg_montagem_cliente();
