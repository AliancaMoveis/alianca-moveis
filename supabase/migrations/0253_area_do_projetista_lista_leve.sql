-- A Area do projetista parou de carregar: a resposta chegou a 4 MB (829 clientes na janela
-- de -45/+90 dias) e o gateway cortou o JSON no meio. A tela mostrava o proprio corpo
-- truncado como "erro". Piora sozinho conforme a base cresce, por isso ja aconteceu antes.
--
-- 92% do peso eram dois campos que a LISTA nao usa: historico (48%) e termo inteiro (44%).
-- A lista so precisa saber se o termo foi iniciado e finalizado. O resto vem sob demanda.
-- Resultado medido: 3980 kB -> 656 kB.
create or replace function public.ck_projetista_ficha(p_chamado text)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare c public.chamados; eu text := public._ck_meu_projetista();
begin
  if not public.pode_checklist() and eu is null then
    raise exception 'Só o projetista do checklist (ou o setor Checklist / Gestão) abre esta área';
  end if;
  select * into c from public.chamados where id = p_chamado and tipo = 'checklist';
  if not found then raise exception 'Checklist não encontrado'; end if;
  return jsonb_build_object(
    'id', c.id,
    'termo', c.tratativa->'checklist'->'termo',
    'historico', (select coalesce(jsonb_agg(jsonb_build_object('quando', h.quando, 'quem', h.quem_nome, 'texto', h.texto) order by h.quando desc), '[]'::jsonb)
                  from (select * from public.historico h0 where h0.chamado_id = c.id order by h0.quando desc limit 40) h));
end $function$;

comment on function public.ck_projetista_ficha(text) is
  'Termo completo + historico de UM checklist, para a tela do projetista carregar ao abrir o cliente (a lista vai leve).';
grant execute on function public.ck_projetista_ficha(text) to authenticated;

do $mig$
declare d text; de text; para text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ck_projetista_agenda';
  if d is null then raise exception 'ck_projetista_agenda nao encontrada'; end if;
  de := '''historico'', (select coalesce(jsonb_agg(jsonb_build_object(''quando'', h.quando, ''quem'', h.quem_nome, ''texto'', h.texto) order by h.quando desc), ''[]''::jsonb)
                      from (select * from public.historico h0 where h0.chamado_id = c.id order by h0.quando desc limit 40) h),
        ''termo'', k->''termo'') x';
  para := '''termo'', case when k->''termo'' is null then null else jsonb_build_object(
                   ''iniciadoEm'', k->''termo''->''iniciadoEm'', ''finalizadoEm'', k->''termo''->''finalizadoEm'') end,
        ''resumido'', true) x';
  if position(de in d) = 0 then raise exception 'ancora nao achada em ck_projetista_agenda'; end if;
  execute replace(d, de, para);
end $mig$;
