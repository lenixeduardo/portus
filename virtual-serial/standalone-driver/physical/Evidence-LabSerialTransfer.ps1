#requires -Version 5.1
<#
.SYNOPSIS
 Produce a machine-readable proof of a LabSerial COM210 <-> COM211 transfer.
.DESCRIPTION
 Default is read-only inventory and logs. -RunTransfer requires explicit lab-only
 confirmations and sends six bounded binary frames by native overlapped Win32 I/O.
 Does not install/uninstall a driver, alter registry, trust, BCD or system firmware.
 Generates JSON + TXT evidence with timestamps, PnP ownership, COM mappings,
 TX/RX hex, lengths, SHA-256 and per-frame PASS/FAIL.
#>
[CmdletBinding()]
param(
  [switch]$RunTransfer,
  [switch]$ConfirmDedicatedNonProductionPC,
  [switch]$ConfirmPortsAreLabSerial,
  [ValidateRange(1000,15000)][int]$TimeoutMs = 5000,
  [string]$OutputDirectory = (Join-Path $env:USERPROFILE 'Documents\LabSerial-Evidencias')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$started = Get-Date
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$stamp = $started.ToString('yyyyMMdd-HHmmss-fff')
$base = Join-Path $OutputDirectory "LabSerial-Transmissao-$stamp"
$report = [ordered]@{
  Product = 'LabSerial'
  TestOnly = $true
  StartTimeUtc = $started.ToUniversalTime().ToString('o')
  Host = $env:COMPUTERNAME
  RequestedTransfer = [bool]$RunTransfer
  Result = 'NOT_STARTED'
  PnPDevices = @()
  PortMappings = @()
  EnumeratedCOM = @()
  Observations = @()
  Tests = @()
  Error = $null
}
$observations = New-Object System.Collections.Generic.List[string]
$frames = New-Object System.Collections.Generic.List[object]

function Get-HashHex([byte[]]$bytes) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','') }
  finally { $sha.Dispose() }
}
function Hex([byte[]]$bytes) { return [BitConverter]::ToString($bytes).Replace('-','') }

try {
  if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem) {
    throw 'Este teste exige Windows x64.'
  }
  $source = Join-Path $PSScriptRoot 'LabSerialNativeProbe.cs'
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Arquivo C# ausente: $source" }
  if (-not ('LabSerialNativeProbe' -as [type])) { Add-Type -Path $source -ErrorAction Stop }

  # PnP class 'Ports' includes com0com and other devices. Match only LabSerial HARDWARE IDS.
  $expected = @(
    @{ Id='ROOT\LABSERIAL_VCOM_A'; Port='COM210'; Link='\Device\LabSerialA' },
    @{ Id='ROOT\LABSERIAL_VCOM_B'; Port='COM211'; Link='\Device\LabSerialB' }
  )
  $devices = New-Object System.Collections.Generic.List[object]
  foreach ($node in @(Get-PnpDevice -Class Ports -PresentOnly -ErrorAction Stop)) {
    $hwRecord = Get-PnpDeviceProperty -InstanceId $node.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds' -ErrorAction SilentlyContinue
    $hw = if ($null -eq $hwRecord) { @() } else { @($hwRecord.Data) }
    $matched = @($hw | Where-Object { $_ -in @('ROOT\LABSERIAL_VCOM_A','ROOT\LABSERIAL_VCOM_B') })
    if ($matched.Count -eq 0) { continue }
    $svcRecord = Get-PnpDeviceProperty -InstanceId $node.InstanceId -KeyName 'DEVPKEY_Device_Service' -ErrorAction SilentlyContinue
    $service = if ($null -eq $svcRecord) { '' } else { [string]$svcRecord.Data }
    $reg = 'HKLM:\SYSTEM\CurrentControlSet\Enum\' + $node.InstanceId + '\Device Parameters'
    $port = (Get-ItemProperty -LiteralPath $reg -Name PortName -ErrorAction SilentlyContinue).PortName
    $devices.Add([pscustomobject]@{
      Name = $node.FriendlyName
      Status = $node.Status
      InstanceId = $node.InstanceId
      HardwareIds = @($hw)
      MatchedIds = @($matched)
      DriverService = $service
      PnPPortName = [string]$port
    })
  }
  $report.PnPDevices = @($devices.ToArray())
  $report.EnumeratedCOM = @([System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object -Unique)
  $serialMap = Get-ItemProperty -LiteralPath 'HKLM:\HARDWARE\DEVICEMAP\SERIALCOMM' -ErrorAction Stop
  $matchedNodes = @{}
  foreach ($item in $expected) {
    $matched = @($devices.ToArray() | Where-Object { $_.MatchedIds -contains $item.Id })
    if ($matched.Count -ne 1) { throw "Esperado um dispositivo $($item.Id), encontrado $($matched.Count). Nao ha evidencia suficiente para abrir portas." }
    $node = $matched[0]
    if ($node.Status -ne 'OK' -or $node.DriverService -ne 'LabSerial') {
      throw "PnP $($item.Id) sem status OK e servico LabSerial."
    }
    $matchedNodes[$item.Id] = $node
    if ($node.PnPPortName -ne $item.Port) {
      throw "$($item.Id): PortName PnP $($node.PnPPortName), esperado $($item.Port)."
    }
    $p = $serialMap.PSObject.Properties[$item.Link]
    if ($null -eq $p -or [string]$p.Value -ne $item.Port) {
      throw "SERIALCOMM nao confirma $($item.Link) => $($item.Port)."
    }
    if ($report.EnumeratedCOM -notcontains $item.Port) {
      throw "SerialPort.GetPortNames nao encontra $($item.Port)."
    }
    $link = [LabSerialNativeProbe]::ResolveLink($item.Port)
    if ($link -ine $item.Link) {
      throw "QueryDosDevice($($item.Port)) => $link, esperado $($item.Link)."
    }
    $report.PortMappings += [pscustomobject]@{
      KernelLink = $item.Link
      Win32COM = $item.Port
      QueryDosDevice = $link
      PnPPortName = $node.PnPPortName
      PnPInstanceId = $node.InstanceId
    }
    if ($node.Name -notlike "*($($item.Port))*") {
      $observations.Add("Divergencia visual: nome PnP '$($node.Name)' nao exibe $($item.Port), mas PortName/SERIALCOMM/DOS confirmam $($item.Port).")
    }
  }
  $observations.Add('COM3/COM4 e qualquer porta com0com nao foram abertas neste teste.')
  Write-Host 'INVENTARIO CONFIRMADO: LabSerial A = COM210; LabSerial B = COM211.'
  foreach ($d in $report.PnPDevices) {
    Write-Host "  $($d.MatchedIds -join ',') / $($d.Name) / $($d.InstanceId)"
  }
  if (-not $RunTransfer) {
    $report.Result = 'INVENTORY_ONLY'
    Write-Host 'Somente inspeção. Para transmissão, use -RunTransfer e confirmações de laboratório.'
  } else {
    if (-not ($ConfirmDedicatedNonProductionPC -and $ConfirmPortsAreLabSerial)) {
      throw 'Recusado: confirme PC sobressalente nao produtivo com recuperacao e a identidade LabSerial das duas portas.'
    }
    $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
      throw 'Para o primeiro teste, abra PowerShell como Administrador no PC de laboratório.'
    }
    $guid = [Guid]::NewGuid().ToString('N')
    $asciiA = [Text.Encoding]::ASCII.GetBytes("LabSerial A-to-B $guid")
    $asciiB = [Text.Encoding]::ASCII.GetBytes("LabSerial B-to-A $guid")
    [byte[]]$binary = @(0,1,2,3,10,13,17,19,127,128,254,255,0,255,85,170)
    $large = New-Object 'byte[]' 512
    for ($i=0;$i -lt $large.Length;$i++) { $large[$i] = [byte](($i*37+11) % 256) }
    $cases = @(
      @{ Name='ASCII A-B'; Sender='COM210'; Receiver='COM211'; Bytes=$asciiA },
      @{ Name='ASCII B-A'; Sender='COM211'; Receiver='COM210'; Bytes=$asciiB },
      @{ Name='Binary A-B'; Sender='COM210'; Receiver='COM211'; Bytes=$binary },
      @{ Name='Binary B-A'; Sender='COM211'; Receiver='COM210'; Bytes=$binary },
      @{ Name='512-byte A-B'; Sender='COM210'; Receiver='COM211'; Bytes=$large },
      @{ Name='512-byte B-A'; Sender='COM211'; Receiver='COM210'; Bytes=$large }
    )
    foreach ($case in $cases) {
      $sent = [byte[]]$case.Bytes
      $record = [ordered]@{
        TimeUtc = (Get-Date).ToUniversalTime().ToString('o')
        Case = $case.Name
        Sender = $case.Sender
        Receiver = $case.Receiver
        ExpectedBytes = $sent.Length
        WrittenBytes = 0
        ReceivedBytes = 0
        TxHex = (Hex $sent)
        RxHex = $null
        TxSha256 = (Get-HashHex $sent)
        RxSha256 = $null
        DurationMs = $null
        Status = 'FAIL'
      }
      try {
        Write-Host "TX: $($case.Name), $($sent.Length) bytes ... "
        $outcome = [LabSerialNativeProbe]::Exchange($case.Sender,$case.Receiver,$sent,$TimeoutMs)
        $received = [byte[]]$outcome.Received
        $record.WrittenBytes = $outcome.Written
        $record.ReceivedBytes = $received.Length
        $record.RxHex = Hex $received
        $record.RxSha256 = Get-HashHex $received
        $record.DurationMs = $outcome.DurationMs
        if ((Hex $sent) -ne (Hex $received)) {
          throw "Bytes recebidos diferem dos enviados em $($case.Name)."
        }
        $record.Status = 'PASS'
        Write-Host "PASS: $($case.Sender) -> $($case.Receiver), $($sent.Length) bytes; SHA-256 $($record.TxSha256)"
      } catch {
        $record.Error = $_.Exception.Message
        $frames.Add([pscustomobject]$record)
        throw
      }
      $frames.Add([pscustomobject]$record)
    }
    $report.Result = 'PASS'
    Write-Host "PASS: $($cases.Count) quadros e dados binarios transmitidos e recebidos sem divergencias."
  }
} catch {
  $report.Result = 'FAIL'
  $report.Error = $_.Exception.ToString()
  Write-Host "FAIL: $($_.Exception.Message)"
} finally {
  $report.Observations = @($observations.ToArray())
  $report.Tests = @($frames.ToArray())
  $report.EndTimeUtc = (Get-Date).ToUniversalTime().ToString('o')
  $jsonPath = "$base.json"
  $textPath = "$base.txt"
  $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
  $lines = @(
    "LabSerial -- Evidence of bidirectional COM transmission",
    "Result: $($report.Result)",
    "Start UTC: $($report.StartTimeUtc)",
    "End UTC: $($report.EndTimeUtc)",
    "Host: $($report.Host)",
    "Device A: ROOT\LABSERIAL_VCOM_A, COM210",
    "Device B: ROOT\LABSERIAL_VCOM_B, COM211",
    "Note: PnP display COM5/COM6 may diverge from PortName and SERIALCOMM.",
    "Cases: $($frames.Count)",
    ""
  )
  foreach ($item in $frames) {
    $lines += "$($item.Case) | $($item.Sender) -> $($item.Receiver) | $($item.Status) | $($item.ExpectedBytes) bytes | SHA256-TX $($item.TxSha256) | SHA256-RX $($item.RxSha256)"
    $lines += "TX: $($item.TxHex)"
    $lines += "RX: $($item.RxHex)"
  }
  if ($report.Error) { $lines += @('','ERROR:',[string]$report.Error) }
  if ($report.Observations.Count -gt 0) { $lines += @('','Observations:') + @($report.Observations) }
  $lines | Set-Content -LiteralPath $textPath -Encoding UTF8
  Write-Host "Relatorio JSON: $jsonPath"
  Write-Host "Relatorio TXT:  $textPath"
}
if ($report.Result -eq 'PASS' -or $report.Result -eq 'INVENTORY_ONLY') { exit 0 }
exit 1
