@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title GlobeLink - Diagnostic mobile
set "PORT=5173"
set "LAN_IP="

echo =====================================================
echo              DIAGNOSTIC GLOBELINK MOBILE
echo =====================================================
echo.
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$c=Get-NetIPConfiguration ^| Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } ^| Select-Object -First 1; if($c){$c.IPv4Address.IPAddress}"`) do set "LAN_IP=%%I"

echo Adresse du PC : !LAN_IP!
echo Port utilise   : %PORT%
echo.
echo Test du serveur local :
powershell -NoProfile -Command "try{$r=Invoke-WebRequest 'http://127.0.0.1:%PORT%' -UseBasicParsing -TimeoutSec 3; Write-Host ('OK - HTTP ' + $r.StatusCode)}catch{Write-Host ('ECHEC - ' + $_.Exception.Message)}"
echo.
echo Test du port :
powershell -NoProfile -Command "$c=Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if($c){Write-Host 'OK - le port est ouvert'}else{Write-Host 'ECHEC - aucun serveur sur le port'}"
echo.
echo Profil reseau Windows :
powershell -NoProfile -Command "Get-NetConnectionProfile | Select-Object Name,NetworkCategory,IPv4Connectivity | Format-Table -AutoSize"
echo.
echo Journal du dernier lancement :
if exist "globelink-mobile.log" (
  powershell -NoProfile -Command "Get-Content 'globelink-mobile.log' -Tail 30"
) else (
  echo Aucun journal disponible.
)
echo.
pause
