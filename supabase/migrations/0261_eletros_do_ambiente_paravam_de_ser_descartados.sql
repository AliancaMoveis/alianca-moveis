-- Checklist: os eletros do ambiente paravam de existir no momento de salvar.
--
-- A tela tem o editor desde sempre ("Eletros do ambiente — a dimensão define o nicho") e a
-- projetista preenchia Fogão / Geladeira / Micro-ondas / Lava-louças com as dimensões. Só que
-- ck_projetista_salvar reconstrói cada ambiente a partir de uma lista fixa de campos, com o
-- comentário "descarta qualquer outra chave que venha do navegador" — e 'eletros' não estava na
-- lista. Resultado: a lista era jogada fora em TODO salvamento, e o banco inteiro tinha zero
-- eletros gravados. Daí a pergunta da Juliana em 26/11/2026: "preenchi as medidas dos eletros e
-- não aparece no contrato".
--
-- Aqui entra a gravação. O desenho no contrato vai junto no mesmo deploy (contratoDoc.ts).
-- Aplicada por patch no corpo existente, para não retranscrever a função inteira.

do $mig$
declare d text; n text; anc text := '''itensDe'', a->''itensDe'',';
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'ck_projetista_salvar';

  if position('''eletros''' in d) > 0 then raise notice 'ja tem eletros'; return; end if;
  if position(anc in d) = 0 then raise exception 'ancora nao encontrada'; end if;

  n := replace(d, anc, anc || chr(10) ||
    '        -- eletros do ambiente: a dimensao e o que define o nicho, entao tem que ser gravada' || chr(10) ||
    '        -- e ir para o contrato. Sem esta linha a lista era descartada em todo salvamento.' || chr(10) ||
    '        ''eletros'', (select coalesce(jsonb_agg(jsonb_build_object(' || chr(10) ||
    '            ''nome'', left(btrim(coalesce(e->>''nome'', '''')), 60),' || chr(10) ||
    '            ''dim'', left(btrim(coalesce(e->>''dim'', '''')), 60))), ''[]''::jsonb)' || chr(10) ||
    '          from jsonb_array_elements(case when jsonb_typeof(a->''eletros'') = ''array'' then a->''eletros'' else ''[]''::jsonb end) e' || chr(10) ||
    '          where btrim(coalesce(e->>''nome'', '''')) <> '''' or btrim(coalesce(e->>''dim'', '''')) <> ''''),');

  execute n;
  raise notice 'eletros adicionados';
end $mig$;
