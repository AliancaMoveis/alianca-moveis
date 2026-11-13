# Checklist · Área do projetista no 360 — decisões e especificação (13/11/2026)

Documento para quem for construir (ex.: sessão do Claude Code na web no repositório AliancaMoveis/alianca-moveis).

## Princípios
- O **360 é a ferramenta de trabalho** do projetista do checklist (100% no 360). O **Exact é só espelho** para conferência. Finalização da venda continua no Tático.
- Na tela do projetista **não aparece nenhum valor** (nem cupom, nem preço).
- Sem botão de Rota e sem "Abrir no Exact". "Arquivos do vendedor" passa a se chamar **"Arquivos da venda"**.

## Integração Exact já pronta (não mexer sem motivo)
- Supabase projeto `byunwadtkvgwqnlxhpcn`, Edge Function `exact` (segredo EXACT_TOKEN; cabeçalho x-exact-segredo = exact_config.segredo).
- Leitura do Exact a cada 5 min (calendário inteiro a cada 15). Envio na hora de agendamento, bloqueio e reserva (gatilhos _trg_exact_push / _trg_exact_bloq). Reserva sem resposta libera em 2 dias (cron ck-liberar-reservas).
- Edge Function auxiliar `exact-pdf`: lê texto de PDF do bucket público alianca-bucket (só com o segredo).
- Anexos do ticket: `GET /ticket/checklist/:id` (attachments com URL S3 pública; tipos MEASURING, QUESTIONNAIRE, FINAL_PROJECT, OTHER). Arquivos da venda: `GET /attachments-legacy/:saleId` + `GET /attachment/download-legacy/:id`. Subir anexo: `POST /attachments` multipart (file, referenceType, referenceId "0", ticketId) — **rota ainda não testada**.
- Lacuna: mover ticket para "Checklist concluído" (CHECKLIST_FINISHED) ao marcar realizado — rota não encontrada/testada.

## Código já no repositório (commit 0ebe1d7, ainda não ligado a tela)
- `src/lib/listagemPromob.ts` — `lerListagemArquivo(buf)` / `lerListagem(pags)`: lê a listagem/orçamento do Promob (PDF com texto, via pdf.js). Extrai cliente, celular, projeto, data, itens (qtd, referência, descrição, medidas), tipo (módulo, porta, painel, fundo, ferragem, consumível), material (MDP/MDF), espessura, código de cor. **Descarta todo valor** (preço, condições de pagamento, descontos, total). Avisa quando o PDF não tem texto (impresso como imagem).
- `src/lib/termoChecklist.ts` — `ambienteDaListagem(nome, itens, listagem)` e `termoHtml(dados)`: gera o termo de ciência (A4) + página "Itens do projeto por ambiente" (peças iguais agrupadas, sem parafusos/pregos/fitas/suportes, sem valores).
- Testado com a listagem real `sil_coz.pdf` (Promob Lite · Luciane): 60 itens lidos, caixas MDP 15 mm, fundo 3 mm, ferragens (dobradiça Slowmotion, pistão a gás), cores só em código (277, 276, 275, 175).

## Fluxo combinado (etapas na aba Checklist)
1. **Iniciar atendimento** (registra horário).
2. **Ambientes** — o projetista **escreve** os ambientes (campo livre + sugestões de nomes; repetidos viram "Cozinha 2"; renomear, excluir, ordenar). Registra quem escreveu. Cliente confirma a lista.
3. **Subir arquivos finais**:
   - Imagens do projeto → escolhe o ambiente de cada imagem → **vão para o cliente**.
   - Listagem do Promob → sistema lê (sem valores) → **não vai para o cliente** (guardada interna).
   - Arquivo .promob → só guarda → **não vai para o cliente**.
   - Cada listagem: o projetista diz a quais ambientes ela pertence. 1 listagem = 1 ambiente é o padrão desejado; se cobrir vários (ex.: cozinha + banheiro), o material é copiado para todos e os itens ficam juntos ("Cozinha + Banheiro"), com botão opcional "Separar itens". Ambiente sem listagem = preenchido à mão.
4. **Sistema monta** por ambiente: termo de material pré-preenchido + checklist do ambiente. O que não identificar fica em amarelo ("conferir").
5. **Conferência rápida em tela**: clicar MDP/MDF, 15/18 mm; **escrever o nome da cor** (Freijó, Legno Crema…) — código de cor nunca vai para o cliente; sistema sugere nomes já usados. Marcar a ficha. "Gerar impressão" só libera sem nada em amarelo.
6. **Gerar o arquivo de impressão (um PDF só)**: capa (cliente/venda) · por ambiente: imagens + checklist · termo de ciência do material · condições gerais (ficha de 29 itens abaixo) + responsabilidades antes da montagem · assinaturas. **Sem valores, sem listagem, sem .promob.**
7. **Imprimir → cliente assina tudo de uma vez → subir o digitalizado** (vai para o Exact como "Outros") → **Marcar realizado** (travado até anexar o digitalizado).

## Termo de ciência do material (aprovado — rascunho, revisar com jurídico)
1. Material por ambiente (linha por ambiente, cliente rubrica): Caixas/corpo [MDP|MDF] [15|18 mm] · Portas/frentes [MDP|MDF|Vidro] [15|18 mm] · Cor/padrão (nome, escrito pelo projetista).
2. Declarações (assinalar): viu as amostras; conferiu material e espessura com o projeto final; informado das diferenças MDP×MDF, troca depois exige novo orçamento e pode alterar prazo; pode haver variação de tom entre amostra, imagem e lote; nem MDP nem MDF são à prova d'água; não inclusos: granito/pedra, eletrodomésticos, cuba, iluminação (riscar o que estiver incluso).
3. Antes da montagem — responsabilidade do cliente: informar/disponibilizar a planta (ou indicação nas paredes) da tubulação de água, esgoto e gás e da fiação elétrica; pontos de água, esgoto, gás, luz e tomadas prontos — instalar/mudar/ligar não é responsabilidade da loja nem do montador; ambiente livre dos móveis antigos (inclusive granito/pedra apoiados), retirada por conta do cliente.
4. Observações do checklist (ferragens lidas da listagem + texto livre).
Assinaturas: cliente e projetista. Caixas alinhadas em colunas.

## Ficha do checklist (condições gerais — questionário usado hoje no Exact, 29 itens, resposta Sim)
1. A Aliança não fará nenhum tipo de instalação ou alteração elétrica, hidráulica ou de gás.
2. O cliente deverá fornecer planta elétrica, hidráulica e de gás para que o montador possa furar as paredes, diminuindo o risco de incidente.
3. Caso não possua projetos elétricos, hidráulicos e de gás, o cliente será responsável por quaisquer danos causados durante a montagem nos mesmos.
4. Vazamentos hidráulicos de qualquer tipo que possam danificar o móvel são de inteira responsabilidade do cliente e a garantia não se aplica.
5. Em condomínio, o cliente deverá fornecer os horários permitidos para entrega e para a equipe de instalação permanecer no local.
6. Devido à quantidade de peças e complexidade, existe risco de peças danificadas na montagem ou no transporte; serão listadas no término e pedidas à fábrica, com prazo de até 45 dias a contar do término da montagem.
7. As paredes têm que estar absolutamente desobstruídas e prontas para receber os móveis.
8. Se houver móvel instalado no mesmo local, o antigo deverá ser retirado pelo cliente e o ambiente totalmente liberado (inclusive granito sustentado pelo móvel antigo).
9. Rodapés/sancas terão de ser retirados previamente pelo cliente, não pelo instalador.
10. Paredes irregulares (ângulos, acabamento) poderão afetar a instalação e impedir regulagem totalmente afinada, pois o móvel vem com recorte reto.
11. A montagem não será concluída no mesmo dia; o montador possivelmente interromperá no fim do dia e continuará nos dias seguintes.
12. Eventualmente serão feitos recortes no móvel durante a montagem; o cliente deverá reservar um local para isso.
13. Recortes e montagem produzem sujeira e resíduos; o montador remove, mas não na totalidade; a limpeza é responsabilidade do cliente.
14. Em recortes, a fita de borda é recolocada manualmente pelo montador, podendo haver pequenas variações de acabamento em relação às originais de fábrica, que não serão possíveis de resolver.
15. Montadores e ajudantes trabalharão obrigatoriamente com EPIs, incluindo botas.
16. Somente maiores de 18 anos poderão receber os montadores.
17. Ao término da montagem o cliente assinará um termo de conclusão de serviço, onde deverão constar todas as reclamações sobre móvel e montagem.
18. O montador não fará a instalação de quaisquer eletrodomésticos no móvel.
19. Não poderão ser instalados módulos suspensos em paredes de drywall.
20. Necessidade de aumentar vistas caso as janelas possuam cortinas/persianas, para as portas não baterem.
21. Em recortes para sanca com desenho curvo, o recorte não será no mesmo formato, e sim reto.
22. Quando o sóculo tem profundidade superior à do móvel, haverá distância entre parede e módulo (informar qual).
23. O cliente deverá respeitar as normas técnicas dos manuais dos eletrodomésticos (ex.: distância mínima entre forno e lateral do móvel, evitando danos por superaquecimento).
24. Se houver instalações elétricas no móvel, a loja não faz esse tipo de instalação; apenas deixa furações e caminhos internos para um profissional não vinculado à loja fazer depois.
25. O projeto que será enviado à fábrica, entregue e montado é o validado no checklist; o que foi proposto pelo vendedor deixa de valer na assinatura e conclusão do checklist (projeto final).
26. O cliente informou se quer iluminação futura no móvel (após instalado), para o projetista indicar o formato ideal.
27. A loja não vende nem bonifica granito/mármore/quartzo, mas pode indicar.
28. Quando o móvel sobrepor registros, tomadas, interruptores etc., o recorte será manual pelo montador, com serra copo e furadeira.
29. Em móveis com cantos retos, o móvel não irá até o final da parede por possíveis diferenças de ângulo, deixando um vão livre (não visível) que garante margem de erro.

## Pendências
- Tabela de cores da Luciane (código → nome) — o usuário vai enviar depois; até lá, o nome da cor é escrito à mão.
- Envio completo de exemplo (imagens + listagem + .promob) para testar o PDF final.
- Testar POST /attachments (digitalizado → Exact "Outros") e achar a rota que move o ticket para "Checklist concluído".
- Mockups de referência: 360_projetista_tela1_venda.png, tela2_checklist.png, tela3_ambientes.png, Termo_ciencia_material_RASCUNHO.pdf, Termo_gerado_da_listagem_TESTE.pdf.

## Layout da tela (OBRIGATÓRIO seguir os mockups do projeto)
Mockups aprovados pelo usuário (HTML no projeto): `claude/mockups/mockup_tela1_venda_medicao.html`, `mockup_tela2_finalizacao.html`, `mockup_tela3_ambientes.html`. A tela real deve reproduzir esse layout (com os componentes/estilo do 360):
- **Duas colunas**: à esquerda a lista "Meu dia" (cartões por dia: horário, duração, cliente, venda, bairro, ambientes, selos de presença confirmada / a confirmar / sem fotos da medição / nº de arquivos; reservas em amarelo com "libera sozinha em …"). À direita a **ficha do cliente selecionado**.
- **Cabeçalho da ficha**: nome, venda, horário, ambientes, telefone, vendedor, medição (status · medidor), endereço; botões só **WhatsApp**, **Iniciar checklist** (vira selo "⏱ Checklist em andamento · desde HH:MM") e **Marcar realizado**. Sem Rota, sem "Abrir no Exact", **sem nenhum valor**.
- **Abas**: 🧾 Venda · 📐 Medição · ✏️ Checklist (etapa X de 5) · 🕘 Histórico.
- **Aba Venda**: "Arquivos da venda" em grade de miniaturas (imagens, PDF com visualização na tela, .promob para baixar) vindos do Exact (`/attachments-legacy/:saleId` + download); área de anexar ("fica no 360 e vai para o ticket no Exact").
- **Aba Medição**: fotos da medição do Exact (fieldReport attachments, URLs S3) + medidas do 360 / Minha Visita.
- **Aba Checklist** com as 5 etapas em faixa: 1 Ambientes da venda → 2 Conferência por ambiente → 3 Gerar impressão → 4 Subir assinado → 5 Marcar realizado. Painel lateral "Para seguir…" com as travas e "Histórico".
  - Etapa 1 (tela3): campo livre "Escreva o ambiente e aperte Enter" + chips de sugestão + lista dos ambientes (renomear, ✕, arrastar), origem (sugestão / escrito por fulano).
  - Etapa 2 (tela2): anexar listagens (cada uma ligada a 1+ ambientes), termo por ambiente editável (MDP/MDF, 15/18, vidro, cor escrita por nome), ficha por ambiente, itens "conferir" em amarelo.
  - Etapa 3: gerar PDF único (capa, imagens + checklist por ambiente, termo de material, condições gerais 29 itens + responsabilidades, assinaturas).
  - Etapa 4: arrastar o digitalizado assinado → vai para o Exact como "Outros".
  - Etapa 5: "Marcar realizado" travado até o digitalizado ser anexado.

## Situação em 13/11/2026 (revisão da 1ª versão feita no Claude Code web)
- Ramificação `claude/gifted-wright-hfhlfu` (commit f917b72), **ainda não está no main**. Compila sem erro.
- Fez: menu/área do projetista com agenda própria (RPC ck_projetista_eu / ck_projetista_agenda / ck_projetista_salvar), acesso extra `projetista_checklist`, listagem → termo, finalizar, botão "📄 Termo" no cartão.
- Migração `0191_checklist_area_projetista.sql` **não aplicada** no Supabase (aplicar pela sessão Cowork, que tem Supabase, junto com o merge no main).
- Falta ficar igual aos mockups (layout acima) e: etapa de ambientes antes da listagem, imagens por ambiente, PDF único com as 29 condições, digitalizado → Exact, trava do realizado.

## Situação em 13/11/2026 (2ª versão — layout dos mockups)
- `src/telas/ProjetistaChecklist.tsx` refeito no layout dos mockups: "Meu dia" à esquerda (dia escolhido + próximos dias, reservas em amarelo com "libera sozinha em…", bloco "A finalizar" para data passada sem termo) e ficha à direita com Venda · Medição · Checklist (5 etapas) · Histórico.
- Etapas: 1 ambientes (texto livre + sugestões, repetidos viram "Cozinha 2", renomear/excluir/arrastar, quem escreveu, cliente confirmou) → 2 conferência (listagem ligada a 1+ ambientes, MDP/MDF, 15/18, vidro, nome da cor com sugestões, código de cor só como dica, ficha por ambiente Sim/Não com obs obrigatória no "Não", imagens por ambiente) → 3 impressão única (`impressaoHtml` em `termoChecklist.ts`: capa, folha por ambiente com imagens + ficha + resumo do que foi comprado, termo, 29 condições gerais, assinaturas) → 4 digitalizado assinado (vai para o Exact como "Outros") → 5 marcar realizado (o banco recusa sem impressão e sem assinado).
- Nova Edge Function `checklist-arquivos` (com o login da pessoa; usa EXACT_TOKEN): arquivos da venda (`/attachments-legacy/:saleId` + download), anexos do ticket (MEASURING → Medição, FINAL_PROJECT → Venda), anexos das medidas do 360, envio para o bucket privado `checklist` e `POST /attachments` no Exact. **Precisa ser publicada** (supabase functions deploy checklist-arquivos). A função `exact` não foi alterada.
- Migração 0191 reescrita (ainda **não aplicada**): ck_projetista_agenda (inclui reservas, medição e histórico), ck_projetista_contexto, ck_projetista_salvar(p_id, p, p_acao: salvar · iniciar · impressao · assinado · realizado), bucket `checklist`.
- Ainda pendente: rota do Exact para mover o ticket para "Checklist concluído"; testar `POST /attachments` e os nomes dos campos de `/attachments-legacy` (a função lê vários nomes possíveis); ficha do ambiente usa 6 itens provisórios até chegar o modelo da ficha de vocês.
