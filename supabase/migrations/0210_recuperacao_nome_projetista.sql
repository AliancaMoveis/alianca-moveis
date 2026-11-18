-- Recuperação do checklist: a projetista não via a própria comissão.
--
-- ck_recuperacao_lista comparava a linha com o nome do USUÁRIO (usuarios.nome) e a linha
-- guarda o nome do PROJETISTA, que é como ele aparece na agenda do checklist. Para o Wagner
-- os dois são "Wagner" e funcionava; para a Gislaine o usuário é "Gislaine Carvalho" e o
-- projetista é "Gislaine" — nada batia, e o financeiro dela aparecia vazio mesmo com a
-- recuperação gravada e pendente. _ck_meu_projetista() já faz essa tradução (é a mesma
-- usada na agenda dela); para quem não é projetista continua valendo o nome do usuário.
do $do$
declare d text; a text; b text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ck_recuperacao_lista';
  if d is null then raise exception 'ck_recuperacao_lista não existe'; end if;
  a := '  select nome into eu from public.usuarios where id = auth.uid();';
  b := '  -- o nome do PROJETISTA (Gislaine), que nem sempre é o nome do usuário (Gislaine Carvalho):' || chr(10) ||
       '  -- comparar com o nome do usuário deixava a projetista sem ver a própria comissão.' || chr(10) ||
       '  select coalesce(public._ck_meu_projetista(), u.nome) into eu from public.usuarios u where u.id = auth.uid();';
  if position(a in d) = 0 then
    if position('_ck_meu_projetista' in d) > 0 then return; end if;   -- já corrigida
    raise exception 'trecho do nome não encontrado';
  end if;
  execute replace(d, a, b);
end $do$;
