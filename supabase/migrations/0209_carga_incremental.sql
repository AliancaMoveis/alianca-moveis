-- Desempenho: a carga principal passa a trazer só o que mudou.
--
-- Até aqui, cada atualização de tela (a cada 45 s por aba aberta, mais toda ação)
-- remontava em JSON os 7.700 clientes, os 35.000 registros de histórico e os 10.000
-- anexos — 24 MB e ~4 s de banco POR CHAMADA. Com dezenas de abas abertas, era o sistema
-- inteiro sendo reescrito dezenas de vezes por minuto: a causa das travadas.
--
-- Agora carregar_principal(p_desde) devolve:
--   · p_desde nulo (primeira carga, F5, ação da própria pessoa): tudo, como antes;
--   · p_desde preenchido: só os clientes mexidos desde então — e deles o histórico,
--     anexos, venda, valores e itens completos, para a tela trocar o conjunto do cliente
--     inteiro (assim o que foi apagado some junto, sem precisar de controle de exclusão).
-- 'ate' é o relógio DO BANCO para a próxima chamada (nunca o do computador de quem usa).
-- 'ids' é a lista do que a pessoa pode ver, para a tela descartar o que saiu da vista.
--
-- O que conta como mudança: atualizado_em do cliente (trigger chamados_tocar), histórico
-- novo, anexo novo, venda ou item de venda mexido. Quase toda ação passa por _reg(), que
-- grava histórico — o histórico é a rede de segurança.
--
-- Conferido com dados reais: a carga cheia de um usuário da Gestão devolve 7.748 clientes
-- e 24 MB; o delta de 10 minutos devolve 52 clientes e 175 kB, cada um idêntico ao que a
-- carga cheia devolveria, e a lista de ids bate exatamente com a da carga cheia.

-- a versão sem argumento sai junto: com as duas, chamar carregar_principal() ficaria ambíguo
drop function if exists public.carregar_principal();
create or replace function public.carregar_principal(p_desde timestamptz default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v jsonb := public._ctx_ver(); ids text[]; idsv text[]; mud text[]; ate timestamptz := now();
begin
  if not coalesce((v->>'ok')::boolean, false) then
    return jsonb_build_object('ate', ate, 'parcial', false, 'chamados', '[]'::jsonb, 'historico', '[]'::jsonb,
      'anexos', '[]'::jsonb, 'vendas', '[]'::jsonb, 'valores', '[]'::jsonb, 'itens', '[]'::jsonb);
  end if;
  select array_agg(c.id) into ids from public.chamados c where public.pode_ver_chamado_ctx(c, v);
  ids := coalesce(ids, '{}');
  select array_agg(c.id) into idsv from public.chamados c where c.id = any(ids) and public.pode_ver_valor_ctx(c, v);
  idsv := coalesce(idsv, '{}');
  -- margem: uma gravação que começou antes de now() e terminou depois dele seria perdida para sempre.
  -- Reenviar 1 min a mais não custa quase nada (a tela substitui o cliente inteiro) e fecha essa fresta.
  p_desde := p_desde - interval '60 seconds';
  if p_desde is null then
    mud := ids;
  else
    select coalesce(array_agg(distinct x), '{}') into mud from (
      select c.id as x from public.chamados c where c.id = any(ids) and c.atualizado_em > p_desde
      union all
      select h.chamado_id from public.historico h where h.chamado_id = any(ids) and h.quando > p_desde
      union all
      select a.chamado_id from public.anexos a where a.chamado_id = any(ids) and a.criado_em > p_desde
      union all
      select s.chamado_id from public.vendas s where s.chamado_id = any(ids)
        and greatest(coalesce(s.registrado_em, 'epoch'::timestamptz), coalesce(s.decidido_em, 'epoch'::timestamptz)) > p_desde
      union all
      select i.chamado_id from public.venda_itens i where i.chamado_id = any(ids)
        and greatest(coalesce(i.registrado_em, 'epoch'::timestamptz), coalesce(i.decidido_em, 'epoch'::timestamptz)) > p_desde
    ) q;
  end if;
  return jsonb_build_object(
    'ate', ate,
    'parcial', p_desde is not null,
    'ids', case when p_desde is null then null else to_jsonb(ids) end,
    'chamados', (select coalesce(jsonb_agg(to_jsonb(c) order by c.criado_em), '[]'::jsonb) from public.chamados c where c.id = any(mud)),
    'historico', (select coalesce(jsonb_agg(jsonb_build_object('chamado_id', h.chamado_id, 'quando', h.quando, 'quem_nome', h.quem_nome, 'texto', h.texto, 'id', h.id) order by h.id), '[]'::jsonb) from public.historico h where h.chamado_id = any(mud)),
    'anexos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'chamado_id', a.chamado_id, 'tipo', a.tipo, 'nome', a.nome, 'url', a.url, 'storage_path', a.storage_path, 'criado_em', a.criado_em, 'criado_por', a.criado_por) order by a.criado_em), '[]'::jsonb) from public.anexos a where a.chamado_id = any(mud)),
    'vendas', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.vendas x where x.chamado_id = any(mud)),
    'valores', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.vendas_valores x where x.chamado_id = any(mud) and x.chamado_id = any(idsv)),
    'itens', (select coalesce(jsonb_agg(to_jsonb(x) order by x.registrado_em), '[]'::jsonb) from public.venda_itens x where x.chamado_id = any(mud) and x.chamado_id = any(idsv)));
end $function$;

revoke all on function public.carregar_principal(timestamptz) from public;
grant execute on function public.carregar_principal(timestamptz) to authenticated, service_role;

-- as colunas de data que a carga incremental consulta
create index if not exists chamados_atualizado_idx on public.chamados (atualizado_em);
create index if not exists historico_quando_idx on public.historico (quando);
create index if not exists anexos_criado_idx on public.anexos (criado_em);

-- o sino de notificações varria a tabela inteira a cada minuto, por pessoa (255 ms e
-- 15.800 páginas por consulta, piorando a cada notificação nova): 255 ms → 2 ms
create index if not exists notificacoes_usuario_id_idx on public.notificacoes (usuario_id, id desc);
