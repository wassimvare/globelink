$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "GlobeLink - Appels HTTPS"

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
$Cloudflared = Join-Path $RuntimeDir "cloudflared.exe"
$CloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
$ServerOut = Join-Path $RuntimeDir "globelink-https-server.log"
$ServerErr = Join-Path $RuntimeDir "globelink-https-server-error.log"
$TunnelOut = Join-Path $RuntimeDir "globelink-tunnel.log"
$TunnelErr = Join-Path $RuntimeDir "globelink-tunnel-error.log"

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

Clear-Host
Write-Host "====================================================="
Write-Host "       GLOBELINK - APPELS AUDIO / VIDEO HTTPS"
Write-Host "====================================================="
Write-Host ""
Write-Host "Tout se lance sur le PC. Le telephone ouvre seulement"
Write-Host "l'adresse HTTPS affichee. Aucun logiciel a installer sur le telephone."
Write-Host ""

if (-not (Test-Path (Join-Path $PSScriptRoot "package.json"))) {
  Stop-WithMessage "package.json est introuvable. Decompresse entierement le ZIP."
}

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
      Stop-WithMessage "Node.js n'a pas pu etre telecharge : $($_.Exception.Message)"
    }
  } else {
    Write-Host "[1/5] Node.js portable est deja disponible."
  }
  $NodeExe = $PortableNode
  $NpmExe = $PortableNpm
}

$ViteCmd = Join-Path $PSScriptRoot "node_modules\.bin\vite.cmd"
if (-not (Test-Path $ViteCmd)) {
  $NodeModules = Join-Path $PSScriptRoot "node_modules"
  if (Test-Path $NodeModules) { Remove-Item $NodeModules -Recurse -Force -ErrorAction SilentlyContinue }
  Write-Host "[2/5] Installation des composants du projet..."
  & $NpmExe install --legacy-peer-deps --package-lock=false --registry=https://registry.npmjs.org/ --no-audit --no-fund --progress=false
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage "L'installation npm a echoue. Lis les lignes rouges au-dessus." }
} else {
  Write-Host "[2/5] Les composants sont deja installes."
}

if (-not (Test-Path $Cloudflared)) {
  Write-Host "[3/5] Telechargement du tunnel HTTPS securise..."
  try {
    $ProgressPreference = "SilentlyContinue"
    Invoke-WebRequest -Uri $CloudflaredUrl -OutFile $Cloudflared -UseBasicParsing
  } catch {
    Remove-Item $Cloudflared -Force -ErrorAction SilentlyContinue
    Stop-WithMessage "Le tunnel HTTPS n'a pas pu etre telecharge : $($_.Exception.Message)"
  }
} else {
  Write-Host "[3/5] Le tunnel HTTPS est deja disponible."
}

Remove-Item $ServerOut,$ServerErr,$TunnelOut,$TunnelErr -Force -ErrorAction SilentlyContinue
Write-Host "[4/5] Demarrage de GlobeLink..."
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

Write-Host "[5/5] Creation de l'adresse HTTPS pour le telephone..."
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
