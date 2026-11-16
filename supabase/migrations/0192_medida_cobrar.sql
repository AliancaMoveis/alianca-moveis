-- 0192: Supervisão de Medidas cobra a medida — apita no celular de quem vai medir
-- A Supervisão (Luciene) abre "Pendentes para medir" ou "Aguardando medição", vê a medida atrasada e clica em "⏰ Cobrar".
-- Quem vai medir (consultor externo ou medidor, pelo medidor_id) recebe a notificação no celular.
-- Fica registrado no histórico do chamado e em tratativa.medida.cobrancas (quem cobrou, quando e o recado).
-- Cada clique apita de novo (a tela pede confirmação antes), e a tela mostra quando foi a última cobrança.

create or replace function public.medida_cobrar(p_id text, p_obs text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.chamados := public._medida(p_id);
        m jsonb; quem text := public._nome(auth.uid()); obs text := btrim(coalesce(p_obs, ''));
        alvo uuid; et text; n int; pz text;
begin
  if not (public.eh_sup_medidas() or public.eh_gestao()) then raise exception 'Só a Supervisão de Medidas ou a Gestão cobram a medida'; end if;
  if c.status = 'concluida' then raise exception 'Esta medida já foi encerrada'; end if;
  m := coalesce(c.tratativa->'medida', '{}'::jsonb);
  et := coalesce(m->>'etapa', 'pendente');
  if et not in ('pendente', 'agendada') then raise exception 'Só dá para cobrar medida pendente ou aguardando medição'; end if;
  alvo := c.medidor_id;
  if alvo is null then raise exception 'Direcione a medida para um medidor ou consultor antes de cobrar'; end if;

  m := m || jsonb_build_object('cobradaEm', now(), 'cobradaPor', quem,
    'cobrancas', coalesce(m->'cobrancas', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('em', now(), 'por', quem, 'obs', nullif(obs, ''))));
  update public.chamados set tratativa = jsonb_set(coalesce(tratativa, '{}'::jsonb), '{medida}', m) where id = p_id;
  n := jsonb_array_length(m->'cobrancas');

  -- aviso no celular de quem vai medir (chave por cobrança: cada clique apita de novo)
  pz := coalesce(nullif(m->>'dataLimite', ''), nullif(left(m->>'prazoExact', 10), ''));
  perform public._notificar(array[alvo], '⏰ Medida atrasada — ' || c.cliente,
    coalesce(nullif(obs, ''), 'Esta medida está atrasada. Combine com o cliente e faça a medição o quanto antes.')
      || case when pz is not null then ' · limite ' || to_char(pz::date, 'DD/MM') else '' end
      || case when btrim(coalesce(c.endereco, '')) <> '' then ' · ' || c.endereco else '' end,
    p_id, 'cobrarmedida:' || p_id || ':' || n);
  perform public._reg(p_id, '⏰ Medida cobrada de ' || public._nome(alvo) || ' por ' || quem
    || case when obs <> '' then ' — ' || obs else '' end
    || case when n > 1 then ' (' || n || 'ª cobrança)' else '' end);
  return jsonb_build_object('quem', public._nome(alvo), 'vezes', n);
end $$;
revoke all on function public.medida_cobrar(text, text) from public, anon;
grant execute on function public.medida_cobrar(text, text) to authenticated;
