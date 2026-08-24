$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "GlobeLink - Lancement automatique HTTPS"

$Port = 5173
$NodeVersion = "22.18.0"
$MinimumFreeGB = 4
$ProjectRef = "hzsfocphpynxoykfkfaj"
$ProjectUrl = "https://$ProjectRef.supabase.co"
$PublishableKey = "sb_publishable_9Vrha4s7e7HJTQ3euKQyAA_lGjAaSh7"
$RuntimeDir = Join-Path $PSScriptRoot ".runtime"
$NodeDir = Join-Path $RuntimeDir "node-v$NodeVersion-win-x64"
$PortableNode = Join-Path $NodeDir "node.exe"
$PortableNpm = Join-Path $NodeDir "npm.cmd"
$PortableNpx = Join-Path $NodeDir "npx.cmd"
$NodeZip = Join-Path $RuntimeDir "node.zip"
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
$NpmCache = Join-Path $RuntimeDir "npm-cache"
$TempDir = Join-Path $RuntimeDir "temp"
$Cloudflared = Join-Path $RuntimeDir "cloudflared.exe"
$CloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
$ServerOut = Join-Path $RuntimeDir "globelink-https-server.log"
$ServerErr = Join-Path $RuntimeDir "globelink-https-server-error.log"
$TunnelOut = Join-Path $RuntimeDir "globelink-tunnel.log"
$TunnelErr = Join-Path $RuntimeDir "globelink-tunnel-error.log"
$AutoSetupState = Join-Path $RuntimeDir "globelink-auto-setup.json"
$AutoSetupLog = Join-Path $RuntimeDir "globelink-auto-setup.log"
$AutoSetupVersion = "11.0.2-phase2-hotfix"

function Stop-WithMessage([string]$Message) {
  Write-Host ""
  Write-Host "[ERREUR] $Message" -ForegroundColor Red
  Write-Host ""
  Read-Host "Appuie sur Entree pour fermer"
  exit 1
}

function Get-FreeGB([string]$Path) {
  try {
    $Root = [System.IO.Path]::GetPathRoot((Resolve-Path -LiteralPath $Path).Path)
    $Drive = New-Object System.IO.DriveInfo($Root)
    return [math]::Round($Drive.AvailableFreeSpace / 1GB, 2)
  } catch { return 0 }
}

function Stop-Tree($Process) {
  if ($null -eq $Process) { return }
  try { taskkill /PID $Process.Id /T /F | Out-Null } catch {}
}

function Import-DotEnvFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $Lines = Get-Content -LiteralPath $Path -ErrorAction Stop
  foreach ($Line in $Lines) {
    $Trimmed = $Line.Trim()
    if ($Trimmed.Length -eq 0 -or $Trimmed.StartsWith("#")) { continue }
    $Match = [regex]::Match($Trimmed, '^\s*(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<value>.*)\s*$')
    if (-not $Match.Success) { continue }
    $Key = $Match.Groups["key"].Value
    $Value = $Match.Groups["value"].Value.Trim()
    if (
      ($Value.StartsWith('"') -and $Value.EndsWith('"')) -or
      ($Value.StartsWith("'") -and $Value.EndsWith("'"))
    ) {
      $Value = $Value.Substring(1, [Math]::Max(0, $Value.Length - 2))
    }
    [Environment]::SetEnvironmentVariable($Key, $Value, "Process")
  }
}

function Get-DotEnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  $Lines = Get-Content -LiteralPath $Path -ErrorAction Stop
  foreach ($Line in $Lines) {
    $Match = [regex]::Match($Line, "^\s*$([regex]::Escape($Name))\s*=\s*(?<value>.*)\s*$")
    if (-not $Match.Success) { continue }
    $Value = $Match.Groups["value"].Value.Trim()
    if (
      ($Value.StartsWith('"') -and $Value.EndsWith('"')) -or
      ($Value.StartsWith("'") -and $Value.EndsWith("'"))
    ) {
      $Value = $Value.Substring(1, [Math]::Max(0, $Value.Length - 2))
    }
    return $Value
  }
  return ""
}

function Set-DotEnvValue([string]$Path, [string]$Name, [string]$Value) {
  $Quoted = '"' + ($Value -replace '"', '\"') + '"'
  $Lines = @()
  if (Test-Path -LiteralPath $Path) { $Lines = @(Get-Content -LiteralPath $Path -ErrorAction Stop) }
  $Found = $false
  $Updated = foreach ($Line in $Lines) {
    if ($Line -match "^\s*$([regex]::Escape($Name))\s*=") {
      $Found = $true
      "$Name=$Quoted"
    } else {
      $Line
    }
  }
  if (-not $Found) { $Updated += "$Name=$Quoted" }
  [System.IO.File]::WriteAllText(
    $Path,
    (($Updated -join [Environment]::NewLine) + [Environment]::NewLine),
    (New-Object System.Text.UTF8Encoding($false))
  )
  [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
}

function Restore-GlobeLinkGooglePlacesKey([string]$EnvPath) {
  $Current = Get-DotEnvValue $EnvPath "GOOGLE_PLACES_API_KEY"
  if (-not [string]::IsNullOrWhiteSpace($Current)) {
    try { [Environment]::SetEnvironmentVariable("GLOBELINK_GOOGLE_PLACES_API_KEY", $Current, "User") } catch {}
    return
  }

  $Saved = [Environment]::GetEnvironmentVariable("GLOBELINK_GOOGLE_PLACES_API_KEY", "User")
  if (-not [string]::IsNullOrWhiteSpace($Saved)) {
    Set-DotEnvValue $EnvPath "GOOGLE_PLACES_API_KEY" $Saved
    Write-Host "Cle Google Places restauree automatiquement." -ForegroundColor Green
    return
  }

  # When a new GlobeLink ZIP is extracted near an older version, reuse only
  # the server-side Places key. Other secrets/configuration are left untouched.
  # We scan a few parent levels because ZIP tools often create an extra folder
  # such as GlobeLink-V11/.../GlobeLink-V10-Publication.
  try {
    $Roots = New-Object System.Collections.Generic.List[string]
    $Cursor = Split-Path -Parent $PSScriptRoot
    for ($i = 0; $i -lt 3 -and -not [string]::IsNullOrWhiteSpace($Cursor); $i++) {
      if (Test-Path -LiteralPath $Cursor) { $Roots.Add($Cursor) }
      $Next = Split-Path -Parent $Cursor
      if ($Next -eq $Cursor) { break }
      $Cursor = $Next
    }

    $CandidateEnvs = New-Object System.Collections.Generic.List[string]
    foreach ($Root in $Roots) {
      $Folders = @(Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '(?i)globelink' } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 20)
      foreach ($Folder in $Folders) {
        $CandidateEnvs.Add((Join-Path $Folder.FullName ".env"))
        $NestedProject = Join-Path $Folder.FullName "GlobeLink-V10-Publication"
        $CandidateEnvs.Add((Join-Path $NestedProject ".env"))
      }
    }

    foreach ($CandidateEnv in ($CandidateEnvs | Select-Object -Unique)) {
      if ($CandidateEnv -eq $EnvPath -or -not (Test-Path -LiteralPath $CandidateEnv)) { continue }
      $Candidate = Get-DotEnvValue $CandidateEnv "GOOGLE_PLACES_API_KEY"
      if ([string]::IsNullOrWhiteSpace($Candidate) -or $Candidate.Length -lt 20) { continue }
      Set-DotEnvValue $EnvPath "GOOGLE_PLACES_API_KEY" $Candidate
      try { [Environment]::SetEnvironmentVariable("GLOBELINK_GOOGLE_PLACES_API_KEY", $Candidate, "User") } catch {}
      Write-Host "Cle Google Places reprise depuis une version GlobeLink precedente." -ForegroundColor Green
      return
    }
  } catch {
    Write-AutoSetupLog "Restauration Google Places ignoree: $($_.Exception.Message)"
  }
}

function New-HexSecret([int]$BytesCount = 32) {
  $Bytes = New-Object byte[] $BytesCount
  $Rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $Rng.GetBytes($Bytes) } finally { $Rng.Dispose() }
  return -join ($Bytes | ForEach-Object { $_.ToString("x2") })
}

function Write-AutoSetupLog([string]$Text) {
  $Stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $AutoSetupLog -Value "[$Stamp] $Text" -Encoding UTF8
}

function Invoke-LoggedProcess([string]$Label, [string]$FilePath, [string[]]$Arguments) {
  Write-Host $Label
  Write-AutoSetupLog $Label
  $RunId = [Guid]::NewGuid().ToString("N")
  $StdOutPath = Join-Path $RuntimeDir "auto-setup-$RunId.out"
  $StdErrPath = Join-Path $RuntimeDir "auto-setup-$RunId.err"
  try {
    $Process = Start-Process `
      -FilePath $FilePath `
      -ArgumentList $Arguments `
      -WorkingDirectory $PSScriptRoot `
      -RedirectStandardOutput $StdOutPath `
      -RedirectStandardError $StdErrPath `
      -WindowStyle Hidden `
      -Wait `
      -PassThru

    $StdOut = @()
    $StdErr = @()
    if (Test-Path -LiteralPath $StdOutPath) {
      $StdOut = @(Get-Content -LiteralPath $StdOutPath -ErrorAction SilentlyContinue)
    }
    if (Test-Path -LiteralPath $StdErrPath) {
      $StdErr = @(Get-Content -LiteralPath $StdErrPath -ErrorAction SilentlyContinue)
    }
    if ($StdOut.Count -gt 0) {
      $StdOut | ForEach-Object { Write-Host $_ }
      Add-Content -LiteralPath $AutoSetupLog -Value $StdOut -Encoding UTF8
    }
    if ($StdErr.Count -gt 0) {
      $StdErr | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
      Add-Content -LiteralPath $AutoSetupLog -Value $StdErr -Encoding UTF8
    }
    if ($Process.ExitCode -ne 0) {
      $LastLine = @($StdErr + $StdOut) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1
      if (-not $LastLine) { $LastLine = "code de sortie $($Process.ExitCode)" }
      throw "$Label a echoue : $LastLine. Voir $AutoSetupLog"
    }
  } finally {
    Remove-Item -LiteralPath $StdOutPath,$StdErrPath -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-InteractiveProcess([string]$Label, [string]$FilePath, [string[]]$Arguments) {
  Write-Host $Label
  Write-AutoSetupLog $Label
  $PreviousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & $FilePath @Arguments
    $ExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $PreviousErrorAction
  }
  if ($ExitCode -ne 0) { throw "$Label a echoue. Voir $AutoSetupLog" }
}

function Invoke-SupabaseSqlFile([string]$Label, [string]$NpxExe, [string]$SqlFilePath) {
  if (-not (Test-Path -LiteralPath $SqlFilePath)) {
    throw "Fichier SQL introuvable : $SqlFilePath"
  }

  $Attempts = @(
    @("--yes", "supabase@latest", "db", "query", "--linked", "-f", $SqlFilePath),
    @("--yes", "supabase@latest", "db", "query", "-f", $SqlFilePath, "--linked")
  )
  $LastError = $null
  foreach ($Arguments in $Attempts) {
    try {
      Invoke-LoggedProcess $Label $NpxExe $Arguments
      return
    } catch {
      $LastError = $_
      Write-AutoSetupLog "Essai SQL direct echoue: $($_.Exception.Message)"
    }
  }

  throw $LastError
}

function Test-AutoSetupDone([string]$Path, [string]$Signature) {
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  try {
    $State = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    return (
      [string]$State.version -eq $AutoSetupVersion -and
      [string]$State.projectRef -eq $ProjectRef -and
      [string]$State.signature -eq $Signature -and
      [bool]$State.catalogReady
    )
  } catch {
    return $false
  }
}

function Save-AutoSetupState([string]$Path, [string]$Signature, [bool]$HasAmadeus, [bool]$HasTavily) {
  $State = [ordered]@{
    version = $AutoSetupVersion
    projectRef = $ProjectRef
    catalogReady = $true
    hasAmadeus = $HasAmadeus
    hasTavily = $HasTavily
    signature = $Signature
    installedAt = (Get-Date).ToString("o")
  }
  $State | ConvertTo-Json | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Invoke-AutomaticSupabaseSetup([string]$NpxExe, [string]$EnvFilePath) {
  $AmadeusId = Get-DotEnvValue $EnvFilePath "AMADEUS_CLIENT_ID"
  $AmadeusSecret = Get-DotEnvValue $EnvFilePath "AMADEUS_CLIENT_SECRET"
  $TavilyKey = Get-DotEnvValue $EnvFilePath "TAVILY_API_KEY"
  $HasAmadeus = -not [string]::IsNullOrWhiteSpace($AmadeusId) -and -not [string]::IsNullOrWhiteSpace($AmadeusSecret)
  $HasTavily = -not [string]::IsNullOrWhiteSpace($TavilyKey)
  $Signature = "$AutoSetupVersion|amadeus=$HasAmadeus|tavily=$HasTavily"

  if (Test-AutoSetupDone $AutoSetupState $Signature) {
    Write-Host "[3/6] Installation Supabase/catalogue deja faite."
    return
  }

  Write-Host "[3/6] Installation automatique Supabase/catalogue..."
  Remove-Item -LiteralPath $AutoSetupLog -Force -ErrorAction SilentlyContinue
  Write-AutoSetupLog "Demarrage installation automatique $AutoSetupVersion"

  if ([string]::IsNullOrWhiteSpace($NpxExe) -or -not (Test-Path -LiteralPath $NpxExe)) {
    throw "npx est introuvable. Impossible de lancer Supabase CLI."
  }

  $SyncSecret = Get-DotEnvValue $EnvFilePath "CATALOG_SYNC_SECRET"
  if ([string]::IsNullOrWhiteSpace($SyncSecret) -or $SyncSecret.Length -lt 24) {
    $SyncSecret = New-HexSecret 32
    Set-DotEnvValue $EnvFilePath "CATALOG_SYNC_SECRET" $SyncSecret
  }

  try {
    Invoke-LoggedProcess "Verification connexion Supabase..." $NpxExe @("--yes", "supabase@latest", "projects", "list", "--output", "pretty")
  } catch {
    Write-Host "Connexion Supabase necessaire une seule fois..." -ForegroundColor Yellow
    Invoke-InteractiveProcess "Connexion Supabase..." $NpxExe @("--yes", "supabase@latest", "login")
  }

  Invoke-LoggedProcess "Liaison au projet Supabase..." $NpxExe @("--yes", "supabase@latest", "link", "--project-ref", $ProjectRef)
  $BootstrapSql = Join-Path $PSScriptRoot "supabase\bootstrap\globelink_auto_setup.sql"
  Invoke-SupabaseSqlFile "Installation directe des tables GlobeLink..." $NpxExe $BootstrapSql
  Invoke-LoggedProcess "Enregistrement du secret catalogue..." $NpxExe @("--yes", "supabase@latest", "secrets", "set", "CATALOG_SYNC_SECRET=$SyncSecret", "--project-ref", $ProjectRef)

  $ProviderSecrets = @()
  if ($HasAmadeus) {
    $AmadeusEnv = Get-DotEnvValue $EnvFilePath "AMADEUS_ENV"
    if ([string]::IsNullOrWhiteSpace($AmadeusEnv)) { $AmadeusEnv = "test" }
    $ProviderSecrets += "AMADEUS_CLIENT_ID=$AmadeusId"
    $ProviderSecrets += "AMADEUS_CLIENT_SECRET=$AmadeusSecret"
    $ProviderSecrets += "AMADEUS_ENV=$AmadeusEnv"
  }
  if ($HasTavily) { $ProviderSecrets += "TAVILY_API_KEY=$TavilyKey" }
  if ($ProviderSecrets.Count -gt 0) {
    Invoke-LoggedProcess "Enregistrement des fournisseurs d'offres..." $NpxExe (@("--yes", "supabase@latest", "secrets", "set") + $ProviderSecrets + @("--project-ref", $ProjectRef))
  } else {
    Write-Host "Aucun fournisseur d'offres dans .env : les offres peuvent rester vides." -ForegroundColor Yellow
    Write-AutoSetupLog "Aucun AMADEUS/TAVILY configure"
  }

  Invoke-LoggedProcess "Deploiement de la fonction catalogue..." $NpxExe @("--yes", "supabase@latest", "functions", "deploy", "sync-travel-catalog", "--project-ref", $ProjectRef, "--no-verify-jwt")

  $Headers = @{
    "apikey" = $PublishableKey
    "x-catalog-sync-secret" = $SyncSecret
    "Content-Type" = "application/json"
  }
  $FunctionUrl = "$ProjectUrl/functions/v1/sync-travel-catalog"

  $CronReady = $false
  try {
    Write-Host "Activation du renouvellement quotidien..."
    $CronResult = Invoke-RestMethod -Method Post -Uri $FunctionUrl -Headers $Headers -Body '{"action":"configure-cron","schedule":"15 4 * * *"}' -TimeoutSec 180
    Write-AutoSetupLog "Cron: $($CronResult | ConvertTo-Json -Compress)"
    $CronReady = $true
  } catch {
    Write-Host "Planning quotidien non active : $($_.Exception.Message)" -ForegroundColor Yellow
    Write-AutoSetupLog "Cron erreur: $($_.Exception.Message)"
  }

  try {
    Write-Host "Premiere collecte catalogue..."
    $SyncResult = Invoke-RestMethod -Method Post -Uri $FunctionUrl -Headers $Headers -Body '{"triggerSource":"launcher"}' -TimeoutSec 240
    Write-AutoSetupLog "Sync: $($SyncResult | ConvertTo-Json -Compress)"
  } catch {
    Write-Host "Premiere collecte non terminee : $($_.Exception.Message)" -ForegroundColor Yellow
    Write-AutoSetupLog "Sync erreur: $($_.Exception.Message)"
  }

  if ($CronReady) {
    Save-AutoSetupState $AutoSetupState $Signature $HasAmadeus $HasTavily
    Write-Host "Installation automatique terminee." -ForegroundColor Green
  } else {
    Write-Host "Installation de base faite, mais le planning sera retente au prochain lancement." -ForegroundColor Yellow
  }
}

Clear-Host
Write-Host "====================================================="
Write-Host "       GLOBELINK - LANCEMENT AUTOMATIQUE HTTPS"
Write-Host "====================================================="
Write-Host ""
Write-Host "Tout se lance sur le PC. Le telephone ouvre seulement"
Write-Host "l'adresse HTTPS affichee. Aucun logiciel a installer sur le telephone."
Write-Host ""

if (-not (Test-Path (Join-Path $PSScriptRoot "package.json"))) {
  Stop-WithMessage "package.json est introuvable. Decompresse entierement le ZIP."
}

$EnvFile = Join-Path $PSScriptRoot ".env"
$SetupScript = Join-Path $PSScriptRoot "CONFIGURER_PROJET_SUPABASE.ps1"
$NeedsSetup = -not (Test-Path $EnvFile)
if ($NeedsSetup) {
  Write-Host "Configuration publique Supabase integree..." -ForegroundColor Cyan
  $PublicEnv = @(
    "SUPABASE_PROJECT_ID=`"$ProjectRef`"",
    "SUPABASE_PUBLISHABLE_KEY=`"$PublishableKey`"",
    "SUPABASE_URL=`"$ProjectUrl`"",
    "SUPABASE_SERVICE_ROLE_KEY=`"`"",
    "ADMIN_BOOTSTRAP_USER_ID=`"`"",
    "GEMINI_API_KEY=`"`"",
    "GOOGLE_PLACES_API_KEY=`"`"",
    "GEMINI_MODEL=`"gemini-3.6-flash`"",
    "CATALOG_SYNC_SECRET=`"`"",
    "AMADEUS_CLIENT_ID=`"`"",
    "AMADEUS_CLIENT_SECRET=`"`"",
    "AMADEUS_ENV=`"test`"",
    "TAVILY_API_KEY=`"`"",
    "VITE_SUPABASE_PROJECT_ID=`"$ProjectRef`"",
    "VITE_SUPABASE_PUBLISHABLE_KEY=`"$PublishableKey`"",
    "VITE_SUPABASE_URL=`"$ProjectUrl`"",
    "VITE_ENABLE_GOOGLE_AUTH=true"
  ) -join [Environment]::NewLine
  [System.IO.File]::WriteAllText(
    $EnvFile,
    $PublicEnv + [Environment]::NewLine,
    (New-Object System.Text.UTF8Encoding($false))
  )
  $NeedsSetup = $false
} else {
  $EnvText = Get-Content -LiteralPath $EnvFile -Raw
  $NeedsSetup = ($EnvText -match 'A_CONFIGURER_AUTOMATIQUEMENT') -or
                ($EnvText -notmatch 'VITE_SUPABASE_URL\s*=\s*[''"]?https://hzsfocphpynxoykfkfaj\.supabase\.co') -or
                ($EnvText -notmatch 'VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*[''"]?(sb_publishable_|eyJ)')
}
if ($NeedsSetup) {
  Write-Host "Le fichier .env existant est incomplet; ouverture du configurateur..." -ForegroundColor Yellow
  & powershell -NoProfile -ExecutionPolicy Bypass -File $SetupScript
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage "La configuration Supabase n'a pas abouti." }
}
$EnvText = Get-Content -LiteralPath $EnvFile -Raw
# A server-only key is allowed in SUPABASE_SERVICE_ROLE_KEY. Vite only exposes
# variables prefixed with VITE_. Block a secret only if it was mistakenly placed
# in the browser-facing publishable-key variable.
$PublicKeyMatch = [regex]::Match(
  $EnvText,
  '(?im)^\s*VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*["'']?(?<value>[^\r\n"'']+)'
)
$BrowserKey = $PublicKeyMatch.Groups['value'].Value.Trim()
if ($BrowserKey -match '(?i)^sb_secret_' -or $BrowserKey -match '(?i)service[_-]?role') {
  Stop-WithMessage "La cle privee a ete placee dans VITE_SUPABASE_PUBLISHABLE_KEY. Relance CONFIGURER_PROJET_SUPABASE.bat."
}

Restore-GlobeLinkGooglePlacesKey $EnvFile
Import-DotEnvFile $EnvFile

New-Item -ItemType Directory -Force -Path $RuntimeDir,$NpmCache,$TempDir | Out-Null
$env:npm_config_cache = $NpmCache
$env:npm_config_audit = "false"
$env:npm_config_fund = "false"
$env:npm_config_progress = "false"
$env:TEMP = $TempDir
$env:TMP = $TempDir

$FreeGB = Get-FreeGB $PSScriptRoot
Write-Host "Espace libre : $FreeGB Go"
if ($FreeGB -lt $MinimumFreeGB) {
  Stop-WithMessage "Il faut environ $MinimumFreeGB Go libres pour installer et lancer GlobeLink."
}

$NodeExe = $null
$NpmExe = $null
$NpxExe = $null
$SystemNode = Get-Command node.exe -ErrorAction SilentlyContinue
$SystemNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
$SystemNpx = Get-Command npx.cmd -ErrorAction SilentlyContinue
if ($SystemNode -and $SystemNpm) {
  try {
    $Major = [int]((& $SystemNode.Source -p "process.versions.node.split('.')[0]").Trim())
    if ($Major -ge 20) {
      $NodeExe = $SystemNode.Source
      $NpmExe = $SystemNpm.Source
      if ($SystemNpx) { $NpxExe = $SystemNpx.Source }
      Write-Host "[1/6] Node.js est deja installe."
    }
  } catch {}
}

if (-not $NodeExe) {
  if (-not (Test-Path $PortableNode)) {
    Write-Host "[1/6] Telechargement de Node.js portable..."
    try {
      $ProgressPreference = "SilentlyContinue"
      Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip -UseBasicParsing
      Expand-Archive -Path $NodeZip -DestinationPath $RuntimeDir -Force
      Remove-Item $NodeZip -Force -ErrorAction SilentlyContinue
    } catch {
      Remove-Item $NodeZip -Force -ErrorAction SilentlyContinue
      Stop-WithMessage "Node.js n'a pas pu etre telecharge : $($_.Exception.Message)"
    }
  } else {
    Write-Host "[1/6] Node.js portable est deja disponible."
  }
  $NodeExe = $PortableNode
  $NpmExe = $PortableNpm
  $NpxExe = $PortableNpx
}
if (-not $NpxExe -and (Test-Path $PortableNpx)) { $NpxExe = $PortableNpx }

$ViteCmd = Join-Path $PSScriptRoot "node_modules\.bin\vite.cmd"
if (-not (Test-Path $ViteCmd)) {
  $NodeModules = Join-Path $PSScriptRoot "node_modules"
  if (Test-Path $NodeModules) { Remove-Item $NodeModules -Recurse -Force -ErrorAction SilentlyContinue }
  Write-Host "[2/6] Installation des composants du projet..."
  & $NpmExe ci --legacy-peer-deps --registry=https://registry.npmjs.org/ --no-audit --no-fund --progress=false
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage "L'installation npm a echoue. Lis les lignes rouges au-dessus." }
} else {
  Write-Host "[2/6] Les composants sont deja installes."
}

try {
  Invoke-AutomaticSupabaseSetup $NpxExe $EnvFile
} catch {
  Write-Host "[3/6] Installation automatique incomplete : $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Host "GlobeLink va quand meme se lancer. Detail : $AutoSetupLog" -ForegroundColor Yellow
}

if (-not (Test-Path $Cloudflared)) {
  Write-Host "[4/6] Telechargement du tunnel HTTPS securise..."
  try {
    $ProgressPreference = "SilentlyContinue"
    Invoke-WebRequest -Uri $CloudflaredUrl -OutFile $Cloudflared -UseBasicParsing
  } catch {
    Remove-Item $Cloudflared -Force -ErrorAction SilentlyContinue
    Stop-WithMessage "Le tunnel HTTPS n'a pas pu etre telecharge : $($_.Exception.Message)"
  }
} else {
  Write-Host "[4/6] Le tunnel HTTPS est deja disponible."
}

Remove-Item $ServerOut,$ServerErr,$TunnelOut,$TunnelErr -Force -ErrorAction SilentlyContinue
Write-Host "[5/6] Demarrage de GlobeLink..."
$Server = Start-Process -FilePath $NpmExe -ArgumentList @(
  "run", "dev", "--", "--host", "127.0.0.1", "--port", "$Port"
) -WorkingDirectory $PSScriptRoot -WindowStyle Minimized -RedirectStandardOutput $ServerOut -RedirectStandardError $ServerErr -PassThru

$Ready = $false
for ($i = 0; $i -lt 120; $i++) {
  if ($Server.HasExited) { break }
  try {
    $Response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port" -UseBasicParsing -TimeoutSec 2
    if ($Response.StatusCode -ge 200) { $Ready = $true; break }
  } catch {}
  Start-Sleep -Milliseconds 500
}
if (-not $Ready) {
  if (Test-Path $ServerErr) { Get-Content $ServerErr -Tail 50 }
  Stop-Tree $Server
  Stop-WithMessage "Le serveur GlobeLink n'a pas demarre."
}

Write-Host "[6/6] Creation de l'adresse HTTPS pour le telephone..."
$Tunnel = Start-Process -FilePath $Cloudflared -ArgumentList @(
  "tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:$Port"
) -WorkingDirectory $PSScriptRoot -WindowStyle Minimized -RedirectStandardOutput $TunnelOut -RedirectStandardError $TunnelErr -PassThru

$HttpsUrl = $null
for ($i = 0; $i -lt 120; $i++) {
  if ($Tunnel.HasExited) { break }
  $Text = ""
  if (Test-Path $TunnelOut) { $Text += (Get-Content $TunnelOut -Raw -ErrorAction SilentlyContinue) }
  if (Test-Path $TunnelErr) { $Text += (Get-Content $TunnelErr -Raw -ErrorAction SilentlyContinue) }
  $Match = [regex]::Match($Text, 'https://[a-z0-9-]+\.trycloudflare\.com')
  if ($Match.Success) { $HttpsUrl = $Match.Value; break }
  Start-Sleep -Milliseconds 500
}

if (-not $HttpsUrl) {
  Write-Host ""
  if (Test-Path $TunnelErr) { Get-Content $TunnelErr -Tail 50 }
  Stop-Tree $Tunnel
  Stop-Tree $Server
  Stop-WithMessage "L'adresse HTTPS n'a pas pu etre creee. Verifie la connexion Internet."
}

try { Set-Clipboard -Value $HttpsUrl } catch {}
try {
  $QrFile = Join-Path $RuntimeDir "globelink-appels-qr.png"
  $Encoded = [uri]::EscapeDataString($HttpsUrl)
  Invoke-WebRequest -Uri "https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=$Encoded" -OutFile $QrFile -UseBasicParsing -TimeoutSec 10
  if (Test-Path $QrFile) { Start-Process $QrFile }
} catch {}
Start-Process "http://127.0.0.1:$Port"

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host "GLOBELINK ET LES APPELS SONT PRETS." -ForegroundColor Green
Write-Host ""
Write-Host "Sur le telephone, ouvre ou scanne :"
Write-Host ""
Write-Host "  $HttpsUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "Autorise le micro et la camera quand Safari le demande."
Write-Host "Cette adresse temporaire change a chaque nouveau lancement."
Write-Host "Ne partage pas l'adresse avec une personne inconnue."
Write-Host "Garde cette fenetre ouverte pendant l'utilisation."
Write-Host "=====================================================" -ForegroundColor Green
Write-Host ""
Read-Host "Appuie sur Entree pour arreter GlobeLink"
Stop-Tree $Tunnel
Stop-Tree $Server
