#requires -Version 5.1
<#
.SYNOPSIS
 Bidirectional smoke test restricted to explicit LabSerial PnP endpoints.
.DESCRIPTION
 Does not install driver, alter BCD or trust stores.
 Does send a small ASCII payload to the matched virtual serial ports.
#>
[CmdletBinding()]
param(
  [switch]$ConfirmDedicatedNonProductionPC,
  [switch]$ConfirmPortsAreLabSerial
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not ($ConfirmDedicatedNonProductionPC -and $ConfirmPortsAreLabSerial)) {
  throw 'Teste permitido somente apos confirmar PC dedicado e identidade das portas LabSerial.'
}
$aNodes = @(Get-PnpDevice -PresentOnly -ErrorAction Stop | Where-Object {
  $_.InstanceId -like 'ROOT\LABSERIAL_VCOM_A\*' -and $_.Status -eq 'OK'
})
$bNodes = @(Get-PnpDevice -PresentOnly -ErrorAction Stop | Where-Object {
  $_.InstanceId -like 'ROOT\LABSERIAL_VCOM_B\*' -and $_.Status -eq 'OK'
})
if ($aNodes.Count -ne 1 -or $bNodes.Count -ne 1) {
  throw 'Nao foi encontrado exatamente um devnode LabSerial A e um B funcionando.'
}
$map = Get-ItemProperty -LiteralPath 'HKLM:\HARDWARE\DEVICEMAP\SERIALCOMM' -ErrorAction Stop
$sideA = $map.PSObject.Properties['\Device\LabSerialA']
$sideB = $map.PSObject.Properties['\Device\LabSerialB']
if ($null -eq $sideA -or $null -eq $sideB -or
    $sideA.Value -ne 'COM210' -or $sideB.Value -ne 'COM211') {
  throw 'Mapa de portas LabSerial SERIALCOMM nao confere. Nao abra portas desconhecidas.'
}
$ports = @([System.IO.Ports.SerialPort]::GetPortNames())
if ($ports -notcontains 'COM210' -or $ports -notcontains 'COM211') {
  throw 'COM210/COM211 nao aparecem como portas seriais no Windows.'
}
$a = [System.IO.Ports.SerialPort]::new('COM210',9600,[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One)
$b = [System.IO.Ports.SerialPort]::new('COM211',9600,[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One)
$a.ReadTimeout = 2000; $b.ReadTimeout = 2000
$a.WriteTimeout = 2000; $b.WriteTimeout = 2000
function Assert-Link($sender,$receiver,$token) {
  $data = [Text.Encoding]::ASCII.GetBytes($token)
  $recv = New-Object 'byte[]' $data.Length
  $receiver.DiscardInBuffer()
  $sender.Write($data,0,$data.Length)
  $n=0
  while ($n -lt $data.Length) {
    $part = $receiver.Read($recv,$n,$data.Length-$n)
    if ($part -le 0) { throw 'Leitura retornou zero bytes.' }
    $n+=$part
  }
  if ([BitConverter]::ToString($recv) -ne [BitConverter]::ToString($data)) { throw 'Bytes divergentes.' }
  Write-Host "PASS: $($sender.PortName) -> $($receiver.PortName), $n bytes"
}
try {
  $a.Open(); $b.Open()
  $token = [guid]::NewGuid().ToString('N')
  Assert-Link $a $b "A-$token"
  Assert-Link $b $a "B-$token"
  Write-Host 'PASS: LabSerial bidirecional, apenas teste de smoke.'
} finally {
  if ($a.IsOpen) { $a.Close() }
  if ($b.IsOpen) { $b.Close() }
  $a.Dispose(); $b.Dispose()
}
