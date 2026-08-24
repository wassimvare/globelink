@echo off
chcp 65001 >nul
title GlobeLink - Configurer APIs officielles
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CONFIGURER_APIS_OFFICIELLES.ps1"
