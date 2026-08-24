@echo off
chcp 65001 >nul
title GlobeLink - Photos reelles Google Places
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CONFIGURER_PHOTOS_GOOGLE_PLACES.ps1"
