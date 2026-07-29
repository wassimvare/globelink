@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title GlobeLink - Preview mobile

set "PORT=5173"
set "NODE_VERSION=22.18.0"
set "RUNTIME_DIR=%CD%\.runtime"
set "NODE_DIR=%RUNTIME_DIR%\node-v%NODE_VERSION%-win-x64"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "NPM_CMD=%NODE_DIR%\npm.cmd"
set "NODE_ZIP=%RUNTIME_DIR%\node.zip"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip"
set "NPM_CONFIG_CACHE=%RUNTIME_DIR%\npm-cache"
set "LAN_IP="

cls
echo =====================================================
echo            GLOBELINK - PREVIEW SUR MOBILE
echo =====================================================
echo.

if not exist "package.json" (
  echo [ERREUR] package.json est introuvable.
  echo Decompresse completement le ZIP avant de lancer ce fichier.
  pause
  exit /b 1
)

if not exist "%NODE_EXE%" (
  echo [1/4] Preparation du moteur portable...
  if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 }"
  if errorlevel 1 goto :download_error
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try { Expand-Archive -Path '%NODE_ZIP%' -DestinationPath '%RUNTIME_DIR%' -Force } catch { Write-Host $_.Exception.Message; exit 1 }"
  if errorlevel 1 goto :extract_error
  del /q "%NODE_ZIP%" >nul 2>&1
) else (
  echo [1/4] Moteur portable deja disponible.
)

if not exist "node_modules\.package-lock.json" (
  echo [2/4] Preparation automatique de l'application...
  call "%NPM_CMD%" ci --prefer-offline --no-audit --no-fund --progress=false
  if errorlevel 1 (
    echo Nouvelle tentative avec npm install...
    call "%NPM_CMD%" install --prefer-offline --no-audit --no-fund --progress=false
    if errorlevel 1 goto :npm_error
  )
) else (
  echo [2/4] Application deja preparee.
)

echo [3/4] Recherche de l'adresse du PC sur le Wi-Fi...
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$c=Get-NetIPConfiguration ^| Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } ^| Select-Object -First 1; if($c){$c.IPv4Address.IPAddress}"`) do set "LAN_IP=%%I"
if not defined LAN_IP (
  for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$i=Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } ^| Select-Object -First 1; if($i){$i.IPAddress}"`) do set "LAN_IP=%%I"
)

if defined LAN_IP (
  set "MOBILE_URL=http://!LAN_IP!:%PORT%"
) else (
  set "MOBILE_URL=http://ADRESSE-IP-DU-PC:%PORT%"
)

echo.
echo [4/4] Demarrage de GlobeLink...
echo.
echo Sur le telephone connecte au meme Wi-Fi, ouvre :
echo.
echo                 !MOBILE_URL!
echo.
echo Cette adresse sert a tester la version mobile.
echo Pour l'installation plein ecran, utilise ensuite l'adresse HTTPS de production.
echo.
echo Windows peut demander l'autorisation pour le pare-feu : accepte
echo uniquement pour les reseaux prives.
echo Garde cette fenetre ouverte pendant le test.
echo.

start "" "http://127.0.0.1:%PORT%"
call "%NPM_CMD%" run dev -- --host 0.0.0.0 --port %PORT%
exit /b 0

:download_error
echo.
echo [ERREUR] Impossible de telecharger le moteur portable.
echo Verifie ta connexion Internet puis relance ce fichier.
pause
exit /b 1

:extract_error
echo.
echo [ERREUR] Impossible de decomprimer le moteur portable.
echo Supprime le dossier .runtime puis relance ce fichier.
pause
exit /b 1

:npm_error
echo.
echo [ERREUR] Les fichiers necessaires n'ont pas pu etre prepares.
echo Verifie ta connexion Internet, puis relance ce fichier.
pause
exit /b 1
