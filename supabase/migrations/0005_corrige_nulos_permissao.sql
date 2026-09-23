-- Correção: comparações com NULL (ex.: consultor_id vazio) não podem "passar" num IF.
-- As funções de permissão passam a devolver sempre true/false.

create or replace function public.pode_ver_chamado(c public.chamados) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ms text[];
begin
  if uid is null or not public.usuario_ativo() then return false; end if;
  if public.somente_atribuidos() then
    return coalesce(c.consultor_id = uid, false) or coalesce(c.atendente_id = uid, false)
      or exists (select 1 from public.transferencias t
                 where t.chamado_id = c.id and t.status = 'pendente' and t.para_usuario = uid);
  end if;
  if public.eh_gestao() then return true; end if;
  ms := public.meus_setores();
  if public.tipo_presale(c.tipo) then
    return public.tem_lib('verMarketing') or 'suporte_consultores' = any(ms)
      or coalesce(c.setor_destino = any(ms), false) or coalesce(c.solicitante_id = uid, false);
  end if;
  if public.tem_lib('verTudo') then return true; end if;
  return coalesce(c.setor_destino = any(ms), false) or coalesce(c.solicitante_id = uid, false);
end $$;

create or replace function public.pode_tratar_chamado(c public.chamados) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ms text[];
begin
  if uid is null or not public.usuario_ativo() then return false; end if;
  if public.somente_atribuidos() then
    return coalesce(c.consultor_id = uid, false) or coalesce(c.atendente_id = uid, false)
      or exists (select 1 from public.transferencias t
                 where t.chamado_id = c.id and t.status = 'pendente' and t.para_usuario = uid);
  end if;
  if public.eh_gestao() then return true; end if;
  ms := public.meus_setores();
  if public.tipo_presale(c.tipo) then
    return public.tem_lib('verMarketing') or 'suporte_consultores' = any(ms) or coalesce(c.setor_destino = any(ms), false);
  end if;
  if public.tem_lib('verTudo') then return true; end if;
  return coalesce(c.setor_destino = any(ms), false);
end $$;

create or replace function public.pode_anexar_chamado(c public.chamados) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare ms text[];
begin
  if not public.usuario_ativo() then return false; end if;
  if public.eh_gestao() then return true; end if;
  ms := public.meus_setores();
  if public.tipo_presale(c.tipo) then
    if 'atendente_cliente' = any(ms) and not (ms && array['marketing_supervisao','suporte_consultores']) then
      return false;
    end if;
    return coalesce(public.pode_tratar_chamado(c), false);
  end if;
  return coalesce(public.pode_tratar_chamado(c), false) or public.tem_lib('criar');
end $$;

create or replace function public._chamado(p_id text, p_tratar boolean default false) returns public.chamados
language plpgsql security definer set search_path = '' as $$
declare c public.chamados;
begin
  perform public._eu();
  select * into c from public.chamados where id = p_id for update;
  if not found or public.pode_ver_chamado(c) is not true then
    raise exception 'Chamado não encontrado';
  end if;
  if p_tratar and public.pode_tratar_chamado(c) is not true then
    raise exception 'Você tem acesso de leitura a este chamado. Quem trata é o setor %', public._setor_nome(c.setor_destino);
  end if;
  return c;
end $$;
revoke execute on function public._chamado(text, boolean) from authenticated, public, anon;

create or replace function public.pode_ver_id(p_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.pode_ver_chamado(c) from public.chamados c where c.id = p_id), false) is true;
$$;

create or replace function public.pode_anexar_id(p_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.pode_anexar_chamado(c)
        or (coalesce(c.solicitante_id = auth.uid(), false) and c.criado_em > now() - interval '30 minutes' and public.usuario_ativo())
    from public.chamados c where c.id = p_id), false) is true;
$$;

create or replace function public.pode_ver_valor_id(p_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.usuario_ativo() and public.pode_ver_id(p_id) and (
    public.eh_gestao() or public.tem_lib('verMarketing')
    or exists (select 1 from public.chamados c where c.id = p_id
               and (c.atendente_id = auth.uid() or c.consultor_id = auth.uid())))) is true;
$$;
