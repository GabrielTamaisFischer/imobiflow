# ImobiFlow - Fase 1, 2 e base de bloqueio por assinatura

## Stack identificada

- Frontend atual: Vite, React 19, TanStack Router/Start, Tailwind CSS 4, Radix UI e componentes no padrão shadcn.
- Landing page aprovada: preservada em `src/routes/index.tsx` e `src/components/*`.
- Backend adicionado: Node.js + Express em `backend/`.
- Banco planejado: Supabase PostgreSQL com RLS e `company_id`.

## Organização criada

- `src/routes/index.tsx`: landing page existente, sem mudança.
- `src/routes/cadastro.tsx`: cadastro inicial de owner + empresa.
- `src/routes/entrar.tsx`: login.
- `src/routes/app.tsx`: primeira área interna protegida, sem dados fictícios.
- `src/routes/assinatura-bloqueada.tsx`: bloqueio para assinatura inativa.
- `src/product/*`: cliente HTTP e regras de sessão/assinatura usadas pela UI.
- `backend/src/*`: API, middlewares, webhooks e validação.
- `database/migrations/*`: estrutura inicial Supabase.
- `docs/*`: documentação técnica incremental.

## Regra central implementada

Login não libera o sistema sozinho. A API possui middlewares separados:

- `requireAuth`: valida token Supabase.
- `requireCompany`: exige usuário vinculado a empresa ativa.
- `requireActiveSubscription`: bloqueia se assinatura estiver `inactive`, `pending`, `expired`, `cancelled` ou `past_due`.
- `requirePermission`: prepara validação por permissão/role.

## Cadastro inicial

Endpoint: `POST /auth/register`

Cria:

- usuário no Supabase Auth;
- empresa em `companies`;
- role `owner`;
- usuário em `users` vinculado à empresa;
- assinatura inicial em `subscriptions` com status `inactive`.

O sistema não cria imóveis, leads, contratos, pagamentos falsos ou dados demonstrativos.

## Login e sessão

Endpoint: `POST /auth/login`

Valida credenciais pelo Supabase Auth e retorna contexto de acesso com:

- usuário;
- empresa;
- role;
- permissões;
- assinatura;
- plano, quando houver.

Endpoint: `GET /auth/session`

Recalcula o contexto a partir do token enviado no header `Authorization`.

## Banco de dados

Migration inicial:

- `companies`
- `users`
- `roles`
- `permissions`
- `role_permissions`
- `plans`
- `subscriptions`
- `payments`
- `gateway_events`
- `audit_logs`

Todas as tabelas de empresa possuem `company_id` quando são operacionais ou dependem da imobiliária. Catálogos globais como `plans` e `permissions` não usam `company_id`.

RLS foi habilitado em todas as tabelas públicas criadas. A migration também inclui `GRANT` explícito para Data API, seguindo mudança recente do Supabase em que tabelas novas não são expostas automaticamente para `anon` e `authenticated`.

## Webhooks Kiwify/Cakto

Endpoints:

- `POST /webhooks/kiwify`
- `POST /webhooks/cakto`

Estado atual:

- valida segredo via header `x-imobiflow-webhook-secret`;
- registra payload bruto em `gateway_events`;
- resolve empresa por `company_id`/metadata ou e-mail do comprador;
- atualiza `subscriptions.status`;
- registra pagamento quando payload contém valor.

Antes de produção, substituir/estender essa validação pelo mecanismo oficial de assinatura de cada gateway.

## Estados vazios

A rota `/app` mostra apenas estados vazios:

- nenhum imóvel cadastrado;
- nenhum lead encontrado;
- nenhum contrato criado.

Não há seed de dados comerciais ou dados fictícios.

## Próximos passos recomendados

1. Aplicar a migration no projeto Supabase.
2. Configurar `.env` do backend com chaves reais do Supabase.
3. Cadastrar planos reais em `plans`.
4. Configurar URLs reais de checkout Kiwify/Cakto.
5. Confirmar payloads oficiais de webhook e ajustar validação.
6. Implementar convites de usuários e CRUD de roles/permissões.
7. Avançar para dashboard interno com indicadores zerados e filtros reais.
