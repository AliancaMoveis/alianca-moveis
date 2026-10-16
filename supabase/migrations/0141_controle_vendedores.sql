-- 0141 · Controle dos vendedores (gerentes): domingos de folga (trabalha 2, folga 1), trocas de folga por dia,
-- fim de semana 9:00–18:00 com 1h de almoço livre, "fora da agenda" (Ana Maria) e ajustes de cadastro.

alter table public.usuarios add column if not exists domingo_ref date;          -- um domingo em que o vendedor folga (os próximos: a cada 3 domingos)
alter table public.usuarios add column if not exists na_agenda boolean default true; -- false = não entra para definir vendedor / fila

create table if not exists public.vendedor_dias (
  usuario_id uuid not null,
  dia date not null,
  tipo text not null check (tipo in ('folga','trabalha')),
  obs text not null default '',
  por text not null default '',
  em timestamptz not null default now(),
  primary key (usuario_id, dia)
);
alter table public.vendedor_dias enable row level security;
drop policy if exists vendedor_dias_ler on public.vendedor_dias;
create policy vendedor_dias_ler on public.vendedor_dias for select using ((select public.usuario_ativo()));

-- quem controla a escala dos vendedores
CREATE OR REPLACE FUNCTION public._gere_vendedores()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ select public.usuario_ativo() and (public.eh_gestao() or public.meus_setores() && array['gerente_loja','marketing_supervisao','suporte_consultores']) $$;

-- folga no dia? exceção do dia > domingo do rodízio > folga da semana (só na semana em que trabalhou o domingo)
CREATE OR REPLACE FUNCTION public._vend_folga_em(p uuid, d date)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
declare u public.usuarios; ex text; dom date; folgaDom boolean;
begin
  select * into u from public.usuarios where id = p;
  if not found then return false; end if;
  select tipo into ex from public.vendedor_dias where usuario_id = p and dia = d;
  if ex is not null then return ex = 'folga'; end if;
  if extract(dow from d)::int = 0 then
    return u.domingo_ref is not null and ((d - u.domingo_ref) % 21 + 21) % 21 = 0;
  end if;
  if u.folga is null or extract(dow from d)::int <> u.folga then return false; end if;
  -- semana de segunda a domingo: se folga no domingo dessa semana, trabalha a semana toda
  if u.domingo_ref is null then return true; end if;
  dom := d + (7 - extract(dow from d)::int);
  select tipo = 'folga' into folgaDom from public.vendedor_dias where usuario_id = p and dia = dom;
  if folgaDom is null then folgaDom := ((dom - u.domingo_ref) % 21 + 21) % 21 = 0; end if;
  return not folgaDom;
end $$;

-- disponível agora? (sábado e domingo: todos 9:00–18:00, almoço de 1h livre)
CREATE OR REPLACE FUNCTION public._vend_motivo_indisp(p uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  with a as (select (now() at time zone 'America/Sao_Paulo') t)
  select case
    when not public._eh_projetista_valido(p) then 'inativo'
    when u.ferias_ate is not null and a.t::date between coalesce(u.ferias_de, a.t::date) and u.ferias_ate then 'férias até ' || to_char(u.ferias_ate, 'DD/MM')
    when public._vend_folga_em(p, a.t::date) then 'folga'
    when extract(dow from a.t)::int in (0,6) and (extract(hour from a.t) * 60 + extract(minute from a.t)) < 540 then 'ainda não entrou'
    when extract(dow from a.t)::int in (0,6) and (extract(hour from a.t) * 60 + extract(minute from a.t)) >= 1080 then 'já saiu'
    when extract(dow from a.t)::int in (0,6) then ''
    when u.turno = 'manha' and (extract(hour from a.t) * 60 + extract(minute from a.t)) < 540 then 'ainda não entrou'
    when u.turno = 'manha' and (extract(hour from a.t) * 60 + extract(minute from a.t)) >= 660 and (extract(hour from a.t) * 60 + extract(minute from a.t)) < 780 then 'almoço'
    when u.turno = 'tarde' and (extract(hour from a.t) * 60 + extract(minute from a.t)) < 640 then 'ainda não entrou'
    when u.turno = 'tarde' and (extract(hour from a.t) * 60 + extract(minute from a.t)) >= 810 and (extract(hour from a.t) * 60 + extract(minute from a.t)) < 930 then 'almoço'
    else '' end
  from public.usuarios u, a where u.id = p;
$$;

-- cadastro da escala: agora também os gerentes, com domingo de folga e "na agenda"
DROP FUNCTION IF EXISTS public.vendedor_escala_v2(uuid, boolean, integer, text, date, boolean);
CREATE OR REPLACE FUNCTION public.vendedor_escala_v2(p_id uuid, p_faz_projeto boolean, p_folga integer, p_turno text, p_domingo date, p_na_agenda boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
begin
  if not public._gere_vendedores() then raise exception 'Sem permissão para alterar a escala dos vendedores'; end if;
  if not exists (select 1 from public.usuario_setores where usuario_id = p_id and setor_id = 'atendente_cliente') then raise exception 'Não é vendedor'; end if;
  if p_turno is not null and p_turno not in ('manha','tarde','') then raise exception 'Turno inválido'; end if;
  if p_folga is not null and (p_folga < 1 or p_folga > 6) then raise exception 'Folga da semana: de segunda a sábado'; end if;
  if p_domingo is not null and extract(dow from p_domingo)::int <> 0 then raise exception 'Escolha um domingo'; end if;
  update public.usuarios set faz_projeto = coalesce(p_faz_projeto, true), folga = p_folga, turno = nullif(p_turno, ''),
    domingo_ref = p_domingo, na_agenda = coalesce(p_na_agenda, true) where id = p_id;
end $$;
GRANT EXECUTE ON FUNCTION public.vendedor_escala_v2(uuid, boolean, integer, text, date, boolean) TO authenticated;

-- troca de folga num dia ('folga' | 'trabalha' | '' = volta à escala)
CREATE OR REPLACE FUNCTION public.vendedor_dia(p_id uuid, p_dia date, p_tipo text, p_obs text DEFAULT '')
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
begin
  if not public._gere_vendedores() then raise exception 'Sem permissão para alterar a escala dos vendedores'; end if;
  if p_dia is null then raise exception 'Informe o dia'; end if;
  if coalesce(p_tipo,'') = '' then delete from public.vendedor_dias where usuario_id = p_id and dia = p_dia; return; end if;
  if p_tipo not in ('folga','trabalha') then raise exception 'Tipo inválido'; end if;
  insert into public.vendedor_dias(usuario_id, dia, tipo, obs, por) values (p_id, p_dia, p_tipo, coalesce(p_obs,''), public._nome(auth.uid()))
  on conflict (usuario_id, dia) do update set tipo = excluded.tipo, obs = excluded.obs, por = excluded.por, em = now();
end $$;
GRANT EXECUTE ON FUNCTION public.vendedor_dia(uuid, date, text, text) TO authenticated;

-- férias: vendedor_ferias já aceita gerentes (0129)

-- cadastros pedidos pelo Bruno
update public.usuarios set na_agenda = false where email = 'ana.maria@alianca360.com.br';      -- freelance: não entra na agenda
update public.usuarios set faz_projeto = false where email = 'rauanna@alianca360.com.br';      -- linha de não projetos
update public.usuarios set faz_projeto = true where email = 'allan.rodrigo@alianca360.com.br'; -- faz projetos
update public.usuarios set nome = 'Juliana Menegollo' where email = 'juliana@alianca360.com.br'; -- a Juliana Cabral é a do checklist
