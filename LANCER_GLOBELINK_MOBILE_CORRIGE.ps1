$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "GlobeLink - Mobile corrigé"

$Port = 5173
$NodeVersion = "22.18.0"
$RuntimeDir = Join-Path $PSScriptRoot ".runtime"
$NodeDir = Join-Path $RuntimeDir "node-v$NodeVersion-win-x64"
$PortableNode = Join-Path $NodeDir "node.exe"
$PortableNpm = Join-Path $NodeDir "npm.cmd"
$NodeZip = Join-Path $RuntimeDir "node.zip"
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
$OutLog = Join-Path $PSScriptRoot "globelink-mobile.log"
$ErrLog = Join-Path $PSScriptRoot "globelink-mobile-error.log"

function Stop-WithMessage([string]$Message) {
  Write-Host ""
  Write-Host "[ERREUR] $Message" -ForegroundColor Red
  Write-Host ""
  Read-Host "Appuie sur Entrée pour fermer"
  exit 1
}

Clear-Host
Write-Host "====================================================="
Write-Host "         GLOBELINK - LANCEMENT MOBILE CORRIGÉ"
Write-Host "====================================================="
Write-Host ""
Write-Host "Ce fichier se lance sur le PC Windows."
Write-Host "Le téléphone ouvre ensuite l'adresse Wi-Fi affichée."
Write-Host ""

if (-not (Test-Path (Join-Path $PSScriptRoot "package.json"))) {
  Stop-WithMessage "package.json est introuvable. Décompresse entièrement le ZIP avant de lancer."
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
      Write-Host "[1/5] Node.js déjà installé sur le PC."
    }
  } catch {}
}

if (-not $NodeExe) {
  if (-not (Test-Path $PortableNode)) {
    Write-Host "[1/5] Téléchargement du moteur Node.js portable..."
    New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
    try {
      $ProgressPreference = "SilentlyContinue"
      Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip -UseBasicParsing
      Expand-Archive -Path $NodeZip -DestinationPath $RuntimeDir -Force
      Remove-Item $NodeZip -Force -ErrorAction SilentlyContinue
    } catch {
      Stop-WithMessage "Node.js n'a pas pu être téléchargé ou décompressé : $($_.Exception.Message)"
    }
  } else {
    Write-Host "[1/5] Moteur Node.js portable déjà disponible."
  }
  $NodeExe = $PortableNode
  $NpmExe = $PortableNpm
}

if (-not (Test-Path (Join-Path $PSScriptRoot "node_modules\.bin\vite.cmd"))) {
  Write-Host "[2/5] Installation des composants du projet..."
  Write-Host "Cette étape nécessite Internet au premier lancement."
  & $NpmExe install --legacy-peer-deps --package-lock=false --registry=https://registry.npmjs.org/ --no-audit --no-fund --progress=false
  if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage "L'installation npm a échoué. Photographie les lignes rouges affichées au-dessus."
  }
} else {
  Write-Host "[2/5] Composants déjà installés."
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
Write-Host "[3/5] Adresse mobile détectée : $MobileUrl"

$Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
$IsAdmin = $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($IsAdmin) {
  $ExistingRule = Get-NetFirewallRule -DisplayName "GlobeLink Mobile $Port" -ErrorAction SilentlyContinue
  if (-not $ExistingRule) {
    New-NetFirewallRule -DisplayName "GlobeLink Mobile $Port" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
  }
  Write-Host "[4/5] Pare-feu Windows configuré pour le réseau privé."
} else {
  Write-Host "[4/5] Si Windows demande une autorisation, coche Réseaux privés puis Autoriser."
}

Remove-Item $OutLog,$ErrLog -Force -ErrorAction SilentlyContinue
$Server = Start-Process -FilePath $NpmExe -ArgumentList @(
  "run", "dev", "--", "--host", "0.0.0.0", "--port", "$Port"
) -WorkingDirectory $PSScriptRoot -WindowStyle Minimized -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog -PassThru

Write-Host "[5/5] Vérification du serveur..."
$Ready = $false
for ($i = 0; $i -lt 120; $i++) {
  if ($Server.HasExited) { break }
  try {
    $Response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port" -UseBasicParsing -TimeoutSec 2
    if ($Response.StatusCode -ge 200) {
      $Ready = $true
      break
    }
  } catch {}
  Start-Sleep -Milliseconds 500
}

if (-not $Ready) {
  Write-Host ""
  Write-Host "Le serveur n'a pas démarré. Dernières erreurs :" -ForegroundColor Red
  if (Test-Path $ErrLog) { Get-Content $ErrLog -Tail 40 }
  if (Test-Path $OutLog) { Get-Content $OutLog -Tail 40 }
  Read-Host "Appuie sur Entrée pour fermer"
  exit 1
}

# The local page can work while Windows still blocks the LAN address. Test the
# exact URL that the phone will use before announcing success.
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
  Write-Host "GlobeLink fonctionne sur le PC, mais l'adresse Wi-Fi est bloquée." -ForegroundColor Yellow
  Write-Host "Autorise Node.js dans le Pare-feu Windows pour les réseaux privés, puis relance." -ForegroundColor Yellow
  Write-Host "Adresse à tester : $MobileUrl" -ForegroundColor Cyan
  Read-Host "Appuie sur Entrée pour arrêter GlobeLink"
  try { taskkill /PID $Server.Id /T /F | Out-Null } catch {}
  exit 1
}

try { Set-Clipboard -Value $MobileUrl } catch {}
Start-Process "http://127.0.0.1:$Port"

# Optional QR code displayed on the PC. The URL remains available if the QR
# service is offline, so this can never block GlobeLink.
try {
  $QrFile = Join-Path $RuntimeDir "globelink-mobile-qr.png"
  $EncodedMobileUrl = [uri]::EscapeDataString($MobileUrl)
  Invoke-WebRequest -Uri "https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=$EncodedMobileUrl" -OutFile $QrFile -UseBasicParsing -TimeoutSec 8
  if (Test-Path $QrFile) { Start-Process $QrFile }
} catch {}

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host "GLOBELINK FONCTIONNE SUR LE PC ET LE RÉSEAU WI-FI." -ForegroundColor Green
Write-Host ""
Write-Host "Sur le téléphone connecté au MÊME Wi-Fi, ouvre :"
Write-Host ""
Write-Host "             $MobileUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "L'adresse a été copiée et un QR code peut s'ouvrir sur le PC."
Write-Host "N'utilise pas un Wi-Fi invité et désactive temporairement le VPN."
Write-Host "Garde cette fenêtre ouverte pendant le test."
Write-Host "=====================================================" -ForegroundColor Green
Write-Host ""
Read-Host "Appuie sur Entrée pour arrêter GlobeLink"
try { taskkill /PID $Server.Id /T /F | Out-Null } catch {}
