-- Cliente de prospecção própria do consultor (aplicado via MCP: prospeccao_consultor)
-- chamados.origem = 'prospeccao_consultor'; setor consultor_externo ganhou lib_criar; pode_criar_tipo aceita consultor_externo em tipos presale;
-- criar_chamado: quando quem cadastra é só consultor, o cliente fica com ele (consultor_id = ele, etapa consultor_externo, ou loja se "direto"),
-- exige telefone e registra no histórico; _calc_pagamento_mkt ignora origem = 'prospeccao_consultor'.
alter table public.chamados add column if not exists origem text not null default '';
update public.setores set lib_criar = true where id = 'consultor_externo';
