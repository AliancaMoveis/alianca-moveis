-- observação do lead (marketing) deixa de ser obrigatória; call center continua exigindo o detalhe do atendimento
DO $$
declare d text; a1 text := 'if btrim(coalesce(p->>''motivo'','''')) = '''' then raise exception'; a2 text := '    btrim(p->>''motivo''),';
begin
  d := pg_get_functiondef('public.criar_chamado'::regproc);
  if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception 'âncora não encontrada'; end if;
  d := replace(d, a1, 'if not t.presale and btrim(coalesce(p->>''motivo'','''')) = '''' then raise exception');
  d := replace(d, a2, '    btrim(coalesce(p->>''motivo'', '''')),');
  execute d;
end $$;
