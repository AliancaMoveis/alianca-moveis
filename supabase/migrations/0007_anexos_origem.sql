-- Fotos de exemplo (seed) guardadas como data URI; fotos reais vão para o Storage.
alter table public.anexos drop constraint anexos_check;
alter table public.anexos add constraint anexos_origem_check
  check ((tipo = 'link' and url is not null) or (tipo = 'img' and (storage_path is not null or url like 'data:image/%')));
