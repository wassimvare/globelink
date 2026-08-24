$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "GlobeLink - Configurer APIs officielles"

$EnvPath = Join-Path $PSScriptRoot ".env.local"

function Read-ExistingEnv([string]$Path) {
  $Map = [ordered]@{}
  if (-not (Test-Path -LiteralPath $Path)) { return $Map }
  foreach ($Line in Get-Content -LiteralPath $Path) {
    if ($Line -match '^\s*(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<value>.*)\s*$') {
      $Key = $Matches["key"]
      $Value = $Matches["value"].Trim()
      if (
        ($Value.StartsWith('"') -and $Value.EndsWith('"')) -or
        ($Value.StartsWith("'") -and $Value.EndsWith("'"))
      ) {
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
  [System.IO.File]::WriteAllText(
    $Path,
    ($Lines -join [Environment]::NewLine) + [Environment]::NewLine,
    (New-Object System.Text.UTF8Encoding($false))
  )
}

function ConvertFrom-Secure([Security.SecureString]$SecureValue) {
  if (-not $SecureValue) { return "" }
  $Ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Ptr)
  } finally {
    if ($Ptr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Ptr)
    }
  }
}

function Read-SecretValue([string]$Name, [string]$Label, [bool]$Optional = $false) {
  Write-Host ""
  if ($Optional) {
    Write-Host "$Label (optionnel). Laisse vide si tu ne l'as pas encore."
  } else {
    Write-Host "$Label. Laisse vide si tu ne l'as pas encore."
  }
  $SecureValue = Read-Host $Name -AsSecureString
  return (ConvertFrom-Secure $SecureValue).Trim()
}

function Put-IfValue($Map, [string]$Key, [string]$Value) {
  if ($Value) { $Map[$Key] = $Value }
}

Clear-Host
Write-Host "====================================================="
Write-Host "       GLOBELINK - CONFIGURATION APIS OFFICIELLES"
Write-Host "====================================================="
Write-Host ""
Write-Host "Ne colle pas tes cles dans ChatGPT."
Write-Host "Ce script les enregistre uniquement dans .env.local sur ton PC."
Write-Host ""
Write-Host "Tu peux remplir seulement les cles que tu as deja."
Write-Host "La carte gardera les sources tracables de secours pour les providers manquants."

$Env = Read-ExistingEnv $EnvPath

Put-IfValue $Env "BOOKING_API_TOKEN" (Read-SecretValue "BOOKING_API_TOKEN" "Hotels Booking.com - API token")
Put-IfValue $Env "BOOKING_PARTNER_API_KEY" (Read-SecretValue "BOOKING_PARTNER_API_KEY" "Hotels Booking.com - cle partenaire alternative" $true)
Put-IfValue $Env "BOOKING_AFFILIATE_ID" (Read-SecretValue "BOOKING_AFFILIATE_ID" "Hotels Booking.com - Affiliate ID" $true)
$Env["BOOKING_API_BASE_URL"] = "https://demandapi.booking.com/3.1"
$Env["BOOKING_ACCOMMODATIONS_SEARCH_ENDPOINT"] = "https://demandapi.booking.com/3.1/accommodations/search"

Put-IfValue $Env "TRIPADVISOR_API_KEY" (Read-SecretValue "TRIPADVISOR_API_KEY" "Activites Tripadvisor - API key")
$Env["TRIPADVISOR_API_BASE_URL"] = "https://api.content.tripadvisor.com/api/v1"

Put-IfValue $Env "GETYOURGUIDE_API_KEY" (Read-SecretValue "GETYOURGUIDE_API_KEY" "Activites GetYourGuide - API key")
Put-IfValue $Env "GETYOURGUIDE_PARTNER_API_KEY" (Read-SecretValue "GETYOURGUIDE_PARTNER_API_KEY" "Activites GetYourGuide - cle partenaire alternative" $true)
$Env["GETYOURGUIDE_API_BASE_URL"] = "https://api.getyourguide.com/1"

Put-IfValue $Env "YELP_API_KEY" (Read-SecretValue "YELP_API_KEY" "Restaurants Yelp - API key")
$Env["YELP_API_BASE_URL"] = "https://api.yelp.com/v3"

Put-IfValue $Env "GOOGLE_PLACES_API_KEY" (Read-SecretValue "GOOGLE_PLACES_API_KEY" "Photos Google Places - API key" $true)
Put-IfValue $Env "GOOGLE_MAPS_API_KEY" (Read-SecretValue "GOOGLE_MAPS_API_KEY" "Photos Google Maps - API key alternative" $true)

Save-Env $EnvPath $Env

Write-Host ""
Write-Host ".env.local a ete cree/mis a jour." -ForegroundColor Green
Write-Host ""
Write-Host "Verification locale :"
npm run check:apis
Write-Host ""
Write-Host "Relance ensuite GlobeLink pour recharger les variables."
Write-Host ""
Read-Host "Appuie sur Entree pour fermer"
