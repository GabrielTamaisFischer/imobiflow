# Deploy do backend na Vercel

Este e o caminho de producao atual desta fase:

- Frontend: Vercel.
- Backend: Vercel Functions em `/api`.
- Banco principal: MySQL online via `DATABASE_URL` server-side.
- ORM: Prisma.
- Arquivos: Cloudinary nesta etapa. Cloudflare R2 fica como alternativa futura.

Nao use VPS Hostinger, systemd, PM2, NGINX, Render/Railway para hospedar backend, nem Supabase como banco principal nesta fase. Railway pode ser usado apenas como provedor MySQL online via `MYSQL_PUBLIC_URL`.

## Modelo serverless

O backend Express existente e reaproveitado por `api/index.ts` (Function de nome fixo — nao usamos mais
a sintaxe de catch-all `[...path].ts`, ver nota abaixo).

A Function remove o prefixo `/api` antes de encaminhar a requisicao para o app Express. Um rewrite em
`vercel.json` (`/api/:path*` -> `/api`) garante que toda requisicao com 1 ou mais segmentos depois de
`/api` chegue a essa mesma Function; sem o rewrite, o roteamento por sistema de arquivos da Vercel so
casaria com a URL exata `/api`. Assim:

```txt
/api/auth/login -> /auth/login
/api/test-lab/generate -> /test-lab/generate
/api/public/sites/:slug -> /public/sites/:slug
```

`backend/src/server.ts` continua existindo apenas para desenvolvimento local e nao e usado pela Vercel.

## Variaveis na Vercel

O caminho recomendado e executar o script abaixo e digitar os segredos apenas no terminal:

```powershell
npm run deploy:vercel
```

O script:

- valida a entrada serverless `api/index.ts`;
- linka o projeto com `vercel link`, se necessario;
- grava variaveis em Production e Preview;
- normaliza a `DATABASE_URL` com `connection_limit=1`, `connect_timeout=15` e `sslaccept` quando ausentes;
- valida a conexao MySQL com Prisma sem imprimir a URL completa;
- roda `prisma generate`, `prisma migrate deploy` e o seed estrutural controlado;
- faz build e deploy de producao;
- executa o smoke QA real contra `/api`.

Variaveis gravadas na Vercel:

```txt
APP_URL=https://imobifloww-main.vercel.app
FRONTEND_URL=https://imobifloww-main.vercel.app
CORS_ORIGIN=https://imobifloww-main.vercel.app
DATABASE_URL=mysql://USUARIO:SENHA@HOST:PORTA/imobiflow?connection_limit=1&connect_timeout=15&sslaccept=accept_invalid_certs
IMOBIFLOW_AUTH_PROVIDER=mysql
IMOBIFLOW_BOOTSTRAP_EMAIL=
IMOBIFLOW_BOOTSTRAP_PASSWORD=
JWT_SECRET=
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UPLOAD_FOLDER=imobiflow
```

`NODE_ENV` e fornecida pela Vercel. Nao e necessario criar essa variavel manualmente.

`VITE_IMOBIFLOW_API_URL` nao e obrigatoria. Sem ela, o frontend chama `/api` na mesma origem.

`IMOBIFLOW_MYSQL_AUTH` continua aceito como legado, mas nao e usado no fluxo novo. Use `IMOBIFLOW_AUTH_PROVIDER=mysql`.

`PRISMA_MIGRATE_DATABASE_URL` e opcional e fica apenas para comandos locais de migration. Se o provedor exigir um usuario administrativo separado para migrations, informe essa URL no prompt do script; ela nao e gravada no frontend.

## Campos que voce precisa copiar

Da Vercel:

- URL publica do projeto ja publicado, por exemplo `https://imobifloww-main.vercel.app`.
- Projeto correto quando o `vercel link` perguntar.

Do MySQL online/Railway:

- `MYSQL_PUBLIC_URL`, quando o banco estiver no Railway.
- Nao use `MYSQL_URL`, porque ela aponta para a rede interna `railway.internal`.
- Idealmente use usuario proprio da aplicacao. Se a etapa inicial do Railway expuser apenas root, o script aceita temporariamente e avisa para trocar depois.

Do Cloudinary, se for ativar uploads agora:

- Cloud name.
- API Key.
- API Secret.
- Upload folder, recomendado `imobiflow`.

Cloudflare R2 nao e requisito de deploy nesta fase; fica documentado apenas como alternativa futura de migracao pelo provider `cloudflare_r2`.

## Prisma

O client Prisma e gerado na raiz do projeto durante `postinstall`, quando `DATABASE_URL` existe.

Para preparar o banco manualmente, fora do script:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

`prisma:seed` cria apenas templates estruturais, sem dados ficticios de producao.

O backend em runtime cria uma unica instancia reutilizavel de `PrismaClient` por processo quente da Vercel Function. Migrations e seed nao rodam em cada requisicao; rodam apenas pelo script ou comando explicito.

## Validacao obrigatoria

Depois do deploy:

- `GET /api/health` deve retornar `ok=true`.
- Login bootstrap deve retornar token MySQL.
- `/app/testes` deve gerar 14 ou mais imoveis QA no MySQL.
- A mesma conta deve mostrar os mesmos IDs/quantidade em navegadores diferentes.
- A vitrine e o Builder devem ler os mesmos dados do MySQL.
- O card do imovel deve abrir a pagina individual com titulo, valor, descricao, fotos e detalhes.
- A limpeza QA deve remover os registros e eles devem desaparecer nos navegadores.
