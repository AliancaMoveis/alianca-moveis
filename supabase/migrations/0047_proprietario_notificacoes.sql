-- (aplicada via MCP em 25/09/2026)
-- PROPRIETÁRIO (setor 'proprietario', libs iguais à Gestão → eh_gestao() verdadeiro): Washington migrou de 'gestao' para 'proprietario'.
--  · Não recebe avisos de tarefa (os avisos da Gestão usam _usuarios_setor('gestao')).
--  · Recebe: 📈 resumo do dia do dono (21h, detalhado), 🔒 fechamento da loja (20:30), 💎 venda alta.
--  · Pode ser o "gerente que negociou" no registro de venda.
-- NOTIFICAÇÕES: coluna lida_em + marcar_notificacoes_lidas(ids[]); o push abre /?notif=ID(&abrir=CHAMADO) e o app mostra a notificação inteira.
insert into public.setores (id, nome, lib_criar, lib_ver_tudo, lib_cadastros, lib_admin, lib_ver_marketing, ordem, via_callcenter)
values ('proprietario', 'Proprietário', true, true, true, true, true, 16, false) on conflict (id) do nothing;
alter table public.notificacoes add column if not exists lida_em timestamptz;
create or replace function public.marcar_notificacoes_lidas(p_ids bigint[] default null) returns void
language sql security definer set search_path = '' as $$
  update public.notificacoes set lida_em = now() where usuario_id = auth.uid() and lida_em is null and (p_ids is null or id = any(p_ids));
$$;
