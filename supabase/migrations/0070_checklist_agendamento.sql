-- Setor Checklist: fila de clientes a agendar (importada da planilha "Tickets" do sistema interno), contato por WhatsApp e controle do agendamento.
-- O agendamento oficial continua no sistema interno; aqui fica o controle de contato e o resultado.
-- tratativa.checklist = { etapa, proposta, agendadoPara, retornarEm, contatos, ultimoContato, ambiente, precisaMedida, medidaId, planilha{...} }
--   etapa: a_contatar | aguardando (mensagem enviada) | agendado | outra_data | em_obras | sem_resposta | realizado | desistiu

create or replace function public.pode_checklist() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_gestao() or 'checklist' = any(public.meus_setores());
$$;
revoke all on function public.pode_checklist() from public, anon;
grant execute on function public.pode_checklist() to authenticated;

-- Importação: cliente que já está no sistema (mesmo nº de venda num checklist) é IGNORADO — nunca substituído
create or replace function public.checklist_importar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; num text; novos int := 0; ign int := 0; tel text; vinc text; ag timestamp; nid text; eu uuid := auth.uid(); lista text[] := '{}';
begin
  if not public.pode_checklist() then raise exception 'Só o setor Checklist ou a Gestão importam a planilha'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then raise exception 'Planilha vazia'; end if;
  if jsonb_array_length(p) > 2000 then raise exception 'Planilha grande demais (máx. 2000 linhas)'; end if;
  perform set_config('alianca.sistema', '1', true);
  for r in select * from jsonb_array_elements(p) loop
    num := regexp_replace(coalesce(r->>'numero', ''), '\D', '', 'g');
    if num = '' or btrim(coalesce(r->>'cliente', '')) = '' then ign := ign + 1; continue; end if;
    if num = any(lista) or exists (select 1 from public.chamados c where c.tipo = 'checklist' and c.pedido = num) then ign := ign + 1; continue; end if;
    lista := lista || num;
    tel := regexp_replace(coalesce(nullif(r->>'telefone', ''), r->>'telefone2', ''), '\D', '', 'g');
    select vi.chamado_id into vinc from public.venda_itens vi where vi.numero = num and vi.status <> 'cancelada' limit 1;
    ag := nullif(r->>'agendadoPara', '')::timestamp;
    insert into public.chamados (tipo, setor_destino, status, sla_resposta, solicitante_id, solicitante_nome, solicitante_setor,
                                 cliente, cliente_doc, telefone, email, pedido, data_venda, produto, motivo, vinculado_a, tratativa)
    values ('checklist', 'checklist', case when ag is null then 'aberta' else 'tratativa' end::public.status_chamado, now() + interval '2 days', eu, public._nome(eu), 'Importação checklist',
            initcap(lower(btrim(r->>'cliente'))), '', tel, '', num, nullif(r->>'inclusao', '')::date, 'Projetados',
            coalesce(nullif(btrim(r->>'descricao'), ''), 'Venda encaminhada para o checklist'), vinc,
            jsonb_build_object('checklist', jsonb_build_object(
              'etapa', case when ag is null then 'a_contatar' else 'agendado' end, 'agendadoPara', ag, 'contatos', 0,
              'telefone2', regexp_replace(coalesce(r->>'telefone2', ''), '\D', '', 'g'),
              'planilha', jsonb_build_object('vendedor', coalesce(r->>'vendedor', ''), 'medidor', coalesce(r->>'medidor', ''),
                 'valor', coalesce(r->>'valor', ''), 'minhaVisita', coalesce(r->>'minhaVisita', ''), 'situacao', coalesce(r->>'situacao', ''),
                 'importadoEm', now()))))
    returning id into nid;
    insert into public.historico (chamado_id, quem_id, quem_nome, texto)
      values (nid, eu, public._nome(eu), '📥 Importado da planilha do checklist (venda ' || num || ')' || case when ag is not null then ' — já agendado para ' || to_char(ag, 'DD/MM/YYYY HH24:MI') else '' end);
    novos := novos + 1;
  end loop;
  perform set_config('alianca.sistema', '0', true);
  return jsonb_build_object('novos', novos, 'ignorados', ign);
end $$;
revoke all on function public.checklist_importar(jsonb) from public, anon;
grant execute on function public.checklist_importar(jsonb) to authenticated;

-- Registro do contato / resultado
create or replace function public.checklist_registrar(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados; ck jsonb; acao text := coalesce(p->>'acao', ''); txt text; dt timestamp; dd date; obs text := btrim(coalesce(p->>'obs', ''));
begin
  if not public.pode_checklist() then raise exception 'Só o setor Checklist ou a Gestão registram o contato'; end if;
  select * into c from public.chamados where id = p_id for update;
  if not found or c.tipo <> 'checklist' then raise exception 'Checklist não encontrado'; end if;
  ck := coalesce(c.tratativa->'checklist', '{}'::jsonb);
  if c.status = 'concluida' and acao <> 'reabrir' then raise exception 'Este checklist já foi encerrado'; end if;
  dt := nullif(p->>'data', '')::timestamp; dd := nullif(p->>'retornarEm', '')::date;
  case acao
    when 'mensagem' then
      if dt is null then raise exception 'Informe a data e o horário oferecidos ao cliente'; end if;
      ck := ck || jsonb_build_object('etapa', 'aguardando', 'proposta', dt, 'contatos', coalesce((ck->>'contatos')::int, 0) + 1, 'ultimoContato', now(),
                                     'precisaMedida', coalesce((p->>'precisaMedida')::boolean, false));
      txt := '💬 WhatsApp enviado — oferecido ' || to_char(dt, 'DD/MM/YYYY HH24:MI') || ' (' || (ck->>'contatos') || 'º contato)';
    when 'cobranca' then
      ck := ck || jsonb_build_object('etapa', 'aguardando', 'contatos', coalesce((ck->>'contatos')::int, 0) + 1, 'ultimoContato', now());
      txt := '💬 Nova tentativa de contato (' || (ck->>'contatos') || 'º contato)';
    when 'agendado' then
      dt := coalesce(dt, nullif(ck->>'proposta', '')::timestamp);
      if dt is null then raise exception 'Informe a data e o horário agendados'; end if;
      if coalesce(p->>'ambiente', '') <> 'pronto' then raise exception 'Confirme que o ambiente está pronto (sem obra, acabamentos feitos). Se ainda estiver em obra, registre "Ambiente em obra" e retorne o contato depois'; end if;
      ck := ck || jsonb_build_object('etapa', 'agendado', 'agendadoPara', dt, 'ambiente', p->>'ambiente', 'retornarEm', null);
      txt := '📅 Checklist agendado para ' || to_char(dt, 'DD/MM/YYYY HH24:MI') || ' · ambiente ' || case when p->>'ambiente' = 'pronto' then 'pronto' else 'AINDA EM OBRA' end || ' — lançar no sistema interno';
    when 'outra_data' then
      if dt is null and dd is null then raise exception 'Informe a data que o cliente pediu (ou quando retornar)'; end if;
      ck := ck || jsonb_build_object('etapa', 'outra_data', 'proposta', coalesce(dt, nullif(ck->>'proposta', '')::timestamp), 'retornarEm', coalesce(dd, dt::date));
      txt := '🔄 Cliente pediu outra data' || coalesce(': ' || to_char(dt, 'DD/MM/YYYY HH24:MI'), ' — retornar em ' || to_char(dd, 'DD/MM/YYYY'));
    when 'em_obras' then
      if dd is null then raise exception 'Informe quando retornar o contato (previsão de fim da obra)'; end if;
      ck := ck || jsonb_build_object('etapa', 'em_obras', 'ambiente', 'obras', 'retornarEm', dd);
      txt := '🚧 Ambiente em obra — retornar em ' || to_char(dd, 'DD/MM/YYYY');
    when 'sem_resposta' then
      ck := ck || jsonb_build_object('etapa', 'sem_resposta', 'retornarEm', coalesce(dd, (now() at time zone 'America/Sao_Paulo')::date + 2));
      txt := '📵 Sem resposta — tentar de novo em ' || to_char((ck->>'retornarEm')::date, 'DD/MM/YYYY');
    when 'realizado' then
      ck := ck || jsonb_build_object('etapa', 'realizado', 'realizadoEm', now());
      txt := '✅ Checklist realizado';
    when 'desistiu' then
      if obs = '' then raise exception 'Descreva o motivo'; end if;
      ck := ck || jsonb_build_object('etapa', 'desistiu');
      txt := '⛔ Encerrado sem checklist';
    when 'reabrir' then
      ck := ck || jsonb_build_object('etapa', 'a_contatar');
      txt := '↩️ Reaberto para novo contato';
    else raise exception 'Ação inválida';
  end case;
  update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('checklist', ck),
    status = case when acao in ('realizado', 'desistiu') then 'concluida' when acao = 'reabrir' then 'tratativa' when status = 'aberta' then 'tratativa' else status end
  where id = p_id;
  perform public._reg(p_id, txt || case when obs <> '' then ' — ' || obs else '' end);
end $$;
revoke all on function public.checklist_registrar(text, jsonb) from public, anon;
grant execute on function public.checklist_registrar(text, jsonb) to authenticated;

-- Sem medida: pede a conferência ao setor de Medidas (eles entram em contato com o cliente)
create or replace function public.checklist_pedir_medida(p_id text, p_obs text) returns text
language plpgsql security definer set search_path = '' as $$
declare c public.chamados; novo text; eu uuid := auth.uid();
begin
  if not public.pode_checklist() then raise exception 'Só o setor Checklist ou a Gestão pedem a medida'; end if;
  select * into c from public.chamados where id = p_id;
  if not found or c.tipo <> 'checklist' then raise exception 'Checklist não encontrado'; end if;
  if exists (select 1 from public.chamados m where m.tipo = 'medidas' and m.vinculado_a = p_id and m.status <> 'concluida') then raise exception 'Já existe uma medida pedida para este cliente'; end if;
  perform set_config('alianca.sistema', '1', true);
  insert into public.chamados (tipo, setor_destino, status, sla_resposta, solicitante_id, solicitante_nome, solicitante_setor, cliente, cliente_doc, telefone, email,
                               pedido, data_venda, produto, motivo, endereco, vinculado_a, tratativa)
  values ('medidas', 'medidas', 'aberta', now() + interval '2 days', eu, public._nome(eu), 'Checklist', c.cliente, c.cliente_doc, c.telefone, c.email,
          c.pedido, c.data_venda, c.produto, 'Checklist: confirmar as medidas com o cliente antes da revisão do projeto.' || coalesce(' ' || nullif(btrim(p_obs), ''), ''),
          c.endereco, p_id, jsonb_build_object('medida', jsonb_build_object('etapa', 'validar', 'pedidoChecklist', true)))
  returning id into novo;
  perform set_config('alianca.sistema', '0', true);
  update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('checklist', coalesce(tratativa->'checklist', '{}'::jsonb) || jsonb_build_object('precisaMedida', true, 'medidaId', novo))
   where id = p_id;
  perform public._reg(p_id, '📐 Medida pedida ao setor de Medidas (' || novo || ')');
  insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (novo, eu, public._nome(eu), 'Medida pedida pelo Checklist (' || p_id || ')');
  perform public._notificar(public._usuarios_setor(array['medidas_supervisao']), '📐 Checklist pediu conferência de medidas', c.cliente || ' · venda ' || c.pedido, novo, 'medidachk:' || novo);
  return novo;
end $$;
revoke all on function public.checklist_pedir_medida(text, text) from public, anon;
grant execute on function public.checklist_pedir_medida(text, text) to authenticated;

-- Medida pedida pelo checklist: ao liberar, devolve para o MESMO checklist (não cria outro)
do $do$ declare d text; begin
  d := pg_get_functiondef('public.medida_liberar(text,text)'::regprocedure);
  d := replace(d, $x$  perform set_config('alianca.sistema', '1', true);
  insert into public.chamados (tipo, setor_destino, status, sla_resposta$x$, $x$  select x.id into ck from public.chamados x where x.id = c.vinculado_a and x.tipo = 'checklist';
  if ck is not null then
    update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('checklist', coalesce(tratativa->'checklist', '{}'::jsonb) || jsonb_build_object('medidaOk', true, 'medidaOkEm', now()))
     where id = ck;
    perform public._reg(p_id, '✅ Medidas conferidas — devolvido ao checklist ' || ck);
    perform public._reg(ck, '📐 Medidas conferidas pelo setor de Medidas — pode seguir com o agendamento');
    perform public._notificar(public._usuarios_setor(array['checklist']), '📐 Medidas conferidas', c.cliente || ' · pode agendar o checklist', ck, 'medidaokchk:' || ck);
    return ck;
  end if;
  perform set_config('alianca.sistema', '1', true);
  insert into public.chamados (tipo, setor_destino, status, sla_resposta$x$);
  if d not like '%medidaokchk%' then raise exception 'medida_liberar'; end if;
  execute d;
end $do$;

-- Aviso diário (9h) ao setor Checklist: retornos do dia e sem resposta há 2+ dias
do $do$ declare d text; begin
  d := pg_get_functiondef('public.avisos_rotina_em(timestamp without time zone)'::regprocedure);
  d := replace(d, $x$  for r in select c.id, c.cliente, pv.prazo, pv.parado_obra$x$, $x$  if public._hm(agora, '09:00') then
    select count(*) filter (where (c.tratativa->'checklist'->>'retornarEm')::date <= hoje),
           count(*) filter (where c.tratativa->'checklist'->>'etapa' = 'aguardando' and (c.tratativa->'checklist'->>'ultimoContato')::timestamptz < now() - interval '2 days'),
           count(*) filter (where coalesce(c.tratativa->'checklist'->>'etapa', 'a_contatar') = 'a_contatar')
      into n, n2, n3 from public.chamados c where c.tipo = 'checklist' and c.status <> 'concluida';
    if n + n2 + n3 > 0 then
      perform public._notificar(public._usuarios_setor(array['checklist']), '📋 Checklist hoje',
        n3 || ' a contatar · ' || n || ' retorno(s) para hoje · ' || n2 || ' sem resposta há 2+ dias', null, 'chkdia:' || hoje);
    end if;
  end if;

  for r in select c.id, c.cliente, pv.prazo, pv.parado_obra$x$);
  if d not like '%chkdia%' then raise exception 'avisos'; end if;
  execute d;
end $do$;

-- (ajuste) importação guarda também o valor do cupom e marca inclusão manual
do $do$ declare d text; begin
  d := pg_get_functiondef('public.checklist_importar(jsonb)'::regprocedure);
  d := replace(d, $x$'valor', coalesce(r->>'valor', ''),$x$, $x$'valor', coalesce(r->>'valor', ''), 'cupom', coalesce(r->>'cupom', ''), 'manual', coalesce((r->>'manual')::boolean, false),$x$);
  d := replace(d, $x$'📥 Importado da planilha do checklist (venda ' || num || ')'$x$, $x$case when coalesce((r->>'manual')::boolean, false) then '✍️ Incluído manualmente no checklist (venda ' || num || ')' else '📥 Importado da planilha do checklist (venda ' || num || ')' end$x$);
  execute d;
end $do$;
