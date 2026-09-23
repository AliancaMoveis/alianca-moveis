-- Pós-venda Projetados: setor separado que recebe reclamações de clientes de projetos (montagem, avaria,
-- problemas do projeto) e dá suporte ao montador na obra. Registra o ocorrido, montador, responsável pelo
-- checklist, custo para a loja e desconto do montador — base dos números de qualidade do pós-venda.

insert into public.setores (id, nome, lib_criar, ordem)
values ('posvenda', 'Pós-venda Projetados', true, 7)
on conflict (id) do nothing;

insert into public.tipos (id, nome, setor_destino, anexos, presale, direto, ordem)
values ('posvenda', 'Pós-venda projetados (reclamação / ocorrência)', 'posvenda', true, false, false, 7)
on conflict (id) do nothing;

-- ---------- montadores (cadastro de apoio) ----------
create table if not exists public.montadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.montadores enable row level security;
create policy montadores_ler on public.montadores for select to authenticated using (public.usuario_ativo());
revoke insert, update, delete, truncate on public.montadores from anon, authenticated;
revoke all on public.montadores from anon;

-- quem cuida do cadastro de montadores: Fábricas (cadastros) e o próprio pós-venda
create or replace function public.pode_montadores() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.usuario_ativo() and (public.tem_lib('cadastros') or 'posvenda' = any(public.meus_setores()));
$$;

create or replace function public.salvar_montador(p_id uuid, p_nome text, p_telefone text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform public._eu();
  if not public.pode_montadores() then raise exception 'Sem acesso ao cadastro de montadores'; end if;
  if btrim(coalesce(p_nome,'')) = '' then raise exception 'Informe o nome do montador'; end if;
  if p_id is null then
    insert into public.montadores (nome, telefone) values (btrim(p_nome), btrim(coalesce(p_telefone,''))) returning id into v;
  else
    update public.montadores set nome = btrim(p_nome), telefone = btrim(coalesce(p_telefone,'')) where id = p_id returning id into v;
    if v is null then raise exception 'Montador não encontrado'; end if;
  end if;
  return v;
end $$;

-- não apaga: desativa (o histórico de ocorrências continua ligado ao montador)
create or replace function public.ativar_montador(p_id uuid, p_ativo boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._eu();
  if not public.pode_montadores() then raise exception 'Sem acesso ao cadastro de montadores'; end if;
  update public.montadores set ativo = p_ativo where id = p_id;
end $$;

-- ---------- registro do pós-venda (1 por atendimento) ----------
create table if not exists public.posvenda (
  chamado_id text primary key references public.chamados(id) on delete cascade,
  origem text not null default 'cliente' check (origem in ('cliente','montador')),
  categoria text not null default '' check (categoria in ('','montagem','avaria_montador','avaria_transporte','erro_projeto','medida','peca_fabrica','outro')),
  montador_id uuid references public.montadores(id),
  checklist_resp uuid references public.usuarios(id),
  erro_checklist boolean,                       -- null = não avaliado
  ocorrido text not null default '',
  solucao text not null default '',
  custo numeric(12,2) not null default 0 check (custo >= 0),
  custo_desc text not null default '',
  desconto_montador numeric(12,2) not null default 0 check (desconto_montador >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table public.posvenda enable row level security;
-- custos e descontos: só o próprio setor e a Gestão
create or replace function public.pode_ver_posvenda() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.usuario_ativo() and (public.eh_gestao() or 'posvenda' = any(public.meus_setores()));
$$;
create policy posvenda_ler on public.posvenda for select to authenticated
  using (public.pode_ver_posvenda() and public.pode_ver_id(chamado_id));
revoke insert, update, delete, truncate on public.posvenda from anon, authenticated;
revoke all on public.posvenda from anon;

create or replace function public.salvar_posvenda(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.chamados := public._chamado(p_id, true);
  v_mont uuid := nullif(p->>'montadorId','')::uuid;
  v_chk uuid := nullif(p->>'checklistResp','')::uuid;
  v_custo numeric := coalesce(nullif(p->>'custo','')::numeric, 0);
  v_desc numeric := coalesce(nullif(p->>'descontoMontador','')::numeric, 0);
  v_erro boolean := case p->>'erroChecklist' when 'sim' then true when 'nao' then false else null end;
  antes public.posvenda;
  txt text;
begin
  if c.tipo <> 'posvenda' then raise exception 'Registro disponível só para atendimentos de pós-venda'; end if;
  if v_mont is not null and not exists (select 1 from public.montadores where id = v_mont) then raise exception 'Montador inválido'; end if;
  if v_chk is not null and not exists (select 1 from public.usuario_setores where usuario_id = v_chk and setor_id = 'checklist') then
    raise exception 'Responsável pelo checklist inválido';
  end if;
  if v_custo < 0 or v_desc < 0 then raise exception 'Valores não podem ser negativos'; end if;
  if v_desc > 0 and v_mont is null then raise exception 'Informe o montador para registrar o desconto'; end if;
  select * into antes from public.posvenda where chamado_id = p_id;

  insert into public.posvenda as pv (chamado_id, origem, categoria, montador_id, checklist_resp, erro_checklist, ocorrido, solucao, custo, custo_desc, desconto_montador, atualizado_em, atualizado_por)
  values (p_id, coalesce(nullif(p->>'origem',''),'cliente'), coalesce(p->>'categoria',''), v_mont, v_chk, v_erro,
          btrim(coalesce(p->>'ocorrido','')), btrim(coalesce(p->>'solucao','')), v_custo, btrim(coalesce(p->>'custoDesc','')), v_desc, now(), auth.uid())
  on conflict (chamado_id) do update set origem = excluded.origem, categoria = excluded.categoria, montador_id = excluded.montador_id,
    checklist_resp = excluded.checklist_resp, erro_checklist = excluded.erro_checklist, ocorrido = excluded.ocorrido, solucao = excluded.solucao,
    custo = excluded.custo, custo_desc = excluded.custo_desc, desconto_montador = excluded.desconto_montador,
    atualizado_em = now(), atualizado_por = auth.uid();

  if c.status = 'aberta' then update public.chamados set status = 'tratativa' where id = p_id; end if;

  -- histórico sem valores (o histórico é visto por quem acompanha o chamado; valores só no registro)
  txt := 'Registro do pós-venda atualizado';
  if antes.chamado_id is null or antes.montador_id is distinct from v_mont then
    txt := txt || case when v_mont is not null then ' · montador ' || (select nome from public.montadores where id = v_mont) else '' end;
  end if;
  if antes.chamado_id is null or antes.checklist_resp is distinct from v_chk then
    txt := txt || case when v_chk is not null then ' · checklist de ' || public._nome(v_chk) else '' end;
  end if;
  if (antes.chamado_id is null and v_custo > 0) or (antes.chamado_id is not null and antes.custo is distinct from v_custo) then
    txt := txt || ' · custo para a loja ' || case when v_custo > 0 then 'registrado' else 'zerado' end;
  end if;
  if (antes.chamado_id is null and v_desc > 0) or (antes.chamado_id is not null and antes.desconto_montador is distinct from v_desc) then
    txt := txt || ' · desconto do montador ' || case when v_desc > 0 then 'registrado' else 'zerado' end;
  end if;
  perform public._reg(p_id, txt);
end $$;

-- pós-venda pede vistoria/assistência (ou outro setor) já com os dados do cliente e vinculado ao atendimento
create or replace function public.posvenda_encaminhar(p_id text, p_tipo text, p_motivo text) returns text
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, true); v text;
begin
  if c.tipo <> 'posvenda' then raise exception 'Ação disponível só para atendimentos de pós-venda'; end if;
  if p_tipo not in ('vistoria','assistencia','montagem','medidas','checklist','prazo_fabrica') then raise exception 'Motivo inválido'; end if;
  if btrim(coalesce(p_motivo,'')) = '' then raise exception 'Descreva o que precisa ser feito'; end if;
  v := public.criar_chamado(jsonb_build_object(
    'tipo', p_tipo, 'cliente', c.cliente, 'clienteDoc', c.cliente_doc, 'telefone', c.telefone, 'pedido', c.pedido,
    'dataVenda', c.data_venda, 'pedidoFabrica', c.pedido_fabrica, 'produto', c.produto, 'fabrica', c.fabrica_id,
    'prazoTatico', c.prazo_tatico, 'motivo', btrim(p_motivo), 'vinculadoA', c.id));
  perform public._reg(p_id, 'Encaminhado: ' || (select nome from public.tipos where id = p_tipo) || ' — atendimento ' || v);
  return v;
end $$;

-- o pós-venda pode abrir sem fábrica? não: projetos sempre têm fábrica/fornecedor; mantém a regra geral.

revoke execute on all functions in schema public from anon, public;
grant execute on function public.salvar_montador(uuid, text, text), public.ativar_montador(uuid, boolean),
  public.salvar_posvenda(text, jsonb), public.posvenda_encaminhar(text, text, text),
  public.pode_montadores(), public.pode_ver_posvenda() to authenticated;

-- usuária de teste: Vânia (Pós-venda Projetados). Senha de teste; trocar o e-mail pelo real em Administração.
do $$
declare vid uuid := '00000000-0000-4000-a000-000000000017';
begin
  if not exists (select 1 from auth.users where id = vid) then
    insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,email_change_token_current,recovery_token,phone_change,phone_change_token,reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000',vid,'authenticated','authenticated','vania@alianca360.teste',extensions.crypt('Alianca@2026',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','','','','');
    insert into auth.identities (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values (gen_random_uuid(),vid,vid,jsonb_build_object('sub',vid,'email','vania@alianca360.teste','email_verified',true),'email',now(),now(),now());
    insert into public.usuarios (id,nome,email,somente_atribuidos) values (vid,'Vânia','vania@alianca360.teste',false);
    insert into public.usuario_setores (usuario_id,setor_id,ordem) values (vid,'posvenda',1);
  end if;
end $$;

-- ordem nas listas: pós-venda logo depois de Medidas
update public.tipos set ordem = 8 where id = 'posvenda';
update public.setores set ordem = ordem + 1 where ordem >= 7 and id <> 'posvenda';
