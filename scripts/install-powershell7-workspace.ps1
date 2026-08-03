$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$InstallDir = Join-Path $ProjectRoot ".tools\powershell7"
$DownloadDir = Join-Path $ProjectRoot ".tools\downloads"

Write-Host "== PowerShell 7 local do projeto ==" -ForegroundColor Cyan

$apiUrl = "https://api.github.com/repos/PowerShell/PowerShell/releases/latest"
$release = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "ImobiFlow-Setup" }
$asset = $release.assets |
  Where-Object { $_.name -match '^PowerShell-[0-9].*-win-x64\.zip$' } |
  Select-Object -First 1

if (-not $asset) {
  throw "Nao encontrei o ZIP x64 da ultima versao do PowerShell no GitHub."
}

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
New-Item -ItemType Directory -Path $DownloadDir -Force | Out-Null

$zipPath = Join-Path $DownloadDir $asset.name

Write-Host "Ultima versao: $($release.tag_name)"
Write-Host "Baixando: $($asset.name)"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -Headers @{ "User-Agent" = "ImobiFlow-Setup" }

Write-Host "Extraindo para $InstallDir"
Expand-Archive -Path $zipPath -DestinationPath $InstallDir -Force

$pwsh = Join-Path $InstallDir "pwsh.exe"
Write-Host "PowerShell 7 local pronto:" -ForegroundColor Green
Write-Host $pwsh
& $pwsh -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion'
