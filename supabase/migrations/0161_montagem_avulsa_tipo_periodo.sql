-- Montagem (am-223): ordem avulsa com tipo (servico_loja | frete | outro) e período (data_montagem = início, data_finalizacao = fim).
alter table public.montagem_efet add column if not exists tipo text;
-- montagem_avulsa_salvar(p): aceita tipo, de, ate (data = legado); descrição obrigatória só para "outro"; só Gestão.
-- montagem_fechar: agrupa por montador do cadastro (coalesce(mid, montador)), assim a avulsa lançada com o nome do cadastro
-- fica na mesma linha das O.S. do Exact; ordens guardam 'tipo'.
