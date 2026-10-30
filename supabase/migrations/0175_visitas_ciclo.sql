-- Nº oficial de visitas por ciclo de pagamento (29 → 28), lançado pela Gestão (aplicado direto no banco em 30/10/2026).
-- Vale para o pagamento de R$ por visita (config.pagamento_visita = R$ 40): consultor → visitas; medidor → medidas.
create table if not exists public.visitas_ciclo (
  id bigint generated always as identity primary key,
  ciclo text not null,                 -- 'aaaa-mm' = mês em que o ciclo FECHA (ex.: '2026-10' = 29/09 a 28/10)
  usuario_id uuid references public.usuarios(id) on delete cascade,  -- pode ser nulo (pessoa sem usuário no 360)
  pessoa text not null,
  papel text default 'consultor' not null,  -- consultor | medidor
  visitas int not null default 0,
  obs text default '' not null,
  atualizado_em timestamptz default now() not null,
  atualizado_por uuid,
  unique (ciclo, pessoa)
);
alter table public.visitas_ciclo enable row level security;
create policy visitas_ciclo_ler on public.visitas_ciclo for select using (_so_gestao_setor() or usuario_id = auth.uid());
create policy visitas_ciclo_gestao on public.visitas_ciclo for all using (_so_gestao_setor()) with check (_so_gestao_setor());
-- ciclo de outubro/2026 lançado pelo Bruno: Alan 99, Angela 97, Fabiana 69, Gabriela 116, Kauam 88, Luiz 78,
-- Rosangela 67, Thiago 125; medidores Gilberto 160 e César 104 (César sem usuário de medidor no 360).
