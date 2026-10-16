-- 0149: Montagem · acompanhamento dos agendamentos do Exact (só quem é do setor Gestão)
-- Aplicado via execute_sql.
create table if not exists public.montagem_agend (
  chave text primary key, os text not null, lider text not null, montador text not null, status text,
  indisponivel boolean default false, data_inclusao date, data_montagem date, data_finalizacao date,
  tipos text, total numeric(12,2) default 0, importado_em timestamptz default now(), atualizado_em timestamptz default now());
alter table public.montagem_agend enable row level security;
create or replace function public._so_gestao_setor() returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.usuario_setores where usuario_id = auth.uid() and setor_id = 'gestao') $$;
create policy montagem_agend_ler on public.montagem_agend for select to authenticated using (public._so_gestao_setor());
-- montagem_importar(p jsonb): upsert por chave (O.S.¦montador¦data montagem¦agendadora); sem nome/endereço do cliente.
