-- Pós-venda: suporte ao montador (parado na obra, prazo definido pelo pós-venda), desfecho obrigatório,
-- dano na obra com pedido de reembolso do cliente (análise → procedente/improcedente → pago) e desconto do montador (a descontar → descontado)
alter table public.posvenda drop constraint posvenda_categoria_check;
alter table public.posvenda add constraint posvenda_categoria_check check (categoria in
  ('', 'avaria', 'peca_faltante', 'peca_defeito', 'medida', 'montagem', 'acabamento', 'dano_obra', 'duvida_projeto', 'outro'));
alter table public.posvenda
  add column if not exists parado_obra boolean not null default false,
  add column if not exists prazo timestamptz,
  add column if not exists desfecho text not null default '' check (desfecho in ('', 'resolvido_telefone', 'assistencia', 'retorno_montador', 'erro_medida_projeto', 'reembolso_cliente', 'improcedente', 'outro')),
  add column if not exists reembolso_status text not null default '' check (reembolso_status in ('', 'em_analise', 'procedente', 'improcedente')),
  add column if not exists reembolso_valor numeric not null default 0 check (reembolso_valor >= 0),
  add column if not exists reembolso_pago_em date,
  add column if not exists desconto_status text not null default '' check (desconto_status in ('', 'a_descontar', 'descontado')),
  add column if not exists desconto_em date,
  add constraint posvenda_reemb_coerente check ((reembolso_valor = 0 or reembolso_status = 'procedente') and (reembolso_pago_em is null or reembolso_status = 'procedente')),
  add constraint posvenda_desc_coerente check ((desconto_status = '') = (desconto_montador = 0) and (desconto_em is null or desconto_status = 'descontado'));

-- Abertura: quem acionou, peça, montador e "parado na obra"
create or replace function public.posvenda_abertura(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false); v_mont uuid := nullif(p->>'montadorId','')::uuid;
begin
  if c.tipo <> 'posvenda' then raise exception 'Disponível só para atendimentos de pós-venda'; end if;
  if not (public.pode_tratar_chamado(c) is true or (c.solicitante_id = auth.uid() and c.criado_em > now() - interval '30 minutes')) then
    raise exception 'Você não pode alterar este relato';
  end if;
  if coalesce(p->>'origem','') not in ('cliente','montador') then raise exception 'Informe quem acionou'; end if;
  if v_mont is not null and not exists (select 1 from public.montadores where id = v_mont) then raise exception 'Montador inválido'; end if;
  if p->>'origem' = 'montador' and v_mont is null then raise exception 'Informe qual montador pediu suporte'; end if;
  update public.posvenda set origem = p->>'origem', peca_afetada = btrim(coalesce(p->>'peca','')),
    montador_id = coalesce(v_mont, montador_id), parado_obra = p->>'origem' = 'montador' and coalesce((p->>'paradoObra')::boolean, false),
    categoria = case when coalesce(p->>'categoria','') <> '' then p->>'categoria' else categoria end
  where chamado_id = p_id;
  if p->>'origem' = 'montador' and coalesce((p->>'paradoObra')::boolean, false) then
    perform public._notificar(public._usuarios_setor(array['posvenda']), '🚨 Montador parado na obra', c.cliente || ' · ' || left(c.motivo, 140), p_id, 'pvparado:' || p_id);
  end if;
end $$;
revoke all on function public.posvenda_abertura(text, jsonb) from public, anon;
grant execute on function public.posvenda_abertura(text, jsonb) to authenticated;

-- Análise: + prazo, desfecho, parado na obra, reembolso ao cliente e situação do desconto do montador
create or replace function public.salvar_posvenda(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $function$
declare
  c public.chamados := public._chamado(p_id, true);
  v_resp text := coalesce(nullif(p->>'responsabilidade',''), 'analise');
  v_mont uuid := nullif(p->>'montadorId','')::uuid;
  v_med uuid := nullif(p->>'medidorResp','')::uuid;
  v_chk uuid := nullif(p->>'checklistResp','')::uuid;
  v_custo numeric := coalesce(nullif(p->>'custo','')::numeric, 0);
  v_desc numeric := coalesce(nullif(p->>'descontoMontador','')::numeric, 0);
  v_dst text := coalesce(p->>'descontoStatus', '');
  v_dem date := nullif(p->>'descontoEm','')::date;
  v_rst text := coalesce(p->>'reembolsoStatus', '');
  v_rval numeric := coalesce(nullif(p->>'reembolsoValor','')::numeric, 0);
  v_rpag date := nullif(p->>'reembolsoPagoEm','')::date;
  v_prazo timestamptz := nullif(p->>'prazo','')::timestamptz;
  v_desf text := coalesce(p->>'desfecho', '');
  v_cat text;
  antes public.posvenda;
  txt text;
begin
  if c.tipo <> 'posvenda' then raise exception 'Registro disponível só para atendimentos de pós-venda'; end if;
  if v_resp not in ('analise','montador','medida','checklist','fabrica','transporte','cliente','nenhum') then raise exception 'Responsabilidade inválida'; end if;
  if v_mont is not null and not exists (select 1 from public.montadores where id = v_mont) then raise exception 'Montador inválido'; end if;
  if v_med is not null and not exists (select 1 from public.usuario_setores where usuario_id = v_med and setor_id = 'medidas') then raise exception 'Medidor inválido'; end if;
  if v_chk is not null and not exists (select 1 from public.usuario_setores where usuario_id = v_chk and setor_id = 'checklist') then raise exception 'Responsável pelo checklist inválido'; end if;
  if v_resp = 'montador' and v_mont is null then raise exception 'Informe o montador responsável'; end if;
  if v_resp = 'medida' and v_med is null then raise exception 'Informe quem fez a medição'; end if;
  if v_resp = 'checklist' and v_chk is null then raise exception 'Informe quem fez o checklist'; end if;
  if v_custo < 0 or v_desc < 0 or v_rval < 0 then raise exception 'Valores não podem ser negativos'; end if;
  if v_desc > 0 and v_resp <> 'montador' then raise exception 'Desconto do montador só quando a responsabilidade é do montador'; end if;
  if v_desc > 0 and v_dst = '' then v_dst := 'a_descontar'; end if;
  if v_desc = 0 then v_dst := ''; v_dem := null; end if;
  if v_dst not in ('', 'a_descontar', 'descontado') then raise exception 'Situação do desconto inválida'; end if;
  if v_dst = 'descontado' and v_dem is null then v_dem := current_date; end if;
  if v_dst <> 'descontado' then v_dem := null; end if;
  if v_rst not in ('', 'em_analise', 'procedente', 'improcedente') then raise exception 'Situação do reembolso inválida'; end if;
  if v_rst <> 'procedente' and (v_rval > 0 or v_rpag is not null) then raise exception 'Valor e pagamento do reembolso só quando o pedido for procedente'; end if;
  if v_rst = 'procedente' and v_rval = 0 then raise exception 'Informe o valor do reembolso ao cliente'; end if;
  if v_rpag is not null and v_rpag > current_date then raise exception 'Data de pagamento do reembolso no futuro'; end if;
  if v_desf not in ('', 'resolvido_telefone', 'assistencia', 'retorno_montador', 'erro_medida_projeto', 'reembolso_cliente', 'improcedente', 'outro') then raise exception 'Desfecho inválido'; end if;
  if v_desf = 'reembolso_cliente' and v_rst <> 'procedente' then raise exception 'Desfecho “reembolso ao cliente” exige o reembolso marcado como procedente'; end if;
  select * into antes from public.posvenda where chamado_id = p_id;
  v_cat := coalesce(p->>'categoria', antes.categoria);
  if v_rst <> '' and v_cat <> 'dano_obra' then raise exception 'Reembolso ao cliente só para o tipo “dano no imóvel na montagem”'; end if;
  if v_prazo is not null and v_prazo is distinct from antes.prazo and v_prazo < now() - interval '1 day' then raise exception 'Prazo no passado'; end if;

  insert into public.posvenda (chamado_id) values (p_id) on conflict do nothing;
  update public.posvenda set
    categoria = v_cat, responsabilidade = v_resp,
    montador_id = v_mont, medidor_resp = v_med, checklist_resp = v_chk,
    ocorrido = btrim(coalesce(p->>'ocorrido', ocorrido)), solucao = btrim(coalesce(p->>'solucao','')),
    custo = v_custo, custo_desc = btrim(coalesce(p->>'custoDesc','')), desconto_montador = v_desc,
    desconto_status = v_dst, desconto_em = v_dem,
    reembolso_status = v_rst, reembolso_valor = v_rval, reembolso_pago_em = v_rpag,
    prazo = v_prazo, desfecho = v_desf,
    parado_obra = case when p ? 'paradoObra' then coalesce((p->>'paradoObra')::boolean, false) else parado_obra end,
    atualizado_em = now(), atualizado_por = auth.uid()
  where chamado_id = p_id;

  if c.status = 'aberta' then update public.chamados set status = 'tratativa' where id = p_id; end if;

  txt := 'Análise do pós-venda atualizada';
  if antes.responsabilidade is distinct from v_resp then
    txt := txt || ' · responsabilidade: ' || case v_resp when 'analise' then 'em análise' when 'montador' then 'montador'
      when 'medida' then 'medição' when 'checklist' then 'checklist' when 'fabrica' then 'fábrica' when 'transporte' then 'transporte/entrega'
      when 'cliente' then 'cliente (mau uso)' else 'sem responsável' end;
  end if;
  if v_mont is not null and antes.montador_id is distinct from v_mont then txt := txt || ' · montador ' || (select nome from public.montadores where id = v_mont); end if;
  if v_med is not null and antes.medidor_resp is distinct from v_med then txt := txt || ' · medição de ' || public._nome(v_med); end if;
  if v_chk is not null and antes.checklist_resp is distinct from v_chk then txt := txt || ' · checklist de ' || public._nome(v_chk); end if;
  if coalesce(antes.custo,0) is distinct from v_custo then txt := txt || ' · custo para a loja ' || case when v_custo > 0 then 'registrado' else 'zerado' end; end if;
  if coalesce(antes.desconto_montador,0) is distinct from v_desc then txt := txt || ' · desconto do montador ' || case when v_desc > 0 then 'registrado' else 'zerado' end; end if;
  if antes.desconto_status is distinct from v_dst and v_dst = 'descontado' then txt := txt || ' · desconto do montador efetuado'; end if;
  if antes.prazo is distinct from v_prazo then txt := txt || coalesce(' · prazo: resolver até ' || to_char(v_prazo at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), ' · prazo retirado'); end if;
  if antes.reembolso_status is distinct from v_rst then txt := txt || ' · reembolso ao cliente: ' || case v_rst when 'em_analise' then 'em análise' when 'procedente' then 'procedente' when 'improcedente' then 'improcedente' else 'retirado' end; end if;
  if antes.reembolso_pago_em is distinct from v_rpag and v_rpag is not null then txt := txt || ' · reembolso pago em ' || to_char(v_rpag, 'DD/MM/YYYY'); end if;
  if antes.desfecho is distinct from v_desf and v_desf <> '' then txt := txt || ' · desfecho: ' || case v_desf when 'resolvido_telefone' then 'resolvido por telefone'
      when 'assistencia' then 'assistência / peça' when 'retorno_montador' then 'retorno do montador' when 'erro_medida_projeto' then 'erro de medida/projeto'
      when 'reembolso_cliente' then 'reembolso ao cliente' when 'improcedente' then 'improcedente' else 'outro' end; end if;
  perform public._reg(p_id, txt);
end $function$;

-- Concluir pós-venda exige desfecho e reembolso sem análise pendente
create or replace function public._trg_posvenda_concluir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pv public.posvenda;
begin
  if new.tipo = 'posvenda' and new.status = 'concluida' and old.status is distinct from 'concluida'
     and coalesce(current_setting('alianca.sistema', true), '') <> '1' then
    select * into pv from public.posvenda where chamado_id = new.id;
    if found and pv.desfecho = '' then raise exception 'Antes de concluir, informe o desfecho do pós-venda (bloco 3) e salve'; end if;
    if found and pv.reembolso_status = 'em_analise' then raise exception 'O pedido de reembolso do cliente ainda está em análise'; end if;
    if found and pv.reembolso_status = 'procedente' and pv.reembolso_pago_em is null then raise exception 'Reembolso procedente ainda sem data de pagamento'; end if;
  end if;
  return new;
end $$;
drop trigger if exists chamados_posvenda_concluir on public.chamados;
create trigger chamados_posvenda_concluir before update of status on public.chamados for each row execute function public._trg_posvenda_concluir();

-- Aviso de prazo vencido (1x por prazo) ao Pós-venda
do $do$ declare d text; begin
  d := pg_get_functiondef('public.avisos_rotina_em(timestamp without time zone)'::regprocedure);
  d := replace(d, $x$  for r in select c.id, c.cliente, c.atendente_id, ch.avisado_em$x$, $x$  for r in select c.id, c.cliente, pv.prazo, pv.parado_obra from public.posvenda pv join public.chamados c on c.id = pv.chamado_id
           where pv.prazo is not null and pv.prazo < now() and pv.prazo > now() - interval '7 days' and c.status <> 'concluida' loop
    perform public._notificar(public._usuarios_setor(array['posvenda']), '⏰ Prazo do pós-venda vencido' || case when r.parado_obra then ' · montador parado' else '' end,
      r.cliente || ' · prazo era ' || to_char(r.prazo at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), r.id, 'pvprazo:' || r.id || ':' || extract(epoch from r.prazo)::bigint);
  end loop;

  for r in select c.id, c.cliente, c.atendente_id, ch.avisado_em$x$);
  if d not like '%pvprazo%' then raise exception 'replace falhou'; end if;
  execute d;
end $do$;
