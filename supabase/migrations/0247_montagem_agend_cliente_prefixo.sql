-- No Exact o "cliente" da O.S. vem com bairro ou endereço colado no nome
-- ("JOSE OLIVIO CORREA SÍTIO CERCADO"), então o cruzamento é por PREFIXO: o nome do
-- cliente da solicitação é o começo do campo da O.S. Btree comum não serve para LIKE 'x%'
-- na collation do banco — precisa de text_pattern_ops.
create index if not exists montagem_agend_cliente_pref_idx
  on public.montagem_agend (cliente_norm text_pattern_ops) where cliente_norm <> '';
drop index if exists public.montagem_agend_cliente_norm_idx;
