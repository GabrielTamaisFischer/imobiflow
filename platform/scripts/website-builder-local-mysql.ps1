$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ComposeFile = Join-Path $ProjectRoot "docker-compose.mysql.yml"
$BackendDir = Join-Path $ProjectRoot "backend"
$DatabaseUrl = "mysql://imobiflow:imobiflow_local_password@127.0.0.1:3306/imobiflow"

Write-Host "== ImobiFlow Website Builder: MySQL local ==" -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker nao encontrado. Instale/abra o Docker Desktop e rode este script novamente."
}

Write-Host "Subindo MySQL local via Docker Compose..."
& docker compose -f $ComposeFile up -d

Write-Host "Aguardando MySQL responder..."
$ready = $false
for ($i = 1; $i -le 60; $i++) {
  & docker exec imobiflow-mysql mysqladmin ping -uimobiflow -pimobiflow_local_password --silent *> $null
  if ($LASTEXITCODE -eq 0) {
    $ready = $true
    break
  }

  Start-Sleep -Seconds 2
}

if (-not $ready) {
  throw "MySQL nao respondeu em ate 120s. Verifique se o Docker Desktop esta ativo."
}

Write-Host "MySQL pronto." -ForegroundColor Green
Write-Host "DATABASE_URL=$DatabaseUrl"

$env:DATABASE_URL = $DatabaseUrl

Push-Location $BackendDir
try {
  Write-Host "Gerando Prisma Client..."
  & npm run prisma:generate

  Write-Host "Aplicando migrations Prisma..."
  & npm run prisma:migrate

  Write-Host "Aplicando seed estrutural sem dados ficticios de producao..."
  & npm run prisma:seed
}
finally {
  Pop-Location
}

Write-Host "Validando tabelas website_* no MySQL..."
& docker exec imobiflow-mysql mysql -uimobiflow -pimobiflow_local_password imobiflow -e "SHOW TABLES LIKE 'website%';"

Write-Host ""
Write-Host "Conexao para MySQL Workbench:" -ForegroundColor Cyan
Write-Host "Host: 127.0.0.1"
Write-Host "Porta: 3306"
Write-Host "Database: imobiflow"
Write-Host "Usuario: imobiflow"
Write-Host "Senha: imobiflow_local_password"
Write-Host "DATABASE_URL: $DatabaseUrl"
