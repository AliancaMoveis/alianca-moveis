-- O botão "Abrir no Kommo" precisa do endereço da conta, que só existe em public.segredos
-- (kommo_base, do tipo https://<conta>.kommo.com). O navegador não lê segredos, então quem
-- monta o link é esta função, que já é SECURITY DEFINER e já checa quem pode ver a conversa.
-- Só o endereço do lead sai daqui — token nenhum.
create or replace function public.ck_kommo_conversa(p_chamado text)
returns jsonb
language sql
stable security definer
set search_path to ''
as $function$
  select case when public.pode_checklist() or public._ck_meu_projetista() is not null
    then (select jsonb_build_object(
            'leadId', v.lead_id,
            'contatoId', v.contato_id,
            'url', case when v.lead_id is null then null else
              rtrim(coalesce((select s.valor from public.segredos s where s.chave = 'kommo_base'), ''), '/')
              || '/leads/detail/' || v.lead_id end)
            from public.kommo_vinculo v where v.chamado_id = p_chamado)
    else null end;
$function$;
