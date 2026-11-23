-- O nome do cliente da montagem só existe dentro do bruto (string "O.S. 123 | NOME DO CLIENTE | endereço"),
-- o que torna impossível cruzar a solicitação (retorno de montador / assistência / vistoria) com quem montou.
-- Materializa o nome em coluna própria, normalizada e indexada, para a busca ser instantânea.
alter table public.montagem_agend
  add column if not exists cliente text,
  add column if not exists cliente_norm text;

update public.montagem_agend
   set cliente = btrim(split_part(bruto->0->>'os', '|', 2)),
       cliente_norm = public._nome_norm(btrim(split_part(bruto->0->>'os', '|', 2)))
 where cliente is null and bruto is not null;
