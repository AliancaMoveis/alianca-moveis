-- Montagem · pagamento: marcar uma O.S. como "não pagar", com motivo.
-- A linha continua aparecendo (com o motivo à vista), mas sai do total e do fechamento.
-- Também libera desfazer a aprovação das O.S. que vieram aprovadas do Exact.

alter table public.montagem_efet
  add column if not exists nao_pagar_em     timestamptz,
  add column if not exists nao_pagar_por    text,
  add column if not exists nao_pagar_motivo text,
  add column if not exists nao_pagar_obs    text;

create index if not exists montagem_efet_nao_pagar_idx
  on public.montagem_efet (nao_pagar_em) where nao_pagar_em is not null;

-- motivos aceitos (o "outro" exige a observação escrita)
create or replace function public._mont_motivo_ok(p text)
returns boolean language sql immutable as $$
  select p in ('erro_montador','desaprovado','adiantado','duplicado','outro')
$$;

create or replace function public.montagem_nao_pagar(
  p_chaves text[], p_motivo text default null, p_obs text default null, p_desfazer boolean default false)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare n int;
begin
  if not (public._so_gestao_setor() or exists (
      select 1 from public.usuario_acessos ua where ua.usuario_id = auth.uid() and ua.acesso = 'montagem'))
  then raise exception 'Só a Gestão e o Financeiro mexem no pagamento'; end if;

  if p_chaves is null or cardinality(p_chaves) = 0 then raise exception 'Selecione pelo menos uma O.S.'; end if;

  if p_desfazer then
    update public.montagem_efet
       set nao_pagar_em = null, nao_pagar_por = null, nao_pagar_motivo = null, nao_pagar_obs = null,
           atualizado_em = now()
     where chave = any(p_chaves) and nao_pagar_em is not null and excluido_em is null;
  else
    if not public._mont_motivo_ok(p_motivo) then raise exception 'Escolha o motivo de não pagar'; end if;
    if p_motivo = 'outro' and coalesce(btrim(p_obs), '') = '' then
      raise exception 'Em "outro motivo" é preciso escrever o que aconteceu';
    end if;
    update public.montagem_efet
       set nao_pagar_em = now(), nao_pagar_por = public._nome(auth.uid()),
           nao_pagar_motivo = p_motivo, nao_pagar_obs = nullif(btrim(p_obs), ''),
           atualizado_em = now()
     where chave = any(p_chaves) and nao_pagar_em is null and excluido_em is null;
  end if;

  get diagnostics n = row_count; return n;
end $function$;

revoke all on function public.montagem_nao_pagar(text[], text, text, boolean) from public, anon;
grant execute on function public.montagem_nao_pagar(text[], text, text, boolean) to authenticated;

-- desfazer a aprovação também das que vieram aprovadas do Exact:
-- o 360 não muda o Exact, então o que ele faz é marcar a O.S. como não paga com motivo "desaprovado".
create or replace function public.montagem_desaprovar(p_chaves text[], p_obs text default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare n int;
begin
  if not (public._so_gestao_setor() or exists (
      select 1 from public.usuario_acessos ua where ua.usuario_id = auth.uid() and ua.acesso = 'montagem'))
  then raise exception 'Só a Gestão e o Financeiro mexem no pagamento'; end if;
  if p_chaves is null or cardinality(p_chaves) = 0 then raise exception 'Selecione pelo menos uma O.S.'; end if;

  -- aprovada no 360: tira a aprovação e pronto, ela volta para ⏳ Aguardando
  update public.montagem_efet set aprovado_em = null, aprovado_por = null, atualizado_em = now()
   where chave = any(p_chaves) and aprovado_em is not null and excluido_em is null;

  -- aprovada no Exact: o 360 não altera o Exact, então marca como não pagar
  update public.montagem_efet
     set nao_pagar_em = now(), nao_pagar_por = public._nome(auth.uid()),
         nao_pagar_motivo = 'desaprovado', nao_pagar_obs = nullif(btrim(p_obs), ''), atualizado_em = now()
   where chave = any(p_chaves) and aprovado_em is null and nao_pagar_em is null and excluido_em is null
     and status ilike 'PAGAMENTO EFETUADO';

  get diagnostics n = row_count; return n;
end $function$;

revoke all on function public.montagem_desaprovar(text[], text) from public, anon;
grant execute on function public.montagem_desaprovar(text[], text) to authenticated;
