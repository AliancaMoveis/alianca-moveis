-- Pós-venda Projetados: dois tipos de solicitação — do CLIENTE (relato como no call center; o call center também abre)
-- e do MONTADOR (montador, situação na obra, projetista que fez o checklist e o que o montador descreveu).
-- Cadastro de montadores ganha região preferencial e a conta para pagamento (base do futuro financeiro de montagem).

alter table public.posvenda
  add column if not exists situacao text not null default '',
  add column if not exists projetista_checklist text not null default '';
alter table public.posvenda add constraint posvenda_situacao_check
  check (situacao in ('', 'parado', 'peca_faltante', 'peca_defeito', 'medida', 'duvida_projeto', 'local', 'outro'));

alter table public.montadores add column if not exists regiao text not null default '';

-- conta para pagamento: dado sensível — só Pós-venda e Gestão leem/gravam (o cadastro básico continua visível a todos)
create table if not exists public.montadores_conta (
  montador_id uuid primary key references public.montadores(id),
  titular text not null default '',
  doc_titular text not null default '',
  banco text not null default '',
  agencia text not null default '',
  conta text not null default '',
  tipo_conta text not null default 'corrente' check (tipo_conta in ('corrente', 'poupanca', 'pagamento')),
  pix_tipo text not null default '' check (pix_tipo in ('', 'cpf', 'cnpj', 'telefone', 'email', 'aleatoria')),
  pix_chave text not null default '',
  obs text not null default '',
  atualizado_em timestamptz not null default now(),
  atualizado_por text not null default ''
);
alter table public.montadores_conta enable row level security;
create or replace function public.pode_conta_montador() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.usuario_ativo() and (public.eh_gestao() or 'posvenda' = any(public.meus_setores()));
$$;
create policy montadores_conta_ler on public.montadores_conta for select to authenticated using (public.pode_conta_montador());
revoke insert, update, truncate on public.montadores_conta from anon, authenticated;

-- salvar montador (nome, telefone, região) e, para quem pode, a conta de pagamento
create or replace function public.montador_salvar(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid := nullif(p->>'id', '')::uuid; c jsonb := p->'conta';
begin
  perform public._eu();
  if not public.pode_montadores() then raise exception 'Sem acesso ao cadastro de montadores'; end if;
  if btrim(coalesce(p->>'nome', '')) = '' then raise exception 'Informe o nome do montador'; end if;
  if v is null then
    insert into public.montadores (nome, telefone, regiao) values (btrim(p->>'nome'), btrim(coalesce(p->>'telefone', '')), btrim(coalesce(p->>'regiao', ''))) returning id into v;
  else
    update public.montadores set nome = btrim(p->>'nome'), telefone = btrim(coalesce(p->>'telefone', '')), regiao = btrim(coalesce(p->>'regiao', '')) where id = v;
    if not found then raise exception 'Montador não encontrado'; end if;
  end if;
  if jsonb_typeof(c) = 'object' then
    if not public.pode_conta_montador() then raise exception 'Só o Pós-venda e a Gestão alteram a conta de pagamento'; end if;
    if coalesce(c->>'tipoConta', 'corrente') not in ('corrente', 'poupanca', 'pagamento') then raise exception 'Tipo de conta inválido'; end if;
    if coalesce(c->>'pixTipo', '') not in ('', 'cpf', 'cnpj', 'telefone', 'email', 'aleatoria') then raise exception 'Tipo de chave Pix inválido'; end if;
    insert into public.montadores_conta as m (montador_id, titular, doc_titular, banco, agencia, conta, tipo_conta, pix_tipo, pix_chave, obs, atualizado_em, atualizado_por)
    values (v, btrim(coalesce(c->>'titular', '')), btrim(coalesce(c->>'docTitular', '')), btrim(coalesce(c->>'banco', '')), btrim(coalesce(c->>'agencia', '')),
            btrim(coalesce(c->>'conta', '')), coalesce(c->>'tipoConta', 'corrente'), coalesce(c->>'pixTipo', ''), btrim(coalesce(c->>'pixChave', '')), left(coalesce(c->>'obs', ''), 500), now(), public._nome(auth.uid()))
    on conflict (montador_id) do update set titular = excluded.titular, doc_titular = excluded.doc_titular, banco = excluded.banco, agencia = excluded.agencia,
      conta = excluded.conta, tipo_conta = excluded.tipo_conta, pix_tipo = excluded.pix_tipo, pix_chave = excluded.pix_chave, obs = excluded.obs,
      atualizado_em = now(), atualizado_por = excluded.atualizado_por;
  end if;
  return v;
end $$;
revoke all on function public.montador_salvar(jsonb) from public, anon;
grant execute on function public.montador_salvar(jsonb) to authenticated;

-- abertura: solicitação do cliente ou do montador
create or replace function public.posvenda_abertura(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false); v_mont uuid := nullif(p->>'montadorId','')::uuid;
        v_sit text := coalesce(p->>'situacao', ''); v_par boolean;
begin
  if c.tipo <> 'posvenda' then raise exception 'Disponível só para atendimentos de pós-venda'; end if;
  if not (public.pode_tratar_chamado(c) is true or (c.solicitante_id = auth.uid() and c.criado_em > now() - interval '30 minutes')) then
    raise exception 'Você não pode alterar este relato';
  end if;
  if coalesce(p->>'origem','') not in ('cliente','montador') then raise exception 'Informe se é solicitação do cliente ou do montador'; end if;
  if v_mont is not null and not exists (select 1 from public.montadores where id = v_mont) then raise exception 'Montador inválido'; end if;
  if p->>'origem' = 'montador' and v_mont is null then raise exception 'Informe qual montador pediu suporte'; end if;
  if v_sit not in ('', 'parado', 'peca_faltante', 'peca_defeito', 'medida', 'duvida_projeto', 'local', 'outro') then raise exception 'Situação inválida'; end if;
  if p->>'origem' = 'montador' and v_sit = '' then raise exception 'Informe a situação do montador na obra'; end if;
  if p->>'origem' <> 'montador' then v_sit := ''; end if;
  v_par := p->>'origem' = 'montador' and (coalesce((p->>'paradoObra')::boolean, false) or v_sit = 'parado');
  update public.posvenda set origem = p->>'origem', peca_afetada = btrim(coalesce(p->>'peca','')),
    montador_id = coalesce(v_mont, montador_id), parado_obra = v_par, situacao = v_sit,
    projetista_checklist = case when p->>'origem' = 'montador' then btrim(coalesce(p->>'projetista', '')) else projetista_checklist end,
    categoria = case when coalesce(p->>'categoria','') <> '' then p->>'categoria'
                     when v_sit in ('peca_faltante', 'peca_defeito', 'medida', 'duvida_projeto') then v_sit else categoria end
  where chamado_id = p_id;
  if v_par then
    perform public._notificar(public._usuarios_setor(array['posvenda']), '🚨 Montador parado na obra', c.cliente || ' · ' || left(c.motivo, 140), p_id, 'pvparado:' || p_id);
  end if;
end $$;

-- análise: projetista do checklist e situação também podem ser corrigidos depois
do $do$ declare d text; begin
  d := pg_get_functiondef('public.salvar_posvenda(text,jsonb)'::regprocedure);
  d := replace(d, $x$    parado_obra = case when p ? 'paradoObra'$x$, $x$    projetista_checklist = case when p ? 'projetistaChecklist' then btrim(coalesce(p->>'projetistaChecklist', '')) else projetista_checklist end,
    situacao = case when p ? 'situacao' and coalesce(p->>'situacao', '') in ('', 'parado', 'peca_faltante', 'peca_defeito', 'medida', 'duvida_projeto', 'local', 'outro') then coalesce(p->>'situacao', '') else situacao end,
    parado_obra = case when p ? 'paradoObra'$x$);
  d := replace(d, $x$  if v_med is not null and antes.medidor_resp is distinct from v_med$x$, $x$  if p ? 'projetistaChecklist' and coalesce(antes.projetista_checklist, '') is distinct from btrim(coalesce(p->>'projetistaChecklist', '')) then txt := txt || ' · projetista do checklist: ' || coalesce(nullif(btrim(p->>'projetistaChecklist'), ''), 'não informado'); end if;
  if v_med is not null and antes.medidor_resp is distinct from v_med$x$);
  if d not like '%projetista_checklist = case%' or d not like '%projetista do checklist:%' then raise exception 'anchor salvar_posvenda'; end if;
  execute d;
end $do$;

-- solicitação do montador: o montador nem sempre sabe o CPF do cliente nem o produto
do $do$ declare d text; begin
  d := pg_get_functiondef('public.criar_chamado(jsonb)'::regprocedure);
  d := replace(d, $x$if not t.rapido and btrim(coalesce(p->>'produto','')) = '' then$x$, $x$if not t.rapido and btrim(coalesce(p->>'produto','')) = '' and not (t.id = 'posvenda' and p->>'pvOrigem' = 'montador') then$x$);
  d := replace(d, $x$if btrim(coalesce(p->>'clienteDoc','')) = '' then raise exception 'Informe o CPF/CNPJ do cliente'; end if;$x$, $x$if btrim(coalesce(p->>'clienteDoc','')) = '' and not (t.id = 'posvenda' and p->>'pvOrigem' = 'montador') then raise exception 'Informe o CPF/CNPJ do cliente'; end if;$x$);
  if (length(d) - length(replace(d, $x$p->>'pvOrigem' = 'montador'$x$, ''))) / length($x$p->>'pvOrigem' = 'montador'$x$) <> 2 then raise exception 'anchor criar_chamado'; end if;
  execute d;
end $do$;

-- solicitação do montador: o montador nem sempre tem o telefone do cliente (o gatilho de telefone libera só esse caso)
do $do$ declare d text; begin
  d := pg_get_functiondef('public.criar_chamado(jsonb)'::regprocedure);
  if d like '%alianca.pv_montador%' then return; end if;
  d := regexp_replace(d, '(\n\s*)insert into public\.chamados \(', '\1if t.id = ''posvenda'' and coalesce(p->>''pvOrigem'', '''') = ''montador'' then perform set_config(''alianca.pv_montador'', ''1'', true); end if;\1insert into public.chamados (');
  d := regexp_replace(d, 'returning id into v_id;', 'returning id into v_id;
  perform set_config(''alianca.pv_montador'', ''0'', true);');
  d := replace(d, $x$not (t.id = 'posvenda' and p->>'pvOrigem' = 'montador')$x$, $x$not (t.id = 'posvenda' and coalesce(p->>'pvOrigem', '') = 'montador')$x$);
  execute d;
end $do$;
create or replace function public._trg_exige_telefone() returns trigger
language plpgsql security definer set search_path = '' as $function$
begin
  if auth.uid() is null or current_setting('alianca.sistema', true) = '1' then return new; end if;
  if tg_op = 'INSERT' and new.tipo = 'posvenda' and current_setting('alianca.pv_montador', true) = '1' then return new; end if;
  if (tg_op = 'INSERT' or new.telefone is distinct from old.telefone)
     and length(regexp_replace(coalesce(new.telefone, ''), '\D', '', 'g')) < 10 then
    raise exception 'Informe o telefone do cliente com DDD';
  end if;
  return new;
end $function$;
