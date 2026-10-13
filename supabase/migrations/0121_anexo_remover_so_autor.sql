-- Trava: só quem anexou, a Gestão e as supervisões removem fotos/arquivos
CREATE OR REPLACE FUNCTION public.remover_anexo(p_anexo uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare a public.anexos; c public.chamados;
begin
  select * into a from public.anexos where id = p_anexo for update;
  if not found then raise exception 'Anexo não encontrado'; end if;
  c := public._chamado(a.chamado_id, false);
  if not public.pode_remover_anexo(a) then raise exception 'Só quem anexou (ou a Gestão / supervisão) pode remover este anexo'; end if;
  delete from public.anexos where id = p_anexo;
  perform public._reg(a.chamado_id, 'Anexo removido: ' || a.nome);
  return a.storage_path;
end $function$;

ALTER POLICY anexos_storage_apagar ON storage.objects
USING (bucket_id = 'anexos' and public.pode_anexar_id((storage.foldername(name))[1]) and (
  owner = auth.uid() or public.eh_gestao()
  or public.meus_setores() && array['supervisao','marketing_supervisao','medidas_supervisao','proprietario']
  or not exists (select 1 from public.anexos x where x.storage_path = name)));
