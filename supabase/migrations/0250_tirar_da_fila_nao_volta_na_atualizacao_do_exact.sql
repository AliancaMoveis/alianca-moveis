-- "Tirar da fila" apagava a linha de venda_confirmacao. Como a atualizacao do Exact
-- reinsere tudo que ela encontra, a venda voltava como pendente na atualizacao seguinte:
-- a Gestao tirava, o Exact devolvia, e o trabalho recomecava do zero toda vez.
--
-- Agora tirar da fila GRAVA a decisao, com o status 'removida'. A venda deixa de aparecer
-- em "a conferir" e, quando o Exact a trouxer de novo, o on conflict de venda_conf_enviar
-- encontra a linha e preserva o status -- ela nao volta.
-- Conferido: linha com status removida + o mesmo upsert da atualizacao do Exact = continua removida.

alter table public.venda_confirmacao drop constraint if exists venda_confirmacao_status_check;
alter table public.venda_confirmacao add constraint venda_confirmacao_status_check
  check (status = any (array['pendente','validada','negada','checklist','removida']));

create or replace function public.venda_conf_excluir(p_numeros text[])
returns integer language plpgsql security definer set search_path to '' as $function$
declare n int;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão confirma vendas'; end if;
  -- não apaga: marca. Apagar fazia a venda voltar na próxima atualização do Exact.
  -- O que já foi validado continua efetivado no cliente e não é tocado aqui.
  update public.venda_confirmacao
     set status = 'removida', decidido_em = now(),
         motivo = btrim(coalesce(motivo,'') || ' · tirada da fila pela Gestão')
   where numero = any(p_numeros) and status = 'pendente';
  get diagnostics n = row_count;
  return n;
end $function$;

comment on function public.venda_conf_excluir(text[]) is
  'Tira a venda da fila de confirmacao marcando status=removida. Nao apaga, para a venda nao voltar quando o Exact for atualizado.';
