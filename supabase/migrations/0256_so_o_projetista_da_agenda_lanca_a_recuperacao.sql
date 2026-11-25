-- Quem lanca a recuperacao nao era conferido: o projetista vinha do que a tela mandava, com
-- o da agenda apenas como reserva. Entao a Silvane podia fazer o checklist da Angela e o
-- valor ia para a Angela -- dinheiro na conta de quem nao fez.
--
-- Agora so lanca quem esta na agenda daquele cliente (inclui dias extras, via
-- _ck_do_projetista). Quem fez sem estar agendado precisa pedir a secretaria para trocar o
-- projetista responsavel -- que e a trava que a Gestao quer, porque corrige o cadastro em
-- vez de deixar o valor no nome errado. A Gestao continua podendo lancar por qualquer um.
--
-- Conferido no checklist da Vanessa Cristina Rocha (agenda: Angela):
-- Angela true; Silvane, Rafael e Wagner false; Bruno (Gestao) passa pelo desvio.
do $mig$
declare d text; de text; para text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ck_recuperacao_salvar';
  if d is null then raise exception 'ck_recuperacao_salvar nao encontrada'; end if;
  de := 'proj := coalesce(nullif(btrim(coalesce(p->>''projetista'','''')), ''''), c.tratativa->''checklist''->>''projetista'', ''—'');';
  para := 'if public.eh_gestao() then' || E'\n'
       || '    proj := coalesce(nullif(btrim(coalesce(p->>''projetista'','''')), ''''), c.tratativa->''checklist''->>''projetista'', ''—'');' || E'\n'
       || '  else' || E'\n'
       || '    -- só o projetista agendado para este cliente lança o valor dele' || E'\n'
       || '    proj := nullif(btrim(coalesce(c.tratativa->''checklist''->>''projetista'','''')), '''');' || E'\n'
       || '    if proj is null then' || E'\n'
       || '      raise exception ''Este checklist ainda não tem projetista na agenda — peça para a secretária definir antes de lançar'';' || E'\n'
       || '    end if;' || E'\n'
       || '    if not public._ck_do_projetista(coalesce(c.tratativa->''checklist'', ''{}''::jsonb), public._ck_meu_projetista()) then' || E'\n'
       || '      raise exception ''Este checklist está na agenda de %. Se foi você quem fez, peça para a secretária trocar o projetista responsável antes de lançar'', proj;' || E'\n'
       || '    end if;' || E'\n'
       || '  end if;';
  if position(de in d) = 0 then raise exception 'ancora nao achada em ck_recuperacao_salvar'; end if;
  execute replace(d, de, para);
end $mig$;
