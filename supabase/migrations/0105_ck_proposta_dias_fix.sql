-- checklist_registrar: propostaDiasExtras/diasExtras podem ser JSON null — usa jsonb_typeof antes de jsonb_array_length
-- (erro "cannot get array length of a scalar" ao enviar WhatsApp com data de 1 dia). Aplicada via DO + replace sobre pg_get_functiondef.
select 1;
