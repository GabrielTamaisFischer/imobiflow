# Auditoria funcional completa do ImobiFlow

**Data da auditoria:** 5 de agosto de 2026

**Repositório:** `GabrielTamaisFischer/imobiflow`

**Branch:** `integration/platform-monorepo`

**HEAD auditado:** `555743f88c61ec7162d44acd9a35552a86d3d2db`

**PR:** `#1`, aberta e em rascunho

**Escopo:** leitura, compilação, testes automatizados e tentativa de validação local; nenhuma correção, migration real, commit, push, deploy ou alteração da PR.

## 1. Resumo executivo

Foram auditados os 40 módulos solicitados. Aplicando a definição rigorosa de fluxo funcional — interface, API, autenticação, autorização, banco, resposta, atualização da interface e persistência depois de recarregar — **nenhum módulo pôde ser promovido a `FUNCIONAL` nesta rodada**. Isso não significa que todo o produto esteja vazio: imóveis, proprietários, importações, site público e Website Builder têm implementação substancial em MySQL/Prisma, e a suíte de 192 testes valida várias políticas importantes. Significa que o ambiente desta auditoria não permitiu comprovar o ciclo completo no navegador com duas empresas e quatro papéis, e que grande parte do produto ainda está dividida entre dois sistemas de persistência incompatíveis operacionalmente.

O achado funcional dominante é a arquitetura híbrida atual:

- autenticação bootstrap, imóveis, proprietários, importações, site público e Website Builder usam MySQL/Prisma;
- dashboard, CRM, agenda, vistorias, contratos, locações, financeiro, notificações, portais, integrações e custos ainda usam `supabaseAdmin` e o schema PostgreSQL legado em `platform/database/migrations`;
- o schema Prisma/MySQL tem 27 modelos e 8 migrations; o schema legado tem 50 arquivos SQL PostgreSQL numerados até `052`, sem comando local integrado para aplicá-los;
- os arquivos `.env.example` não documentam `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`, embora os módulos legados exijam essas variáveis;
- uma empresa criada/autenticada no MySQL não é automaticamente criada no Supabase. Assim, o mesmo `company_id` não tem garantia de existir nas duas bases;
- `Appointment` existe no MySQL para o laboratório de testes, mas a agenda real lê `appointments` do Supabase; `Lead` existe no MySQL para o site público, enquanto o CRM lê `leads` do Supabase. Esses são exemplos concretos de dados que podem ser gravados em uma base e não aparecer na tela que consulta a outra.

Também há **34 diagnósticos TypeScript**, apesar de os três builds Vite/Node passarem. O lint falha em escala muito grande, predominantemente por Prettier/CRLF. Os testes passam, mas não incluem testes de componente ou navegador, e os testes de serviço mais relevantes usam doubles/mocks em vez de banco real.

### Classificação consolidada

| Estado | Quantidade |
|---|---:|
| FUNCIONAL | 0 |
| FUNCIONAL COM LIMITAÇÕES | 0 |
| PARCIAL | 17 |
| QUEBRADO | 0 |
| APENAS INTERFACE | 0 |
| APENAS BACKEND | 1 |
| SIMULADO | 13 |
| NÃO IMPLEMENTADO | 1 |
| BLOQUEADO | 8 |
| **Total** | **40** |

`QUEBRADO = 0` não é uma aprovação: fluxos que não puderam ser executados foram classificados como `PARCIAL`, `SIMULADO` ou `BLOQUEADO`, e não como quebrados sem evidência de falha em uso. Da mesma forma, código de API isolado não foi classificado como funcional.

## 2. Critérios e limites de evidência

### 2.1 O que contou como evidência

- execução dos comandos de Prisma, testes, typecheck, builds, lint, `git diff --check` e `npm audit`;
- leitura direta das rotas frontend, clientes em `src/product`, rotas e serviços backend, schemas e migrations;
- inspeção de escopo por `company_id`, permissões, paginação, fallbacks e dependências externas;
- testes existentes, considerados somente pelo que realmente exercitam;
- respostas determinadas diretamente pelo código, como `501 MYSQL_AUTH_BOOTSTRAP_ONLY` no cadastro MySQL e `provider_ready: false` na IA.

### 2.2 O que não contou como comprovação funcional

- documentação histórica das fases e benchmarks;
- tela, botão ou rota existentes sem persistência comprovada;
- build Vite bem-sucedido, porque ele não executa o typecheck completo;
- testes unitários com Prisma/Supabase substituídos por mocks;
- armazenamento em `localStorage` no modo preview;
- dados descritos como “reais” por texto da interface;
- execução histórica em staging registrada em Markdown.

### 2.3 Bloqueio da validação local solicitada

A execução local ponta a ponta foi tentada sem usar staging ou produção, mas foi bloqueada antes de qualquer dado ser criado:

1. Docker CLI está instalado, mas o daemon não está disponível;
2. não há servidor/cliente MySQL, MariaDB ou PostgreSQL local;
3. não há Supabase CLI local;
4. a tentativa de obter um MySQL portátil oficial foi recusada pelo ambiente do Codex por limite de autorização, sem download;
5. a tentativa de iniciar os processos locais em segundo plano também foi recusada pelo mesmo controle;
6. a navegação para `http://127.0.0.1:5173` foi negada pelo controle do navegador antes de acessar a URL.

Consequências: Empresa A, Empresa B e os quatro papéis não foram criados; nenhum CRUD foi executado em navegador; nenhuma persistência após recarga foi comprovada; nenhum endpoint foi chamado contra staging ou produção. Esse bloqueio reduz o nível de confiança, mas preserva integralmente a regra de não usar infraestrutura real.

## 3. Estado do repositório

| Verificação | Resultado | Evidência |
|---|---|---|
| Branch | Correta | `git rev-parse --abbrev-ref HEAD` → `integration/platform-monorepo` |
| HEAD | Correto | `git rev-parse HEAD` → `555743f88c61ec7162d44acd9a35552a86d3d2db` |
| Working tree inicial | Limpo | `git status --short` sem saída |
| PR #1 | Aberta e draft | `gh pr view 1` retornou `OPEN` e `isDraft: true` |
| `.env` real | Não versionado | `platform/.env` está ignorado; nenhum `.env` real apareceu em `git ls-files` |
| `platform/.tmp` | Não versionado | `git ls-files platform/.tmp` sem saída |
| Identificador proibido solicitado | Nenhuma referência | busca case-insensitive no conteúdo versionado sem saída |
| Landing page | Fonte preservada | comparação fora de `platform/` mostrou apenas `.gitignore` e lockfile, sem alteração de componente/rota da landing |
| Node | `v24.18.1` | `node --version` |
| npm | `11.16.0` | `npm --version` |

### 3.1 Scripts disponíveis

- raiz: `dev`, `build`, `build:dev`, `preview`, `lint`, `format`;
- `platform/`: `dev`, `build`, `test`, Prisma generate/migrate/seed, preflight/deploy e runners de staging;
- `platform/backend/`: `dev`, `build`, Prisma generate/validate/migrate/seed.

### 3.2 Persistência e migrations

**Prisma/MySQL:** 8 migrations aditivas e 27 modelos: `Company`, `AppUser`, `Subscription`, `PropertyOwner`, `Property`, `PropertyOwnerLink`, `PropertyMedia`, `StoredFile`, `ImportJob`, `ImportRow`, `CompanySite`, `Lead`, `SiteLead`, `Appointment` e os modelos `Website*`.

Migrations MySQL:

1. `202605220001_website_builder_foundation`
2. `202605230002_website_builder_audit_logs`
3. `202606010001_website_builder_code_files`
4. `202607130001_mysql_saas_core`
5. `202607130002_site_audit_actions`
6. `202607140001_storage_provider_metadata`
7. `202608040001_resumable_imports`
8. `202608050001_property_query_indexes`

**Legado Supabase/PostgreSQL:** 50 arquivos em `platform/database/migrations`, numerados de `001` a `052`, com lacunas `018` e `019`. Eles criam autenticação multiempresa, permissões, CRM, imóveis legados, vistorias, contratos, financeiro, portais, notificações, custos, locações, IA e integrações. Não são controlados pelo Prisma MySQL e não há script local integrado que aplique/verifique a cadeia completa.

## 4. Validações globais

| Comando | Resultado | Observação |
|---|---|---|
| `npm run prisma:generate` | PASS | `DATABASE_URL` dummy local; nenhum banco real |
| `npx prisma validate` | PASS | schema MySQL válido com URL dummy |
| `npm test` em `platform/` | PASS | 24 arquivos, **192/192 testes** |
| `npx tsc --noEmit -p tsconfig.json` | **FAIL** | 34 diagnósticos |
| `npm run build` em `platform/` | PASS | Vite não executou o typecheck completo |
| `npm run build` em `platform/backend/` | PASS | compilação backend aprovada |
| `npm run build` na raiz | PASS | landing aprovada |
| `npm run lint` em `platform/` | **FAIL** | 264 arquivos; 75.889 erros e 22 avisos |
| `npm run lint` na raiz | **FAIL** | 356 arquivos; 82.417 erros e 29 avisos; inclui `platform/`, portanto não somar |
| `git diff --check` | PASS | sem erro de whitespace no estado inicial |
| `npm audit --json` | **BLOQUEADO nesta reexecução** | registry sem acesso; snapshot anterior no mesmo HEAD descrito abaixo |

O lint de `platform/` é dominado por 75.853 ocorrências de `prettier/prettier`; há ainda 30 `no-explicit-any`, 15 `react-hooks/exhaustive-deps`, 7 `react-refresh/only-export-components`, 2 `no-constant-condition` e ocorrências isoladas de regras de segurança/qualidade. O lint também percorre `platform/.tmp` mesmo sendo ignorado pelo Git, o que torna o resultado mais ruidoso.

Último snapshot de `npm audit` disponível no mesmo HEAD, sem `--force`:

- raiz: 4 vulnerabilidades (3 moderadas, 1 alta), concentradas na cadeia Cloudflare/Undici;
- plataforma: 8 (7 moderadas, 1 alta), envolvendo cadeias transitivas Monaco/DOMPurify, Cloudflare/Undici e ExcelJS/uuid;
- backend: 3 (1 baixa, 2 moderadas), envolvendo esbuild de desenvolvimento e ExcelJS/uuid.

As contagens dos workspaces se sobrepõem e não devem ser somadas. A reexecução desta auditoria falhou antes de obter advisories por indisponibilidade do registry.

## 5. Erros TypeScript

Todos os erros abaixo bloqueiam `tsc --noEmit`, mas não o build Vite atual. “Typecheck apenas” descreve a configuração de build, não ausência de impacto em runtime.

| # | Módulo | Arquivo/linha | Quant. | Classificação | Causa e impacto funcional |
|---:|---|---|---:|---|---|
| 1 | Preview/test lab | `src/product/preview-storage.ts:107` | 1 | contrato desatualizado | `metadata` foi inferido como `{}` e `test_lab_key` não existe no tipo. Pode ocultar erro de identificação/limpeza da massa QA. |
| 2 | Test lab/agenda | `src/product/test-lab.ts:536` | 1 | tipo incompatível | `appointment_type` foi alargado para `string`, incompatível com a união aceita pela agenda. A massa gerada pode divergir do contrato HTTP. |
| 3 | Website Builder client | `src/product/website-builder.ts:702,798,900` | 3 | narrowing/contrato antigo | atualização de página/seção/componente tenta ler `websiteId` de `never`. Indica contrato de retorno/narrowing inconsistente. |
| 4 | Agenda | `src/routes/app.agenda.tsx:354,634,635` | 3 | nullabilidade e tipo incompatível | `appUser` pode ser ausente; create/update envia `appointment_type: string`. Há risco de exceção ou payload inválido. |
| 5 | Contratos/portal | `src/routes/app.contratos.tsx:438,448` | 2 | nullabilidade real | `tenantPortal` pode estar ausente ao renderizar/copiar link; risco de exceção em estado parcial. |
| 6 | Custos | `src/routes/app.custos.tsx:149,150,153,154,178` | 5 | nullabilidade real | `summary` pode ser `null`; risco de crash durante loading/erro/retorno vazio. |
| 7 | Financeiro/gateway | `src/routes/app.financeiro.tsx:1338,1339,1367,1368` | 4 | resposta incompatível | união de resposta permite objeto sem `gateway_issue`/`gateway_customer`, mas a tela acessa as propriedades diretamente. Pode quebrar no caminho de fallback/bloqueio. |
| 8 | Preview de imóvel | `src/routes/app.site.builder.preview.$websiteId.imovel.$propertySlug.tsx:436` | 2 | interface antiga | tema tipado como `object` é usado como se tivesse `primary`. Pode produzir cor ausente ou erro de acesso. |
| 9 | Website Builder UI | `src/routes/app.site.builder.tsx:888-890,1083,1091,1151-1154,1188,1467,1625` | 12 | nullabilidade real | status, website, página, bloco e seção selecionados podem ser `null`. Estados vazios/transições assíncronas podem quebrar a interface. |
| 10 | Site público/detalhe | `src/routes/site.$slug.imoveis.$propertySlug.tsx:230` | 1 | contrato de componente | componente aceita `string | number`, mas recebe `string[]`. React pode renderizar, porém o contrato está incorreto. |
| | **Total** | | **34** | | |

## 6. Inventário de telas e rotas

### 6.1 Frontend

Rotas internas encontradas:

- `/app`, `/app/agenda`, `/app/configuracoes`, `/app/contratos`, `/app/crm`, `/app/custos`, `/app/financeiro`, `/app/imoveis`, `/app/importacoes`, `/app/integracoes`, `/app/inteligencia`, `/app/notificacoes`, `/app/operacoes`, `/app/proprietarios`, `/app/site`, `/app/site/builder`, editores e previews do builder, `/app/testes`, `/app/vistorias` e detalhe da vistoria;
- autenticação e assinatura: `/entrar`, `/cadastro`, `/aceitar-convite`, `/assinatura-bloqueada`;
- públicos: `/assinar-vistoria/$token`, `/portal/proprietario/$token`, `/portal/inquilino/$token`, `/site/$slug`, listagem/detalhe de imóvel e páginas da landing.

Os componentes internos usam principalmente `useSessionGuard`, `ModulePage` e clientes em `platform/src/product`. Há estados de loading/erro/vazio declarados na maioria das telas, mas eles não substituem validação do backend. Quando o token preview está ativo, agenda, CRM, contratos, financeiro, vistorias, notificações, operações, custos, site e builder podem ler/gravar `localStorage` em vez de chamar a API.

### 6.2 Backend

| Mount | Endpoints principais | Serviço/base |
|---|---|---|
| `/auth` | register, login, session, users CRUD, invitations/invite/cancel/reissue/accept | MySQL somente para login bootstrap; restante Supabase |
| `/ai` | overview, requests, templates, create request | Supabase; provider real desativado |
| `/appointments` | list, create, update/status, delete | Supabase |
| `/automation` | financial notifications e dispatch run | Supabase + secrets de automação |
| `/billing` | plans, checkout | Supabase + links externos |
| `/contracts` | list, create, detail, update, parties | Supabase |
| `/crm` | pipeline, leads CRUD/stage, notes, tasks | Supabase |
| `/dashboard` | summary | Supabase, inclusive `properties` |
| `/finance` | entries, charges, payments, gateway accounts, customer/issue, transfers, actions, reconciliation | Supabase + gateways |
| `/imports` | list/rows, preview, start, next batch, report, retry, rollback | Prisma/MySQL + StorageProvider |
| `/inspections` | CRUD, rooms/items/media, signatures, invite/sign, PDF | Supabase + storage |
| `/integrations` | provider catalog, connections CRUD/check | Supabase + adapters externos |
| `/notifications` | templates/events, queue, dispatch/manual | Supabase + providers |
| `/operations` | summary, requeue, dispatch, cancel, resolve | Supabase |
| `/portal-integrations` | publications, feeds JSON/XML, inbound leads | Supabase + portais |
| `/public/inspections` | token e assinatura pública | Supabase |
| `/public/portals` | owner/tenant by token | Supabase |
| `/public/sites` | site, properties, property, lead | Prisma/MySQL |
| `/real-estate` | owners CRUD, properties paginadas/CRUD/lookups/media | Prisma/MySQL |
| `/rentals` | list, create, charge generation | Supabase |
| `/site` | settings, publish/unpublish, leads, property publish | Prisma/MySQL |
| `/test-lab` | generate/clear | Prisma/MySQL, sem flag de ambiente |
| `/usage-costs` | catalog/events/summary/snapshots | Supabase |
| `/webhooks` | payments/providers/notifications | Supabase + secrets |
| `/website-builder` | CRUD completo de websites, templates, páginas, seções, componentes, assets, domínios, SEO, versões e logs | Prisma/MySQL |
| raiz | `/health`, `/me/authorization`, `/app/bootstrap` | middleware comum |

### 6.3 APIs, contratos e consultas problemáticas

- não foi encontrada chamada principal de cliente para um mount Express totalmente inexistente; porém o código de exemplo gerado pelo editor usa `POST /api/site/lead`, enquanto a rota real é `POST /public/sites/:slug/leads`;
- o dashboard continua lendo imóveis do Supabase, embora o módulo atual de imóveis grave MySQL;
- o test lab grava `Appointment` no MySQL, mas `/appointments` lê Supabase;
- o site público grava `Lead`/`SiteLead` no MySQL, enquanto o CRM lê `leads` do Supabase;
- tipos frontend do builder, agenda, financeiro, custos e contratos não refletem todos os estados de resposta atuais, conforme os 34 erros do typecheck;
- `GET /real-estate/owners` não tem paginação/`take`;
- `/public/sites/:slug/properties` traz até 240 imóveis de uma vez, sem envelope paginado;
- listas do Website Builder (`websites`, templates, versions, logs, domains, SEO, code files, pages, sections, components e assets) não têm paginação explícita;
- clientes usam `?status=all` para appointments, contracts, finance e inspections; as consultas Supabase correspondentes podem retornar a coleção inteira;
- o dashboard carrega IDs de imóveis para contar os sem mídia e soma lançamentos em memória;
- parser de importação materializa o arquivo antes do processamento em lotes; o processamento é retomável, mas a ingestão inicial ainda não é streaming;
- mídia de um imóvel é listada inteira; é limitada ao próprio imóvel, mas não há teto explícito;
- rollback de importação carrega todos os `StoredFile` e owners criados pelo job; o escopo é por job/empresa, mas o consumo cresce com o job.

## 7. Matriz funcional dos 40 módulos

Legenda de testes: `unit` = função/política; `svc-mock` = serviço com banco substituído; `HTTP-mock` = handler Express com dependência substituída; `browser` = navegador real. Nenhum módulo teve `browser` nesta auditoria.

| Prioridade | Módulo | Frontend | Backend | Banco | Permissões | Fluxo ponta a ponta | Testes | Segurança pendente | Estado | Trabalho necessário |
|---|---|---|---|---|---|---|---|---|---|---|
| P0 | 1. Autenticação | `/entrar`; loading/erro | `/auth/login`, `/auth/session` | MySQL bootstrap ou Supabase Auth | sessão + empresa ativa | Não comprovado; MySQL aceita só identidade bootstrap | unit de preview/local auth e status Supabase; sem UI/DB real | M04, M05 | **PARCIAL** | escolher identidade canônica, remover bootstrap como fluxo final, expiração/rotação e E2E multiusuário |
| P0 | 2. Cadastro | `/cadastro`; submit/erro | `/auth/register` | Supabase `auth`, companies/users/subscriptions | público | MySQL responde 501; Supabase não reproduzido | nenhum E2E | M04 e arquitetura híbrida | **BLOQUEADO** | cadastro transacional na base canônica, ativação/verificação e rollback testado |
| P0 | 3. Recuperação de senha | nenhuma rota | nenhum endpoint | nenhum | público | inexistente | nenhum | credenciais/auth | **NÃO IMPLEMENTADO** | solicitar, expirar e consumir token; e-mail; sessões; testes |
| P0 | 4. Empresas | seção declarada em configurações, sem CRUD completo | criação dentro de register; sem API de gestão MySQL | `Company` MySQL e `companies` Supabase | owner/admin | criação isolada não comprovada; edição não existe de forma canônica | nenhum | M08 + split de tenant | **PARCIAL** | CRUD/perfil, status, slug/documento, auditoria e fonte única de `company_id` |
| P0 | 5. Usuários | `/app/configuracoes` | `/auth/users*` | Supabase users/roles; `AppUser` MySQL não administrado | `users.manage` | UI/API existem, mas administração não opera em MySQL | status Supabase e auth local; sem CRUD real | M08 | **BLOQUEADO** | portar/sincronizar para AppUser, paginação, último owner, convites e E2E por papel |
| P0 | 6. Convites | configurações e `/aceitar-convite` | invitation list/invite/cancel/reissue/accept | Supabase `user_invitations` | `users.manage`; accept público | depende integralmente de Supabase Auth/schema | nenhum fluxo completo | M08 | **BLOQUEADO** | tokens hashed/expiráveis, envio, aceite, revogação e vínculo na base canônica |
| P0 | 7. Permissões e papéis | menu/guards por sessão | middleware `requirePermission` e roles Supabase | permissions/roles/role_permissions ou `permissionsJson` | várias chaves | enforcement existe; gestão e matriz MySQL não | unit de access control; segurança de usuário | M08 | **PARCIAL** | catálogo único, UI de papéis, deny-by-default, owner protegido e testes HTTP/UI |
| P0 | 8. Planos e assinatura | `/planos`, `/assinatura-bloqueada`, config | `/billing/plans`, `/billing/checkout`, webhooks | plans/subscriptions Supabase; Subscription MySQL simples | assinatura ativa | guard existe; catálogo/cobrança não é canônico e checkout é externo | unit do guard e normalizador de webhook | M01, M06, M15, L02 | **BLOQUEADO** | modelo canônico, webhook tenant-safe/idempotente, checkout, ciclo de status e E2E |
| P1 | 9. Dashboard | `/app`; L/E/V declarados | `/dashboard/summary` | tabelas Supabase operacionais | `dashboard.view` | no modo MySQL consulta outra base; preview retorna zeros | nenhum dedicado | dependências herdadas | **PARCIAL** | consultas na base canônica, agregações SQL, filtros e E2E após módulos fonte |
| P1 | 10. Imóveis | `/app/imoveis`; CRUD, filtros, paginação, mídia | `/real-estate/properties*` | MySQL Property/Media/OwnerLink | properties view/manage | implementação mais completa; sem navegador/DB real nesta rodada | unit, svc-mock e HTTP-mock de paginação/tenant | L01 indiretamente; limites de mídia | **PARCIAL** | E2E com MySQL local, papel read-only, empresa B, upload e persistência após reload |
| P1 | 11. Proprietários | `/app/proprietarios`; CRUD/busca | `/real-estate/owners*` | MySQL PropertyOwner/Link | owners view/manage | código completo, mas lista ilimitada e sem E2E | cobertura indireta de import/property | LGPD/paginação | **PARCIAL** | paginação, unicidade por empresa, vínculos e CRUD E2E multiempresa |
| P1 | 12. Inquilinos | sem cadastro dedicado; aparece em contratos/portais | contract parties e portal tenant | Supabase contract_parties/rentals; sem modelo canônico MySQL | contracts/rentals | entidade não tem ciclo próprio | nenhum dedicado | portais e PII | **PARCIAL** | modelo tenant, CRUD, vínculo a contrato/locação, consentimento e histórico |
| P1 | 13. Importações | `/app/importacoes`; progresso/next/retry/rollback | `/imports/*` | MySQL ImportJob/ImportRow/Property/StoredFile | imports view/manage | forte implementação e testes; sem browser/DB nesta auditoria | parser, políticas, lock e isolamento com mocks | M09, M10, M12, L01 | **PARCIAL** | streaming da ingestão, ZIP seguro, DNS pinning, E2E local e UI/reload |
| P1 | 14. CRM | `/app/crm` | `/crm/*` | Supabase pipelines/stages/leads/tasks | crm view/manage | preview grava localStorage; real depende de base legada | nenhum dedicado | M02 e split de leads | **SIMULADO** | consolidar Lead, pipeline CRUD real, tarefas/histórico, paginação e E2E |
| P1 | 15. Leads | CRM e formulários públicos | `/crm/leads*`, `/public/sites/:slug/leads`, portal leads | Lead/SiteLead MySQL e leads Supabase | crm; público no site | captura pública e CRM escrevem bases distintas | segurança de property pública; sem jornada lead→CRM | M02, M13, M16 | **PARCIAL** | pipeline único de ingestão/dedupe, consentimento, atribuição e E2E site→CRM |
| P1 | 16. Funil e kanban | kanban em `/app/crm` | pipeline/stage endpoints | Supabase crm_* | crm view/manage | preview tem estágios estáticos/localStorage | nenhum | tenant/replay de lead | **SIMULADO** | persistir ordenação/movimento, concorrência, auditoria e E2E |
| P1 | 17. Agenda | `/app/agenda`; calendário/formulários | `/appointments*` | Supabase appointments; Appointment MySQL apenas QA | appointments view/manage | preview/localStorage; typecheck falha; QA MySQL não aparece na rota real | nenhum dedicado | validação/tenant | **SIMULADO** | escolher tabela canônica, corrigir contratos, recorrência, timezone e E2E por papel |
| P1 | 18. Visitas | tipo dentro da agenda | appointments com `appointment_type=visit` | mesma agenda | appointments | não é entidade/fluxo completo; preview | nenhum | privacidade/localização | **SIMULADO** | jornada lead→imóvel→visita, confirmação, no-show, lembretes e E2E |
| P1 | 19. Vistorias | `/app/vistorias` e detalhe | `/inspections/*` | Supabase inspections/rooms/items/media | inspections view/manage/sign/pdf | UI e backend extensos, mas preview/localStorage é o caminho reproduzível | testes de segurança de storage/assinatura | M14, M18, M19 | **SIMULADO** | portar/reproduzir banco, CRUD completo, offline/conflito, limites de mídia e E2E |
| P1 | 20. Fotos e arquivos | imóvel e vistoria | property media; inspection media; StorageProvider | MySQL PropertyMedia/StoredFile; Supabase inspection_media/bucket | properties/inspections manage | mídia de imóvel e import usa provider; vistoria continua separada | storage/import/inspection security | M10, M12, M18, M19, L01 | **PARCIAL** | serviço único, ownership, caps, antivírus/metadados, rollback e E2E |
| P1 | 21. Assinaturas | detalhe de vistoria e rota pública | invite/sign/internal/public | Supabase inspection_signatures | inspections.sign; token público | regras têm testes, mas persistência e fluxo público não foram executados | testes de lifecycle/credential boundary | M14 | **PARCIAL** | estados cancelado/expirado, identidade, auditoria, não repúdio e E2E |
| P1 | 22. PDF de vistoria | ação no detalhe | `/inspections/:id/pdf` | Supabase + storage/StoredFile legado | inspections.pdf | preview gera documento local; real não validado | cobertura indireta de segurança | M18/M19 e dados pessoais | **PARCIAL** | template/versionamento, storage canônico, autorização download e comparação E2E |
| P1 | 23. Contratos | `/app/contratos` | `/contracts/*` | Supabase contracts/parties/templates | contracts view/manage | preview/localStorage; dois erros de nullabilidade | nenhum dedicado | M14 por integrações de assinatura | **SIMULADO** | modelo canônico, templates, partes, estados, anexos, assinatura e E2E |
| P1 | 24. Locações | seção dentro da agenda | `/rentals/*` | Supabase rental_agreements/events | rentals view/manage | preview/localStorage | nenhum | financeiro/portais herdados | **SIMULADO** | contrato→locação, tenant, reajuste, encerramento e E2E |
| P1 | 25. Cobranças recorrentes | agenda/financeiro | generate charges e automações | Supabase rental/financial_charges | rentals/finance manage | endpoints e botões existem; gateway e ciclo completo não comprovados | normalizador de webhook apenas | M01, M06, M15, L02 | **PARCIAL** | agenda idempotente, calendário, retry, webhook e conciliação E2E |
| P1 | 26. Financeiro | `/app/financeiro` | `/finance/*` | Supabase financial_* | finance view/manage | preview/localStorage; quatro erros de resposta gateway | webhook normalizer | M01, M06, L03 | **SIMULADO** | ledger canônico, centavos, idempotência, paginação, gateway e E2E |
| P1 | 27. Repasses | painel financeiro | owner-transfers/actions/notifications | Supabase owner_transfers | finance view/manage | preview cria/resolve localmente | nenhum dedicado | L03 e notificações | **SIMULADO** | cálculo rastreável, aprovação, comprovante, reversão e E2E |
| P1 | 28. Conciliação | financeiro/operações | reconciliation/actions/webhooks | Supabase financial/gateway tables | finance/operations | preview simula resolução; engine real não validado | normalizador parcial | M06, L02, L03 | **SIMULADO** | import/webhook idempotente, matching, exceções, auditoria e E2E |
| P2 | 29. Notificações | `/app/notificacoes` | `/notifications/*`, webhook provider | Supabase events/templates/attempts | notifications view/manage | preview/localStorage; provider real não validado | webhook/automation indiretos | M06, M20 | **SIMULADO** | fila durável, tenant lookup, retries, opt-out, templates e E2E |
| P2 | 30. WhatsApp | integrações/notificações/IA | catálogo/connection e dispatcher | Supabase integration/notification | integrations/notifications | depende de provider/credenciais externos | catálogo apenas | M06, M17, M20 | **BLOQUEADO** | adapter oficial, webhook tenant-safe, consentimento, templates e sandbox |
| P2 | 31. Automações | sem tela de configuração dedicada; saúde em operações | `/automation/*` e serviços | Supabase runs/events/rules | secret interno/operations | API/serviços não expostos como jornada configurável | cobertura indireta | M03, M20 | **APENAS BACKEND** | regras/UI, scheduler, locks, dry-run, auditoria e E2E |
| P2 | 32. Portal do proprietário | `/portal/proprietario/$token` | `/public/portals/owners/:token` | Supabase portal/contracts/finance | token público | depende da base legada; links preview existem | nenhum E2E | M13, M16, L03 | **BLOQUEADO** | token hashed/expirável, escopo mínimo, revogação, PII e E2E |
| P2 | 33. Portal do inquilino | `/portal/inquilino/$token` | `/public/portals/tenants/:token` | Supabase portal/contracts/rentals/finance | token público | depende da base legada; typecheck de contratos indica estado incompleto | nenhum E2E | M13, M16, L03 | **BLOQUEADO** | mesmas garantias do portal owner, mais cobranças/documentos |
| P2 | 34. Site público | `/site/$slug` e imóvel | `/public/sites/*` | MySQL CompanySite/Property/Lead/SiteLead | público | código MySQL coerente, mas preview/fallback pode mascarar API e lista traz 240 | public property security | M07 e PII de leads | **PARCIAL** | E2E público, paginação, anti-spam, SEO/cache e lead chegando ao CRM canônico |
| P2 | 35. Editor de sites | `/app/site/builder`, editor/code/preview | `/website-builder/*` | MySQL Website* | site.manage | implementação extensa; preview/localStorage e 17 erros TS diretamente relacionados | 7 suítes builder + preview security | M07 | **PARCIAL** | corrigir contratos/nulls, paginação, isolamento de origem pública e E2E |
| P2 | 36. Publicação do site | `/app/site` e builder | `/site/publish`, unpublish, logs/domains | MySQL CompanySite/WebsitePublishLog/Domain | site.manage | altera estado; não comprova deploy/origem pública do builder | preflight/domain unit | M07 | **PARCIAL** | pipeline versionado, domínio/CSP, rollback, healthcheck e E2E público |
| P2 | 37. Integrações com portais | `/app/integracoes` | `/portal-integrations/*` | Supabase publications/leads/connections | integrations view/manage; feeds públicos | depende de credenciais e portais externos | unit de catálogo/portal | M02, M13, M16, M17 | **BLOQUEADO** | adapter por provider, tenant secret, feed mínimo, retry/dedupe e sandbox |
| P2 | 38. IA | `/app/inteligencia` | `/ai/*` | Supabase ai_* e usage | ai view/use | backend retorna `provider_ready:false`; preview registra sem gerar | nenhum provider test | custo/PII/prompt safety | **SIMULADO** | provider, fila, redaction, quotas, observabilidade e avaliação de qualidade |
| P2 | 39. Custos de uso | `/app/custos` | `/usage-costs/*` | Supabase cost/usage/snapshots | costs view/manage | preview e base legada; cinco erros de nullabilidade | nenhum dedicado | integridade financeira | **SIMULADO** | eventos idempotentes, fontes canônicas, snapshots e E2E |
| P2 | 40. Administração/configurações | `/app/configuracoes` | auth users + gateway connections | mistura MySQL/Supabase | users/manage, integrations/manage | partes visuais; empresa/MySQL e superadmin não têm gestão completa | nenhum E2E | M01, M08, M17 | **PARCIAL** | separar tenant/admin, empresa, usuários, billing, auditoria e E2E |

## 8. Evidências transversais

### 8.1 Fallbacks e simulações

Os seguintes clientes importam `isPreviewToken` e implementam dados em memória/localStorage ou respostas sintéticas: agenda, IA, contratos, CRM, dashboard, financeiro, gateway accounts, vistorias, integrações, notificações, operações, integrações de portais, imóveis, sites, test lab, custos e Website Builder.

Exemplos objetivos:

- `platform/src/product/auth.ts` contém uma credencial de demonstração hardcoded (e-mail e hash) e constrói empresa, usuário e assinatura preview fictícios;
- `platform/src/product/crm.ts` cria estágios estáticos e grava leads preview em `localStorage`;
- `platform/src/product/agenda.ts`, `contracts.ts`, `finance.ts` e `inspections.ts` fazem CRUD preview no navegador;
- `platform/src/product/dashboard.ts` retorna métricas zero com rótulo “Modo preview”;
- `platform/src/product/sites.ts` pode construir um site público fallback;
- `platform/src/product/website-builder.ts` mantém websites/páginas/seções/componentes preview em `localStorage` e bloqueia upload real;
- `platform/backend/src/routes/ai.ts` registra request com `pending_provider`, `AI_PROVIDER_NOT_CONFIGURED` e `provider_ready:false`; não há chamada a modelo externo.

Esses caminhos são úteis para demonstração visual, mas não comprovam autenticação, autorização, persistência compartilhada, multiempresa ou recuperação depois de reiniciar o backend. O token preview não é aceito como token backend de produção, portanto muitas telas podem abrir em modo demonstrativo e ainda falhar ao executar operação real.

### 8.2 Autenticação e autorização atuais

- o modo MySQL só permite login do e-mail bootstrap configurado e cria automaticamente empresa/owner/assinatura se não existirem;
- cadastro público retorna 501 no modo MySQL;
- não há recuperação de senha MySQL;
- o token MySQL é HMAC, mas usa fallback de secret e não valida expiração (M04/M05);
- `AppUser.permissionsJson` suporta permissões por usuário, porém a UI `/auth/users*` administra somente o schema Supabase;
- o contexto local de desenvolvimento tem lista fixa e incompleta de permissões. Ele inclui site, imóveis, proprietários, CRM e agenda, mas não cobre imports, vistorias, contratos, financeiro, notificações, operações, integrações, IA ou custos;
- `useSessionGuard` redireciona qualquer falha de carregamento de sessão para `/assinatura-bloqueada`. Falha de rede/autenticação e assinatura inativa ficam indistinguíveis para o usuário;
- os middlewares backend aplicam `requireAuth`, `requireCompany`, `requireActiveSubscription` e `requirePermission` na maioria das rotas autenticadas. Há cobertura unitária de alguns limites, mas não uma matriz HTTP completa dos quatro papéis.

### 8.3 Cobertura automatizada real

As 24 suítes/192 testes cobrem:

- preview access e assinatura;
- contratos de cliente paginado de imóveis;
- política/handler/serviço de paginação e isolamento de imóveis com banco fake;
- parser e política de importação, lock, SSRF básico e uso de StorageProvider;
- armazenamento e assinatura de vistorias, principalmente limites de autorização;
- normalização de webhook de pagamento;
- catálogo de integrações e portais;
- status de usuário Supabase;
- fundação, templates, domínio, audit logs, blocks, preflight e segurança do preview do Website Builder.

Não há suítes dedicadas de fluxo para dashboard, CRM, leads, agenda, visitas, contratos, locações, recorrência, financeiro, repasses, conciliação, notificações, WhatsApp, automações, portais owner/tenant, captura site→CRM, IA provider, custos, administração ou configuração. Também não há testes React de componente nem testes browser/E2E. Os testes de importação e imóveis mais fortes substituem Prisma por objetos `vi.fn`, portanto não validam migrations, constraints, conexão ou persistência real.

### 8.4 Loading, erro e vazio

As telas principais geralmente declaram loading, mensagem de erro e empty state. Dashboard, imóveis, proprietários, CRM, agenda, vistorias, contratos, financeiro, site e integrações têm estados visuais explícitos. Há três ressalvas:

1. nullabilidades não tratadas no typecheck mostram que alguns estados intermediários ainda podem causar crash;
2. um empty state preview pode representar ausência sintética, não resposta do banco;
3. `useSessionGuard` transforma erro de sessão/API em bloqueio de assinatura, mascarando a causa real.

### 8.5 Isolamento multiempresa observado estaticamente

Pontos positivos:

- rotas MySQL de imóveis/importações recebem `companyId` de `req.access` e ignoram `company_id` do cliente;
- detalhes/alterações são precedidos por busca com `id + companyId` ou serviço de pertencimento;
- testes verificam 404 cross-company para property/import e limite do site público;
- rotas Supabase autenticadas normalmente usam `req.access.company.id`.

Limites:

- não houve Empresa A/Empresa B em banco real nesta auditoria;
- dois bancos tornam possível existir o tenant em um deles e não no outro;
- webhooks e feeds têm achados M15, M16, M20 e L02 relacionados à resolução de tenant;
- o token de feed e excesso de PII em listing (M13) impedem considerar isolamento público pronto para produção.

## 9. Achados de segurança pendentes

Os IDs abaixo são referências resumidas; não há prova de conceito nem detalhes exploráveis. “Bloqueia” significa que o módulo não deve ser liberado naquele ambiente antes da correção quando o caminho vulnerável estiver habilitado.

### 9.1 Vinte achados médios

| ID | Achado resumido | Módulo | Local | Staging | Produção | Dependência funcional e momento correto |
|---|---|---|---|---|---|---|
| M01 | Adapter Iugu não isola corretamente sandbox/token/URL | planos, financeiro, integrações | não bloqueia sem gateway | bloqueia teste Iugu | **bloqueia** | corrigir junto ao adapter antes do primeiro E2E de cobrança |
| M02 | Replay de lead de portal pode duplicar/orfanar dados | CRM, leads, portais | não bloqueia CRUD local | bloqueia inbound real | **bloqueia** | idempotency key e transação após unificar Lead |
| M03 | Test lab montado sem flag de ambiente | administração/testes | aceitável somente local sintético | **bloqueia** | **bloqueia** | proteger antes de qualquer novo deploy; depois manter QA separado |
| M04 | Token MySQL aceita secret fallback | autenticação | não com secret local explícito | **bloqueia** | **bloqueia** | corrigir na fundação de autenticação canônica |
| M05 | Token MySQL não verifica expiração | autenticação | não bloqueia exploração local | **bloqueia** | **bloqueia** | implementar exp/refresh/revogação antes de usuários reais |
| M06 | Secrets de webhook aceitos em query string | billing, financeiro, notificações | não sem webhook | **bloqueia** | **bloqueia** | header/assinatura e redaction antes de sandbox externo |
| M07 | Links `javascript:` podem ser persistidos no builder | editor/publicação | preview scriptless reduz impacto | bloqueia publish compartilhado | **bloqueia** | validar na escrita e na renderização antes de origem pública |
| M08 | `users.manage` pode rebaixar/bloquear owners sem último-owner guard | usuários/permissões | bloqueia teste de papéis confiável | **bloqueia** | **bloqueia** | corrigir com o CRUD canônico de usuários |
| M09 | Parser inicial de importação materializa toda a entrada | importações | não para arquivo pequeno | bloqueia carga não limitada | bloqueia escala | streaming/limite antes de aceitar bases grandes não confiáveis |
| M10 | SSRF ainda sujeito a DNS rebinding/CGNAT | importação de mídia | não sem URLs externas | bloqueia mídia externa hostil | **bloqueia** | resolver/pinar IP e revalidar redirects antes de produção |
| M11 | Scripts podem imprimir URL de banco | scripts/infra | não bloqueia app | **bloqueia execução** | **bloqueia** | sanitizar logging antes de qualquer operação de ambiente |
| M12 | ZIP pode causar expansão excessiva/paralelismo perigoso | importações | não para fixture controlada | bloqueia ZIP não confiável | **bloqueia** | caps por entrada/total/ratio antes do E2E ZIP |
| M13 | Listing de portal expõe token e PII em excesso | integrações de portal/portais | não sem feed | bloqueia feed compartilhado | **bloqueia** | reduzir projeção e retirar token antes de sandbox de portal |
| M14 | Assinatura interna aceita estado cancelado/expirado | vistorias/assinaturas | bloqueia lifecycle confiável | **bloqueia** | **bloqueia** | corrigir antes do E2E de assinatura |
| M15 | Webhook de assinatura/plano confia em empresa/plano do payload | planos/assinatura | não sem webhook | **bloqueia** | **bloqueia** | resolver tenant/plano por assinatura externa verificada |
| M16 | Webhook de portal usa secret global e tenant do body | leads/portais | não sem webhook | **bloqueia** | **bloqueia** | secret por conexão e tenant derivado antes de inbound real |
| M17 | `credentials_ref` pode resolver variável de ambiente arbitrária | integrações/admin | não sem credenciais | **bloqueia** | **bloqueia** | allowlist tipada por provider antes de salvar conexão |
| M18 | Mídia inline de vistoria amplifica banco | vistorias/fotos | limita QA pequena | bloqueia teste volumoso | **bloqueia** | somente storage externo, caps e migration antes do rollout |
| M19 | Quantidade de mídia remota sem limite | vistorias/fotos | não com fixture pequena | bloqueia entrada não confiável | **bloqueia** | limite por request/vistoria/empresa junto ao storage único |
| M20 | Webhook de notificação resolve evento global sem tenant | notificações/automação | não sem provider | **bloqueia** | **bloqueia** | lookup composto provider+tenant+event antes de provider real |

### 9.2 Três achados baixos

| ID | Achado resumido | Módulo | Local | Staging | Produção | Momento correto |
|---|---|---|---|---|---|---|
| L01 | Dedupe de `StoredFile` pode confundir ownership/rollback | importação/storage | não bloqueia fixture simples | corrigir antes de rollback com mídia | risco de consistência | junto à identidade única de arquivo/job |
| L02 | Lookup de webhook de billing pode cruzar tenants | assinatura/financeiro | não sem webhook | corrigir antes de sandbox | deve ser corrigido | junto a M15 e idempotência de assinatura |
| L03 | Payload bruto de webhook financeiro pode chegar ao frontend | financeiro/repasses | não sem webhook | restringir antes de QA externo | privacidade/auditoria | criar DTO/redaction antes da tela operacional |

### 9.3 Relação com os seis achados altos corrigidos

Os testes atuais exercitam limites adicionados para autenticação local, usuário Supabase inativo, assinatura de vistoria, storage de vistoria, dados públicos de imóveis e preview scriptless do builder. Eles passaram dentro das 192 verificações. Esta auditoria não reabriu nem alterou essas correções; os 20 médios e 3 baixos permanecem pendentes e independentes da aprovação dos altos.

## 10. Ordem recomendada de implementação

A ordem base solicitada continua válida, com um pré-requisito técnico adicional sustentado pela evidência do split MySQL/Supabase:

0. **Ambiente reproduzível e fonte canônica por entidade.** Documentar e automatizar um único bootstrap local. Decidir, módulo por módulo, se o legado PostgreSQL será portado para MySQL ou operado explicitamente como segunda base com sincronização transacional. Não avançar com entidades duplicadas (`Company`, `Lead`, `Appointment`, `Property`).
1. **Autenticação, empresa, usuários e permissões.** Login multiusuário, cadastro, recuperação, convites, expiração, último owner e auditoria.
2. **Planos e bloqueio de assinatura.** Catálogo, assinatura, webhook idempotente e tenant-safe.
3. **Imóveis, proprietários e importações.** Concluir E2E do núcleo já em MySQL, paginação de owners e storage.
4. **CRM, leads e agenda.** Unificar Lead e Appointment e provar site/portal→CRM→visita.
5. **Vistorias, arquivos, assinaturas e PDF.** Portar/reproduzir persistência, fechar M14/M18/M19.
6. **Contratos, inquilinos e locações.** Modelo canônico e lifecycle completo.
7. **Financeiro, recorrência, repasses e conciliação.** Ledger/idempotência antes de gateways.
8. **Portais owner/tenant.** Tokens mínimos, revogáveis e tenant-safe.
9. **Site público, editor e publicação.** Site MySQL já serve de base; separar origem pública e fechar M07.
10. **Notificações, WhatsApp, automações e portais externos.** Somente depois de entidades e eventos canônicos.
11. **IA e custos.** Provider real, redaction, quotas e medição sobre fluxos estáveis.
12. **Produção, backup, restore, observabilidade e monitoramento.** Só depois de E2E, segurança e carga reproduzíveis.

Essa alteração não é preferência tecnológica: o passo 0 é obrigatório porque hoje uma operação pode gravar no MySQL e sua tela consumidora consultar o Supabase.

## 11. Plano de execução por módulo

### 11.1 Suítes mínimas reutilizadas abaixo

- **Manual M1:** login; abrir; loading/erro/vazio; criar; recarregar; editar; pesquisar/filtrar; papel sem permissão; Empresa B; excluir/desativar; confirmar banco.
- **Automática A1:** handler HTTP real + banco descartável, status/DTO, constraints, tenant, papéis, idempotência, paginação e reload de processo.
- **Integração I1:** sandbox do fornecedor, assinatura de webhook, replay, timeout/retry, redaction e reconciliação.
- **Critério comum de conclusão:** M1 + A1 aprovados, typecheck/build/lint do escopo aprovados, nenhum fallback acionado com token real, auditoria e achados de segurança do módulo resolvidos.

| Módulo | Objetivo e fluxos obrigatórios | Arquivos/backend/tabelas/permissões | Testes e segurança | Dependências | Estimativa |
|---|---|---|---|---|---|
| Autenticação | login/logout/session/refresh/revogação | auth UI/client/routes; AppUser/Company; público/sessão | M1+A1; M04/M05 | passo 0 | grande |
| Cadastro | empresa+owner transacional, verificação e rollback | cadastro/auth register; Company/AppUser/Subscription | M1+A1; abuso/rate limit | autenticação | média |
| Recuperação | request/consume token, expiração e invalidação | novas telas/rotas/tabela de token; público | M1+A1 + e-mail fake | autenticação | média |
| Empresas | perfil/status/config e auditoria | configurações + API Company; owner/admin | M1+A1; isolamento | auth | média |
| Usuários | CRUD/status/papéis e último owner | config/auth users; AppUser; users.manage | M1+A1; M08 | empresa/permissões | grande |
| Convites | emitir/enviar/reemitir/cancelar/aceitar | auth invitation; tabela canônica | M1+A1; token hashed | usuários/e-mail | média |
| Permissões | catálogo/papéis/custom roles/deny | middleware, UI, permissionsJson/roles | matriz HTTP completa; M08 | auth/users | grande |
| Planos | catálogo/checkout/status/cancelamento | billing/subscription/webhooks | M1+A1+I1; M01/M06/M15/L02 | auth/empresa | grande |
| Dashboard | métricas e alertas canônicos | dashboard UI/route; consultas agregadas | M1+A1, performance | módulos fonte | média |
| Imóveis | CRUD, filtros, detalhe, mídia, publicação | real-estate UI/service; Property* | M1+A1; tenant/storage | auth/planos | média |
| Proprietários | CRUD, busca, vínculos, paginação | owners UI/service; PropertyOwner/Link | M1+A1; LGPD | imóveis | média |
| Inquilinos | CRUD, documentos, vínculo/histórico | nova UI/API/modelo Tenant | M1+A1; LGPD | contratos | grande |
| Importações | ingestão streaming, batch/retry/report/rollback | imports/resumable/storage; ImportJob/Row | M1+A1; M09/M10/M12/L01 | imóveis/storage | média |
| CRM | pipeline, lead, notas, tarefas | CRM UI/routes; crm_* | M1+A1; tenant | Lead canônico | grande |
| Leads | manual/site/portal, dedupe/atribuição | crm+public site+portal; Lead | M1+A1; M02/M13/M16 | CRM/site | média |
| Funil/kanban | mover/reordenar/concorrência/auditar | CRM UI/routes; pipelines/stages | M1+A1 | CRM/leads | média |
| Agenda | CRUD/calendário/timezone/recorrência | agenda/routes; Appointment | M1+A1 | users/leads/properties | grande |
| Visitas | agendar/confirmar/no-show/follow-up | agenda + Appointment visit | M1+A1 | agenda/CRM | média |
| Vistorias | lifecycle, rooms/items/offline | vistorias/routes; inspection_* | M1+A1; M14/M18/M19 | imóveis/storage | grande |
| Fotos/arquivos | upload/dedupe/ownership/delete | StorageProvider e StoredFile | A1+I1; caps/M10/M18/M19/L01 | tenant/storage | grande |
| Assinaturas | invite/view/sign/cancel/expire/audit | inspection signatures/public route | M1+A1; M14 | vistorias/auth | grande |
| PDF | gerar/versionar/baixar/autorizar | inspection-pdf/storage | M1+A1; PII | vistoria/assinatura | média |
| Contratos | template/create/partes/status/anexo/sign | contratos UI/routes/models | M1+A1 | imóveis/tenants/sign | muito grande |
| Locações | criar/reajustar/encerrar/eventos | agenda/rentals; rental_* | M1+A1 | contratos/tenant | muito grande |
| Recorrência | calendário, geração idempotente, retry | rentals/finance/automation | A1+I1; billing findings | locação/financeiro | muito grande |
| Financeiro | ledger, entries/charges/payments | financeiro/routes; financial_* | M1+A1+I1; M01/M06/L03 | contratos/locações | muito grande |
| Repasses | calcular/aprovar/pagar/reverter | finance owner-transfers | M1+A1+I1 | financeiro/owner | grande |
| Conciliação | receber/matching/exceção/reprocessar | finance/operations/webhooks | A1+I1; M06/L02/L03 | ledger/gateway | muito grande |
| Notificações | templates/fila/retry/opt-out/status | notifications/dispatcher | M1+A1+I1; M06/M20 | eventos canônicos | grande |
| WhatsApp | conectar/template/enviar/receber | integrations/notifications | I1; M17/M20/consentimento | notificações | grande |
| Automações | regras/scheduler/lock/dry-run/UI | automation/operations | M1+A1; M03/M20 | notificações/financeiro | muito grande |
| Portal proprietário | token/revogação/extrato/docs | portal route/API/tables | M1+A1; M13/M16/L03 | contratos/financeiro | grande |
| Portal inquilino | token/cobranças/docs/contato | portal route/API/tables | M1+A1; M13/M16/L03 | locações/financeiro | grande |
| Site público | página/lista/detalhe/lead/SEO | sites UI/public API; CompanySite/Property/Lead | M1+A1; anti-spam/M07 | imóveis/CRM | média |
| Editor | CRUD visual/code/assets/version | builder UI/API; Website* | M1+A1; M07 | site/auth/storage | muito grande |
| Publicação | build/version/domain/CSP/rollback | site publish/builder logs/domains | M1+A1+I1; M07 | editor/infra | grande |
| Portais externos | connection/feed/publish/lead/retry | portal-integrations | A1+I1; M02/M13/M16/M17 | imóveis/CRM | grande |
| IA | request/queue/provider/result/quota | ai UI/API; ai_* | A1+I1 + avaliações; PII | dados canônicos/custos | grande |
| Custos | eventos/idempotência/snapshot/margem | custos UI/API; usage/cost_* | M1+A1; integridade | todos os emissores | grande |
| Administração | tenant config, users, billing, audit | configurações + APIs canônicas | M1+A1; M08/M17 | fundação completa | grande |

## 12. Fluxos comprovados e não comprovados

### Comprovados nesta auditoria

- schema Prisma gera e valida com URL dummy;
- os 192 testes atuais passam;
- builds da plataforma, backend e landing passam;
- parser/políticas de importação, lock lógico, isolamento por parâmetros, StorageProvider e SSRF básico passam em testes;
- paginação/DTO/tenant dos handlers e serviços de imóveis passam com banco fake;
- sanitização e sandbox scriptless do preview do builder passam nos testes focados;
- middleware/guards selecionados e bloqueio de usuário Supabase inativo passam em testes;
- não há `.env` real, `.tmp` ou referência ao identificador proibido versionados.

### Não comprovados

- qualquer fluxo interface→API→banco→reload em navegador;
- login de quatro papéis e duas empresas;
- cadastro, recuperação de senha, usuários, convites e assinatura reais;
- funcionamento conjunto MySQL + Supabase ou sincronização entre eles;
- CRUD real de imóveis/proprietários/importação nesta máquina;
- CRM, agenda, vistorias, contratos, locações, financeiro, notificações, portais, integrações, custos e IA com banco real;
- uploads reais, gateways, WhatsApp, e-mail, portais externos e provider de IA;
- publicação do Website Builder em origem pública isolada;
- migrations PostgreSQL legadas aplicadas em ambiente descartável;
- persistência após restart/reload para os módulos simulados.

## 13. Conclusão

O primeiro módulo a ser concluído não deve ser uma tela operacional: deve ser a **fundação canônica de autenticação + empresa + usuários + permissões**, precedida por um bootstrap local reproduzível e pela decisão explícita sobre o split MySQL/Supabase. Sem isso, qualquer E2E de CRM, agenda, vistorias ou financeiro pode produzir um falso positivo em preview ou gravar dados que outra tela não enxerga.

Prioridades imediatas:

1. automatizar ambiente descartável completo e escolher a base canônica de cada entidade;
2. concluir autenticação/tenant/usuários/permissões e M04/M05/M08;
3. provar o núcleo MySQL de imóveis/proprietários/importação via navegador com duas empresas;
4. migrar ou integrar de forma explícita CRM/Lead e Agenda/Appointment antes de continuar módulos dependentes;
5. só então validar vistorias, contratos, financeiro, portais e integrações.

Não houve alteração de código funcional, commit, push, merge, deploy, acesso a staging/produção ou uso de dados reais. O único arquivo criado por esta tarefa é este relatório.
