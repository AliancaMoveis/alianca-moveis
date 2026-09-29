-- Auxílio fixo do consultor e do medidor: config.auxilio_fixo (R$ 1.500,00) pago todo dia config.dia_auxilio (15).
-- Entra no extrato/relatório de pagamento quando o dia 15 cai dentro do período. Não entra no fechamento de comissões.
alter table public.config add column if not exists auxilio_fixo numeric(12,2) not null default 1500;
alter table public.config add column if not exists dia_auxilio int not null default 15 check (dia_auxilio between 1 and 28);
