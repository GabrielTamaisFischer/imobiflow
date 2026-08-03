param(
  [string]$ApiUrl = "http://localhost:3333",
  [string]$AuthToken = $env:IMOBIFLOW_AUTH_TOKEN,
  [switch]$Cleanup
)

$ErrorActionPreference = "Stop"

if (-not $AuthToken) {
  throw "Defina IMOBIFLOW_AUTH_TOKEN com o token Bearer do usuario logado antes de testar rotas protegidas."
}

$Headers = @{
  Authorization = "Bearer $AuthToken"
}

Write-Host "== ImobiFlow Website Builder: smoke test local ==" -ForegroundColor Cyan

Write-Host "Testando /health..."
Invoke-RestMethod -Method Get -Uri "$ApiUrl/health" | Out-Host

Write-Host "Listando sites..."
Invoke-RestMethod -Method Get -Uri "$ApiUrl/website-builder/websites" -Headers $Headers | Out-Host

$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$body = @{
  name = "Teste Local Builder $timestamp"
  slug = "teste-local-builder-$timestamp"
} | ConvertTo-Json

Write-Host "Criando site em branco local..."
$created = Invoke-RestMethod -Method Post -Uri "$ApiUrl/website-builder/websites/blank" -Headers $Headers -ContentType "application/json" -Body $body
$created | Out-Host

$websiteId = $created.website.id

Write-Host "Listando paginas do site criado..."
Invoke-RestMethod -Method Get -Uri "$ApiUrl/website-builder/websites/$websiteId/pages" -Headers $Headers | Out-Host

Write-Host "Listando audit logs do site criado..."
Invoke-RestMethod -Method Get -Uri "$ApiUrl/website-builder/websites/$websiteId/audit-logs" -Headers $Headers | Out-Host

if ($Cleanup) {
  Write-Host "Arquivando site local criado para limpeza..."
  Invoke-RestMethod -Method Delete -Uri "$ApiUrl/website-builder/websites/$websiteId" -Headers $Headers | Out-Host
}

Write-Host "Smoke test finalizado." -ForegroundColor Green
