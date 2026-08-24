$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$ProjectRef = "hzsfocphpynxoykfkfaj"

function Stop-WithMessage([string]$Message) {
  Write-Host ""
  Write-Host "[ERREUR] $Message" -ForegroundColor Red
  Read-Host "Appuie sur Entree pour fermer"
  exit 1
}

function Get-DotEnvValue([string]$Name) {
  if (-not (Test-Path ".env")) { return $null }
  $line = Get-Content ".env" | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return (($line -split "=", 2)[1]).Trim().Trim('"').Trim("'")
}

$SystemNpx = Get-Command npx.cmd -ErrorAction SilentlyContinue
$PortableNpx = Join-Path $PSScriptRoot ".runtime\node-v22.18.0-win-x64\npx.cmd"
$NpxExe = if ($SystemNpx) { $SystemNpx.Source } elseif (Test-Path $PortableNpx) { $PortableNpx } else { $null }
if (-not $NpxExe) {
  Stop-WithMessage "Node.js et npx sont necessaires. Lance d'abord CONFIGURER_PROJET_SUPABASE.bat."
}

$CurrentEnv = if (Test-Path ".env") { Get-Content ".env" -Raw } else { "" }
if (-not $CurrentEnv -or $CurrentEnv -match 'A_CONFIGURER_AUTOMATIQUEMENT' -or $CurrentEnv -notmatch [regex]::Escape($ProjectRef)) {
  Write-Host "Configuration du projet Supabase $ProjectRef..." -ForegroundColor Yellow
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "CONFIGURER_PROJET_SUPABASE.ps1")
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage "La configuration Supabase n'a pas abouti." }
}

$ProjectUrl = Get-DotEnvValue "SUPABASE_URL"
if (-not $ProjectUrl) { $ProjectUrl = Get-DotEnvValue "VITE_SUPABASE_URL" }
$PublishableKey = Get-DotEnvValue "SUPABASE_PUBLISHABLE_KEY"
if (-not $PublishableKey) { $PublishableKey = Get-DotEnvValue "VITE_SUPABASE_PUBLISHABLE_KEY" }
if (-not $ProjectUrl -or -not $PublishableKey) {
  Stop-WithMessage "Le fichier .env ne contient pas l'URL et la cle publique Supabase."
}

Write-Host "====================================================="
Write-Host "  GLOBELINK V9 - CATALOGUE INTERNET AUTOMATIQUE"
Write-Host "====================================================="
Write-Host ""
Write-Host "Ce programme va :"
Write-Host " - creer les tables du catalogue"
Write-Host " - deployer la fonction de collecte"
Write-Host " - activer la collecte quotidienne a 04:15 UTC"
Write-Host " - lancer une premiere collecte"
Write-Host ""
Write-Host "OpenStreetMap fonctionne sans cle pour les restaurants, hotels et activites." -ForegroundColor Cyan
Write-Host "Pour les offres avec prix et lien de reservation, des identifiants Amadeus Developer sont recommandes." -ForegroundColor Yellow
Write-Host ""
$Confirm = Read-Host "Ecris INSTALLER pour continuer"
if ($Confirm -cne "INSTALLER") { exit 0 }

Write-Host "[1/7] Verification de la connexion Supabase..."
& $NpxExe --yes supabase@latest projects list --output pretty | Out-Null
if ($LASTEXITCODE -ne 0) {
  & $NpxExe --yes supabase@latest login
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage "Connexion Supabase impossible." }
}

Write-Host "[2/7] Liaison au projet..."
& $NpxExe --yes supabase@latest link --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "Le projet Supabase n'a pas pu etre lie." }

Write-Host "[3/7] Installation directe des tables GlobeLink..."
$BootstrapSql = Join-Path $PSScriptRoot "supabase\bootstrap\globelink_auto_setup.sql"
if (-not (Test-Path -LiteralPath $BootstrapSql)) {
  Stop-WithMessage "Le fichier SQL automatique est introuvable : $BootstrapSql"
}
& $NpxExe --yes supabase@latest db query --linked -f $BootstrapSql
if ($LASTEXITCODE -ne 0) {
  & $NpxExe --yes supabase@latest db query -f $BootstrapSql --linked
}
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "Les tables GlobeLink n'ont pas pu etre installees. Lis l'erreur au-dessus." }

$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$SyncSecret = -join ($bytes | ForEach-Object { $_.ToString("x2") })

Write-Host "[4/7] Enregistrement du secret de synchronisation..."
& $NpxExe --yes supabase@latest secrets set "CATALOG_SYNC_SECRET=$SyncSecret" --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "Le secret de synchronisation n'a pas pu etre enregistre." }

$AmadeusId = Read-Host "Amadeus Client ID (laisse vide pour ignorer)"
if ($AmadeusId) {
  $AmadeusSecretSecure = Read-Host "Amadeus Client Secret" -AsSecureString
  $BSTR = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($AmadeusSecretSecure)
  try { $AmadeusSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($BSTR) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR) }
  & $NpxExe --yes supabase@latest secrets set "AMADEUS_CLIENT_ID=$AmadeusId" "AMADEUS_CLIENT_SECRET=$AmadeusSecret" "AMADEUS_ENV=test" --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage "Les cles Amadeus n'ont pas pu etre enregistrees." }
}

$TavilyKeySecure = Read-Host "Cle Tavily optionnelle pour rechercher des bons plans web (laisse vide pour ignorer)" -AsSecureString
$TavilyBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($TavilyKeySecure)
try { $TavilyKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($TavilyBstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($TavilyBstr) }
if ($TavilyKey) {
  & $NpxExe --yes supabase@latest secrets set "TAVILY_API_KEY=$TavilyKey" --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage "La cle Tavily n'a pas pu etre enregistree." }
}

Write-Host "[5/7] Deploiement de la fonction internet..."
& $NpxExe --yes supabase@latest functions deploy sync-travel-catalog --project-ref $ProjectRef --no-verify-jwt
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "La fonction sync-travel-catalog n'a pas pu etre deployee." }

$FunctionUrl = "$ProjectUrl/functions/v1/sync-travel-catalog"
$Headers = @{
  "apikey" = $PublishableKey
  "x-catalog-sync-secret" = $SyncSecret
  "Content-Type" = "application/json"
}

Write-Host "[6/7] Activation du renouvellement quotidien..."
try {
  $CronResult = Invoke-RestMethod -Method Post -Uri $FunctionUrl -Headers $Headers -Body '{"action":"configure-cron","schedule":"15 4 * * *"}' -TimeoutSec 180
  if (-not $CronResult.ok) { throw "Configuration cron refusee" }
} catch {
  Stop-WithMessage "La fonction est deployee, mais le planning quotidien n'a pas pu etre active : $($_.Exception.Message)"
}

Write-Host "[7/7] Premiere collecte..."
try {
  $SyncResult = Invoke-RestMethod -Method Post -Uri $FunctionUrl -Headers $Headers -Body '{"force":true,"triggerSource":"installer"}' -TimeoutSec 240
  Write-Host "Elements traites : $($SyncResult.imported)" -ForegroundColor Cyan
} catch {
  Write-Host "La premiere collecte a rencontre une erreur, mais le planning quotidien reste installe." -ForegroundColor Yellow
  Write-Host $_.Exception.Message -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Catalogue automatique V9 installe avec succes." -ForegroundColor Green
Write-Host "L'admin peut gerer les zones, supprimer des lieux et lancer une collecte depuis Administration > Catalogue web." -ForegroundColor Green
Read-Host "Appuie sur Entree pour fermer"
