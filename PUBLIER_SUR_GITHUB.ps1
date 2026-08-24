$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

Write-Host ""
Write-Host "=== Publication de GlobeLink sur GitHub ===" -ForegroundColor Cyan
Write-Host "Depot : https://github.com/wassimvare/globelink" -ForegroundColor Gray
Write-Host ""

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git n'est pas installe sur ce PC." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        $answer = Read-Host "Installer Git automatiquement avec winget ? (O/N)"
        if ($answer -match '^[OoYy]') {
            winget install --id Git.Git -e --source winget
            Write-Host "Fermez puis relancez ce fichier apres l'installation de Git." -ForegroundColor Yellow
        }
    } else {
        Write-Host "Installez Git for Windows, puis relancez ce fichier." -ForegroundColor Yellow
    }
    Read-Host "Appuyez sur Entree pour fermer"
    exit 1
}

if (Test-Path ".env") {
    Write-Host "Le fichier .env reste local et ne sera pas envoye." -ForegroundColor Green
}

if (-not (Test-Path ".git")) {
    git init
}

git branch -M main

$existingOrigin = git remote 2>$null | Select-String '^origin$'
if ($existingOrigin) {
    git remote set-url origin "https://github.com/wassimvare/globelink.git"
} else {
    git remote add origin "https://github.com/wassimvare/globelink.git"
}

git add .

$hasIdentity = $true
try { git config user.name | Out-Null; if ($LASTEXITCODE -ne 0) { $hasIdentity = $false } } catch { $hasIdentity = $false }
if (-not $hasIdentity -or -not (git config user.name)) {
    git config user.name "Wassim Vare"
}
if (-not (git config user.email)) {
    git config user.email "varewassim7@gmail.com"
}

$changes = git status --porcelain
if ($changes) {
    git commit -m "GlobeLink V10.8.14 - correction lancement automatique"
} else {
    Write-Host "Aucun nouveau changement a valider." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Une fenetre GitHub peut s'ouvrir pour confirmer votre connexion." -ForegroundColor Cyan
Write-Host ""

git push -u origin main

Write-Host ""
Write-Host "Publication terminee : https://github.com/wassimvare/globelink" -ForegroundColor Green
Start-Process "https://github.com/wassimvare/globelink"
Read-Host "Appuyez sur Entree pour fermer"
