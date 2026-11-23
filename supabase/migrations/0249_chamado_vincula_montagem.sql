-- Vincula a solicitação à montagem que gerou o problema: quem montou e quem agendou.
-- Antes disso o setor recebia "retorno do montador" / assistência / vistoria sem saber de quem cobrar.

create or replace function public._tipo_de_montagem(p text)
returns boolean language sql immutable set search_path to '' as $$
  select coalesce(p, '') in ('retorno_montador', 'assistencia', 'vistoria', 'montagem',
                             'horario_montagem', 'previsao_assistencia', 'desmontagem_estofado') $$;

-- A montagem que vale é a última JÁ FEITA. Uma montagem agendada para o futuro diz quem VAI
-- montar, não quem montou — e é disso que a reclamação trata.
create or replace function public._montagem_escolhida(p_cliente text)
returns jsonb language sql stable security definer set search_path to '' as $$
  select x from jsonb_array_elements(public.montagem_do_cliente(p_cliente, 30)) x
   where (x->>'feita')::boolean limit 1 $$;

-- BEFORE INSERT de propósito: mexe no NEW e não gera UPDATE, que acordaria os outros 20 gatilhos
-- da tabela chamados. E dentro de bloco de exceção: um enfeite informativo nunca pode impedir
-- o call center de abrir a solicitação.
create or replace function public._trg_chamado_montagem() returns trigger
language plpgsql security definer set search_path to '' as $$
declare m jsonb;
begin
  if not public._tipo_de_montagem(new.tipo) then return new; end if;
  begin
    m := public._montagem_escolhida(new.cliente);
  exception when others then
    return new;
  end;
  if m is null then return new; end if;
  new.tratativa := coalesce(new.tratativa, '{}'::jsonb)
    || jsonb_build_object('montagem', m || jsonb_build_object('de', 'auto', 'em', now()));
  return new;
end $$;

drop trigger if exists chamado_montagem on public.chamados;
create trigger chamado_montagem before insert on public.chamados
  for each row execute function public._trg_chamado_montagem();

-- Vincular/trocar à mão: quando o cruzamento por nome não achou, ou achou a O.S. errada.
create or replace function public.chamado_montagem_vincular(p_id text, p_os text default '')
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c public.chamados; m jsonb;
begin
  select * into c from public.chamados where id = p_id;
  if not found then raise exception 'Solicitação não encontrada'; end if;
  if not public.pode_ver_id(p_id) then raise exception 'Você não tem acesso a esta solicitação'; end if;
  if btrim(coalesce(p_os, '')) = '' then
    m := public._montagem_escolhida(c.cliente);
    if m is null then raise exception 'Não encontrei montagem feita para este cliente no histórico'; end if;
  else
    select x into m from jsonb_array_elements(public.montagem_do_cliente(c.cliente, 30)) x
     where x->>'os' = btrim(p_os) limit 1;
    if m is null then raise exception 'Essa O.S. não está no histórico deste cliente'; end if;
  end if;
  update public.chamados
     set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('montagem',
           m || jsonb_build_object('de', 'mao', 'por', public._nome(auth.uid()), 'em', now()))
   where id = p_id;
  perform public._reg(p_id, '🔧 Montagem vinculada: ' || coalesce(m->>'os', '—')
    || ' · montador ' || coalesce(nullif(m->>'montador', ''), '—')
    || ' · agendou ' || coalesce(nullif(m->>'operadora', ''), '—'));
  return m;
end $$;

revoke all on function public.chamado_montagem_vincular(text, text) from public, anon;
grant execute on function public.chamado_montagem_vincular(text, text) to authenticated;

-- Backfill do que já existe. Os gatilhos de aviso de chamado não presale só disparam em TRANSIÇÃO
-- de urgente / escalonado, e os de checklist e medidas filtram por tipo, então este update não
-- notifica ninguém. Rodado em lotes; resultado: 926 de 1.061 vinculados, 0 vinculáveis de fora.
do $$
declare n int;
begin
  perform set_config('alianca.sistema', '1', true);
  loop
    with alvo as (
      select c.id, public._montagem_escolhida(c.cliente) as m from public.chamados c
       where public._tipo_de_montagem(c.tipo) and not (coalesce(c.tratativa, '{}'::jsonb) ? 'montagem')
       limit 200)
    update public.chamados c set tratativa = coalesce(c.tratativa, '{}'::jsonb)
         || jsonb_build_object('montagem', a.m || jsonb_build_object('de', 'auto', 'em', now()))
      from alvo a where a.id = c.id and a.m is not null;
    get diagnostics n = row_count;
    exit when n = 0;
  end loop;
end $$;
