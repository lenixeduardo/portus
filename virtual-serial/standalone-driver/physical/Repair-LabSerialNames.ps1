#requires -Version 5.1
<#
.SYNOPSIS
 Repair ONLY the PnP display names of verified LabSerial devices (COM210/211).
.DESCRIPTION
 Read-only without -Apply. Requires an explicit backup and operator confirmation.
 Uses the documented Windows SetupAPI SPDRP_FRIENDLYNAME device property.
 Does not rename any COM number, change PortName, modify the INF/SYS,
 touch com0com, restart devices or change Windows security settings.
#>
[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
param(
 [switch]$Apply,
 [switch]$ConfirmDedicatedNonProductionPC,
 [switch]$ConfirmRecoveryAndConsoleAccess,
 [string]$BackupDirectory = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'LabSerial-Evidencias')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expected = @(
 [pscustomobject]@{ HardwareId='ROOT\LABSERIAL_VCOM_A'; Port='COM210'; Kernel='\Device\LabSerialA'; NewName='LabSerial Virtual Serial Port A (EXPERIMENTAL) (COM210)' },
 [pscustomobject]@{ HardwareId='ROOT\LABSERIAL_VCOM_B'; Port='COM211'; Kernel='\Device\LabSerialB'; NewName='LabSerial Virtual Serial Port B (EXPERIMENTAL) (COM211)' }
)

# Validate both hardware identifiers AND the driver service, not just FriendlyName.
$nodes = @()
foreach ($node in @(Get-PnpDevice -PresentOnly -Class Ports -ErrorAction Stop)) {
 $rec = Get-PnpDeviceProperty -InstanceId $node.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds' -ErrorAction SilentlyContinue
 $hw = if ($null -eq $rec) { @() } else { @($rec.Data) }
 foreach ($side in $expected) {
  if ($hw -contains $side.HardwareId) {
   $serviceProp = Get-PnpDeviceProperty -InstanceId $node.InstanceId -KeyName 'DEVPKEY_Device_Service' -ErrorAction SilentlyContinue
   $service = if ($null -eq $serviceProp) { '' } else { [string]$serviceProp.Data }
   $port = (Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Enum\' + $node.InstanceId + '\Device Parameters') -Name PortName -ErrorAction SilentlyContinue).PortName
   $nodes += [pscustomobject]@{
    Side=$side
    Name=$node.FriendlyName
    InstanceId=$node.InstanceId
    HardwareIds=@($hw)
    Service=$service
    PortName=[string]$port
    Status=$node.Status
   }
  }
 }
}
$map = Get-ItemProperty -LiteralPath 'HKLM:\HARDWARE\DEVICEMAP\SERIALCOMM' -ErrorAction Stop
foreach ($side in $expected) {
 $matching = @($nodes | Where-Object { $_.Side.HardwareId -eq $side.HardwareId })
 if ($matching.Count -ne 1) { throw "Recusado: esperado exatamente um dispositivo $($side.HardwareId), encontrado $($matching.Count)." }
 $device = $matching[0]
 if ($device.Service -ne 'LabSerial' -or $device.Status -ne 'OK') { throw "Recusado: status/servico inesperado em $($side.HardwareId)." }
 if ($device.PortName -ne $side.Port) { throw "Recusado: PortName $($device.PortName) diverge de $($side.Port)." }
 $mapped = $map.PSObject.Properties[$side.Kernel]
 if ($null -eq $mapped -or [string]$mapped.Value -ne $side.Port) {
   throw "Recusado: SERIALCOMM nao confirma $($side.Kernel) -> $($side.Port)."
 }
 if ($device.Name -notlike 'LabSerial Virtual Serial Port *') {
   throw "Recusado: FriendlyName nao identifica LabSerial: $($device.Name)."
 }
}
Write-Host "=== IDENTIDADE PnP E PORTNAME CONFIRMADOS ==="
foreach ($device in $nodes) {
 Write-Host "$($device.Side.HardwareId): '$($device.Name)' -> '$($device.Side.NewName)'"
}
if (-not $Apply) { Write-Host 'PREVIEW: nenhum nome foi alterado. Use -Apply apenas se este for um Windows de laboratorio.'; exit 0 }
if (-not ($ConfirmDedicatedNonProductionPC -and $ConfirmRecoveryAndConsoleAccess)) {
 throw 'Recusado: exige computador sobressalente de laboratorio, backup e acesso fisico para recuperacao.'
}
$admin = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Abra PowerShell como Administrador.' }
$csharp = Join-Path $PSScriptRoot 'LabSerialFriendlyName.cs'
if (-not (Test-Path -LiteralPath $csharp -PathType Leaf)) { throw 'LabSerialFriendlyName.cs ausente.' }
if (-not ('LabSerialFriendlyName' -as [type])) { Add-Type -Path $csharp -ErrorAction Stop }

$changes = @($nodes | Where-Object { $_.Name -cne $_.Side.NewName })
if ($changes.Count -eq 0) { Write-Host 'Os nomes ja estao corretos. Nenhuma alteracao.'; exit 0 }

New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
$backup = Join-Path $BackupDirectory ("LabSerial-FriendlyName-Backup-" + (Get-Date).ToString('yyyyMMdd-HHmmss-fff') + ".json")
$record = [ordered]@{
 Product='LabSerial'
 Type='PnPFriendlyNameBackup'
 CreatedUtc=(Get-Date).ToUniversalTime().ToString('o')
 Host=$env:COMPUTERNAME
 Devices=@($nodes | ForEach-Object {
  [pscustomobject]@{
   HardwareId=$_.Side.HardwareId
   InstanceId=$_.InstanceId
   PortName=$_.PortName
   OriginalFriendlyName=$_.Name
   DesiredFriendlyName=$_.Side.NewName
  }
 })
}
$record | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $backup -Encoding UTF8
Write-Host "Backup para auditoria/reversao: $backup"

if (-not $PSCmdlet.ShouldProcess($env:COMPUTERNAME, 'Corrigir SOMENTE FriendlyName das portas PnP LabSerial')) { exit 0 }
foreach ($node in $changes) {
 # Repeat checks immediately before each write; never mutate an unrelated device.
 $idProperty = Get-PnpDeviceProperty -InstanceId $node.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds' -ErrorAction Stop
 if (@($idProperty.Data) -notcontains $node.Side.HardwareId) {
   throw "HardwareId mudou durante execucao: $($node.InstanceId). Abortando."
 }
 $serviceProperty = Get-PnpDeviceProperty -InstanceId $node.InstanceId -KeyName 'DEVPKEY_Device_Service' -ErrorAction Stop
 if ([string]$serviceProperty.Data -ne 'LabSerial') { throw "Servico mudou: $($node.InstanceId). Abortando." }
 [LabSerialFriendlyName]::SetName($node.InstanceId,$node.Side.NewName)
 Write-Host "Atualizado: $($node.Side.HardwareId) -> $($node.Side.NewName)"
}
Write-Host 'Reconsultando os nomes do Windows...'
$all = @(Get-PnpDevice -PresentOnly -Class Ports -ErrorAction Stop)
$remaining = 0
foreach ($node in $nodes) {
 $current = @($all | Where-Object InstanceId -eq $node.InstanceId)
 if ($current.Count -ne 1 -or $current[0].FriendlyName -cne $node.Side.NewName) {
  $remaining++
  Write-Warning "Windows ainda mostra nome antigo ou indefinido para $($node.InstanceId). Reabra o Gerenciador de Dispositivos antes de avaliar."
 } else { Write-Host "CONFIRMADO: $($current[0].FriendlyName)" }
}
if ($remaining -gt 0) { throw "$remaining dispositivo(s) nao refletiram o nome esperado; verifique antes de repetir." }
Write-Host 'PASS: ambos os FriendlyNames PnP corrigidos. Nao houve alteracao nas portas COM/INF/SYS.'
