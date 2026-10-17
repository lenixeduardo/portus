#requires -Version 5.1
<#
.SYNOPSIS
 Run SerialPort compatibility on a dedicated PC in a bounded child process.
.DESCRIPTION
 Never install drivers or change system settings. Kernel hangs/BSOD cannot be
 prevented by the watchdog. Use a disposable PC with physical recovery access.
#>
[CmdletBinding()]
param(
 [switch]$ConfirmDedicatedNonProductionPC,
 [switch]$ConfirmPortsAreLabSerial,
 [switch]$SelfTest
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if ($SelfTest) {
 $path=Join-Path $PSScriptRoot 'Test-LabSerialSerialPort.ps1'
 $tokens=$null;$errors=$null
 [void][Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
 if ($errors.Count -gt 0) { throw "Falha sintatica: $($errors[0].Message)" }
 Write-Host 'PASS: sintaxe dos testes de compatibilidade .NET.'
 exit 0
}
if (-not ($ConfirmDedicatedNonProductionPC -and $ConfirmPortsAreLabSerial)) {
 throw 'Exige um Windows sobressalente com recuperacao fisica e portas comprovadamente LabSerial.'
}
$script=Join-Path $PSScriptRoot 'Test-LabSerialSerialPort.ps1'
if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw 'Test-LabSerialSerialPort.ps1 ausente.' }
$root=Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'LabSerial-Evidencias'
$folder=Join-Path $root ('Compat-'+(Get-Date).ToString('yyyyMMdd-HHmmss-fff')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $folder -Force | Out-Null

$process=New-Object System.Diagnostics.Process
$start=New-Object System.Diagnostics.ProcessStartInfo
$start.FileName=Join-Path $PSHOME 'powershell.exe'
$start.Arguments='-NoProfile -NonInteractive -File "'+$script+'" -RunTests -ConfirmDedicatedNonProductionPC -ConfirmPortsAreLabSerial -OutputDirectory "'+$folder+'"'
$start.UseShellExecute=$false
$process.StartInfo=$start
Write-Host "Relatorios de compatibilidade: $folder"
try {
 if (-not $process.Start()) { throw 'Nao foi possivel iniciar teste.' }
 if (-not $process.WaitForExit(45000)) {
  try { $process.Kill();[void]$process.WaitForExit(1500) } catch { Write-Warning $_.Exception.Message }
  throw "TIMEOUT 45s: o driver pode nao implementar cancelamento/timeout real; veja $folder"
 }
 $process.Refresh()
 $exitCode=[int]$process.ExitCode
 $reports=@(Get-ChildItem -LiteralPath $folder -File -Filter 'LabSerial-SerialPort-*.json')
 if ($reports.Count -ne 1) { throw "Relatorio JSON ausente ou duplicado: $folder" }
 $report=Get-Content -LiteralPath $reports[0].FullName -Raw | ConvertFrom-Json
 if ($exitCode -ne 0 -or $report.Status -ne 'PASS') {
  throw "COMPATIBILIDADE NAO APROVADA (exit $exitCode; resultado $($report.Status)). Inspecione $($reports[0].FullName)."
 }
 $tests=@($report.Tests)
 if ($tests.Count -ne 4) { throw "Quatro quadros eram esperados, encontrados $($tests.Count)" }
 foreach ($t in $tests) {
  if ($t.Status -ne 'PASS' -or $t.TxHex -cne $t.RxHex -or $t.TxSha256 -cne $t.RxSha256) {
   throw "Inconsistencia no teste $($t.Name): $($reports[0].FullName)"
  }
 }
 Write-Host 'PASS FINAL: System.IO.Ports.SerialPort - 9600/115200 baud, 8N1, quatro quadros TX/RX.'
 Write-Host "EVIDENCIA: $($reports[0].FullName)"
} finally { $process.Dispose() }
