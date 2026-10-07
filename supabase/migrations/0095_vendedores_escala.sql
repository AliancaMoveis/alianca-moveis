-- Vendedores: quem faz projeto (projetista) x só vendedor, dia de folga e turno de trabalho.
-- turno 'manha' (fundo branco na escala): entra 9:00, almoço 11:00–13:00
-- turno 'tarde' (fundo cinza na escala): entra 10:40, almoço 13:30–15:30
-- folga: 0=domingo, 1=segunda … 6=sábado
alter table public.usuarios add column if not exists faz_projeto boolean not null default true;
alter table public.usuarios add column if not exists folga smallint check (folga between 0 and 6);
alter table public.usuarios add column if not exists turno text check (turno in ('manha','tarde'));

-- Gestão / Supervisão de marketing / Suporte a consultores ajustam a escala
create or replace function public.vendedor_escala(p_id uuid, p_faz_projeto boolean, p_folga smallint, p_turno text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not (public.eh_gestao() or exists (select 1 from public.usuario_setores s where s.usuario_id = auth.uid() and s.setor_id in ('marketing_supervisao','suporte_consultores'))) then
    raise exception 'Sem permissão para alterar a escala dos vendedores';
  end if;
  if p_turno is not null and p_turno not in ('manha','tarde','') then raise exception 'Turno inválido'; end if;
  update public.usuarios set faz_projeto = coalesce(p_faz_projeto, true), folga = p_folga, turno = nullif(p_turno, '') where id = p_id;
end $$;
revoke execute on function public.vendedor_escala(uuid, boolean, smallint, text) from public, anon;
grant execute on function public.vendedor_escala(uuid, boolean, smallint, text) to authenticated;

-- Registro no histórico quando alguém indica vendedor mesmo indisponível
create or replace function public.vendedor_indisponivel_ciente(p_id text, p_vend uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare c public.chamados := public._chamado(p_id, false);
begin
  perform public._reg(p_id, '⚠️ Vendedor indicado fora da disponibilidade: ' || public._nome(p_vend) || ' — ' || left(coalesce(p_motivo, ''), 300));
end $$;
revoke execute on function public.vendedor_indisponivel_ciente(text, uuid, text) from public, anon;
grant execute on function public.vendedor_indisponivel_ciente(text, uuid, text) to authenticated;
