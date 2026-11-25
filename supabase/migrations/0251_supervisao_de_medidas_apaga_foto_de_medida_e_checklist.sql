-- A supervisao de medidas passa a apagar anexo nas fichas que sao trabalho dela:
-- medida e checklist. Foto errada, repetida ou de outro cliente, mandada pelo medidor,
-- ela resolve na hora em vez de abrir chamado para a Gestao.
--
-- Fora desses dois tipos nada muda: continua Gestao, ou quem enviou o anexo.
-- Vendedor (atendente_cliente) segue sem apagar, como ja era.
-- Conferido com a Luciene e a Mariana: true em medidas, false em assistencia,
-- visita_consultor, agendamento_loja e retorno_montador.
create or replace function public.pode_remover_anexo(a anexos)
returns boolean language sql stable security definer set search_path to '' as $$
  select public.eh_gestao()
      or (a.criado_por is not null and a.criado_por = auth.uid()
          and not ('atendente_cliente' = any(public.meus_setores())))
      or ('medidas_supervisao' = any(public.meus_setores())
          and exists (select 1 from public.chamados c
                       where c.id = a.chamado_id and c.tipo in ('medidas','checklist')));
$$;

comment on function public.pode_remover_anexo(anexos) is
  'Gestao em qualquer ficha; quem enviou o anexo; e a supervisao de medidas nas fichas de medida e checklist.';
