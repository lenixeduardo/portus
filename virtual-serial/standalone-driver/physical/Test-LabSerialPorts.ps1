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
# DevGen enumerates ROOT\DEV\000X with HardwareIds ROOT\LABSERIAL_VCOM_A/B.
# Never infer LabSerial ownership from COM number or FriendlyName alone.
$byId = @{}
foreach ($node in @(Get-PnpDevice -Class Ports -PresentOnly -ErrorAction Stop)) {
  $hwInfo = Get-PnpDeviceProperty -InstanceId $node.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds' -ErrorAction SilentlyContinue
  $hw = @()
  if ($null -ne $hwInfo) { $hw = @($hwInfo.Data) }
  foreach ($id in @('ROOT\LABSERIAL_VCOM_A','ROOT\LABSERIAL_VCOM_B')) {
    if ($hw -contains $id) {
      if (-not $byId.ContainsKey($id)) { $byId[$id] = @() }
      $byId[$id] += $node
    }
  }
}
foreach ($id in @('ROOT\LABSERIAL_VCOM_A','ROOT\LABSERIAL_VCOM_B')) {
  if (-not $byId.ContainsKey($id) -or @($byId[$id]).Count -ne 1) {
    throw "Esperado exatamente um devnode com HardwareId $id. Rode Inspect-LabSerialPorts.ps1 antes de abrir portas."
  }
  $node = @($byId[$id])[0]
  $serviceInfo = Get-PnpDeviceProperty -InstanceId $node.InstanceId -KeyName 'DEVPKEY_Device_Service' -ErrorAction SilentlyContinue
  if ($node.Status -ne 'OK' -or $null -eq $serviceInfo -or $serviceInfo.Data -ne 'LabSerial') {
    throw "O devnode $id nao possui status OK e servico LabSerial."
  }
  Write-Host "Confirmado: $id => $($node.FriendlyName) ($($node.InstanceId))"
}
# The current kernel driver creates hard-coded COM210 and COM211 symbolic links,
# even if the Windows Ports class installer displays COM5/COM6.
# Validate Win32 symbolic links before opening them; do not open displayed ports blindly.
if (-not ('LabSerialDosNames' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class LabSerialDosNames {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern uint QueryDosDevice(string lpDeviceName, StringBuilder lpTargetPath, int ucchMax);
}
'@
}
foreach ($entry in @(
  @{ Name='COM210'; Expected='\Device\LabSerialA' },
  @{ Name='COM211'; Expected='\Device\LabSerialB' }
)) {
  $buf = New-Object System.Text.StringBuilder 2048
  $result = [LabSerialDosNames]::QueryDosDevice($entry.Name, $buf, $buf.Capacity)
  if ($result -eq 0) {
    throw "Link Win32 ausente: $($entry.Name). Rode Inspect-LabSerialPorts.ps1; nao abra COM5/COM6 sem confirmar a origem."
  }
  $target = ($buf.ToString() -split [char]0)[0]
  if ($target -ine $entry.Expected) {
    throw "$($entry.Name) mapeia para $target, mas deveria ser $($entry.Expected). Teste bloqueado."
  }
}
$map = Get-ItemProperty -LiteralPath 'HKLM:\HARDWARE\DEVICEMAP\SERIALCOMM' -ErrorAction Stop
$sideA = $map.PSObject.Properties['\Device\LabSerialA']
$sideB = $map.PSObject.Properties['\Device\LabSerialB']
if ($null -eq $sideA -or $null -eq $sideB -or
    $sideA.Value -ne 'COM210' -or $sideB.Value -ne 'COM211') {
  throw 'Mapa de portas LabSerial SERIALCOMM nao confere. Rode Inspect-LabSerialPorts.ps1.'
}
$ports = @([System.IO.Ports.SerialPort]::GetPortNames())
if ($ports -notcontains 'COM210' -or $ports -notcontains 'COM211') {
  throw 'COM210/COM211 nao aparecem em GetPortNames, embora o PnP possa exibir outros numeros. Rode Inspect-LabSerialPorts.ps1.'
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
