-- Status do cliente para o vendedor: "Cliente não vai comprar" (novo) e "Atendimento finalizado" (aplicado direto no banco em 30/10/2026).
alter type public.status_cliente add value if not exists 'nao_vai_comprar';
-- _label_status_cliente: 'nao_vai_comprar' → 'Cliente não vai comprar'.
-- vendedor_status: aceita 'nao_vai_comprar' e 'atendido' (parecer obrigatório; o atendimento fica concluído).
-- 'nao_vai_comprar' entrou junto de 'reprovado' nas listas de status encerrados: _final_cliente, status_cliente_de,
-- alterar_status_cliente, iniciar_atendimento, avisos_rotina_em, agenda_publica_buscar/dia/veio_hoje.
