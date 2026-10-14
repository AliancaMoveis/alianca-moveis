-- 0129 · Férias do vendedor (período de/até): gerentes de loja, Gestão, Supervisão de marketing e Suporte a consultores marcam.
-- Em férias o vendedor aparece como indisponível (não entra no "chamar todos", aviso ao designar); chamar individual continua possível (freelance).
alter table public.usuarios add column if not exists ferias_de date, add column if not exists ferias_ate date;

create or replace function public.vendedor_ferias(p_id uuid, p_de date, p_ate date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.eh_gestao() or exists (select 1 from public.usuario_setores s where s.usuario_id = auth.uid() and s.setor_id in ('marketing_supervisao','suporte_consultores','gerente_loja'))) then
    raise exception 'Sem permissão para marcar férias';
  end if;
  if not exists (select 1 from public.usuario_setores s where s.usuario_id = p_id and s.setor_id = 'atendente_cliente') then raise exception 'Escolha um vendedor'; end if;
  if p_ate is null then
    update public.usuarios set ferias_de = null, ferias_ate = null where id = p_id;
  else
    if p_de is null then p_de := (now() at time zone 'America/Sao_Paulo')::date; end if;
    if p_ate < p_de then raise exception 'A volta das férias precisa ser depois do início'; end if;
    update public.usuarios set ferias_de = p_de, ferias_ate = p_ate where id = p_id;
  end if;
end $$;
revoke all on function public.vendedor_ferias(uuid, date, date) from public, anon;
grant execute on function public.vendedor_ferias(uuid, date, date) to authenticated;

DO $$
declare d text; a text := '    when u.folga is not null and extract(dow from a.t)::int = u.folga then ''folga''';
begin
  d := pg_get_functiondef('public._vend_motivo_indisp'::regproc);
  if position(a in d) = 0 then raise exception 'âncora não encontrada'; end if;
  d := replace(d, a, '    when u.ferias_ate is not null and a.t::date between coalesce(u.ferias_de, a.t::date) and u.ferias_ate then ''férias até '' || to_char(u.ferias_ate, ''DD/MM'')
' || a);
  execute d;
end $$;

-- férias atuais
update public.usuarios u set ferias_de = '2026-10-14', ferias_ate = '2026-10-31'
 where u.nome in ('Eduardo','Evaristo','Thalena') and exists (select 1 from public.usuario_setores s where s.usuario_id = u.id and s.setor_id = 'atendente_cliente');
