-- Montagem (am-235): aprovação do pagamento no 360.
alter table public.montagem_efet add column if not exists aprovado_em timestamptz, add column if not exists aprovado_por text;
-- montagem_aprovar(p_chaves text[], p_desfazer bool): Gestão aprova (ou desfaz) O.S. aguardando. A importação do Exact não
-- mexe nessas colunas, então a aprovação do 360 não se perde ao subir o relatório de novo.
-- montagem_fechar: O.S. com aprovado_em e status "AGUARDANDO APROVAÇÃO…" entra como aprovada no fechamento.
-- montagem_avulsa_salvar: tipo 'frete_assistencia' (além de servico_loja, frete, outro).
