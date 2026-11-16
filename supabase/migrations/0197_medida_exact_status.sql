-- 0197: 360 → Exact · mover o cartão no quadro de Medição
-- Rotas descobertas por sondagem em 16/11/2026 (sempre com corpo inválido primeiro, sem tocar em cartão real):
--   PUT /ticket/measuring/:fieldReportId  { status: <MeasuringBoardStatus> }
--   valores: MEASURING_PENDING · MEASURING_WAITING_MEASURING · MEASURING_WAITING_ANALYSIS
--            MEASURING_APPROVED · MEASURING_WIP · MEASURING_CANCELLED
--   O mesmo PUT aceita ownerId (quem mede) — falta o mapa de ids de usuário do Exact.
-- medida_fotos_exact passa a devolver o cartão, a coluna atual e a coluna desejada pela etapa do 360;
-- medida_exact_status_ok registra o que foi movido (ou o erro) no histórico da medida.

-- (corpo idêntico ao aplicado no banco: ver medida_fotos_exact e medida_exact_status_ok)
