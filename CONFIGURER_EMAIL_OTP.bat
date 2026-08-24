@echo off
setlocal
cd /d "%~dp0"
title GlobeLink - Code e-mail
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0CONFIGURER_CODE_EMAIL.ps1"
endlocal
