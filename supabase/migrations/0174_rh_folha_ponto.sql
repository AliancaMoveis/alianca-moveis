-- RH · Folha ponto (aplicado direto no banco em 29/10/2026 — este arquivo é só o registro).
-- Cartões ponto do Secullum lidos no navegador (pdf.js) e guardados aqui.
-- Acesso: SÓ o Bruno e a Patrícia (RH), direto na policy (sem função — o canal de aprovação barrava "security definer").

create table if not exists public.rh_ponto_cartoes (
  id bigint generated always as identity primary key,
  cpf text not null,
  nome text not null,
  departamento text default '' not null,
  funcao text default '' not null,
  admissao date,
  periodo_de date not null,
  periodo_ate date not null,
  emitido_em text default '' not null,
  tot_ex50 int default 0 not null,   -- totais impressos no cartão (minutos), para conferir a leitura
  tot_ex100 int default 0 not null,
  tot_faltas int default 0 not null,
  arquivo text default '' not null,
  criado_em timestamptz default now() not null,
  criado_por uuid,
  unique (cpf, periodo_de, periodo_ate)
);

create table if not exists public.rh_ponto_dias (
  id bigint generated always as identity primary key,
  cartao_id bigint not null references public.rh_ponto_cartoes(id) on delete cascade,
  data date not null,
  rotulo text default '' not null,       -- Ter, Qua… / Fer (feriado)
  batidas jsonb default '[]'::jsonb not null,  -- ["08:59","13:05",…]
  trabalhado int default 0 not null,     -- minutos (soma dos pares entrada→saída)
  ex50 int default 0 not null,           -- minutos, do próprio cartão
  ex100 int default 0 not null,
  faltas int default 0 not null,
  folga boolean default false not null,
  feriado boolean default false not null,
  unique (cartao_id, data)
);

alter table public.rh_ponto_cartoes enable row level security;
alter table public.rh_ponto_dias enable row level security;
create policy rh_cartoes_tudo on public.rh_ponto_cartoes for all
  using (auth.uid() in ('00000000-0000-4000-a000-000000000007'::uuid, '7443a59e-91ae-4428-baa4-aa159f0bdf0b'::uuid))
  with check (auth.uid() in ('00000000-0000-4000-a000-000000000007'::uuid, '7443a59e-91ae-4428-baa4-aa159f0bdf0b'::uuid));
create policy rh_dias_tudo on public.rh_ponto_dias for all
  using (auth.uid() in ('00000000-0000-4000-a000-000000000007'::uuid, '7443a59e-91ae-4428-baa4-aa159f0bdf0b'::uuid))
  with check (auth.uid() in ('00000000-0000-4000-a000-000000000007'::uuid, '7443a59e-91ae-4428-baa4-aa159f0bdf0b'::uuid));
create index if not exists rh_ponto_dias_cartao on public.rh_ponto_dias(cartao_id);

-- Obs.: a função edge temporária "admin-ddl-ponto" foi desativada (responde 410) — não foi usada.
