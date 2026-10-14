# LabSerial standalone diagnostic CLI. Works without PORTUS.
# It does not create a COM port. No driver installation command is exposed.
[CmdletBinding()]
param(
  [ValidateSet('status','test')][string]$Action = 'status',
  [ValidatePattern('^COM[0-9]+$')][string]$PortA = 'COM210',
  [ValidatePattern('^COM[0-9]+$')][string]$PortB = 'COM211',
  [ValidateRange(1,4000000)][int]$BaudRate = 9600,
  [switch]$ConfirmTestVm,
  [switch]$ConfirmPortsBelongToLabSerial
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'LabSerial requires Windows.' }
if ($PortA -eq $PortB) { throw 'Ports must be distinct.' }

function Get-LabSerialPortInventory {
  $serialClass = @(Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue)
  $links = @([System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object -Unique)
  $names = @{}
  foreach ($device in $serialClass) {
    if ($device.DeviceID) { $names[$device.DeviceID] = $device.Name }
  }
  foreach ($name in $links) {
    [PSCustomObject]@{ Name = $name; Description = $names[$name] }
  }
}

$inventory = @(Get-LabSerialPortInventory)
$inventory | Format-Table -AutoSize
if ($Action -eq 'status') {
  Write-Host 'Status only: no driver loaded or changed by this command.'
  return
}
if (-not ($ConfirmTestVm -and $ConfirmPortsBelongToLabSerial)) {
  throw 'Refused: test requires -ConfirmTestVm and -ConfirmPortsBelongToLabSerial.'
}
if ($PortA -notin @($inventory.Name) -or $PortB -notin @($inventory.Name)) {
  throw 'One or both ports do not exist. The driver may not be installed.'
}
# Test is intentionally limited to explicitly approved disposable VMs and virtual COM endpoints.
$a = [System.IO.Ports.SerialPort]::new($PortA,$BaudRate,[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One)
$b = [System.IO.Ports.SerialPort]::new($PortB,$BaudRate,[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One)
$a.ReadTimeout = 2000; $b.ReadTimeout = 2000
$a.WriteTimeout = 2000; $b.WriteTimeout = 2000
function Assert-Transport($sender,$receiver,$payload) {
  $bytes = [System.Text.Encoding]::ASCII.GetBytes($payload)
  $sender.Write($bytes,0,$bytes.Length)
  $seen = New-Object 'byte[]' $bytes.Length
  $size = 0
  while ($size -lt $bytes.Length) {
    $size += $receiver.Read($seen,$size,$bytes.Length-$size)
  }
  if ([Convert]::ToHexString($bytes) -ne [Convert]::ToHexString($seen)) {
    throw "Mismatched bytes: $($sender.PortName) -> $($receiver.PortName)"
  }
  Write-Host "PASS: $($sender.PortName) -> $($receiver.PortName)"
}
try {
  $a.Open(); $b.Open()
  $random = [Guid]::NewGuid().ToString('N')
  Assert-Transport $a $b "LAB-A-$random"
  Assert-Transport $b $a "LAB-B-$random"
  Write-Host 'PASS: standalone serial test.'
} finally {
  if ($a.IsOpen) { $a.Close() }
  if ($b.IsOpen) { $b.Close() }
  $a.Dispose(); $b.Dispose()
}
