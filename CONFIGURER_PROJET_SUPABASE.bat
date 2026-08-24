@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title GlobeLink - Configuration Supabase
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0CONFIGURER_PROJET_SUPABASE.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo La configuration a echoue. Consulte DIAGNOSTIC_CONFIG_SUPABASE.txt dans ce dossier.
  pause
)
exit /b %EXIT_CODE%
