---
name: database-migrations
description: "Migrations seguras do ImobiFlow (Prisma + MySQL/TiDB): mudanças aditivas, expand-contract, backfill em lotes, índices, compatibilidade com dados legados e com TiDB/MySQL, e guarda de ambiente. Use ao alterar prisma/schema.prisma, criar ou revisar migration, adicionar coluna, índice, unique ou relação, fazer backfill ou planejar deploy de schema."
metadata:
  origin: ECC (adaptada para o ImobiFlow)
  upstream: https://github.com/affaan-m/ECC/blob/90606c8315ee09cafc303515c5f33024db6b9882/skills/database-migrations/SKILL.md
  license: MIT (Copyright (c) 2026 Affaan Mustafa)
---

# Migrations de banco — ImobiFlow

> **Adaptada para o ImobiFlow.** Esta não é a versão original do ECC. Mudanças em relação ao upstream
> (commit `90606c8`):
> - **removida** a recomendação `npx prisma migrate reset` ("Reset database (dev only)");
> - **removidas** as seções de PostgreSQL, Drizzle, Kysely, Django e golang-migrate (fora do stack);
> - exemplos SQL reescritos para **MySQL/TiDB**;
> - **adicionadas** as regras proibidas do ImobiFlow, a guarda de ambiente e o checklist TiDB/MySQL.
>
> Em conflito, o `CLAUDE.md` da raiz prevalece.

## Regras proibidas (ImobiFlow)

1. **`prisma migrate reset` é PROIBIDO** — em qualquer ambiente, inclusive local apontando para banco
   compartilhado. Ele apaga o banco inteiro. Não sugira, não execute, não coloque em script.
2. **Banco de produção nunca pode ser usado para testes**, seeds, fixtures, imports de teste ou
   experimentos. Testes usam mocks (Vitest) ou banco local/descartável.
3. **Migrations destrutivas exigem autorização explícita do usuário** antes de serem escritas e de novo
   antes de serem aplicadas: `DROP TABLE`, `DROP COLUMN`, `DROP INDEX` de unique, `TRUNCATE`, `DELETE`
   em massa, `MODIFY`/`CHANGE` que reduz tamanho ou muda tipo, `NOT NULL` em coluna com dados legados,
   novo `UNIQUE` sobre dados existentes.
4. **Não use** `prisma db push` nem `--accept-data-loss` contra banco compartilhado (staging/produção).
5. **Não edite** migration que já rodou em qualquer ambiente compartilhado — crie uma nova.
6. **Nunca exponha `DATABASE_URL`** em logs, commits, saídas ou respostas.
7. **Nunca execute migration automaticamente em produção** — nem por agente, nem por hook, nem por
   CI/CD, build, `postinstall` ou script de deploy. Aplicar migration em produção é sempre um passo
   manual, com autorização explícita para aquela execução. (Isso prevalece sobre a sugestão de
   "`migrate deploy` em CI/CD" da skill `prisma-patterns`.)

## Prefira migrations aditivas

| Preferir | Evitar |
|---|---|
| nova coluna **nullable** ou com `DEFAULT` | coluna `NOT NULL` sem default em tabela com dados |
| nova tabela / novo índice | renomear coluna ou tabela diretamente |
| nova relação opcional (`String?`) | tornar relação existente obrigatória de uma vez |
| expand → backfill → contract em deploys separados | DDL + backfill + drop na mesma migration |

Exemplo real do projeto: os vínculos `partyId` em `PropertyOwner` e `AppUser` foram adicionados como
**nullable** para manter compatibilidade com dados legados (migrations `c1_party_identity`,
`c5_app_user_party_link`).

## Fluxo no ImobiFlow

Schema: `platform/prisma/schema.prisma` (`provider = "mysql"`). Migrations: `platform/prisma/migrations/`.

```bash
# (local, banco local/descartável) gerar migration a partir do schema
npx prisma migrate dev --create-only --name <descricao> --schema prisma/schema.prisma
#   --create-only: gera o SQL sem aplicar; revise o SQL antes de aplicar

# gerar client após mudar o schema
npm run prisma:generate

# aplicar migrations pendentes (só com autorização e ambiente confirmado)
npm run prisma:migrate          # = prisma migrate deploy

# staging: usar o script com guarda de destino
npm run c3:migrate:staging      # exige ALLOW_C3_STAGING_MIGRATION=true e EXPECTED_STAGING_DB_HOST/PORT/NAME
```

Antes de aplicar em qualquer ambiente compartilhado:

- confirme **branch e ambiente** e que o host/banco de destino é o esperado (o script de staging já
  compara `DATABASE_URL` com `EXPECTED_STAGING_DB_*` — reutilize essa guarda, não a contorne);
- peça autorização explícita ao usuário;
- nunca rode contra produção sem autorização explícita para aquela execução específica.

## Checklist antes de escrever a migration

- [ ] Impacto em tabelas existentes e **dados legados** (quantas linhas? há valores que violariam o novo
      constraint?)
- [ ] **Multiempresa:** model operacional novo tem `companyId` + índices começando por `companyId`
      (ver skill `imobiflow-tenant-isolation`)
- [ ] **Unique constraints:** unique de negócio é por empresa (`@@unique([companyId, ...])`), nunca global,
      salvo decisão explícita (ex.: `site_slug_global_unique`)
- [ ] **Relações:** relação entre entidades da mesma empresa usa FK composta `[companyId, xId]` quando possível
- [ ] **Índices:** cobrem os `where`/`orderBy` reais; sem índices duplicados
- [ ] **Performance:** DDL em tabela grande avaliado; backfill em lotes
- [ ] **Compatibilidade:** código atual continua funcionando com o schema novo **e** o código novo funciona
      enquanto a migration ainda não rodou (deploy em duas etapas quando necessário)
- [ ] **Destrutiva?** Se sim, parar e pedir autorização explícita
- [ ] **Rollback:** como desfazer com uma migration nova (forward-only)

## Compatibilidade TiDB / MySQL

O projeto roda em MySQL (local/docker) e TiDB (ambientes hospedados). Antes de aceitar o SQL gerado:

- [ ] O SQL usa apenas recursos suportados pela **versão do TiDB em uso** — confirme a versão e consulte
      a página de compatibilidade MySQL do TiDB para: foreign keys, `ALTER` com múltiplas alterações,
      mudança de tipo de coluna, `FULLTEXT`, colunas geradas, `CHECK`, triggers e procedures.
- [ ] Mudança de tipo (`MODIFY COLUMN`) não é com perda (encurtar `VARCHAR`, `INT`→menor, charset).
      TiDB tem restrições próprias para alterar tipo — trate como destrutiva e teste antes.
- [ ] `CHAR(36)` para UUID (padrão do projeto: `@db.Char(36)`); `@map` em snake_case.
- [ ] Índice único sobre coluna nullable: MySQL/TiDB permitem múltiplos `NULL` — o projeto **depende**
      disso em `parties (company_id, tax_id_normalized)`. Não troque por default `''`.
- [ ] Transações grandes: TiDB tem limites de tamanho de transação — backfill sempre em lotes.
- [ ] Teste a migration em banco **local** (MySQL do `docker-compose.mysql.yml`) antes de staging.

## Padrões MySQL/TiDB

### Adicionar coluna com segurança

```sql
-- BOM: nullable
ALTER TABLE `properties` ADD COLUMN `external_ref` VARCHAR(80) NULL;

-- BOM: com default
ALTER TABLE `properties` ADD COLUMN `is_featured` BOOLEAN NOT NULL DEFAULT false;

-- RUIM: NOT NULL sem default em tabela com dados (falha ou exige backfill prévio)
ALTER TABLE `properties` ADD COLUMN `region` VARCHAR(80) NOT NULL;
```

### Índice

```sql
-- Índice com companyId na frente (padrão multiempresa)
CREATE INDEX `properties_company_id_status_idx` ON `properties` (`company_id`, `status`);
```

Em MySQL 8, criação de índice secundário costuma ser online; em TiDB, DDL é online por padrão. Mesmo assim,
em tabela grande avalie horário e monitore. `UNIQUE` novo sobre dados existentes: primeiro **consulte
duplicatas** e decida com o usuário o que fazer com elas.

### Renomear coluna (expand-contract)

Nunca renomeie direto em ambiente compartilhado:

```
Migration 1 (expand):   ADD COLUMN nova (nullable)
Deploy A:               app grava nas duas, lê da antiga
Migration 2 (data):     backfill em lotes
Deploy B:               app lê da nova, grava nas duas
Deploy C:               app usa só a nova
Migration 3 (contract): DROP COLUMN antiga  ← destrutiva: exige autorização explícita
```

### Backfill em lotes

Faça backfill por script Node (Prisma) idempotente, em lotes, **sempre escopado** e retomável:

```ts
// percorre por id em lotes; idempotente (só atualiza quem ainda não foi migrado)
let cursor: string | undefined;
for (;;) {
  const batch = await prisma.property.findMany({
    where: { externalRef: null },
    select: { id: true, companyId: true, code: true },
    orderBy: { id: "asc" },
    take: 500,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  if (batch.length === 0) break;
  for (const row of batch) {
    await prisma.property.updateMany({
      where: { id: row.id, companyId: row.companyId, externalRef: null },
      data: { externalRef: row.code },
    });
  }
  cursor = batch[batch.length - 1].id;
}
```

Backfill não roda contra produção sem autorização explícita, e não mistura dados de empresas.

## Antipadrões

| Antipadrão | Por que falha | Melhor |
|---|---|---|
| `prisma migrate reset` | apaga o banco | **proibido** — nunca usar |
| SQL manual no banco compartilhado | sem trilha, irrepetível | migration versionada |
| Editar migration já aplicada | drift entre ambientes | nova migration |
| `NOT NULL` sem default | falha / trava com dados legados | nullable → backfill → constraint |
| Unique global em dado de cliente | quebra multiempresa | `@@unique([companyId, ...])` |
| DDL + backfill + drop juntos | rollback difícil, transação grande | migrations separadas |
| Dropar coluna antes de tirar do código | erro em runtime | remover do código, deploy, depois drop |
| Testar migration em produção | risco direto ao cliente | banco local/descartável e depois staging |
