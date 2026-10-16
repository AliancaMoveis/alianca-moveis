-- 0142 · (aplicado via SQL) "Estou ciente" dos cancelamentos, exclusão lógica de cliente do marketing, César vendedor
create table if not exists public.clientes_excluidos (
  id text primary key, cliente text, telefone text, tipo text, dados jsonb not null, motivo text not null, por uuid, por_nome text, em timestamptz not null default now());
alter table public.clientes_excluidos enable row level security;
create policy clientes_excluidos_ler on public.clientes_excluidos for select using ((select public.gere_mkt()));
-- ciente_cancelamento(p_id): grava tratativa.ciente_<status>.<uid> {em, por} (Gestão / Supervisão Marketing)
-- mkt_excluir_cliente(p_id, p_motivo): sem venda; guarda cópia em clientes_excluidos, marca tratativa.excluido e conclui (some das listas)
-- vendedor_assumir: recusa cliente excluído
-- César: cesar@ passou de Medidas para vendedor projetista (folga ter, tarde); os 4 clientes de cesar.vendas@ foram para ele; cesar.vendas@ desativado
