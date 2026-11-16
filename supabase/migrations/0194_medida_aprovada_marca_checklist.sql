-- 0194: medida aprovada SEMPRE marca o checklist da venda
-- Antes, só a aprovação feita dentro do 360 (medida_liberar) marcava o checklist com medidaOk.
-- Quando a medida virava "liberada" pelo sincronismo do Exact, o checklist ficava sem a marca e continuava
-- aparecendo como "aguardando Medidas". Agora um gatilho marca o checklist em qualquer caminho
-- (aprovação no 360, sincronismo do Exact ou ajuste manual).

create or replace function public._trg_medida_ok_checklist() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if new.tipo <> 'medidas' then return null; end if;
  if coalesce(new.tratativa->'medida'->>'etapa', '') <> 'liberada' then return null; end if;
  if tg_op = 'UPDATE' and coalesce(old.tratativa->'medida'->>'etapa', '') = 'liberada' then return null; end if;

  -- não dispara avisos nem o envio ao Exact por causa desta marcação
  perform set_config('alianca.sistema', '1', true);
  update public.chamados k
     set tratativa = coalesce(k.tratativa, '{}'::jsonb) || jsonb_build_object('checklist',
           coalesce(k.tratativa->'checklist', '{}'::jsonb)
           || jsonb_build_object('medidaOk', true, 'medidaOkEm', now(), 'medidaId', new.id))
   where k.tipo = 'checklist'
     and (k.id = new.vinculado_a or (nullif(new.pedido, '') is not null and k.pedido = new.pedido))
     and not coalesce((k.tratativa->'checklist'->>'medidaOk')::boolean, false);
  get diagnostics n = row_count;
  perform set_config('alianca.sistema', '0', true);
  if n > 0 then
    perform public._reg(k.id, '📐 Medida oficial aprovada (' || new.id || ') — fotos disponíveis na ficha da medida')
      from public.chamados k
     where k.tipo = 'checklist' and (k.id = new.vinculado_a or (nullif(new.pedido, '') is not null and k.pedido = new.pedido))
       and (k.tratativa->'checklist'->>'medidaId') = new.id;
  end if;
  return null;
end $$;
revoke all on function public._trg_medida_ok_checklist() from public, anon, authenticated;
drop trigger if exists medida_ok_checklist on public.chamados;
create trigger medida_ok_checklist after insert or update on public.chamados
  for each row execute function public._trg_medida_ok_checklist();

-- acerto do que já estava aprovado e ficou sem a marca no checklist
do $do$
declare n int;
begin
  perform set_config('alianca.sistema', '1', true);
  update public.chamados k
     set tratativa = coalesce(k.tratativa, '{}'::jsonb) || jsonb_build_object('checklist',
           coalesce(k.tratativa->'checklist', '{}'::jsonb)
           || jsonb_build_object('medidaOk', true, 'medidaOkEm', now(), 'medidaId', m.id))
    from public.chamados m
   where m.tipo = 'medidas' and coalesce(m.tratativa->'medida'->>'etapa', '') = 'liberada'
     and k.tipo = 'checklist' and nullif(m.pedido, '') is not null and k.pedido = m.pedido
     and not coalesce((k.tratativa->'checklist'->>'medidaOk')::boolean, false);
  get diagnostics n = row_count;
  perform set_config('alianca.sistema', '0', true);
  raise notice 'checklists acertados: %', n;
end $do$;
