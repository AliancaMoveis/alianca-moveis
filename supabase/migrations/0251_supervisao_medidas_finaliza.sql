-- Medidas: a supervisão de medidas (Luciene, Mariana) precisa encerrar o ticket em qualquer etapa —
-- é assim que se fecha ticket repetido, como a venda 1313767 do Elton Aparecido, que tem dois
-- tickets de medida em aberto (ALM-2721 e ALM-9214). O medidor continua de fora: só a supervisão.
-- Acréscimo cirúrgico, sem mexer em pode_tratar_chamado, que governa muita coisa.
create or replace function public.finalizar_atendimento(p_id text, p_texto text default ''::text)
returns void language plpgsql security definer set search_path to '' as $$
declare c public.chamados := public._chamado(p_id, false); eu uuid := auth.uid(); tx text := btrim(coalesce(p_texto, ''));
        sup_med boolean := 'medidas_supervisao' = any(public.meus_setores());
begin
  if public.tipo_presale(c.tipo) then raise exception 'No marketing o atendimento segue as etapas do cliente'; end if;
  if not (public.pode_tratar_chamado(c) is true or public.eh_callcenter() is true
          or (c.tipo in ('medidas', 'solicitacao_medida') and sup_med)) then
    raise exception 'Você não pode finalizar este atendimento';
  end if;
  if c.status = 'concluida' then raise exception 'Este atendimento já está finalizado'; end if;
  update public.chamados set status = 'concluida',
    resposta_texto = case when tx <> '' then tx else resposta_texto end,
    resposta_quem = case when tx <> '' then public._nome(eu) else resposta_quem end,
    resposta_quando = case when tx <> '' then now() else resposta_quando end
  where id = p_id;
  perform public._reg(p_id, '✓ Atendimento finalizado por ' || public._nome(eu) || case when tx <> '' then ': ' || left(tx, 400) else '' end);
end $$;
