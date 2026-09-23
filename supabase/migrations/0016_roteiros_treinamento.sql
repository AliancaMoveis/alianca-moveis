-- Treinamento do call center: situações simuladas com respostas sugeridas.
-- Acesso: call center e Supervisão (call center); a Gestão também, por administrar o sistema.
-- Supervisão e Gestão publicam e editam; o call center sugere novos roteiros, que a Supervisão aprova.

create table if not exists public.roteiros (
  id uuid primary key default gen_random_uuid(),
  categoria text not null default 'geral' check (categoria in ('entrega','atraso','montagem','defeito','cancelamento','reclamacao_externa','retorno','geral')),
  situacao text not null,
  cliente_diz text not null default '',
  resposta text not null default '',
  no_sistema text not null default '',
  evitar text not null default '',
  status text not null default 'aprovado' check (status in ('aprovado','sugestao')),
  autor_id uuid references public.usuarios(id),
  autor_nome text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.roteiros enable row level security;
revoke insert, update, delete, truncate on public.roteiros from anon, authenticated;
revoke all on public.roteiros from anon;

create or replace function public.pode_treinamento() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.usuario_ativo() and (public.eh_gestao() or public.meus_setores() && array['callcenter','supervisao']);
$$;
create or replace function public.gere_treinamento() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.usuario_ativo() and (public.eh_gestao() or 'supervisao' = any(public.meus_setores()));
$$;

create policy roteiros_ler on public.roteiros for select to authenticated
  using (public.pode_treinamento() and (status = 'aprovado' or autor_id = auth.uid() or public.gere_treinamento()));

create or replace function public.salvar_roteiro(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare eu public.usuarios := public._eu(); r public.roteiros; v uuid; gestor boolean := public.gere_treinamento();
begin
  if not public.pode_treinamento() then raise exception 'Sem acesso ao treinamento'; end if;
  if btrim(coalesce(p->>'situacao','')) = '' then raise exception 'Descreva a situação'; end if;
  if btrim(coalesce(p->>'resposta','')) = '' then raise exception 'Escreva a resposta sugerida'; end if;
  if p_id is null then
    insert into public.roteiros (categoria, situacao, cliente_diz, resposta, no_sistema, evitar, status, autor_id, autor_nome)
    values (coalesce(nullif(p->>'categoria',''),'geral'), btrim(p->>'situacao'), btrim(coalesce(p->>'clienteDiz','')), btrim(p->>'resposta'),
            btrim(coalesce(p->>'noSistema','')), btrim(coalesce(p->>'evitar','')), case when gestor then 'aprovado' else 'sugestao' end, eu.id, eu.nome)
    returning id into v;
  else
    select * into r from public.roteiros where id = p_id;
    if not found then raise exception 'Roteiro não encontrado'; end if;
    if not (gestor or (r.autor_id = eu.id and r.status = 'sugestao')) then raise exception 'Só a Supervisão edita roteiros publicados'; end if;
    update public.roteiros set categoria = coalesce(nullif(p->>'categoria',''),'geral'), situacao = btrim(p->>'situacao'),
      cliente_diz = btrim(coalesce(p->>'clienteDiz','')), resposta = btrim(p->>'resposta'), no_sistema = btrim(coalesce(p->>'noSistema','')),
      evitar = btrim(coalesce(p->>'evitar','')), atualizado_em = now()
    where id = p_id returning id into v;
  end if;
  return v;
end $$;

create or replace function public.aprovar_roteiro(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.gere_treinamento() then raise exception 'Só a Supervisão aprova roteiros'; end if;
  update public.roteiros set status = 'aprovado', atualizado_em = now() where id = p_id;
end $$;

create or replace function public.remover_roteiro(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.roteiros;
begin
  select * into r from public.roteiros where id = p_id;
  if not found then return; end if;
  if not (public.gere_treinamento() or (public.pode_treinamento() and r.autor_id = auth.uid() and r.status = 'sugestao')) then
    raise exception 'Só a Supervisão remove roteiros publicados';
  end if;
  delete from public.roteiros where id = p_id;
end $$;

revoke execute on all functions in schema public from anon, public;
grant execute on function public.pode_treinamento(), public.gere_treinamento(), public.salvar_roteiro(uuid, jsonb),
  public.aprovar_roteiro(uuid), public.remover_roteiro(uuid) to authenticated;
