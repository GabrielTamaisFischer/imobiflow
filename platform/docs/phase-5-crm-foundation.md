# ImobiFlow - Fase 5: CRM inicial multiempresa

## Objetivo desta entrega

Iniciar o primeiro módulo operacional real do produto SaaS sem mexer na landing page. O CRM passa a ter base de banco, API protegida e tela interna preparada para começar vazia.

## Banco de dados

Migration adicionada:

- `database/migrations/003_crm_foundation.sql`

Tabelas criadas:

- `crm_pipelines`
- `crm_stages`
- `leads`
- `lead_notes`
- `lead_tasks`
- `lead_events`

Todas as tabelas possuem `company_id`, exceto vínculos globais que não se aplicam aqui. RLS foi habilitado em todas elas e as políticas usam `private.current_company_id()` com `auth.uid() is not null`.

## Funil comercial

Ao cadastrar uma empresa, a API cria um funil padrão estrutural:

- Novo lead
- Atendimento
- Visita
- Proposta
- Fechamento

Isso não cria leads, imóveis ou dados comerciais fictícios. É apenas a estrutura mínima para o CRM funcionar.

## API CRM

Router criado:

- `backend/src/routes/crm.ts`

Endpoints:

- `GET /crm/pipeline`
- `GET /crm/leads`
- `POST /crm/leads`
- `PATCH /crm/leads/:id`
- `POST /crm/leads/:id/notes`
- `POST /crm/leads/:id/tasks`

Todas as rotas passam por:

- `requireAuth`
- `requireCompany`
- `requireActiveSubscription`
- `requirePermission`

Ou seja, usuário logado continua não sendo suficiente. Acesso exige login válido, empresa ativa, assinatura ativa e permissão.

## Tela interna CRM

Rota atualizada:

- `src/routes/app.crm.tsx`

Comportamento:

- começa sem leads;
- carrega funil e leads pela API real quando o backend estiver configurado;
- exibe estado vazio quando não houver dados;
- permite cadastro de lead real;
- organiza leads por etapa do funil.

## Modo visualização

Enquanto o backend de produção não está publicado, o modo visualização permite testar o fluxo do CRM usando apenas `localStorage` do navegador.

Importante:

- não cria dados no banco;
- não popula a empresa com dados fictícios;
- inicia vazio;
- tudo que for cadastrado no preview fica local no navegador.

## Próximos passos

1. Aplicar migrations no Supabase.
2. Publicar API backend com variáveis reais.
3. Configurar `VITE_IMOBIFLOW_API_URL` no frontend.
4. Implementar movimentação de leads entre etapas.
5. Adicionar notas, tarefas e histórico na interface.
6. Cadastro de proprietários e imóveis com `company_id`: iniciado em `docs/phase-6-properties-owners.md`.
