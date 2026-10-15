-- 0135 · anexos: a regra antiga só aceitava foto e link; PDF e vídeo eram enviados ao armazenamento mas não registrados.
alter table public.anexos add constraint anexos_origem_check2 check ((tipo = 'link' and url is not null) or (tipo in ('img','video','pdf') and (storage_path is not null or url like 'data:image/%'))) not valid;
alter table public.anexos drop constraint anexos_origem_check;
alter table public.anexos rename constraint anexos_origem_check2 to anexos_origem_check;
-- (recuperação: 75 arquivos órfãos em 27 clientes foram registrados em anexos, com nota no histórico)

-- 0136 · marketing anexa depois do cadastro (ver pode_anexar_id no banco)
-- 0137 · tipos aceitos no armazenamento (JPEG, PNG, HEIC, PDF, vídeos de celular) e permissão avulsa edita_agenda (Camila)
