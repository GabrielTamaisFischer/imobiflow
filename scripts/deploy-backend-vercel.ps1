param(
  [string]$AppUrl = "https://imobifloww-main.vercel.app",
  [string[]]$VercelTargets = @("production", "preview"),
  [switch]$SkipEnv,
  [switch]$SkipMigrations,
  [switch]$SkipDeploy,
  [switch]$SkipSmoke,
  [switch]$KeepQaData,
  [switch]$SkipConnectionValidation,
  [switch]$SkipSeed,
  [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

$SecretValues = New-Object System.Collections.Generic.List[string]
$IsWindowsPlatform = [System.Environment]::OSVersion.Platform -eq "Win32NT"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message"
}

function Write-Ok([string]$Message) {
  Write-Host "OK  $Message"
}

function Assert-File([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Arquivo obrigatorio ausente: $Path"
  }
}

function ConvertFrom-SecureStringPlain([securestring]$SecureValue) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Read-RequiredValue([string]$Name, [string]$Prompt, [switch]$Secret, [string]$Default = "") {
  if ($Secret) {
    $value = ConvertFrom-SecureStringPlain (Read-Host "$Prompt" -AsSecureString)
  } elseif ($Default) {
    $typed = Read-Host "$Prompt [$Default]"
    $value = if ([string]::IsNullOrWhiteSpace($typed)) { $Default } else { $typed }
  } else {
    $value = Read-Host "$Prompt"
  }

  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$Name e obrigatorio."
  }

  if ($Secret) {
    [void]$SecretValues.Add($value)
  }

  return $value.Trim()
}

function Read-OptionalSecret([string]$Prompt) {
  $value = ConvertFrom-SecureStringPlain (Read-Host "$Prompt" -AsSecureString)
  if ([string]::IsNullOrWhiteSpace($value)) {
    return ""
  }
  [void]$SecretValues.Add($value)
  return $value.Trim()
}

function New-RandomSecret {
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes)
}

function Mask-Secrets([string]$Text) {
  if ([string]::IsNullOrEmpty($Text)) {
    return ""
  }

  $safe = $Text
  foreach ($secret in $SecretValues) {
    if (-not [string]::IsNullOrEmpty($secret)) {
      $safe = $safe -replace [regex]::Escape($secret), "***"
    }
  }
  return $safe
}

function Quote-ProcessArgument([string]$Value) {
  if ($Value -notmatch '[\s"]') {
    return $Value
  }

  return '"' + ($Value -replace '"', '\"') + '"'
}

function Join-ProcessArguments([string[]]$Arguments) {
  return ($Arguments | ForEach-Object { Quote-ProcessArgument $_ }) -join " "
}

function New-ProcessStartInfo([string]$FileName, [string[]]$Arguments) {
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  if ($IsWindowsPlatform -and ($FileName -eq "npm" -or $FileName -eq "npx")) {
    $startInfo.FileName = "cmd.exe"
    $startInfo.Arguments = "/d /c " + (Join-ProcessArguments (@($FileName) + $Arguments))
  } else {
    $startInfo.FileName = $FileName
    $startInfo.Arguments = Join-ProcessArguments $Arguments
  }
  return $startInfo
}

function Invoke-CommandChecked([string]$FileName, [string[]]$Arguments, [hashtable]$ExtraEnv = @{}) {
  $envBackup = @{}
  foreach ($key in $ExtraEnv.Keys) {
    $envBackup[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
    [Environment]::SetEnvironmentVariable($key, [string]$ExtraEnv[$key], "Process")
  }

  try {
    & $FileName @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Comando falhou: $FileName $($Arguments -join ' ')"
    }
  } finally {
    foreach ($key in $ExtraEnv.Keys) {
      [Environment]::SetEnvironmentVariable($key, $envBackup[$key], "Process")
    }
  }
}

function Invoke-CommandCheckedMasked([string]$FileName, [string[]]$Arguments, [hashtable]$ExtraEnv = @{}, [string]$InputText = "") {
  $startInfo = New-ProcessStartInfo $FileName $Arguments
  foreach ($key in $ExtraEnv.Keys) {
    $startInfo.EnvironmentVariables[$key] = [string]$ExtraEnv[$key]
  }
  $startInfo.RedirectStandardInput = -not [string]::IsNullOrEmpty($InputText)
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.UseShellExecute = $false

  $process = [System.Diagnostics.Process]::Start($startInfo)
  if (-not [string]::IsNullOrEmpty($InputText)) {
    $process.StandardInput.WriteLine($InputText)
    $process.StandardInput.Close()
  }

  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  $combined = Mask-Secrets (($stdout + "`n" + $stderr).Trim())
  if (-not [string]::IsNullOrWhiteSpace($combined)) {
    Write-Host $combined
  }

  if ($process.ExitCode -ne 0) {
    throw "Comando falhou: $FileName $($Arguments -join ' ')"
  }
}

function Invoke-VercelWithInput([string[]]$Arguments, [string]$InputValue) {
  $startInfo = New-ProcessStartInfo "npx" (@("vercel") + $Arguments)
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.UseShellExecute = $false

  $process = [System.Diagnostics.Process]::Start($startInfo)
  $process.StandardInput.WriteLine($InputValue)
  $process.StandardInput.Close()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  $combined = Mask-Secrets (($stdout + "`n" + $stderr).Trim())
  if (-not [string]::IsNullOrWhiteSpace($combined)) {
    Write-Host $combined
  }

  if ($process.ExitCode -ne 0) {
    throw "Vercel CLI falhou: vercel $($Arguments -join ' ')"
  }
}

function Set-VercelEnvValue([string]$Name, [string]$Value, [bool]$Sensitive) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return
  }

  foreach ($target in $VercelTargets) {
    $arguments = @("env", "add", $Name, $target, "--force", "--yes")
    if ($Sensitive) {
      $arguments += "--sensitive"
    } else {
      $arguments += "--no-sensitive"
    }
    Write-Host "Configurando $Name em $target"
    Invoke-VercelWithInput $arguments $Value
  }
}

function Get-DeployUrl([string]$Output) {
  $matches = [regex]::Matches($Output, "https://[^\s]+")
  if ($matches.Count -eq 0) {
    return ""
  }
  return $matches[$matches.Count - 1].Value.Trim()
}

function Test-UrlHasQueryName([string]$Url, [string]$Name) {
  return [regex]::IsMatch($Url, "(^|[?&])$([regex]::Escape($Name))=", "IgnoreCase")
}

function Add-UrlQueryIfMissing([string]$Url, [string]$Name, [string]$Value) {
  if (Test-UrlHasQueryName $Url $Name) {
    return $Url
  }

  $separator = if ($Url.Contains("?")) { "&" } else { "?" }
  return "$Url$separator$Name=$([uri]::EscapeDataString($Value))"
}

function Normalize-DatabaseUrl([string]$RawUrl, [string]$Label) {
  $value = $RawUrl.Trim()
  try {
    $uri = [Uri]$value
  } catch {
    throw "$Label nao e uma URL valida."
  }

  if ($uri.Scheme -ne "mysql") {
    throw "$Label precisa comecar com mysql://."
  }

  if ($uri.Host -match "\.railway\.internal$") {
    throw "$Label aponta para a rede interna do Railway. Use MYSQL_PUBLIC_URL, nunca MYSQL_URL."
  }

  if ($uri.Host -match "\.proxy\.rlwy\.net$") {
    Write-Ok "$Label reconhecida como Railway MYSQL_PUBLIC_URL publica"
  }

  if ($uri.UserInfo -match "^root:") {
    Write-Host "AVISO $Label usa usuario root. Aceito para esta etapa Railway, mas depois crie um usuario de aplicacao com privilegios minimos."
  }

  $normalized = $value
  $normalized = Add-UrlQueryIfMissing $normalized "connection_limit" "1"
  $normalized = Add-UrlQueryIfMissing $normalized "connect_timeout" "15"

  if (-not (Test-UrlHasQueryName $normalized "sslaccept") -and -not (Test-UrlHasQueryName $normalized "sslcert")) {
    $normalized = Add-UrlQueryIfMissing $normalized "sslaccept" "accept_invalid_certs"
  }

  if ($normalized -ne $value) {
    [void]$SecretValues.Add($normalized)
    Write-Ok "$Label normalizada com connection_limit=1, connect_timeout=15 e SSL quando ausente"
  }

  return $normalized
}

function Invoke-DatabaseConnectionValidation([string]$DatabaseUrl) {
  Invoke-CommandCheckedMasked "npx" @("prisma", "db", "execute", "--schema", "prisma/schema.prisma", "--stdin") @{
    "DATABASE_URL" = $DatabaseUrl
    "PRISMA_MIGRATE_DATABASE_URL" = $DatabaseUrl
  } "SELECT 1;"
}

Write-Step "Validando estrutura serverless"
Assert-File "api/[...path].ts"
Assert-File "backend/src/app.ts"
Assert-File "backend/src/server.ts"
Assert-File "prisma/schema.prisma"
Assert-File "prisma/seed.ts"
Assert-File "vercel.json"
Write-Ok "Arquivos esperados encontrados"

$serverSource = Get-Content -LiteralPath "backend/src/server.ts" -Raw
$apiSource = Get-Content -LiteralPath "api/[...path].ts" -Raw
if ($serverSource -notmatch "app\.listen") {
  throw "backend/src/server.ts deveria conter apenas o servidor local com app.listen."
}
if ($apiSource -match "app\.listen") {
  throw "A Function api/[...path].ts nao pode chamar app.listen."
}
Write-Ok "Entrada /api usa createApp sem servidor permanente"

if ($ValidateOnly) {
  Write-Step "Concluido"
  Write-Host "Validacao da estrutura serverless concluida."
  exit 0
}

Write-Step "Coletando configuracao de producao"
$AppUrl = Read-RequiredValue "APP_URL" "URL publica da Vercel para frontend/backend" -Default $AppUrl
if ($AppUrl -notmatch "^https://") {
  throw "APP_URL precisa ser HTTPS."
}
$AppUrl = $AppUrl.TrimEnd("/")

$databaseUrl = Read-RequiredValue "DATABASE_URL" "Cole a DATABASE_URL do MySQL online" -Secret
$databaseUrl = Normalize-DatabaseUrl $databaseUrl "DATABASE_URL"

$migrationDatabaseUrlInput = Read-OptionalSecret "PRISMA_MIGRATE_DATABASE_URL opcional para migrations (Enter para reutilizar DATABASE_URL)"
if ([string]::IsNullOrWhiteSpace($migrationDatabaseUrlInput)) {
  $migrationDatabaseUrl = $databaseUrl
} else {
  $migrationDatabaseUrl = Normalize-DatabaseUrl $migrationDatabaseUrlInput "PRISMA_MIGRATE_DATABASE_URL"
}

$bootstrapEmail = Read-RequiredValue "IMOBIFLOW_BOOTSTRAP_EMAIL" "E-mail administrador inicial"
$bootstrapPassword = Read-RequiredValue "IMOBIFLOW_BOOTSTRAP_PASSWORD" "Senha administrador inicial" -Secret
$jwtSecret = Read-OptionalSecret "JWT_SECRET (pressione Enter para gerar automaticamente)"
if ([string]::IsNullOrWhiteSpace($jwtSecret)) {
  $jwtSecret = New-RandomSecret
  [void]$SecretValues.Add($jwtSecret)
  Write-Ok "JWT_SECRET gerado automaticamente"
}

$configureCloudinary = Read-Host "Configurar Cloudinary agora? (S/n)"
$storageProvider = "cloudinary"
$cloudinaryCloudName = ""
$cloudinaryApiKey = ""
$cloudinaryApiSecret = ""
$cloudinaryUploadFolder = "imobiflow"
$cloudinaryUploadPreset = ""
if ($configureCloudinary -notmatch "^(n|N)") {
  $cloudinaryCloudName = Read-RequiredValue "CLOUDINARY_CLOUD_NAME" "Cloudinary Cloud Name"
  $cloudinaryApiKey = Read-RequiredValue "CLOUDINARY_API_KEY" "Cloudinary API Key" -Secret
  $cloudinaryApiSecret = Read-RequiredValue "CLOUDINARY_API_SECRET" "Cloudinary API Secret" -Secret
  $cloudinaryUploadFolder = Read-RequiredValue "CLOUDINARY_UPLOAD_FOLDER" "Cloudinary Upload Folder" -Default "imobiflow"
  $cloudinaryUploadPreset = Read-OptionalSecret "CLOUDINARY_UPLOAD_PRESET opcional (Enter para nao usar)"
}

if (-not $SkipEnv) {
  Write-Step "Linkando projeto Vercel se necessario"
  if (-not (Test-Path -LiteralPath ".vercel/project.json")) {
    Write-Host "A CLI da Vercel vai perguntar qual projeto usar. Selecione o projeto ja publicado do ImobiFlow."
    Invoke-CommandChecked "npx" @("vercel", "link")
  } else {
    Write-Ok "Projeto Vercel ja linkado localmente"
  }

  Write-Step "Gravando variaveis na Vercel"
  Set-VercelEnvValue "APP_URL" $AppUrl $false
  Set-VercelEnvValue "FRONTEND_URL" $AppUrl $false
  Set-VercelEnvValue "CORS_ORIGIN" $AppUrl $false
  Set-VercelEnvValue "DATABASE_URL" $databaseUrl $true
  Set-VercelEnvValue "IMOBIFLOW_AUTH_PROVIDER" "mysql" $false
  Set-VercelEnvValue "IMOBIFLOW_BOOTSTRAP_EMAIL" $bootstrapEmail $false
  Set-VercelEnvValue "IMOBIFLOW_BOOTSTRAP_PASSWORD" $bootstrapPassword $true
  Set-VercelEnvValue "JWT_SECRET" $jwtSecret $true
  Set-VercelEnvValue "STORAGE_PROVIDER" $storageProvider $false
  Set-VercelEnvValue "CLOUDINARY_CLOUD_NAME" $cloudinaryCloudName $false
  Set-VercelEnvValue "CLOUDINARY_API_KEY" $cloudinaryApiKey $true
  Set-VercelEnvValue "CLOUDINARY_API_SECRET" $cloudinaryApiSecret $true
  Set-VercelEnvValue "CLOUDINARY_UPLOAD_FOLDER" $cloudinaryUploadFolder $false
  Set-VercelEnvValue "CLOUDINARY_UPLOAD_PRESET" $cloudinaryUploadPreset $true
  Write-Ok "Variaveis enviadas para a Vercel"
}

$migrationEnv = @{
  "DATABASE_URL" = $databaseUrl
  "PRISMA_MIGRATE_DATABASE_URL" = $migrationDatabaseUrl
  "IMOBIFLOW_AUTH_PROVIDER" = "mysql"
  "IMOBIFLOW_BOOTSTRAP_EMAIL" = $bootstrapEmail
  "IMOBIFLOW_BOOTSTRAP_PASSWORD" = $bootstrapPassword
  "JWT_SECRET" = $jwtSecret
}

if (-not $SkipConnectionValidation) {
  Write-Step "Validando conexao MySQL sem expor credenciais"
  Invoke-DatabaseConnectionValidation $migrationDatabaseUrl
  Write-Ok "Conexao MySQL validada"
}

if (-not $SkipMigrations) {
  Write-Step "Rodando Prisma generate e migrations"
  Invoke-CommandCheckedMasked "npm" @("run", "prisma:generate") $migrationEnv
  Invoke-CommandCheckedMasked "npm" @("run", "prisma:migrate") $migrationEnv
  Write-Ok "Migrations aplicadas"

  if (-not $SkipSeed) {
    Write-Step "Rodando seed estrutural controlado"
    Invoke-CommandCheckedMasked "npm" @("run", "prisma:seed") $migrationEnv
    Write-Ok "Seed estrutural aplicado"
  } else {
    Write-Host "Seed estrutural pulado por -SkipSeed."
  }
}

$deployUrl = ""
if (-not $SkipDeploy) {
  Write-Step "Gerando build local"
  Invoke-CommandChecked "npm" @("run", "build")

  Write-Step "Publicando frontend e backend na Vercel"
  $deployOutput = (& npx vercel deploy --prod --yes 2>&1 | Out-String)
  $safeDeployOutput = Mask-Secrets $deployOutput
  Write-Host $safeDeployOutput.Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Deploy Vercel falhou."
  }
  $deployUrl = Get-DeployUrl $deployOutput
  if ([string]::IsNullOrWhiteSpace($deployUrl)) {
    $deployUrl = $AppUrl
  }
  Write-Ok "Deploy publicado em $deployUrl"
}

if (-not $SkipSmoke) {
  Write-Step "Executando teste real QA contra producao"
  $smokeUrl = if ([string]::IsNullOrWhiteSpace($deployUrl)) { $AppUrl } else { $deployUrl }
  $smokeArgs = @("run", "production:qa-smoke", "--", "--api-url", $smokeUrl, "--email", $bootstrapEmail)
  if ($KeepQaData) {
    $smokeArgs += @("--keep-data", "true")
  }
  Invoke-CommandCheckedMasked "npm" $smokeArgs @{
    "IMOBIFLOW_BOOTSTRAP_PASSWORD" = $bootstrapPassword
  }
  Write-Ok "Smoke QA concluido"
}

Write-Step "Concluido"
Write-Host "Backend serverless: $AppUrl/api/health"
Write-Host "Frontend: $AppUrl"
