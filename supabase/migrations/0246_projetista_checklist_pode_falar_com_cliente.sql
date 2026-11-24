-- Quem pode falar com o cliente do checklist pelo WhatsApp da loja.
-- O setor do projetista e 'projetista_checklist', que NAO e 'checklist': por isso
-- pode_checklist() barrava os 8 projetistas (Rafael, Wagner, Cleberson, Giovanni,
-- Gislaine, Juliana Cabral, Silvane, Angela Regina) tanto no pedido de liberacao
-- quanto na funcao kommo. Eles ja enxergam todo checklist (flag 'pck' em
-- pode_ver_chamado_ctx) e e deles o botao "Enviar ao cliente", entao falta so isto.
-- Mesmo padrao de pode_recuperacao_ver, que ja trata esse setor.
create or replace function public.pode_ck_falar()
returns boolean language sql stable security definer set search_path to '' as $$
  select public.pode_checklist()
     or 'projetista_checklist' = any(public.meus_setores())
     or exists (select 1 from public.usuario_acessos a
                 where a.usuario_id = auth.uid() and a.acesso = 'projetista_checklist')
$$;

comment on function public.pode_ck_falar() is
  'Pode mandar mensagem ao cliente do checklist: checklist, gestao ou projetista do checklist.';

grant execute on function public.pode_ck_falar() to authenticated;

-- Troca o gate das duas funcoes da liberacao sem retranscrever o corpo delas.
do $mig$
declare f text; d text; velho text; novo text;
begin
  velho := 'if not public.pode_checklist() then';
  novo  := 'if not public.pode_ck_falar() then';
  foreach f in array array['ck_doc_liberacao_pedir','ck_doc_liberacao_cancelar'] loop
    select pg_get_functiondef(p.oid) into d
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f;
    if d is null then raise exception 'funcao % nao encontrada', f; end if;
    if position(velho in d) = 0 then raise exception 'gate esperado nao achado em %', f; end if;
    execute replace(d, velho, novo);
  end loop;
end $mig$;

-- A funcao kommo (edge) tambem passou a conferir pode_ck_falar em vez de pode_checklist.
