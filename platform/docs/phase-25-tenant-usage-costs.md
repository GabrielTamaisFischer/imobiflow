# Fase 25 - Controle interno de custos por imobiliaria

## Objetivo

Criar a base para medir o custo operacional de cada imobiliaria dentro do ImobiFlow.

Essa fase atende ao adendo do SDD sobre controle de margem, precificacao futura e sustentabilidade do SaaS.

## Banco de dados

Nova migracao:

- `database/migrations/017_tenant_usage_costs.sql`

Tabelas criadas:

- `cost_catalog_items`
- `tenant_usage_events`
- `tenant_cost_snapshots`

Permissoes adicionadas:

- `costs.view`
- `costs.manage`

Catalogo inicial de metricas:

- armazenamento consumido;
- fotos enviadas;
- PDFs gerados;
- chamadas de IA;
- mensagens WhatsApp;
- cobrancas emitidas;
- PIX gerados;
- boletos emitidos;
- usuarios ativos;
- consumo de API.

## Backend

Novo roteador:

- `backend/src/routes/usage-costs.ts`

Endpoints:

- `GET /usage-costs/catalog`
- `GET /usage-costs/events`
- `GET /usage-costs/summary`
- `POST /usage-costs/events`

Todos exigem:

- login valido;
- empresa vinculada;
- assinatura ativa;
- permissao adequada.

## Produto web

Novo modulo interno:

- `/app/custos`

A tela mostra:

- custo estimado;
- receita estimada;
- margem estimada;
- consumo por metrica;
- eventos recentes.

O sistema inicia vazio e nao cria dados ficticios.

## Decisao tecnica

O SDD usa o termo `tenant_id`. No schema atual do ImobiFlow, o identificador multiempresa padrao e `company_id`. Todas as tabelas desta fase seguem esse padrao.

## Proximos passos

- registrar eventos automaticamente em upload de fotos;
- registrar eventos em geracao de PDF;
- registrar eventos em uso de IA;
- registrar eventos em envio WhatsApp/e-mail;
- registrar eventos em emissao de boleto/PIX;
- criar snapshot mensal automatico;
- criar painel administrativo global para comparar tenants.
