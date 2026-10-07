-- Medidas: importar as planilhas de tickets do Exact (Situação = PENDENTES · AGUARDANDO MEDIÇÃO · ANÁLISE · APROVADOS).
-- Uma medida por nº de venda. Venda nova → cria na etapa da planilha. Venda que já está no 360 → só AVANÇA de etapa
-- (pendente → aguardando medição → análise → aprovada); nunca volta, e "em obra" / aprovada não mudam.
-- O medidor vem da coluna Medidor (Cesar, Gilberto ou o consultor). Medidas já feitas fora do 360 (análise/aprovados)
-- entram sem pagamento no 360 (já foram tratadas no Exact). Aprovados ligam ao checklist da venda como medida oficial.
-- p_aplicar = false só calcula a prévia.

create or replace function public._medidor_por_nome(p text) returns uuid
language sql stable security definer set search_path = '' as $$
  with n as (select lower(translate(btrim(coalesce(p, '')), 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc')) v)
  select u.id from public.usuarios u, n
   where u.ativo and n.v <> '' and exists (select 1 from public.usuario_setores us where us.usuario_id = u.id and us.setor_id in ('medidas', 'consultor_externo'))
     and (lower(translate(u.nome, 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc')) = n.v
          or n.v like lower(translate(u.nome, 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc')) || ' %')
   order by length(u.nome) desc limit 1;
$$;

create or replace function public.medidas_importar(p jsonb, p_aplicar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v text; et text; m public.chamados; ck public.chamados; uid uuid; eu uuid := auth.uid(); mid text; md jsonb; ordem jsonb := '{"pendente":1,"agendada":2,"validar":3,"realizada":3,"liberada":4}';
        n_novo int := 0; n_av int := 0; n_igual int := 0; n_semvenda int := 0; l_nov jsonb := '{}'; l_av jsonb := '[]'; sem_med text[] := '{}'; vistos text[] := '{}';
        etatual text; feita boolean;
begin
  if not public.eh_sup_medidas() then raise exception 'Só a Supervisão de Medidas ou a Gestão importam as medidas'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then raise exception 'Planilha vazia'; end if;
  if jsonb_array_length(p) > 3000 then raise exception 'Planilha grande demais (máx. 3000 linhas)'; end if;
  if p_aplicar then perform set_config('alianca.sistema', '1', true); end if;
  for r in select * from jsonb_array_elements(p) loop
    v := regexp_replace(coalesce(r->>'venda', ''), '\D', '', 'g');
    et := r->>'etapa';
    if v = '' then n_semvenda := n_semvenda + 1; continue; end if;
    if et not in ('pendente', 'agendada', 'realizada', 'liberada') then continue; end if;
    if v = any(vistos) then continue; end if;
    vistos := vistos || v;
    uid := public._medidor_por_nome(r->>'medidor');
    if nullif(btrim(coalesce(r->>'medidor', '')), '') is not null and uid is null then sem_med := sem_med || btrim(r->>'medidor'); end if;
    feita := et in ('realizada', 'liberada');
    md := jsonb_build_object('etapa', et, 'origem', 'exact', 'importadoEm', now(), 'ambientes', coalesce(r->>'ambientes', ''), 'qtdAmbientes', coalesce(r->>'qtdAmbientes', ''),
            'envioMedicao', coalesce(r->>'envio', ''), 'medidorExact', coalesce(r->>'medidor', ''))
          || case when feita then jsonb_build_object('realizadaEm', coalesce(nullif(r->>'preenchimento', ''), now()::text), 'realizadaPor', uid, 'semPagamento', true) else '{}'::jsonb end
          || case when et = 'liberada' then jsonb_build_object('liberadaEm', coalesce(nullif(r->>'conclusao', ''), nullif(r->>'preenchimento', ''), now()::text), 'liberadaPor', 'Exact (importação)', 'oficial', true) else '{}'::jsonb end;
    select * into m from public.chamados x where x.tipo = 'medidas' and x.pedido = v order by (x.status <> 'concluida') desc, x.criado_em desc limit 1;
    select * into ck from public.chamados x where x.tipo = 'checklist' and x.pedido = v order by (x.status <> 'concluida') desc limit 1;
    if m.id is null then
      n_novo := n_novo + 1; l_nov := jsonb_set(l_nov, array[et], coalesce(l_nov->et, '[]'::jsonb) || to_jsonb(coalesce(r->>'cliente', '') || ' · venda ' || v || coalesce(' · ' || nullif(r->>'medidor', ''), '')));
      if p_aplicar then
        insert into public.chamados (tipo, setor_destino, status, sla_resposta, solicitante_id, solicitante_nome, solicitante_setor, cliente, cliente_doc, telefone, email,
                                     pedido, data_venda, produto, motivo, endereco, vinculado_a, medidor_id, tratativa)
        values ('medidas', 'medidas', case when et = 'liberada' then 'concluida' when et = 'pendente' then 'aberta' else 'tratativa' end::public.status_chamado,
                now() + interval '2 days', eu, public._nome(eu), 'Importação Exact',
                coalesce(nullif(initcap(lower(btrim(r->>'cliente'))), ''), ck.cliente, 'Cliente'), coalesce(ck.cliente_doc, ''),
                coalesce(nullif(regexp_replace(coalesce(r->>'telefone', ''), '\D', '', 'g'), ''), ck.telefone, ''), coalesce(ck.email, ''),
                v, coalesce(nullif(r->>'inclusao', '')::date, ck.data_venda), coalesce(ck.produto, 'Projetados'),
                coalesce(nullif(btrim(r->>'descricao'), ''), 'Medida importada do Exact'), coalesce(nullif(btrim(r->>'endereco'), ''), ck.endereco, ''), ck.id,
                case when et <> 'pendente' then uid end, jsonb_build_object('medida', md))
        returning id into mid;
        insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (mid, eu, public._nome(eu),
          '📥 Importado do Exact (' || coalesce(r->>'situacao', et) || ')' || coalesce(' · medidor ' || nullif(r->>'medidor', ''), ''));
        if et = 'liberada' and ck.id is not null then
          update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('checklist', coalesce(tratativa->'checklist', '{}'::jsonb)
              || jsonb_build_object('medidaOk', true, 'medidaOkEm', now(), 'medidaId', mid)) where id = ck.id;
        end if;
      end if;
    else
      etatual := coalesce(m.tratativa->'medida'->>'etapa', 'validar');
      if etatual in ('em_obra', 'liberada') or m.status = 'concluida' or coalesce((ordem->>et)::int, 0) <= coalesce((ordem->>etatual)::int, 0) then n_igual := n_igual + 1; continue; end if;
      n_av := n_av + 1; l_av := l_av || to_jsonb(m.cliente || ' · venda ' || v || ': ' || etatual || ' → ' || et);
      if p_aplicar then
        update public.chamados set status = case when et = 'liberada' then 'concluida' else 'tratativa' end::public.status_chamado,
          medidor_id = coalesce(medidor_id, case when et <> 'pendente' then uid end),
          tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('medida', coalesce(tratativa->'medida', '{}'::jsonb) || md)
         where id = m.id;
        insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (m.id, eu, public._nome(eu), '📥 Atualizado pelo Exact: ' || etatual || ' → ' || coalesce(r->>'situacao', et));
        if et = 'liberada' and ck.id is not null then
          update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('checklist', coalesce(tratativa->'checklist', '{}'::jsonb)
              || jsonb_build_object('medidaOk', true, 'medidaOkEm', now(), 'medidaId', m.id)) where id = ck.id;
        end if;
      end if;
    end if;
  end loop;
  if p_aplicar then perform set_config('alianca.sistema', '0', true); end if;
  return jsonb_build_object('novos', n_novo, 'avancam', n_av, 'iguais', n_igual, 'semVenda', n_semvenda, 'listaNovos', l_nov, 'listaAvancam', l_av,
    'medidorDesconhecido', to_jsonb(array(select distinct unnest(sem_med))), 'aplicado', p_aplicar);
end $$;
revoke all on function public.medidas_importar(jsonb, boolean) from public, anon;
grant execute on function public.medidas_importar(jsonb, boolean) to authenticated;
