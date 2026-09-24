-- Status do atendimento do vendedor (em transação separada: valores novos de enum)
alter type public.status_cliente add value if not exists 'orcamento' after 'com_vendedor';
alter type public.status_cliente add value if not exists 'sem_resposta' after 'orcamento';
alter type public.status_cliente add value if not exists 'reagendado' after 'sem_resposta';
alter type public.status_cliente add value if not exists 'reprovado' after 'reagendado';
