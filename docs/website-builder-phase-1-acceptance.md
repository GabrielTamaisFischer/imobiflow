# Website Builder - Aceite Da Fase 1

Este documento acompanha o plano aprovado para a Fase 1 do Website Builder ImobiFlow.

## Escopo

A Fase 1 entrega somente a fundacao tecnica:

- MySQL/Prisma;
- Storage preparado por abstração de provider;
- APIs iniciais;
- tela interna `/app/site/builder`;
- preview estrutural;
- templates estruturais;
- documentacao de configuracao;
- testes basicos.

Nao entram nesta fase:

- editor visual completo;
- Effects Gallery;
- importacao de sites;
- dominio automatico;
- marketplace;
- publicacao automatica de imoveis;
- animacoes avancadas.

## Checklist Do Plano

| Item | Status | Observacao |
| --- | --- | --- |
| Analisar estrutura atual | Pronto | Website Builder isolado na area interna. |
| Preservar landing page | Pronto | Rotas publicas aprovadas nao foram substituidas. |
| Configurar persistencia MySQL | Pronto estruturalmente | `DATABASE_URL`, Prisma e Docker Compose preparados. |
| Schema Prisma/MySQL | Pronto | `prisma/schema.prisma` e `prisma.config.ts` com tabelas da Fase 1. |
| Migrations versionadas | Pronto | Migration inicial em `prisma/migrations`. |
| `company_id` em todas as tabelas | Pronto | Todas as entidades operacionais do builder possuem `companyId`. |
| Storage | Pronto estruturalmente | Provider configuravel criado; credenciais reais ainda pendentes. |
| Remover localStorage dos dados principais | Pronto | Builder usa API/MySQL; localStorage nao e fallback de dados ou midia. |
| APIs iniciais | Pronto | Rotas `/website-builder` criadas e protegidas. |
| Site em branco | Pronto | Cria website + home vazia, sem dados ficticios. |
| Template clonado | Pronto | Templates estruturais, sem imoveis/leads falsos. |
| Estado vazio sem dados ficticios | Pronto | Tela interna orienta criar site ou configurar ambiente. |
| Documentacao | Pronto | Docs da Fase 1, MySQL/Hostinger e aceite. |

## Pendencias De Ambiente Real

Estas pendencias dependem de credenciais/infra reais:

- configurar `VITE_IMOBIFLOW_API_URL` com backend publicado;
- configurar `DATABASE_URL` apontando para MySQL real;
- configurar variaveis R2;
- executar migrations no MySQL real;
- executar seed estrutural no MySQL real;
- testar criacao de site em branco gravando no MySQL real;
- testar clone de template gravando no MySQL real;
- testar upload real no R2.

## Comandos De Validacao Local

```bash
npm run website-builder:preflight
npm run test
npm run build
cd backend
npm run prisma:validate
npm run build
```

## Comandos Quando O MySQL Real Estiver Pronto

```bash
cd backend
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run build
```

## Resultado Esperado Da Tela

Em `/app/site/builder`:

- mostra status de backend, MySQL/Prisma e R2;
- mostra assistente de configuracao;
- bloqueia criacao/clonagem quando MySQL nao esta pronto;
- lista sites reais quando MySQL/API estiverem configurados;
- nao exibe dados falsos de producao.

## Criterio Para Aprovar A Fase 1

A Fase 1 pode ser considerada aprovada quando:

1. `npm run website-builder:preflight:strict` passar no ambiente real.
2. `npm run prisma:migrate` rodar no MySQL real.
3. `npm run prisma:seed` criar somente templates estruturais.
4. A tela `/app/site/builder` conseguir criar um site em branco.
5. A tela `/app/site/builder` conseguir clonar um template estrutural.
6. O upload de asset retornar URL real do R2.
