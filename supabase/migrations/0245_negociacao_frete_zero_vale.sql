-- Negociação: quando o gerente tirava o frete na mesa, a tela mandava "" e o banco gravava NULL.
-- Ao reabrir, freteDe() não distinguia "tirei o frete" de "nunca mexi" e voltava ao frete do vendedor
-- (e com o frete errado o % de desconto era recalculado errado também).
-- A tela passa a mandar "0.00". Aqui o conserto do que já estava gravado: só nos pré-pedidos que
-- CONTINUAM na negociação — quem saiu da mesa (neg_status = '') mantém o frete do vendedor intacto.
update public.pre_pedidos
   set neg_frete = 0
 where neg_em is not null
   and neg_frete is null
   and neg_status in ('enviado','negociando','fechado');
