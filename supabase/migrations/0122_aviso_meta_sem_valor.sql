-- aviso diário da meta para as operadoras sem o valor do bônus (valores só depois da aprovação da Supervisão)
DO $$
declare d text; a text := '''Bônus de '' || public._moeda(m.valor) || '' para quem bater a meta.''';
begin
  d := pg_get_functiondef('public.avisos_rotina_em'::regproc);
  if position(a in d) = 0 then raise exception 'âncora não encontrada'; end if;
  d := replace(d, a, '''Bata a meta para ganhar o bônus do dia.''');
  execute d;
end $$;
