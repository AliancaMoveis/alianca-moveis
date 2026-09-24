-- Anexos: além de fotos e links, vídeos (convertidos para versão leve no navegador) e PDF (plantas). Até 30 MB por arquivo.
alter type public.tipo_anexo add value if not exists 'video';
alter type public.tipo_anexo add value if not exists 'pdf';
-- (em transação separada) bucket e adicionar_anexos — ver aplicação "anexos_video_pdf"
update storage.buckets set file_size_limit = 31457280,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','video/webm','video/mp4','video/quicktime','application/pdf']
where id = 'anexos';
