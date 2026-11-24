-- Quem escreve texto livre cai em "💬 Respondeu · ler e responder" e NUNCA saía de lá: ninguém,
-- nem a tela nem o banco, gravava respostaCliente.lidoEm. Resultado: o cliente ficava eternamente
-- nessa aba e, pior, aparecia nela E na aba da etapa dele ao mesmo tempo (caso do Anderson Augusto,
-- ALM-6111: escreveu "Ola" 12:14, recebeu nova data 14:04, e continuou em "ler e responder").
--
-- Agora o atendimento ao cliente marca a resposta como lida. A lista de ações é deliberada:
--   entram as que são atender o cliente (mandar data, agendar, remarcar, classificar o motivo);
--   ficam fora 'nota' (anotar não é responder — a cobrança tem que continuar de pé),
--   'liberar' e 'renovar' (é a reserva da agenda vencendo, não resposta nossa),
--   'quer_encaixe' e 'projetista' (marcação interna, o cliente não é tocado).
-- Aplicado por substituição na definição corrente para não retranscrever a função inteira.
do $mig$
declare d text; alvo text; novo text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'checklist_registrar';
  if d is null then raise exception 'checklist_registrar não encontrada'; end if;
  if position('respostaCliente,lidoEm' in d) > 0 or position('_ck_marca_lida' in d) > 0 then
    raise notice 'correção já aplicada — nada a fazer'; return;
  end if;

  alvo := E'  if acao in (''agendado'', ''reagendar'') then ck := ck || jsonb_build_object(''confirmacao'', ''''); end if;\n';
  if position(alvo in d) = 0 then raise exception 'âncora não encontrada na função — abortado sem alterar nada'; end if;

  novo := E'  -- atendeu o cliente: a resposta em texto livre dele sai de "ler e responder" (_ck_marca_lida)\n'
       || E'  if acao in (''mensagem'', ''cobranca'', ''agendado'', ''reagendar'', ''mover'', ''dias'', ''desmarcar'',\n'
       || E'              ''espera'', ''outra_data'', ''em_obras'', ''sem_resposta'', ''confirmacao_enviada'',\n'
       || E'              ''presenca_confirmada'', ''reabrir'')\n'
       || E'     and ((jsonb_typeof(ck->''respostaCliente'') = ''object'' and (ck->''respostaCliente''->>''lidoEm'') is null)\n'
       || E'          or ck->>''etapa'' = ''respondeu'') then\n'
       || E'    ck := ck || jsonb_build_object(''respostaCliente'', coalesce(ck->''respostaCliente'', ''{}''::jsonb)\n'
       || E'      || jsonb_build_object(''lidoEm'', now(), ''lidoPor'', public._nome(auth.uid()), ''lidoAcao'', acao));\n'
       || E'  end if;\n';

  d := replace(d, alvo, alvo || novo);
  execute d;
  raise notice 'checklist_registrar atualizada';
end $mig$;

-- Backfill: quem tem contato nosso POSTERIOR à mensagem do cliente já foi respondido.
-- A data gravada é a do atendimento de verdade, não a do ajuste. Backup em ck_resposta_lida_backup.
create table if not exists public.ck_resposta_lida_backup (
  chamado_id text primary key, cliente text, etapa text,
  resposta_antes jsonb, ultimo_contato timestamptz, em timestamptz default now()
);
insert into public.ck_resposta_lida_backup (chamado_id, cliente, etapa, resposta_antes, ultimo_contato)
select c.id, c.cliente, c.tratativa->'checklist'->>'etapa', c.tratativa->'checklist'->'respostaCliente',
       nullif(c.tratativa->'checklist'->>'ultimoContato','')::timestamptz
from public.chamados c
where c.tipo='checklist' and c.status<>'concluida'
  and c.tratativa->'checklist'->'respostaCliente'->>'tipo' = 'outro'
  and (c.tratativa->'checklist'->'respostaCliente'->>'lidoEm') is null
  and nullif(c.tratativa->'checklist'->>'ultimoContato','')::timestamptz
      > nullif(c.tratativa->'checklist'->'respostaCliente'->>'em','')::timestamptz
on conflict (chamado_id) do nothing;

update public.chamados c
set tratativa = jsonb_set(c.tratativa, '{checklist,respostaCliente}',
      (c.tratativa->'checklist'->'respostaCliente')
      || jsonb_build_object('lidoEm', b.ultimo_contato, 'lidoPor', 'ajuste do sistema', 'lidoAcao', 'retroativo'))
from public.ck_resposta_lida_backup b
where c.id = b.chamado_id and (c.tratativa->'checklist'->'respostaCliente'->>'lidoEm') is null;
