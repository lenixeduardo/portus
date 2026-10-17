@echo off
setlocal EnableExtensions DisableDelayedExpansion
title LabSerial - Compatibilidade .NET e Nomes das Portas
pushd "%~dp0" 2>nul
if errorlevel 1 exit /b 2
echo.
echo ============================================================
echo LABSERIAL - COMPATIBILIDADE SERIAL E NOMES COM210 / COM211
echo ============================================================
echo O driver .SYS ja instalado NAO sera substituido.
echo NAO altera Secure Boot, certificados, BCD ou com0com.
echo Para alterar nome PnP / testar kernel: SOMENTE PC DE LABORATORIO.
echo.
call :CHECK
if errorlevel 1 (
  echo BLOQUEADO: integridade do pacote de ferramentas nao pode ser verificada.
  echo Baixe um ZIP completo e nao altere os arquivos.
  pause
  popd
  exit /b 3
)
:MENU
echo.
echo [1] Diagnostico da API System.IO.Ports (SEM abrir COM)
echo [2] Testar System.IO.Ports (transmissao REAL; PC laboratorio)
echo [3] Previa da correcao dos nomes PnP (SEM alterar)
echo [4] Aplicar correcao FriendlyName COM210 / COM211 (PC laboratorio)
echo [5] Abrir pasta de relatorios
echo [6] Desbloquear PS1 marcados pelo Windows (apos verificar hashes)
echo [0] Sair
choice /C 1234560 /N /M "Selecione: "
if errorlevel 7 goto END
if errorlevel 6 goto UNBLOCK
if errorlevel 5 goto REPORTS
if errorlevel 4 goto APPLY
if errorlevel 3 goto PREVIEW
if errorlevel 2 goto TEST
if errorlevel 1 goto INSPECT
goto END

:INSPECT
powershell.exe -NoProfile -File "%CD%\Test-LabSerialSerialPort.ps1"
echo.
pause
goto MENU

:TEST
call :CONFIRM_LAB
if errorlevel 1 goto MENU
powershell.exe -NoProfile -File "%CD%\Run-LabSerialCompatibilityBounded.ps1" -ConfirmDedicatedNonProductionPC -ConfirmPortsAreLabSerial
if errorlevel 1 (
 echo FALHA ou INCOMPATIBILIDADE na API .NET. Consulte o JSON/TXT.
) else (
 echo Aprovado: confira 4 quadros PASS no JSON.
)
pause
goto MENU

:PREVIEW
powershell.exe -NoProfile -File "%CD%\Repair-LabSerialNames.ps1"
echo.
pause
goto MENU

:APPLY
call :ADMIN
if errorlevel 1 goto MENU
call :CONFIRM_LAB
if errorlevel 1 goto MENU
echo A alteracao afeta EXCLUSIVAMENTE a propriedade FriendlyName dos PnP LabSerial.
echo Nao renomeia a porta real nem altera o driver. Um backup JSON sera salvo.
powershell.exe -NoProfile -File "%CD%\Repair-LabSerialNames.ps1" -Apply -ConfirmDedicatedNonProductionPC -ConfirmRecoveryAndConsoleAccess
if errorlevel 1 (
 echo A correcao nao foi totalmente confirmada. Examine a saida e nao repita cegamente.
) else (
 echo Solicitacao concluida; reabra o Gerenciador de Dispositivos e confira.
)
pause
goto MENU

:REPORTS
if not exist "%USERPROFILE%\Documents\LabSerial-Evidencias" mkdir "%USERPROFILE%\Documents\LabSerial-Evidencias"
start "" "%USERPROFILE%\Documents\LabSerial-Evidencias"
goto MENU

:UNBLOCK
call :CHECK
if errorlevel 1 goto MENU
choice /C SN /N /M "Desbloquear somente scripts com hashes verificados? [S/N] "
if errorlevel 2 goto MENU
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop';$m=Get-Content -LiteralPath 'LabSerial-Compat-Manifest.json' -Raw|ConvertFrom-Json;foreach($p in $m.files.PSObject.Properties){if($p.Name.EndsWith('.ps1')){Unblock-File -LiteralPath $p.Name -ErrorAction Stop}}; Write-Host 'Marcacoes de download dos PS1 verificados removidas.'"
echo Se a politica for AllSigned, sera necessaria assinatura digital propria.
pause
goto MENU

:CHECK
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop';try{$m=Get-Content -LiteralPath 'LabSerial-Compat-Manifest.json' -Raw|ConvertFrom-Json;if($m.product -ne 'LabSerial' -or $m.purpose -ne 'compatibility-and-friendly-names' -or $m.production_approved -ne $false){throw 'Manifesto invalido'};foreach($p in $m.files.PSObject.Properties){$actual=(Get-FileHash -LiteralPath $p.Name -Algorithm SHA256).Hash;if($actual -ne [string]$p.Value){throw ('SHA-256 divergente: '+$p.Name)}};Write-Host 'Integridade SHA-256 dos utilitarios verificada.';exit 0}catch{Write-Host ('ERRO: '+$_.Exception.Message);exit 5}"
exit /b %errorlevel%

:ADMIN
powershell.exe -NoProfile -Command "$p=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent());if($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){exit 0}else{Write-Host 'Abra o BAT como Administrador.';exit 1}"
exit /b %errorlevel%

:CONFIRM_LAB
echo RISCO: o driver .SYS e experimental. Testes podem gerar tela azul.
choice /C SN /N /M "PC SOBRESSALENTE, com backup e acesso fisico a recuperacao? [S/N] "
if errorlevel 2 exit /b 1
choice /C SN /N /M "COM210 e COM211 pertencem exclusivamente ao LabSerial? [S/N] "
if errorlevel 2 exit /b 1
exit /b 0

:END
popd
exit /b 0
