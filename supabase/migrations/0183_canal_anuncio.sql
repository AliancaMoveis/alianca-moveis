-- 0183 Canal do anúncio (Meta / Google) por cliente do marketing, para saber de qual anúncio veio cada venda.
-- Fica em chamados.tratativa->>'canalAnuncio' ('meta' | 'google' | 'outro' | '' = não informado). Quem pode tratar o chamado
-- ou é Gestão / proprietário / acesso "anuncios" define. Aplicar no SQL Editor do Supabase.
create or replace function public.definir_canal_anuncio(p_id text, p_canal text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chamados; v text := lower(btrim(coalesce(p_canal, '')));
begin
  perform public._eu();
  select * into c from public.chamados where id = p_id for update;
  if not found or not public.pode_ver_chamado(c) then raise exception 'Chamado não encontrado'; end if;
  if v not in ('meta', 'google', 'outro', '') then raise exception 'Canal inválido'; end if;
  if not (public.pode_tratar_chamado(c) or public._ve_anuncios()) then raise exception 'Sem permissão para definir o canal do anúncio'; end if;
  update public.chamados set tratativa = coalesce(tratativa, '{}'::jsonb) || jsonb_build_object('canalAnuncio', v) where id = p_id;
  perform public._reg(p_id, 'Canal do anúncio: ' || case v when 'meta' then 'Meta (Instagram/Facebook)' when 'google' then 'Google' when 'outro' then 'Outro' else 'não informado' end);
end $$;
grant execute on function public.definir_canal_anuncio(text, text) to authenticated;
