$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
Write-Host "Le mode mobile utilise maintenant automatiquement HTTPS pour Google, le micro et la camera." -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "LANCER_GLOBELINK_APPELS_HTTPS.ps1")
exit $LASTEXITCODE
