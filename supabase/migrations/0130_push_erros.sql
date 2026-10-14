-- 0130 · registra os erros ao ativar notificações no celular (para diagnosticar aparelhos com problema)
create table if not exists public.push_erros (
  id bigint generated always as identity primary key,
  usuario_id uuid default auth.uid(),
  quando timestamptz not null default now(),
  etapa text, erro text, agente text
);
alter table public.push_erros enable row level security;
create policy push_erros_gestao on public.push_erros for select to authenticated using (public.eh_gestao());

create or replace function public.registrar_erro_push(p_etapa text, p_erro text, p_agente text)
returns void language sql security definer set search_path = '' as $$
  insert into public.push_erros (usuario_id, etapa, erro, agente) select auth.uid(), left(p_etapa, 60), left(p_erro, 500), left(p_agente, 300) where auth.uid() is not null;
$$;
revoke all on function public.registrar_erro_push(text, text, text) from public, anon;
grant execute on function public.registrar_erro_push(text, text, text) to authenticated;
