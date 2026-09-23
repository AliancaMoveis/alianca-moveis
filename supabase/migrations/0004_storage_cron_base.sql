-- ALIANÇA 360 — dados de base (setores, motivos, config), armazenamento de fotos, tempo real e agendamento.

-- ---------- setores (mesmas liberações do protótipo) ----------
insert into public.setores (id, nome, lib_criar, lib_ver_tudo, lib_cadastros, lib_admin, lib_ver_marketing, ordem) values
  ('callcenter','Call center', true,false,false,false,false, 1),
  ('prazo_fabrica','Prazo de fábrica', false,false,false,false,false, 2),
  ('montagem','Montagem', false,false,false,false,false, 3),
  ('assistencia','Assistência', false,false,false,false,false, 4),
  ('checklist','Checklist', false,false,false,false,false, 5),
  ('medidas','Medidas', false,false,false,false,false, 6),
  ('marketing_operadora','Operadora Marketing', true,false,false,false,false, 7),
  ('marketing_supervisao','Supervisão Marketing', true,false,false,false,true, 8),
  ('consultor_externo','Consultor externo', false,false,false,false,false, 9),
  ('suporte_consultores','Suporte Consultores Externos', false,false,false,false,false, 10),
  ('atendente_cliente','Projetista (loja)', false,false,false,false,false, 11),
  ('supervisao','Supervisão (Call center)', true,true,true,false,false, 12),
  ('gestao','Gestão', true,true,true,true,false, 13);

-- ---------- motivos e roteamento padrão ----------
insert into public.tipos (id, nome, setor_destino, anexos, presale, direto, ordem) values
  ('entrega','Solicitação de entrega','callcenter', false,false,false, 1),
  ('prazo_fabrica','Prazo de fábrica','prazo_fabrica', false,false,false, 2),
  ('montagem','Solicitação de montagem','montagem', false,false,false, 3),
  ('assistencia','Solicitação de assistência','assistencia', true,false,false, 4),
  ('vistoria','Solicitação de vistoria','assistencia', true,false,false, 5),
  ('checklist','Agendamento de checklist','checklist', false,false,false, 6),
  ('medidas','Solicitação de medidas','medidas', false,false,false, 7),
  ('visita_consultor','Visita técnica — consultor externo','marketing_supervisao', true,true,false, 8),
  ('agendamento_loja','Agendamento direto na loja','suporte_consultores', true,true,true, 9),
  ('outros','Outros','callcenter', false,false,false, 10);

insert into public.config (id, comissao_pct, pagamento_visita) values (1, 1.5, 40);

-- ---------- Storage: fotos/plantas (bucket privado) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 10485760, array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml'])
on conflict (id) do nothing;

-- caminho do arquivo: <id do chamado>/<arquivo>
create policy anexos_storage_ler on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and public.pode_ver_id((storage.foldername(name))[1]));
create policy anexos_storage_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and public.pode_anexar_id((storage.foldername(name))[1]));
create policy anexos_storage_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'anexos' and public.pode_anexar_id((storage.foldername(name))[1]));

-- ---------- tempo real: toda ação grava no histórico, então basta ouvir o histórico ----------
alter publication supabase_realtime add table public.historico;

-- ---------- escalonamento automático a cada 5 minutos ----------
create extension if not exists pg_cron;
select cron.schedule('alianca360-autoescalonar', '*/5 * * * *', $$select public.autoescalonar();$$);
