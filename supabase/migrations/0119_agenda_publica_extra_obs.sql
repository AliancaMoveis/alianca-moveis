-- obs da agenda aberta = ambiente/obs (produto) + obs do agendamento + motivo (sem textos de importação)
CREATE OR REPLACE FUNCTION public.agenda_publica_extra(p_token text, p_dia date)
 RETURNS TABLE(id text, telefone text, obs text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_token is null or length(p_token) < 40 or not exists (select 1 from public.agenda_publica a where a.id = 1 and a.ativo and a.token = p_token) then
    raise exception 'Link inválido ou desligado';
  end if;
  if p_dia is null or p_dia < hoje - 1 or p_dia > hoje + 7 then raise exception 'Dia fora do período da agenda'; end if;
  return query
    select c.id, coalesce(c.telefone, ''),
           concat_ws(' · ', nullif(btrim(coalesce(c.produto, '')), ''), nullif(btrim(coalesce(c.tratativa->>'obs', '')), ''),
             case when coalesce(c.motivo, '') ~* 'importad|planilha|^agenda da loja' then null else nullif(btrim(coalesce(c.motivo, '')), '') end)
    from public.chamados c join public.tipos t on t.id = c.tipo
    where t.presale and c.data_loja is not null and c.data_loja::date = p_dia and not (c.tratativa ? 'importadoVisita' or c.tratativa ? 'visitaImportada');
end $function$;
