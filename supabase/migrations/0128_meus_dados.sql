-- 0128 · cada usuário preenche o próprio nome completo e telefone (só os seus — o banco não deixa mexer em outros campos nem em outros usuários)
alter table public.usuarios add column if not exists nome_completo text, add column if not exists telefone text, add column if not exists dados_em timestamptz;

create or replace function public.salvar_meus_dados(p_nome_completo text, p_telefone text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_nome text := btrim(regexp_replace(coalesce(p_nome_completo, ''), '\s+', ' ', 'g'));
        v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'Faça login'; end if;
  if v_nome !~ '\S+\s+\S+' or length(v_nome) < 5 then raise exception 'Informe o nome completo (nome e sobrenome)'; end if;
  if v_tel ~ '^55\d{10,11}$' then v_tel := substr(v_tel, 3); end if;
  if v_tel !~ '^\d{10,11}$' then raise exception 'Telefone inválido — informe DDD + número'; end if;
  update public.usuarios set nome_completo = v_nome, telefone = v_tel, dados_em = now() where id = auth.uid();
  if not found then raise exception 'Usuário não encontrado'; end if;
end $$;
revoke all on function public.salvar_meus_dados(text, text) from public, anon;
grant execute on function public.salvar_meus_dados(text, text) to authenticated;
