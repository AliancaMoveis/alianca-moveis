-- Direcionar consultor: Gestão, Supervisão de Marketing e Suporte a Consultores (Carla)
do $$ declare f text; begin
  f := pg_get_functiondef('public.direcionar_consultor(text,uuid,timestamp,text)'::regprocedure);
  if position('suporte_consultores' in f) = 0 then
    if position('if not (public.eh_gestao() or public.tem_lib(''verMarketing'')) then raise exception ''Só a Supervisão de Marketing ou a Gestão direcionam o consultor''; end if;' in f) = 0 then raise exception 'âncora não encontrada'; end if;
    f := replace(f, 'if not (public.eh_gestao() or public.tem_lib(''verMarketing'')) then raise exception ''Só a Supervisão de Marketing ou a Gestão direcionam o consultor''; end if;',
      'if not (public.eh_gestao() or public.tem_lib(''verMarketing'') or ''suporte_consultores'' = any(public.meus_setores())) then raise exception ''Só a Gestão, a Supervisão de Marketing ou o Suporte a Consultores direcionam o consultor''; end if;');
    execute f;
  end if;
end $$;
