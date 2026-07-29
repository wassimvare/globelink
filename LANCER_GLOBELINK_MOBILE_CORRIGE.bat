@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0LANCER_GLOBELINK_MOBILE_CORRIGE.ps1"
