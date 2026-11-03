-- Acessos extras por pessoa (Fretes / Montagem) + Patrícia Santos (controle). Cole no Supabase → SQL Editor → Run.

-- 1) tabela de acessos extras (marcados no cadastro do usuário)
create table if not exists public.usuario_acessos (usuario_id uuid not null references public.usuarios(id) on delete cascade, acesso text not null, criado_em timestamptz not null default now(), primary key (usuario_id, acesso));
alter table public.usuario_acessos enable row level security;
drop policy if exists usuario_acessos_ler on public.usuario_acessos;
create policy usuario_acessos_ler on public.usuario_acessos for select to authenticated using (usuario_id = auth.uid() or public._so_gestao_setor());
drop policy if exists usuario_acessos_gestao on public.usuario_acessos;
create policy usuario_acessos_gestao on public.usuario_acessos for all to authenticated using (public._so_gestao_setor()) with check (public._so_gestao_setor());

-- 2) Fretes (fechamento do Tático): quem tem o acesso "fretes" lê e grava
do $$ declare t text; begin
  foreach t in array array['frete_tat_rom','frete_freteiros','frete_descontos','frete_fechamento'] loop
    execute format('drop policy if exists %I on public.%I', t || '_acesso', t);
    execute format('create policy %I on public.%I for all to authenticated using (exists (select 1 from public.usuario_acessos a where a.usuario_id = auth.uid() and a.acesso = ''fretes'')) with check (exists (select 1 from public.usuario_acessos a where a.usuario_id = auth.uid() and a.acesso = ''fretes''))', t || '_acesso', t);
  end loop;
end $$;

-- 3) Montagem: quem tem o acesso "montagem" lê tudo…
do $$ declare t text; begin
  foreach t in array array['montagem_agend','montagem_ag_fech','montagem_cfg','montagem_efet','montagem_fech_itens','montagem_fechamentos','montagem_vinculo'] loop
    execute format('drop policy if exists %I on public.%I', t || '_acesso', t);
    execute format('create policy %I on public.%I for select to authenticated using (exists (select 1 from public.usuario_acessos a where a.usuario_id = auth.uid() and a.acesso = ''montagem''))', t || '_acesso', t);
  end loop;
end $$;
-- …e pode importar, aprovar, fechar e mexer nas notas (as funções passam a aceitar o acesso além da Gestão)
create or replace function public._pode_pag_montagem() returns boolean language sql stable security definer set search_path = public as $f$
  select public._so_gestao_setor() or public._eh_financeiro() or exists (select 1 from public.usuario_acessos where usuario_id = auth.uid() and acesso = 'montagem')
$f$;
do $$ declare f record; def text; begin
  for f in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in
    ('montagem_ag_fechar','montagem_aprovar','montagem_avulsa_excluir','montagem_avulsa_salvar','montagem_cfg_salvar','montagem_efet_importar','montagem_fechar','montagem_importar','montagem_vincular') loop
    def := pg_get_functiondef(f.oid);
    def := replace(def, 'if not public._so_gestao_setor() then', 'if not (public._so_gestao_setor() or exists (select 1 from public.usuario_acessos ua where ua.usuario_id = auth.uid() and ua.acesso = ''montagem'')) then');
    execute def;
  end loop;
end $$;

-- 4) Patrícia Santos (patricia.controle): Fretes + Montagem; sai das filas de Montagem e Assistência (setor próprio "Controle")
insert into public.setores (id, nome, ordem) values ('controle', 'Controle (financeiro de frete e montagem)', 99) on conflict (id) do nothing;
delete from public.usuario_setores where usuario_id = '8deec897-0155-4c8b-b083-35235e1d2da9' and setor_id in ('assistencia', 'montagem');
insert into public.usuario_setores (usuario_id, setor_id, ordem) values ('8deec897-0155-4c8b-b083-35235e1d2da9', 'controle', 1) on conflict do nothing;
insert into public.usuario_acessos (usuario_id, acesso) values ('8deec897-0155-4c8b-b083-35235e1d2da9', 'fretes'), ('8deec897-0155-4c8b-b083-35235e1d2da9', 'montagem') on conflict do nothing;

select u.nome, array_agg(distinct s.setor_id) setores, array_agg(distinct a.acesso) acessos
from public.usuarios u left join public.usuario_setores s on s.usuario_id = u.id left join public.usuario_acessos a on a.usuario_id = u.id
where u.id = '8deec897-0155-4c8b-b083-35235e1d2da9' group by u.nome;
