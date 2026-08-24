@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CONFIGURER_AUTH_GOOGLE_EMAIL_ADMIN.ps1"
endlocal
