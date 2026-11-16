-- Medidas · traz do Exact o que o 360 não tinha: a observação da venda (ambientes a medir) e as fotos da medição.
--
-- O quadro de Medição do Exact (/tickets/measuring/board) devolve só `hasAttachments` — por isso o 360 sabia que
-- havia fotos lá ("Fotos no Exact") mas não tinha as fotos, e a Supervisão precisava abrir o Exact para aprovar.
-- O cartão (/ticket/measuring/:id) traz as duas coisas: `notes` (onde o vendedor escreve quantos e quais ambientes
-- serão medidos) e `attachments` (cada foto com URL pública). Isto guarda as duas no 360.
--
-- · medida_exact_pendentes(n)      → quais medidas buscar agora (a fila, por prioridade)
-- · medida_exact_detalhe_ok(id, p) → guarda a observação e cadastra as fotos que ainda não estão no 360
--
-- As fotos entram em `anexos` com a URL do Exact e SEM storage_path, de propósito: `medida_fotos_exact` só manda
-- para o Exact o que tem storage_path, então foto que veio de lá nunca volta para lá.

create or replace function public.medida_exact_pendentes(p_limite int default 20)
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'exactId', ex) order by prio, atualizado_em desc), '[]'::jsonb)
  from (
    select c.id, c.tratativa->'medida'->>'exactId' as ex, c.atualizado_em,
      case coalesce(c.tratativa->'medida'->>'etapa', '')
        when 'realizada' then 1 when 'validar' then 1   -- esperando a Supervisão aprovar: é quem precisa das fotos agora
        when 'agendada' then 2 when 'pendente' then 2   -- ainda vai ser medida: precisa da observação dos ambientes
        else 3 end as prio
    from public.chamados c
    where c.tipo = 'medidas'
      and nullif(c.tratativa->'medida'->>'exactId', '') is not null
      and c.status <> 'concluida'
      and (c.tratativa->'medida'->>'detalheEm' is null
           or (c.tratativa->'medida'->>'detalheEm')::timestamptz < now() - interval '12 hours')
    order by prio, c.atualizado_em desc
    limit greatest(1, least(p_limite, 60))
  ) s;
$$;

create or replace function public.medida_exact_detalhe_ok(p_id text, p jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c public.chamados := public._medida(p_id); novas int := 0; f jsonb; med jsonb;
begin
  -- fotos da medição no Exact que o 360 ainda não tem (confere pela URL, então rodar de novo não duplica)
  for f in select * from jsonb_array_elements(coalesce(p->'fotos', '[]'::jsonb)) loop
    if nullif(f->>'url', '') is not null
       and not exists (select 1 from public.anexos a where a.chamado_id = c.id and a.url = f->>'url') then
      insert into public.anexos (chamado_id, tipo, nome, url, storage_path, criado_por)
      values (c.id, 'img', coalesce(nullif(btrim(f->>'nome'), ''), 'foto do Exact'), f->>'url', null, null);
      novas := novas + 1;
    end if;
  end loop;

  med := coalesce(c.tratativa->'medida', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'detalheEm', to_jsonb(now()),
    'obsVenda',  nullif(btrim(coalesce(p->>'obs', '')), ''),
    'ambientes', nullif(btrim(coalesce(p->>'ambientes', '')), ''),
    'qtdAmbientes', case when (p->>'qtd') ~ '^[0-9]+$' then (p->>'qtd')::int else null end,
    'fotosExact', (select nullif(count(*), 0) from public.anexos a where a.chamado_id = c.id and a.url like 'https://alianca-bucket%')));

  update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('medida', med)
   where id = c.id;

  if novas > 0 then
    perform public._reg(c.id, '📷 ' || novas || ' foto(s) da medição no Exact trazidas para o 360');
  end if;
  return jsonb_build_object('ok', true, 'novas', novas);
end $$;

revoke all on function public.medida_exact_pendentes(int) from public, anon, authenticated;
revoke all on function public.medida_exact_detalhe_ok(text, jsonb) from public, anon, authenticated;
