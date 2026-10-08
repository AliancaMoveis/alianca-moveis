-- Base de clientes: acesso (Gestão, call center, supervisão), busca, lookup por CPF no atendimento e importação.
-- Aplicada no Supabase como 0107_base_clientes_acesso_importar + 0107b_base_clientes_grants (ver funções no banco):
--   pode_base_clientes(); políticas de leitura usam pode_base_clientes(); base_cliente_salvar libera call center/supervisão;
--   base_clientes_buscar(q): CPF/CNPJ, telefone ou nome, com compras e última compra;
--   base_cliente_por_doc(doc): só cadastro + nº de compras e data da última (sem vendedor e sem valores);
--   base_clientes_importar(clientes, vendas): só Gestão; não sobrescreve campos de editado_manual nem apaga com vazio; vendas por nº (upsert).
--   Sem escrita direta nas tabelas para anon/authenticated (só via funções).
select 1;
