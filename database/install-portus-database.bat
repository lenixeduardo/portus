@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-portus-database.ps1" %*
exit /b %ERRORLEVEL%
