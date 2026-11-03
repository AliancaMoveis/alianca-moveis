-- vendas_temp: vendas lançadas só para a Gestão conferir (somam no efetivado da Gestão, sem comissão, sem aviso, invisíveis para vendedores/consultores)
create table if not exists vendas_temp (id serial primary key, chamado_id text not null references chamados(id) on delete cascade, numero text not null unique, valor numeric not null check (valor > 0), data date not null, cliente_tatico text not null default '', obs text not null default '', conferido boolean not null default false, criado_em timestamptz not null default now(), criado_por uuid);
alter table vendas_temp enable row level security;
drop policy if exists vendas_temp_gestao on vendas_temp;
create policy vendas_temp_gestao on vendas_temp for all to authenticated using (public.eh_gestao()) with check (public.eh_gestao());
