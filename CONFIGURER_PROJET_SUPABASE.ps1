$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$ProjectRef = "hzsfocphpynxoykfkfaj"
$ProjectUrl = "https://$ProjectRef.supabase.co"
$IntegratedPublicKey = "sb_publishable_9Vrha4s7e7HJTQ3euKQyAA_lGjAaSh7"
$EnvPath = Join-Path $PSScriptRoot ".env"
$ConfigPath = Join-Path $PSScriptRoot "supabase\config.toml"
$LogPath = Join-Path $PSScriptRoot "DIAGNOSTIC_CONFIG_SUPABASE.txt"

function Write-Log([string]$Text) {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $LogPath -Value "[$stamp] $Text" -Encoding UTF8
}

function Pause-And-Exit([int]$Code) {
  Write-Host ""
  Read-Host "Appuie sur Entree pour fermer"
  exit $Code
}

function Fail([string]$Message) {
  Write-Host ""
  Write-Host "[ERREUR] $Message" -ForegroundColor Red
  Write-Log "ERREUR: $Message"
  Write-Host "Diagnostic : $LogPath" -ForegroundColor Yellow
  Pause-And-Exit 1
}

function Secure-To-Plain([System.Security.SecureString]$SecureValue) {
  if ($null -eq $SecureValue) { return "" }
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-ExistingEnvValue([string]$Name) {
  if (-not (Test-Path -LiteralPath $EnvPath)) { return "" }
  $line = Get-Content -LiteralPath $EnvPath | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -First 1
  if (-not $line) { return "" }
  $value = ($line -split '=', 2)[1].Trim()
  return $value.Trim('"').Trim("'")
}

function Is-PublicKey([string]$Key) {
  if ([string]::IsNullOrWhiteSpace($Key)) { return $false }
  $value = $Key.Trim()
  if ($value -like "sb_secret_*") { return $false }
  if ($value -match "(?i)service[_-]?role") { return $false }
  if ($value -like "sb_publishable_*") { return $true }
  return ($value -match '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
}

function Is-ServerKey([string]$Key) {
  if ([string]::IsNullOrWhiteSpace($Key)) { return $false }
  $value = $Key.Trim()
  if ($value -like "sb_secret_*") { return $true }
  if ($value -match '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') { return $true }
  return $false
}

function Get-KeyValue($Item) {
  if ($null -eq $Item) { return "" }
  if ($Item.PSObject.Properties.Name -contains 'api_key') { return [string]$Item.api_key }
  if ($Item.PSObject.Properties.Name -contains 'value') { return [string]$Item.value }
  if ($Item.PSObject.Properties.Name -contains 'key') { return [string]$Item.key }
  return ""
}

function Find-PublicKey($Items) {
  foreach ($item in @($Items)) {
    $name = [string]$item.name
    $type = [string]$item.type
    $candidate = Get-KeyValue $item
    $publicLabel = ($name -match '(?i)publishable|anon') -or ($type -match '(?i)publishable|anon') -or ($candidate -like 'sb_publishable_*')
    $privateLabel = ($name -match '(?i)secret|service[_-]?role') -or ($type -match '(?i)secret|service[_-]?role')
    if ($publicLabel -and -not $privateLabel -and (Is-PublicKey $candidate)) { return $candidate.Trim() }
  }
  return ""
}

function Find-ServerKey($Items) {
  foreach ($item in @($Items)) {
    $name = [string]$item.name
    $type = [string]$item.type
    $candidate = Get-KeyValue $item
    $privateLabel = ($name -match '(?i)secret|service[_-]?role') -or ($type -match '(?i)secret|service[_-]?role') -or ($candidate -like 'sb_secret_*')
    if ($privateLabel -and (Is-ServerKey $candidate)) { return $candidate.Trim() }
  }
  return ""
}

function Prompt-PublicKey {
  Write-Host ""
  Write-Host "Copie la cle Publishable depuis Supabase > Project Settings > API Keys." -ForegroundColor Yellow
  Write-Host "Elle commence par sb_publishable_ (ou utilise l'ancienne cle anon)." -ForegroundColor Yellow
  $value = (Read-Host "Cle publique").Trim()
  if (-not (Is-PublicKey $value)) { Fail "La cle publique saisie n'est pas valide." }
  return $value
}

function Prompt-ServerKey([string]$Existing) {
  Write-Host ""
  if (Is-ServerKey $Existing) {
    $keep = (Read-Host "Une cle serveur existe deja. La conserver ? (O/N)").Trim().ToUpperInvariant()
    if ($keep -ne 'N') { return $Existing }
  }
  Write-Host "La cle serveur est obligatoire pour la moderation IA privee et les actions administrateur." -ForegroundColor Yellow
  Write-Host "Copie une cle Secret sb_secret_... (ou l'ancienne service_role)." -ForegroundColor Yellow
  Write-Host "Sans cette cle, la file Lieux IA ne pourra pas charger les analyses privees." -ForegroundColor Yellow
  $secure = Read-Host "Cle serveur" -AsSecureString
  $value = (Secure-To-Plain $secure).Trim()
  if ([string]::IsNullOrWhiteSpace($value)) { return "" }
  if (-not (Is-ServerKey $value)) { Fail "La cle serveur saisie n'est pas valide." }
  return $value
}

try {
  Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue
  Write-Log "Demarrage du configurateur V10.8.14"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  Clear-Host
  Write-Host "====================================================="
  Write-Host "   GLOBELINK - CONFIGURATION SUPABASE SIMPLIFIEE"
  Write-Host "====================================================="
  Write-Host ""
  Write-Host "Projet : $ProjectRef" -ForegroundColor Cyan
  Write-Host "URL    : $ProjectUrl" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "Cette version ne depend plus de Node.js ni de npx." -ForegroundColor Green
  Write-Host "Ton token Supabase sert uniquement pendant cette configuration et n'est pas sauvegarde." -ForegroundColor DarkGray
  Write-Host ""

  $publishableKey = $IntegratedPublicKey
  $serverKey = ""
  $existingPublic = Get-ExistingEnvValue "VITE_SUPABASE_PUBLISHABLE_KEY"
  $existingServer = Get-ExistingEnvValue "SUPABASE_SERVICE_ROLE_KEY"

  $mode = (Read-Host "Recuperer automatiquement les cles avec ton Personal Access Token ? (O/N)").Trim().ToUpperInvariant()
  if ($mode -ne 'N') {
    $secureToken = Read-Host "Personal Access Token Supabase (sbp_...)" -AsSecureString
    $token = (Secure-To-Plain $secureToken).Trim()
    if (-not [string]::IsNullOrWhiteSpace($token)) {
      try {
        Write-Host "[1/3] Verification de l'acces au projet..."
        $headers = @{ Authorization = "Bearer $token"; Accept = "application/json" }
        $project = Invoke-RestMethod -Method Get -Uri "https://api.supabase.com/v1/projects/$ProjectRef" -Headers $headers -TimeoutSec 45
        if ([string]$project.id -ne $ProjectRef -and [string]$project.ref -ne $ProjectRef) {
          throw "Le projet retourne ne correspond pas a GlobeLink."
        }
        Write-Host "Projet accessible." -ForegroundColor Green
        Write-Log "Projet accessible via Management API"

        Write-Host "[2/3] Recuperation des cles API..."
        $keys = Invoke-RestMethod -Method Get -Uri "https://api.supabase.com/v1/projects/$ProjectRef/api-keys?reveal=true" -Headers $headers -TimeoutSec 45
        $publishableKey = Find-PublicKey $keys
        $serverKey = Find-ServerKey $keys
        if ($publishableKey) { Write-Host "Cle publique recuperee." -ForegroundColor Green }
        if ($serverKey) { Write-Host "Cle serveur recuperee." -ForegroundColor Green }
        Write-Log "Recuperation automatique terminee. Public=$([bool]$publishableKey), Serveur=$([bool]$serverKey)"
      } catch {
        $message = $_.Exception.Message
        Write-Host "La recuperation automatique a echoue : $message" -ForegroundColor Yellow
        Write-Host "Le mode manuel va prendre le relais." -ForegroundColor Yellow
        Write-Log "Recuperation automatique echouee: $message"
      } finally {
        $token = $null
      }
    }
  }

  if (-not (Is-PublicKey $publishableKey)) {
    if (Is-PublicKey $existingPublic) {
      $reuse = (Read-Host "Une cle publique valide existe deja. La conserver ? (O/N)").Trim().ToUpperInvariant()
      if ($reuse -ne 'N') { $publishableKey = $existingPublic }
    }
  }
  if (-not (Is-PublicKey $publishableKey)) { $publishableKey = Prompt-PublicKey }

  if (-not (Is-ServerKey $serverKey)) { $serverKey = Prompt-ServerKey $existingServer }

  Write-Host "[3/3] Creation du fichier .env..."
  $lines = @(
    "SUPABASE_PROJECT_ID=`"$ProjectRef`"",
    "SUPABASE_PUBLISHABLE_KEY=`"$publishableKey`"",
    "SUPABASE_URL=`"$ProjectUrl`"",
    "SUPABASE_SERVICE_ROLE_KEY=`"$serverKey`"",
    "VITE_SUPABASE_PROJECT_ID=`"$ProjectRef`"",
    "VITE_SUPABASE_PUBLISHABLE_KEY=`"$publishableKey`"",
    "VITE_SUPABASE_URL=`"$ProjectUrl`"",
    "VITE_ENABLE_GOOGLE_AUTH=true"
  )
  $envText = ($lines -join [Environment]::NewLine) + [Environment]::NewLine
  [System.IO.File]::WriteAllText($EnvPath, $envText, (New-Object System.Text.UTF8Encoding($false)))

  if (Test-Path -LiteralPath $ConfigPath) {
    $config = Get-Content -LiteralPath $ConfigPath -Raw
    if ($config -match 'project_id\s*=') {
      $config = [regex]::Replace($config, 'project_id\s*=\s*"[^"]+"', "project_id = `"$ProjectRef`"", 1)
    } else {
      $config = "project_id = `"$ProjectRef`"" + [Environment]::NewLine + $config
    }
    [System.IO.File]::WriteAllText($ConfigPath, $config, (New-Object System.Text.UTF8Encoding($false)))
  }

  if (-not (Test-Path -LiteralPath $EnvPath)) { Fail "Le fichier .env n'a pas pu etre cree." }
  $check = Get-Content -LiteralPath $EnvPath -Raw
  if ($check -notmatch [regex]::Escape($ProjectUrl)) { Fail "L'URL Supabase n'a pas ete enregistree." }
  if ($check -notmatch 'VITE_SUPABASE_PUBLISHABLE_KEY="(sb_publishable_|eyJ)') { Fail "La cle publique n'a pas ete enregistree." }

  Write-Log "Configuration terminee avec succes"
  Write-Host ""
  Write-Host "Configuration Supabase terminee avec succes." -ForegroundColor Green
  Write-Host "Fichier cree : $EnvPath" -ForegroundColor Green
  if (-not $serverKey) {
    Write-Host "Attention : aucune cle serveur n'a ete ajoutee. La moderation IA privee et certaines fonctions admin seront indisponibles." -ForegroundColor Yellow
  }
  Write-Host ""
  Write-Host "Tu peux maintenant double-cliquer sur LANCER_GLOBELINK.bat." -ForegroundColor Cyan
  Pause-And-Exit 0
} catch {
  $detail = $_ | Out-String
  Write-Log "EXCEPTION NON GEREE: $detail"
  Write-Host ""
  Write-Host "[ERREUR INATTENDUE] $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Le detail a ete enregistre dans : $LogPath" -ForegroundColor Yellow
  Pause-And-Exit 1
}
