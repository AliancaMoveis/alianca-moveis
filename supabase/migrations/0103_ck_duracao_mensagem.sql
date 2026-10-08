-- checklist_registrar: a duração (tempo que trava a agenda) também é gravada na ação 'mensagem' (WhatsApp com data oferecida)
do $m$
declare f text; a text := 'if acao = ''agendado'' and nullif(p->>''duracaoMin''';
begin
  f := pg_get_functiondef('public.checklist_registrar'::regproc);
  if position(a in f) = 0 then raise exception 'anchor nao encontrado'; end if;
  f := replace(f, a, 'if acao in (''agendado'',''mensagem'') and nullif(p->>''duracaoMin''');
  execute f;
end $m$;
