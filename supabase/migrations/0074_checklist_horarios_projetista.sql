-- Checklist: atendimento em blocos de 2h (09-11, 11-13, 15-17, 17-19; 13-15 almoço). Cada projetista atende um cliente por bloco.
-- A data oferecida no WhatsApp já reserva o projetista (o cliente não vê o nome). Conflito = mesmo projetista com atendimentos a menos de 2h.
update public.config set checklist_agenda = checklist_agenda || '{"horarios":["09:00","11:00","15:00","17:00"],"duracaoMin":120}'::jsonb where id = 1;

create or replace function public._ck_projetista_ok(p_nome text, p_dt timestamp, p_id text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare outro text; dur int;
begin
  if not exists (select 1 from public.config cf, jsonb_array_elements_text(coalesce(cf.checklist_agenda->'projetistas', '[]'::jsonb)) x where cf.id = 1 and x = p_nome) then
    raise exception 'Escolha o projetista da lista';
  end if;
  if p_dt is null then return; end if;
  select coalesce((checklist_agenda->>'duracaoMin')::int, 120) into dur from public.config where id = 1;
  select c.cliente into outro from public.chamados c
   where c.tipo = 'checklist' and c.id <> p_id and c.status <> 'concluida'
     and c.tratativa->'checklist'->>'etapa' = 'agendado' and c.tratativa->'checklist'->>'projetista' = p_nome
     and abs(extract(epoch from (nullif(c.tratativa->'checklist'->>'agendadoPara', '')::timestamp - p_dt))) < dur * 60 limit 1;
  if outro is not null then raise exception '% já tem checklist nesse horário (%)', p_nome, outro; end if;
end $$;
revoke all on function public._ck_projetista_ok(text, timestamp, text) from public, anon, authenticated;

do $do$ declare d text; begin
  d := pg_get_functiondef('public.checklist_registrar(text,jsonb)'::regprocedure);
  -- WhatsApp com data: guarda o projetista reservado
  d := replace(d, $x$      ck := ck || jsonb_build_object('etapa', 'aguardando', 'proposta', dt, 'contatos', coalesce((ck->>'contatos')::int, 0) + 1, 'ultimoContato', now(),
                                     'precisaMedida', coalesce((p->>'precisaMedida')::boolean, false));$x$, $x$      if coalesce(p->>'projetista', '') <> '' then perform public._ck_projetista_ok(p->>'projetista', dt, p_id); end if;
      ck := ck || jsonb_build_object('etapa', 'aguardando', 'proposta', dt, 'contatos', coalesce((ck->>'contatos')::int, 0) + 1, 'ultimoContato', now(),
                                     'propostaProjetista', nullif(p->>'projetista', ''));$x$);
  if d not like '%propostaProjetista%' then raise exception 'x'; end if;
  execute d;
  -- duração configurável no salvar
  d := pg_get_functiondef('public.salvar_checklist_agenda(jsonb)'::regprocedure);
  d := replace(d, $x$'seguraDias', (p->>'seguraDias')::int)$x$, $x$'seguraDias', (p->>'seguraDias')::int, 'duracaoMin', coalesce((p->>'duracaoMin')::int, 120))$x$);
  if d not like '%duracaoMin%' then raise exception 'y'; end if;
  execute d;
end $do$;
