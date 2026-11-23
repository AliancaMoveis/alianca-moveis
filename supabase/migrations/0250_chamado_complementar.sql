-- Complemento de quem ABRIU a solicitação. adicionar_nota exige _pode_acompanhar (tratar o chamado
-- ou ser call center), e quem pediu — gerente, loja, outro setor — não trata: ficava sem como
-- acrescentar informação depois de abrir. O texto entra no detalhe que o setor lê e no histórico.
create or replace function public.chamado_complementar(p_id text, p_texto text)
returns void language plpgsql security definer set search_path to '' as $$
declare c public.chamados := public._chamado(p_id, false); tx text := btrim(coalesce(p_texto, '')); marca text;
begin
  if length(tx) < 3 then raise exception 'Escreva o complemento'; end if;
  if not (coalesce(c.solicitante_id = auth.uid(), false) or public._pode_acompanhar(c)) then
    raise exception 'Só quem abriu a solicitação, ou o setor que trata, pode complementar';
  end if;
  if c.status = 'concluida' then raise exception 'Esta solicitação já foi finalizada'; end if;
  marca := '[complemento ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || '] ';
  perform public._reg(p_id, '📝 Complemento de ' || public._nome(auth.uid()) || ': ' || left(tx, 1000));
  -- o detalhe é o que o setor realmente lê; se já estiver grande, fica só no histórico
  if length(coalesce(c.motivo, '')) + length(tx) < 4000 then
    update public.chamados set motivo = btrim(coalesce(motivo, '')) || E'\n\n' || marca || tx where id = p_id;
  end if;
end $$;

revoke all on function public.chamado_complementar(text, text) from public, anon;
grant execute on function public.chamado_complementar(text, text) to authenticated;
