#Requires -RunAsAdministrator
<#
  Creates one baseline snapshot AFTER Windows finished installing.
  Never overwrites an existing snapshot.
#>
[CmdletBinding(SupportsShouldProcess=$true)]
param(
    [string]$VmName = 'LabSerial-TestVM',
    [switch]$ConfirmWindowsInstalled
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $ConfirmWindowsInstalled) {
    throw 'Verifique primeiro que o Windows convidado foi instalado e configurado. Depois use -ConfirmWindowsInstalled.'
}
$vm = Get-VM -Name $VmName -ErrorAction Stop
if ($vm.Generation -ne 2) { throw 'Esperada VM Hyper-V geracao 2.' }
$existing = @(Get-VMSnapshot -VMName $VmName -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'LabSerial-Clean-OS' })
if ($existing.Count -gt 0) { throw 'Checkpoint LabSerial-Clean-OS ja existe. Nenhuma alteracao.' }
if ($PSCmdlet.ShouldProcess($VmName, 'Criar checkpoint LabSerial-Clean-OS')) {
    Checkpoint-VM -VMName $VmName -SnapshotName 'LabSerial-Clean-OS' -ErrorAction Stop
    Write-Host 'Checkpoint LabSerial-Clean-OS criado. Nao instale drivers antes deste marco.'
}
