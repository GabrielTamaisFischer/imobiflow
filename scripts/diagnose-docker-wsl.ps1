$ErrorActionPreference = "Continue"

Write-Host "== Diagnostico Docker / WSL / Virtualizacao ==" -ForegroundColor Cyan
Write-Host ""

Write-Host "Windows:"
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsHardwareAbstractionLayer | Format-List

Write-Host "Virtualizacao visivel para o Windows:"
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 Name, VirtualizationFirmwareEnabled, SecondLevelAddressTranslationExtensions, VMMonitorModeExtensions
$cpu | Format-List

Write-Host "Recursos opcionais:"
$features = @(
  "Microsoft-Windows-Subsystem-Linux",
  "VirtualMachinePlatform",
  "Microsoft-Hyper-V-All"
)

foreach ($feature in $features) {
  try {
    Get-WindowsOptionalFeature -Online -FeatureName $feature | Select-Object FeatureName, State | Format-Table -AutoSize
  } catch {
    Write-Host "Nao foi possivel consultar $feature: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

Write-Host "Hypervisor launch type:"
cmd /c "bcdedit /enum {current} | findstr /i hypervisorlaunchtype"

Write-Host "WSL:"
wsl --status
wsl --list --verbose

Write-Host "Docker:"
where.exe docker
docker --version
docker compose version
docker context ls

Write-Host "Winget:"
where.exe winget
winget --version

Write-Host ""
Write-Host "Se VirtualizationFirmwareEnabled estiver False, ative Intel VT-x / AMD-V / SVM na BIOS/UEFI." -ForegroundColor Yellow
