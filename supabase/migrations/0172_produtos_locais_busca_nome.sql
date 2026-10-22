-- Produtos: estoque por local (MATRIZ = loja, LINHA PRONTA = depósito) e busca pelo nome (cada palavra, sem acento).
-- Regra de negócio (no app): na MATRIZ, saldo 1 é o mostruário — não está disponível para venda.
alter table public.produtos add column if not exists locais jsonb not null default '[]'::jsonb;
-- produto_salvar: grava p->'locais' quando vier (aplicado direto no banco, ver pg_get_functiondef)
create or replace function public.produto_lista(p_q text default '')
 returns setof public.produtos language sql stable security definer set search_path to '' as $function$
  select p.* from public.produtos p where public.pode_produtos()
    and not exists (
      select 1 from regexp_split_to_table(btrim(coalesce(p_q,'')), '\s+') w
       where w <> '' and not (translate(lower(concat_ws(' ', p.nome, p.cor, p.codigo, p.ref, p.fabricante, p.tamanho, p.modulo)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
                              like '%' || translate(lower(w), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') || '%'))
  order by p.nome, p.cor limit 300 $function$;
-- produto_importar: com planilhas separadas (MATRIZ / LINHA PRONTA), mantém os locais que não vieram no arquivo
-- e recalcula estoque/reservas/expedição/saldo/deposito somando os locais (aplicado direto no banco).
-- App: itens com descrição em letras minúsculas (linha projetado) não são importados.
-- Setor TI e cadastro de produtos com acesso a Fábricas (fornecedores e telefones dos representantes)
update public.setores set lib_cadastros = true where id = 'produtos';
-- Cadastro de usuários para o TI (setor produtos): pode_usuarios(), usuarios_pode(p_id, p_setores), _setor_restrito(setor)
-- salvar_usuario / desativar_usuario / reativar_usuario: checam usuarios_pode; edge function admin-usuarios v4 idem.
-- produto_importar: ignora no servidor descrições com letra minúscula (linha projetado) e devolve 'projetado'.
