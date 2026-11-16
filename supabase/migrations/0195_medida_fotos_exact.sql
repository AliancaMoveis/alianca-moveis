-- 0195: mandar para o Exact as fotos da medida feitas no 360
-- As medidas passam a ser feitas e aprovadas no 360; o Exact recebe a cópia das fotos.
-- Não existe rota de escrita para o cartão de Medição, mas existe para ANEXO DE TICKET — e o ticket do
-- checklist da venda a gente já conhece (exact_ticket). As fotos sobem nele com referenceType MEASURING,
-- que é o mesmo tipo que o Exact devolve ao ler os anexos do checklist. Assim a foto entra pela medida
-- e aparece no checklist do Exact.
--   medida_fotos_exact(id)     → o que mandar (ticket, fotos ainda não enviadas)
--   medida_fotos_exact_ok(id,p) → registra o que subiu (não manda a mesma foto duas vezes)
-- Só o service_role (a função exact) executa.

create or replace function public.medida_fotos_exact(p_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.chamados := public._medida(p_id); tk bigint; env jsonb; fotos jsonb;
begin
  select t.ticket_id into tk from public.exact_ticket t where t.sale_id = c.pedido;
  env := coalesce(c.tratativa->'medida'->'exactEnviadas', '[]'::jsonb);
  select coalesce(jsonb_agg(x order by x->>'em'), '[]'::jsonb) into fotos from (
    select jsonb_build_object('id', a.id, 'nome', coalesce(nullif(btrim(a.nome), ''), 'foto.jpg'), 'path', a.storage_path, 'fonte', 'medida', 'em', a.criado_em) as x
      from public.anexos a where a.chamado_id = c.id and a.tipo = 'img' and a.storage_path is not null
    union all
    select jsonb_build_object('id', a.id, 'nome', coalesce(nullif(btrim(a.nome), ''), 'foto.jpg'), 'path', a.storage_path, 'fonte', 'visita', 'em', a.criado_em)
      from public.anexos a
     where a.tipo = 'img' and a.storage_path is not null
       and a.chamado_id = nullif(c.tratativa->'medida'->>'visita360', '')
  ) s;
  return jsonb_build_object('id', c.id, 'venda', c.pedido, 'cliente', c.cliente, 'ticketId', tk,
    'etapa', coalesce(c.tratativa->'medida'->>'etapa', ''), 'enviadas', env,
    'fotos', (select coalesce(jsonb_agg(f), '[]'::jsonb) from jsonb_array_elements(fotos) f
               where not env ? (f->>'id')));
end $$;
revoke all on function public.medida_fotos_exact(text) from public, anon, authenticated;
grant execute on function public.medida_fotos_exact(text) to service_role;

create or replace function public.medida_fotos_exact_ok(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare m jsonb; ids jsonb; n int; erros text;
begin
  m := coalesce((select tratativa->'medida' from public.chamados where id = p_id), '{}'::jsonb);
  ids := coalesce(p->'enviadas', '[]'::jsonb);
  n := jsonb_array_length(ids);
  m := m || jsonb_build_object('exactEnviadas', coalesce(m->'exactEnviadas', '[]'::jsonb) || ids,
         'exactFotosEm', now(), 'exactFotosErro', nullif(btrim(coalesce(p->>'erro', '')), ''));
  perform set_config('alianca.sistema', '1', true);
  update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('medida', m) where id = p_id;
  perform set_config('alianca.sistema', '0', true);
  erros := nullif(btrim(coalesce(p->>'erro', '')), '');
  if n > 0 then perform public._reg(p_id, '📤 ' || n || ' foto(s) da medida enviada(s) para o Exact (anexo do checklist, tipo Medição)'
    || coalesce(' · falhas: ' || erros, ''));
  elsif erros is not null then perform public._reg(p_id, '⚠️ Não consegui enviar as fotos para o Exact: ' || erros);
  end if;
end $$;
revoke all on function public.medida_fotos_exact_ok(text, jsonb) from public, anon, authenticated;
grant execute on function public.medida_fotos_exact_ok(text, jsonb) to service_role;
