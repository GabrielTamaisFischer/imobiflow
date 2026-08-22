# Website Builder - Backend Real MySQL, Prisma e Cloudinary

Esta etapa prepara o Website Builder para persistencia real na API Vercel, usando MySQL online, Prisma e Cloudinary como storage ativo. A landing page atual nao deve ser alterada.

## O Que Foi Adicionado

- Migration `202605230002_website_builder_audit_logs` com tabela `website_audit_logs`.
- Logs basicos para criacao, edicao, exclusao logica, SEO, dominio e assets do Website Builder.
- Endpoint `GET /website-builder/websites/:id/audit-logs`.
- Validacao de tipo, extensao, tamanho e magic bytes antes de enviar arquivos.
- Upload pelo backend para o provider de storage configurado.
- Remocao real do objeto remoto quando um asset enviado e excluido.
- `backend/.env.example` com `DATABASE_URL` e variaveis Cloudinary.
- API publicada como Vercel Function em `/api`.

## Variaveis Obrigatorias Na Vercel

Configure as variaveis no projeto Vercel. Nao commitar `.env.production` nem qualquer segredo.

```env
APP_URL=https://SEU-FRONTEND.vercel.app
FRONTEND_URL=https://SEU-FRONTEND.vercel.app
CORS_ORIGIN=https://SEU-FRONTEND.vercel.app

DATABASE_URL=mysql://USUARIO:SENHA@HOST:PORTA/NOME_DO_BANCO?connection_limit=1&connect_timeout=15&sslaccept=accept_invalid_certs

IMOBIFLOW_AUTH_PROVIDER=mysql
IMOBIFLOW_BOOTSTRAP_EMAIL=admin@seudominio.com
IMOBIFLOW_BOOTSTRAP_PASSWORD=SENHA_FORTE_NO_AMBIENTE
JWT_SECRET=SEGREDO_FORTE_NO_AMBIENTE

STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UPLOAD_FOLDER=imobiflow
```

`VITE_IMOBIFLOW_API_URL` e opcional. Sem ela, o frontend chama `/api` na mesma implantacao Vercel.

## MySQL Real Online

1. Crie um banco MySQL 8.
2. Crie um usuario exclusivo para o ImobiFlow.
3. Use uma URL publica acessivel pelas Vercel Functions.
4. Monte a URL:

```txt
mysql://usuario:senha@host:porta/imobiflow
```

No Railway, use `MYSQL_PUBLIC_URL`, nunca `MYSQL_URL` interno.

## Cloudinary Real

1. Crie ou acesse a conta Cloudinary.
2. Copie Cloud name, API Key e API Secret.
3. Use `CLOUDINARY_UPLOAD_FOLDER=imobiflow`.
4. Preencha as variaveis no backend/Vercel, sem prefixo `VITE_`.

Sem Cloudinary configurado, uploads retornam erro controlado `503`. O sistema nao salva midias no navegador como fallback.

## Aplicar Migrations Reais

Use o script principal:

```bash
npm run deploy:vercel
```

Ou rode manualmente:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run build
```

## Rotas Protegidas

Todas as rotas do Website Builder passam por:

- `requireAuth`
- `requireCompany`
- `requireActiveSubscription`
- `requirePermission("site.manage")`

Toda consulta operacional filtra `company_id` pelo contexto autenticado.

## Auditoria Basica

Tabela:

```txt
website_audit_logs
```

Eventos registrados:

- site criado, atualizado, arquivado e clonado;
- pagina criada, atualizada e arquivada;
- secao criada, atualizada e arquivada;
- componente criado, atualizado e arquivado;
- upload concluido e asset removido;
- dominio criado, atualizado e removido;
- SEO atualizado.

## Fora Desta Etapa

- Editor visual completo.
- Drag and drop avancado.
- Effects Gallery.
- Marketplace.
- Importacao de sites.
- Publicacao automatica de imoveis.
- Dominio customizado com verificacao real de DNS/SSL.
- IA e animacoes avancadas.

## Checklist De Aceite

- Backend publicado responde `GET /health`.
- `DATABASE_URL` aponta para MySQL real.
- `npm run prisma:migrate` aplica todas as migrations.
- `GET /website-builder/status` mostra MySQL e Cloudinary configurados.
- `POST /website-builder/websites/blank` grava site e home no MySQL.
- `POST /website-builder/assets/upload` envia arquivo pelo backend e grava metadados no MySQL.
- `GET /website-builder/websites/:id/audit-logs` lista eventos da empresa autenticada.
- Landing page aprovada continua sem alteracoes.
