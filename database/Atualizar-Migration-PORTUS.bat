@echo off
setlocal EnableExtensions
chcp 65001 >nul

rem PORTUS - Atualizacao de migrations do PostgreSQL central.
rem Mantenha o BAT e Executar-Migrations-PORTUS.ps1 na pasta database.
set "ROOT=%~dp0"
set "DB_DIR=%ROOT%"
if not exist "%DB_DIR%install-portus-database.ps1" set "DB_DIR=%ROOT%database\"
set "INSTALLER=%DB_DIR%install-portus-database.ps1"
set "RUNNER=%DB_DIR%Executar-Migrations-PORTUS.ps1"

if not exist "%INSTALLER%" (
  echo [ERRO] install-portus-database.ps1 nao encontrado.
  goto :failure
)
if not exist "%RUNNER%" (
  echo [ERRO] Executar-Migrations-PORTUS.ps1 nao encontrado.
  goto :failure
)
if not exist "%DB_DIR%migrations\022_repair_physical_user_deletion.sql" (
  echo [ERRO] Migration 022 nao encontrada em database\migrations.
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
echo ======================================================
echo        PORTUS - ATUALIZACAO DE MIGRATIONS
echo ======================================================
echo Servidor: %PORTUS_DB_HOST%:%PORTUS_DB_PORT%
echo Banco: %PORTUS_DB_NAME%
echo Administrador: %PORTUS_DB_ADMIN_USER%
echo PostgreSQL: %PORTUS_PG_BIN%
echo.
echo Faca backup do banco antes de prosseguir.
echo A senha sera solicitada ANTES da confirmacao.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%RUNNER%" -Installer "%INSTALLER%" -PostgresBin "%PORTUS_PG_BIN%" -DatabaseHost "%PORTUS_DB_HOST%" -Port %PORTUS_DB_PORT% -DatabaseName "%PORTUS_DB_NAME%" -AdminUser "%PORTUS_DB_ADMIN_USER%"
if errorlevel 1 goto :failure

echo.
echo [OK] Migration aplicada e funcao de exclusao verificada.
echo Reinicie o PORTUS e teste a exclusao do usuario.
pause
exit /b 0

:failure
echo.
echo [FALHA] A atualizacao nao foi confirmada. Verifique a mensagem acima.
pause
exit /b 1
