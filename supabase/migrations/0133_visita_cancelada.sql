-- 0133 · Consultor marca "Cliente cancelou a visita": status próprio, aviso para a Supervisão do Marketing (Haisla) e quem agendou,
-- e pendência para ela acompanhar (reagendar/redirecionar ou encerrar).
-- (o valor 'visita_cancelada' do enum status_cliente entrou em 0133a)
DO $$
declare d text;
begin
  -- consultor_situacao aceita a nova situação e avisa como o "ausente no endereço"
  d := pg_get_functiondef('public.consultor_situacao'::regproc);
  if position('''em_obras'',''standby'',''em_analise'',''ausente_endereco'')' in d) = 0 or position('if p_status = ''ausente_endereco'' then' in d) = 0 then raise exception 'âncora consultor_situacao'; end if;
  d := replace(d, '''em_obras'',''standby'',''em_analise'',''ausente_endereco'')', '''em_obras'',''standby'',''em_analise'',''ausente_endereco'',''visita_cancelada'')');
  d := replace(d, 'if p_status = ''ausente_endereco'' then', 'if p_status = ''visita_cancelada'' then
    perform public._notificar(array_remove(public._usuarios_setor(array[''marketing_supervisao'']) || c.solicitante_id, null),
      ''❌ Cliente cancelou a visita'', c.cliente || '' — '' || public._nome(auth.uid()) || '': '' || txt, p_id, ''cancelou-'' || p_id || ''-'' || to_char(now(),''YYYYMMDDHH24MI''));
  end if;
  if p_status = ''ausente_endereco'' then');
  execute d;
  -- status do cliente
  d := pg_get_functiondef('public.status_cliente_de'::regproc);
  if position('in (''em_obras'',''standby'',''em_analise'',''ausente_endereco'') then return c.status_cliente;' in d) = 0 then raise exception 'âncora status_cliente_de'; end if;
  d := replace(d, 'in (''em_obras'',''standby'',''em_analise'',''ausente_endereco'') then return c.status_cliente;', 'in (''em_obras'',''standby'',''em_analise'',''ausente_endereco'',''visita_cancelada'') then return c.status_cliente;');
  execute d;
  d := pg_get_functiondef('public._label_status_cliente'::regproc);
  if position('when ''atendido'' then' in d) = 0 then raise exception 'âncora label'; end if;
  d := replace(d, 'when ''atendido'' then', 'when ''visita_cancelada'' then ''Cliente cancelou a visita''
    when ''atendido'' then');
  execute d;
end $$;
