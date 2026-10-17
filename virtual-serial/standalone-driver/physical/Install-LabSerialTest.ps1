#requires -Version 5.1
#requires -RunAsAdministrator
<#
.SYNOPSIS
 Opt-in installation of LabSerial experimental driver on a SPARE Windows x64 machine.
.DESCRIPTION
 Never changes BCD, firmware Secure Boot, BitLocker or trust stores.
 Requires WDK DevGen executable already installed locally; do not redistribute it.
 Default is dry-run; use -Execute and independent acknowledgments for installation.
#>
[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
param(
  [string]$PackageDirectory = $PSScriptRoot,
  [string]$DevGenPath,
  [switch]$Execute,
  [switch]$ConfirmDedicatedNonProductionPC,
  [switch]$ConfirmRecoveryAndConsoleAccess
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $PackageDirectory).ProviderPath
$preflight = Join-Path $root 'Inspect-LabSerialHost.ps1'
if (-not (Test-Path -LiteralPath $preflight)) { throw 'Script de preflight ausente.' }
if (-not $Execute) {
  Write-Host 'DRY RUN: nenhuma instalacao sera realizada.'
  Write-Host 'Execucao real exige -Execute, ambas as confirmacoes e DevGenPath.'
  & $preflight -PackageDirectory $root
  return
}
if (-not ($ConfirmDedicatedNonProductionPC -and $ConfirmRecoveryAndConsoleAccess)) {
  throw 'Nao instalar em PC de producao. Exige confirmacoes de PC dedicado + backup/console de recuperacao.'
}
if ([string]::IsNullOrWhiteSpace($DevGenPath)) { throw 'Informe caminho local de devgen.exe do WDK.' }
$devgen = (Resolve-Path -LiteralPath $DevGenPath -ErrorAction Stop).ProviderPath
if ([IO.Path]::GetFileName($devgen) -ine 'devgen.exe') { throw 'Caminho precisa apontar a devgen.exe do WDK.' }
# This check must be run before any mutation; it fails closed if BCD, trust or port collision is uncertain.
$output = (& $preflight -PackageDirectory $root 2>&1 | Out-String)
$code = $LASTEXITCODE
Write-Host $output
if ($code -ne 0) { throw 'Preflight falhou; nenhuma alteracao de driver foi efetuada.' }
if (-not $PSCmdlet.ShouldProcess($env:COMPUTERNAME, 'CRIAR dois dispositivos PnP e instalar driver KMDF experimental LabSerial')) { return }

Write-Warning 'Driver experimental pode causar BSOD. Garanta acesso fisico e imagem de recuperacao.'
foreach ($id in @('ROOT\LABSERIAL_VCOM_A','ROOT\LABSERIAL_VCOM_B')) {
  & $devgen /add /bus ROOT /hardwareid $id
  if ($LASTEXITCODE -ne 0) {
    throw "Falha no DevGen ao criar $id. Se criou outro devnode, remova-o pelo procedimento de rollback antes de tentar novamente."
  }
}
& pnputil.exe /add-driver (Join-Path $root 'labserial.inf') /install
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao instalar INF. Remova os devnodes LabSerial criados com o script de rollback; nao repita a instalacao."
}
Write-Host 'Comando de instalacao concluido. ISSO NAO PROVA que o driver carregou nem que duas portas COM funcionam.'
Write-Host 'Verifique Gerenciador de Dispositivos e rode Test-LabSerialPorts.ps1.'
