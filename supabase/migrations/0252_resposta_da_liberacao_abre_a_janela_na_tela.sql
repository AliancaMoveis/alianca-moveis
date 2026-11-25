-- O cliente respondia a pergunta de liberacao, recebia os documentos, e o anel do botao de
-- conversa continuava LARANJA (janela fechada) -- a equipe achava que nao podia escrever,
-- quando podia. Os 6 clientes liberados em 25/11 estavam todos assim.
--
-- Causa: o webhook, quando ha liberacao pendente, manda os documentos e SAI -- de proposito,
-- para a mensagem nao ser lida como resposta de agendamento. So que com isso ninguem gravava
-- respostaCliente, que e de onde a tela tira a janela de 24h.
--
-- Como ck_doc_liberacao_enviado so roda quando o cliente acabou de responder, e aqui o lugar
-- certo para marcar a janela -- e sem mexer na funcao do webhook.
--
-- tipo='liberacao' e lidoEm ja preenchido de proposito: respondeuManual() exige
-- tipo='outro' sem lidoEm, entao esses clientes NAO entram na fila de "ler e responder".
create or replace function public.ck_doc_liberacao_enviado(p_chamado text, p jsonb)
returns void language plpgsql security definer set search_path to '' as $function$
declare envio jsonb := jsonb_build_object('em', to_jsonb(now()), 'por', 'automático · resposta do cliente',
                                          'via', 'checklist', 'para', p->>'para');
begin
  update public.chamados c
     set tratativa = jsonb_set(
           jsonb_set(
             jsonb_set(c.tratativa, '{checklist,termo,liberacao,status}', '"enviado"'::jsonb),
             '{checklist,termo,docsCliente}',
             (select coalesce(jsonb_agg(
                       case when exists (select 1 from jsonb_array_elements(c.tratativa->'checklist'->'termo'->'liberacao'->'docs') x
                                          where x->>'path' = d->>'path')
                            then d || jsonb_build_object('enviado', coalesce(d->'enviado','[]'::jsonb) || jsonb_build_array(envio))
                            else d end), '[]'::jsonb)
                from jsonb_array_elements(coalesce(c.tratativa->'checklist'->'termo'->'docsCliente','[]'::jsonb)) d)),
           '{checklist,respostaCliente}',
           coalesce(c.tratativa->'checklist'->'respostaCliente', '{}'::jsonb)
             || jsonb_build_object('em', to_jsonb(now()), 'tipo', 'liberacao',
                                   'texto', 'autorizou o envio dos documentos',
                                   'lidoEm', to_jsonb(now()), 'lidoPor', 'automático')),
         atualizado_em = now()
   where c.id = p_chamado;
  perform public._reg(p_chamado, '💬 Documentos enviados ao cliente pelo WhatsApp do checklist (liberado por ele)');
end $function$;
