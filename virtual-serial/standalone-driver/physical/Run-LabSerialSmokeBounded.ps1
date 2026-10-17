#requires -Version 5.1
<#
.SYNOPSIS
 Run LabSerial smoke test in a child process, with a hard 20-second user-mode limit.
.DESCRIPTION
 Does not guarantee recovery from a kernel hang or BSOD. Only on disposable PC.
#>
[CmdletBinding()]
param(
 [switch]$ConfirmDedicatedNonProductionPC,
 [switch]$ConfirmPortsAreLabSerial
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if (-not ($ConfirmDedicatedNonProductionPC -and $ConfirmPortsAreLabSerial)) {
 throw 'Confirme a identidade dos endpoints e que o PC e descartavel de laboratorio.'
}
$script = Join-Path $PSScriptRoot 'Test-LabSerialPorts.ps1'
if (-not (Test-Path -LiteralPath $script -PathType Leaf)) {
 throw 'Test-LabSerialPorts.ps1 ausente.'
}
# 20s is a guard against user-mode ReadFile hanging when serial timeout
# semantics are not yet implemented by the experimental kernel driver.
$child = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-File',('"'+$script+'"'),'-ConfirmDedicatedNonProductionPC','-ConfirmPortsAreLabSerial') -PassThru -NoNewWindow
try {
 if (-not $child.WaitForExit(20000)) {
   try { $child.Kill() } catch { Write-Warning "Nao foi possivel interromper processo: $($_.Exception.Message)" }
   throw 'TIMEOUT de 20s: verifique logs, nao repita no mesmo estado. Kernel pode nao cancelar I/O.'
 }
 if ($child.ExitCode -ne 0) { throw "Teste falhou. Codigo de saida: $($child.ExitCode)" }
 Write-Host 'Resultado do smoke test acima. Ainda faltam testes de reboot, PnP e Driver Verifier.'
} finally {
 $child.Dispose()
}
