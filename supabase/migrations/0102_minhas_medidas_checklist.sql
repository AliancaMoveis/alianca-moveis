-- Quem mede (consultor/medidor) não vê o checklist, mas precisa da urgência: data do checklist agendado da venda de cada medida dele
create or replace function public.minhas_medidas_checklist() returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_object_agg(m.pedido, k.tratativa->'checklist'->>'agendadoPara'), '{}'::jsonb)
  from public.chamados m
  join lateral (select k.tratativa from public.chamados k where k.tipo = 'checklist' and k.pedido = m.pedido and k.status <> 'concluida'
                and k.tratativa->'checklist'->>'etapa' = 'agendado' order by k.criado_em desc limit 1) k on true
  where m.tipo = 'medidas' and m.medidor_id = auth.uid() and nullif(m.pedido, '') is not null;
$$;
revoke all on function public.minhas_medidas_checklist() from public, anon;
grant execute on function public.minhas_medidas_checklist() to authenticated;
