-- Correção de quem conta como "quem montou".
--
-- A primeira versão pegava a última O.S. qualquer, e isso trazia gente errada: a Mônica Santos
-- aparecia como quem agendou (ela é do depósito, não agenda montagem) e os montadores com
-- "(Assistência)" no nome apareciam como quem montou (eles só atendem entrega/assistência).
-- Medido: com o filtro de O.S. de origem a Mônica Santos SAI inteira da lista de quem agenda, e
-- sobram exatamente as agendadoras de montagem (francilene 3.899, bruna.gisele 2.865,
-- Natallia 2.671, Andressa Sanches 1.895 O.S.).
--
-- Como o Exact separa (19.651 linhas):
--   O.S. 123                      13.299  montagem de origem
--   S.A. 123                       3.338  solicitação de assistência
--   O.S. 123-456 (Assist. Téc.)    2.165  assistência técnica sobre a O.S.
--   S.A.A. 123                       849  assistência reincidente
-- e, dentro das O.S. normais, 246 têm montador "(Assistência)" — são entrega/assistência.
create or replace function public.montagem_do_cliente(p_cliente text, p_limite int default 6)
returns jsonb language sql stable security definer set search_path to '' as $$
  with pref as (select public._nome_norm(coalesce(p_cliente, '')) as p)
  select coalesce(jsonb_agg(j order by dm desc nulls last, imp desc), '[]'::jsonb) from (
    select jsonb_build_object(
             'os', m.os, 'cliente', m.cliente, 'status', m.status, 'tipos', m.tipos,
             'data', m.data_montagem, 'fim', m.data_finalizacao, 'total', m.total,
             'feita', (m.data_montagem is not null and m.data_montagem <= current_date),
             'origem', (m.os ilike 'O.S.%' and m.os not ilike '%(Assist%'
                        and coalesce(m.montador, '') not ilike '%(Assistência)%'),
             'servico', case when m.os ilike 'S.A.A.%' then 'assistência (reincidente)'
                             when m.os ilike 'S.A.%' then 'assistência'
                             when m.os ilike '%(Assist%' then 'assistência técnica'
                             when coalesce(m.montador, '') ilike '%(Assistência)%' then 'entrega / assistência'
                             else 'montagem' end,
             'montador', coalesce(mdv.nome, mdn.nome, public._mont_titulo(m.montador)),
             'montadorId', coalesce(mdv.id, mdn.id),
             'operadora', coalesce(opx.nome, opn.nome, public._mont_titulo(m.lider))
           ) as j,
           m.data_montagem as dm, m.importado_em as imp
      from pref, public.montagem_agend m
      left join lateral (select md.id, md.nome from public.montagem_vinculo mv
                           join public.montadores md on md.id = mv.montador_id
                          where public._mont_norm(mv.nome_exact) = public._mont_norm(m.montador)
                          limit 1) mdv on true
      left join lateral (select md.id, md.nome from public.montadores md
                          where public._mont_norm(md.nome) = public._mont_norm(m.montador)
                          order by md.ativo desc nulls last limit 1) mdn on true
      left join lateral (select u.nome from public.usuarios u
                          where public._mont_norm(u.nome_exact) = public._mont_norm(m.lider)
                          order by u.ativo desc nulls last limit 1) opx on true
      left join lateral (select u.nome from public.usuarios u
                          where public._mont_norm(u.nome) = public._mont_norm(m.lider)
                          order by u.ativo desc nulls last limit 1) opn on true
     where pref.p <> '' and m.cliente_norm <> ''      -- cliente_norm <> '': o índice é parcial
       and m.cliente_norm ~>=~ pref.p and m.cliente_norm ~<~ (pref.p || chr(127))
     order by m.data_montagem desc nulls last, m.importado_em desc
     limit greatest(1, least(coalesce(p_limite, 6), 30))
  ) t $$;

-- quem montou é quem fez a montagem DE ORIGEM. Sem O.S. de origem, não inventa: fica sem vínculo
-- e a ficha oferece o histórico para escolher à mão.
create or replace function public._montagem_escolhida(p_cliente text)
returns jsonb language sql stable security definer set search_path to '' as $$
  select x from jsonb_array_elements(public.montagem_do_cliente(p_cliente, 30)) x
   where (x->>'feita')::boolean and (x->>'origem')::boolean limit 1 $$;

-- Trocar à mão quem responde: o nome que veio do Exact pode não ser mais quem cuida disso
-- (a Jaqueline, por exemplo, não está na montagem agora), e às vezes a resposta é o setor inteiro.
create or replace function public.chamado_montagem_pessoa(p_id text, p_quem text, p_valor text default '')
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c public.chamados; m jsonb; v text := btrim(coalesce(p_valor, '')); rot text;
begin
  if p_quem not in ('montador', 'operadora') then raise exception 'Informe montador ou operadora'; end if;
  select * into c from public.chamados where id = p_id;
  if not found then raise exception 'Solicitação não encontrada'; end if;
  if not public.pode_ver_id(p_id) then raise exception 'Você não tem acesso a esta solicitação'; end if;
  if v = '' then v := case when p_quem = 'operadora' then 'Setor de Montagem' else 'Montador não identificado' end; end if;
  rot := case when p_quem = 'montador' then 'Montador' else 'Quem agendou' end;
  m := coalesce(c.tratativa->'montagem', '{}'::jsonb)
       || jsonb_build_object(p_quem, v, 'de', 'mao', 'por', public._nome(auth.uid()), 'em', now());
  if p_quem = 'montador' then m := m - 'montadorId'; end if;
  update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('montagem', m)
   where id = p_id;
  perform public._reg(p_id, '🔧 ' || rot || ' alterado para ' || v || ' por ' || public._nome(auth.uid()));
  return m;
end $$;

revoke all on function public.chamado_montagem_pessoa(text, text, text) from public, anon;
grant execute on function public.chamado_montagem_pessoa(text, text, text) to authenticated;

-- Refaz o vínculo do que foi gravado pela regra antiga; sem O.S. de origem, tira o vínculo.
-- Resultado: 823 de 1.061 apontando para montagem de origem, 0 montador de assistência,
-- Mônica Santos fora da lista de quem agendou.
do $$
declare n int;
begin
  perform set_config('alianca.sistema', '1', true);
  loop
    with alvo as (
      select c.id, public._montagem_escolhida(c.cliente) as m from public.chamados c
       where coalesce(c.tratativa, '{}'::jsonb) ? 'montagem'
         and (c.tratativa->'montagem'->>'origem') is null
         and coalesce(c.tratativa->'montagem'->>'de', 'auto') = 'auto'
       limit 300)
    update public.chamados c
       set tratativa = case when a.m is null then c.tratativa - 'montagem'
                            else c.tratativa || jsonb_build_object('montagem', a.m || jsonb_build_object('de', 'auto', 'em', now())) end
      from alvo a where a.id = c.id;
    get diagnostics n = row_count;
    exit when n = 0;
  end loop;
end $$;
