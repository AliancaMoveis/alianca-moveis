-- status_cliente 'atendido' = "Atendimento finalizado" (final, sem pendência): _label, _final_cliente, status_cliente_de,
-- iniciar_atendimento, agenda_publica_dia atualizados via replace.
-- Visitas importadas: data_loja = data_visita (visita paga R$40), clientes só-visita → atendente_cliente/concluida/atendido.
-- agenda_loja e agenda_publica_dia ignoram registros importados (importadoVisita / visitaImportada).
alter type public.status_cliente add value if not exists 'atendido';
