$ErrorActionPreference = "Stop"

Write-Host "== Instalador portatil do PowerShell 7 ==" -ForegroundColor Cyan

$apiUrl = "https://api.github.com/repos/PowerShell/PowerShell/releases/latest"
Write-Host "Consultando ultima versao estavel em $apiUrl"
$release = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "ImobiFlow-Setup" }

$asset = $release.assets |
  Where-Object { $_.name -match '^PowerShell-[0-9].*-win-x64\.zip$' } |
  Select-Object -First 1

if (-not $asset) {
  throw "Nao encontrei o ZIP x64 da ultima versao do PowerShell no GitHub."
}

$installDir = Join-Path $env:LOCALAPPDATA "Programs\PowerShell\7"
$downloadDir = Join-Path $env:TEMP "imobiflow-powershell-portable"
$zipPath = Join-Path $downloadDir $asset.name

Write-Host "Ultima versao: $($release.tag_name)"
Write-Host "Arquivo: $($asset.name)"

New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
New-Item -ItemType Directory -Path $installDir -Force | Out-Null

Write-Host "Baixando PowerShell portatil..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -Headers @{ "User-Agent" = "ImobiFlow-Setup" }

Write-Host "Extraindo para $installDir"
Expand-Archive -Path $zipPath -DestinationPath $installDir -Force

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (($userPath -split ";") -notcontains $installDir) {
  [Environment]::SetEnvironmentVariable("Path", "$installDir;$userPath", "User")
  Write-Host "PATH do usuario atualizado. Feche e abra o terminal para reconhecer 'pwsh'."
}

$pwsh = Join-Path $installDir "pwsh.exe"
Write-Host "PowerShell 7 portatil instalado em: $pwsh" -ForegroundColor Green
& $pwsh -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion'
