# ALIANÇA 360

Central de gestão da Aliança Móveis: call center (pós-venda) e funil de marketing/consultoria (pré-venda).
Versão de produção do protótipo `REFERENCIA-sistema-atual.html`, com as mesmas regras, telas e textos.

## Arquitetura

- **Frontend**: Vite + React + TypeScript (`src/`). O CSS é o mesmo do protótipo (`src/estilo.css`).
- **Banco e login**: Supabase (projeto `byunwadtkvgwqnlxhpcn`, região São Paulo). Login por e-mail e senha.
- **Hospedagem**: Vercel.

### Onde ficam as regras

| O quê | Onde |
|---|---|
| Quem vê o quê (papéis/setores) | RLS no banco — `supabase/migrations/0002_permissoes_rls.sql` (+ correção 0005) |
| Toda gravação (venda, transferência, status, anexos…) | Funções do banco — `supabase/migrations/0003_acoes.sql` |
| Só a Gestão decide a situação da venda | `decidir_venda` + gatilhos `proteger_venda` / `proteger_status_cliente` |
| Escalonamento automático (urgente / crítico) | `autoescalonar()` rodando a cada 5 min via `pg_cron` |
| Criação de usuários / troca de e-mail e senha pela Gestão | Edge Function `supabase/functions/admin-usuarios` |
| Regras de tela (o que mostrar/esconder) | `src/lib/regras.ts` (porte direto do protótipo) |

O navegador **não grava direto em nenhuma tabela**: só lê (filtrado pelo RLS) e chama funções que conferem a permissão.
O histórico é só de inclusão (não pode ser alterado nem apagado).

## Rodar localmente

```bash
cp .env.example .env    # URL e chave publicável do Supabase
npm install
npm run dev
```

### Teste de fumaça (sem Supabase)

Abre todas as telas de todos os perfis com os dados de exemplo e abre todas as fichas:

```bash
npx vite --port 5199 &
node teste/smoke.mjs
```

## Deploy (Vercel)

Variáveis de ambiente do projeto:

- `VITE_SUPABASE_URL` = `https://byunwadtkvgwqnlxhpcn.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = chave publicável (segura para o navegador)

Build: `npm run build` → pasta `dist`.

## Assistente 360 (chat com voz)

Botão "360" no canto da tela, só para usuários liberados. As consultas e alterações rodam **no app, com o login da própria pessoa**
(mesmas regras de `src/lib/regras.ts` e mesmas funções do banco das telas). Toda alteração mostra um cartão de confirmação antes de gravar
e deixa uma nota "Feito pelo Assistente 360" no histórico do cliente. Só a conversa com o Claude passa pelo servidor.

| O quê | Onde |
|---|---|
| Ponte segura para a API do Claude (guarda a chave, confere o login e a liberação) | `api/assistente.ts` |
| Ferramentas (consultar, propor e executar alterações) e instruções do assistente | `src/lib/assistente.ts` |
| Tela do chat, voz e cartões de confirmação | `src/comp/Assistente.tsx` |

Variáveis de ambiente no Vercel (projeto `alianca360`):

- `ANTHROPIC_API_KEY` = chave da API do Claude (**sem** prefixo `VITE_`, para nunca ir ao navegador)
- `ASSISTENTE_EMAILS` = e-mails liberados, separados por vírgula (opcional; sem ela, só `bruno.fiaron@aliancamoveis.com.br`)
- `ASSISTENTE_MODELO` = modelo (opcional; padrão `claude-sonnet-5-5`)

Depois de salvar a variável, é preciso fazer um novo deploy (Deployments → Redeploy) para ela valer.

## Dados de exemplo

Gerados a partir do `seed()` do protótipo (`scripts/gerar-seed.mjs` → `supabase/seed/chamados-seed.json`).
Usuários de teste: `nome@alianca360.teste` (ex.: `rafaela@alianca360.teste`, `roy@alianca360.teste`), mesma senha de teste para todos.
