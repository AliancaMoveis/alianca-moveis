-- SETOR DE MEDIDAS — processo: VENDA → MEDIDAS → CHECKLIST
--  · Venda confirmada pela Gestão (efetivada ou promissória) cria sozinha a "Solicitação de medidas" na fila da
--    Supervisão de Medidas (Lucilene). Também pode ser aberta manualmente, como antes.
--  · A supervisora: (a) valida as medidas que o consultor já trouxe na visita → libera direto para o Checklist; ou
--    (b) direciona a medição para um medidor (Cesar, Gilberto) ou para um consultor externo, com data/hora e endereço.
--  · Quem mede marca "Medida realizada" (com anexo obrigatório) → volta para a supervisora validar → libera p/ Checklist
--    (ou pede para refazer).
--  · Medida realizada paga R$ 40 (config.pagamento_visita) para quem mediu — consultor ou medidor. Medida NÃO paga comissão.
--  · Reembolso (pedágio, estacionamento, combustível…): consultor/medidor pede com comprovante; a Gestão aprova.
-- Etapa fica em chamados.tratativa->'medida'->>'etapa': validar | agendada | realizada | liberada

alter table public.chamados add column if not exists medidor_id uuid references public.usuarios(id);
alter table public.chamados add column if not exists data_medida timestamp;
update public.tipos set anexos = true where id = 'medidas';

insert into public.setores (id, nome, lib_criar, lib_ver_tudo, lib_cadastros, lib_admin, lib_ver_marketing, ordem, via_callcenter)
values ('medidas_supervisao', 'Supervisão de Medidas', true, false, false, false, false, 6, false)
on conflict (id) do nothing;
insert into public.usuario_setores (usuario_id, setor_id, ordem)
select u.id, 'medidas_supervisao', 0 from public.usuarios u where u.nome = 'Lucilene'
on conflict do nothing;
-- medidores só enxergam as medidas direcionadas a eles
update public.usuarios set somente_atribuidos = true where nome in ('Cesar', 'Gilberto');

-- quem mede (medidor_id) passa a ver e tratar a medida
create or replace function public.pode_ver_chamado(c public.chamados) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); ms text[];
begin
  if uid is null or not public.usuario_ativo() then return false; end if;
  if public.somente_atribuidos() then
    return coalesce(c.consultor_id = uid, false) or coalesce(c.atendente_id = uid, false) or coalesce(c.medidor_id = uid, false)
      or exists (select 1 from public.transferencias t where t.chamado_id = c.id and t.status = 'pendente' and t.para_usuario = uid);
  end if;
  if public.eh_gestao() then return true; end if;
  ms := public.meus_setores();
  if public.tipo_presale(c.tipo) then
    return public.tem_lib('verMarketing') or 'suporte_consultores' = any(ms)
      or coalesce(c.setor_destino = any(ms), false) or coalesce(c.solicitante_id = uid, false);
  end if;
  if public.tem_lib('verTudo') then return true; end if;
  if 'callcenter' = any(ms) then return true; end if;
  return coalesce(c.setor_destino = any(ms), false) or coalesce(c.solicitante_id = uid, false) or coalesce(c.medidor_id = uid, false);
end $$;

create or replace function public.pode_tratar_chamado(c public.chamados) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); ms text[];
begin
  if uid is null or not public.usuario_ativo() then return false; end if;
  if public.somente_atribuidos() then
    return coalesce(c.consultor_id = uid, false) or coalesce(c.atendente_id = uid, false) or coalesce(c.medidor_id = uid, false)
      or exists (select 1 from public.transferencias t where t.chamado_id = c.id and t.status = 'pendente' and t.para_usuario = uid);
  end if;
  if public.eh_gestao() then return true; end if;
  ms := public.meus_setores();
  if public.tipo_presale(c.tipo) then
    return public.tem_lib('verMarketing') or 'suporte_consultores' = any(ms) or coalesce(c.setor_destino = any(ms), false);
  end if;
  if public.tem_lib('verTudo') then return true; end if;
  return coalesce(c.setor_destino = any(ms), false) or coalesce(c.medidor_id = uid, false);
end $$;

-- criações automáticas do sistema não esbarram na exigência de telefone
create or replace function public._trg_exige_telefone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or current_setting('alianca.sistema', true) = '1' then return new; end if;
  if (tg_op = 'INSERT' or new.telefone is distinct from old.telefone)
     and length(regexp_replace(coalesce(new.telefone, ''), '\D', '', 'g')) < 10 then
    raise exception 'Informe o telefone do cliente com DDD';
  end if;
  return new;
end $$;

create or replace function public.eh_sup_medidas() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.usuario_ativo() and (public.eh_gestao() or 'medidas_supervisao' = any(public.meus_setores()));
$$;
-- pode medir: medidores (setor Medidas) e consultores externos
create or replace function public._pode_medir(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.usuarios u join public.usuario_setores us on us.usuario_id = u.id
                 where u.id = p and u.ativo and us.setor_id in ('medidas', 'consultor_externo'));
$$;

-- ============ venda confirmada → cria a medida ============
create or replace function public._trg_venda_cria_medida() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.chamados; novo text;
begin
  if new.status not in ('efetivada', 'promissoria') then return null; end if;
  if tg_op = 'UPDATE' and old.status in ('efetivada', 'promissoria') then return null; end if;
  if exists (select 1 from public.chamados m where m.tipo = 'medidas' and m.vinculado_a = new.chamado_id) then return null; end if;
  select * into c from public.chamados where id = new.chamado_id;
  if not found then return null; end if;
  perform set_config('alianca.sistema', '1', true);
  insert into public.chamados (tipo, setor_destino, status, sla_resposta, solicitante_id, solicitante_nome, solicitante_setor, cliente, cliente_doc, telefone, email,
                               pedido, data_venda, produto, motivo, endereco, vinculado_a, tratativa)
  values ('medidas', 'medidas', 'aberta', now() + interval '2 days', null, 'Sistema', 'Venda confirmada', c.cliente, c.cliente_doc, c.telefone, c.email,
          coalesce(new.numero, ''), new.data_venda, c.produto,
          'Venda nº ' || coalesce(new.numero, '—') || ' confirmada. Validar as medidas do consultor ou direcionar a medição.',
          c.endereco, c.id,
          jsonb_build_object('medida', jsonb_build_object('etapa', 'validar', 'consultorVisita', c.consultor_id, 'vendedor', c.atendente_id,
            'medidasConsultor', coalesce(c.tratativa->>'medidas', ''), 'obsConsultor', coalesce(c.tratativa->>'obs', ''))))
  returning id into novo;
  perform set_config('alianca.sistema', '0', true);
  insert into public.historico (chamado_id, quem_id, quem_nome, texto)
  values (novo, null, 'Sistema', 'Medida criada automaticamente pela venda ' || coalesce(new.numero, '') || ' (' || c.id || ') → Supervisão de Medidas');
  perform public._notificar(public._usuarios_setor(array['medidas_supervisao']), '📐 Nova medida para validar',
    c.cliente || ' · venda ' || coalesce(new.numero, '') || case when coalesce(c.tratativa->>'medidas', '') <> '' or exists (select 1 from public.anexos a where a.chamado_id = c.id) then ' · consultor já trouxe medidas/anexos' else '' end,
    novo, 'medidanova:' || novo);
  return null;
end $$;
drop trigger if exists vendas_cria_medida on public.vendas;
create trigger vendas_cria_medida after insert or update of status on public.vendas for each row execute function public._trg_venda_cria_medida();

-- ============ ações da medida ============
create or replace function public._medida(p_id text) returns public.chamados
language plpgsql stable security definer set search_path = '' as $$
declare c public.chamados;
begin
  select * into c from public.chamados where id = p_id;
  if not found or c.tipo <> 'medidas' then raise exception 'Medida não encontrada'; end if;
  return c;
end $$;

create or replace function public.medida_direcionar(p_id text, p_medidor uuid, p_data timestamp, p_endereco text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._medida(p_id); m jsonb; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.eh_sup_medidas() then raise exception 'Só a Supervisão de Medidas ou a Gestão direcionam a medição'; end if;
  if c.status = 'concluida' then raise exception 'Esta medida já foi liberada para o checklist'; end if;
  if p_medidor is null or not public._pode_medir(p_medidor) then raise exception 'Escolha um medidor ou consultor externo'; end if;
  if p_data is null then raise exception 'Informe a data e o horário da medição'; end if;
  m := coalesce(c.tratativa->'medida', '{}'::jsonb) || jsonb_build_object('etapa', 'agendada', 'direcionadoPor', public._nome(auth.uid()), 'direcionadoEm', now());
  update public.chamados set medidor_id = p_medidor, data_medida = p_data, status = 'tratativa',
    endereco = coalesce(nullif(btrim(p_endereco), ''), endereco),
    tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('medida', m)
  where id = p_id;
  perform public._reg(p_id, 'Medição direcionada para ' || public._nome(p_medidor) || ' · ' || to_char(p_data, 'DD/MM/YYYY HH24:MI'));
  perform public._notificar(array[p_medidor],
    case when p_data::date = hoje then '🚨 URGENTE: medida HOJE às ' || to_char(p_data, 'HH24:MI') else '📐 Nova medida para você' end,
    c.cliente || ' · ' || to_char(p_data, 'DD/MM HH24:MI') || coalesce(' · ' || nullif(coalesce(nullif(btrim(p_endereco), ''), c.endereco), ''), ''),
    p_id, 'medidadir:' || p_id || ':' || p_medidor || ':' || to_char(p_data, 'YYYYMMDDHH24MI'));
end $$;

create or replace function public.medida_realizada(p_id text, p_medidas text default '', p_obs text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._medida(p_id); m jsonb; eu uuid := auth.uid();
begin
  if not (coalesce(c.medidor_id = eu, false) or public.eh_sup_medidas()) then raise exception 'Só quem foi designado para medir pode marcar a medida'; end if;
  if coalesce(c.tratativa->'medida'->>'etapa', 'validar') <> 'agendada' then raise exception 'Esta medida não está aguardando medição'; end if;
  if not exists (select 1 from public.anexos a where a.chamado_id = p_id) then raise exception 'Anexe as fotos/planta da medição antes de concluir'; end if;
  m := c.tratativa->'medida' || jsonb_build_object('etapa', 'realizada', 'realizadaEm', coalesce(c.tratativa->'medida'->>'realizadaEm', now()::text),
        'realizadaPor', c.medidor_id, 'medidas', btrim(coalesce(p_medidas, '')), 'obs', btrim(coalesce(p_obs, '')));
  update public.chamados set tratativa = tratativa || jsonb_build_object('medida', m) where id = p_id;
  perform public._reg(p_id, '📐 Medida realizada por ' || public._nome(c.medidor_id) || case when btrim(coalesce(p_medidas, '')) <> '' then ': ' || left(btrim(p_medidas), 300) else '' end);
  perform public._notificar(public._usuarios_setor(array['medidas_supervisao']), '📐 Medida feita — validar', c.cliente || ' · por ' || public._nome(c.medidor_id), p_id, 'medidafeita:' || p_id || ':' || extract(epoch from now())::bigint);
end $$;

create or replace function public.medida_refazer(p_id text, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._medida(p_id); m jsonb;
begin
  if not public.eh_sup_medidas() then raise exception 'Só a Supervisão de Medidas ou a Gestão'; end if;
  if coalesce(c.tratativa->'medida'->>'etapa', '') <> 'realizada' then raise exception 'Só dá para pedir para refazer uma medida já realizada'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Diga o que precisa ser refeito'; end if;
  m := c.tratativa->'medida' || jsonb_build_object('etapa', 'agendada', 'refazer', btrim(p_motivo));
  update public.chamados set tratativa = tratativa || jsonb_build_object('medida', m) where id = p_id;
  perform public._reg(p_id, 'Medida devolvida para refazer: ' || btrim(p_motivo));
  perform public._notificar(array[c.medidor_id], '↩️ Refazer medida', c.cliente || ': ' || left(btrim(p_motivo), 140), p_id, 'medidarefaz:' || p_id || ':' || extract(epoch from now())::bigint);
end $$;

create or replace function public.medida_liberar(p_id text, p_obs text default '')
returns text language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._medida(p_id); m jsonb; etapa text; ck text; eu uuid := auth.uid();
begin
  if not public.eh_sup_medidas() then raise exception 'Só a Supervisão de Medidas ou a Gestão liberam para o checklist'; end if;
  etapa := coalesce(c.tratativa->'medida'->>'etapa', 'validar');
  if etapa not in ('validar', 'realizada') then raise exception 'A medida ainda não foi feita — aguarde a medição ou valide as medidas do consultor'; end if;
  m := coalesce(c.tratativa->'medida', '{}'::jsonb) || jsonb_build_object('etapa', 'liberada', 'liberadaEm', now(), 'liberadaPor', public._nome(eu),
        'validouConsultor', etapa = 'validar', 'obsLiberacao', btrim(coalesce(p_obs, '')));
  update public.chamados set status = 'concluida', tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('medida', m) where id = p_id;
  perform set_config('alianca.sistema', '1', true);
  insert into public.chamados (tipo, setor_destino, status, sla_resposta, solicitante_id, solicitante_nome, solicitante_setor, cliente, cliente_doc, telefone, email,
                               pedido, data_venda, produto, motivo, endereco, vinculado_a)
  values ('checklist', 'checklist', 'aberta', now() + interval '2 days', eu, public._nome(eu), 'Supervisão de Medidas', c.cliente, c.cliente_doc, c.telefone, c.email,
          c.pedido, c.data_venda, c.produto,
          'Medidas ' || case when etapa = 'validar' then 'do consultor validadas' else 'conferidas' end || ' — pronto para o checklist.' || case when btrim(coalesce(p_obs, '')) <> '' then ' ' || btrim(p_obs) else '' end,
          c.endereco, p_id)
  returning id into ck;
  perform set_config('alianca.sistema', '0', true);
  perform public._reg(p_id, '✅ Medidas ' || case when etapa = 'validar' then 'do consultor validadas' else 'conferidas' end || ' — liberado para o checklist (' || ck || ')');
  insert into public.historico (chamado_id, quem_id, quem_nome, texto) values (ck, eu, public._nome(eu), 'Checklist aberto a partir da medida ' || p_id);
  perform public._notificar(public._usuarios_setor(array['checklist']), '📋 Novo checklist', c.cliente || ' · medidas liberadas', ck, 'checklistnovo:' || ck);
  return ck;
end $$;

-- ============ reembolsos ============
create table if not exists public.reembolsos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id),
  chamado_id text references public.chamados(id) on delete set null,
  data date not null,
  tipo text not null check (tipo in ('pedagio', 'estacionamento', 'combustivel', 'outro')),
  valor numeric(10,2) not null check (valor > 0),
  descricao text not null default '',
  comprovante_path text not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  criado_em timestamptz not null default now(),
  decidido_por uuid references public.usuarios(id),
  decidido_em timestamptz,
  motivo text not null default ''
);
alter table public.reembolsos enable row level security;
revoke all on public.reembolsos from anon, authenticated;
grant select on public.reembolsos to authenticated;
drop policy if exists reembolsos_ler on public.reembolsos;
create policy reembolsos_ler on public.reembolsos for select to authenticated using (usuario_id = auth.uid() or public.eh_gestao());

insert into storage.buckets (id, name, public) values ('reembolsos', 'reembolsos', false) on conflict (id) do nothing;
drop policy if exists reembolsos_enviar on storage.objects;
create policy reembolsos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'reembolsos' and (storage.foldername(name))[1] = auth.uid()::text and public.usuario_ativo());
drop policy if exists reembolsos_ler_arq on storage.objects;
create policy reembolsos_ler_arq on storage.objects for select to authenticated
  using (bucket_id = 'reembolsos' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_gestao()));

create or replace function public.solicitar_reembolso(p_tipo text, p_valor numeric, p_data date, p_descricao text, p_comprovante text, p_chamado text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare eu uuid := auth.uid(); novo uuid;
begin
  if not public.usuario_ativo() or not exists (select 1 from public.usuario_setores where usuario_id = eu and setor_id in ('consultor_externo', 'medidas')) then
    raise exception 'Reembolso é para consultores externos e medidores';
  end if;
  if p_tipo not in ('pedagio', 'estacionamento', 'combustivel', 'outro') then raise exception 'Escolha o tipo de despesa'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor'; end if;
  if p_data is null or p_data > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe a data da despesa'; end if;
  if coalesce(p_comprovante, '') not like eu::text || '/%' then raise exception 'Anexe a foto do comprovante'; end if;
  if p_tipo = 'outro' and length(btrim(coalesce(p_descricao, ''))) < 3 then raise exception 'Descreva a despesa'; end if;
  if p_chamado is not null and not public.pode_ver_id(p_chamado) then raise exception 'Cliente inválido'; end if;
  insert into public.reembolsos (usuario_id, chamado_id, data, tipo, valor, descricao, comprovante_path)
  values (eu, p_chamado, p_data, p_tipo, round(p_valor, 2), btrim(coalesce(p_descricao, '')), p_comprovante) returning id into novo;
  perform public._notificar(public._usuarios_setor(array['gestao']), '🧾 Pedido de reembolso',
    public._nome(eu) || ' · ' || public._moeda(p_valor) || ' · ' || case p_tipo when 'pedagio' then 'pedágio' when 'estacionamento' then 'estacionamento' when 'combustivel' then 'combustível' else btrim(p_descricao) end,
    null, 'reembolso:' || novo);
  return novo;
end $$;

create or replace function public.decidir_reembolso(p_id uuid, p_aprovar boolean, p_motivo text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reembolsos;
begin
  if not public.eh_gestao() then raise exception 'Só a Gestão aprova reembolsos'; end if;
  select * into r from public.reembolsos where id = p_id for update;
  if not found then raise exception 'Reembolso não encontrado'; end if;
  if r.status <> 'pendente' then raise exception 'Este reembolso já foi decidido'; end if;
  if not p_aprovar and length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Diga o motivo da recusa'; end if;
  update public.reembolsos set status = case when p_aprovar then 'aprovado' else 'recusado' end, decidido_por = auth.uid(), decidido_em = now(), motivo = btrim(coalesce(p_motivo, ''))
  where id = p_id;
  perform public._notificar(array[r.usuario_id], case when p_aprovar then '✅ Reembolso aprovado' else '❌ Reembolso recusado' end,
    public._moeda(r.valor) || ' de ' || to_char(r.data, 'DD/MM') || case when not p_aprovar then ' — ' || btrim(p_motivo) else ' — entra no seu valor a receber' end,
    null, 'reembdec:' || p_id);
end $$;

-- extrato de campo (consultor/medidor) no período: visitas pagas, medidas pagas, vendas efetivadas, reembolsos aprovados
create or replace function public._extrato_campo(p_uid uuid, p_de date, p_ate date)
returns table(visitas int, medidas int, vendas int, vendido numeric, reembolsos numeric, total numeric)
language sql stable security definer set search_path = '' as $$
  with cf as (select pagamento_visita pv, comissao_pct pct from public.config where id = 1),
  v as (select count(*)::int n from public.chamados c where c.consultor_id = p_uid and coalesce((c.tratativa->>'realizada')::boolean, false) and c.data_loja is not null and c.data_loja::date between p_de and p_ate),
  m as (select count(*)::int n from public.chamados c where c.tipo = 'medidas' and c.medidor_id = p_uid and (c.tratativa->'medida'->>'realizadaEm') is not null
          and ((c.tratativa->'medida'->>'realizadaEm')::timestamptz at time zone 'America/Sao_Paulo')::date between p_de and p_ate),
  s as (select count(*)::int n, coalesce(sum(vl.valor), 0) val from public.chamados c join public.vendas vv on vv.chamado_id = c.id join public.vendas_valores vl on vl.chamado_id = c.id
          where c.consultor_id = p_uid and vv.status = 'efetivada' and coalesce(vv.data_venda, (vv.registrado_em at time zone 'America/Sao_Paulo')::date) between p_de and p_ate),
  r as (select coalesce(sum(valor), 0) val from public.reembolsos where usuario_id = p_uid and status = 'aprovado' and data between p_de and p_ate)
  select v.n, m.n, s.n, s.val, r.val, (v.n + m.n) * cf.pv + s.val * cf.pct / 100 + r.val from v, m, s, r, cf;
$$;

revoke execute on function public._trg_venda_cria_medida(), public._medida(text), public._pode_medir(uuid), public._extrato_campo(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.medida_direcionar(text, uuid, timestamp, text), public.medida_realizada(text, text, text), public.medida_refazer(text, text), public.medida_liberar(text, text),
  public.solicitar_reembolso(text, numeric, date, text, text, text), public.decidir_reembolso(uuid, boolean, text), public.eh_sup_medidas() from public, anon;
grant execute on function public.medida_direcionar(text, uuid, timestamp, text), public.medida_realizada(text, text, text), public.medida_refazer(text, text), public.medida_liberar(text, text),
  public.solicitar_reembolso(text, numeric, date, text, text, text), public.decidir_reembolso(uuid, boolean, text), public.eh_sup_medidas() to authenticated;

-- (aplicada também via MCP em 25/09/2026: avisos_rotina_em ganhou o resumo mensal de consultor+medidor via _extrato_campo
--  e os avisos de medida em 1h / medida sem registro — ver migration "avisos_medidas_resumo_campo")
