#requires -Version 5.1
<#
.SYNOPSIS
 Execute the LabSerial transfer verification with reliable child exit status.
.DESCRIPTION
 Real transfer only on an approved, spare Windows test host.
 Uses System.Diagnostics.Process (not Start-Process -NoNewWindow -PassThru,
 which returned an empty ExitCode on Windows PowerShell 5.1 during the first
 successful real COM210 <-> COM211 transmission, 17/10/2026).
 The watchdog only limits user-mode time; it does not protect against a BSOD.
 -SelfTest exercises process exit codes and a timeout without opening any COM.
#>
[CmdletBinding()]
param(
  [switch]$ConfirmDedicatedNonProductionPC,
  [switch]$ConfirmPortsAreLabSerial,
  [switch]$SelfTest
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-LabSerialChild([string]$CommandArguments,[int]$TimeoutMs) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = Join-Path $PSHOME 'powershell.exe'
  $psi.Arguments = $CommandArguments
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $false
  $child = New-Object System.Diagnostics.Process
  $child.StartInfo = $psi
  try {
    if (-not $child.Start()) { throw 'Falha ao iniciar processo PowerShell.' }
    if (-not $child.WaitForExit($TimeoutMs)) {
      try {
        $child.Kill()
        [void]$child.WaitForExit(1500)
      } catch {
        Write-Warning "Nao foi possivel encerrar processo: $($_.Exception.Message)"
      }
      throw "TIMEOUT apos $TimeoutMs ms. Nao repita no mesmo estado sem revisar o ambiente e os logs."
    }
    $child.Refresh()
    # An explicit int from a completed .NET Process avoids an empty ExitCode.
    return [int]$child.ExitCode
  } finally {
    $child.Dispose()
  }
}

if ($SelfTest) {
  $ok = Invoke-LabSerialChild '-NoProfile -NonInteractive -Command "exit 0"' 15000
  if ($ok -ne 0) { throw "Autoteste exit 0 falhou: $ok" }
  $failure = Invoke-LabSerialChild '-NoProfile -NonInteractive -Command "exit 7"' 15000
  if ($failure -ne 7) { throw "Autoteste exit 7 falhou: $failure" }
  $timedOut = $false
  try {
    [void](Invoke-LabSerialChild '-NoProfile -NonInteractive -Command "Start-Sleep -Seconds 4; exit 0"' 300)
  } catch {
    if ($_.Exception.Message -like '*TIMEOUT*') { $timedOut = $true }
    else { throw }
  }
  if (-not $timedOut) { throw 'Autoteste de timeout falhou.' }
  Write-Host 'PASS: watchdog e captura de exit codes 0/7/timeout (sem usar driver).'
  exit 0
}

if (-not ($ConfirmDedicatedNonProductionPC -and $ConfirmPortsAreLabSerial)) {
  throw 'Teste permitido somente em PC sobressalente de laboratorio com backup e COM210/COM211 verificadas.'
}
$script = Join-Path $PSScriptRoot 'Evidence-LabSerialTransfer.ps1'
if (-not (Test-Path -LiteralPath $script -PathType Leaf)) {
  throw 'Evidence-LabSerialTransfer.ps1 ausente.'
}

$root = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'LabSerial-Evidencias'
$sessionId = (Get-Date).ToString('yyyyMMdd-HHmmss-fff') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
$runDirectory = Join-Path $root "Sessao-$sessionId"
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
Write-Host "Pasta de evidencias desta execucao: $runDirectory"

$childArguments = '-NoProfile -NonInteractive -File "' + $script + '" -RunTransfer ' +
  '-ConfirmDedicatedNonProductionPC -ConfirmPortsAreLabSerial -OutputDirectory "' + $runDirectory + '"'

$exitCode = Invoke-LabSerialChild $childArguments 75000
if ($exitCode -ne 0) {
  throw "Processo de teste retornou $exitCode. Evidencias: $runDirectory"
}

$files = @(Get-ChildItem -LiteralPath $runDirectory -Filter 'LabSerial-Transmissao-*.json' -File)
if ($files.Count -ne 1) { throw "Esperado um relatorio JSON, encontrados $($files.Count): $runDirectory" }
$r = Get-Content -LiteralPath $files[0].FullName -Raw | ConvertFrom-Json
if ($r.Product -ne 'LabSerial' -or $r.Result -ne 'PASS' -or -not $r.RequestedTransfer) {
  throw 'Relatorio nao declarou PASS de transmissao LabSerial.'
}
$frames = @($r.Tests)
if ($frames.Count -ne 6) { throw "Relatorio incompleto: $($frames.Count)/6 quadros." }

$aToB = 0
$bToA = 0
$bytesVerified = 0
foreach ($frame in $frames) {
  if ($frame.Status -ne 'PASS' -or
      [int]$frame.ExpectedBytes -le 0 -or
      [int]$frame.WrittenBytes -ne [int]$frame.ExpectedBytes -or
      [int]$frame.ReceivedBytes -ne [int]$frame.ExpectedBytes -or
      [string]::IsNullOrWhiteSpace([string]$frame.TxHex) -or
      $frame.TxHex -cne $frame.RxHex -or
      [string]::IsNullOrWhiteSpace([string]$frame.TxSha256) -or
      $frame.TxSha256 -cne $frame.RxSha256) {
    throw "Quadro FAIL/inconsistente: $($frame.Case). Verifique o JSON em $runDirectory"
  }
  if ($frame.Sender -eq 'COM210' -and $frame.Receiver -eq 'COM211') { $aToB++ }
  elseif ($frame.Sender -eq 'COM211' -and $frame.Receiver -eq 'COM210') { $bToA++ }
  else { throw "Par de portas inesperado: $($frame.Sender) -> $($frame.Receiver)" }
  $bytesVerified += [int]$frame.ExpectedBytes
}
if ($aToB -ne 3 -or $bToA -ne 3) {
  throw "Direcoes incompletas: A->B=$aToB; B->A=$bToA."
}
Write-Host "PASS FINAL: $($frames.Count) quadros, $bytesVerified bytes verificados, A->B=$aToB e B->A=$bToA."
Write-Host "EVIDENCIA JSON: $($files[0].FullName)"
Write-Host 'O sucesso valida apenas este smoke test, nao producao/estabilidade do driver.'
exit 0
