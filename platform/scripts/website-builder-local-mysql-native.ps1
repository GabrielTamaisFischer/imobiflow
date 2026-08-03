param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 3306,
  [string]$Database = "imobiflow",
  [string]$AppUser = "imobiflow",
  [string]$AppPassword = "imobiflow_local_password",
  [string]$RootUser = "root",
  [string]$MySqlBin = "C:\Program Files\MySQL\MySQL Server 8.0\bin"
)

$ErrorActionPreference = "Stop"

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

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $ProjectRoot "backend"
$MysqlExe = Join-Path $MySqlBin "mysql.exe"
$MysqlAdminExe = Join-Path $MySqlBin "mysqladmin.exe"
$DatabaseUrl = "mysql://${AppUser}:${AppPassword}@${HostName}:${Port}/${Database}"

Write-Host "== ImobiFlow Website Builder: MySQL nativo Windows ==" -ForegroundColor Cyan

if (-not (Test-Path $MysqlExe)) {
  throw "mysql.exe nao encontrado em '$MysqlExe'. Ajuste -MySqlBin para a pasta bin do MySQL Server."
}

if (-not (Test-Path $MysqlAdminExe)) {
  throw "mysqladmin.exe nao encontrado em '$MysqlAdminExe'. Ajuste -MySqlBin para a pasta bin do MySQL Server."
}

$rootSecurePassword = Read-Host "Digite a senha do usuario MySQL '$RootUser'" -AsSecureString
$RootPassword = Convert-SecureStringToPlainText $rootSecurePassword

Write-Host "Testando conexao MySQL..."
& $MysqlAdminExe "--host=$HostName" "--port=$Port" "--user=$RootUser" "--password=$RootPassword" ping --silent
if ($LASTEXITCODE -ne 0) {
  throw "Nao foi possivel conectar no MySQL. Verifique se o servico MySQL80 esta rodando e se a senha esta correta."
}

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

$tempSql = Join-Path $env:TEMP "imobiflow-mysql-setup.sql"
$setupSql | Set-Content -Path $tempSql -Encoding UTF8

Write-Host "Criando database e usuario local..."
& $MysqlExe "--host=$HostName" "--port=$Port" "--user=$RootUser" "--password=$RootPassword" "--execute=source $tempSql"
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao criar database/usuario no MySQL."
}

Remove-Item -Path $tempSql -Force -ErrorAction SilentlyContinue

Write-Host "Validando usuario da aplicacao..."
& $MysqlAdminExe "--host=$HostName" "--port=$Port" "--user=$AppUser" "--password=$AppPassword" ping --silent
if ($LASTEXITCODE -ne 0) {
  throw "Usuario '$AppUser' nao conseguiu conectar. Verifique permissoes no MySQL."
}

$env:DATABASE_URL = $DatabaseUrl

Push-Location $BackendDir
try {
  Write-Host "Gerando Prisma Client..."
  & npm run prisma:generate

  Write-Host "Aplicando migrations Prisma no MySQL local..."
  & npm run prisma:migrate

  Write-Host "Aplicando seed estrutural sem dados ficticios de producao..."
  & npm run prisma:seed
}
finally {
  Pop-Location
}

Write-Host "Validando tabelas website_*..."
& $MysqlExe "--host=$HostName" "--port=$Port" "--user=$AppUser" "--password=$AppPassword" $Database "--execute=SHOW TABLES LIKE 'website%';"

Write-Host ""
Write-Host "MySQL local pronto para o Website Builder." -ForegroundColor Green
Write-Host "Host: $HostName"
Write-Host "Porta: $Port"
Write-Host "Database: $Database"
Write-Host "Usuario: $AppUser"
Write-Host "Senha: $AppPassword"
Write-Host "DATABASE_URL: $DatabaseUrl"
