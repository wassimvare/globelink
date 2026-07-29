@echo off
setlocal
cd /d "%~dp0"
echo Nettoyage des fichiers temporaires de GlobeLink...
if exist "node_modules" rmdir /s /q "node_modules"
if exist ".runtime\npm-cache" rmdir /s /q ".runtime\npm-cache"
if exist ".runtime\temp" rmdir /s /q ".runtime\temp"
if exist "globelink-mobile.log" del /q "globelink-mobile.log"
if exist "globelink-mobile-error.log" del /q "globelink-mobile-error.log"
echo.
echo Nettoyage termine. Libere au moins 4 Go sur le disque,
echo puis relance LANCER_GLOBELINK_MOBILE.bat.
echo.
pause
