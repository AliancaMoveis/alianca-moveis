-- Conta de pagamento dos montadores: dado sensível — só a Gestão (Administração) lê e altera. O Pós-venda cuida só do cadastro básico.
-- (os montadores e contas da planilha PAGAMENTO MONTADORES foram carregados direto no banco — dados bancários não ficam no repositório)
create or replace function public.pode_conta_montador() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.usuario_ativo() and public.eh_gestao();
$$;

-- cadastro de montadores também passa a ser só da Gestão (Cadastros → Montadores); todos continuam lendo a lista para escolher o montador
create or replace function public.pode_montadores() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.usuario_ativo() and public.eh_gestao();
$$;
