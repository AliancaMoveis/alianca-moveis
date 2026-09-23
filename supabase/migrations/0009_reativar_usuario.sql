create or replace function public.reativar_usuario(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._exigir_admin();
  update public.usuarios set ativo = true where id = p_id;
end $$;
revoke execute on function public.reativar_usuario(uuid) from public, anon;
grant execute on function public.reativar_usuario(uuid) to authenticated;
