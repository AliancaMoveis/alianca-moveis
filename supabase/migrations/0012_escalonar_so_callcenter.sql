-- Escalonamento automático vale só para o call center (pós-venda). Marketing não tem prazo de resposta:
-- lá a prioridade é "crítico por falta de atualização", calculada na tela.
-- Quando o chamado sai do atraso (respondido, concluído ou prazo prorrogado), a urgência que o SISTEMA colocou é retirada.
create or replace function public.autoescalonar() returns integer
language plpgsql security definer set search_path = '' as $$
declare c record; n integer := 0;
begin
  for c in select ch.* from public.chamados ch join public.tipos t on t.id = ch.tipo
           where not t.presale and (ch.status in ('aberta','tratativa') or ch.escalonado_auto) for update of ch loop
    if c.status in ('aberta','tratativa') and now() > c.sla_resposta then
      if not c.escalonado_auto then
        update public.chamados set urgente = true, escalonado_auto = true, escalado_em = now() where id = c.id;
        insert into public.historico (chamado_id, quem_id, quem_nome, texto)
          values (c.id, null, 'Sistema', 'Escalonado automaticamente para urgente — prazo de resposta vencido sem retorno');
        n := n + 1;
      end if;
      if now() - c.sla_resposta >= interval '24 hours' and not c.escalado_critico then
        update public.chamados set escalado_critico = true where id = c.id;
        insert into public.historico (chamado_id, quem_id, quem_nome, texto)
          values (c.id, null, 'Sistema', 'Atraso crítico — mais de 24h sem resposta, destacado para Supervisão e Gestão');
        n := n + 1;
      end if;
    elsif c.escalonado_auto then
      update public.chamados set escalonado_auto = false, escalado_critico = false, urgente = false where id = c.id;
      if c.urgente and c.status in ('aberta','tratativa') then
        insert into public.historico (chamado_id, quem_id, quem_nome, texto)
          values (c.id, null, 'Sistema', 'Urgência automática retirada — prazo de resposta regularizado');
      end if;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.autoescalonar() from authenticated, anon, public;

-- limpa marcações automáticas que foram parar em clientes do marketing
update public.chamados ch set escalonado_auto = false, escalado_critico = false,
  urgente = exists (select 1 from public.historico h where h.chamado_id = ch.id and h.texto = 'Marcado como URGENTE'
                    and h.id > coalesce((select max(h2.id) from public.historico h2 where h2.chamado_id = ch.id and h2.texto = 'Urgência removida'), 0))
from public.tipos t where t.id = ch.tipo and t.presale and (ch.escalonado_auto or ch.escalado_critico or ch.urgente);

select public.autoescalonar();
