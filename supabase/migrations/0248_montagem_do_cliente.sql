-- Quem montou e quem agendou: o histórico de montagem de um cliente.
-- Serve a solicitação de retorno do montador, assistência, vistoria e montagem, que hoje chegam
-- no setor sem dizer quem fez o serviço reclamado. No montagem_agend o "lider" é a AGENDADORA
-- (a própria função de import diz: "1 agendamento = O.S. + dia de inclusão + agendadora").
--
-- Medições que decidiram o desenho:
--  · o cruzamento é por PREFIXO do nome. Nada de aproximação por 2 nomes: testado, devolve gente
--    errada ("CARLOS ALBERTO SOARES" cairia em "CARLOS ALBERTO DELPHIM"), e atribuir a montagem ao
--    montador errado é pior do que não mostrar nada. 404 de 461 chamados batem por prefixo;
--  · dentro de função o prefixo é parâmetro e o planejador não tira os limites do índice de um LIKE,
--    então usa os operadores de ordem de bytes do text_pattern_ops (~>=~ / ~<~). _nome_norm só
--    devolve [a-z ] (0x20 e 0x61..0x7A), logo chr(127) é teto seguro;
--  · o cliente_norm <> '' é OBRIGATÓRIO no WHERE: o índice é parcial, e sem ele vira Seq Scan
--    (medido: 1.185 ms contra 2 ms);
--  · o vínculo montador_exact -> montador do 360 só tem 7 dos 116 nomes que aparecem no Exact,
--    então tenta também pelo próprio nome (89 dos 116 batem).

-- No Exact o montador e a agendadora podem vir como login ("bruna.gisele", "aldre.dias").
-- Só mexe no que parece login: nome já escrito direito ("Jaqueline de Jesus Jorge") fica como está.
create or replace function public._mont_titulo(p text)
returns text language sql immutable set search_path to '' as $$
  select case
    when coalesce(btrim(p), '') = '' then ''
    when p like '%.%' then initcap(replace(btrim(p), '.', ' '))
    when p = lower(p) and position(' ' in btrim(p)) = 0 then initcap(btrim(p))
    else btrim(p) end $$;

create index if not exists montadores_nome_norm_idx on public.montadores (public._mont_norm(nome));
create index if not exists montagem_vinculo_nome_norm_idx on public.montagem_vinculo (public._mont_norm(nome_exact));
create index if not exists usuarios_nome_norm_idx on public.usuarios (public._mont_norm(nome));
create index if not exists usuarios_nome_exact_norm_idx on public.usuarios (public._mont_norm(nome_exact));

create or replace function public.montagem_do_cliente(p_cliente text, p_limite int default 6)
returns jsonb language sql stable security definer set search_path to '' as $$
  with pref as (select public._nome_norm(coalesce(p_cliente, '')) as p)
  select coalesce(jsonb_agg(j order by dm desc nulls last, imp desc), '[]'::jsonb) from (
    select jsonb_build_object(
             'os', m.os, 'cliente', m.cliente, 'status', m.status, 'tipos', m.tipos,
             'data', m.data_montagem, 'fim', m.data_finalizacao, 'total', m.total,
             'feita', (m.data_montagem is not null and m.data_montagem <= current_date),
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
     where pref.p <> ''
       and m.cliente_norm <> ''                      -- obrigatório: o índice é parcial
       and m.cliente_norm ~>=~ pref.p
       and m.cliente_norm ~<~ (pref.p || chr(127))
     order by m.data_montagem desc nulls last, m.importado_em desc
     limit greatest(1, least(coalesce(p_limite, 6), 30))
  ) t $$;

revoke all on function public.montagem_do_cliente(text, int) from public, anon;
grant execute on function public.montagem_do_cliente(text, int) to authenticated;
