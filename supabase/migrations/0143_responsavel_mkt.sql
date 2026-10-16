-- 0143 · (aplicado via SQL) Responsável do marketing (rodízio): chamados.responsavel_mkt (null = quem cadastrou)
-- criar_chamado aceita p.responsavelId (operadora ou Supervisão Marketing ativa); mkt_definir_responsavel(p_id, p_uid) troca depois
-- _calc_pagamento_mkt e pode_ver_chamado_ctx usam coalesce(responsavel_mkt, solicitante_id); Haisla (Supervisão) passa a contar na produção
alter table public.chamados add column if not exists responsavel_mkt uuid;
