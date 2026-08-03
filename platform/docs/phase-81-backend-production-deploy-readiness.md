# Fase 81 - Backend real com MySQL em producao

## Causa do bloqueio

O frontend estava publicado na Vercel, mas a API ainda nao estava rodando na mesma implantacao. Assim, botoes como gerar testes, limpar testes, listar imoveis e abrir a pagina dinamica do imovel nao tinham uma API real para chamar.

Tambem havia rotas antigas ainda usando Supabase nos fluxos de site, imoveis publicos, imoveis internos e laboratorio de testes. Nesta etapa, esses fluxos foram movidos para Prisma + MySQL.

## Backend definido

- Banco principal: MySQL online.
- ORM: Prisma.
- Autenticacao operacional desta etapa: token MySQL bootstrap via `IMOBIFLOW_AUTH_PROVIDER=mysql`.
- Arquivos: Cloudinary nesta etapa; R2 fica apenas como provider futuro opcional.
- Frontend: Vercel.
- Backend: Vercel Functions em `/api`, na mesma implantacao do frontend.

## Variaveis obrigatorias na Vercel

```txt
APP_URL=https://imobifloww-main.vercel.app
FRONTEND_URL=https://imobifloww-main.vercel.app
CORS_ORIGIN=https://imobifloww-main.vercel.app

DATABASE_URL=mysql://USUARIO:SENHA@HOST:PORTA/imobiflow?connection_limit=1&connect_timeout=15&sslaccept=accept_invalid_certs

IMOBIFLOW_AUTH_PROVIDER=mysql
IMOBIFLOW_BOOTSTRAP_EMAIL=admin@seudominio.com
IMOBIFLOW_BOOTSTRAP_PASSWORD=SENHA_FORTE_NO_AMBIENTE
IMOBIFLOW_BOOTSTRAP_COMPANY_NAME=Nome da empresa
JWT_SECRET=SEGREDO_FORTE_NO_AMBIENTE

STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UPLOAD_FOLDER=imobiflow
```

`NODE_ENV` e fornecida pela Vercel. Nao coloque segredos no repositorio. O caminho recomendado e executar:

```powershell
npm run deploy:vercel
```

O script grava as variaveis server-side na Vercel, valida a conexao MySQL, roda migrations/seed estrutural controlado e faz o deploy.

Para Railway, use `MYSQL_PUBLIC_URL` como entrada do prompt `DATABASE_URL`. Nao use `MYSQL_URL`, pois ela aponta para a rede interna `railway.internal`.

## Variavel opcional do frontend

```txt
VITE_IMOBIFLOW_API_URL=
```

`VITE_IMOBIFLOW_API_URL` nao e obrigatoria nesta fase. Sem ela, o frontend usa `/api` na mesma origem da Vercel.

## Comandos de banco

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run build
```

Migrations e seed nao rodam automaticamente em cada requisicao nem em import da Function. Eles rodam apenas por comando explicito.

## Fluxos migrados para MySQL

- `POST /api/auth/login` quando `IMOBIFLOW_AUTH_PROVIDER=mysql`.
- `/api/real-estate/*` para proprietarios, imoveis e midias.
- `/api/site/*` para configuracao/publicacao/leads do site.
- `/api/public/sites/*` para vitrine publica, imoveis publicos e lead publico.
- `/api/test-lab/generate` e `/api/test-lab/clear` para dados QA persistidos no MySQL.
- `/api/website-builder/*` ja usa Prisma/MySQL.

## Validacao esperada em producao

1. `GET https://URL-DA-VERCEL/api/health` retorna `{ "ok": true }`.
2. Login retorna token MySQL.
3. `POST /api/test-lab/generate` cria imoveis QA no MySQL.
4. Chrome, Firefox, Edge e Codex mostram os mesmos imoveis para a mesma conta.
5. Cards das vitrines apontam para `/site/:slug/imoveis/:propertySlug`.
6. A pagina individual do imovel carrega dados reais do MySQL.
7. `DELETE /api/test-lab/clear` remove somente dados `QA-*` e leads de `qa-test-lab`.

## Bloqueio que ainda exige credenciais

Nao e possivel concluir teste de producao real sem:

- URL publica da implantacao Vercel;
- MySQL online acessivel pelas Vercel Functions;
- `DATABASE_URL` real;
- `PRISMA_MIGRATE_DATABASE_URL`, apenas se houver URL administrativa separada para migrations;
- `JWT_SECRET`;
- `IMOBIFLOW_BOOTSTRAP_EMAIL`;
- `IMOBIFLOW_BOOTSTRAP_PASSWORD`;
- credenciais Cloudinary, se upload real de arquivos for testado.
