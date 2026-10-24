#Requires -RunAsAdministrator
<#
  Run INSIDE the Windows guest, NEVER on the Hyper-V host.
  Requires explicit confirmation and verifies Hyper-V virtual machine identity.
  Do not run when BitLocker/device encryption is protecting C:.
#>
[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
param([switch]$ConfirmInsideLabSerialGuest)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $ConfirmInsideLabSerialGuest) { throw 'Use -ConfirmInsideLabSerialGuest apenas DENTRO da VM de testes.' }
$cs = Get-CimInstance Win32_ComputerSystem
if ($cs.Manufacturer -notlike '*Microsoft*' -or $cs.Model -notlike '*Virtual Machine*') {
    throw 'Este computador nao foi identificado como VM Hyper-V. Recusando alterar BCD.'
}
if (Get-Command Get-BitLockerVolume -ErrorAction SilentlyContinue) {
    $volume = Get-BitLockerVolume -MountPoint $env:SystemDrive -ErrorAction SilentlyContinue
    if ($null -ne $volume -and $volume.ProtectionStatus.ToString() -ne 'Off') {
        throw 'BitLocker ativo no disco do sistema da VM. Suspenda/desative com seguranca, salve a chave de recuperacao e repita.'
    }
}
if ($PSCmdlet.ShouldProcess('BCD do Windows CONVIDADO', 'Habilitar TESTSIGNING')) {
    & bcdedit.exe /set TESTSIGNING ON
    if ($LASTEXITCODE -ne 0) { throw "BCDEdit falhou: $LASTEXITCODE" }
    Write-Host 'TESTSIGNING configurado no Windows convidado. Reinicie SOMENTE A VM.'
    Write-Warning 'Driver kernel compilado e assinado para TESTE ainda precisa de instalacao e verificacao manual nesta VM.'
}
