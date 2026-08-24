@echo off
chcp 65001 >nul
title GlobeLink V11.0.5 - Lancement automatique
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0LANCER_GLOBELINK_APPELS_HTTPS.ps1"
