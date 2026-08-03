$ErrorActionPreference = "Stop"

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Abra o PowerShell como Administrador e rode novamente."
  }
}

Assert-Admin

Write-Host "== Atualizador do PowerShell 7 ==" -ForegroundColor Cyan

$currentVersion = $null
if (Get-Command pwsh -ErrorAction SilentlyContinue) {
  try {
    $currentVersion = (& pwsh -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion.ToString()').Trim()
    Write-Host "PowerShell 7 atual encontrado: $currentVersion"
  } catch {
    Write-Host "Nao foi possivel ler a versao atual do pwsh."
  }
} else {
  Write-Host "PowerShell 7 ainda nao encontrado. Instalando..."
}

$apiUrl = "https://api.github.com/repos/PowerShell/PowerShell/releases/latest"
Write-Host "Consultando ultima versao estavel em $apiUrl"
$release = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "ImobiFlow-Setup" }

$asset = $release.assets |
  Where-Object { $_.name -match '^PowerShell-[0-9].*-win-x64\.msi$' } |
  Select-Object -First 1

if (-not $asset) {
  throw "Nao encontrei o MSI x64 da ultima versao do PowerShell no GitHub."
}

Write-Host "Ultima versao: $($release.tag_name)"
Write-Host "Arquivo: $($asset.name)"

$downloadDir = Join-Path $env:TEMP "imobiflow-powershell-update"
New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null

$msiPath = Join-Path $downloadDir $asset.name
Write-Host "Baixando instalador..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $msiPath -Headers @{ "User-Agent" = "ImobiFlow-Setup" }

Write-Host "Instalando PowerShell 7 em modo silencioso..."
$arguments = @(
  "/i",
  "`"$msiPath`"",
  "/quiet",
  "/norestart",
  "ADD_EXPLORER_CONTEXT_MENU_OPENPOWERSHELL=1",
  "REGISTER_MANIFEST=1",
  "USE_MU=1",
  "ENABLE_MU=1"
)

$process = Start-Process -FilePath "msiexec.exe" -ArgumentList $arguments -Wait -PassThru

if ($process.ExitCode -ne 0) {
  throw "Instalacao terminou com codigo $($process.ExitCode)."
}

Write-Host "PowerShell 7 instalado/atualizado com sucesso." -ForegroundColor Green
Write-Host "Feche este terminal e abra 'PowerShell 7 (x64)' ou rode: pwsh"

try {
  & "$env:ProgramFiles\PowerShell\7\pwsh.exe" -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion'
} catch {
  Write-Host "Instalacao concluida, mas reinicie o terminal para validar a versao."
}
