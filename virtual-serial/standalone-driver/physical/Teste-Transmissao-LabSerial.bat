@echo off
setlocal EnableExtensions DisableDelayedExpansion
title LabSerial - Evidencia de Transmissao (nao instalador)
pushd "%~dp0" 2>nul
if errorlevel 1 (
 echo ERRO: nao foi possivel acessar pasta do teste.
 exit /b 3
)
echo =====================================================
echo LABSERIAL: TESTE DE TRANSMISSAO COM210 ^<--^> COM211
echo =====================================================
echo NAO altera drivers, certificados, BCD ou portas COM.
echo Seis quadros: ASCII, binario e 512 bytes, ambos sentidos.
echo Evidencias: Documentos\LabSerial-Evidencias (JSON/TXT).
echo RISCO: driver KMDF experimental pode provocar BSOD.
echo.
if not exist "Evidence-LabSerialTransfer.ps1" goto MISSING
if not exist "LabSerialNativeProbe.cs" goto MISSING
if not exist "Run-LabSerialEvidenceBounded.ps1" goto MISSING
echo [1] Somente diagnostico / nao envia dados
echo [2] Teste de transmissao REAL / PC de laboratorio
echo [0] Sair
choice /C 120 /N /M "Escolha: "
if errorlevel 3 goto END
if errorlevel 2 goto REAL
if errorlevel 1 goto INSPECT
goto END

:INSPECT
powershell.exe -NoProfile -File "%CD%\Evidence-LabSerialTransfer.ps1"
echo.
pause
goto END

:REAL
echo ATENCAO: nao executar no Windows principal.
choice /C SN /N /M "PC SOBRESSALENTE com backup recuperavel e console fisico? [S/N] "
if errorlevel 2 goto END
choice /C SN /N /M "HardwareIds e servico LabSerial, COM210/COM211 confirmados? [S/N] "
if errorlevel 2 goto END
powershell.exe -NoProfile -File "%CD%\Run-LabSerialEvidenceBounded.ps1" -ConfirmDedicatedNonProductionPC -ConfirmPortsAreLabSerial
echo.
echo Verifique o resultado real em Documentos\LabSerial-Evidencias.
pause
goto END

:MISSING
echo ERRO: arquivos do teste ausentes na mesma pasta do BAT.
pause

:END
popd
exit /b 0
