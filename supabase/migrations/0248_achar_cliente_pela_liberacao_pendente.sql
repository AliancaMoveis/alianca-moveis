-- O documento nunca chegava ao cliente, mesmo ele autorizando.
--
-- Causa: as duas funcoes que achavam o cliente a partir da resposta dele
-- (kommo_chamado_por_contato e kommo_chamado_por_telefone) PARTEM de kommo_vinculo,
-- e o vinculo so e gravado pela acao de agendamento ('enviar'). A liberacao de
-- documento nunca grava vinculo -> nenhuma das duas acha o cliente -> a resposta e
-- descartada em silencio e o documento fica parado na ficha.
--
-- Segundo defeito, na busca por telefone: ela exige
-- tratativa->'checklist'->>'etapa' = 'aguardando', que e a etapa de AGENDAR. Quem ja
-- fez o checklist e esta recebendo documento nunca esta nessa etapa, entao mesmo com
-- vinculo a busca falharia. Essas funcoes foram feitas para o fluxo de agendamento e
-- nunca foram estendidas ao de documentos.
--
-- Esta funcao e o caminho proprio do fluxo de documentos: se existe pedido de liberacao
-- aberto para um chamado cujo telefone bate, a resposta e dele. Nao depende de vinculo,
-- de etapa nem do status do chamado -- so da autorizacao estar pendente.
create or replace function public.kommo_chamado_por_liberacao(p_fone text)
returns text language sql stable security definer set search_path to '' as $$
  with f as (select regexp_replace(coalesce(p_fone, ''), '\D', '', 'g') as d)
  select c.id
  from public.chamados c, f
  where c.tratativa->'checklist'->'termo'->'liberacao'->>'status' = 'aguardando'
    and jsonb_array_length(coalesce(c.tratativa->'checklist'->'termo'->'liberacao'->'docs', '[]'::jsonb)) > 0
    and length(f.d) >= 8
    and right(f.d, 8) in (
          right(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), 8),
          right(regexp_replace(coalesce(c.tratativa->'checklist'->>'telefone2', ''), '\D', '', 'g'), 8))
  order by (c.tratativa->'checklist'->'termo'->'liberacao'->>'em')::timestamptz desc
  limit 1;
$$;

comment on function public.kommo_chamado_por_liberacao(text) is
  'Acha o checklist pela autorizacao de documento pendente + telefone. Nao depende de kommo_vinculo nem da etapa de agendamento.';

grant execute on function public.kommo_chamado_por_liberacao(text) to authenticated, anon, service_role;
