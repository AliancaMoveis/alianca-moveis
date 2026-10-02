-- Checklist: excluir cliente(s) da fila (com confirmação na tela). Um por vez: setor Checklist ou Gestão; vários de uma vez: só Gestão.
create or replace function public.checklist_excluir(p_ids text[]) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.pode_checklist() then raise exception 'Só o setor Checklist ou a Gestão excluem clientes do checklist'; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'Nenhum cliente selecionado'; end if;
  if array_length(p_ids, 1) > 1 and not public.eh_gestao() then raise exception 'Excluir vários de uma vez é só para a Gestão'; end if;
  if exists (select 1 from public.chamados c where c.id = any(p_ids) and c.tipo <> 'checklist') then raise exception 'Só clientes do checklist podem ser excluídos aqui'; end if;
  if exists (select 1 from public.chamados m where m.tipo = 'medidas' and m.vinculado_a = any(p_ids) and m.status <> 'concluida') then
    raise exception 'Há medida em andamento pedida para este cliente — conclua ou cancele a medida antes de excluir';
  end if;
  update public.chamados set vinculado_a = null where vinculado_a = any(p_ids);
  delete from public.notificacoes where chamado_id = any(p_ids);
  delete from public.chamados where id = any(p_ids) and tipo = 'checklist';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.checklist_excluir(text[]) from public, anon;
grant execute on function public.checklist_excluir(text[]) to authenticated;

-- importação devolve também quantos entraram já agendados
do $do$ declare d text; begin
  d := pg_get_functiondef('public.checklist_importar(jsonb)'::regprocedure);
  d := replace(d, 'novos int := 0;', 'novos int := 0; nag int := 0;');
  d := replace(d, $x$    novos := novos + 1;$x$, $x$    novos := novos + 1; if ag is not null then nag := nag + 1; end if;$x$);
  d := replace(d, $x$jsonb_build_object('novos', novos, 'ignorados', ign)$x$, $x$jsonb_build_object('novos', novos, 'ignorados', ign, 'agendados', nag)$x$);
  execute d;
end $do$;
