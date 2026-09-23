-- Jurídico: acompanha todos os chamados do call center e os números do pós-venda (custos, responsabilidades),
-- para tratar Reclame Aqui, Procon e processos. Não abre chamados.
insert into public.setores (id, nome, lib_criar, lib_ver_tudo, lib_cadastros, lib_admin, lib_ver_marketing, ordem)
values ('juridico', 'Jurídico', false, true, false, false, false, 14)
on conflict (id) do nothing;
update public.setores set ordem = 15 where id = 'gestao';
update public.setores set ordem = 14 where id = 'juridico';

-- nomes dos setores como a loja chama
update public.setores set nome = 'Solicitação Fábrica' where id = 'prazo_fabrica';
update public.setores set nome = 'Suporte Checklist' where id = 'checklist';
update public.setores set nome = 'Vendedores (loja)' where id = 'atendente_cliente';
update public.setores set nome = 'Marketing' where id = 'marketing_operadora';
update public.setores set nome = 'Supervisão Marketing' where id = 'marketing_supervisao';
update public.setores set nome = 'Consultor externo' where id = 'consultor_externo';

-- números e registros do pós-venda: Pós-venda, Jurídico e Gestão
create or replace function public.pode_ver_posvenda() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.usuario_ativo() and (public.eh_gestao() or public.meus_setores() && array['posvenda','juridico']);
$$;
