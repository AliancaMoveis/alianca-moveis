-- 360 → Exact: a aprovação de pagamento feita aqui passa a valer lá.
-- Rota do ERP: POST /tickets/assemble/bulk-approve-payments {ownerId, fieldReportIds}
-- O ticket sai de ASSEMBLE_APPROVED para ASSEMBLE_FINALIZED ("PAGAMENTO EFETUADO" no relatório).
-- A chamada sai da edge function "exact-pagar" (segredo em exact_config, token no EXACT_TOKEN).

alter table public.montagem_efet
  add column if not exists exact_pag_em   timestamptz,
  add column if not exists exact_pag_erro text;

create or replace function public.montagem_exact_pagar(p_chaves text[])
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare cfg record; rid bigint; n int; alvo text;
begin
  if not (public._so_gestao_setor() or exists (
      select 1 from public.usuario_acessos ua where ua.usuario_id = auth.uid() and ua.acesso = 'montagem'))
  then raise exception 'Só a Gestão e o Financeiro aprovam pagamento'; end if;
  if p_chaves is null or cardinality(p_chaves) = 0 then raise exception 'Selecione pelo menos uma O.S.'; end if;

  select count(*) into n from public.montagem_efet
   where chave = any(p_chaves) and excluido_em is null and nao_pagar_em is null and origem is distinct from 'avulsa';
  if n = 0 then raise exception 'Nenhuma O.S. do Exact nesta seleção (ordens avulsas só existem aqui)'; end if;

  select * into cfg from public.exact_config where id = 1;
  alvo := regexp_replace(cfg.url_funcao, '/exact/?$', '/exact-pagar');
  if alvo = cfg.url_funcao then raise exception 'URL da função do Exact inesperada: %', cfg.url_funcao; end if;

  select net.http_post(
    url := alvo,
    body := jsonb_build_object('chaves', to_jsonb(p_chaves),
                               'quem', coalesce((select nome from public.usuarios where id = auth.uid()), '')),
    headers := jsonb_build_object('Content-Type','application/json','x-exact-segredo', cfg.segredo),
    timeout_milliseconds := 150000) into rid;
  return rid;
end $function$;

revoke all on function public.montagem_exact_pagar(text[]) from public, anon;
grant execute on function public.montagem_exact_pagar(text[]) to authenticated;

create or replace function public.montagem_exact_pagar_resultado(p_req bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare r record;
begin
  if not (public._so_gestao_setor() or exists (
      select 1 from public.usuario_acessos ua where ua.usuario_id = auth.uid() and ua.acesso = 'montagem'))
  then raise exception 'Sem permissão'; end if;
  select status_code, content into r from net._http_response where id = p_req;
  if not found then return jsonb_build_object('pronto', false); end if;
  return jsonb_build_object('pronto', true, 'status', r.status_code,
    'corpo', case when r.content is null then null else r.content::jsonb end);
exception when others then
  return jsonb_build_object('pronto', true, 'status', 0, 'corpo', null);
end $function$;

revoke all on function public.montagem_exact_pagar_resultado(bigint) from public, anon;
grant execute on function public.montagem_exact_pagar_resultado(bigint) to authenticated;
