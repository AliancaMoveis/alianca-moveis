-- 0184 Agenda da loja: mostrar os reagendamentos (de qual data/hora para qual).
-- Lê o histórico já gravado por reagendar_loja ("Reagendamento da vinda à loja: DD/MM/AAAA, HH:MI → DD/MM/AAAA, HH:MI (por …)"),
-- então vale também para os reagendamentos antigos. Duas situações no dia pedido:
--   'chegou' = o cliente está neste dia e veio de outra data (mostra "era dd/mm hh:mm")
--   'saiu'   = o cliente estava neste dia e foi reagendado para outra data (mostra "agora dd/mm hh:mm")
create or replace function public._agenda_reag(p_dia date)
returns table(id text, tipo text, cliente text, hora text, de timestamp, para timestamp, quando timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
  with mov as (
    select h.chamado_id, h.quando,
           to_timestamp(substring(h.texto from 'loja: (\d\d/\d\d/\d{4}, \d\d:\d\d)'), 'DD/MM/YYYY, HH24:MI')::timestamp as de,
           to_timestamp(substring(h.texto from '→ (\d\d/\d\d/\d{4}, \d\d:\d\d)'), 'DD/MM/YYYY, HH24:MI')::timestamp as para
    from public.historico h
    where h.texto like 'Reagendamento da vinda à loja:%' and h.quando > now() - interval '60 days'
  ), ult as (
    select distinct on (m.chamado_id) m.* from mov m where m.de is not null and m.para is not null order by m.chamado_id, m.quando desc
  )
  -- chegou: a última mudança deixou o cliente neste dia
  select c.id, 'chegou'::text, c.cliente, to_char(c.data_loja, 'HH24:MI'), u.de, c.data_loja::timestamp, u.quando
    from ult u join public.chamados c on c.id = u.chamado_id
    where c.data_loja is not null and c.data_loja::date = p_dia and u.de::date <> p_dia
  union all
  -- saiu: o cliente estava neste dia e hoje está em outra data
  select c.id, 'saiu'::text, c.cliente, to_char(m.de, 'HH24:MI'), m.de, c.data_loja::timestamp, m.quando
    from mov m join public.chamados c on c.id = m.chamado_id
    where m.de is not null and m.de::date = p_dia and c.data_loja is not null and c.data_loja::date <> p_dia
      and m.quando = (select max(m2.quando) from mov m2 where m2.chamado_id = m.chamado_id and m2.de::date = p_dia)
  order by 5;
end $$;
revoke execute on function public._agenda_reag(date) from public, anon, authenticated;

-- tela aberta da loja (link secreto, sem login)
create or replace function public.agenda_publica_reag(p_token text, p_dia date)
returns table(id text, tipo text, cliente text, hora text, de timestamp, para timestamp, quando timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_token is null or length(p_token) < 40 or not exists (select 1 from public.agenda_publica a where a.id = 1 and a.ativo and a.token = p_token) then
    raise exception 'Link inválido ou desligado';
  end if;
  if p_dia is null or p_dia < hoje - 1 or p_dia > hoje + 7 then raise exception 'Dia fora do período da agenda'; end if;
  return query select * from public._agenda_reag(p_dia);
end $$;
revoke execute on function public.agenda_publica_reag(text, date) from public;
grant execute on function public.agenda_publica_reag(text, date) to anon, authenticated;

-- agenda logada (quem está no sistema)
create or replace function public.agenda_loja_reag(p_dia date)
returns table(id text, tipo text, cliente text, hora text, de timestamp, para timestamp, quando timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._eu();
  return query select * from public._agenda_reag(p_dia);
end $$;
revoke execute on function public.agenda_loja_reag(date) from public, anon;
grant execute on function public.agenda_loja_reag(date) to authenticated;
