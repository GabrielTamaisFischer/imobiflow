# Run this script as Administrator.
# It enables the Windows features required by WSL 2 and Docker Desktop.

$ErrorActionPreference = "Stop"

Write-Host "Enabling Windows Subsystem for Linux..." -ForegroundColor Cyan
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

Write-Host "Enabling Virtual Machine Platform..." -ForegroundColor Cyan
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

Write-Host ""
Write-Host "Done. Restart Windows before continuing with Docker Desktop installation." -ForegroundColor Green
Write-Host "After restarting, return to Codex and send: continue docker" -ForegroundColor Yellow
Pause
