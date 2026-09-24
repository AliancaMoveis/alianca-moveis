-- Operadoras do marketing não escolhem consultor (nem no cadastro): só Gestão e Supervisão Marketing (verMarketing).
do $$
declare f text;
begin
  f := pg_get_functiondef('public.criar_chamado(jsonb)'::regprocedure);
  f := replace(f, 'v_consultor := case when t.presale and not t.direto then',
    'v_consultor := case when t.presale and not t.direto and (public.eh_gestao() or public.tem_lib(''verMarketing'')) then');
  execute f;
  f := pg_get_functiondef('public.direcionar_consultor(text,uuid,timestamp,text)'::regprocedure);
  f := replace(f, 'if not public.pode_editar_agenda() then', 'if not (public.eh_gestao() or public.tem_lib(''verMarketing'')) then');
  execute f;
end $$;
