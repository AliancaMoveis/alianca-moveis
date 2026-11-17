-- _ctx_ver() memorizado por requisição.
--
-- O contexto de visibilidade (quem é o usuário, setores, se é Gestão, transferências pendentes)
-- era recalculado a cada chamada. Como a expressão de permissão referencia o contexto dezenas de
-- vezes, isso significava dezenas de recálculos por consulta — cada um lendo usuarios,
-- usuario_setores, setores, tipos e transferencias.
--
-- Agora o resultado é guardado em set_config('alianca.ctx', ..., true). O terceiro argumento
-- "true" limita o cache à transação em curso, e o PostgREST abre uma transação por requisição:
-- o contexto vale apenas para aquela requisição e some em seguida. Uma mudança de permissão
-- vale imediatamente na requisição seguinte.

create or replace function public._ctx_ver()
returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v text := current_setting('alianca.ctx', true);
begin
  if v is not null and v <> '' then return v::jsonb; end if;
  v := (select (case when auth.uid() is null or not public.usuario_ativo() then jsonb_build_object('ok', false)
    else jsonb_build_object('ok', true, 'uid', auth.uid(), 'som', public.somente_atribuidos(), 'ges', public.eh_gestao(),
      'ms', to_jsonb(public.meus_setores()),
      'mkt', public.tem_lib('verMarketing') or 'presenca' = any(public.meus_setores()) or coalesce((select u.edita_agenda from public.usuarios u where u.id = auth.uid()), false),
      'tudo', public.tem_lib('verTudo'),
      'pre', (select coalesce(jsonb_agg(t.id), '[]'::jsonb) from public.tipos t where t.presale),
      'tr', (select coalesce(jsonb_agg(t.chamado_id), '[]'::jsonb) from public.transferencias t
              where t.status = 'pendente' and t.para_usuario = auth.uid())) end)::text);
  perform set_config('alianca.ctx', v, true);   -- true = só nesta transação
  return v::jsonb;
end $$;
