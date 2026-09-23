-- Pós-venda: ficha em três blocos — Relato (fato), Análise (tipo de problema + responsabilidade) e Custo/solução.
-- Tipo de problema e responsabilidade passam a ser coisas separadas.

alter table public.posvenda drop constraint if exists posvenda_categoria_check;
update public.posvenda set categoria = case categoria
  when 'avaria_montador' then 'avaria' when 'avaria_transporte' then 'avaria' when 'erro_projeto' then 'medida'
  when 'peca_fabrica' then 'peca_defeito' else categoria end;
alter table public.posvenda add constraint posvenda_categoria_check
  check (categoria in ('','avaria','peca_faltante','peca_defeito','medida','montagem','acabamento','outro'));

alter table public.posvenda add column if not exists responsabilidade text not null default 'analise';
alter table public.posvenda add constraint posvenda_resp_check
  check (responsabilidade in ('analise','montador','medida','checklist','fabrica','transporte','cliente','nenhum'));
alter table public.posvenda add column if not exists medidor_resp uuid references public.usuarios(id);
alter table public.posvenda add column if not exists peca_afetada text not null default '';
update public.posvenda set responsabilidade = 'checklist' where erro_checklist is true;
update public.posvenda set responsabilidade = 'montador' where responsabilidade = 'analise' and desconto_montador > 0;
alter table public.posvenda drop column if exists erro_checklist;

-- todo atendimento de pós-venda nasce com o registro (relato), aberto pelo call center ou pela Vânia
create or replace function public._posvenda_novo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'posvenda' then
    insert into public.posvenda (chamado_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists chamados_posvenda_novo on public.chamados;
create trigger chamados_posvenda_novo after insert or update of tipo on public.chamados
  for each row execute function public._posvenda_novo();
insert into public.posvenda (chamado_id) select id from public.chamados where tipo = 'posvenda' on conflict do nothing;
revoke execute on function public._posvenda_novo() from authenticated, anon, public;

-- relato complementar da abertura (quem acionou e peça/ambiente): quem abriu, nos primeiros 30 min, ou quem trata
create or replace function public.posvenda_relato(p_id text, p_origem text, p_peca text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._chamado(p_id, false);
begin
  if c.tipo <> 'posvenda' then raise exception 'Disponível só para atendimentos de pós-venda'; end if;
  if not (public.pode_tratar_chamado(c) is true
          or (c.solicitante_id = auth.uid() and c.criado_em > now() - interval '30 minutes')) then
    raise exception 'Você não pode alterar este relato';
  end if;
  if coalesce(p_origem,'') not in ('cliente','montador') then raise exception 'Informe quem acionou'; end if;
  update public.posvenda set origem = p_origem, peca_afetada = btrim(coalesce(p_peca,'')) where chamado_id = p_id;
end $$;

-- análise + custo (só o setor Pós-venda / Gestão, por ser quem trata)
drop function if exists public.salvar_posvenda(text, jsonb);
create or replace function public.salvar_posvenda(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.chamados := public._chamado(p_id, true);
  v_resp text := coalesce(nullif(p->>'responsabilidade',''), 'analise');
  v_mont uuid := nullif(p->>'montadorId','')::uuid;
  v_med uuid := nullif(p->>'medidorResp','')::uuid;
  v_chk uuid := nullif(p->>'checklistResp','')::uuid;
  v_custo numeric := coalesce(nullif(p->>'custo','')::numeric, 0);
  v_desc numeric := coalesce(nullif(p->>'descontoMontador','')::numeric, 0);
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
  if v_custo < 0 or v_desc < 0 then raise exception 'Valores não podem ser negativos'; end if;
  if v_desc > 0 and v_resp <> 'montador' then raise exception 'Desconto do montador só quando a responsabilidade é do montador'; end if;
  select * into antes from public.posvenda where chamado_id = p_id;

  insert into public.posvenda (chamado_id) values (p_id) on conflict do nothing;
  update public.posvenda set
    categoria = coalesce(p->>'categoria', categoria), responsabilidade = v_resp,
    montador_id = v_mont, medidor_resp = v_med, checklist_resp = v_chk,
    ocorrido = btrim(coalesce(p->>'ocorrido', ocorrido)), solucao = btrim(coalesce(p->>'solucao','')),
    custo = v_custo, custo_desc = btrim(coalesce(p->>'custoDesc','')), desconto_montador = v_desc,
    atualizado_em = now(), atualizado_por = auth.uid()
  where chamado_id = p_id;

  if c.status = 'aberta' then update public.chamados set status = 'tratativa' where id = p_id; end if;

  -- histórico sem valores (quem acompanha o chamado vê o histórico; valores só no registro)
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
  perform public._reg(p_id, txt);
end $$;

grant execute on function public.salvar_posvenda(text, jsonb), public.posvenda_relato(text, text, text) to authenticated;
revoke execute on function public.salvar_posvenda(text, jsonb), public.posvenda_relato(text, text, text) from anon, public;
