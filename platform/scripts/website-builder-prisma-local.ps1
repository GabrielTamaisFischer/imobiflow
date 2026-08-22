param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 3306,
  [string]$Database = "imobiflow",
  [string]$AppUser = "imobiflow",
  [string]$AppPassword = "imobiflow_local_password",
  [string]$MySqlBin = "C:\Program Files\MySQL\MySQL Server 8.0\bin"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $ProjectRoot "backend"
$MysqlExe = Join-Path $MySqlBin "mysql.exe"
$DatabaseUrl = "mysql://${AppUser}:${AppPassword}@${HostName}:${Port}/${Database}"

if (-not (Test-Path $MysqlExe)) {
  throw "mysql.exe nao encontrado em '$MysqlExe'. Ajuste -MySqlBin."
}

Write-Host "== Website Builder Prisma Local ==" -ForegroundColor Cyan
Write-Host "DATABASE_URL=$DatabaseUrl"

Write-Host "Testando usuario da aplicacao..."
& $MysqlExe "--host=$HostName" "--port=$Port" "--user=$AppUser" "--password=$AppPassword" $Database "--execute=SELECT DATABASE() AS db, CURRENT_USER() AS user;"
if ($LASTEXITCODE -ne 0) {
  throw "Nao foi possivel conectar com usuario '$AppUser'. Crie o banco/usuario pelo Workbench antes de rodar este script."
}

$env:DATABASE_URL = $DatabaseUrl

Push-Location $BackendDir
try {
  Write-Host "Validando schema Prisma..."
  & npm run prisma:validate

  Write-Host "Gerando Prisma Client..."
  & npm run prisma:generate

  Write-Host "Aplicando migrations..."
  & npm run prisma:migrate

  Write-Host "Aplicando seed estrutural..."
  & npm run prisma:seed
}
finally {
  Pop-Location
}

Write-Host "Validando tabelas website_*..."
& $MysqlExe "--host=$HostName" "--port=$Port" "--user=$AppUser" "--password=$AppPassword" $Database "--execute=SHOW TABLES LIKE 'website%';"

Write-Host "Prisma local finalizado." -ForegroundColor Green
