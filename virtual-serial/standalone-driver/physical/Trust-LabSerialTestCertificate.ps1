#requires -Version 5.1
#requires -RunAsAdministrator
<#
.SYNOPSIS
 Verifies the LabSerial test certificate and optionally trusts it on a SPARE lab PC.
.DESCRIPTION
 No trust-store modification without -Execute, two safety attestations,
 package SHA-256 checks and user confirmation. Never changes BCD or Secure Boot.
#>
[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
param(
  [string]$PackageDirectory = $PSScriptRoot,
  [switch]$Execute,
  [switch]$ConfirmDedicatedNonProductionPC,
  [switch]$ConfirmRecoveryAndConsoleAccess
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $PackageDirectory).ProviderPath
$m = Get-Content -LiteralPath (Join-Path $root 'checksums.json') -Raw | ConvertFrom-Json
if ($m.product -ne 'LabSerial' -or $m.architecture -ne 'x64' -or $m.intended_for_production -ne $false) {
  throw 'Pacote nao reconhecido como LabSerial x64 de TESTE.'
}
foreach ($entry in @(
  @{ File='labserial.sys'; Key='sys' },
  @{ File='labserial.inf'; Key='inf' },
  @{ File='labserial.cat'; Key='cat' },
  @{ File='labserial-test.cer'; Key='cer' }
)) {
  $f = Join-Path $root $entry.File
  if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { throw "Arquivo ausente: $($entry.File)" }
  if ((Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash -ne [string]$m.sha256.($entry.Key)) {
    throw "SHA-256 nao confere: $($entry.File)"
  }
}
$cer = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
  (Join-Path $root 'labserial-test.cer')
)
$signer = (Get-AuthenticodeSignature -LiteralPath (Join-Path $root 'labserial.sys')).SignerCertificate
if ($null -eq $signer -or $signer.Thumbprint -ne $cer.Thumbprint -or
    $cer.Thumbprint -ne [string]$m.test_signing_certificate_thumbprint) {
  throw 'Certificado do driver, .cer e checksums.json nao coincidem.'
}
if ($cer.NotAfter -le [datetime]::Now) { throw 'Certificado de TESTE expirado.' }
$rootExists = @(Get-ChildItem Cert:\LocalMachine\Root | Where-Object Thumbprint -eq $cer.Thumbprint).Count -gt 0
$publisherExists = @(Get-ChildItem Cert:\LocalMachine\TrustedPublisher | Where-Object Thumbprint -eq $cer.Thumbprint).Count -gt 0
Write-Host "Certificado: $($cer.Subject)"
Write-Host "Thumbprint:  $($cer.Thumbprint)"
Write-Host "Root:        $rootExists"
Write-Host "Publisher:   $publisherExists"
if (-not $Execute) { Write-Host 'Somente diagnostico, certificado nao importado.'; return }
if (-not ($ConfirmDedicatedNonProductionPC -and $ConfirmRecoveryAndConsoleAccess)) {
  throw 'Importacao recusada sem PC sobressalente de LABORATORIO e recuperacao fisica.'
}
if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
  throw 'PC precisa executar Windows x64 AMD64.'
}
try {
  if (Confirm-SecureBootUEFI -ErrorAction Stop) { throw 'Secure Boot ligado; nao confie em driver experimental aqui.' }
} catch { throw "Nao foi possivel confirmar Secure Boot desligado: $($_.Exception.Message)" }
try {
  $bitlocker = Get-BitLockerVolume -MountPoint $env:SystemDrive -ErrorAction Stop
  if ($bitlocker.ProtectionStatus.ToString() -ne 'Off') { throw 'BitLocker ativo; nao modificar lojas.' }
} catch { throw "Nao foi possivel confirmar BitLocker desligado: $($_.Exception.Message)" }
if ($rootExists -and $publisherExists) {
  Write-Host 'O certificado ja consta nas duas lojas; nenhuma alteracao.'
  return
}
if ($PSCmdlet.ShouldProcess('LocalMachine Root/TrustedPublisher',
       "IMPORTAR certificado publico AUTORIDADE RAIZ de TESTE $($cer.Thumbprint)")) {
  if (-not $rootExists) {
    Import-Certificate -FilePath (Join-Path $root 'labserial-test.cer') -CertStoreLocation 'Cert:\LocalMachine\Root' -ErrorAction Stop | Out-Null
  }
  if (-not $publisherExists) {
    Import-Certificate -FilePath (Join-Path $root 'labserial-test.cer') -CertStoreLocation 'Cert:\LocalMachine\TrustedPublisher' -ErrorAction Stop | Out-Null
  }
  Write-Warning 'Certificado de teste agora confiavel; NAO e uma assinatura Microsoft para producao.'
}
