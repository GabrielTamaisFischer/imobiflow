# Setup Local Automático Do ImobiFlow

Este é o caminho recomendado agora, sem Docker.

## O Que Você Faz

1. Abra o PowerShell como administrador.
2. Cole o comando abaixo.
3. Digite a senha root do MySQL quando o script pedir.

```powershell
cd C:\Users\Acahadinhos\Documents\mozart2.0\NEXUS\imobifloww-main\imobifloww-main
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\setup-imobiflow-local.ps1
```

## O Que O Script Faz Sozinho

- detecta Node, npm e MySQL;
- valida se o serviço `MySQL80` está rodando;
- pede senha root do MySQL;
- cria o banco `imobiflow`;
- cria o usuário `imobiflow`;
- define a senha local `imobiflow_local_password`;
- aplica permissões no banco;
- cria `.env.local` na raiz;
- cria `backend/.env.local`;
- preserva variáveis existentes quando já houver `.env` ou `.env.local`;
- roda `npm install` na raiz;
- roda `npm install` no backend;
- valida Prisma;
- gera Prisma Client;
- aplica migrations;
- roda seed estrutural;
- valida as tabelas `website%`;
- inicia backend e frontend localmente;
- valida `http://localhost:3333/health`;
- ativa autenticação local de desenvolvimento para testar o Website Builder;
- testa CRUD local do Website Builder com site temporário;
- valida `http://localhost:5173`;
- valida `http://localhost:5173/app/site/builder`;
- mostra resumo final e próximos comandos.

O teste CRUD local cria um site temporário, cria página/seção/componente, valida o erro controlado do R2 quando não há credenciais e exclui o site temporário no final.

## Dados Locais Criados

```txt
Host: 127.0.0.1
Porta: 3306
Database: imobiflow
Usuário: imobiflow
Senha: imobiflow_local_password
DATABASE_URL: mysql://imobiflow:imobiflow_local_password@127.0.0.1:3306/imobiflow
```

## Tabelas Esperadas

```txt
website_assets
website_audit_logs
website_components
website_domains
website_pages
website_publish_logs
website_sections
website_seo
website_templates
website_versions
websites
```

## Observação Sobre Rotas Protegidas

As rotas do Website Builder continuam protegidas por:

- auth;
- company;
- active subscription;
- permission("site.manage").

Por isso, o script só testa rota protegida se existir a variável:

```powershell
$env:IMOBIFLOW_AUTH_TOKEN="COLE_AQUI_O_TOKEN"
```

Sem token, isso não é erro. É a segurança funcionando.

Se as variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` ainda não existirem, a rota pública `/health`, Prisma, migrations e MySQL continuam funcionando localmente. As rotas protegidas completas dependem dessas variáveis e de um token válido.

## Autenticação Local De Desenvolvimento

Para acelerar os testes antes da VPS e do Supabase real, o script grava:

```txt
VITE_IMOBIFLOW_LOCAL_DEV_AUTH=true
VITE_IMOBIFLOW_LOCAL_DEV_TOKEN=<segredo-aleatorio-gerado-pelo-script>
IMOBIFLOW_LOCAL_DEV_AUTH=true
IMOBIFLOW_LOCAL_DEV_TOKEN=<mesmo-segredo-aleatorio-gerado-pelo-script>
IMOBIFLOW_LOCAL_DEV_COMPANY_ID=local-company
IMOBIFLOW_LOCAL_DEV_USER_ID=local-user
IMOBIFLOW_LOCAL_DEV_ROLE=owner
```

Esse acesso só funciona fora de produção e serve para testar banco, migrations, Website Builder, CRUD e APIs protegidas localmente. Em produção, o backend continua dependendo de autenticação real, empresa, assinatura ativa e permissões.

## Opções Úteis

Pular `npm install`:

```powershell
.\scripts\setup-imobiflow-local.ps1 -SkipInstall
```

Não iniciar backend/frontend automaticamente:

```powershell
.\scripts\setup-imobiflow-local.ps1 -SkipStart
```

## Não Faz Nesta Fase

- não usa Docker;
- não altera landing page;
- não aplica migration em produção;
- não configura VPS Hostinger;
- não configura Cloudinary real;
- não implementa editor visual completo;
- não implementa Effects Gallery.
