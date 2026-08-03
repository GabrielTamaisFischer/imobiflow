# Website Builder ImobiFlow - Fase 1

Esta fase cria a fundacao do Website Builder dentro da area interna do ImobiFlow, sem alterar a landing page publica aprovada e sem migrar o backend inteiro.

## O Que Foi Implementado

- MySQL local preparado por Docker Compose em `docker-compose.mysql.yml`.
- Prisma configurado em `prisma/schema.prisma`.
- Configuracao moderna do Prisma em `prisma.config.ts`, sem depender de `package.json#prisma`.
- Migration versionada em `prisma/migrations/202605220001_website_builder_foundation`.
- Seed estrutural em `prisma/seed.ts` para template de site em branco, sem dados ficticios de producao.
- API Express isolada em `/website-builder`.
- Cliente frontend isolado em `/app/site/builder`.
- Camada base de storage abstraida para provider configuravel.
- Dependencia de `localStorage` removida dos dados principais do novo Website Builder.
- Auditoria basica persistida em `website_audit_logs` para a preparacao do backend real.
- Guia de publicacao real em `docs/website-builder-production-backend.md`.

## Tabelas Criadas

Todas as tabelas principais possuem `company_id` obrigatorio:

- `websites`
- `website_pages`
- `website_sections`
- `website_components`
- `website_templates`
- `website_assets`
- `website_domains`
- `website_seo`
- `website_versions`
- `website_publish_logs`
- `website_audit_logs`

As tabelas nao possuem FK para `companies`, porque nesta fase o MySQL foi adicionado em paralelo ao backend atual. O isolamento por empresa e feito pela API usando o contexto autenticado atual.

## Variaveis De Ambiente

Adicione no ambiente do backend:

```env
DATABASE_URL=mysql://imobiflow:imobiflow_local_password@127.0.0.1:3306/imobiflow

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
```

Sem as variaveis R2, o endpoint de upload retorna erro controlado `503` explicando quais variaveis faltam. O sistema nao usa `localStorage` como fallback de midia.

## MySQL Local Com Docker

Na raiz do projeto:

```bash
docker compose -f docker-compose.mysql.yml up -d
```

Banco local criado:

```txt
host: 127.0.0.1
port: 3306
database: imobiflow
user: imobiflow
password: imobiflow_local_password
```

## Prisma

Instale as dependencias do backend se necessario:

```bash
cd backend
npm install
```

Validar schema:

```bash
cd backend
npm run prisma:validate
```

Gerar client:

```bash
cd backend
npm run prisma:generate
```

Aplicar migrations no MySQL:

```bash
cd backend
npm run prisma:migrate
```

Criar seed estrutural:

```bash
cd backend
npm run prisma:seed
```

## APIs Da Fase 1

Todas as rotas usam:

- autenticação;
- empresa ativa;
- assinatura ativa;
- permissao `site.manage`.

Rotas:

```txt
GET    /website-builder/websites
POST   /website-builder/websites
GET    /website-builder/websites/:id
PUT    /website-builder/websites/:id
DELETE /website-builder/websites/:id
GET    /website-builder/websites/:id/versions
GET    /website-builder/websites/:id/publish-logs
GET    /website-builder/websites/:id/audit-logs
GET    /website-builder/websites/:id/domains
POST   /website-builder/websites/:id/domains
PUT    /website-builder/domains/:domainId
DELETE /website-builder/domains/:domainId
GET    /website-builder/websites/:id/seo
PUT    /website-builder/websites/:id/seo

GET    /website-builder/websites/:id/pages
POST   /website-builder/websites/:id/pages
PUT    /website-builder/pages/:pageId
DELETE /website-builder/pages/:pageId

GET    /website-builder/pages/:pageId/sections
POST   /website-builder/pages/:pageId/sections
PUT    /website-builder/sections/:sectionId
DELETE /website-builder/sections/:sectionId

GET    /website-builder/sections/:sectionId/components
POST   /website-builder/sections/:sectionId/components
PUT    /website-builder/components/:componentId
DELETE /website-builder/components/:componentId

GET    /website-builder/templates
POST   /website-builder/websites/from-template
POST   /website-builder/websites/blank

GET    /website-builder/section-blocks
POST   /website-builder/pages/:pageId/section-blocks

POST   /website-builder/assets/upload
GET    /website-builder/assets
DELETE /website-builder/assets/:assetId
```

## Frontend

Nova tela interna:

```txt
/app/site/builder
```

Ela permite:

- listar sites reais do MySQL;
- criar site em branco;
- clonar template estrutural;
- editar estrutura simples de paginas, secoes e componentes;
- adicionar blocos prontos estruturais de secoes;
- listar assets reais do site;
- solicitar upload via backend para o provider de storage configurado;
- marcar upload como concluido depois do envio ao R2;
- listar historico de versoes estruturais;
- listar logs de publicacao futura;
- cadastrar dominios em estado pendente;
- gerar checklist DNS estrutural para dominio/subdominio;
- configurar SEO global e SEO por pagina;
- excluir registros por soft delete;
- visualizar estado vazio sem dados ficticios.

O editor visual completo, canvas, drag and drop, Effects Gallery e publicacao automatica de imoveis ficam fora desta fase.

## Storage Configuravel

No Cloudflare:

1. Acesse R2.
2. Crie um bucket para arquivos do ImobiFlow.
3. Crie uma API Token/Access Key com permissao de leitura/escrita no bucket.
4. Configure:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
   - `R2_PUBLIC_BASE_URL`

O servico implementa:

- `uploadFile()`
- `deleteFile()`
- `getPublicUrl()`

## Aplicacao Futura Na VPS Hostinger

Na VPS:

1. Instalar MySQL 8 ou subir MySQL via Docker.
2. Criar banco `imobiflow`.
3. Criar usuario exclusivo para a aplicacao.
4. Configurar `DATABASE_URL` com host, porta, usuario e senha reais.
5. Copiar variaveis R2 para o ambiente do backend.
6. Rodar:

```bash
cd backend
npm ci
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run build
```

7. Reiniciar o servico Node/PM2/systemd.

## Fora Da Fase 1

- Editor visual completo.
- Effects Gallery.
- Importacao de sites por ZIP/XML/HTML.
- Painel completo de dominio.
- Marketplace.
- Publicacao automatica de imoveis no site escolhido.
- Animacoes avancadas.
- Migracao global do backend/Supabase para MySQL.

## Observacao De Validacao Local

Nesta maquina, o schema Prisma validou e os builds passaram. A aplicacao da migration local depende do Docker/MySQL estar instalado e disponivel.

## Cobertura Automatizada Adicionada

Arquivo:

```txt
backend/tests/website-builder-foundation.test.ts
```

Testa:

- site em branco nasce com home vazia, sem dados ficticios;
- slug seguro com acentos e caracteres especiais;
- template estrutural e normalizado antes de clonar;
- template sem paginas cai para home vazia;
- O storage configurado informa variaveis ausentes sem fallback para armazenamento do navegador.

## Continuidade Sem Docker Local

Como a instalacao do Docker/WSL ficou para o final, o desenvolvimento continuou em partes que nao exigem MySQL em execucao local:

- tela `/app/site/builder` ganhou uma previa estrutural da pagina selecionada;
- tela `/app/site/builder` ganhou painel de edicao rapida para pagina, secao e componente;
- cliente frontend ganhou chamadas `PUT` para atualizar secoes e componentes;
- API passou a retornar contadores de secoes/componentes para a interface;
- seed estrutural ganhou o template `imobiliaria-premium-dourado`;
- o template premium nao cria imoveis, leads ou dados ficticios de producao, apenas estrutura editavel.
- API ganhou biblioteca de blocos estruturais em `GET /website-builder/section-blocks`;
- API ganhou criacao de secao por bloco em `POST /website-builder/pages/:pageId/section-blocks`;
- tela `/app/site/builder` ganhou seletor de categoria/bloco para adicionar secoes prontas;
- blocos de imoveis usam apenas `source: published_properties` e estado vazio, sem criar imoveis ficticios.
- API ganhou listagem de versoes e logs por site;
- API ganhou conclusao e exclusao logica de assets;
- tela `/app/site/builder` ganhou biblioteca de assets e painel de historico/publicacao;
- upload continua dependendo do R2 real e retorna erro controlado se as credenciais nao existirem.
- API ganhou dominios pendentes e checklist DNS estrutural;
- API ganhou SEO global e por pagina;
- tela `/app/site/builder` ganhou painel de dominios e SEO basico;
- verificacao real de DNS, SSL, sitemap e robots continuam fora da Fase 1.

Essas mudancas continuam dependendo do MySQL real para persistencia, mas ja compilam e ficam prontas para funcionar quando `npm run prisma:migrate` e `npm run prisma:seed` forem executados.
## Prévia estrutural interna

A Fase 1 também inclui uma rota interna de pré-visualização em `/app/site/builder/preview/:websiteId`. Ela permite abrir o site salvo no MySQL em modos desktop, tablet e mobile, alternar entre páginas cadastradas e conferir seções/componentes estruturais antes do editor visual avançado.

Essa prévia não publica o site, não cria imóveis fictícios e não substitui a landing page aprovada. Quando uma seção de imóveis ainda não tiver publicação real conectada, a tela mostra estado vazio claro.

Na tela `/app/site/builder`, a edição estrutural permite criar, editar, excluir e reordenar páginas, seções e componentes usando os campos `sort_order` persistidos no MySQL. A reordenação ainda é por botões de subir/descer nesta fase; drag and drop fica para a fase do editor visual.

Os templates estruturais de sistema ficam centralizados em `backend/src/services/website-builder-system-templates.ts`. O seed do Prisma e a API `GET /website-builder/templates` usam a mesma fonte. Assim, mesmo que o seed ainda não tenha sido executado, a API garante os templates estruturais oficiais no MySQL antes de listar/clonar:

- `site-em-branco`: estrutura vazia, sem dados de produção.
- `imobiliaria-premium-dourado`: estrutura de páginas e seções para imobiliária premium, com blocos ligados apenas a fontes reais como `published_properties`.

## Status técnico da fundação

A API `GET /website-builder/status` informa se o módulo já possui `DATABASE_URL` configurada para MySQL e quais variáveis do storage configurado ainda faltam. A tela `/app/site/builder` exibe esses indicadores antes dos formulários de criação, evitando tentativas cegas quando o ambiente ainda está sem banco ou storage.

Quando `DATABASE_URL` não estiver configurada, a tela mantém os formulários bloqueados e não tenta criar sites/templates. Quando o R2 estiver incompleto, uploads continuam retornando erro controlado e sem fallback para armazenamento local do navegador.

A montagem desse status fica centralizada em `backend/src/services/website-builder-status.ts`, com testes para ambiente pendente e ambiente pronto. Isso evita que a tela do builder dependa de mensagens soltas dentro da rota.

A tela `/app/site/builder` também possui um assistente de configuração com checklist para backend publicado, MySQL, Prisma e storage. O painel mostra um bloco `.env` e comandos de preparação para copiar, sem salvar essas informações no `localStorage` ou criar qualquer dado fictício.

A mesma tela tambem mostra um bloco **Proximo passo**, com a ordem operacional da Fase 1:

1. publicar/configurar backend seguro com `VITE_IMOBIFLOW_API_URL`;
2. ligar MySQL real com `DATABASE_URL`;
3. ligar o storage configurado;
4. testar criacao de site em branco e clone de template no MySQL real.

Esse bloco deixa claro que o editor visual completo com drag and drop entra apenas na Fase 2.

## Preflight De Configuracao

Foi criado o comando:

```bash
npm run website-builder:preflight
```

Ele confere variaveis e arquivos estruturais da Fase 1 sem conectar no banco e sem gravar dados. Para usar em modo rigido:

```bash
npm run website-builder:preflight:strict
```

O modo rigido retorna erro quando `DATABASE_URL`, `VITE_IMOBIFLOW_API_URL` publica ou variaveis R2 estiverem pendentes.

## MySQL Real / Hostinger / VPS

O guia operacional esta em:

```txt
docs/website-builder-mysql-hostinger.md
```

Ele explica como montar `DATABASE_URL`, configurar R2, rodar Prisma e validar a Fase 1 em ambiente real.

## Aceite Da Fase 1

O checklist de aceite esta em:

```txt
docs/website-builder-phase-1-acceptance.md
```

Ele separa o que ja esta pronto no codigo do que ainda depende de credenciais reais, MySQL real e storage.
