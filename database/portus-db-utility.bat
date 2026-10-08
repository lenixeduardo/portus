@echo off
setlocal
echo [PORTUS] Abrindo utilitario PostgreSQL...
echo [PORTUS] Se a janela nao aparecer, tente Alt+Tab.
powershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0portus-db-utility.ps1" %*
if errorlevel 1 (
  echo.
  echo [ERRO] Falha ao iniciar a interface PORTUS. Verifique a mensagem acima.
  pause
  exit /b 1
)
exit /b 0
