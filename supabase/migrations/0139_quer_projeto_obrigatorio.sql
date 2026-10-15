-- 0139 · Marketing direto na loja: "quer projeto pronto?" obrigatório no cadastro e gravado na tratativa
DO $$
declare d text; a text := '  perform public._reg(v_id, ''Solicitação aberta (';
begin
  d := pg_get_functiondef('public.criar_chamado'::regproc);
  if position(a in d) = 0 then raise exception 'âncora não encontrada'; end if;
  if position('querProjeto' in d) > 0 then raise exception 'já aplicado'; end if;
  d := replace(d, a, '  if t.presale and t.direto then
    if coalesce(p->>''querProjeto'', '''') not in (''sim'', ''nao'') then raise exception ''Informe se o cliente quer projeto pronto''; end if;
    update public.chamados set tratativa = coalesce(tratativa, ''{}''::jsonb) || jsonb_build_object(''querProjeto'', p->>''querProjeto'') where id = v_id;
  end if;
' || a);
  execute d;
end $$;
