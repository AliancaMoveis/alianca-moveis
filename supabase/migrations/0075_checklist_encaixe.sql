-- Checklist: permite ENCAIXE (mesmo projetista com mais de um cliente no mesmo horário) só com confirmação explícita (p.encaixe = true).
-- Sem a confirmação o banco continua recusando; com ela, o agendamento fica marcado como encaixe e o histórico registra com quem conflita.
create or replace function public._ck_proj(p_nome text, p_dt timestamp, p_id text, p jsonb) returns text
language plpgsql stable security definer set search_path = '' as $$
declare outro text; dur int;
begin
  if not exists (select 1 from public.config cf, jsonb_array_elements_text(coalesce(cf.checklist_agenda->'projetistas', '[]'::jsonb)) x where cf.id = 1 and x = p_nome) then
    raise exception 'Escolha o projetista da lista';
  end if;
  if p_dt is null then return null; end if;
  select coalesce((checklist_agenda->>'duracaoMin')::int, 120) into dur from public.config where id = 1;
  select string_agg(c.cliente || ' às ' || to_char(nullif(c.tratativa->'checklist'->>'agendadoPara', '')::timestamp, 'HH24:MI'), ', ') into outro from public.chamados c
   where c.tipo = 'checklist' and c.id <> p_id and c.status <> 'concluida'
     and c.tratativa->'checklist'->>'etapa' = 'agendado' and c.tratativa->'checklist'->>'projetista' = p_nome
     and abs(extract(epoch from (nullif(c.tratativa->'checklist'->>'agendadoPara', '')::timestamp - p_dt))) < dur * 60;
  if outro is null then return null; end if;
  if coalesce((p->>'encaixe')::boolean, false) then return p_nome || ' também tem ' || outro; end if;
  raise exception '% já tem checklist nesse horário (%). Para encaixar mesmo assim, marque “Confirmo o encaixe”.', p_nome, outro;
end $$;
revoke all on function public._ck_proj(text, timestamp, text, jsonb) from public, anon, authenticated;

do $do$ declare d text; begin
  d := pg_get_functiondef('public.checklist_registrar(text,jsonb)'::regprocedure);
  d := regexp_replace(d, 'perform public\._ck_projetista_ok\(([^;]*)\);', 'enc := coalesce(enc, public._ck_proj(\1, p));', 'g');
  d := replace(d, 'declare c public.chamados; ck jsonb;', 'declare enc text; c public.chamados; ck jsonb;');
  d := replace(d, $x$  end case;$x$, $x$  end case;
  if acao in ('agendado', 'reagendar', 'projetista') then ck := ck || jsonb_build_object('encaixe', enc is not null, 'encaixeCom', enc); end if;
  if acao = 'mensagem' then ck := ck || jsonb_build_object('propostaEncaixe', enc is not null); end if;
  if enc is not null then txt := txt || ' · ⚠️ ENCAIXE confirmado: ' || enc; end if;$x$);
  if d like '%_ck_projetista_ok%' or d not like '%ENCAIXE confirmado%' then raise exception 'x'; end if;
  execute d;
end $do$;
