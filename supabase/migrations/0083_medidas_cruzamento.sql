-- Setor de Medidas: cruzamento Minha Visita (customers) × Exact (tickets "aguardando medição") pelo telefone.
-- Resultado por nº de venda: cliente visitado pelo consultor → "medidas oficiais ok"; sem visita → "sem medidas".
-- O checklist lê esse resultado pelo nº da venda. Quem grava: Gestão e Supervisão de Medidas (Lucilene).
create or replace function public.pode_medidas() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_gestao() or 'medidas_supervisao' = any(public.meus_setores());
$$;

create table if not exists public.medidas_cruzamento (
  venda text primary key,
  comprador text not null default '',
  telefone text not null default '',
  visitado text not null default '',
  consultor text not null default '',
  status_mv text not null default '',
  visita_em text not null default '',
  medidor text not null default '',
  situacao_exact text not null default '',
  resultado text not null check (resultado in ('ok', 'sem')),
  tratativa text not null default '',
  obs text not null default '',
  cruzado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text not null default ''
);
alter table public.medidas_cruzamento enable row level security;
create policy medidas_cruz_ler on public.medidas_cruzamento for select to authenticated
  using (public.pode_medidas() or public.pode_checklist());

-- grava o resultado de um cruzamento (upsert por venda). A tratativa e a observação já registradas são mantidas.
create or replace function public.medidas_cruzamento_salvar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v text; n_novo int := 0; n_atu int := 0; quem text := public._nome(auth.uid());
begin
  if not public.pode_medidas() then raise exception 'Só a Gestão e a Supervisão de Medidas gravam o cruzamento'; end if;
  if jsonb_typeof(p) <> 'array' then raise exception 'Lista inválida'; end if;
  for r in select * from jsonb_array_elements(p) loop
    v := regexp_replace(coalesce(r->>'venda', ''), '\D', '', 'g');
    if v = '' then continue; end if;
    if exists (select 1 from public.medidas_cruzamento m where m.venda = v) then n_atu := n_atu + 1; else n_novo := n_novo + 1; end if;
    insert into public.medidas_cruzamento as m (venda, comprador, telefone, visitado, consultor, status_mv, visita_em, medidor, situacao_exact, resultado, atualizado_por)
    values (v, coalesce(r->>'comprador', ''), coalesce(r->>'telefone', ''), coalesce(r->>'visitado', ''), coalesce(r->>'consultor', ''),
            coalesce(r->>'statusMv', ''), coalesce(r->>'visitaEm', ''), coalesce(r->>'medidor', ''), coalesce(r->>'situacao', ''),
            case when r->>'resultado' = 'ok' then 'ok' else 'sem' end, quem)
    on conflict (venda) do update set comprador = excluded.comprador, telefone = excluded.telefone, visitado = excluded.visitado,
      consultor = excluded.consultor, status_mv = excluded.status_mv, visita_em = excluded.visita_em, medidor = excluded.medidor,
      situacao_exact = excluded.situacao_exact,
      -- não rebaixa: quem já tinha medidas ok continua ok mesmo que o cliente não esteja nesse lote do Minha Visita
      resultado = case when m.resultado = 'ok' then 'ok' else excluded.resultado end,
      cruzado_em = now(), atualizado_em = now(), atualizado_por = quem;
  end loop;
  return jsonb_build_object('novos', n_novo, 'atualizados', n_atu);
end $$;
revoke all on function public.medidas_cruzamento_salvar(jsonb) from public, anon;
grant execute on function public.medidas_cruzamento_salvar(jsonb) to authenticated;

-- tratativa da linha (escolha + observação); pode também corrigir o resultado manualmente
create or replace function public.medidas_cruzamento_tratar(p_venda text, p_tratativa text, p_obs text, p_resultado text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode_medidas() then raise exception 'Só a Gestão e a Supervisão de Medidas registram a tratativa'; end if;
  update public.medidas_cruzamento set tratativa = coalesce(p_tratativa, ''), obs = left(coalesce(p_obs, ''), 1000),
    resultado = case when p_resultado in ('ok', 'sem') then p_resultado else resultado end,
    atualizado_em = now(), atualizado_por = public._nome(auth.uid())
   where venda = regexp_replace(coalesce(p_venda, ''), '\D', '', 'g');
  if not found then raise exception 'Venda não encontrada no cruzamento — grave o cruzamento primeiro'; end if;
end $$;
revoke all on function public.medidas_cruzamento_tratar(text, text, text, text) from public, anon;
grant execute on function public.medidas_cruzamento_tratar(text, text, text, text) to authenticated;
