#requires -Version 5.1
<#
.SYNOPSIS
 Run LabSerial transfer evidence in a separate process, at most 75 seconds.
.DESCRIPTION
 This only limits user-mode execution; cannot guarantee recovery from a kernel BSOD.
#>
[CmdletBinding()]
param(
  [switch]$ConfirmDedicatedNonProductionPC,
  [switch]$ConfirmPortsAreLabSerial
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not ($ConfirmDedicatedNonProductionPC -and $ConfirmPortsAreLabSerial)) {
  throw 'Apenas PC sobressalente de laboratorio com recuperacao e endpoints identificados.'
}
$script = Join-Path $PSScriptRoot 'Evidence-LabSerialTransfer.ps1'
if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw 'Evidence-LabSerialTransfer.ps1 ausente.' }
$arguments = '-NoProfile -File "' + $script + '" -RunTransfer -ConfirmDedicatedNonProductionPC -ConfirmPortsAreLabSerial'
$child = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -NoNewWindow -PassThru -ErrorAction Stop
try {
  if (-not $child.WaitForExit(75000)) {
    try { $child.Kill() } catch { Write-Warning "Falha ao encerrar teste: $($_.Exception.Message)" }
    throw 'TIMEOUT GLOBAL 75s. Nao repita sem verificar ambiente e logs.'
  }
  if ($child.ExitCode -ne 0) { throw "Teste NAO aprovado (exit code $($child.ExitCode)). Veja JSON/TXT em Documentos\LabSerial-Evidencias." }
  Write-Host 'PASS: verificar os seis quadros com bytes e hashes identicos no relatorio.'
} finally {
  $child.Dispose()
}
