-- 0199: "Marcar realizado" aceita o contrato assinado no lugar da impressão
-- O fluxo mudou de "imprimir → assinar no papel → digitalizar" para "contrato com link/QR → cliente assina".
-- A tela já liberava o botão com o contrato assinado, mas o banco ainda exigia a impressão gerada e recusava
-- com "Gere a impressão antes de marcar realizado" — travando o fim do checklist. Continua exigindo o
-- assinado (o contrato assinado entra em termo.assinados, igual ao digitalizado antigo).
do $do$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ck_projetista_salvar';
  if d is null or position('Gere a impressão antes de marcar realizado' in d) = 0 then
    raise exception 'âncora da impressão não encontrada em ck_projetista_salvar';
  end if;
  d := replace(d,
    'if t0->''impressao'' is null then raise exception ''Gere a impressão antes de marcar realizado''; end if;',
    '-- 0199: a impressão deixou de ser obrigatória; vale o contrato assinado');
  execute d;
end $do$;
