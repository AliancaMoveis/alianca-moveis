-- Montagem (am-224): Agendamentos pessoais das agendadoras.
alter table public.usuarios add column if not exists nome_exact text;   -- nome da pessoa no Exact (coluna Lider)
-- vínculos iniciais: Francilene = francilene, Bruna = bruna.gisele, Natallia = Natallia
-- montagem_meus_agend(p_de, p_ate): agendamentos da própria usuária (lider = nome_exact) pela data de inclusão; sem dado de cliente.
-- usuario_nome_exact(p_usuario, p_nome): Gestão liga/desliga o nome no Exact (tela ⚙ Quem recebe).
