-- O financeiro é quem paga a comissão, mas não enxergava o agrupamento: ck_recup_grupos só
-- respondia para Gestão, Checklist e Supervisão. Para a Regina a lista voltava vazia e o painel
-- nem desenhava — quem aprova o pagamento precisa ver de onde vem a diferença.
--
-- Duas mudanças (aplicadas no banco em 27/11/2026):
--
-- 1) ck_recup_grupos: 'financeiro' entra na lista de setores que podem LISTAR os grupos.
--    (o corpo da função é o mesmo de antes; só a linha dos setores mudou)
--
-- 2) _pode_agrupar_recup(): trava nova usada por ck_recup_grupo_aplicar e
--    ck_recup_grupo_desfazer no lugar de eh_gestao() direto. O financeiro passa a poder
--    unificar, a pedido do Bruno. Isso enfraquece a separação de funções — quem aprova o
--    pagamento passa a poder aumentá-lo. Para voltar a só-Gestão, trocar o corpo por
--    "select public.eh_gestao()".
create or replace function public._pode_agrupar_recup()
returns boolean language sql stable security definer set search_path to '' as $$
  select public.eh_gestao() or exists (
    select 1 from public.usuario_setores s
    where s.usuario_id = auth.uid() and s.setor_id = 'financeiro');
$$;
