$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "GlobeLink - Photos reelles Google Places"
$EnvPath = Join-Path $PSScriptRoot ".env"

function Read-ExistingEnv([string]$Path) {
  $Map = [ordered]@{}
  if (-not (Test-Path -LiteralPath $Path)) { return $Map }
  foreach ($Line in Get-Content -LiteralPath $Path) {
    if ($Line -match '^\s*(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<value>.*)\s*$') {
      $Key = $Matches["key"]
      $Value = $Matches["value"].Trim()
      if (($Value.StartsWith('"') -and $Value.EndsWith('"')) -or ($Value.StartsWith("'") -and $Value.EndsWith("'"))) {
        $Value = $Value.Substring(1, [Math]::Max(0, $Value.Length - 2))
      }
      $Map[$Key] = $Value
    }
  }
  return $Map
}

function Save-Env([string]$Path, $Map) {
  $Lines = New-Object System.Collections.Generic.List[string]
  foreach ($Key in $Map.Keys) {
    $Value = [string]$Map[$Key]
    $SafeValue = $Value.Replace('"', '\"')
    $Lines.Add("$Key=`"$SafeValue`"")
  }
  [System.IO.File]::WriteAllText($Path, ($Lines -join [Environment]::NewLine) + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
}

function Stop-WithMessage([string]$Message) {
  Write-Host ""
  Write-Host "[ERREUR] $Message" -ForegroundColor Red
  Write-Host ""
  Read-Host "Appuie sur Entree pour fermer"
  exit 1
}

function Test-PlacesKey([string]$ApiKey) {
  $Uri = "https://places.googleapis.com/v1/places:searchText"
  $Body = @{ textQuery = "Novotel Barcelona Cornella"; languageCode = "fr" } | ConvertTo-Json -Depth 5
  try {
    $Response = Invoke-RestMethod -Method Post -Uri $Uri -Headers @{
      "X-Goog-Api-Key" = $ApiKey
      "X-Goog-FieldMask" = "places.id,places.displayName,places.photos"
    } -ContentType "application/json" -Body $Body -TimeoutSec 30 -ErrorAction Stop
    $Places = @($Response.places)
    if ($Places.Count -gt 0 -and @($Places[0].photos).Count -gt 0) {
      Write-Host "Test Google Places : OK - photos trouvees." -ForegroundColor Green
      return $true
    }
    Write-Host "Test Google Places : API joignable, mais aucune photo retournee pour le test." -ForegroundColor Yellow
    return $true
  } catch {
    $Message = [string]$_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $Message = [string]$_.ErrorDetails.Message }
    if ($Message) { $Message = $Message.Replace($ApiKey, "[cle masquee]") }
    Write-Host "Test Google Places : ECHEC" -ForegroundColor Red
    Write-Host $Message -ForegroundColor Red
    return $false
  }
}

Clear-Host
Write-Host "========================================================"
Write-Host "     GLOBELINK - PHOTOS REELLES GOOGLE PLACES"
Write-Host "========================================================"
Write-Host ""
Write-Host "Cette cle reste uniquement cote serveur."
Write-Host "Elle ne doit JAMAIS commencer par VITE_."
Write-Host ""
Write-Host "Dans Google Cloud :"
Write-Host "1. Active Places API (New)"
Write-Host "2. Associe un compte de facturation au projet Google Maps Platform"
Write-Host "3. Cree/reutilise une cle API autorisee pour Places API (New)"
Write-Host "4. Colle-la ci-dessous"
Write-Host ""

$ExistingEnv = Read-ExistingEnv $EnvPath
$ExistingGemini = [string]$ExistingEnv["GEMINI_API_KEY"]
if ($ExistingGemini) {
  Write-Host "Une cle GEMINI_API_KEY existe deja dans .env." -ForegroundColor Cyan
  Write-Host "Si elle appartient au meme projet Google Cloud et autorise Places API (New), tu peux appuyer sur Entree pour la tester." -ForegroundColor Cyan
}
$Prompt = if ($ExistingGemini) { "Colle GOOGLE_PLACES_API_KEY [Entree = tester la cle Gemini existante]" } else { "Colle GOOGLE_PLACES_API_KEY" }
$Key = (Read-Host $Prompt).Trim()
if (-not $Key -and $ExistingGemini) { $Key = $ExistingGemini.Trim() }
if (-not $Key) { Stop-WithMessage "Aucune cle saisie." }
if ($Key.StartsWith('"') -and $Key.EndsWith('"')) { $Key = $Key.Substring(1, $Key.Length - 2).Trim() }
if ($Key.StartsWith("'") -and $Key.EndsWith("'")) { $Key = $Key.Substring(1, $Key.Length - 2).Trim() }
if ($Key.Length -lt 20 -or $Key -match '\s') { Stop-WithMessage "La cle saisie ne semble pas valide." }

$Env = Read-ExistingEnv $EnvPath
$Env["GOOGLE_PLACES_API_KEY"] = $Key
# Remove accidental browser-exposed variants if present.
if ($Env.Contains("VITE_GOOGLE_PLACES_API_KEY")) { $Env.Remove("VITE_GOOGLE_PLACES_API_KEY") }
if ($Env.Contains("VITE_GOOGLE_MAPS_API_KEY")) { $Env.Remove("VITE_GOOGLE_MAPS_API_KEY") }
Save-Env $EnvPath $Env
try {
  [Environment]::SetEnvironmentVariable("GLOBELINK_GOOGLE_PLACES_API_KEY", $Key, "User")
} catch {
  Write-Host "Impossible d'enregistrer la cle au niveau utilisateur; le .env local reste configure." -ForegroundColor Yellow
}

Write-Host ""
$Ok = Test-PlacesKey $Key
Write-Host ""
if ($Ok) {
  Write-Host "Configuration enregistree dans .env." -ForegroundColor Green
  Write-Host "Relance LANCER_GLOBELINK.bat puis ouvre un hotel/restaurant sur la carte." -ForegroundColor Green
} else {
  Write-Host "La cle est enregistree, mais Places API (New) n'est pas encore utilisable." -ForegroundColor Yellow
  Write-Host "Verifie l'activation de l'API, la facturation et les restrictions de la cle." -ForegroundColor Yellow
}
Write-Host ""
Read-Host "Appuie sur Entree pour fermer"
