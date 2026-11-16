-- 0193: direcionar a medição sem data e horário
-- A Supervisão de Medidas (Luciene) escolhe quem vai medir; a data e o horário ficam OPCIONAIS,
-- porque quem vai medir entra em contato com o cliente e combina. Fica marcado aCombinar = true,
-- e o aviso no celular pede para combinar a data.

create or replace function public.medida_direcionar(p_id text, p_medidor uuid, p_data timestamp, p_endereco text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._medida(p_id); m jsonb; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
        quando text; titulo text; corpo text;
begin
  if not public.eh_sup_medidas() then raise exception 'Só a Supervisão de Medidas ou a Gestão direcionam a medição'; end if;
  if c.status = 'concluida' then raise exception 'Esta medida já foi liberada para o checklist'; end if;
  if p_medidor is null or not public._pode_medir(p_medidor) then raise exception 'Escolha um medidor ou consultor externo'; end if;
  m := coalesce(c.tratativa->'medida', '{}'::jsonb) || jsonb_build_object('etapa', 'agendada',
        'direcionadoPor', public._nome(auth.uid()), 'direcionadoEm', now(), 'aCombinar', p_data is null);
  update public.chamados set medidor_id = p_medidor, data_medida = p_data, status = 'tratativa',
    endereco = coalesce(nullif(btrim(p_endereco), ''), endereco),
    tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('medida', m)
  where id = p_id;

  quando := case when p_data is null then 'data a combinar com o cliente' else to_char(p_data, 'DD/MM/YYYY HH24:MI') end;
  perform public._reg(p_id, 'Medição direcionada para ' || public._nome(p_medidor) || ' · ' || quando);
  titulo := case when p_data is null then '📐 Nova medida para você — combine a data'
                 when p_data::date = hoje then '🚨 URGENTE: medida HOJE às ' || to_char(p_data, 'HH24:MI')
                 else '📐 Nova medida para você' end;
  corpo := c.cliente || ' · ' || case when p_data is null then 'entre em contato com o cliente e combine a data' else to_char(p_data, 'DD/MM HH24:MI') end
    || coalesce(' · ' || nullif(coalesce(nullif(btrim(p_endereco), ''), c.endereco), ''), '');
  perform public._notificar(array[p_medidor], titulo, corpo, p_id,
    'medidadir:' || p_id || ':' || p_medidor || ':' || coalesce(to_char(p_data, 'YYYYMMDDHH24MI'), to_char(now(), 'YYYYMMDDHH24MI')));
end $$;
