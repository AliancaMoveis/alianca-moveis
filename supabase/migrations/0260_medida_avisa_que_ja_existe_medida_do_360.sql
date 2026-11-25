-- Medidas: a ordem que vem do quadro do Exact passa a AVISAR quando a mesma venda já tem
-- medida feita pelo 360 (consultor na pré-venda, Minha Visita ou pós-venda).
--
-- O caso que gerou isto (25/11/2026): a consultora Gabriela visitou e mediu o cliente antes da
-- venda (ALM-5052 / ALM-8082, venda 1320335). A venda fechou no nome de outra pessoa, com outro
-- telefone. O cartão do Exact chegou, a busca por ordem existente pulou a medida do 360 — ela é
-- pulada DE PROPÓSITO, porque a do 360 precisa ser validada à parte — e nasceu a ALM-9212. O
-- Exact agendou a própria Gabriela para medir de novo a casa que ela já tinha medido.
--
-- A separação continua: as duas ordens seguem separadas e a do 360 continua indo para validação.
-- O que muda é que a ordem nova nasce MARCADA (tratativa.medida.ja360) e as duas ganham linha no
-- histórico, para quem agenda ver antes de mandar alguém.
--
-- NÃO se cruza por endereço aqui. Em condomínio a mesma rua e o mesmo número são unidades
-- diferentes, e um aviso errado faria cancelar medição boa. O cruzamento é pelo nº da venda, que
-- não erra. (Um matcher de endereço chegou a ser escrito e foi descartado: deu falso positivo em
-- "mesma rua, números diferentes" no próprio teste.)
--
-- Aplicada por patch em cima do corpo existente da função (pg_get_functiondef + replace), para não
-- retranscrever as ~90 linhas de exact_medidas_aplicar e arriscar perder algum trecho.

do $mig$
declare d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'exact_medidas_aplicar';

  n := d;

  if position('j360 public.chamados;' in n) = 0 then
    if position('declare x record; m public.chamados; ck public.chamados;' in n) = 0 then
      raise exception 'ancora 1 nao encontrada'; end if;
    n := replace(n, 'declare x record; m public.chamados; ck public.chamados;',
                    'declare x record; m public.chamados; ck public.chamados; j360 public.chamados;');
  end if;

  if position('-- ja existe medida do 360 nesta venda?' in n) = 0 then
    if position('      ck := null;' in n) = 0 then raise exception 'ancora 2 nao encontrada'; end if;
    n := replace(n, '      ck := null;',
      '      ck := null; j360 := null;' || chr(10) ||
      '      -- ja existe medida do 360 nesta venda? (consultor na pre-venda, Minha Visita, pos-venda)' || chr(10) ||
      '      -- Nao junta as duas de proposito: a do 360 precisa ser validada. Mas NAO pode ficar invisivel,' || chr(10) ||
      '      -- senao o Exact agenda outra pessoa (ou a mesma) para medir o que ja foi medido.' || chr(10) ||
      '      if x.venda is not null then' || chr(10) ||
      '        select * into j360 from public.chamados c' || chr(10) ||
      '         where c.tipo = ''medidas'' and c.pedido = x.venda' || chr(10) ||
      '           and coalesce(c.tratativa->''medida''->>''origem'','''') in (''consultor_360'', ''minha_visita'', ''360'')' || chr(10) ||
      '           and coalesce(c.tratativa->''medida''->>''etapa'','''') <> ''cancelada''' || chr(10) ||
      '         order by c.criado_em limit 1;' || chr(10) ||
      '      end if;');
  end if;

  if position('''ja360''' in n) = 0 then
    if position('''oficial'', case when et = ''liberada'' then true end, ''semPagamento'', true))))' in n) = 0 then
      raise exception 'ancora 3 nao encontrada'; end if;
    n := replace(n, '''oficial'', case when et = ''liberada'' then true end, ''semPagamento'', true))))',
      '''oficial'', case when et = ''liberada'' then true end, ''semPagamento'', true))' || chr(10) ||
      '              || case when j360.id is not null then jsonb_build_object(''ja360'', j360.id,' || chr(10) ||
      '                   ''ja360Origem'', coalesce(j360.tratativa->''medida''->>''origem'',''''),' || chr(10) ||
      '                   ''ja360Etapa'', coalesce(j360.tratativa->''medida''->>''etapa'','''')) else ''{}''::jsonb end))');
  end if;

  if position('JA EXISTE MEDIDA DO 360' in n) = 0 then
    if position('      n_novo := n_novo + 1;' in n) = 0 then raise exception 'ancora 4 nao encontrada'; end if;
    n := replace(n, '      n_novo := n_novo + 1;',
      '      if j360.id is not null then' || chr(10) ||
      '        insert into public.historico (chamado_id, quem_id, quem_nome, texto) values' || chr(10) ||
      '          (mid, null, ''Exact (integração)'', ''⚠ JA EXISTE MEDIDA DO 360 para a venda '' || coalesce(x.venda,'''') || '' ('' || j360.id || '') — confira antes de mandar alguem medir de novo.''),' || chr(10) ||
      '          (j360.id, null, ''Exact (integração)'', ''⚠ O Exact abriu outra ordem de medida para esta venda ('' || mid || '').'');' || chr(10) ||
      '      end if;' || chr(10) ||
      '      n_novo := n_novo + 1;');
  end if;

  if n = d then raise notice 'nada a mudar'; else execute n; raise notice 'funcao atualizada'; end if;
end $mig$;

-- Marca as ordens que JÁ estavam abertas (o aviso vale hoje, não só nas próximas sincronizações).
-- Em 25/11/2026 isto marcou 18 ordens, entre elas a ALM-9212 (Flavia/Gabriela, medição marcada
-- para o mesmo dia) e a ALM-9195 (Douglas Ferreira, marcada para 30/11).
with par as (
  select ex.id ordem, t.id m360,
         coalesce(t.tratativa->'medida'->>'origem','') org,
         coalesce(t.tratativa->'medida'->>'etapa','') et
  from public.chamados ex
  join lateral (
    select c.* from public.chamados c
     where c.tipo = 'medidas' and c.pedido = ex.pedido and c.id <> ex.id
       and coalesce(c.tratativa->'medida'->>'origem','') in ('consultor_360','minha_visita','360')
       and coalesce(c.tratativa->'medida'->>'etapa','') <> 'cancelada'
     order by c.criado_em limit 1) t on true
  where ex.tipo = 'medidas'
    and coalesce(ex.tratativa->'medida'->>'origem','') = 'exact'
    and coalesce(ex.tratativa->'medida'->>'etapa','') in ('pendente','agendada','realizada')
    and ex.tratativa->'medida'->>'ja360' is null
)
update public.chamados c
   set tratativa = jsonb_set(c.tratativa, '{medida}',
        (c.tratativa->'medida') || jsonb_build_object('ja360', par.m360, 'ja360Origem', par.org, 'ja360Etapa', par.et))
  from par where c.id = par.ordem;
