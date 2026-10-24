#requires -Version 5.1
<#
.SYNOPSIS
 Read-only investigation of LabSerial PnP devices and COM names on Windows.
.DESCRIPTION
 DevGen may generate an InstanceId ROOT\DEV\... even when HardwareIds contain
 ROOT\LABSERIAL_VCOM_A/B. Windows may assign PortName COM5/COM6 in the device
 registry while the experimental KMDF driver exposes COM210/COM211 internally.
 This script NEVER opens a COM device or changes the registry.
#>
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expected = @('ROOT\LABSERIAL_VCOM_A','ROOT\LABSERIAL_VCOM_B')
$report = New-Object System.Collections.Generic.List[object]
foreach ($dev in @(Get-PnpDevice -Class Ports -ErrorAction Stop | Where-Object {
    $_.FriendlyName -like '*LabSerial*'
})) {
    $hw = @(Get-PnpDeviceProperty -InstanceId $dev.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds' -ErrorAction SilentlyContinue | ForEach-Object { $_.Data })
    $service = (Get-PnpDeviceProperty -InstanceId $dev.InstanceId -KeyName 'DEVPKEY_Device_Service' -ErrorAction SilentlyContinue).Data
    $regPath = 'HKLM:\SYSTEM\CurrentControlSet\Enum\' + $dev.InstanceId + '\Device Parameters'
    $port = (Get-ItemProperty -LiteralPath $regPath -Name PortName -ErrorAction SilentlyContinue).PortName
    $matched = @($hw | Where-Object { $_ -in $expected })
    $report.Add([pscustomobject]@{
      Status = $dev.Status
      Name = $dev.FriendlyName
      InstanceId = $dev.InstanceId
      HardwareIds = @($hw)
      MatchedLabSerialIds = @($matched)
      DriverService = [string]$service
      PnP_PortName = [string]$port
    })
}
$mapEntries = @()
try {
  $map = Get-ItemProperty -LiteralPath 'HKLM:\HARDWARE\DEVICEMAP\SERIALCOMM' -ErrorAction Stop
  foreach ($name in @('\Device\LabSerialA', '\Device\LabSerialB')) {
    $p = $map.PSObject.Properties[$name]
    $mapEntries += [pscustomobject]@{ KernelDevice = $name; MappedPort = if ($null -eq $p) { '' } else { [string]$p.Value } }
  }
} catch {
  $mapEntries += [pscustomobject]@{ KernelDevice = 'SERIALCOMM'; MappedPort = "Indisponivel: $($_.Exception.Message)" }
}
[pscustomobject]@{
    LabSerialPnP = @($report.ToArray())
    LabSerialKernelMap = @($mapEntries)
    EnumeratedCOM = @([System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object)
} | ConvertTo-Json -Depth 7
