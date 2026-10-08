@echo off
setlocal
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0portus-db-utility.ps1"
if errorlevel 1 (
  echo.
  echo Falha ao abrir o utilitario PostgreSQL do PORTUS.
  pause
)
