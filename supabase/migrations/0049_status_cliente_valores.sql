alter type public.status_cliente add value if not exists 'em_obras';
alter type public.status_cliente add value if not exists 'standby';
alter type public.status_cliente add value if not exists 'em_analise';
alter type public.status_cliente add value if not exists 'ausente_endereco';
alter type public.status_cliente add value if not exists 'vendido_entrada';
alter table public.vendas add column if not exists tipo_informado text not null default '';
alter table public.vendas_valores add column if not exists entrada_informada numeric;
