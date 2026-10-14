-- 0126 · Checklist: data oferecida segura o horário por 3 dias e NÃO libera sozinha depois;
-- a equipe decide: liberar a agenda (cliente volta para "A agendar") ou renovar a reserva.

-- prazo de reserva: 3 dias
update public.config set checklist_agenda = jsonb_set(checklist_agenda, '{seguraDias}', '3') where id = 1;

-- ações novas: liberar (reserva vencida) e renovar
DO $$
declare d text; a text := '    when ''realizado'' then';
begin
  d := pg_get_functiondef('public.checklist_registrar'::regproc);
  if position(a in d) = 0 then raise exception 'âncora não encontrada'; end if;
  d := replace(d, a, '    when ''liberar'' then
      if coalesce(ck->>''etapa'', '''') <> ''aguardando'' or nullif(ck->>''proposta'', '''') is null then raise exception ''Este cliente não tem data oferecida segurando a agenda''; end if;
      txt := ''🔓 Agenda liberada — reserva de '' || to_char((ck->>''proposta'')::timestamp, ''DD/MM/YYYY HH24:MI'') || coalesce('' com '' || nullif(ck->>''propostaProjetista'', ''''), '''')
        || '' sem resposta (''|| coalesce(ck->>''contatos'', ''1'') || '' contato(s)); cliente volta para A agendar'';
      ck := (ck - ''proposta'' - ''propostaProjetista'' - ''propostaDiasExtras'' - ''propostaEncaixe'') || jsonb_build_object(''etapa'', ''a_contatar'', ''liberadoEm'', now(), ''liberacoes'', coalesce((ck->>''liberacoes'')::int, 0) + 1);
    when ''renovar'' then
      if coalesce(ck->>''etapa'', '''') <> ''aguardando'' or nullif(ck->>''proposta'', '''') is null then raise exception ''Este cliente não tem data oferecida''; end if;
      ck := ck || jsonb_build_object(''ultimoContato'', now(), ''renovacoes'', coalesce((ck->>''renovacoes'')::int, 0) + 1);
      txt := ''🔁 Reserva renovada — '' || to_char((ck->>''proposta'')::timestamp, ''DD/MM/YYYY HH24:MI'') || coalesce('' com '' || nullif(ck->>''propostaProjetista'', ''''), '''') || '' continua segurada'';
' || a);
  execute d;
end $$;

-- conflito de agenda (banco): data oferecida aguardando resposta também ocupa o projetista — vencida ou não
DO $$
declare d text;
  a1 text := '     where c.tipo = ''checklist'' and c.id <> p_id and c.status <> ''concluida'' and c.tratativa->''checklist''->>''etapa'' = ''agendado''),';
  a2 text := 'jsonb_array_elements(case when jsonb_typeof(k->''diasExtras'') = ''array'' then k->''diasExtras'' else ''[]''::jsonb end) e)';
begin
  d := pg_get_functiondef('public._ck_proj'::regproc);
  if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception 'âncora não encontrada'; end if;
  d := replace(d, a1, a1 || '
  ofe as (
    select c.cliente, c.tratativa->''checklist'' k from public.chamados c
     where c.tipo = ''checklist'' and c.id <> p_id and c.status <> ''concluida'' and c.tratativa->''checklist''->>''etapa'' = ''aguardando''
       and nullif(c.tratativa->''checklist''->>''proposta'', '''') is not null),');
  d := replace(d, a2, 'jsonb_array_elements(case when jsonb_typeof(k->''diasExtras'') = ''array'' then k->''diasExtras'' else ''[]''::jsonb end) e
    union all
    select cliente || '' (data oferecida, aguardando resposta)'', nullif(k->>''proposta'', '''')::timestamp, coalesce((k->>''duracaoMin'')::int, dur), k->>''propostaProjetista'' from ofe
    union all
    select cliente || '' (data oferecida)'', nullif(e->>''data'', '''')::timestamp, coalesce((e->>''duracaoMin'')::int, dur), k->>''propostaProjetista''
      from ofe, jsonb_array_elements(case when jsonb_typeof(k->''propostaDiasExtras'') = ''array'' then k->''propostaDiasExtras'' else ''[]''::jsonb end) e)');
  execute d;
end $$;

-- aviso das 9h do checklist: reservas vencidas (3+ dias sem resposta) para decidir
DO $$
declare d text; a1 text := 'interval ''2 days''),'; a2 text := ' sem resposta há 2+ dias · ';
begin
  d := pg_get_functiondef('public.avisos_rotina_em'::regproc);
  if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception 'âncora não encontrada'; end if;
  d := replace(d, a1, 'interval ''3 days''),');
  d := replace(d, a2, ' reserva(s) vencida(s) para liberar ou renovar · ');
  execute d;
end $$;
