-- Francilene aparecia duas vezes no relatorio de agendamentos pagos.
-- Causa: o que subia manual gravava 'francilene' (4992 registros, ate 11/11) e a API
-- passou a gravar 'Francilene' (381, de 11/11 em diante). O filtro das agendadoras pagas
-- ja comparava com lower(btrim(...)), entao as duas passavam -- mas o GROUP BY era pelo
-- texto cru, e viravam duas linhas. A tela da propria agendadora (montagem_meus_agend)
-- nunca teve esse problema porque compara normalizado nos dois lados.
--
-- Duas camadas de correcao: os dados ficam numa grafia so, e os relatorios passam a
-- agrupar pelo nome normalizado, para nao rachar de novo quando a fonte mudar a grafia.
-- Francyne NAO entra nisso: e outra pessoa, com usuario e e-mail proprios.

create table if not exists public.montagem_lider_backup (
  chave text, lider_antes text, salvo_em timestamptz not null default now(), motivo text
);

insert into public.montagem_lider_backup(chave, lider_antes, motivo)
select a.chave, a.lider, 'uniformiza grafia da agendadora (migracao 0247)'
from public.montagem_agend a
where btrim(a.lider) <> '' and lower(btrim(a.lider)) = 'francilene' and btrim(a.lider) <> 'Francilene';

update public.montagem_agend a
   set lider = 'Francilene'
 where btrim(a.lider) <> '' and lower(btrim(a.lider)) = 'francilene' and btrim(a.lider) <> 'Francilene';

-- A lista oficial passa a usar a mesma grafia (o filtro ja normalizava; isto e so clareza).
update public.montagem_cfg
   set valor = (select jsonb_agg(case when lower(btrim(x)) = 'francilene' then 'Francilene' else x end)
                  from jsonb_array_elements_text(valor) x)
 where chave = 'agendadoras_pagas';

-- montagem_resumo: agrupa normalizado e mostra a grafia mais recente da pessoa.
do $mig$
declare d text; de text; para text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'montagem_resumo';
  if d is null then raise exception 'montagem_resumo nao encontrada'; end if;

  de   := 'select jsonb_build_object(''nome'', lider, ''n'', count(*)) x from ag where not fora and data_inclusao between p_de and p_ate and lower(btrim(lider)) = any(v_lista) group by lider';
  para := 'select jsonb_build_object(''nome'', (array_agg(btrim(lider) order by data_inclusao desc))[1], ''n'', count(*)) x from ag where not fora and data_inclusao between p_de and p_ate and lower(btrim(lider)) = any(v_lista) group by lower(btrim(lider))';
  if position(de in d) = 0 then raise exception 'trecho esperado nao achado em montagem_resumo'; end if;
  execute replace(d, de, para);
end $mig$;

-- montagem_ag_fechar: mesma coisa no resumo do fechamento.
do $mig$
declare d text; de text; para text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'montagem_ag_fechar';
  if d is null then raise exception 'montagem_ag_fechar nao encontrada'; end if;

  de   := 'from (select a.lider, count(*) n,';
  para := 'from (select (array_agg(btrim(a.lider) order by a.data_inclusao desc))[1] as lider, count(*) n,';
  if position(de in d) = 0 then raise exception 'trecho 1 nao achado em montagem_ag_fechar'; end if;
  d := replace(d, de, para);

  de   := 'a.data_inclusao between v_de and v_ate group by a.lider) s';
  para := 'a.data_inclusao between v_de and v_ate group by lower(btrim(a.lider))) s';
  if position(de in d) = 0 then raise exception 'trecho 2 nao achado em montagem_ag_fechar'; end if;
  d := replace(d, de, para);

  execute d;
end $mig$;
