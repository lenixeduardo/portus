@echo off
setlocal EnableExtensions
chcp 65001 >nul

rem Atualiza as migrations do PostgreSQL central, inclusive a 022.
rem Execute no servidor, com os arquivos database/migrations atualizados.
set "ROOT=%~dp0"
set "INSTALLER=%ROOT%install-portus-database.ps1"
if not exist "%INSTALLER%" set "INSTALLER=%ROOT%database\install-portus-database.ps1"
if not exist "%INSTALLER%" (
  echo [ERRO] install-portus-database.ps1 nao encontrado.
  goto :failure
)
for %%I in ("%INSTALLER%") do set "DB_DIR=%%~dpI"
if not exist "%DB_DIR%migrations\022_repair_physical_user_deletion.sql" (
  echo [ERRO] Migration 022 ausente. Atualize os arquivos do PORTUS.
  goto :failure
)
if not defined PORTUS_DB_HOST set "PORTUS_DB_HOST=127.0.0.1"
if not defined PORTUS_DB_PORT set "PORTUS_DB_PORT=5432"
if not defined PORTUS_DB_NAME set "PORTUS_DB_NAME=portus"
if not defined PORTUS_DB_ADMIN_USER set "PORTUS_DB_ADMIN_USER=postgres"
if not defined PORTUS_PG_BIN (
  for %%V in (18 17 16 15 14 13 12) do (
    if not defined PORTUS_PG_BIN if exist "%ProgramFiles%\PostgreSQL\%%V\bin\psql.exe" set "PORTUS_PG_BIN=%ProgramFiles%\PostgreSQL\%%V\bin"
    if not defined PORTUS_PG_BIN if exist "%ProgramFiles(x86)%\PostgreSQL\%%V\bin\psql.exe" set "PORTUS_PG_BIN=%ProgramFiles(x86)%\PostgreSQL\%%V\bin"
  )
)
if not defined PORTUS_PG_BIN (
  echo [ERRO] psql.exe nao encontrado. Defina PORTUS_PG_BIN.
  goto :failure
)
echo.
echo ====== PORTUS - MIGRATIONS OBRIGATORIAS ======
echo Destino: %PORTUS_DB_HOST%:%PORTUS_DB_PORT%/%PORTUS_DB_NAME%
echo Usuario PostgreSQL: %PORTUS_DB_ADMIN_USER%
echo Binarios: %PORTUS_PG_BIN%
echo.
echo Realize um backup do banco antes da atualizacao.
echo A senha sera solicitada antes da confirmacao.
echo A senha nao sera exibida nem gravada em arquivo.
rem A coleta e a execucao ocorrem no mesmo processo PowerShell.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $exitCode=1; try { ^
  $secure=Read-Host 'Senha do administrador PostgreSQL (%PORTUS_DB_ADMIN_USER%)' -AsSecureString; ^
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); ^
  try { $env:PORTUS_SETUP_ADMIN_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }; ^
  if ([string]::IsNullOrWhiteSpace($env:PORTUS_SETUP_ADMIN_PASSWORD)) { throw 'A senha nao pode ser vazia.' }; ^
  $answer=Read-Host 'Confirma aplicar as migrations pendentes neste banco? (S/N)'; ^
  if ($answer -match '^[Ss]
if errorlevel 1 goto :failure
echo.
echo [OK] Migrations atualizadas. Reinicie o PORTUS.
pause
exit /b 0
:failure
echo.
echo [FALHA] Atualizacao nao concluida. Verifique os erros acima.
pause
exit /b 1
) { ^
    & '%INSTALLER%' -MigrationsOnly -PostgresBin '%PORTUS_PG_BIN%' -DatabaseHost '%PORTUS_DB_HOST%' -Port %PORTUS_DB_PORT% -DatabaseName '%PORTUS_DB_NAME%' -AdminUser '%PORTUS_DB_ADMIN_USER%'; ^
    $exitCode=0; ^
  } else { Write-Host 'Operacao cancelada.'; $exitCode=2 } ^
} catch { Write-Host ('[ERRO] ' + $_.Exception.Message) -ForegroundColor Red; $exitCode=1 } finally { Remove-Item Env:PORTUS_SETUP_ADMIN_PASSWORD -ErrorAction SilentlyContinue }; exit $exitCode"
if errorlevel 1 goto :failure
echo.
echo [OK] Migrations atualizadas. Reinicie o PORTUS.
pause
exit /b 0
:failure
echo.
echo [FALHA] Atualizacao nao concluida. Verifique os erros acima.
pause
exit /b 1
