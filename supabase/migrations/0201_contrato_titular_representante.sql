-- Checklist · contrato assinado por representante + titular da compra
--
-- Muitas vezes quem vai ao checklist não é quem comprou (a esposa vai, o marido é o titular). O projetista marca isso
-- ao gerar o contrato e escreve o nome do titular. Quem está presente assina como REPRESENTANTE; ao assinar, o sistema
-- abre um segundo link para o TITULAR, que autoriza a representação e assina também. O contrato só fica concluído com
-- as duas assinaturas, e o documento final mostra as duas (nome, CPF, assinatura e selfie de cada um).
--
-- status: pendente → (representante assina) aguardando_titular → (titular assina) assinado
--         quando o próprio titular assina, vai direto de pendente para assinado, como sempre foi.

alter table public.ck_contratos
  add column if not exists titular_nome          text,
  add column if not exists titular_token         text unique,
  add column if not exists titular_cpf           text,
  add column if not exists titular_assinatura_path text,
  add column if not exists titular_selfie_path   text,
  add column if not exists titular_assinado_em   timestamptz,
  add column if not exists titular_ip            text,
  add column if not exists titular_user_agent    text;

comment on column public.ck_contratos.titular_nome is 'Nome do titular da compra quando quem assina a conferência é um representante; nulo quando o próprio titular assina.';
comment on column public.ck_contratos.titular_token is 'Segundo link, criado quando o representante assina, para o titular autorizar e assinar.';
