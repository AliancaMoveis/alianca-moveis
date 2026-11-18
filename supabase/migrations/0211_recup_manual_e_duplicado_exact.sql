-- 1) Recuperação: cupom e desconto podem ser informados à mão
--
-- Quando o ticket do Exact não traz o valor do cupom e o percentual de desconto (venda
-- 100% promissória, venda lançada com erro), o projetista ficava sem conseguir informar a
-- recuperação. Agora ele digita os valores como estão no Tático e a linha segue para o
-- financeiro do mesmo jeito — marcada, para a Regina conferir antes de aprovar.
alter table public.ck_recuperacao add column if not exists manual boolean not null default false;

do $do$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ck_recuperacao_salvar';
  if d is null then raise exception 'ck_recuperacao_salvar não existe'; end if;
  if position('manual' in d) > 0 then return; end if;   -- já aplicada
  d := replace(d,
    'insert into public.ck_recuperacao (chamado_id, projetista, valor_inicial, desconto_pct, valor_final, diferenca, recuperado, faixa, comissao, obs, venda_tatico, informado_por, informado_em, status)',
    'insert into public.ck_recuperacao (chamado_id, projetista, valor_inicial, desconto_pct, valor_final, diferenca, recuperado, faixa, comissao, obs, venda_tatico, manual, informado_por, informado_em, status)');
  d := replace(d,
    'values (p_chamado, proj, vi, dp, vf, dif, rec, fx, com, nullif(btrim(coalesce(p->>''obs'','''')), ''''), vt, quem, now(), ''pendente'')',
    'values (p_chamado, proj, vi, dp, vf, dif, rec, fx, com, nullif(btrim(coalesce(p->>''obs'','''')), ''''), vt, coalesce((p->>''manual'')::boolean, false), quem, now(), ''pendente'')');
  d := replace(d,
    'venda_tatico = coalesce(excluded.venda_tatico, public.ck_recuperacao.venda_tatico),',
    'venda_tatico = coalesce(excluded.venda_tatico, public.ck_recuperacao.venda_tatico), manual = excluded.manual,');
  d := replace(d,
    '|| coalesce('' · venda no Tático '' || vt, ''''));',
    '|| coalesce('' · venda no Tático '' || vt, '''') || case when coalesce((p->>''manual'')::boolean, false) then '' · cupom e desconto informados à mão (o ticket do Exact não trouxe)'' else '''' end);');
  execute d;
end $do$;

do $do$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ck_recuperacao_lista';
  if position('''manual'', r.manual' in d) > 0 then return; end if;
  execute replace(d, '''status'', r.status, ''obs'', r.obs', '''manual'', r.manual, ''status'', r.status, ''obs'', r.obs');
end $do$;

-- 2) Checklist duplicado pela sincronia do Exact
--
-- O atendimento continua na agenda do Exact depois de pronto. Em exact_aplicar, a busca pela
-- ficha da venda só olhava checklists NÃO concluídos; assim que o projetista finalizava
-- (status concluida, etapa realizado), a ficha deixava de ser encontrada e a sincronia abria
-- OUTRO checklist do mesmo cliente, no mesmo dia e hora — foi o que aconteceu com a Silvane
-- e com a Gislaine. Agora, se já existe ficha desta venda com este MESMO dia, a sincronia
-- entende que é o atendimento que já foi feito e não cria nada. Uma remarcação de verdade
-- (outro dia) continua abrindo checklist novo, como antes.
do $do$
declare d text; a text; b text; nl text := chr(13) || chr(10);
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'exact_aplicar';
  if d is null then raise exception 'exact_aplicar não existe'; end if;
  if position('ja_atendido' in d) > 0 then return; end if;   -- já aplicada
  a := 'and (ch.status <> ''concluida'' or ch.tratativa->''checklist''->>''etapa'' = ''agendado'') order by ch.criado_em limit 1;';
  if position(a in d) = 0 then raise exception 'busca da ficha do checklist não encontrada'; end if;
  b := a || nl ||
   '    -- O atendimento do Exact fica na agenda dele depois de pronto. Sem esta trava, assim que o' || nl ||
   '    -- projetista finalizava o checklist (status concluida, etapa realizado) o select acima deixava' || nl ||
   '    -- de encontrar a ficha e a sincronia abria OUTRO checklist do mesmo cliente, no mesmo dia e hora.' || nl ||
   '    -- Se já existe ficha desta venda com este MESMO dia, o atendimento é este — não é remarcação.' || nl ||
   '    if not found and exists (select 1 from public.chamados ch, jsonb_array_elements(' || nl ||
   '           jsonb_build_array(jsonb_build_object(''data'', ch.tratativa->''checklist''->>''agendadoPara''))' || nl ||
   '           || case when jsonb_typeof(ch.tratativa->''checklist''->''diasExtras'') = ''array'' then ch.tratativa->''checklist''->''diasExtras'' else ''[]''::jsonb end) e' || nl ||
   '         where ch.tipo = ''checklist'' and ch.pedido = r.sale_id and ch.id = ch.id /*ja_atendido*/' || nl ||
   '           and nullif(e->>''data'','''')::timestamp::date = (r.d->0->>''t'')::timestamp::date) then continue; end if;';
  execute replace(d, a, b);
end $do$;
