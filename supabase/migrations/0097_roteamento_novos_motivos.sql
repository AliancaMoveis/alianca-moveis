-- Roteamento pedido pelo Bruno: Atualização de endereço → Salete (Supervisão); Previsão de assistência e Garantia expirada → Call center
update public.tipos set setor_destino = case id when 'atualizacao_endereco' then 'supervisao' else 'callcenter' end where id in ('atualizacao_endereco','previsao_assistencia','garantia_expirada');
