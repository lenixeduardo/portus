@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-portus-database.ps1" %*
set EXITCODE=%ERRORLEVEL%
pause
exit /b %EXITCODE%
