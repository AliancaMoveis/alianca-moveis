-- Call center (aplicada via MCP em 25/09/2026):
--  · tipos.rapido: motivos que se resolvem na ligação — "Previsão do frete (já com o freteiro)" e
--    "Montagem já agendada — horário / confirmação". Sem produto/CPF/nº venda obrigatórios.
--    "Solicitação de montagem" passa a se chamar "Solicitação de montagem (ainda não agendada)".
--  · criar_chamado(p): produto opcional nos rápidos; p.finalizar + p.resposta → já nasce finalizado;
--    p.acionarSupervisao + p.motivoSupervisao → chama pedir_acompanhamento (a responsabilidade continua com quem registrou).
--  · finalizar_atendimento(p_id, p_texto): call center ou setor responsável encerram qualquer chamado (menos marketing),
--    registrando o que foi informado; histórico "✓ Atendimento finalizado por …".
-- (criar_chamado foi alterado com replace() sobre a definição existente; ver 0003/0023 para o corpo base)
alter table public.tipos add column if not exists rapido boolean not null default false;
insert into public.tipos (id, nome, setor_destino, anexos, presale, direto, ordem, rapido) values
  ('previsao_frete', 'Previsão do frete (já com o freteiro)', 'callcenter', false, false, false, 1, true),
  ('horario_montagem', 'Montagem já agendada — horário / confirmação', 'callcenter', false, false, false, 4, true)
on conflict (id) do update set nome = excluded.nome, rapido = true;
update public.tipos set nome = 'Solicitação de montagem (ainda não agendada)' where id = 'montagem';

create or replace function public.finalizar_atendimento(p_id text, p_texto text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false); eu uuid := auth.uid(); tx text := btrim(coalesce(p_texto, ''));
begin
  if public.tipo_presale(c.tipo) then raise exception 'No marketing o atendimento segue as etapas do cliente'; end if;
  if not (public.pode_tratar_chamado(c) is true or public.eh_callcenter() is true) then raise exception 'Você não pode finalizar este atendimento'; end if;
  if c.status = 'concluida' then raise exception 'Este atendimento já está finalizado'; end if;
  update public.chamados set status = 'concluida',
    resposta_texto = case when tx <> '' then tx else resposta_texto end,
    resposta_quem = case when tx <> '' then public._nome(eu) else resposta_quem end,
    resposta_quando = case when tx <> '' then now() else resposta_quando end
  where id = p_id;
  perform public._reg(p_id, '✓ Atendimento finalizado por ' || public._nome(eu) || case when tx <> '' then ': ' || left(tx, 400) else '' end);
end $$;
