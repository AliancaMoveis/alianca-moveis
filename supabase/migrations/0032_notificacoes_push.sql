-- Notificações no celular (Web Push).
--  · push_inscricoes: aparelhos que aceitaram receber avisos (cada pessoa só vê/gerencia os seus)
--  · notificacoes: fila de avisos gerados pelos gatilhos abaixo; a função "enviar-push" entrega e marca como enviado
--  · push_config: chaves VAPID e segredo da função (ninguém do app lê; só o servidor). Os valores NÃO ficam neste arquivo.
-- Quem fez a ação nunca é avisado da própria ação.
create extension if not exists pg_net with schema extensions;

create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  agente text not null default '',
  criado_em timestamptz not null default now(),
  ultimo_ok timestamptz
);
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  vapid_publica text, vapid_privada text, assunto text, segredo text, url_funcao text
);
create table if not exists public.notificacoes (
  id bigserial primary key,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  titulo text not null,
  corpo text not null default '',
  chamado_id text,
  chave text unique,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  tentativas int not null default 0,
  erro text
);
create index if not exists notificacoes_pend on public.notificacoes (id) where enviado_em is null;
alter table public.push_inscricoes enable row level security;
alter table public.push_config enable row level security;
alter table public.notificacoes enable row level security;
revoke all on public.push_config from anon, authenticated;
revoke insert, update, delete, truncate on public.push_inscricoes, public.notificacoes from anon, authenticated;
revoke all on public.push_inscricoes, public.notificacoes from anon;
drop policy if exists push_insc_ler on public.push_inscricoes;
create policy push_insc_ler on public.push_inscricoes for select to authenticated using (usuario_id = auth.uid());
drop policy if exists notif_ler on public.notificacoes;
create policy notif_ler on public.notificacoes for select to authenticated using (usuario_id = auth.uid());

-- ---------- inscrição do aparelho ----------
create or replace function public.salvar_inscricao_push(p_endpoint text, p_p256dh text, p_auth text, p_agente text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.usuario_ativo() then raise exception 'Usuário sem acesso'; end if;
  if coalesce(p_endpoint,'') !~ '^https://' or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = '' then raise exception 'Inscrição inválida'; end if;
  insert into public.push_inscricoes (usuario_id, endpoint, p256dh, auth, agente)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_agente,''), 200))
  on conflict (endpoint) do update set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth, agente = excluded.agente, criado_em = now();
end $$;
create or replace function public.remover_inscricao_push(p_endpoint text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.push_inscricoes where endpoint = p_endpoint and usuario_id = auth.uid();
end $$;

-- ---------- gerar aviso ----------
create or replace function public._notificar(p_usuarios uuid[], p_titulo text, p_corpo text, p_chamado text, p_chave text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notificacoes (usuario_id, titulo, corpo, chamado_id, chave)
  select u.id, p_titulo, coalesce(p_corpo,''), p_chamado, case when p_chave is null then null else p_chave || ':' || u.id end
  from public.usuarios u
  where u.id = any(p_usuarios) and u.ativo and u.id is distinct from auth.uid()
  on conflict (chave) do nothing;
end $$;
create or replace function public._usuarios_setor(p_setores text[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct us.usuario_id), '{}') from public.usuario_setores us join public.usuarios u on u.id = us.usuario_id
  where us.setor_id = any(p_setores) and u.ativo;
$$;
create or replace function public.testar_push() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.usuario_ativo() then raise exception 'Usuário sem acesso'; end if;
  insert into public.notificacoes (usuario_id, titulo, corpo) values (auth.uid(), '🔔 Notificações ativadas', 'Tudo certo! Você vai receber os avisos do ALIANÇA 360 aqui.');
end $$;

-- ---------- entrega: chama a função do servidor ----------
create or replace function public._disparar_push(p_ids bigint[]) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.push_config;
begin
  select * into c from public.push_config where id = 1;
  if c.url_funcao is null or c.segredo is null then return; end if;
  perform net.http_post(url := c.url_funcao, body := jsonb_build_object('ids', to_jsonb(p_ids)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-segredo', c.segredo), timeout_milliseconds := 10000);
exception when others then null;  -- aviso nunca derruba a operação principal
end $$;
create or replace function public._trg_notificacoes_enviar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ids bigint[];
begin
  select array_agg(id) into ids from novos;
  if ids is not null then perform public._disparar_push(ids); end if;
  return null;
end $$;
drop trigger if exists notificacoes_enviar on public.notificacoes;
create trigger notificacoes_enviar after insert on public.notificacoes referencing new table as novos for each statement execute function public._trg_notificacoes_enviar();

-- ---------- gatilhos: clientes do marketing ----------
create or replace function public._trg_chamado_avisos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  presale boolean := public.tipo_presale(new.tipo);
  coord uuid[];
  ped_ant uuid; ped_novo uuid; m public.mkt_metas; n int;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  quando text;
begin
  if not presale then return null; end if;
  coord := public._usuarios_setor(array['suporte_consultores','marketing_supervisao','gerente_loja']);
  ped_ant := case when tg_op = 'UPDATE' then nullif(old.tratativa->>'pedidoAtend','')::uuid end;
  ped_novo := nullif(new.tratativa->>'pedidoAtend','')::uuid;

  -- consultor: novo cliente para visitar
  if new.consultor_id is not null and (tg_op = 'INSERT' or old.consultor_id is distinct from new.consultor_id) then
    perform public._notificar(array[new.consultor_id], '📍 Novo cliente para visita',
      new.cliente || coalesce(' · visita ' || to_char(new.data_visita, 'DD/MM HH24:MI'), '') || coalesce(' · ' || nullif(new.endereco,''), ''),
      new.id, 'consultor:' || new.id || ':' || new.consultor_id);
  end if;

  -- vendedor: pedido de atendimento aprovado / recusado, ou cliente designado
  if ped_ant is not null and ped_novo is null then
    if new.atendente_id = ped_ant then
      perform public._notificar(array[ped_ant], '✅ Pedido aprovado', 'Você está atendendo ' || new.cliente || coalesce(' · loja ' || to_char(new.data_loja, 'DD/MM HH24:MI'), ''), new.id, 'pedok:' || new.id || ':' || extract(epoch from now())::bigint);
    elsif new.atendente_id is null then
      perform public._notificar(array[ped_ant], '❌ Pedido recusado', 'Seu pedido para atender ' || new.cliente || ' não foi aprovado.', new.id, 'pednao:' || new.id || ':' || extract(epoch from now())::bigint);
    end if;
  end if;
  if new.atendente_id is not null and (tg_op = 'INSERT' or old.atendente_id is distinct from new.atendente_id) and new.atendente_id is distinct from ped_ant then
    perform public._notificar(array[new.atendente_id], '🏬 Cliente designado para você',
      new.cliente || coalesce(' · loja ' || to_char(new.data_loja, 'DD/MM HH24:MI'), '') || case when new.tratativa->>'querProjeto' = 'sim' then ' · quer projeto' else '' end,
      new.id, 'vend:' || new.id || ':' || new.atendente_id);
  end if;

  -- coordenação: novo pedido de atendimento de vendedor
  if ped_novo is not null and ped_novo is distinct from ped_ant then
    perform public._notificar(coord, '🙋 Pedido de atendimento', public._nome(ped_novo) || ' quer atender ' || new.cliente || ' — aprovar?', new.id, 'pedido:' || new.id || ':' || ped_novo);
  end if;

  -- vendedor: parecer cobrado pelo Suporte
  if new.atendente_id is not null and (new.tratativa->>'cobradoEm') is not null
     and (tg_op = 'INSERT' or (old.tratativa->>'cobradoEm') is distinct from (new.tratativa->>'cobradoEm')) then
    perform public._notificar(array[new.atendente_id], '⚠️ Parecer cobrado', 'O Suporte está pedindo seu parecer sobre ' || new.cliente || '.', new.id, 'cobrado:' || new.id || ':' || (new.tratativa->>'cobradoEm'));
  end if;

  -- coordenação: cliente agendado na loja ainda sem vendedor
  if new.data_loja is not null and new.atendente_id is null and (tg_op = 'INSERT' or old.data_loja is distinct from new.data_loja) then
    quando := to_char(new.data_loja, 'DD/MM HH24:MI');
    perform public._notificar(coord, '🏬 Cliente na loja sem vendedor', new.cliente || ' · ' || quando || ' — definir vendedor', new.id, 'semvend:' || new.id || ':' || quando);
  end if;

  -- operadora: meta do dia batida (no cadastro do cliente)
  if tg_op = 'INSERT' and new.solicitante_id is not null then
    select * into m from public.mkt_metas where dia = hoje;
    if found then
      select count(*) into n from public.chamados c join public.tipos t on t.id = c.tipo
       where t.presale and c.solicitante_id = new.solicitante_id and (c.criado_em at time zone 'America/Sao_Paulo')::date = hoje;
      if n = m.meta then
        insert into public.notificacoes (usuario_id, titulo, corpo, chave)
        select new.solicitante_id, '🎉 Meta do dia batida!', 'Você fez ' || n || ' agendamentos hoje. Bônus de R$ ' || to_char(m.valor, 'FM999G990D00') || ' garantido.', 'meta:' || hoje || ':' || new.solicitante_id
        on conflict (chave) do nothing;
      end if;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists chamados_avisos on public.chamados;
create trigger chamados_avisos after insert or update on public.chamados for each row execute function public._trg_chamado_avisos();

-- ---------- gatilhos: vendas ----------
create or replace function public._trg_venda_avisos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.chamados; val numeric; pct numeric; vmk numeric;
begin
  select * into c from public.chamados where id = new.chamado_id;
  if not found or not public.tipo_presale(c.tipo) then return null; end if;
  -- Gestão: venda registrada aguardando confirmação
  if tg_op = 'INSERT' and new.status = 'registrada' then
    perform public._notificar(public._usuarios_setor(array['gestao']), '🧾 Venda para confirmar', c.cliente || ' · venda nº ' || new.numero || coalesce(' · ' || public._nome(c.atendente_id), ''), c.id, 'vreg:' || c.id || ':' || new.numero);
  end if;
  -- venda confirmada (efetivada): consultor, vendedor e operadora que agendou
  if new.status = 'efetivada' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select valor into val from public.vendas_valores where chamado_id = c.id;
    select comissao_pct, valor_venda_mkt into pct, vmk from public.config where id = 1;
    if c.consultor_id is not null then
      perform public._notificar(array[c.consultor_id], '✅ Venda confirmada', c.cliente || ' · venda nº ' || new.numero
        || case when val is not null then ' · sua comissão R$ ' || to_char(round(val * pct / 100, 2), 'FM999G999G990D00') else '' end, c.id, 'vok-c:' || c.id);
    end if;
    if c.atendente_id is not null then
      perform public._notificar(array[c.atendente_id], '✅ Venda confirmada', c.cliente || ' · venda nº ' || new.numero, c.id, 'vok-v:' || c.id);
    end if;
    if c.solicitante_id is not null and exists (select 1 from public.usuario_setores where usuario_id = c.solicitante_id and setor_id = 'marketing_operadora') then
      perform public._notificar(array[c.solicitante_id], '💰 Venda confirmada', c.cliente || ' comprou! + R$ ' || to_char(vmk, 'FM999G990D00') || ' na sua comissão.', c.id, 'vok-o:' || c.id);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists vendas_avisos on public.vendas;
create trigger vendas_avisos after insert or update on public.vendas for each row execute function public._trg_venda_avisos();

-- ---------- gatilho: pagamento do marketing aprovado ----------
create or replace function public._trg_pag_mkt_avisos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._notificar(array[new.operadora_id], '💵 Pagamento aprovado', 'Seu pagamento de ' || to_char(new.de, 'MM/YYYY') || ' foi aprovado: R$ ' || to_char(new.total, 'FM999G999G990D00'), null,
    'pag:' || new.id || ':' || new.total);
  return null;
end $$;
drop trigger if exists mkt_pagamentos_avisos on public.mkt_pagamentos;
create trigger mkt_pagamentos_avisos after insert or update on public.mkt_pagamentos for each row execute function public._trg_pag_mkt_avisos();

-- ---------- a cada 5 min: lembrete de cliente chegando + reenvio do que falhou ----------
create or replace function public.push_rotina() returns void
language plpgsql security definer set search_path = '' as $$
declare agora timestamp := (now() at time zone 'America/Sao_Paulo'); r record; ids bigint[];
begin
  for r in select c.* from public.chamados c join public.tipos t on t.id = c.tipo left join public.vendas v on v.chamado_id = c.id
           where t.presale and c.atendente_id is not null and v.chamado_id is null
             and c.data_loja between agora + interval '20 minutes' and agora + interval '40 minutes' loop
    perform public._notificar(array[r.atendente_id], '⏰ Cliente chegando', r.cliente || ' vem à loja às ' || to_char(r.data_loja, 'HH24:MI') || '.', r.id, 'lembrete:' || r.id || ':' || to_char(r.data_loja, 'YYYYMMDDHH24MI'));
  end loop;
  select array_agg(id) into ids from (select id from public.notificacoes where enviado_em is null and tentativas < 3 and criado_em > now() - interval '1 day' and criado_em < now() - interval '2 minutes' order by id limit 200) x;
  if ids is not null then perform public._disparar_push(ids); end if;
end $$;
select cron.unschedule('alianca360-push') where exists (select 1 from cron.job where jobname = 'alianca360-push');
select cron.schedule('alianca360-push', '*/5 * * * *', $$select public.push_rotina();$$);

revoke execute on function public._notificar(uuid[], text, text, text, text), public._usuarios_setor(text[]), public._disparar_push(bigint[]),
  public._trg_notificacoes_enviar(), public._trg_chamado_avisos(), public._trg_venda_avisos(), public._trg_pag_mkt_avisos(), public.push_rotina() from public, anon, authenticated;
revoke execute on function public.salvar_inscricao_push(text, text, text, text), public.remover_inscricao_push(text), public.testar_push() from public, anon;
grant execute on function public.salvar_inscricao_push(text, text, text, text), public.remover_inscricao_push(text), public.testar_push() to authenticated;
