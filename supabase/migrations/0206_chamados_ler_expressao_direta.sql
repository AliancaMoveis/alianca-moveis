-- Política de leitura de chamados com a expressão escrita direto, e verificador de sincronia.
--
-- Por que a expressão aparece repetida aqui em vez de uma chamada a pode_ver_chamado_ctx:
-- o planejador só embute a função quando o argumento de contexto é constante — é o que acontece
-- dentro de carregar_principal, onde o contexto é uma variável plpgsql. Dentro de uma política o
-- contexto é uma subconsulta, e aí o planejador recusa o inlining e mantém a chamada por linha.
-- Medido em produção, para o mesmo resultado: 520 ms com a chamada de função, 179 ms com a
-- expressão direta (antes de tudo isso eram 2.600 ms).
--
-- Cada leitura do contexto está escrita como (select public._ctx_ver()). Nessa forma o Postgres
-- a transforma em InitPlan e calcula uma única vez por consulta; escrita direta, viraria uma
-- chamada de função por linha para cada uma das ~36 ocorrências.
--
-- A função pode_ver_chamado_ctx segue sendo a definição escrita da regra (usada por
-- carregar_principal e pelas demais funções). Para as duas nunca saírem de sincronia, a função
-- conferir_regra_chamados() no fim deste arquivo compara as duas em todos os perfis de permissão
-- ativos. RODAR DEPOIS DE QUALQUER MUDANÇA NA REGRA DE VISIBILIDADE — deve devolver zero linhas:
--     select * from public.conferir_regra_chamados();

alter policy chamados_ler on public.chamados using (
  coalesce((select ((x->>'ges')::boolean and not coalesce((x->>'som')::boolean, false))
            from (select public._ctx_ver() as x) t), false)
  or (
    coalesce(((select public._ctx_ver())->>'ok')::boolean, false) and case
      when chamados.tipo = 'porta' then
        coalesce(((select public._ctx_ver())->>'ges')::boolean, false)
        or coalesce((select public._ctx_ver())->'ms' ?| array['presenca','gerente_loja'], false)
        or coalesce(chamados.atendente_id = ((select public._ctx_ver())->>'uid')::uuid, false)
        or coalesce(chamados.solicitante_id = ((select public._ctx_ver())->>'uid')::uuid, false)
        or coalesce((select public._ctx_ver())->'tr' ? chamados.id, false)
      when chamados.tipo = 'juridico' then
        coalesce(((select public._ctx_ver())->>'ges')::boolean, false)
        or coalesce((select public._ctx_ver())->'ms' ? 'juridico', false)
      else coalesce(case
        when ((select public._ctx_ver())->>'som')::boolean then
          coalesce(chamados.consultor_id = ((select public._ctx_ver())->>'uid')::uuid, false)
          or coalesce(chamados.atendente_id = ((select public._ctx_ver())->>'uid')::uuid, false)
          or coalesce(chamados.medidor_id = ((select public._ctx_ver())->>'uid')::uuid, false)
          or (chamados.tipo = 'erro_venda' and chamados.tratativa->'erroVenda'->>'vendedorId' = (select public._ctx_ver())->>'uid')
          or coalesce((select public._ctx_ver())->'tr' ? chamados.id, false)
        when ((select public._ctx_ver())->>'ges')::boolean then true
        when (select public._ctx_ver())->'pre' ? chamados.tipo then
          (((select public._ctx_ver())->>'mkt')::boolean and (
             not ((select public._ctx_ver())->'ms' ? 'gerente_loja')
             or (select public._ctx_ver())->'ms' ?| array['marketing_supervisao','marketing_operadora','presenca','proprietario']
             or chamados.data_loja is not null or chamados.atendente_id is not null))
          or (select public._ctx_ver())->'ms' ? 'suporte_consultores'
          or coalesce(chamados.setor_destino <> 'atendente_cliente' and (select public._ctx_ver())->'ms' ? chamados.setor_destino, false)
          or coalesce(chamados.atendente_id = ((select public._ctx_ver())->>'uid')::uuid, false)
          or coalesce(chamados.solicitante_id = ((select public._ctx_ver())->>'uid')::uuid, false)
          or coalesce(chamados.responsavel_mkt = ((select public._ctx_ver())->>'uid')::uuid, false)
          or ((select public._ctx_ver())->'ms' ? 'medidas_supervisao' and chamados.consultor_id is not null)
        when ((select public._ctx_ver())->>'tudo')::boolean then
          not ((select public._ctx_ver())->'ms' ? 'supervisao'
               and chamados.tipo in ('checklist','medidas')
               and not coalesce((select public._ctx_ver())->'ms' ? chamados.setor_destino, false))
        when (select public._ctx_ver())->'ms' ? 'callcenter' then true
        else
          coalesce(chamados.setor_destino <> 'atendente_cliente' and (select public._ctx_ver())->'ms' ? chamados.setor_destino, false)
          or coalesce(chamados.atendente_id = ((select public._ctx_ver())->>'uid')::uuid, false)
          or coalesce(chamados.solicitante_id = ((select public._ctx_ver())->>'uid')::uuid, false)
          or coalesce(chamados.medidor_id = ((select public._ctx_ver())->>'uid')::uuid, false)
          or (chamados.tipo = 'medidas' and ((select public._ctx_ver())->'ms' ? 'checklist' or (select public._ctx_ver())->'ms' ? 'medidas_supervisao'))
      end, false) end)
);

-- Verificador: lê a expressão real da política no catálogo, avalia e compara com o que a função
-- pode_ver_chamado_ctx devolve, para um usuário representante de cada perfil de permissão ativo.
-- Deve devolver zero linhas. Se devolver alguma, a política e a função divergiram.
create or replace function public.conferir_regra_chamados()
returns table (nome text, pela_politica int, pela_funcao int)
language plpgsql security definer set search_path to '' as $$
declare
  r record; n1 int; n2 int; ctx jsonb; qual text;
  claims_orig text := coalesce(current_setting('request.jwt.claims', true), '');
begin
  select pg_catalog.pg_get_expr(p.polqual, p.polrelid) into qual
    from pg_catalog.pg_policy p
   where p.polrelid = 'public.chamados'::regclass and p.polname = 'chamados_ler';
  if qual is null then raise exception 'política chamados_ler não encontrada'; end if;

  for r in
    select distinct on (us.somente_atribuidos, coalesce(us.edita_agenda,false),
        (select coalesce(array_agg(x.setor_id order by x.setor_id),'{}') from public.usuario_setores x where x.usuario_id=us.id))
      us.id, us.nome
    from public.usuarios us where us.ativo
    order by us.somente_atribuidos, coalesce(us.edita_agenda,false),
      (select coalesce(array_agg(x.setor_id order by x.setor_id),'{}') from public.usuario_setores x where x.usuario_id=us.id), us.nome
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.id, 'role','authenticated')::text, true);
    perform set_config('alianca.ctx', '', true);
    ctx := public._ctx_ver();
    select count(*) into n2 from public.chamados c where public.pode_ver_chamado_ctx(c.*, ctx);
    perform set_config('alianca.ctx', '', true);
    execute 'select count(*) from public.chamados where ' || qual into n1;
    if n1 is distinct from n2 then
      nome := r.nome; pela_politica := n1; pela_funcao := n2; return next;
    end if;
  end loop;
  perform set_config('request.jwt.claims', claims_orig, true);
  perform set_config('alianca.ctx', '', true);
end $$;

revoke all on function public.conferir_regra_chamados() from public, anon, authenticated;
