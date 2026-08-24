$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$Script = Join-Path $PSScriptRoot "CONFIGURER_CODE_EMAIL.ps1"
if (-not (Test-Path -LiteralPath $Script)) {
  Write-Host "Le configurateur du code e-mail est introuvable." -ForegroundColor Red
  Read-Host "Appuie sur Entree pour fermer"
  exit 1
}
& $Script
