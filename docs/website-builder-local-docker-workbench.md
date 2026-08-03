# Website Builder - Teste Local Com Docker, MySQL Workbench e Prisma

Este guia valida o Website Builder localmente antes de qualquer VPS/produção.

## 1. Subir MySQL Local Com Docker

Na raiz do projeto:

```powershell
cd C:\Users\Acahadinhos\Documents\mozart2.0\NEXUS\imobifloww-main\imobifloww-main
docker compose -f docker-compose.mysql.yml up -d
```

Ou rode o script preparado:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\website-builder-local-mysql.ps1
```

O script sobe o MySQL, aguarda o banco responder, gera Prisma Client, aplica migrations, roda seed estrutural e lista as tabelas `website%`.

## 2. Dados De Conexão Local

```txt
Host: 127.0.0.1
Porta: 3306
Database: imobiflow
Usuário: imobiflow
Senha: imobiflow_local_password
DATABASE_URL: mysql://imobiflow:imobiflow_local_password@127.0.0.1:3306/imobiflow
```

## 3. Conectar No MySQL Workbench

1. Abra o MySQL Workbench.
2. Clique no botão `+` ao lado de `MySQL Connections`.
3. Preencha:
   - Connection Name: `ImobiFlow Local`
   - Connection Method: `Standard (TCP/IP)`
   - Hostname: `127.0.0.1`
   - Port: `3306`
   - Username: `imobiflow`
4. Clique em `Store in Vault...` e informe:
   - `imobiflow_local_password`
5. Clique em `Test Connection`.
6. Depois de conectar, abra o schema `imobiflow`.

Consulta para validar tabelas:

```sql
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

## 4. Aplicar Migrations Prisma Manualmente

Se preferir rodar sem script:

```powershell
cd C:\Users\Acahadinhos\Documents\mozart2.0\NEXUS\imobifloww-main\imobifloww-main\backend
$env:DATABASE_URL="mysql://imobiflow:imobiflow_local_password@127.0.0.1:3306/imobiflow"
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## 5. Rodar Backend Local

Em um terminal:

```powershell
cd C:\Users\Acahadinhos\Documents\mozart2.0\NEXUS\imobifloww-main\imobifloww-main\backend
$env:DATABASE_URL="mysql://imobiflow:imobiflow_local_password@127.0.0.1:3306/imobiflow"
npm run dev
```

Backend esperado:

```txt
http://localhost:3333
```

## 6. Testar Endpoints Protegidos Do Website Builder

As rotas do Website Builder exigem token real do usuário logado, empresa ativa, assinatura ativa e permissão `site.manage`.

Defina o token Bearer:

```powershell
$env:IMOBIFLOW_AUTH_TOKEN="COLE_AQUI_O_TOKEN_DO_USUARIO_LOGADO"
.\scripts\website-builder-local-api-smoke.ps1
```

O smoke test faz:

- `GET /health`
- `GET /website-builder/websites`
- `POST /website-builder/websites/blank`
- `GET /website-builder/websites/:id/pages`
- `GET /website-builder/websites/:id/audit-logs`

Para arquivar o site local criado ao final:

```powershell
.\scripts\website-builder-local-api-smoke.ps1 -Cleanup
```

## 7. Confirmar Landing Page Local

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

A landing page aprovada deve continuar carregando normalmente. O Website Builder fica isolado dentro da área interna.

## 8. Não Fazer Nesta Etapa

- Não aplicar migration em produção.
- Não configurar VPS Hostinger ainda.
- Não configurar R2 real ainda.
- Não implementar editor visual completo.
- Não mexer na landing page.
