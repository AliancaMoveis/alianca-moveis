-- Frete de assistência: freteiros tipo 'assistencia' ligados ao nome do montador; romaneio enviado vira ordem avulsa 'frete_assistencia' no pagamento da montagem
alter table frete_freteiros add column if not exists tipo text not null default 'entrega', add column if not exists montador_nome text not null default '';
alter table frete_tat_rom add column if not exists envio_chave text, add column if not exists envio_em timestamptz;
