---
name: imobiflow-tenant-isolation
description: Checklist e padrões reais de isolamento multiempresa (companyId) do ImobiFlow. Use ao criar ou alterar qualquer rota, service, query Prisma, schema, upload, portal público, importação ou teste que leia, grave, vincule ou exponha dados de uma empresa (Property, PropertyOwner, Party, PartyRole, AppUser, Lead, Contract, Inspection, Finance, StoredFile, sites) — e ao revisar diffs que tocam findUnique/findFirst/update/delete.
metadata:
  origin: local (ImobiFlow)
  based_on: código do repositório em 2026-10-20 (branch staging/fase1-cadastro-aberto)
---

# ImobiFlow — Isolamento multiempresa

Skill local, escrita a partir do código real do ImobiFlow. O `CLAUDE.md` da raiz tem prioridade.
Todo caminho abaixo é relativo a `platform/`. Se um helper citado não existir mais, **pare e localize o
substituto** — não invente um novo.

## Terminologia (evita confusão)

- **Tenant (multiempresa)** = `Company`. A chave de isolamento é `companyId` (`company_id`).
- **Tenant (inquilino)** = papel comercial: `PartyRole.role = "tenant"`, `TenantProfile`,
  `PortalPartyAccess.partyType = "tenant"`. Não confundir com o tenant da plataforma.

## Regras invioláveis

1. **companyId só vem da sessão.** Use `getAuthenticatedCompanyId(req)` ou `req.access.company.id`
   (`backend/src/middleware/auth.ts`, preenchido por `requireAuth` + `requireCompany`). Nunca de
   `req.body`, `req.query`, `req.params` ou header. Se o payload trouxer `companyId`/`company_id`,
   ignore-o (o teste `mysql-auth-http-isolation.test.ts` cobre "ignores a malicious company_id").
2. **Todo dado operacional tem `companyId` obrigatório.** Ao criar um model operacional novo, inclua
   `companyId String @map("company_id") @db.Char(36)`, relação com `Company` e índices começando por
   `companyId`. Models globais hoje (sem companyId): `Company`, `Plan`, `Permission`, `RolePermission`,
   `CheckoutSession`, `PaymentEvent`. Não adicione dado de cliente a eles.
3. **Nenhuma query de dado de empresa sem escopo.** Toda leitura/escrita inclui `companyId` no `where`
   ou passa por um filtro de escopo que já o inclui.
4. **Cross-tenant responde 404, não 403.** Os helpers `assertPropertyAccess` / `assertLeadAccess` /
   `assertInspectionAccess` lançam `*_NOT_FOUND` (404) para não revelar que o registro existe em outra
   empresa. Siga o mesmo padrão.
5. **IDs enviados pelo cliente são suspeitos.** Todo ID referenciado (ownerId, partyId, stageId,
   assignedTo, propertyId, documentId...) precisa ser revalidado como pertencente à empresa da sessão
   antes de ser gravado ou usado.

## Padrões existentes — reutilize, não recrie

### Filtros de escopo (`backend/src/services/authorization.ts`)

- `buildPropertyScopeFilter(access, permissionKey, required)` — company / own (`responsibleUserId`) /
  shared (`accessGrants` com `companyId` + `userId` + permissão).
- `buildLeadScopeFilter(...)` — idem com `assignedTo`.
- `buildInspectionScopeFilter(...)` — ancorado no `Property` canônico.
- `canAccess*` / `assert*Access` — checagem pontual por ID.
- `resolveScope(access, key)` — `owner`/`admin`/`manager` = company; demais = own, salvo configuração.
- `canManagePropertySharing` / `canManageLeadSharing` — só company scope ou o responsável atual.

Combine com o filtro, nunca substitua: `where: { id, AND: [buildPropertyScopeFilter(access)] }`.

### Leitura por ID

- `findUnique({ where: { id } })` **não tem escopo de empresa**. Em dado operacional, use
  `findFirst({ where: { id, companyId } })` ou um helper `assert*Access`.
- `findUnique` só é aceitável quando o ID **já foi obtido de uma consulta escopada** no mesmo fluxo
  (ex.: `routes/sites.ts` relê `existing.id`) ou pela chave composta `companyId_*`.

### Update / delete — "verificar e depois mutar"

Padrão usado em `routes/contract-clauses-mysql.ts`, `routes/contracts-mysql.ts` e outros:

```ts
const row = await db().contractClause.findFirst({ where: { id: String(req.params.id), companyId: req.access!.company.id } });
if (!row) throw notFound();
await db().contractClause.update({ where: { id: row.id }, data: { ... } });
```

- Nunca faça `update/delete({ where: { id: req.params.id } })` direto.
- `updateMany/deleteMany` sempre com `companyId` no `where`.
- Em transação, faça a verificação **dentro** da mesma `tx`.

### Validação de referências (relações)

Modelo em `routes/crm.ts` (`stageFor`, `assignedFor`, `assignedForRequest`):

```ts
const user = await getPrisma().appUser.findFirst({ where: { id: userId, companyId, status: "active" }, select: { id: true } });
if (!user) throw invalid("Responsável inválido para esta empresa.", "INVALID_ASSIGNEE");
```

Além de pertencer à empresa, verifique o **escopo do usuário**: um broker não pode atribuir lead a outro
usuário (`ASSIGNEE_SCOPE_DENIED`).

**Onde o banco protege e onde não protege:**

| Relação | Proteção no schema | Ação no código |
|---|---|---|
| `PartyRole → Party` | FK composta `[companyId, partyId] → Party[companyId, id]` | banco bloqueia cross-tenant; ainda valide para devolver 404 limpo |
| `Buyer/Tenant/BrokerProfile → PartyRole` | FK composta `[companyId, partyRoleId]` | idem |
| `AppUser.partyId → Party` | FK composta `[companyId, partyId]` | idem |
| `PropertyOwner.partyId`, `ContractParty.sourcePartyId` e outros vínculos a Party | FK composta | idem |
| `Property.ownerId → PropertyOwner` (e demais `ownerId` simples) | **FK simples, só `id`** | **obrigatório** validar `PropertyOwner` com `companyId` antes de gravar |
| `responsibleUserId`, `assignedTo`, `createdBy`, `stageId`... | FK simples ou nenhuma | **obrigatório** validar com `companyId` |

Ao criar uma relação nova entre entidades da mesma empresa, prefira FK composta
`[companyId, xId] → X[companyId, id]` (exige `@@unique([companyId, id])` no alvo — ver `Party`).

### Identidade: Party, PartyRole, AppUser, proprietários

- Serviço canônico: `backend/src/services/party-identity.ts`. Toda busca/criação é `companyId + identidade`;
  **nunca existe busca global de Party**.
- CPF/CNPJ: `normalizeBrazilianDocument` / `isValidBrazilianDocument` (`services/brazilian-document.ts`).
  Documento inválido ou ausente **nunca** deduplica.
- `@@unique([companyId, taxIdNormalized])` em `Party`: mesmo CPF/CNPJ em empresas diferentes = Parties
  distintas. Duplicata na mesma empresa = reusar (P2002 → reler pela chave única, nunca 500).
- `PartyRole`: `@@unique([companyId, partyId, role])`; papéis aceitos: `owner`, `buyer`, `tenant`, `broker`.
- Checagem de duplicidade de proprietário é sempre por empresa (`ensureOwnerDocumentAvailable(companyId, doc, excludeId)`
  em `services/mysql-real-estate.ts`).
- **Atenção:** `AppUser.email` é `@unique` **global** (`users_email_key`). Diferente de Party, o mesmo
  e-mail não pode ter login em duas empresas. Não trate isso como bug de isolamento, mas também não
  vaze, em mensagem de erro, que o e-mail existe em outra empresa.

### Rotas públicas e portais (sem sessão)

Arquivos: `routes/public-portals.ts`, `routes/public-sites.ts`, `routes/public-inspections.ts`.

- A empresa e o registro são derivados **do token**, nunca do cliente (`loadMysqlOwnerPortalCore(token)`).
- Token ausente, inválido, desabilitado ou de registro inativo → **o mesmo 404 genérico**, sem dizer qual.
- Tokens opacos novos devem ser guardados como hash (`hashOpaqueToken` em `services/mysql-auth.ts`),
  como já faz `ContractParty.portalTokenHash`. **Legado:** `PropertyOwner.portalToken` ainda é gravado e
  consultado em texto puro (`services/mysql-real-estate.ts`, `loadMysqlOwnerPortalCore`); não copie esse
  padrão em código novo.
- IDs de subrecurso (documentId, propertyId) são buscados **dentro** do escopo resolvido pelo token.
- Responda com `select` explícito: nada de CPF/RG completo, dados financeiros de terceiros, IDs internos
  de outros usuários ou URLs de storage privadas. Site público só lista imóveis publicados da empresa
  dona do slug/domínio (`site-slug-multitenant-isolation.test.ts`, `public-property-security.test.ts`).

### Uploads e documentos (`backend/src/services/storage/`)

- `StoredFile` tem `companyId`, `entityType`, `entityId`, `purpose`. Use as funções `*ForEntity(companyId, ...)`
  de `stored-files.ts`; não consulte `storedFile` por `id` solto.
- Antes de anexar, valide que a entidade dona (`entityId`) pertence à empresa.
- Leitura exige a permissão de `STORED_FILE_PURPOSE_PERMISSION` (`purposes.ts`) além da empresa.
- Validação de arquivo: `validateUploadFile` (`file-policy.ts`).
- Documentos sensíveis (ex.: `owner_document`) usam entrega **authenticated**: nunca devolva `secureUrl`
  ao frontend; gere URL assinada curta no backend, sem persistir nem logar.

### Auditoria de ações críticas

Registre sempre com `companyId` da sessão e `actorUserId`, sem PII desnecessária em `metadataJson`:

- Autenticação / usuários / papéis / permissões: `AuthAuditLog`.
- Domínios: tabelas de evento já existentes (`LeadEvent`, `ContractEvent`, `InspectionEvent`,
  `FinancialEntryEvent`, `AppointmentEvent`, `ProposalEvent`), `WebsiteAuditLog`, `services/property-events.ts`.
- Não crie uma nova tabela de auditoria se uma dessas cobre o domínio.

### Dev local

`services/local-dev-access.ts` libera sessão apenas para loopback (localhost/127.x/::1, sem forwarding
externo). Nunca afrouxe essa checagem nem a habilite por variável em staging/produção
(`local-dev-auth-security.test.ts`).

## Testes negativos obrigatórios

Toda rota/service que toca dado de empresa precisa de testes com **duas empresas** (A e B):

- B **não lê** registro de A por id, por código ou por busca (lista vazia / 404).
- B **não altera nem exclui** registro de A (404, e o mock de `update/delete` **não é chamado**).
- B **não vincula** ID de A (ownerId, partyId, assignedTo, stageId, documentId...) → erro de validação.
- `companyId`/`company_id` malicioso no body/query é **ignorado**.
- Mesmo CPF/CNPJ em A e B gera registros distintos; duplicata na mesma empresa é reutilizada/rejeitada.
- Broker em escopo `own` não alcança recurso de outro corretor da mesma empresa.
- Rota pública com token inválido/de outra empresa → 404 genérico.

Padrão de teste (Vitest, sem banco): mock de `getPrisma` e assert do `where` com `companyId`:

```ts
const { database } = vi.hoisted(() => ({ database: { propertyOwner: { findFirst: vi.fn() } } }));
vi.mock("../src/lib/website-builder-prisma.js", () => ({ getPrisma: () => database }));
// ...
expect(database.propertyOwner.findFirst).toHaveBeenCalledWith({
  where: { companyId: "company-a", document: "52998224725" }, select: { id: true },
});
```

Referências: `backend/tests/owner-document-isolation.test.ts`, `property-central-search-multitenant.test.ts`,
`mysql-auth-http-isolation.test.ts`, `authorization-broker-isolation.test.ts`, `owner-360-security.test.ts`.
Rodar: `npm test` em `platform/` (Vitest).

## Checklist de revisão de diff

Rode estas buscas no diff (ou no arquivo alterado) e justifique cada ocorrência:

```bash
git diff -U0 | grep -nE '\.(findUnique|findUniqueOrThrow|findFirst|findMany|update|updateMany|delete|deleteMany|upsert|count|aggregate)\('
git diff -U0 | grep -nE 'company_?[iI]d' | grep -E 'req\.(body|query|params)|body\.|input\.'
git diff -U0 | grep -nE '\$queryRaw|\$executeRaw'
```

- [ ] Toda query de dado operacional tem `companyId` ou filtro de escopo?
- [ ] `findUnique` por `id` só com ID vindo de consulta escopada?
- [ ] Update/delete seguem "verificar e depois mutar"?
- [ ] Todo ID referenciado foi revalidado na empresa (e no escopo do usuário)?
- [ ] SQL raw tem `company_id = ?` parametrizado?
- [ ] Rota nova está atrás de `requireAuth` + `requireCompany` + `requirePermission` (ou é pública e
      deriva tudo de token)?
- [ ] Resposta usa `select`/serializer e não vaza PII nem dados de outra empresa?
- [ ] Upload valida entidade dona, purpose e permissão?
- [ ] Ação crítica gera auditoria com `companyId` e ator?
- [ ] Testes negativos A×B foram escritos e passaram (com saída do `npm test`)?
