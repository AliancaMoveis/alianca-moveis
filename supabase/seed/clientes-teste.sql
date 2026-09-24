-- Clientes de TESTE (jul, ago e set/2026) para validar dashboards e relatórios.
-- Todos marcados com tratativa->>'teste' = 'true' (CC e marketing) para apagar depois:
--   delete from public.chamados where tratativa->>'teste' = 'true';   (historico/anexos/vendas saem em cascata, se houver FK on delete cascade)
do $$
declare
  nomes text[] := array['Ana','Bruno','Carla','Daniel','Eduarda','Felipe','Gabriela','Henrique','Isabela','João','Karina','Leonardo','Mariana','Nicolas','Olívia','Pedro','Rafaela','Samuel','Tatiane','Vinícius','Yasmin','Rodrigo','Letícia','Matheus','Juliana','Gustavo','Camila','André','Patrícia','Marcelo'];
  sobren text[] := array['Almeida','Barbosa','Cardoso','Dias','Esteves','Fernandes','Gomes','Holanda','Irineu','Jardim','Klein','Lopes','Moraes','Nogueira','Oliveira','Pereira','Queiroz','Ribeiro','Santos','Teixeira','Vasconcelos','Wolff','Xavier','Zanella','Martins','Rocha','Mendes','Costa','Prado','Siqueira'];
  ruas text[] := array['Rua XV de Novembro','Av. Sete de Setembro','Rua Padre Anchieta','Av. República Argentina','Rua Mateus Leme','Av. Visconde de Guarapuava','Rua Desembargador Motta','Rua Itupava','Av. Iguaçu','Rua Brigadeiro Franco'];
  bairros text[] := array['Centro','Água Verde','Batel','Bigorrilho','Portão','Cabral','Juvevê','Alto da XV','Mercês','Boa Vista'];
  ambientes text[] := array['Cozinha planejada','Dormitório casal','Closet','Home office','Sala de estar','Banheiro planejado','Lavanderia','Dormitório infantil','Cozinha + área gourmet','Painel de TV + rack'];
  produtos text[] := array['Guarda-roupa 6 portas','Cozinha modulada','Painel de TV','Mesa de jantar 6 lugares','Cama box casal','Cômoda 5 gavetas','Rack suspenso','Armário aéreo','Sofá retrátil','Escrivaninha'];
  cc_tipos text[] := array['montagem','montagem','montagem','assistencia','assistencia','entrega','entrega','prazo_fabrica','prazo_fabrica','medidas','checklist','vistoria','outros','posvenda'];
  cc uuid[]; mont uuid[]; assis uuid[]; med uuid[]; chk uuid[]; fab_u uuid[]; pv uuid[]; ops uuid[]; cons uuid[]; vends uuid[]; sup uuid; haisla uuid;
  fabs uuid[];
  mes int; i int; n int; d date; ultimo date; hoje date := current_date;
  cid text; cli text; tp text; setor text; sol uuid; st public.status_chamado; ts timestamptz; t jsonb;
  r float; cons_id uuid; vend_id uuid; dv timestamp; dl timestamp; sc public.status_cliente; setor_mkt text; num int := 70000;
  outcome text; vstat public.status_venda; valor numeric;
  function_dummy int;
begin
  perform setseed(0.42);
  select array_agg(u.id) into cc from public.usuarios u join public.usuario_setores s on s.usuario_id=u.id where u.ativo and s.setor_id='callcenter';
  select array_agg(u.id) into mont from public.usuarios u join public.usuario_setores s on s.usuario_id=u.id where u.ativo and s.setor_id='montagem';
  select array_agg(u.id) into assis from public.usuarios u join public.usuario_setores s on s.usuario_id=u.id where u.ativo and s.setor_id='assistencia';
  select array_agg(u.id) into med from public.usuarios u join public.usuario_setores s on s.usuario_id=u.id where u.ativo and s.setor_id='medidas';
  select array_agg(u.id) into chk from public.usuarios u join public.usuario_setores s on s.usuario_id=u.id where u.ativo and s.setor_id='checklist';
  select array_agg(u.id) into fab_u from public.usuarios u join public.usuario_setores s on s.usuario_id=u.id where u.ativo and s.setor_id='prazo_fabrica';
  select array_agg(u.id) into pv from public.usuarios u join public.usuario_setores s on s.usuario_id=u.id where u.ativo and s.setor_id='posvenda';
  select array_agg(u.id) into ops from public.usuarios u join public.usuario_setores s on s.usuario_id=u.id where u.ativo and s.setor_id='marketing_operadora';
  select array_agg(u.id) into cons from public.usuarios u join public.usuario_setores s on s.usuario_id=u.id where u.ativo and s.setor_id='consultor_externo';
  select array_agg(u.id) into vends from public.usuarios u join public.usuario_setores s on s.usuario_id=u.id where u.ativo and s.setor_id='atendente_cliente';
  select u.id into sup from public.usuarios u join public.usuario_setores s on s.usuario_id=u.id where u.ativo and s.setor_id='suporte_consultores' limit 1;
  select u.id into haisla from public.usuarios u join public.usuario_setores s on s.usuario_id=u.id where u.ativo and s.setor_id='marketing_supervisao' limit 1;
  select array_agg(id) into fabs from public.fabricas;

  for mes in 0..2 loop
    d := (date_trunc('month', hoje) - make_interval(months => 2 - mes))::date;
    ultimo := case when mes = 2 then hoje else (d + interval '1 month - 1 day')::date end;

    ------------------------------------------------------------------ CALL CENTER
    n := case mes when 0 then 22 when 1 then 26 else 30 end;
    for i in 1..n loop
      tp := cc_tipos[1 + floor(random()*array_length(cc_tipos,1))::int];
      select setor_destino into setor from public.tipos where id = tp;
      sol := cc[1 + floor(random()*array_length(cc,1))::int];
      ts := (d + floor(random()*(ultimo - d + 1))::int)::timestamp + make_interval(hours => 8 + floor(random()*10)::int, mins => floor(random()*60)::int);
      if ts > now() then ts := now() - interval '2 hours'; end if;
      cli := nomes[1+floor(random()*30)::int] || ' ' || sobren[1+floor(random()*30)::int];
      r := random();
      -- meses anteriores: quase tudo concluído; mês atual: mistura
      if mes < 2 then st := case when r < .88 then 'concluida' when r < .94 then 'respondida' else 'tratativa' end;
      else st := case when r < .30 then 'aberta' when r < .52 then 'tratativa' when r < .64 then 'respondida' when r < .70 and tp = 'prazo_fabrica' then 'informar' else 'concluida' end;
        if ts > now() - interval '1 day' and st = 'concluida' then st := 'aberta'; end if;
      end if;
      insert into public.chamados (tipo, setor_destino, status, criado_em, sla_resposta, solicitante_id, solicitante_nome, solicitante_setor,
        cliente, cliente_doc, telefone, pedido, data_venda, produto, fabrica_id, prazo_tatico, motivo, urgente, tratativa,
        resposta_previsao, resposta_quem, resposta_texto, resposta_quando)
      values (tp, setor, st, ts, public.add_dias_uteis(ts, 2), sol, public._nome(sol), 'Call center',
        cli, lpad((floor(random()*99999999999))::text, 11, '0'), '(41) 9' || lpad((floor(random()*99999999))::text, 8, '0'),
        (40000 + floor(random()*9999))::text, (ts - make_interval(days => 20 + floor(random()*60)::int))::date,
        produtos[1+floor(random()*10)::int], case when tp = 'prazo_fabrica' then fabs[1+floor(random()*array_length(fabs,1))::int] end,
        case when tp in ('prazo_fabrica','entrega') then (ts + make_interval(days => 5 + floor(random()*20)::int))::date end,
        case tp when 'montagem' then 'Cliente pede agendamento da montagem.' when 'assistencia' then 'Peça com defeito, cliente enviou fotos.' when 'entrega' then 'Cliente quer saber a data de entrega.'
          when 'prazo_fabrica' then 'Cliente quer o prazo atualizado da fábrica.' when 'medidas' then 'Conferir medidas do ambiente.' when 'checklist' then 'Agendar checklist do projeto.'
          when 'vistoria' then 'Vistoria de avaria após entrega.' when 'posvenda' then 'Porta desalinhada após a montagem.' else 'Dúvida geral do cliente.' end,
        random() < .08, jsonb_build_object('teste', true),
        case when st in ('respondida','informar','concluida') then (ts + make_interval(days => 3 + floor(random()*10)::int))::date end,
        case when st in ('respondida','informar','concluida') then 'Setor ' || public._setor_nome(setor) end,
        case when st in ('respondida','informar','concluida') then 'Retorno registrado para o cliente.' end,
        case when st in ('respondida','informar','concluida') then ts + make_interval(hours => 4 + floor(random()*40)::int) end)
      returning id into cid;
      insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, ts, sol, public._nome(sol), 'Solicitação aberta → ' || public._setor_nome(setor));
      if st <> 'aberta' then
        insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, least(now(), ts + interval '3 hours'), null, 'Setor ' || public._setor_nome(setor), 'Status → Em tratativa'); end if;
      if st in ('respondida','informar','concluida') then
        insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, least(now(), ts + interval '20 hours'), null, 'Setor ' || public._setor_nome(setor), 'Retorno registrado'); end if;
      if st = 'informar' then insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, least(now(), ts + interval '22 hours'), null, 'Setor ' || public._setor_nome(setor), 'Status → Informar cliente (o call center avisa o cliente)'); end if;
      if st = 'concluida' then insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, least(now(), ts + make_interval(hours => 24 + floor(random()*72)::int)), null, 'Setor ' || public._setor_nome(setor), 'Status → Concluída'); end if;
    end loop;

    ------------------------------------------------------------------ MARKETING — visitas de consultor externo
    n := case mes when 0 then 18 when 1 then 22 else 26 end;
    for i in 1..n loop
      sol := ops[1 + floor(random()*array_length(ops,1))::int];
      ts := (d + floor(random()*(ultimo - d + 1))::int)::timestamp + make_interval(hours => 8 + floor(random()*10)::int, mins => floor(random()*60)::int);
      if ts > now() then ts := now() - interval '3 hours'; end if;
      cli := nomes[1+floor(random()*30)::int] || ' ' || sobren[1+floor(random()*30)::int];
      cons_id := cons[1 + floor(random()*array_length(cons,1))::int];
      vend_id := vends[1 + floor(random()*array_length(vends,1))::int];
      dv := (ts::date + 1 + floor(random()*5)::int)::timestamp + make_interval(hours => 9 + floor(random()*9)::int);
      r := random();
      -- etapa final do cliente
      if mes < 2 or dv::date < hoje - 10 then
        outcome := case when r < .12 then 'nao_realizada' when r < .22 then 'visita_sem_loja' when r < .30 then 'nao_compareceu' when r < .40 then 'reprovado'
                        when r < .50 then 'orcamento' when r < .56 then 'sem_resposta' when r < .74 then 'efetivada' when r < .82 then 'promissoria'
                        when r < .90 and mes = 2 then 'registrada' else 'cancelada' end;
        if outcome = 'cancelada' and random() < .6 then outcome := 'efetivada'; end if;
      else
        outcome := case when r < .12 then 'aguardando' when r < .30 then 'direcionado' when r < .40 then 'visita_sem_loja' when r < .55 then 'sem_vendedor'
                        when r < .70 then 'com_vendedor' when r < .80 then 'orcamento' when r < .88 then 'registrada' else 'efetivada' end;
      end if;
      if outcome in ('direcionado','aguardando') and dv::date < hoje then dv := (hoje + 1 + floor(random()*4)::int)::timestamp + make_interval(hours => 9 + floor(random()*9)::int); end if;
      dl := (dv::date + 2 + floor(random()*6)::int)::timestamp + make_interval(hours => 9 + floor(random()*9)::int, mins => (floor(random()*2)*30)::int);
      if outcome = 'sem_vendedor' and dl::date < hoje then dl := (hoje + floor(random()*5)::int)::timestamp + make_interval(hours => 10 + floor(random()*8)::int); end if;
      if outcome = 'com_vendedor' then dl := (hoje - 2 + floor(random()*6)::int)::timestamp + make_interval(hours => 9 + floor(random()*9)::int); end if;
      if outcome in ('orcamento','sem_resposta','reprovado','registrada','efetivada','promissoria','cancelada','nao_compareceu') and dl > now() then dl := (hoje - 1)::timestamp + interval '15 hours'; dv := least(dv, dl - interval '2 days'); end if;

      setor_mkt := case outcome when 'aguardando' then 'marketing_supervisao' when 'direcionado' then 'consultor_externo' when 'nao_realizada' then 'consultor_externo'
                     when 'visita_sem_loja' then 'consultor_externo' when 'sem_vendedor' then 'suporte_consultores' else 'atendente_cliente' end;
      sc := case outcome when 'aguardando' then 'aguardando_consultor' when 'direcionado' then 'direcionado_consultor' when 'nao_realizada' then 'direcionado_consultor'
              when 'visita_sem_loja' then 'visita_realizada' when 'sem_vendedor' then 'agendado_loja' when 'com_vendedor' then 'com_vendedor'
              when 'orcamento' then 'orcamento' when 'sem_resposta' then 'sem_resposta' when 'reprovado' then 'reprovado' when 'nao_compareceu' then 'nao_compareceu'
              when 'registrada' then 'vendido_revisao' when 'efetivada' then 'vendido' when 'promissoria' then 'vendido_promissoria' else 'venda_cancelada' end;
      t := jsonb_build_object('teste', true);
      if outcome not in ('aguardando') then t := t || jsonb_build_object('contatoIniciado', true); end if;
      if outcome not in ('aguardando','direcionado','nao_realizada') then
        t := t || jsonb_build_object('realizada', true, 'medidas', '', 'obs', 'Visita ok, cliente com projeto em mente.');
        if outcome <> 'visita_sem_loja' then t := t || jsonb_build_object('querProjeto', case when random() < .6 then 'sim' else 'nao' end); end if;
      end if;
      if outcome in ('orcamento','sem_resposta','reprovado','nao_compareceu') or (outcome in ('registrada','efetivada','promissoria','cancelada') and random() < .5) then
        t := t || jsonb_build_object('parecerStatus', case when outcome in ('registrada','efetivada','promissoria','cancelada') then 'orcamento' else outcome end,
          'parecer', case outcome when 'orcamento' then 'Orçamento entregue, cliente vai pensar.' when 'sem_resposta' then 'Liguei 2x, sem retorno.' when 'reprovado' then 'Achou o valor alto.'
                                  when 'nao_compareceu' then 'Cliente não veio.' else 'Orçamento aprovado em seguida.' end,
          'parecerEm', dl + interval '3 hours', 'parecerPor', public._nome(vend_id));
      end if;
      if outcome = 'com_vendedor' and random() < .5 then t := t || jsonb_build_object('emContato', true); end if;
      if outcome = 'com_vendedor' and dl < now() and random() < .4 then t := t || jsonb_build_object('cobradoEm', now() - interval '5 hours', 'cobradoPor', public._nome(sup)); end if;

      insert into public.chamados (tipo, setor_destino, status, criado_em, sla_resposta, solicitante_id, solicitante_nome, solicitante_setor,
        cliente, telefone, email, produto, motivo, consultor_id, atendente_id, data_visita, endereco, data_loja, status_cliente, tratativa)
      values ('visita_consultor', setor_mkt,
        case when sc in ('vendido','vendido_promissoria','nao_compareceu','reprovado','vendido_revisao') then 'concluida'::public.status_chamado
             when setor_mkt = 'suporte_consultores' then 'respondida'::public.status_chamado when outcome = 'aguardando' then 'aberta'::public.status_chamado else 'tratativa'::public.status_chamado end,
        ts, public.add_dias_uteis(ts, 2), sol, public._nome(sol), 'Marketing',
        cli, '(41) 9' || lpad((floor(random()*99999999))::text, 8, '0'), lower(replace(cli, ' ', '.')) || '@exemplo.com',
        ambientes[1+floor(random()*10)::int], 'Cliente pediu visita técnica para planejados.',
        case when outcome = 'aguardando' then null else cons_id end,
        case when setor_mkt = 'atendente_cliente' then vend_id end,
        dv, ruas[1+floor(random()*10)::int] || ', ' || (100 + floor(random()*2000))::int || ' — ' || bairros[1+floor(random()*10)::int] || ', Curitiba',
        case when outcome in ('aguardando','direcionado','nao_realizada','visita_sem_loja') then null else dl end, sc, t)
      returning id into cid;
      insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, ts, sol, public._nome(sol), 'Solicitação aberta (Visita técnica — consultor externo)');
      if outcome <> 'aguardando' then
        insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, least(now(), ts + interval '2 hours'), haisla, public._nome(haisla), 'Direcionado ao consultor ' || public._nome(cons_id));
        insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, least(now(), ts + interval '6 hours'), cons_id, public._nome(cons_id), 'Contato com o cliente iniciado');
      end if;
      if (t->>'realizada') = 'true' then
        insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, least(now(), dv::timestamptz + interval '2 hours'), cons_id, public._nome(cons_id), 'Visita marcada como realizada');
        if random() < .75 then
          insert into public.anexos (chamado_id, tipo, nome, url, criado_por, criado_em) values (cid, 'link', 'Planta baixa (teste)', 'https://example.com/planta-teste.pdf', cons_id, least(now(), dv::timestamptz + interval '3 hours'));
        end if;
      end if;
      if outcome not in ('aguardando','direcionado','nao_realizada','visita_sem_loja') then
        insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, least(now(), dv::timestamptz + interval '4 hours'), cons_id, public._nome(cons_id), 'Vinda à loja agendada para ' || to_char(dl, 'DD/MM/YYYY "às" HH24:MI'));
      end if;
      if setor_mkt = 'atendente_cliente' then
        insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, least(now(), dv::timestamptz + interval '1 day'), sup, public._nome(sup), 'Vendedor definido: ' || public._nome(vend_id));
      end if;
      if t ? 'parecerEm' then
        insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, least(now(), (t->>'parecerEm')::timestamptz), vend_id, public._nome(vend_id), 'Parecer do vendedor: ' || (t->>'parecer'));
      end if;
      if outcome in ('registrada','efetivada','promissoria','cancelada') then
        num := num + 1; valor := round((8000 + random()*52000)::numeric, 2);
        vstat := case outcome when 'registrada' then 'registrada' when 'efetivada' then 'efetivada' when 'promissoria' then 'promissoria' else 'cancelada' end;
        insert into public.vendas (chamado_id, numero, data_venda, vendedor, atendente_nome, status, registrado_por, registrado_em, decidido_por, decidido_em)
        values (cid, num::text, (dl + interval '1 day')::date, public._nome(vend_id), public._nome(vend_id), vstat, vend_id, least(now(), dl::timestamptz + interval '1 day'),
                case when vstat <> 'registrada' then haisla end, case when vstat <> 'registrada' then least(now(), dl::timestamptz + interval '3 days') end);
        insert into public.vendas_valores (chamado_id, valor) values (cid, valor);
        insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, least(now(), dl::timestamptz + interval '1 day'), vend_id, public._nome(vend_id), 'Venda ' || num || ' registrada por ' || public._nome(vend_id));
        if vstat <> 'registrada' then
          insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, least(now(), dl::timestamptz + interval '3 days'), null, 'Gestão', 'Situação da venda ' || num || ': Aguardando confirmação → ' || public._label_venda(vstat));
        end if;
      end if;
    end loop;

    ------------------------------------------------------------------ MARKETING — agendamento direto na loja
    n := case mes when 0 then 9 when 1 then 11 else 14 end;
    for i in 1..n loop
      sol := ops[1 + floor(random()*array_length(ops,1))::int];
      ts := (d + floor(random()*(ultimo - d + 1))::int)::timestamp + make_interval(hours => 8 + floor(random()*10)::int);
      if ts > now() then ts := now() - interval '4 hours'; end if;
      cli := nomes[1+floor(random()*30)::int] || ' ' || sobren[1+floor(random()*30)::int];
      vend_id := vends[1 + floor(random()*array_length(vends,1))::int];
      dl := (ts::date + 1 + floor(random()*6)::int)::timestamp + make_interval(hours => 9 + floor(random()*9)::int, mins => (floor(random()*2)*30)::int);
      r := random();
      if dl > now() then
        outcome := case when r < .5 then 'sem_vendedor' else 'com_vendedor' end;
      else
        outcome := case when r < .15 then 'nao_compareceu' when r < .30 then 'orcamento' when r < .40 then 'reprovado' when r < .50 then 'com_vendedor'
                        when r < .75 then 'efetivada' when r < .85 and mes = 2 then 'registrada' else 'promissoria' end;
      end if;
      setor_mkt := case when outcome = 'sem_vendedor' then 'suporte_consultores' else 'atendente_cliente' end;
      sc := case outcome when 'sem_vendedor' then 'agendado_loja' when 'com_vendedor' then 'com_vendedor' when 'orcamento' then 'orcamento' when 'reprovado' then 'reprovado'
              when 'nao_compareceu' then 'nao_compareceu' when 'registrada' then 'vendido_revisao' when 'efetivada' then 'vendido' else 'vendido_promissoria' end;
      t := jsonb_build_object('teste', true);
      if outcome in ('orcamento','reprovado','nao_compareceu') then
        t := t || jsonb_build_object('parecerStatus', outcome, 'parecer', case outcome when 'orcamento' then 'Passei orçamento, retorna semana que vem.' when 'reprovado' then 'Fechou com concorrente.' else 'Não veio, remarcar.' end,
          'parecerEm', dl + interval '4 hours', 'parecerPor', public._nome(vend_id));
      end if;
      insert into public.chamados (tipo, setor_destino, status, criado_em, sla_resposta, solicitante_id, solicitante_nome, solicitante_setor,
        cliente, telefone, email, produto, motivo, atendente_id, data_loja, status_cliente, tratativa)
      values ('agendamento_loja', setor_mkt,
        case when sc in ('vendido','vendido_promissoria','nao_compareceu','reprovado','vendido_revisao') then 'concluida'::public.status_chamado when setor_mkt = 'suporte_consultores' then 'respondida'::public.status_chamado else 'tratativa'::public.status_chamado end,
        ts, public.add_dias_uteis(ts, 2), sol, public._nome(sol), 'Marketing',
        cli, '(41) 9' || lpad((floor(random()*99999999))::text, 8, '0'), lower(replace(cli, ' ', '.')) || '@exemplo.com',
        ambientes[1+floor(random()*10)::int], 'Cliente agendou pelo Instagram para conhecer a loja.',
        case when setor_mkt = 'atendente_cliente' then vend_id end, dl, sc, t)
      returning id into cid;
      insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, ts, sol, public._nome(sol), 'Solicitação aberta (Agendamento direto na loja)');
      if random() < .4 then insert into public.anexos (chamado_id, tipo, nome, url, criado_por, criado_em) values (cid, 'link', 'Fotos do ambiente (teste)', 'https://example.com/fotos-teste', sol, ts + interval '10 minutes'); end if;
      if setor_mkt = 'atendente_cliente' then
        insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, least(now(), ts + interval '5 hours'), haisla, public._nome(haisla), 'Vendedor definido: ' || public._nome(vend_id)); end if;
      if t ? 'parecerEm' then
        insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, least(now(), (t->>'parecerEm')::timestamptz), vend_id, public._nome(vend_id), 'Parecer do vendedor: ' || (t->>'parecer')); end if;
      if outcome in ('registrada','efetivada','promissoria') then
        num := num + 1; valor := round((6000 + random()*40000)::numeric, 2);
        vstat := case outcome when 'registrada' then 'registrada' when 'efetivada' then 'efetivada' else 'promissoria' end;
        insert into public.vendas (chamado_id, numero, data_venda, vendedor, atendente_nome, status, registrado_por, registrado_em, decidido_por, decidido_em)
        values (cid, num::text, (dl + interval '1 day')::date, public._nome(vend_id), public._nome(vend_id), vstat, vend_id, least(now(), dl::timestamptz + interval '1 day'),
                case when vstat <> 'registrada' then haisla end, case when vstat <> 'registrada' then least(now(), dl::timestamptz + interval '3 days') end);
        insert into public.vendas_valores (chamado_id, valor) values (cid, valor);
        insert into public.historico (chamado_id, quando, quem_id, quem_nome, texto) values (cid, least(now(), dl::timestamptz + interval '1 day'), vend_id, public._nome(vend_id), 'Venda ' || num || ' registrada por ' || public._nome(vend_id));
      end if;
    end loop;
  end loop;
end $$;
