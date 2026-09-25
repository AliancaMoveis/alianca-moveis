-- Telefone do cliente obrigatório (com DDD: pelo menos 10 dígitos) em todo registro de cliente/chamado feito por usuário.
-- Também impede apagar o telefone depois. Cargas internas (sem usuário logado) não são afetadas.
create or replace function public._trg_exige_telefone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if (tg_op = 'INSERT' or new.telefone is distinct from old.telefone)
     and length(regexp_replace(coalesce(new.telefone, ''), '\D', '', 'g')) < 10 then
    raise exception 'Informe o telefone do cliente com DDD';
  end if;
  return new;
end $$;
drop trigger if exists chamados_exige_telefone on public.chamados;
create trigger chamados_exige_telefone before insert or update of telefone on public.chamados
  for each row execute function public._trg_exige_telefone();
revoke execute on function public._trg_exige_telefone() from public, anon, authenticated;
