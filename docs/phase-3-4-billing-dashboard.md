# ImobiFlow - Fase 3 e início da Fase 4

## Objetivo desta entrega

Consolidar a base de planos/assinaturas e iniciar a área interna do produto com layout SaaS, navegação por módulos e estados vazios. A landing page segue preservada.

## Fase 3 - Planos, assinatura e bloqueio

### Catálogo de planos

Migration adicionada:

- `database/migrations/002_plan_features_and_base_catalog.sql`

Ela cria:

- `plan_features`
- permissões base do sistema
- planos Start, Pro e Enterprise
- variações mensal e trimestral
- features por plano

Esses registros são catálogo do produto. Não são dados operacionais fictícios de imobiliária.

### API de planos

Endpoint criado:

- `GET /billing/plans`

Retorna planos ativos e suas features para a futura tela de seleção/checkout.

### Bootstrap protegido

Endpoint ajustado:

- `GET /app/bootstrap`

Continua protegido por:

- login válido
- empresa vinculada
- empresa ativa
- assinatura ativa

Retorna estrutura inicial de módulos, métricas zeradas, alertas vazios e mensagens de estado vazio.

## Fase 4 - Layout interno e dashboard vazio

Rotas internas criadas:

- `/app`
- `/app/crm`
- `/app/imoveis`
- `/app/proprietarios`
- `/app/agenda`
- `/app/vistorias`
- `/app/contratos`
- `/app/financeiro`
- `/app/configuracoes`

Componentes criados:

- `src/components/app/app-shell.tsx`
- `src/components/app/module-page.tsx`
- `src/components/app/empty-state.tsx`
- `src/components/app/metric-card.tsx`

Helpers criados:

- `src/product/app-modules.ts`
- `src/product/use-session-guard.ts`

## Estados vazios

Todas as telas internas iniciam vazias:

- nenhum imóvel cadastrado
- nenhum lead encontrado
- nenhum proprietário cadastrado
- nenhum compromisso agendado
- nenhuma vistoria criada
- nenhum contrato criado
- nenhum lançamento financeiro
- nenhum alerta gerado

Os botões de ação ainda ficam desabilitados porque os CRUDs reais entram nas próximas fases. Isso evita simular cadastro sem backend finalizado.

## Próxima etapa

Próxima etapa iniciada em `docs/phase-5-crm-foundation.md`.

Seguir para CRUD real, em ordem:

1. aplicar migrations no Supabase;
2. configurar backend e variáveis reais;
3. criar tabelas operacionais de CRM com `company_id`;
4. implementar leads, etapas do funil, tarefas, observações e histórico;
5. manter bloqueio por assinatura em todas as APIs privadas.
