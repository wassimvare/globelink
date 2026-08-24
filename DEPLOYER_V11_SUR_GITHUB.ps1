$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

Write-Host ""
Write-Host "=== GlobeLink V11.0.13 Beta -> GitHub -> Vercel ===" -ForegroundColor Cyan
Write-Host "Depot : https://github.com/wassimvare/globelink" -ForegroundColor Gray
Write-Host ""

if (-not (Test-Path "package.json")) {
    Write-Host "ERREUR : package.json introuvable. Lance ce script depuis le dossier GlobeLink." -ForegroundColor Red
    Read-Host "Appuie sur Entree pour fermer"
    exit 1
}

$pkg = Get-Content -Raw "package.json" | ConvertFrom-Json
if ($pkg.version -ne "11.0.13-beta.1") {
    Write-Host "ERREUR : cette copie n'est pas GlobeLink 11.0.13-beta.1 (version trouvee : $($pkg.version))." -ForegroundColor Red
    Read-Host "Appuie sur Entree pour fermer"
    exit 1
}
Write-Host "Version verifiee : $($pkg.version)" -ForegroundColor Green

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git n'est pas installe sur ce PC." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "Installation automatique de Git..." -ForegroundColor Cyan
        winget install --id Git.Git -e --source winget
        Write-Host "Git vient d'etre installe. Ferme cette fenetre, puis relance DEPLOYER_V11_SUR_GITHUB.bat." -ForegroundColor Yellow
    } else {
        Write-Host "Installe Git for Windows puis relance le script." -ForegroundColor Yellow
    }
    Read-Host "Appuie sur Entree pour fermer"
    exit 1
}

# La version precedente du depot a deja ete sauvegardee cote GitHub dans
# backup/pre-v11-zip-2026-08-24. On repart donc de CETTE archive comme source exacte.
if (Test-Path ".git") {
    Remove-Item -LiteralPath ".git" -Recurse -Force
}

git init
git checkout -b main

git config user.name "Wassim Vare"
git config user.email "varewassim7@gmail.com"

# Les secrets locaux restent exclus par .gitignore.
git add -A
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "ERREUR : aucun fichier a publier." -ForegroundColor Red
    Read-Host "Appuie sur Entree pour fermer"
    exit 1
}

git commit -m "GlobeLink V11.0.13 Beta - restore exact ZIP version"
git remote add origin "https://github.com/wassimvare/globelink.git"

Write-Host ""
Write-Host "Publication de la V11.0.13 Beta exacte..." -ForegroundColor Cyan
Write-Host "Une fenetre GitHub peut s'ouvrir pour confirmer ta connexion." -ForegroundColor Gray
Write-Host ""

# Le main distant est volontairement remplace : sa version precedente est sauvegardee.
git push --force -u origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Le push GitHub a echoue. Ne ferme pas cette fenetre : prends une capture du message." -ForegroundColor Red
    Read-Host "Appuie sur Entree pour fermer"
    exit 1
}

Write-Host ""
Write-Host "OK : GlobeLink V11.0.13 Beta est maintenant sur GitHub." -ForegroundColor Green
Write-Host "Vercel va lancer automatiquement le deploiement de production." -ForegroundColor Green
Start-Process "https://github.com/wassimvare/globelink"
Read-Host "Appuie sur Entree pour fermer"
