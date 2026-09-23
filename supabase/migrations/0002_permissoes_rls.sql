-- ALIANÇA 360 — funções de permissão (espelham podeVer/podeTratar/podeAnexar do protótipo) e RLS de leitura.
-- Regra de ouro: a UI pode facilitar, mas o banco proíbe. Ninguém grava direto nas tabelas:
-- toda escrita passa pelas funções em 0003_acoes.sql, que conferem a permissão.

-- ---------- contexto do usuário logado ----------
create or replace function public.usuario_ativo() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select ativo from public.usuarios where id = auth.uid()), false);
$$;

create or replace function public.meus_setores() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(us.setor_id order by us.ordem), '{}'::text[])
  from public.usuario_setores us
  join public.usuarios u on u.id = us.usuario_id
  where us.usuario_id = auth.uid() and u.ativo;
$$;

create or replace function public.tem_lib(k text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.usuario_setores us
    join public.setores s on s.id = us.setor_id
    join public.usuarios u on u.id = us.usuario_id
    where us.usuario_id = auth.uid() and u.ativo
      and case k
        when 'criar' then s.lib_criar
        when 'verTudo' then s.lib_ver_tudo
        when 'cadastros' then s.lib_cadastros
        when 'admin' then s.lib_admin
        when 'verMarketing' then s.lib_ver_marketing
        else false end
  );
$$;

create or replace function public.eh_gestao() returns boolean
language sql stable security definer set search_path = '' as $$ select public.tem_lib('admin'); $$;

create or replace function public.somente_atribuidos() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select somente_atribuidos from public.usuarios where id = auth.uid()), false);
$$;

-- setores do funil de marketing (MARKETING_SETORES no protótipo)
create or replace function public.setores_marketing() returns text[]
language sql immutable set search_path = '' as $$
  select array['marketing_operadora','marketing_supervisao','consultor_externo','suporte_consultores','atendente_cliente']::text[];
$$;

create or replace function public.tipo_presale(p_tipo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select presale from public.tipos where id = p_tipo), false);
$$;

create or replace function public.pode_editar_agenda() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_gestao() or public.tem_lib('verMarketing') or 'suporte_consultores' = any(public.meus_setores());
$$;

-- ---------- podeVer ----------
create or replace function public.pode_ver_chamado(c public.chamados) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ms text[];
begin
  if uid is null or not public.usuario_ativo() then return false; end if;
  if public.somente_atribuidos() then
    return c.consultor_id = uid or c.atendente_id = uid
      or exists (select 1 from public.transferencias t
                 where t.chamado_id = c.id and t.status = 'pendente' and t.para_usuario = uid);
  end if;
  if public.eh_gestao() then return true; end if;
  ms := public.meus_setores();
  if public.tipo_presale(c.tipo) then
    return public.tem_lib('verMarketing') or 'suporte_consultores' = any(ms)
      or c.setor_destino = any(ms) or c.solicitante_id = uid;
  end if;
  if public.tem_lib('verTudo') then return true; end if;
  return c.setor_destino = any(ms) or c.solicitante_id = uid;
end $$;

create or replace function public.pode_ver_id(p_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.pode_ver_chamado(c) from public.chamados c where c.id = p_id), false);
$$;

-- ---------- podeTratar ----------
create or replace function public.pode_tratar_chamado(c public.chamados) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ms text[];
begin
  if uid is null or not public.usuario_ativo() then return false; end if;
  if public.somente_atribuidos() then
    return c.consultor_id = uid or c.atendente_id = uid
      or exists (select 1 from public.transferencias t
                 where t.chamado_id = c.id and t.status = 'pendente' and t.para_usuario = uid);
  end if;
  if public.eh_gestao() then return true; end if;
  ms := public.meus_setores();
  if public.tipo_presale(c.tipo) then
    return public.tem_lib('verMarketing') or 'suporte_consultores' = any(ms) or c.setor_destino = any(ms);
  end if;
  if public.tem_lib('verTudo') then return true; end if;
  return c.setor_destino = any(ms);
end $$;

-- ---------- podeAnexar ----------
create or replace function public.pode_anexar_chamado(c public.chamados) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare ms text[];
begin
  if not public.usuario_ativo() then return false; end if;
  if public.eh_gestao() then return true; end if;
  ms := public.meus_setores();
  if public.tipo_presale(c.tipo) then
    -- o vendedor/projetista da loja vê as fotos do consultor, mas não anexa
    if 'atendente_cliente' = any(ms) and not (ms && array['marketing_supervisao','suporte_consultores']) then
      return false;
    end if;
    return public.pode_tratar_chamado(c);
  end if;
  return public.pode_tratar_chamado(c) or public.tem_lib('criar');
end $$;

-- anexos no momento da abertura (o protótipo aceita anexos no formulário "Nova solicitação/Novo cliente")
create or replace function public.pode_anexar_id(p_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.pode_anexar_chamado(c)
        or (c.solicitante_id = auth.uid() and c.criado_em > now() - interval '30 minutes' and public.usuario_ativo())
    from public.chamados c where c.id = p_id), false);
$$;

-- ---------- podeVerValor ----------
create or replace function public.pode_ver_valor_id(p_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.usuario_ativo() and public.pode_ver_id(p_id) and (
    public.eh_gestao() or public.tem_lib('verMarketing')
    or exists (select 1 from public.chamados c where c.id = p_id
               and (c.atendente_id = auth.uid() or c.consultor_id = auth.uid())));
$$;

-- ---------- podeCriarTipo ----------
create or replace function public.pode_criar_tipo(p_tipo text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare ms text[]; t public.tipos;
begin
  select * into t from public.tipos where id = p_tipo;
  if not found then return false; end if;
  if not public.tem_lib('criar') then return false; end if;
  if public.eh_gestao() then return true; end if;
  ms := public.meus_setores();
  if t.presale then
    return ms && array['marketing_operadora','marketing_supervisao'];
  end if;
  return exists (select 1 from unnest(ms) s where not (s = any(public.setores_marketing())));
end $$;

-- ---------- RLS ----------
alter table public.setores enable row level security;
alter table public.tipos enable row level security;
alter table public.usuarios enable row level security;
alter table public.usuario_setores enable row level security;
alter table public.representantes enable row level security;
alter table public.fabricas enable row level security;
alter table public.config enable row level security;
alter table public.chamados enable row level security;
alter table public.vendas enable row level security;
alter table public.vendas_valores enable row level security;
alter table public.transferencias enable row level security;
alter table public.historico enable row level security;
alter table public.anexos enable row level security;

-- cadastros de apoio: leitura para qualquer usuário ativo
create policy setores_ler on public.setores for select to authenticated using (public.usuario_ativo());
create policy tipos_ler on public.tipos for select to authenticated using (public.usuario_ativo());
create policy usuarios_ler on public.usuarios for select to authenticated using (public.usuario_ativo() or id = auth.uid());
create policy usuario_setores_ler on public.usuario_setores for select to authenticated using (public.usuario_ativo());
create policy representantes_ler on public.representantes for select to authenticated using (public.usuario_ativo());
create policy fabricas_ler on public.fabricas for select to authenticated using (public.usuario_ativo());
create policy config_ler on public.config for select to authenticated using (public.usuario_ativo());

-- dados de atendimento: só o que o papel enxerga
create policy chamados_ler on public.chamados for select to authenticated using (public.pode_ver_chamado(chamados));
create policy vendas_ler on public.vendas for select to authenticated using (public.pode_ver_id(chamado_id));
create policy vendas_valores_ler on public.vendas_valores for select to authenticated using (public.pode_ver_valor_id(chamado_id));
create policy transferencias_ler on public.transferencias for select to authenticated using (public.pode_ver_id(chamado_id));
create policy historico_ler on public.historico for select to authenticated using (public.pode_ver_id(chamado_id));
create policy anexos_ler on public.anexos for select to authenticated using (public.pode_ver_id(chamado_id));

-- nenhuma política de insert/update/delete: gravação só pelas funções de ação.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;
