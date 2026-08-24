@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0DEPLOYER_V11_SUR_GITHUB.ps1"
if errorlevel 1 pause
