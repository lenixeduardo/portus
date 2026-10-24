#Requires -RunAsAdministrator
<#
  Runs on the Hyper-V HOST after OS install and clean checkpoint.
  Makes ONLY the VM's virtual UEFI Secure Boot disabled.
  The user must disable BitLocker INSIDE the guest before calling this.
#>
[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
param(
    [string]$VmName = 'LabSerial-TestVM',
    [switch]$ConfirmGuestBitLockerOff,
    [switch]$ConfirmDedicatedDisposableVm
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not ($ConfirmGuestBitLockerOff -and $ConfirmDedicatedDisposableVm)) {
    throw 'Ambas confirmacoes obrigatorias: -ConfirmGuestBitLockerOff -ConfirmDedicatedDisposableVm'
}
$vm = Get-VM -Name $VmName -ErrorAction Stop
if ($vm.State.ToString() -ne 'Off') {
    throw 'Desligue a VM pelo Windows convidado antes de modificar o Secure Boot virtual.'
}
if ($vm.Generation -ne 2) { throw 'Esperada VM geracao 2.' }
$snap = @(Get-VMSnapshot -VMName $VmName -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'LabSerial-Clean-OS' })
if ($snap.Count -eq 0) { throw 'Checkpoint inicial obrigatorio: LabSerial-Clean-OS.' }
$private = Get-VMNetworkAdapter -VMName $VmName | ForEach-Object {
    Get-VMSwitch -Name $_.SwitchName -ErrorAction SilentlyContinue
}
if (@($private | Where-Object { $_.SwitchType.ToString() -ne 'Private' }).Count -gt 0) {
    throw 'A VM possui adaptador em switch nao-privado. Isole a rede antes dos testes de driver.'
}
if ($PSCmdlet.ShouldProcess($VmName, 'Desabilitar Secure Boot SOMENTE na VM para teste de driver')) {
    Set-VMFirmware -VMName $VmName -EnableSecureBoot Off
    Write-Warning 'Secure Boot desabilitado apenas na VM. Inicie a VM, execute Guest-EnableLabSerialTestSigning.ps1 no CONVIDADO e reinicie.'
}
