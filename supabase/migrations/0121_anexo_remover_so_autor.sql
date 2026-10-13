-- 0121 · Remover anexo/foto: só quem anexou, a Gestão e as supervisões (vendedor que só visualiza não remove)
CREATE OR REPLACE FUNCTION public.pode_remover_anexo(a public.anexos)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select public.usuario_ativo() and (
    (a.criado_por is not null and a.criado_por = auth.uid())
    or public.eh_gestao()
    or public.meus_setores() && array['supervisao','marketing_supervisao','medidas_supervisao','proprietario']);
$function$;

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

-- arquivo no storage: dono do arquivo, Gestão/supervisão, ou arquivo que já não está ligado a nenhum anexo (removido pela função acima)
ALTER POLICY anexos_storage_apagar ON storage.objects
USING (bucket_id = 'anexos' and public.pode_anexar_id((storage.foldername(name))[1]) and (
  owner = auth.uid() or public.eh_gestao()
  or public.meus_setores() && array['supervisao','marketing_supervisao','medidas_supervisao','proprietario']
  or not exists (select 1 from public.anexos x where x.storage_path = name)));

-- carregar_principal: devolve quem anexou (a tela só mostra o "×" para quem pode remover)
DO $$
declare d text;
begin
  d := pg_get_functiondef('public.carregar_principal'::regproc);
  if position('''storage_path'', a.storage_path, ''criado_em'', a.criado_em)' in d) = 0 then raise exception 'âncora não encontrada'; end if;
  d := replace(d, '''storage_path'', a.storage_path, ''criado_em'', a.criado_em)', '''storage_path'', a.storage_path, ''criado_em'', a.criado_em, ''criado_por'', a.criado_por)');
  execute d;
end $$;
