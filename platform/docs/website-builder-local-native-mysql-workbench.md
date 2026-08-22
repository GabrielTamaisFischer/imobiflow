# Website Builder - Validação Local Sem Docker

Docker não é obrigatório para esta fase. Ele era apenas uma forma prática de subir MySQL. Como o Windows já possui MySQL Server 8.0 rodando localmente, vamos usar o MySQL nativo.

## Status Detectado

```txt
MySQL Server: C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe
Versão: MySQL Community Server 8.0.44
Serviço Windows: MySQL80
Status: RUNNING
```

## Dados Do Banco Local

```txt
Host: 127.0.0.1
Porta: 3306
Database: imobiflow
Usuário: imobiflow
Senha: imobiflow_local_password
DATABASE_URL: mysql://imobiflow:imobiflow_local_password@127.0.0.1:3306/imobiflow
```

## Criar Banco, Usuário E Rodar Migrations

Abra PowerShell e rode:

```powershell
cd C:\Users\Acahadinhos\Documents\mozart2.0\NEXUS\imobifloww-main\imobifloww-main
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\website-builder-local-mysql-native.ps1
```

O script vai pedir a senha do usuário `root` do MySQL.

Ele executa:

1. testa conexão com MySQL local;
2. cria database `imobiflow`;
3. cria/atualiza usuário `imobiflow`;
4. aplica permissões;
5. define `DATABASE_URL`;
6. roda `npm run prisma:generate`;
7. roda `npm run prisma:migrate`;
8. roda `npm run prisma:seed`;
9. lista as tabelas `website%`.

## Caso Não Lembre A Senha Root

Abra o MySQL Workbench usando a conexão local que você já usa.

Rode este SQL com um usuário administrador:

```sql
CREATE DATABASE IF NOT EXISTS `imobiflow`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'imobiflow'@'localhost'
  IDENTIFIED BY 'imobiflow_local_password';

CREATE USER IF NOT EXISTS 'imobiflow'@'127.0.0.1'
  IDENTIFIED BY 'imobiflow_local_password';

ALTER USER 'imobiflow'@'localhost'
  IDENTIFIED BY 'imobiflow_local_password';

ALTER USER 'imobiflow'@'127.0.0.1'
  IDENTIFIED BY 'imobiflow_local_password';

GRANT ALL PRIVILEGES ON `imobiflow`.* TO 'imobiflow'@'localhost';
GRANT ALL PRIVILEGES ON `imobiflow`.* TO 'imobiflow'@'127.0.0.1';

FLUSH PRIVILEGES;
```

Depois rode só a parte Prisma:

```powershell
cd C:\Users\Acahadinhos\Documents\mozart2.0\NEXUS\imobifloww-main\imobifloww-main
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\website-builder-prisma-local.ps1
```

## Conectar No MySQL Workbench

Crie uma nova conexão:

```txt
Connection Name: ImobiFlow Local
Connection Method: Standard TCP/IP
Hostname: 127.0.0.1
Port: 3306
Username: imobiflow
Password: imobiflow_local_password
Default Schema: imobiflow
```

Clique em `Test Connection`.

## Validar Tabelas

No Workbench:

```sql
USE imobiflow;
SHOW TABLES LIKE 'website%';
```

Tabelas esperadas:

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

## Rodar Backend Local

```powershell
cd C:\Users\Acahadinhos\Documents\mozart2.0\NEXUS\imobifloww-main\imobifloww-main\backend
$env:DATABASE_URL="mysql://imobiflow:imobiflow_local_password@127.0.0.1:3306/imobiflow"
npm run dev
```

API esperada:

```txt
http://localhost:3333
```

## Rodar Frontend E Conferir Landing Page

Em outro terminal:

```powershell
cd C:\Users\Acahadinhos\Documents\mozart2.0\NEXUS\imobifloww-main\imobifloww-main
$env:VITE_IMOBIFLOW_API_URL="http://localhost:3333"
npm run dev
```

Abra:

```txt
http://localhost:5173
```

A landing page aprovada deve continuar funcionando.

## Testar Endpoints Do Website Builder

As rotas são protegidas por login real. Depois de abrir o sistema e logar, precisamos de um Bearer token do Supabase para rodar o smoke test.

Quando tiver o token:

```powershell
$env:IMOBIFLOW_AUTH_TOKEN="COLE_AQUI_O_TOKEN"
.\scripts\website-builder-local-api-smoke.ps1
```

Isso testa:

- `GET /health`
- `GET /website-builder/websites`
- `POST /website-builder/websites/blank`
- `GET /website-builder/websites/:id/pages`
- `GET /website-builder/websites/:id/audit-logs`

## Fora Desta Etapa

- Docker.
- VPS Hostinger.
- Cloudflare R2 real.
- Editor visual completo.
- Alterações na landing page.
