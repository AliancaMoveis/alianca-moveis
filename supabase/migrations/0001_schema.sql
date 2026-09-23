-- ALIANÇA 360 — schema base
-- Normalização do objeto `state` do protótipo em tabelas relacionais.

create extension if not exists pgcrypto;

-- ---------- enums ----------
create type public.status_chamado as enum ('aberta','tratativa','respondida','concluida');
create type public.status_cliente as enum (
  'aguardando_consultor','direcionado_consultor','visita_realizada','agendado_loja','com_vendedor',
  'vendido_revisao','vendido_promissoria','vendido','venda_cancelada','nao_compareceu'
);
create type public.status_venda as enum ('registrada','promissoria','efetivada','cancelada');
create type public.status_transferencia as enum ('pendente','aceita','recusada','cancelada');
create type public.tipo_anexo as enum ('img','link');

-- ---------- setores (com liberações) ----------
create table public.setores (
  id text primary key,
  nome text not null,
  lib_criar boolean not null default false,
  lib_ver_tudo boolean not null default false,
  lib_cadastros boolean not null default false,
  lib_admin boolean not null default false,
  lib_ver_marketing boolean not null default false,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);

-- ---------- motivos (tipos) + roteamento ----------
create table public.tipos (
  id text primary key,
  nome text not null,
  setor_destino text not null references public.setores(id) on delete restrict,
  anexos boolean not null default false,
  presale boolean not null default false,   -- domínio marketing/consultoria
  direto boolean not null default false,    -- agendamento direto na loja
  ordem integer not null default 0
);

-- ---------- usuários ----------
create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text,
  somente_atribuidos boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.usuario_setores (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  setor_id text not null references public.setores(id) on delete restrict,
  ordem integer not null default 0,
  primary key (usuario_id, setor_id)
);
create index usuario_setores_setor_idx on public.usuario_setores(setor_id);

-- ---------- fábricas e representantes ----------
create table public.representantes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  whats text not null default '',
  email text not null default '',
  criado_em timestamptz not null default now()
);

create table public.fabricas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  emails text not null default '',
  representante_id uuid references public.representantes(id) on delete restrict,
  criado_em timestamptz not null default now()
);
create index fabricas_rep_idx on public.fabricas(representante_id);

-- ---------- configuração (linha única) ----------
create table public.config (
  id integer primary key default 1 check (id = 1),
  comissao_pct numeric(6,3) not null default 1.5 check (comissao_pct >= 0),
  pagamento_visita numeric(12,2) not null default 40 check (pagamento_visita >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios(id)
);

-- ---------- chamados (call center + marketing) ----------
create sequence public.chamado_seq;

create or replace function public.proximo_id_chamado() returns text
language sql volatile set search_path = '' as $$
  select 'ALM-' || lpad(n::text, greatest(4, length(n::text)), '0')
  from (select nextval('public.chamado_seq') as n) s;
$$;

create table public.chamados (
  id text primary key default public.proximo_id_chamado(),
  tipo text not null references public.tipos(id),
  setor_destino text not null references public.setores(id),
  status public.status_chamado not null default 'aberta',
  criado_em timestamptz not null default now(),
  sla_resposta timestamptz not null,
  solicitante_id uuid references public.usuarios(id),
  solicitante_nome text not null,
  solicitante_setor text not null default '',
  cliente text not null check (btrim(cliente) <> ''),
  cliente_doc text not null default '',
  telefone text not null default '',
  email text not null default '',
  pedido text not null default '',
  data_venda date,
  pedido_fabrica text not null default '',
  produto text not null default '',
  fabrica_id uuid references public.fabricas(id),
  prazo_tatico date,
  motivo text not null default '',
  urgente boolean not null default false,
  escalonado_auto boolean not null default false,
  escalado_em timestamptz,
  escalado_critico boolean not null default false,
  vinculado_a text references public.chamados(id),
  consultor_id uuid references public.usuarios(id),
  atendente_id uuid references public.usuarios(id),
  data_visita timestamp,           -- horário de parede (sem fuso), como no protótipo
  endereco text not null default '',
  data_loja timestamp,             -- horário de parede (sem fuso)
  status_cliente public.status_cliente,
  tratativa jsonb not null default '{}'::jsonb,
  resposta_previsao date,
  resposta_quem text,
  resposta_texto text,
  resposta_quando timestamptz,
  atualizado_em timestamptz not null default now()
);
create index chamados_setor_idx on public.chamados(setor_destino);
create index chamados_solic_idx on public.chamados(solicitante_id);
create index chamados_consultor_idx on public.chamados(consultor_id);
create index chamados_atendente_idx on public.chamados(atendente_id);
create index chamados_criado_idx on public.chamados(criado_em desc);
create index chamados_tipo_idx on public.chamados(tipo);
create index chamados_fabrica_idx on public.chamados(fabrica_id);
create index chamados_vinculado_idx on public.chamados(vinculado_a);

-- ---------- vendas (1 por chamado) ----------
create table public.vendas (
  chamado_id text primary key references public.chamados(id) on delete cascade,
  numero text not null check (btrim(numero) <> ''),
  data_venda date,
  vendedor text not null check (btrim(vendedor) <> ''),
  atendente_nome text not null default '',
  status public.status_venda not null default 'registrada',
  registrado_por uuid references public.usuarios(id),
  registrado_em timestamptz not null default now(),
  decidido_por uuid references public.usuarios(id),
  decidido_em timestamptz
);

-- valor em tabela separada: só quem pode ver o valor (Gestão, Supervisão Mkt, consultor/projetista do cliente)
create table public.vendas_valores (
  chamado_id text primary key references public.vendas(chamado_id) on delete cascade,
  valor numeric(12,2) not null check (valor > 0)
);

-- ---------- transferências de vendedor ----------
create table public.transferencias (
  id uuid primary key default gen_random_uuid(),
  chamado_id text not null references public.chamados(id) on delete cascade,
  de_usuario uuid references public.usuarios(id),
  para_usuario uuid not null references public.usuarios(id),
  solicitado_por uuid not null references public.usuarios(id),
  status public.status_transferencia not null default 'pendente',
  quando timestamptz not null default now(),
  decidido_por uuid references public.usuarios(id),
  decidido_em timestamptz
);
create unique index transferencias_uma_pendente on public.transferencias(chamado_id) where status = 'pendente';
create index transferencias_para_idx on public.transferencias(para_usuario) where status = 'pendente';

-- ---------- histórico (auditoria, só inclusão) ----------
create table public.historico (
  id bigint generated always as identity primary key,
  chamado_id text not null references public.chamados(id) on delete cascade,
  quando timestamptz not null default now(),
  quem_id uuid references public.usuarios(id),
  quem_nome text not null,
  texto text not null
);
create index historico_chamado_idx on public.historico(chamado_id, quando);
create index historico_quando_idx on public.historico(quando desc);
create index historico_quem_idx on public.historico(quem_id);

create or replace function public.historico_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'O histórico não pode ser alterado nem apagado';
end $$;
create trigger historico_sem_update before update on public.historico
  for each row execute function public.historico_imutavel();

-- ---------- anexos ----------
create table public.anexos (
  id uuid primary key default gen_random_uuid(),
  chamado_id text not null references public.chamados(id) on delete cascade,
  tipo public.tipo_anexo not null,
  nome text not null default '',
  url text,            -- links (vídeo etc.)
  storage_path text,   -- fotos no Storage (bucket "anexos")
  criado_por uuid references public.usuarios(id),
  criado_em timestamptz not null default now(),
  check ((tipo = 'link' and url is not null) or (tipo = 'img' and storage_path is not null))
);
create index anexos_chamado_idx on public.anexos(chamado_id, criado_em);

-- ---------- atualizado_em ----------
create or replace function public.tocar_atualizado() returns trigger
language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger chamados_tocar before update on public.chamados
  for each row execute function public.tocar_atualizado();
