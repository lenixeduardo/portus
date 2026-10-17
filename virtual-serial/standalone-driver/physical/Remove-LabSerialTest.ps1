#requires -Version 5.1
#requires -RunAsAdministrator
<#
.SYNOPSIS
 Fail-closed rollback for exactly LabSerial devnodes; do not remove unrelated drivers.
#>
[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
param(
 [switch]$Execute,
 [switch]$ConfirmDedicatedNonProductionPC
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$expected = @('ROOT\LABSERIAL_VCOM_A','ROOT\LABSERIAL_VCOM_B')
$nodes = @(
  Get-PnpDevice -ErrorAction Stop | Where-Object {
    $node = $_
    $hwInfo = Get-PnpDeviceProperty -InstanceId $node.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds' -ErrorAction SilentlyContinue
    $hw = if ($null -eq $hwInfo) { @() } else { @($hwInfo.Data) }
    @($hw | Where-Object { $_ -in $expected }).Count -gt 0
  }
)
Write-Host "Found $($nodes.Count) LabSerial instances:"
$nodes | Select-Object FriendlyName,Status,InstanceId | Format-Table -AutoSize
if (-not $Execute) { Write-Host 'DRY RUN: para remover use -Execute -ConfirmDedicatedNonProductionPC.'; return }
if (-not $ConfirmDedicatedNonProductionPC) { throw 'Confirmacao de maquina de laboratorio obrigatoria.' }
if ($nodes.Count -gt 2) { throw 'Mais de dois devnodes LabSerial encontrados; nao remover em lote. Investigue duplicatas.' }
foreach ($node in $nodes) {
  $hw = @( (Get-PnpDeviceProperty -InstanceId $node.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds' -ErrorAction Stop).Data )
  if (@($hw | Where-Object { $_ -in $expected }).Count -ne 1) {
    throw "HardwareIds inconsistentes para $($node.InstanceId); recusando remover."
  }
  if ($PSCmdlet.ShouldProcess($node.InstanceId, 'Remover exclusivamente este devnode LabSerial')) {
    & pnputil.exe /remove-device $node.InstanceId
    if ($LASTEXITCODE -ne 0) { throw "Falha ao remover $($node.InstanceId). Pare e consulte SetupAPI.log." }
  }
}
Write-Host 'Remocao de dispositivos executada. Confirme se desapareceu do Gerenciador de Dispositivos.'
Write-Host 'Nao altera TESTSIGNING, Secure Boot, BitLocker ou certificados de sistema.'
Write-Host 'Se quiser remover o pacote INF, confirme seu nome oemNN.inf via pnputil /enum-drivers e avalie manualmente.'
