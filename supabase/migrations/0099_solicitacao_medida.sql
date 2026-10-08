-- Call center não abre ORDEM de medida: abre uma SOLICITAÇÃO para o setor de Medidas (Luciene), que trata, se precisar
-- encaminha para medir (cria/vincula a ordem de medida na fila do setor) e finaliza o ticket do call center.
-- O fluxo de ordens de medida continua vindo da planilha do Exact / vendas / checklist.
insert into public.tipos (id, nome, ordem, anexos, direto, rapido, presale, setor_destino)
values ('solicitacao_medida', 'Solicitação de medidas', 8, true, false, false, false, 'medidas_supervisao')
on conflict (id) do update set nome = excluded.nome, setor_destino = excluded.setor_destino;
update public.tipos set nome = 'Ordem de medida (setor de Medidas)' where id = 'medidas';

-- o banco proíbe o call center de abrir ordem de medida direto
create or replace function public._trg_cc_nao_abre_ordem_medida() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.tipo = 'medidas' and auth.uid() is not null and coalesce(current_setting('alianca.sistema', true), '') <> '1'
     and 'callcenter' = any(public.meus_setores()) and not (public.eh_gestao() or public.eh_sup_medidas()) then
    raise exception 'O call center abre "Solicitação de medidas" — a ordem de medida é criada pelo setor de Medidas';
  end if;
  return new;
end $$;
create or replace trigger trg_cc_nao_abre_ordem_medida before insert on public.chamados
  for each row execute function public._trg_cc_nao_abre_ordem_medida();

-- Medidas encaminha a solicitação para medir: cria a ordem (etapa pendente) ou vincula a que já existe para a venda
create or replace function public.medida_solicitacao_encaminhar(p_id text, p_obs text default '') returns text
language plpgsql security definer set search_path to '' as $$
declare c public.chamados; ex public.chamados; novo text; eu uuid := auth.uid();
begin
  if not (public.eh_gestao() or public.eh_sup_medidas()) then raise exception 'Só a supervisão de Medidas encaminha para medir'; end if;
  select * into c from public.chamados where id = p_id for update;
  if not found or c.tipo <> 'solicitacao_medida' then raise exception 'Solicitação não encontrada'; end if;
  if c.status = 'concluida' then raise exception 'Esta solicitação já foi finalizada'; end if;
  if nullif(c.tratativa->>'ordemMedida', '') is not null then raise exception 'Já encaminhada para medir (%)', c.tratativa->>'ordemMedida'; end if;
  select * into ex from public.chamados m where m.tipo = 'medidas' and nullif(btrim(c.pedido), '') is not null and m.pedido = c.pedido order by m.criado_em desc limit 1;
  if found then
    novo := ex.id;
    perform public._reg(p_id, '📐 Já existe ordem de medida para esta venda (' || novo || ') — solicitação vinculada a ela');
    insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (novo, eu, public._nome(eu), '📞 Solicitação do call center vinculada (' || p_id || ')' || coalesce(': ' || nullif(btrim(p_obs), ''), ''));
  else
    perform set_config('alianca.sistema', '1', true);
    insert into public.chamados (tipo, setor_destino, status, sla_resposta, solicitante_id, solicitante_nome, solicitante_setor, cliente, cliente_doc, telefone, email,
                                 pedido, data_venda, produto, motivo, endereco, vinculado_a, tratativa)
    values ('medidas', 'medidas', 'aberta', now() + interval '2 days', eu, public._nome(eu), 'Supervisão de Medidas', c.cliente, c.cliente_doc, c.telefone, c.email,
            c.pedido, c.data_venda, c.produto, 'Solicitação do call center (' || p_id || '): ' || left(coalesce(c.motivo, ''), 400) || coalesce(' · ' || nullif(btrim(p_obs), ''), ''),
            c.endereco, p_id, jsonb_build_object('medida', jsonb_build_object('etapa', 'pendente', 'solicitacaoCC', p_id)))
    returning id into novo;
    perform set_config('alianca.sistema', '0', true);
    insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (novo, eu, public._nome(eu), 'Ordem de medida criada a partir da solicitação do call center (' || p_id || ')');
    perform public._reg(p_id, '📐 Encaminhado para medir — ordem de medida ' || novo);
  end if;
  update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('ordemMedida', novo, 'encaminhadoEm', now()),
    status = case when status = 'aberta' then 'tratativa'::public.status_chamado else status end
  where id = p_id;
  return novo;
end $$;
revoke all on function public.medida_solicitacao_encaminhar(text, text) from public, anon;
grant execute on function public.medida_solicitacao_encaminhar(text, text) to authenticated;
