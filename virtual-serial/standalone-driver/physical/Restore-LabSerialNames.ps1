#requires -Version 5.1
<#
.SYNOPSIS
 Restore the original PnP FriendlyName values from Repair-LabSerialNames backup.
.DESCRIPTION
 Dry-run by default; strongly validates host, instance IDs, service, HardwareIds
 and COM mapping before doing any SetupAPI write. Does not touch the kernel
 driver, actual COM mapping or third-party PnP devices.
#>
[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
param(
 [Parameter(Mandatory=$true)][string]$BackupPath,
 [switch]$Apply,
 [switch]$ConfirmDedicatedNonProductionPC,
 [switch]$ConfirmRecoveryAndConsoleAccess
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$backupFile=(Resolve-Path -LiteralPath $BackupPath -ErrorAction Stop).ProviderPath
$b=Get-Content -LiteralPath $backupFile -Raw | ConvertFrom-Json
if ($b.Product -ne 'LabSerial' -or $b.Type -ne 'PnPFriendlyNameBackup' -or
    $b.Host -ne $env:COMPUTERNAME -or @($b.Devices).Count -ne 2) {
 throw 'Arquivo de backup invalido, incompleto ou de outro computador.'
}
$required=@(
 [pscustomobject]@{ Id='ROOT\LABSERIAL_VCOM_A'; Port='COM210'; Kernel='\Device\LabSerialA' },
 [pscustomobject]@{ Id='ROOT\LABSERIAL_VCOM_B'; Port='COM211'; Kernel='\Device\LabSerialB' }
)
$map=Get-ItemProperty -LiteralPath 'HKLM:\HARDWARE\DEVICEMAP\SERIALCOMM' -ErrorAction Stop
$targets=@()
foreach ($side in $required) {
 $records=@($b.Devices | Where-Object { $_.HardwareId -eq $side.Id })
 if($records.Count -ne 1) { throw "Backup invalido para $($side.Id)." }
 $entry=$records[0]
 if ($entry.PortName -ne $side.Port -or
     $entry.OriginalFriendlyName -notlike 'LabSerial Virtual Serial Port *' -or
     $entry.DesiredFriendlyName -notlike 'LabSerial Virtual Serial Port *') {
  throw "Nome ou porta estranha no backup para $($side.Id)."
 }
 $live=@(Get-PnpDevice -PresentOnly -Class Ports -ErrorAction Stop |
  Where-Object { $_.InstanceId -eq $entry.InstanceId })
 if($live.Count -ne 1 -or $live[0].Status -ne 'OK') { throw "Dispositivo $($entry.InstanceId) nao esta OK." }
 $hw=(Get-PnpDeviceProperty -InstanceId $entry.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds' -ErrorAction Stop).Data
 $svc=(Get-PnpDeviceProperty -InstanceId $entry.InstanceId -KeyName 'DEVPKEY_Device_Service' -ErrorAction Stop).Data
 if (@($hw) -notcontains $side.Id -or $svc -ne 'LabSerial') { throw "Dispositivo nao identificado como LabSerial $($side.Id)." }
 $reg='HKLM:\SYSTEM\CurrentControlSet\Enum\'+$entry.InstanceId+'\Device Parameters'
 $port=(Get-ItemProperty -LiteralPath $reg -Name PortName -ErrorAction Stop).PortName
 if ($port -ne $side.Port) { throw "PortName mudou no dispositivo $($entry.InstanceId)." }
 $p=$map.PSObject.Properties[$side.Kernel]
 if($null -eq $p -or [string]$p.Value -ne $side.Port) { throw "SERIALCOMM nao corresponde a $($side.Id)." }
 if($live[0].FriendlyName -cne $entry.DesiredFriendlyName -and
    $live[0].FriendlyName -cne $entry.OriginalFriendlyName) {
  throw "Nome atual mudou para valor desconhecido: $($live[0].FriendlyName)."
 }
 $targets+= [pscustomobject]@{
  InstanceId=$entry.InstanceId
  HardwareId=$side.Id
  CurrentName=$live[0].FriendlyName
  RestoreName=$entry.OriginalFriendlyName
 }
}
foreach($entry in $targets) {
 Write-Host "$($entry.HardwareId): '$($entry.CurrentName)' => '$($entry.RestoreName)'"
}
if(-not $Apply) { Write-Host 'PREVIEW: sem alteracoes. Use -Apply e confirmacoes para restaurar.'; exit 0 }
if(-not ($ConfirmDedicatedNonProductionPC -and $ConfirmRecoveryAndConsoleAccess)) {
 throw 'Restauracao exige PC de laboratorio, backup e recuperacao fisica.'
}
$admin=([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if(-not $admin) { throw 'Abra PowerShell como Administrador.' }
$csharp=Join-Path $PSScriptRoot 'LabSerialFriendlyName.cs'
if(-not ('LabSerialFriendlyName' -as [type])) { Add-Type -Path $csharp -ErrorAction Stop }
if(-not $PSCmdlet.ShouldProcess($env:COMPUTERNAME,'RESTAURAR os dois FriendlyNames PnP LabSerial')) { exit 0 }
foreach($entry in @($targets | Where-Object { $_.CurrentName -cne $_.RestoreName })) {
 [LabSerialFriendlyName]::SetName($entry.InstanceId,$entry.RestoreName)
 Write-Host "RESTAURADO: $($entry.HardwareId) => $($entry.RestoreName)"
}
Write-Host 'Backup aplicado. Reabra o Gerenciador de Dispositivos e valide os dois nomes.'
