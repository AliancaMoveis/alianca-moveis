-- Checklist: "Aguardando" com motivo, confirmação de presença (a confirmar → aguardando confirmação → presença confirmada)
-- e anotações / mensagens coladas no cliente (ck.notas). As mensagens de WhatsApp enviadas pelo 360 também ficam salvas.
do $do$ declare d text; begin
  d := pg_get_functiondef('public.checklist_registrar(text,jsonb)'::regprocedure);
  d := replace(d, $x$acao <> 'reabrir' then raise exception 'Este checklist já foi encerrado'$x$, $x$acao not in ('reabrir', 'nota') then raise exception 'Este checklist já foi encerrado'$x$);
  d := replace(d, $x$    when 'outra_data' then$x$, $x$    when 'espera' then
      if coalesce(p->>'motivo', '') not in ('obra', 'outra_data', 'sem_resposta', 'medida', 'viagem', 'financeiro', 'cliente_pediu', 'outro') then raise exception 'Escolha o motivo de aguardar'; end if;
      if p->>'motivo' = 'outro' and obs = '' then raise exception 'Descreva o motivo'; end if;
      ck := ck || jsonb_build_object('etapa', 'espera', 'motivoEspera', p->>'motivo', 'motivoTexto', obs, 'retornarEm', dd, 'esperaEm', now());
      txt := '⏸ Colocado em aguardando — ' || case p->>'motivo' when 'obra' then 'obra / reforma' when 'outra_data' then 'cliente pediu outra data' when 'sem_resposta' then 'sem resposta'
        when 'medida' then 'aguardando medida' when 'viagem' then 'cliente viajando' when 'financeiro' then 'financeiro / pagamento' when 'cliente_pediu' then 'cliente pediu para aguardar' else 'outro' end
        || coalesce(' · retornar em ' || to_char(dd, 'DD/MM/YYYY'), '');
    when 'confirmacao_enviada' then
      if coalesce(ck->>'etapa', '') <> 'agendado' then raise exception 'Só dá para confirmar presença de checklist agendado'; end if;
      ck := ck || jsonb_build_object('confirmacao', 'enviada', 'confirmacaoEnviadaEm', now());
      txt := '📨 Mensagem de confirmação de presença enviada (checklist de ' || coalesce(to_char(nullif(ck->>'agendadoPara', '')::timestamp, 'DD/MM HH24:MI'), '—') || ')';
    when 'presenca_confirmada' then
      if coalesce(ck->>'etapa', '') <> 'agendado' then raise exception 'Só dá para confirmar presença de checklist agendado'; end if;
      ck := ck || jsonb_build_object('confirmacao', 'confirmada', 'presencaConfirmadaEm', now());
      txt := '✅ Cliente confirmou presença no checklist de ' || coalesce(to_char(nullif(ck->>'agendadoPara', '')::timestamp, 'DD/MM HH24:MI'), '—');
    when 'nota' then
      if btrim(coalesce(p->>'texto', '')) = '' then raise exception 'Cole ou escreva a mensagem'; end if;
      txt := '📝 Anotação / mensagem salva: ' || left(btrim(p->>'texto'), 200) || case when length(btrim(p->>'texto')) > 200 then '…' else '' end;
    when 'outra_data' then$x$);
  d := replace(d, $x$  if enc is not null then txt := txt || ' · ⚠️ ENCAIXE confirmado: ' || enc; end if;$x$, $x$  if enc is not null then txt := txt || ' · ⚠️ ENCAIXE confirmado: ' || enc; end if;
  if acao in ('agendado', 'reagendar') then ck := ck || jsonb_build_object('confirmacao', ''); end if;
  if btrim(coalesce(p->>'texto', '')) <> '' then
    ck := ck || jsonb_build_object('notas', coalesce(ck->'notas', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'em', now(), 'por', public._nome(auth.uid()), 'tipo', case when acao = 'nota' then 'nota' else 'whats' end, 'texto', left(btrim(p->>'texto'), 4000))));
  end if;$x$);
  if d not like '%presenca_confirmada%' or d not like '%''notas''%' or d not like '%not in (''reabrir'', ''nota'')%' then raise exception 'registrar'; end if;
  execute d;

  d := pg_get_functiondef('public.salvar_checklist_agenda(jsonb)'::regprocedure);
  d := replace(d, $x$'duracaoMin', coalesce((p->>'duracaoMin')::int, 120))$x$, $x$'duracaoMin', coalesce((p->>'duracaoMin')::int, 120), 'confirmarDias', least(15, greatest(0, coalesce((p->>'confirmarDias')::int, 2))))$x$);
  if d not like '%confirmarDias%' then raise exception 'cfg'; end if;
  execute d;

  -- aviso das 9h: inclui quantos agendados estão para confirmar presença
  d := pg_get_functiondef('public.avisos_rotina_em(timestamp without time zone)'::regprocedure);
  d := replace(d, $x$      into n, n2, n3 from public.chamados c where c.tipo = 'checklist' and c.status <> 'concluida';
    if n + n2 + n3 > 0 then
      perform public._notificar(public._usuarios_setor(array['checklist']), '📋 Checklist hoje',
        n3 || ' a contatar · ' || n || ' retorno(s) para hoje · ' || n2 || ' sem resposta há 2+ dias', null, 'chkdia:' || hoje);$x$, $x$      into n, n2, n3 from public.chamados c where c.tipo = 'checklist' and c.status <> 'concluida';
    select count(*) into v from public.chamados c, public.config cf
     where cf.id = 1 and c.tipo = 'checklist' and c.status <> 'concluida' and c.tratativa->'checklist'->>'etapa' = 'agendado'
       and coalesce(c.tratativa->'checklist'->>'confirmacao', '') = ''
       and (c.tratativa->'checklist'->>'agendadoPara')::date between hoje and hoje + coalesce((cf.checklist_agenda->>'confirmarDias')::int, 2);
    if n + n2 + n3 + v > 0 then
      perform public._notificar(public._usuarios_setor(array['checklist']), '📋 Checklist hoje',
        n3 || ' a contatar · ' || n || ' retorno(s) para hoje · ' || n2 || ' sem resposta há 2+ dias · ' || v || ' para confirmar presença', null, 'chkdia:' || hoje);$x$);
  if d not like '%para confirmar presença%' then raise exception 'avisos'; end if;
  execute d;
end $do$;
update public.config set checklist_agenda = checklist_agenda || '{"confirmarDias":2}'::jsonb where id = 1 and not (checklist_agenda ? 'confirmarDias');
