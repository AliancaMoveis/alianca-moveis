-- 0196: ao aprovar a medida, as fotos feitas no 360 sobem para o Exact
-- Descoberta em 16/11/2026: o Exact não tem rota de escrita para o cartão de Medição, mas tem para ANEXO DE
-- TICKET. Como o ticket do checklist da venda já é conhecido (exact_ticket), as fotos sobem nele com
-- referenceType = MEASURING — o mesmo tipo que o Exact devolve ao ler os anexos do checklist.
-- Testado: POST /attachments (multipart com file, referenceType, referenceId, ticketId e mimeType) devolveu
-- o anexo 703797 no ticket 22224, e ele passou a aparecer na lista de anexos de Medição daquele checklist.
-- O envio é feito pela função exact-fotos (supabase/functions/exact-fotos).
create or replace function public._trg_medida_ok_checklist() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int; cfg record;
begin
  if new.tipo <> 'medidas' then return null; end if;
  if coalesce(new.tratativa->'medida'->>'etapa', '') <> 'liberada' then return null; end if;
  if tg_op = 'UPDATE' and coalesce(old.tratativa->'medida'->>'etapa', '') = 'liberada' then return null; end if;

  perform set_config('alianca.sistema', '1', true);
  update public.chamados k
     set tratativa = coalesce(k.tratativa, '{}'::jsonb) || jsonb_build_object('checklist',
           coalesce(k.tratativa->'checklist', '{}'::jsonb)
           || jsonb_build_object('medidaOk', true, 'medidaOkEm', now(), 'medidaId', new.id))
   where k.tipo = 'checklist'
     and (k.id = new.vinculado_a or (nullif(new.pedido, '') is not null and k.pedido = new.pedido))
     and not coalesce((k.tratativa->'checklist'->>'medidaOk')::boolean, false);
  get diagnostics n = row_count;
  perform set_config('alianca.sistema', '0', true);
  if n > 0 then
    perform public._reg(k.id, '📐 Medida oficial aprovada (' || new.id || ') — fotos disponíveis na ficha da medida')
      from public.chamados k
     where k.tipo = 'checklist' and (k.id = new.vinculado_a or (nullif(new.pedido, '') is not null and k.pedido = new.pedido))
       and (k.tratativa->'checklist'->>'medidaId') = new.id;
  end if;

  select * into cfg from public.exact_config where id = 1;
  if found and cfg.escrever_ativo and exists (select 1 from public.anexos a where a.chamado_id = new.id and a.tipo = 'img') then
    perform net.http_post(url := regexp_replace(cfg.url_funcao, '/exact$', '/exact-fotos'),
      body := jsonb_build_object('id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-exact-segredo', cfg.segredo),
      timeout_milliseconds := 120000);
  end if;
  return null;
end $$;
revoke all on function public._trg_medida_ok_checklist() from public, anon, authenticated;
