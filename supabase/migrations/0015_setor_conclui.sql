-- Quem trata fala direto com o cliente e conclui: o call center deixa de concluir chamados de outros setores.
create or replace function public.mudar_status(p_id text, p_status public.status_chamado) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true);
begin
  if public.tipo_presale(c.tipo) then raise exception 'No marketing o status segue as etapas do cliente'; end if;
  if c.status = p_status then return; end if;
  update public.chamados set status = p_status where id = p_id;
  perform public._reg(p_id, 'Status → ' || public._label_status(p_status));
end $$;
