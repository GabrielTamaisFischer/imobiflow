$ErrorActionPreference = "Stop"

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Abra o PowerShell como Administrador e rode novamente."
  }
}

Assert-Admin

Write-Host "== Reparo Docker / WSL ==" -ForegroundColor Cyan

Write-Host "Habilitando WSL..."
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

Write-Host "Habilitando Virtual Machine Platform..."
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

Write-Host "Ativando hypervisor no boot..."
bcdedit /set hypervisorlaunchtype auto

Write-Host "Atualizando WSL..."
wsl --update
wsl --set-default-version 2
wsl --shutdown

Write-Host "Verificando winget..."
if (Get-Command winget -ErrorAction SilentlyContinue) {
  Write-Host "Instalando/atualizando PowerShell 7..."
  winget install --id Microsoft.PowerShell --source winget --accept-source-agreements --accept-package-agreements

  Write-Host "Instalando/atualizando Docker Desktop..."
  winget install --id Docker.DockerDesktop --source winget --accept-source-agreements --accept-package-agreements
} else {
  Write-Host "winget nao encontrado. Instale/atualize Docker Desktop manualmente em https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Reparo concluido. Reinicie o Windows agora." -ForegroundColor Green
Write-Host "Depois de reiniciar, abra o Docker Desktop e aguarde ele mostrar Engine running."
