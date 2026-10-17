@echo off
setlocal EnableExtensions DisableDelayedExpansion
title LabSerial - Instalacao guiada EXCLUSIVA para laboratorio
if /I "%~1"=="/help" goto HELP
if /I "%~1"=="/?" goto HELP
pushd "%~dp0" 2>nul
if errorlevel 1 (
  echo ERRO: nao foi possivel abrir a pasta do pacote.
  exit /b 2
)
if /I "%~1"=="/check" goto CHECK_ONLY
call :CHECK_PACKAGE
if errorlevel 1 (
  echo.
  echo BLOQUEADO: nao foi possivel verificar o pacote. Nao instale nada.
  pause
  popd
  exit /b 3
)
:MENU
echo.
echo ============================================================
echo LABSERIAL - LABORATORIO WINDOWS x64 [NAO E PRODUCAO]
echo ============================================================
echo [1] Verificar requisitos do Windows - somente leitura
echo [2] Verificar/importar certificado de TESTE - confirmacao
echo [3] INSTALAR driver e criar duas portas - PC sobressalente
echo [4] Diagnosticar PnP, hardware IDs e COMs - leitura
echo [5] Testar COM210 para COM211 e vice-versa - 20s maximo
echo [6] Remover APENAS dispositivos LabSerial - confirmacao
echo [7] Desbloquear scripts do ZIP verificado - opcional
echo [0] Sair
echo.
choice /C 12345670 /N /M "Opcao: "
if errorlevel 8 goto DONE
if errorlevel 7 goto UNBLOCK
if errorlevel 6 goto REMOVE
if errorlevel 5 goto SMOKE
if errorlevel 4 goto INVENTORY
if errorlevel 3 goto INSTALL
if errorlevel 2 goto TRUST
if errorlevel 1 goto INSPECT
goto DONE

:INSPECT
call :CHECK_PACKAGE
if errorlevel 1 goto MENU
powershell.exe -NoProfile -File "%CD%\Inspect-LabSerialHost.ps1" -PackageDirectory "%CD%"
echo.
pause
goto MENU

:TRUST
call :CHECK_PACKAGE
if errorlevel 1 goto MENU
call :CHECK_ADMIN
if errorlevel 1 goto MENU
call :CONFIRM_LAB
if errorlevel 1 goto MENU
powershell.exe -NoProfile -File "%CD%\Trust-LabSerialTestCertificate.ps1" -PackageDirectory "%CD%" -Execute -ConfirmDedicatedNonProductionPC -ConfirmRecoveryAndConsoleAccess
echo.
echo Certificado de TESTE nao autoriza distribuicao publica.
pause
goto MENU

:INSTALL
call :CHECK_PACKAGE
if errorlevel 1 goto MENU
call :CHECK_ADMIN
if errorlevel 1 goto MENU
call :CONFIRM_LAB
if errorlevel 1 goto MENU
set "DEVGEN="
for /D %%D in ("%ProgramFiles(x86)%\Windows Kits\10\Tools\*") do if exist "%%~fD\x64\devgen.exe" set "DEVGEN=%%~fD\x64\devgen.exe"
if not defined DEVGEN (
 echo BLOQUEADO: devgen.exe x64 nao encontrado. Instale o WDK oficial da Microsoft.
 echo DevGen e usado para criar os dois devnodes root. Nao e redistribuido neste ZIP.
 pause
 goto MENU
)
echo DevGen encontrado: "%DEVGEN%"
echo O instalador verifica os HardwareIds e recusa duplicacoes e COM ocupadas.
powershell.exe -NoProfile -File "%CD%\Install-LabSerialTest.ps1" -PackageDirectory "%CD%" -DevGenPath "%DEVGEN%" -Execute -ConfirmDedicatedNonProductionPC -ConfirmRecoveryAndConsoleAccess
echo.
echo Instalacao solicitada. Verifique o resultado no Gerenciador de Dispositivos.
pause
goto MENU

:INVENTORY
powershell.exe -NoProfile -File "%CD%\Inspect-LabSerialPorts.ps1"
echo.
echo Nota: o Windows pode mostrar COM5/COM6; confira PortName e SERIALCOMM.
pause
goto MENU

:SMOKE
call :CONFIRM_LAB
if errorlevel 1 goto MENU
powershell.exe -NoProfile -File "%CD%\Run-LabSerialSmokeBounded.ps1" -ConfirmDedicatedNonProductionPC -ConfirmPortsAreLabSerial
echo.
echo Apenas o resultado real PASS em ambos sentidos confirma o teste.
pause
goto MENU

:REMOVE
call :CHECK_ADMIN
if errorlevel 1 goto MENU
echo PREVIA: somente dispositivos com HardwareIds ROOT\LABSERIAL_VCOM_A/B.
powershell.exe -NoProfile -File "%CD%\Remove-LabSerialTest.ps1"
if errorlevel 1 goto MENU
call :CONFIRM_LAB
if errorlevel 1 goto MENU
powershell.exe -NoProfile -File "%CD%\Remove-LabSerialTest.ps1" -Execute -ConfirmDedicatedNonProductionPC
echo.
echo Os certificados e TESTSIGNING NAO sao modificados.
pause
goto MENU

:UNBLOCK
call :CHECK_PACKAGE
if errorlevel 1 goto MENU
echo Scripts com SHA-256 validado podem manter a marca de download.
echo Este procedimento remove SOMENTE essa marca dos PS1 do pacote.
choice /C SN /N /M "Confirmar desbloqueio seletivo? [S/N] "
if errorlevel 2 goto MENU
powershell.exe -NoProfile -Command "Get-ChildItem -LiteralPath (Get-Location).Path -Filter '*.ps1' -File | Unblock-File -ErrorAction Stop; Write-Host 'Marcacao de download removida dos scripts validados.'"
echo Se a politica exigir AllSigned, os scripts ainda precisarao de assinatura.
pause
goto MENU

:CONFIRM_LAB
echo.
echo RISCO: driver KMDF experimental pode provocar tela azul ou perda de dados.
echo Nao utilizar no computador principal ou de trabalho.
choice /C SN /N /M "Este PC e EXCLUSIVO de laboratorio e descartavel? [S/N] "
if errorlevel 2 exit /b 1
choice /C SN /N /M "Tem BACKUP recuperavel e acesso ao console fisico? [S/N] "
if errorlevel 2 exit /b 1
exit /b 0

:CHECK_ADMIN
powershell.exe -NoProfile -Command "$p=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent()); if($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){exit 0}else{Write-Host 'BLOQUEADO: execute o BAT como Administrador.';exit 1}"
exit /b %errorlevel%

:CHECK_PACKAGE
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; try { $m=Get-Content -LiteralPath 'checksums.json' -Raw | ConvertFrom-Json; if($m.product -ne 'LabSerial' -or $m.architecture -ne 'x64' -or $m.intended_for_production -ne $false){throw 'Manifesto invalido'}; $files=@{'sys'='labserial.sys';'inf'='labserial.inf';'cat'='labserial.cat';'cer'='labserial-test.cer'}; foreach($key in $files.Keys){$f=$files[$key]; if((Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash -ne $m.sha256.$key){throw ('SHA-256 invalido: '+$f)}}; if(-not $m.scripts_sha256){throw 'Manifesto sem hashes dos scripts'}; foreach($p in $m.scripts_sha256.PSObject.Properties){if((Get-FileHash -LiteralPath $p.Name -Algorithm SHA256).Hash -ne [string]$p.Value){throw ('SHA-256 invalido: '+$p.Name)}}; Write-Host 'Integridade do pacote LabSerial verificada.';exit 0 }catch{Write-Host ('BLOQUEADO: '+$_.Exception.Message);exit 8}"
exit /b %errorlevel%

:CHECK_ONLY
call :CHECK_PACKAGE
if errorlevel 1 (
  popd
  exit /b 8
)
popd
exit /b 0

:HELP
echo LabSerial - instalador guiado de teste; execucao permitida apenas em PC sobressalente.
echo Uso: LabSerial-Instalador-Teste.bat [/help ^| /check]
echo Sem parametro, abre menu de inspecao, certificado, instalacao, teste e remocao.
echo Nunca altera BCD, Secure Boot, BitLocker ou politica global de PowerShell.
exit /b 0

:DONE
popd
exit /b 0
