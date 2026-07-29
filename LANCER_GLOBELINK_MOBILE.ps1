$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "GlobeLink - Mobile"

$Port = 5173
$NodeVersion = "22.18.0"
$MinimumFreeGB = 4
$RuntimeDir = Join-Path $PSScriptRoot ".runtime"
$NodeDir = Join-Path $RuntimeDir "node-v$NodeVersion-win-x64"
$PortableNode = Join-Path $NodeDir "node.exe"
$PortableNpm = Join-Path $NodeDir "npm.cmd"
$NodeZip = Join-Path $RuntimeDir "node.zip"
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
$NpmCache = Join-Path $RuntimeDir "npm-cache"
$TempDir = Join-Path $RuntimeDir "temp"
$OutLog = Join-Path $PSScriptRoot "globelink-mobile.log"
$ErrLog = Join-Path $PSScriptRoot "globelink-mobile-error.log"

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
  } catch {
    return 0
  }
}

function Remove-PartialInstall {
  $NodeModules = Join-Path $PSScriptRoot "node_modules"
  $Vite = Join-Path $NodeModules ".bin\vite.cmd"
  if ((Test-Path $NodeModules) -and -not (Test-Path $Vite)) {
    Write-Host "Suppression de l'installation incomplete..." -ForegroundColor Yellow
    Remove-Item -LiteralPath $NodeModules -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Clear-Host
Write-Host "====================================================="
Write-Host "          GLOBELINK - LANCEMENT MOBILE"
Write-Host "====================================================="
Write-Host ""
Write-Host "Tout se lance sur le PC. Le telephone ouvre ensuite"
Write-Host "l'adresse Wi-Fi affichee, sans rien installer."
Write-Host ""

if (-not (Test-Path (Join-Path $PSScriptRoot "package.json"))) {
  Stop-WithMessage "package.json est introuvable. Decompresse entierement le ZIP avant de lancer."
}

New-Item -ItemType Directory -Force -Path $RuntimeDir,$NpmCache,$TempDir | Out-Null

# Keep npm cache and temporary files beside the project instead of filling C:\.
$env:npm_config_cache = $NpmCache
$env:npm_config_audit = "false"
$env:npm_config_fund = "false"
$env:npm_config_progress = "false"
$env:TEMP = $TempDir
$env:TMP = $TempDir

Remove-PartialInstall

$FreeGB = Get-FreeGB $PSScriptRoot
Write-Host "Espace libre sur le disque du projet : $FreeGB Go"
if ($FreeGB -lt $MinimumFreeGB) {
  Write-Host ""
  Write-Host "Il faut environ $MinimumFreeGB Go libres pour la premiere installation." -ForegroundColor Yellow
  Write-Host "Solutions :" -ForegroundColor Yellow
  Write-Host "  1. Libere de l'espace sur ce disque."
  Write-Host "  2. Ou deplace le dossier GlobeLink sur un disque D: ou une cle USB avec assez d'espace."
  Write-Host "  3. Puis relance ce fichier."
  Stop-WithMessage "Espace disque insuffisant ($FreeGB Go disponibles)."
}

$NodeExe = $null
$NpmExe = $null
$SystemNode = Get-Command node.exe -ErrorAction SilentlyContinue
$SystemNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($SystemNode -and $SystemNpm) {
  try {
    $Major = [int]((& $SystemNode.Source -p "process.versions.node.split('.')[0]").Trim())
    if ($Major -ge 20) {
      $NodeExe = $SystemNode.Source
      $NpmExe = $SystemNpm.Source
      Write-Host "[1/5] Node.js est deja installe."
    }
  } catch {}
}

if (-not $NodeExe) {
  if (-not (Test-Path $PortableNode)) {
    Write-Host "[1/5] Telechargement de Node.js portable..."
    try {
      $ProgressPreference = "SilentlyContinue"
      Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip -UseBasicParsing
      Expand-Archive -Path $NodeZip -DestinationPath $RuntimeDir -Force
      Remove-Item $NodeZip -Force -ErrorAction SilentlyContinue
    } catch {
      Remove-Item $NodeZip -Force -ErrorAction SilentlyContinue
      Stop-WithMessage "Node.js n'a pas pu etre telecharge ou decompresse : $($_.Exception.Message)"
    }
  } else {
    Write-Host "[1/5] Node.js portable est deja disponible."
  }
  $NodeExe = $PortableNode
  $NpmExe = $PortableNpm
}

$ViteCmd = Join-Path $PSScriptRoot "node_modules\.bin\vite.cmd"
if (-not (Test-Path $ViteCmd)) {
  Write-Host "[2/5] Installation des composants du projet..."
  Write-Host "Cette etape utilise Internet uniquement au premier lancement."
  Write-Host "Le cache et les fichiers temporaires restent dans le dossier GlobeLink."
  Write-Host ""

  & $NpmExe install --legacy-peer-deps --package-lock=false --registry=https://registry.npmjs.org/ --no-audit --no-fund --progress=false
  if ($LASTEXITCODE -ne 0) {
    $FreeAfter = Get-FreeGB $PSScriptRoot
    if ($FreeAfter -lt 1) {
      Remove-PartialInstall
      Stop-WithMessage "Le disque est plein. Libere au moins $MinimumFreeGB Go ou deplace GlobeLink sur un autre disque."
    }
    Stop-WithMessage "L'installation npm a echoue. Consulte les lignes rouges au-dessus."
  }
} else {
  Write-Host "[2/5] Les composants sont deja installes."
}

$Config = Get-NetIPConfiguration | Where-Object {
  $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up"
} | Select-Object -First 1
$LanIp = $Config.IPv4Address.IPAddress
if (-not $LanIp) {
  $LanIp = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*"
  } | Select-Object -ExpandProperty IPAddress -First 1
}
if (-not $LanIp) {
  Stop-WithMessage "Impossible de trouver l'adresse Wi-Fi du PC. Connecte le PC au Wi-Fi puis relance."
}
$MobileUrl = "http://${LanIp}:$Port"
Write-Host "[3/5] Adresse du telephone : $MobileUrl"

$Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
$IsAdmin = $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($IsAdmin) {
  $ExistingRule = Get-NetFirewallRule -DisplayName "GlobeLink Mobile $Port" -ErrorAction SilentlyContinue
  if (-not $ExistingRule) {
    New-NetFirewallRule -DisplayName "GlobeLink Mobile $Port" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
  }
  Write-Host "[4/5] Pare-feu Windows configure pour le reseau prive."
} else {
  Write-Host "[4/5] Si Windows demande une autorisation, coche Reseaux prives."
}

Remove-Item $OutLog,$ErrLog -Force -ErrorAction SilentlyContinue
$Server = Start-Process -FilePath $NpmExe -ArgumentList @(
  "run", "dev", "--", "--host", "0.0.0.0", "--port", "$Port"
) -WorkingDirectory $PSScriptRoot -WindowStyle Minimized -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog -PassThru

Write-Host "[5/5] Demarrage et verification du serveur..."
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
  Write-Host ""
  Write-Host "Le serveur n'a pas demarre. Dernieres erreurs :" -ForegroundColor Red
  if (Test-Path $ErrLog) { Get-Content $ErrLog -Tail 50 }
  if (Test-Path $OutLog) { Get-Content $OutLog -Tail 50 }
  Read-Host "Appuie sur Entree pour fermer"
  exit 1
}

$LanReady = $false
for ($i = 0; $i -lt 20; $i++) {
  try {
    $LanResponse = Invoke-WebRequest -Uri $MobileUrl -UseBasicParsing -TimeoutSec 2
    if ($LanResponse.StatusCode -ge 200) { $LanReady = $true; break }
  } catch {}
  Start-Sleep -Milliseconds 350
}

if (-not $LanReady) {
  Write-Host ""
  Write-Host "Le site fonctionne sur le PC, mais Windows bloque l'adresse Wi-Fi." -ForegroundColor Yellow
  Write-Host "Autorise Node.js dans le pare-feu pour les reseaux prives, puis relance." -ForegroundColor Yellow
  Write-Host "Adresse a tester : $MobileUrl" -ForegroundColor Cyan
  Read-Host "Appuie sur Entree pour arreter GlobeLink"
  try { taskkill /PID $Server.Id /T /F | Out-Null } catch {}
  exit 1
}

try { Set-Clipboard -Value $MobileUrl } catch {}
Start-Process "http://127.0.0.1:$Port"

try {
  $QrFile = Join-Path $RuntimeDir "globelink-mobile-qr.png"
  $EncodedMobileUrl = [uri]::EscapeDataString($MobileUrl)
  Invoke-WebRequest -Uri "https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=$EncodedMobileUrl" -OutFile $QrFile -UseBasicParsing -TimeoutSec 8
  if (Test-Path $QrFile) { Start-Process $QrFile }
} catch {}

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host "GLOBELINK EST ACCESSIBLE SUR LE TELEPHONE." -ForegroundColor Green
Write-Host ""
Write-Host "Ouvre cette adresse sur le telephone connecte au meme Wi-Fi :"
Write-Host ""
Write-Host "             $MobileUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "L'adresse a aussi ete copiee dans le presse-papiers."
Write-Host "Garde cette fenetre ouverte pendant l'utilisation."
Write-Host "=====================================================" -ForegroundColor Green
Write-Host ""
Read-Host "Appuie sur Entree pour arreter GlobeLink"
try { taskkill /PID $Server.Id /T /F | Out-Null } catch {}
