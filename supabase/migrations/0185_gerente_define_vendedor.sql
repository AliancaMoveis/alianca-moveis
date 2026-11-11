-- 0185 Gerente de Loja também define o vendedor do cliente (pelo assistente e pelo sistema).
-- Mantém tudo que a função designar_projetista já faz hoje: só troca quem pode chamar (Suporte/Supervisão/Gestão + Gerente de Loja).
do $do$ declare d text; n int; begin
  d := pg_get_functiondef('public.designar_projetista(text, uuid)'::regprocedure);
  if d like '%_pode_chamar_vendedor%' then return; end if;
  n := (length(d) - length(replace(d, 'if not public.pode_editar_agenda() then', ''))) / length('if not public.pode_editar_agenda() then');
  if n <> 1 then raise exception 'designar_projetista mudou: avise o suporte (âncora não encontrada)'; end if;
  d := replace(d, 'if not public.pode_editar_agenda() then', 'if not (public.pode_editar_agenda() or public._pode_chamar_vendedor()) then');
  d := replace(d, 'O Suporte a Consultores, a Supervisão de Marketing ou a Gestão definem o vendedor.', 'O Suporte a Consultores, a Supervisão de Marketing, o Gerente de Loja ou a Gestão definem o vendedor.');
  execute d;
end $do$;
