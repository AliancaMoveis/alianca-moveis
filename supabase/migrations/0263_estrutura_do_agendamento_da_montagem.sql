-- ESTRUTURA DO AGENDAMENTO DA MONTAGEM
--
-- Monta o mesmo caminho que o checklist já usa (oferecer data → cliente responde → agendado),
-- mas NADA é disparado: a Kommo não é chamada e o Exact não é alterado. As tabelas nascem
-- prontas e vazias, para a fase de teste rodar só dentro do 360.
--
-- Decisão de desenho: não existe tabela separada para "agenda do montador". A agenda DELE é
-- esta mesma tabela filtrada por montador — agendar já é aparecer na agenda, sem replicar dado
-- em dois lugares, que é como um fica certo e o outro errado.

-- quem cuida de montagem no 360 (mesma porta que as telas de montagem já usam)
create or replace function public.pode_montagem()
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.usuario_acessos a
    where a.usuario_id = auth.uid() and a.acesso = 'montagem'
  ) or public.eh_gestao();
$$;

-- ---------------------------------------------------------------- agendamento
create table if not exists public.mt_agendamento (
  os_id          bigint primary key references public.mt_os(id) on delete cascade,

  -- onde a O.S. está no caminho, igual às etapas do checklist
  --   a_agendar · aguardando (data oferecida, cliente não respondeu) · agendado
  --   outra_data · local_nao_pronto · realizado · cancelado
  etapa          text not null default 'a_agendar',

  -- o montador e o horário. proposta = o que foi oferecido; agendado_para = o que o cliente aceitou
  montador_id    uuid references public.montadores(id),
  montador_nome  text,
  proposta       timestamp,
  agendado_para  timestamp,
  horas          numeric not null default 0,   -- quanto trava na agenda; vem das horas previstas da O.S.

  -- o que o cliente respondeu (preenchido pela Kommo quando ligarmos; na mão enquanto não)
  resposta_tipo  text,                          -- confirmou · outra_data · em_obra · outro
  resposta_texto text,
  resposta_em    timestamptz,

  canal          text,                          -- whatsapp · telefone — por onde o cliente foi avisado
  contatos       int not null default 0,        -- quantas vezes já oferecemos data
  obs            text,
  historico      jsonb not null default '[]'::jsonb,

  agendado_por   text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index if not exists mt_agendamento_etapa on public.mt_agendamento (etapa);
create index if not exists mt_agendamento_dia on public.mt_agendamento (coalesce(agendado_para, proposta));
-- a agenda do montador é uma consulta por aqui: montador + dia
create index if not exists mt_agendamento_montador on public.mt_agendamento (montador_id, coalesce(agendado_para, proposta));

alter table public.mt_agendamento enable row level security;
drop policy if exists mt_agendamento_montagem on public.mt_agendamento;
create policy mt_agendamento_montagem on public.mt_agendamento
  for all to authenticated using (public.pode_montagem()) with check (public.pode_montagem());

-- ---------------------------------------------------------------- capacidade
-- quantas horas por dia cada montador aguenta e em que dias trabalha.
-- Sem isso a agenda aceita 20 horas num dia só.
create table if not exists public.mt_capacidade (
  montador_id   uuid primary key references public.montadores(id) on delete cascade,
  horas_dia     numeric not null default 8,
  dias          int[] not null default '{1,2,3,4,5}',   -- 0=domingo … 6=sábado
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
alter table public.mt_capacidade enable row level security;
drop policy if exists mt_capacidade_montagem on public.mt_capacidade;
create policy mt_capacidade_montagem on public.mt_capacidade
  for all to authenticated using (public.pode_montagem()) with check (public.pode_montagem());

-- ---------------------------------------------------------------- bloqueios
-- férias, atestado, feriado. Mesmo papel dos bloqueios do checklist.
create table if not exists public.mt_bloqueio (
  id          bigserial primary key,
  montador_id uuid references public.montadores(id) on delete cascade,  -- nulo = vale para todos
  inicio      timestamp not null,
  fim         timestamp not null,
  motivo      text not null,
  obs         text,
  criado_por  text,
  criado_em   timestamptz not null default now()
);
create index if not exists mt_bloqueio_periodo on public.mt_bloqueio (inicio, fim);
alter table public.mt_bloqueio enable row level security;
drop policy if exists mt_bloqueio_montagem on public.mt_bloqueio;
create policy mt_bloqueio_montagem on public.mt_bloqueio
  for all to authenticated using (public.pode_montagem()) with check (public.pode_montagem());

-- ---------------------------------------------------------------- Kommo (desligada)
-- Mesmas duas tabelas do checklist: o vínculo da O.S. com a conversa, e o registro de cada
-- disparo. Ficam criadas e VAZIAS. Nenhuma função, rotina ou gatilho escreve nelas nesta
-- migração — ligar é um passo separado, depois que a gestão liberar.
create table if not exists public.mt_kommo_vinculo (
  os_id      bigint primary key references public.mt_os(id) on delete cascade,
  lead_id    bigint,
  contato_id bigint,
  criado_em  timestamptz not null default now()
);
alter table public.mt_kommo_vinculo enable row level security;
drop policy if exists mt_kommo_vinculo_montagem on public.mt_kommo_vinculo;
create policy mt_kommo_vinculo_montagem on public.mt_kommo_vinculo
  for all to authenticated using (public.pode_montagem()) with check (public.pode_montagem());

create table if not exists public.mt_kommo_evento (
  id              bigserial primary key,
  os_id           bigint references public.mt_os(id) on delete cascade,
  tipo            text not null,          -- enviado · falhou · respondeu
  modelo          text,                   -- agendamento · lembrete · pos_montagem
  canal           text,
  por             text,
  data_oferecida  timestamp,
  erro            text,
  em              timestamptz not null default now()
);
create index if not exists mt_kommo_evento_os on public.mt_kommo_evento (os_id, em desc);
alter table public.mt_kommo_evento enable row level security;
drop policy if exists mt_kommo_evento_montagem on public.mt_kommo_evento;
create policy mt_kommo_evento_montagem on public.mt_kommo_evento
  for all to authenticated using (public.pode_montagem()) with check (public.pode_montagem());

comment on table public.mt_kommo_vinculo is
  'Desligada na fase de teste: nada escreve aqui até a gestão liberar o envio pela Kommo.';
comment on table public.mt_kommo_evento is
  'Desligada na fase de teste: nada escreve aqui até a gestão liberar o envio pela Kommo.';
