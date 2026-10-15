-- 0134 · Cliente agendado na loja (Suporte Consultores) mostra o status real escolhido (standby, em obras, orçamento…),
-- não mais sempre "Agendado loja".
DO $$
declare d text; a text := '    if c.setor_destino = ''suporte_consultores'' then return ''agendado_loja''; end if;';
begin
  d := pg_get_functiondef('public.status_cliente_de'::regproc);
  if position(a in d) = 0 then raise exception 'âncora'; end if;
  d := replace(d, a, '    if c.setor_destino = ''suporte_consultores'' then
      return case when c.status_cliente::text in (''orcamento'',''sem_resposta'',''reagendado'',''reprovado'',''em_obras'',''standby'',''em_analise'',''atendido'',''visita_cancelada'') then c.status_cliente else ''agendado_loja'' end;
    end if;');
  execute d;
end $$;
