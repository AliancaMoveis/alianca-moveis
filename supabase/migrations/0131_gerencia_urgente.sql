-- 0131 · Solicitação aberta por gerente de loja (call center/setores): entra sempre como URGENTE e marcada "solicitado pela gerência"
create or replace function public._chamado_gerencia_urgente()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.solicitante_id is not null and not public.tipo_presale(new.tipo)
     and exists (select 1 from public.usuario_setores s where s.usuario_id = new.solicitante_id and s.setor_id = 'gerente_loja') then
    new.urgente := true;
    new.tratativa := coalesce(new.tratativa, '{}'::jsonb) || jsonb_build_object('porGerencia', true);
  end if;
  return new;
end $$;
create trigger chamados_gerencia_urgente before insert on public.chamados for each row execute function public._chamado_gerencia_urgente();

