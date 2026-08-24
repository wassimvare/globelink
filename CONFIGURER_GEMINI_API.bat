@echo off
chcp 65001 >nul
title GlobeLink - Configurer Gemini API
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CONFIGURER_GEMINI_API.ps1"
