# ImobiFlow - Fase 6: Proprietários e imóveis

## Objetivo desta entrega

Avançar o produto SaaS para a base imobiliária principal: proprietários e imóveis. Essa fundação será usada por CRM, vistorias, contratos, locação, financeiro, repasses e portais.

## Banco de dados

Migration adicionada:

- `database/migrations/004_real_estate_foundation.sql`

Tabelas criadas:

- `property_owners`
- `properties`
- `property_media`
- `property_documents`

Todas as tabelas possuem `company_id` e RLS. As políticas limitam leitura e escrita à empresa retornada por `private.current_company_id()`.

## Permissões

Permissões adicionadas:

- `owners.manage`
- `properties.publish`

As permissões existentes continuam valendo:

- `owners.view`
- `properties.view`
- `properties.manage`

## API

Router criado:

- `backend/src/routes/real-estate.ts`

Endpoints:

- `GET /real-estate/owners`
- `POST /real-estate/owners`
- `GET /real-estate/properties`
- `POST /real-estate/properties`
- `PATCH /real-estate/properties/:id`

Todas as rotas privadas passam por:

- login válido;
- empresa ativa;
- assinatura ativa;
- permissão do usuário.

## Interface interna

Telas atualizadas:

- `/app/proprietarios`
- `/app/imoveis`

Comportamento:

- ambas iniciam vazias;
- mostram estado vazio quando não há dados;
- permitem cadastrar proprietário;
- permitem cadastrar imóvel;
- imóvel pode ser vinculado a proprietário;
- dados do preview ficam apenas no navegador.

## Sem dados fictícios

Não foram criados imóveis, proprietários, documentos ou mídias no banco. O modo preview continua local, usando `localStorage`, apenas para visualização do fluxo enquanto o backend real não está publicado.

## Próxima etapa recomendada

1. Criar módulo de vistorias vinculado a imóveis: iniciado em `docs/phase-7-inspections-foundation.md`.
2. Criar ambientes/cômodos da vistoria.
3. Preparar upload de fotos via storage.
4. Gerar laudo PDF inicial.
5. Depois avançar contratos e financeiro com base nos imóveis reais.
