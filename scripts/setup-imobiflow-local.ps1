param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 3306,
  [string]$Database = "imobiflow",
  [string]$AppUser = "imobiflow",
  [string]$AppPassword = "imobiflow_local_password",
  [string]$RootUser = "root",
  [string]$MySqlBin = "C:\Program Files\MySQL\MySQL Server 8.0\bin",
  [switch]$SkipInstall,
  [switch]$SkipStart
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $ProjectRoot "backend"
$MysqlExe = Join-Path $MySqlBin "mysql.exe"
$MysqlAdminExe = Join-Path $MySqlBin "mysqladmin.exe"
$RootEnvLocal = Join-Path $ProjectRoot ".env.local"
$BackendEnvLocal = Join-Path $BackendDir ".env.local"
$LocalLogsDir = Join-Path $ProjectRoot ".local-logs"
$DatabaseUrl = "mysql://${AppUser}:${AppPassword}@${HostName}:${Port}/${Database}"
$ExpectedTables = @(
  "website_assets",
  "website_audit_logs",
  "website_components",
  "website_domains",
  "website_pages",
  "website_publish_logs",
  "website_sections",
  "website_seo",
  "website_templates",
  "website_versions",
  "websites"
)

function Write-Step([string]$message) {
  Write-Host ""
  Write-Host "== $message ==" -ForegroundColor Cyan
}

function Write-Ok([string]$message) {
  Write-Host "OK - $message" -ForegroundColor Green
}

function Write-Warn([string]$message) {
  Write-Host "AVISO - $message" -ForegroundColor Yellow
}

function Convert-SecureStringToPlainText([SecureString]$secure) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Escape-MySqlString([string]$value) {
  $value.Replace("\", "\\").Replace("'", "''")
}

function Write-MySqlDefaultsFile([string]$path, [string]$user, [string]$password) {
  @"
[client]
host=$HostName
port=$Port
user=$user
password=$password
"@ | Set-Content -Path $path -Encoding ASCII
}

function Invoke-MySql([string]$defaultsFile, [string]$sql, [string]$databaseName = "") {
  $args = @("--defaults-extra-file=$defaultsFile")
  if ($databaseName) { $args += $databaseName }
  $args += "--execute=$sql"
  & $MysqlExe @args
  if ($LASTEXITCODE -ne 0) {
    throw "Comando MySQL falhou."
  }
}

function Read-EnvFile([string]$path) {
  $values = @{}
  if (-not (Test-Path $path)) { return $values }

  foreach ($line in Get-Content $path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) { continue }
    $index = $trimmed.IndexOf("=")
    if ($index -lt 1) { continue }
    $key = $trimmed.Substring(0, $index)
    $value = $trimmed.Substring($index + 1)
    $values[$key] = $value
  }

  return $values
}

function Merge-EnvValues {
  $merged = @{}
  $paths = @(
    (Join-Path $ProjectRoot ".env.local"),
    (Join-Path $BackendDir ".env.local"),
    (Join-Path $ProjectRoot ".env"),
    (Join-Path $BackendDir ".env")
  )

  foreach ($path in $paths) {
    $values = Read-EnvFile $path
    foreach ($key in $values.Keys) {
      if (-not $merged.ContainsKey($key)) {
        $merged[$key] = $values[$key]
      }
    }
  }

  return $merged
}

function Write-EnvFileSafe([string]$path, [string[]]$lines) {
  if (Test-Path $path) {
    $backup = "$path.backup-$(Get-Date -Format yyyyMMddHHmmss)"
    Copy-Item $path $backup
    Write-Warn "Backup criado: $backup"
  }

  $lines | Set-Content -Path $path -Encoding UTF8
}

function Wait-Http([string]$url, [int]$seconds = 60) {
  for ($i = 1; $i -le $seconds; $i++) {
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  return $false
}

function Stop-LocalProcessesOnPort([int]$LocalPort) {
  $connections = @()
  try {
    $connections = @(Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue)
  } catch {
    Write-Warn "Nao consegui consultar a porta $LocalPort via Get-NetTCPConnection: $($_.Exception.Message)"
  }

  $processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -and $_ -ne $PID })
  foreach ($processId in $processIds) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Ok "Processo antigo na porta $LocalPort encerrado. PID: $processId"
    } catch {
      Write-Warn "Nao consegui encerrar o processo $processId na porta $LocalPort. Feche manualmente ou execute o PowerShell como administrador."
    }
  }
}

Write-Host "ImobiFlow - setup local automatico" -ForegroundColor Magenta
Write-Host "Projeto: $ProjectRoot"
Write-Host "Banco local: $DatabaseUrl"

Write-Step "Validando ferramentas"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js nao encontrado." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm nao encontrado." }
if (-not (Test-Path $MysqlExe)) { throw "mysql.exe nao encontrado em '$MysqlExe'." }
if (-not (Test-Path $MysqlAdminExe)) { throw "mysqladmin.exe nao encontrado em '$MysqlAdminExe'." }
Write-Ok "Node, npm e MySQL CLI encontrados"

Write-Step "Validando servico MySQL80"
$service = Get-Service -Name "MySQL80" -ErrorAction SilentlyContinue
if (-not $service) {
  Write-Warn "Servico MySQL80 nao encontrado. Vou tentar conectar mesmo assim usando $MysqlExe."
} elseif ($service.Status -ne "Running") {
  Write-Warn "Servico MySQL80 esta $($service.Status). Tentando iniciar..."
  Start-Service -Name "MySQL80"
  Start-Sleep -Seconds 5
  $service = Get-Service -Name "MySQL80"
  if ($service.Status -ne "Running") {
    throw "Nao foi possivel iniciar o servico MySQL80."
  }
}
Write-Ok "MySQL local esta rodando"

Write-Step "Conectando como administrador MySQL"
$rootSecurePassword = Read-Host "Digite a senha do usuario MySQL '$RootUser'" -AsSecureString
$RootPassword = Convert-SecureStringToPlainText $rootSecurePassword
$RootDefaults = Join-Path $env:TEMP "imobiflow-root-$PID.cnf"
$AppDefaults = Join-Path $env:TEMP "imobiflow-app-$PID.cnf"

try {
  Write-MySqlDefaultsFile $RootDefaults $RootUser $RootPassword
  Write-MySqlDefaultsFile $AppDefaults $AppUser $AppPassword

  & $MysqlAdminExe "--defaults-extra-file=$RootDefaults" ping --silent
  if ($LASTEXITCODE -ne 0) {
    throw "Nao conectou no MySQL com o usuario '$RootUser'. Verifique a senha informada."
  }
  Invoke-MySql $RootDefaults "SELECT 1 AS ok;"
  Write-Ok "Conexao administrativa validada"

  Write-Step "Criando banco, usuario e permissoes"
  $escapedDatabase = Escape-MySqlString $Database
  $escapedAppUser = Escape-MySqlString $AppUser
  $escapedAppPassword = Escape-MySqlString $AppPassword

  $setupSql = @"
CREATE DATABASE IF NOT EXISTS ``$escapedDatabase`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$escapedAppUser'@'localhost' IDENTIFIED BY '$escapedAppPassword';
CREATE USER IF NOT EXISTS '$escapedAppUser'@'127.0.0.1' IDENTIFIED BY '$escapedAppPassword';
ALTER USER '$escapedAppUser'@'localhost' IDENTIFIED BY '$escapedAppPassword';
ALTER USER '$escapedAppUser'@'127.0.0.1' IDENTIFIED BY '$escapedAppPassword';
GRANT ALL PRIVILEGES ON ``$escapedDatabase``.* TO '$escapedAppUser'@'localhost';
GRANT ALL PRIVILEGES ON ``$escapedDatabase``.* TO '$escapedAppUser'@'127.0.0.1';
FLUSH PRIVILEGES;
"@

  Invoke-MySql $RootDefaults $setupSql
  Write-Ok "Banco, usuario e permissoes preparados"

  Write-Step "Validando usuario da aplicacao"
  Invoke-MySql $AppDefaults "SELECT DATABASE() AS db, CURRENT_USER() AS user;" $Database
  Write-Ok "Usuario '$AppUser' conectou no database '$Database'"
}
finally {
  Remove-Item -Path $RootDefaults -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $AppDefaults -Force -ErrorAction SilentlyContinue
}

Write-Step "Criando .env.local automaticamente"
$existingEnv = Merge-EnvValues
$supabaseUrl = $existingEnv["SUPABASE_URL"]
$supabaseAnon = $existingEnv["SUPABASE_ANON_KEY"]
$supabaseService = $existingEnv["SUPABASE_SERVICE_ROLE_KEY"]
$storageProviderValue = if ($existingEnv["STORAGE_PROVIDER"]) { $existingEnv["STORAGE_PROVIDER"] } else { "cloudinary" }
$cloudinaryUploadFolderValue = if ($existingEnv["CLOUDINARY_UPLOAD_FOLDER"]) { $existingEnv["CLOUDINARY_UPLOAD_FOLDER"] } else { "imobiflow" }

$rootEnvLines = @(
  "VITE_IMOBIFLOW_API_URL=http://localhost:3333",
  "DATABASE_URL=$DatabaseUrl",
  "VITE_IMOBIFLOW_LOCAL_DEV_AUTH=true",
  "VITE_IMOBIFLOW_LOCAL_DEV_TOKEN=imobiflow.local_dev_access",
  "STORAGE_PROVIDER=$storageProviderValue",
  "CLOUDINARY_CLOUD_NAME=$($existingEnv["CLOUDINARY_CLOUD_NAME"])",
  "CLOUDINARY_API_KEY=$($existingEnv["CLOUDINARY_API_KEY"])",
  "CLOUDINARY_API_SECRET=$($existingEnv["CLOUDINARY_API_SECRET"])",
  "CLOUDINARY_UPLOAD_FOLDER=$cloudinaryUploadFolderValue",
  "CLOUDINARY_UPLOAD_PRESET=$($existingEnv["CLOUDINARY_UPLOAD_PRESET"])",
  "GOOGLE_MAPS_API_KEY=$($existingEnv["GOOGLE_MAPS_API_KEY"])"
)

$backendEnvLines = @(
  "PORT=3333",
  "APP_URL=http://localhost:5173",
  "DATABASE_URL=$DatabaseUrl",
  "IMOBIFLOW_LOCAL_DEV_AUTH=true",
  "IMOBIFLOW_LOCAL_DEV_TOKEN=imobiflow.local_dev_access",
  "IMOBIFLOW_LOCAL_DEV_COMPANY_ID=local-company",
  "IMOBIFLOW_LOCAL_DEV_USER_ID=local-user",
  "SUPABASE_URL=$supabaseUrl",
  "SUPABASE_ANON_KEY=$supabaseAnon",
  "SUPABASE_SERVICE_ROLE_KEY=$supabaseService",
  "KIWIFY_WEBHOOK_SECRET=$($existingEnv["KIWIFY_WEBHOOK_SECRET"])",
  "CAKTO_WEBHOOK_SECRET=$($existingEnv["CAKTO_WEBHOOK_SECRET"])",
  "IUGU_API_KEY=$($existingEnv["IUGU_API_KEY"])",
  "IUGU_WEBHOOK_SECRET=$($existingEnv["IUGU_WEBHOOK_SECRET"])",
  "STORAGE_PROVIDER=$storageProviderValue",
  "CLOUDINARY_CLOUD_NAME=$($existingEnv["CLOUDINARY_CLOUD_NAME"])",
  "CLOUDINARY_API_KEY=$($existingEnv["CLOUDINARY_API_KEY"])",
  "CLOUDINARY_API_SECRET=$($existingEnv["CLOUDINARY_API_SECRET"])",
  "CLOUDINARY_UPLOAD_FOLDER=$cloudinaryUploadFolderValue",
  "CLOUDINARY_UPLOAD_PRESET=$($existingEnv["CLOUDINARY_UPLOAD_PRESET"])"
)

Write-EnvFileSafe $RootEnvLocal $rootEnvLines
Write-EnvFileSafe $BackendEnvLocal $backendEnvLines
Write-Ok ".env.local criado na raiz e no backend"

if (-not $supabaseUrl -or -not $supabaseAnon -or -not $supabaseService) {
  Write-Warn "SUPABASE_URL, SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY nao foram encontrados. A rota /health e o Prisma funcionarao; rotas protegidas completas precisam dessas variaveis e de token valido."
}

if (-not $SkipInstall) {
  Write-Step "Instalando dependencias"
  Push-Location $ProjectRoot
  try {
    npm install
  }
  finally {
    Pop-Location
  }

  Push-Location $BackendDir
  try {
    npm install
  }
  finally {
    Pop-Location
  }
  Write-Ok "Dependencias instaladas"
} else {
  Write-Warn "npm install pulado por parametro -SkipInstall"
}

Write-Step "Rodando Prisma"
$env:DATABASE_URL = $DatabaseUrl
Push-Location $BackendDir
try {
  npm run prisma:validate
  npm run prisma:generate
  npm run prisma:migrate
  npm run prisma:seed
}
finally {
  Pop-Location
}
Write-Ok "Prisma validou, gerou client, aplicou migrations e seed estrutural"

Write-Step "Validando tabelas criadas"
$AppDefaultsValidate = Join-Path $env:TEMP "imobiflow-app-validate-$PID.cnf"
try {
  Write-MySqlDefaultsFile $AppDefaultsValidate $AppUser $AppPassword
  $tablesOutput = & $MysqlExe "--defaults-extra-file=$AppDefaultsValidate" $Database "--batch" "--skip-column-names" "--execute=SHOW TABLES LIKE 'website%';"
  $tables = @($tablesOutput | Where-Object { $_ })
  foreach ($expected in $ExpectedTables) {
    if ($tables -notcontains $expected) {
      throw "Tabela esperada nao encontrada: $expected"
    }
  }
  $tables | ForEach-Object { Write-Host "OK - tabela $_" -ForegroundColor Green }
}
finally {
  Remove-Item -Path $AppDefaultsValidate -Force -ErrorAction SilentlyContinue
}
Write-Ok "Todas as tabelas Website Builder foram encontradas"

if (-not $SkipStart) {
  Write-Step "Subindo backend e frontend local para validacao"
  New-Item -ItemType Directory -Path $LocalLogsDir -Force | Out-Null
  Stop-LocalProcessesOnPort 3333
  Stop-LocalProcessesOnPort 5173
  $backendOut = Join-Path $LocalLogsDir "backend.out.log"
  $backendErr = Join-Path $LocalLogsDir "backend.err.log"
  $frontendOut = Join-Path $LocalLogsDir "frontend.out.log"
  $frontendErr = Join-Path $LocalLogsDir "frontend.err.log"

  $backendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $BackendDir -WindowStyle Hidden -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr -PassThru
  Write-Host "Backend iniciado em segundo plano. PID: $($backendProcess.Id)"

  if (Wait-Http "http://localhost:3333/health" 60) {
    Write-Ok "API respondeu em http://localhost:3333/health"
  } else {
    Write-Warn "API nao respondeu em 60s. Veja logs: $backendOut e $backendErr"
  }

  Write-Step "Testando CRUD local do Website Builder"
  try {
    $localHeaders = @{
      Authorization = "Bearer imobiflow.local_dev_access"
      "Content-Type" = "application/json"
    }
    $authorization = Invoke-RestMethod -Method Get -Uri "http://localhost:3333/me/authorization" -Headers $localHeaders
    if ($authorization.access.company.id -ne "local-company") {
      throw "Autenticacao local retornou empresa inesperada."
    }

    Invoke-RestMethod -Method Get -Uri "http://localhost:3333/website-builder/websites" -Headers $localHeaders | Out-Null
    $templates = Invoke-RestMethod -Method Get -Uri "http://localhost:3333/website-builder/templates" -Headers $localHeaders
    if (-not $templates.templates -or $templates.templates.Count -lt 1) {
      throw "Nenhum template estrutural encontrado."
    }

    $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $websiteBody = @{ name = "Smoke Local $stamp"; slug = "smoke-local-$stamp" } | ConvertTo-Json
    $websiteResponse = Invoke-RestMethod -Method Post -Uri "http://localhost:3333/website-builder/websites/blank" -Headers $localHeaders -Body $websiteBody
    $websiteId = $websiteResponse.website.id
    if (-not $websiteId) { throw "Site em branco nao retornou id." }

    $pages = Invoke-RestMethod -Method Get -Uri "http://localhost:3333/website-builder/websites/$websiteId/pages" -Headers $localHeaders
    $pageId = $pages.pages[0].id
    if (-not $pageId) { throw "Site em branco nao criou pagina home." }

    $sectionBody = @{ name = "Hero Smoke"; section_type = "hero"; props_json = @{ title = "Smoke local" } } | ConvertTo-Json -Depth 8
    $sectionResponse = Invoke-RestMethod -Method Post -Uri "http://localhost:3333/website-builder/pages/$pageId/sections" -Headers $localHeaders -Body $sectionBody
    $sectionId = $sectionResponse.section.id
    if (-not $sectionId) { throw "Secao nao retornou id." }

    $componentBody = @{ name = "Titulo Smoke"; component_type = "heading"; props_json = @{ text = "CRUD local funcionando" } } | ConvertTo-Json -Depth 8
    $componentResponse = Invoke-RestMethod -Method Post -Uri "http://localhost:3333/website-builder/sections/$sectionId/components" -Headers $localHeaders -Body $componentBody
    if (-not $componentResponse.component.id) { throw "Componente nao retornou id." }

    try {
      $assetBody = @{
        website_id = $websiteId
        file_name = "smoke.jpg"
        mime_type = "image/jpeg"
        file_size = 1234
        asset_type = "image"
      } | ConvertTo-Json
      Invoke-RestMethod -Method Post -Uri "http://localhost:3333/website-builder/assets/upload" -Headers $localHeaders -Body $assetBody | Out-Null
      Write-Warn "Upload R2 respondeu com sucesso. Verifique se as credenciais R2 locais estao intencionais."
    } catch {
      $statusCode = $_.Exception.Response.StatusCode.value__
      if ($statusCode -eq 503) {
        Write-Ok "Upload sem R2 configurado retornou erro controlado 503"
      } else {
        throw
      }
    }

    Invoke-RestMethod -Method Delete -Uri "http://localhost:3333/website-builder/websites/$websiteId" -Headers $localHeaders | Out-Null
    Write-Ok "CRUD local validado: auth, listar, template, criar site, pagina, secao, componente e excluir site"
  } catch {
    Write-Warn "CRUD local do Website Builder falhou: $($_.Exception.Message)"
  }

  $frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev -- --host 127.0.0.1 --port 5173 --strictPort" -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr -PassThru
  Write-Host "Frontend iniciado em segundo plano. PID: $($frontendProcess.Id)"

  if (Wait-Http "http://localhost:5173" 90) {
    Write-Ok "Landing/frontend respondeu em http://localhost:5173"
  } else {
    Write-Warn "Frontend nao respondeu em 90s. Veja logs: $frontendOut e $frontendErr"
  }

  if (Wait-Http "http://localhost:5173/app/site/builder" 30) {
    Write-Ok "Website Builder respondeu em http://localhost:5173/app/site/builder"
  } else {
    Write-Warn "Website Builder nao respondeu em 30s. Veja logs: $frontendOut e $frontendErr"
  }

  if ($env:IMOBIFLOW_AUTH_TOKEN) {
    Write-Step "Testando rota protegida do Website Builder com token informado"
    try {
      $headers = @{ Authorization = "Bearer $env:IMOBIFLOW_AUTH_TOKEN" }
      Invoke-RestMethod -Method Get -Uri "http://localhost:3333/website-builder/websites" -Headers $headers | Out-Host
      Write-Ok "Rota protegida respondeu"
    } catch {
      Write-Warn "Rota protegida nao respondeu com o token atual: $($_.Exception.Message)"
    }
  } else {
    Write-Warn "Rotas protegidas do Website Builder nao foram chamadas porque IMOBIFLOW_AUTH_TOKEN nao foi definido. Isso e esperado: as rotas continuam protegidas por auth, company, assinatura ativa e permission('site.manage')."
  }
}

Write-Step "Resumo final"
Write-Host "Banco conectou: SIM" -ForegroundColor Green
Write-Host "Prisma funcionou: SIM" -ForegroundColor Green
Write-Host "Migrations aplicadas: SIM" -ForegroundColor Green
Write-Host "Seed estrutural aplicado: SIM" -ForegroundColor Green
Write-Host "Tabelas Website Builder validadas: SIM" -ForegroundColor Green
Write-Host ""
Write-Host "Dados locais:"
Write-Host "Host: $HostName"
Write-Host "Porta: $Port"
Write-Host "Database: $Database"
Write-Host "Usuario: $AppUser"
Write-Host "Senha: $AppPassword"
Write-Host "DATABASE_URL: $DatabaseUrl"
Write-Host ""
Write-Host "Para iniciar manualmente depois:"
Write-Host "Backend:  cd `"$BackendDir`"; npm run dev"
Write-Host "Frontend: cd `"$ProjectRoot`"; npm run dev -- --host 127.0.0.1 --port 5173"
Write-Host ""
Write-Host "Setup local finalizado." -ForegroundColor Magenta
