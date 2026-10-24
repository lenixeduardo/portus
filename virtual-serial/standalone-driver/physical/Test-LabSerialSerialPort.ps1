#requires -Version 5.1
<#
.SYNOPSIS
 Validate .NET System.IO.Ports.SerialPort compatibility against installed LabSerial.
.DESCRIPTION
 Read-only inventory by default. -RunTests opens only verified COM210/COM211,
 performs SerialPort.Open, 9600/115200 configuration and actual bidirectional
 ASCII and binary I/O. Cannot guarantee kernel-level timeouts: use bounded runner.
 Every execution writes a JSON+TXT report. Does not install/update kernel driver.
#>
[CmdletBinding()]
param(
 [switch]$RunTests,
 [switch]$ConfirmDedicatedNonProductionPC,
 [switch]$ConfirmPortsAreLabSerial,
 [string]$OutputDirectory = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'LabSerial-Evidencias')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$start = Get-Date
$report = [ordered]@{
 Product='LabSerial'
 Suite='System.IO.Ports.SerialPort'
 Host=$env:COMPUTERNAME
 TimeUtc=$start.ToUniversalTime().ToString('o')
 RunTests=[bool]$RunTests
 Status='NOT_STARTED'
 LabSerialDevices=@()
 Ports=@()
 Tests=@()
 Error=$null
}
$records = New-Object System.Collections.Generic.List[object]
$base = $null
function Hex([byte[]]$bytes) { return [BitConverter]::ToString($bytes).Replace('-','') }
function SHA([byte[]]$bytes) {
 $h=[Security.Cryptography.SHA256]::Create()
 try { return (Hex $h.ComputeHash($bytes)) }
 finally { $h.Dispose() }
}
function ReadExact([System.IO.Ports.SerialPort]$p,[int]$length) {
 $buffer = New-Object 'byte[]' $length
 $received=0
 while ($received -lt $length) {
  $n = $p.Read($buffer,$received,$length-$received)
  if ($n -le 0) { throw 'Leitura serial terminou sem dados.' }
  $received+=$n
 }
 return ,$buffer
}
function RunCase([System.IO.Ports.SerialPort]$tx,
  [System.IO.Ports.SerialPort]$rx,[byte[]]$payload,[string]$testName) {
 $record=[ordered]@{
  Name=$testName; Sender=$tx.PortName; Receiver=$rx.PortName;
  Bytes=$payload.Length; TxSha256=SHA $payload; RxSha256=$null;
  TxHex=(Hex $payload); RxHex=$null; Status='FAIL'; Error=$null
 }
 try {
  $rx.DiscardInBuffer()
  $tx.Write($payload,0,$payload.Length)
  [byte[]]$read=ReadExact $rx $payload.Length
  $record.RxHex=Hex $read
  $record.RxSha256=SHA $read
  if ($record.TxHex -cne $record.RxHex) { throw 'Dados transmitidos e recebidos diferem.' }
  $record.Status='PASS'
  Write-Host "PASS $testName $($tx.PortName) -> $($rx.PortName), $($payload.Length) bytes"
 } catch {
  $record.Error=$_.Exception.ToString()
  Write-Host "FAIL $testName : $($_.Exception.Message)"
 }
 $records.Add([pscustomobject]$record)
 if ($record.Status -ne 'PASS') { throw "Falha de compatibilidade .NET no caso $testName." }
}
function CreatePort([string]$name,[int]$baud) {
 $p=[System.IO.Ports.SerialPort]::new($name,$baud,[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One)
 $p.Handshake=[System.IO.Ports.Handshake]::None
 $p.ReadTimeout=2500
 $p.WriteTimeout=2500
 return $p
}
try {
 if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem) { throw 'Requer Windows x64.' }
 $verify = @(
  @{ ID='ROOT\LABSERIAL_VCOM_A'; COM='COM210'; Kernel='\Device\LabSerialA' },
  @{ ID='ROOT\LABSERIAL_VCOM_B'; COM='COM211'; Kernel='\Device\LabSerialB' }
 )
 $present = @()
 foreach ($device in @(Get-PnpDevice -PresentOnly -Class Ports -ErrorAction Stop)) {
  $hwInfo=Get-PnpDeviceProperty -InstanceId $device.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds' -ErrorAction SilentlyContinue
  $hw=if($null -eq $hwInfo){@()}else{@($hwInfo.Data)}
  foreach ($item in $verify) {
   if ($hw -contains $item.ID) {
    $svcInfo=Get-PnpDeviceProperty -InstanceId $device.InstanceId -KeyName 'DEVPKEY_Device_Service' -ErrorAction SilentlyContinue
    $svc=if($null -eq $svcInfo){''}else{[string]$svcInfo.Data}
    $reg='HKLM:\SYSTEM\CurrentControlSet\Enum\'+$device.InstanceId+'\Device Parameters'
    $port=(Get-ItemProperty -LiteralPath $reg -Name PortName -ErrorAction SilentlyContinue).PortName
    $present += [pscustomobject]@{
     Id=$item.ID; InstanceId=$device.InstanceId; Status=$device.Status;
     Service=$svc; Name=$device.FriendlyName; PnPPortName=[string]$port
    }
   }
  }
 }
 $report.LabSerialDevices=$present
 $report.Ports=@([System.IO.Ports.SerialPort]::GetPortNames())
 $map=Get-ItemProperty -LiteralPath 'HKLM:\HARDWARE\DEVICEMAP\SERIALCOMM' -ErrorAction Stop
 $native=Join-Path $PSScriptRoot 'LabSerialNativeProbe.cs'
 if (-not (Test-Path -LiteralPath $native -PathType Leaf)) { throw 'LabSerialNativeProbe.cs ausente.' }
 if (-not ('LabSerialNativeProbe' -as [type])) { Add-Type -Path $native -ErrorAction Stop }
 foreach ($item in $verify) {
  $found=@($present | Where-Object { $_.Id -eq $item.ID })
  if ($found.Count -ne 1 -or $found[0].Status -ne 'OK' -or
      $found[0].Service -ne 'LabSerial' -or $found[0].PnPPortName -ne $item.COM) {
    throw "Identidade/status/PortName invalido para $($item.ID)."
  }
  $serialValue=$map.PSObject.Properties[$item.Kernel]
  if ($null -eq $serialValue -or [string]$serialValue.Value -ne $item.COM) {
   throw "SERIALCOMM nao confirma $($item.Kernel) => $($item.COM)."
  }
  if ($report.Ports -notcontains $item.COM) { throw "$($item.COM) nao enumerada em GetPortNames." }
  if ([LabSerialNativeProbe]::ResolveLink($item.COM) -ine $item.Kernel) {
   throw "QueryDosDevice($($item.COM)) aponta para dispositivo diferente de $($item.Kernel)."
  }
 }
 Write-Host 'PnP: dois LabSerial verificados e portas COM210/COM211 identificadas.'
 if (-not $RunTests) {
  $report.Status='INVENTORY_ONLY'
  Write-Host 'Modo inventario: nenhuma porta foi aberta.'
 } else {
  if (-not ($ConfirmDedicatedNonProductionPC -and $ConfirmPortsAreLabSerial)) {
   throw 'Teste real recusado: somente computador de laboratorio com recuperacao e identidade das portas verificada.'
  }
  $elevated=([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $elevated) { throw 'Execute como Administrador no PC de laboratorio.' }
  foreach ($baud in @(9600,115200)) {
   $a=CreatePort 'COM210' $baud
   $b=CreatePort 'COM211' $baud
   try {
    Write-Host "Abrindo System.IO.Ports.SerialPort em COM210 e COM211 a $baud baud, 8N1, Handshake.None"
    $a.Open()
    $b.Open()
    $token=[Guid]::NewGuid().ToString('N')
    [byte[]]$ascii=[Text.Encoding]::ASCII.GetBytes("NET-$baud-$token")
    [byte[]]$binary=@(0,1,2,3,10,13,17,19,127,128,254,255,0,255,85,170)
    RunCase $a $b $ascii "ASCII $baud A-B"
    RunCase $b $a $binary "BINARY $baud B-A"
   } finally {
    if ($a.IsOpen) { $a.Close() }
    if ($b.IsOpen) { $b.Close() }
    $a.Dispose(); $b.Dispose()
   }
  }
  $report.Status='PASS'
  Write-Host 'PASS: System.IO.Ports.SerialPort abriu ambas as portas e transferiu dados em duas velocidades.'
 }
} catch {
 $report.Status='FAIL'
 $report.Error=$_.Exception.ToString()
 Write-Host "FAIL COMPATIBILIDADE: $($_.Exception.Message)"
} finally {
 $report.Tests=@($records.ToArray())
 $report.EndTimeUtc=(Get-Date).ToUniversalTime().ToString('o')
 New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
 $stamp=$start.ToString('yyyyMMdd-HHmmss-fff')
 $base=Join-Path $OutputDirectory "LabSerial-SerialPort-$stamp"
 $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath "$base.json" -Encoding UTF8
 $txt=@(
  "LabSerial - teste de compatibilidade System.IO.Ports.SerialPort",
  "Status: $($report.Status)",
  "Inicio UTC: $($report.TimeUtc)",
  "Fim UTC: $($report.EndTimeUtc)",
  "Testes executados: $($records.Count)"
 )
 foreach($case in $records){ $txt+="$($case.Name): $($case.Status); TX=$($case.TxSha256); RX=$($case.RxSha256)" }
 if ($report.Error) { $txt+="ERROR: $($report.Error)" }
 $txt | Set-Content -LiteralPath "$base.txt" -Encoding UTF8
 Write-Host "EVIDENCIA JSON: $base.json"
 Write-Host "EVIDENCIA TXT:  $base.txt"
}
if ($report.Status -eq 'FAIL') { exit 1 }
exit 0
