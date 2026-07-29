@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title GlobeLink - Preview locale

set "PORT=5173"
set "NODE_VERSION=22.18.0"
set "RUNTIME_DIR=%CD%\.runtime"
set "NODE_DIR=%RUNTIME_DIR%\node-v%NODE_VERSION%-win-x64"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "NPM_CMD=%NODE_DIR%\npm.cmd"
set "NODE_ZIP=%RUNTIME_DIR%\node.zip"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip"
set "NPM_CONFIG_CACHE=%RUNTIME_DIR%\npm-cache"

cls
echo =====================================================
echo                 GLOBELINK - PREVIEW
echo =====================================================
echo.

if not exist "package.json" (
  echo [ERREUR] package.json est introuvable.
  echo Decompresse tout le ZIP avant de lancer ce fichier.
  pause
  exit /b 1
)

if not exist "%NODE_EXE%" (
  echo [1/3] Preparation du moteur portable...
  if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 }"
  if errorlevel 1 goto :download_error
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try { Expand-Archive -Path '%NODE_ZIP%' -DestinationPath '%RUNTIME_DIR%' -Force } catch { Write-Host $_.Exception.Message; exit 1 }"
  if errorlevel 1 goto :extract_error
  del /q "%NODE_ZIP%" >nul 2>&1
) else (
  echo [1/3] Moteur portable deja disponible.
)

if not exist "node_modules\.package-lock.json" (
  echo [2/3] Preparation automatique de l'application...
  call "%NPM_CMD%" ci --prefer-offline --no-audit --no-fund --progress=false
  if errorlevel 1 (
    echo Nouvelle tentative avec npm install...
    call "%NPM_CMD%" install --prefer-offline --no-audit --no-fund --progress=false
    if errorlevel 1 goto :npm_error
  )
) else (
  echo [2/3] Application deja preparee.
)

echo [3/3] Demarrage de GlobeLink...
echo La page s'ouvrira des que le serveur sera pret.
echo Garde cette fenetre ouverte pendant l'utilisation.
echo.

start "" /b powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command ^
  "$url='http://127.0.0.1:%PORT%'; for($i=0;$i -lt 90;$i++){ try { $r=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1; if($r.StatusCode -ge 200){ Start-Process $url; exit } } catch {}; Start-Sleep -Milliseconds 500 }; Start-Process $url"
call "%NPM_CMD%" run dev -- --host 127.0.0.1 --port %PORT%
exit /b 0

:download_error
echo.
echo [ERREUR] Impossible de telecharger le moteur portable.
echo Verifie ta connexion Internet puis relance le fichier.
pause
exit /b 1

:extract_error
echo.
echo [ERREUR] Impossible de decomprimer le moteur portable.
echo Supprime le dossier .runtime puis relance le fichier.
pause
exit /b 1

:npm_error
echo.
echo [ERREUR] Les fichiers necessaires n'ont pas pu etre prepares.
echo Verifie ta connexion Internet, puis relance ce fichier.
pause
exit /b 1
