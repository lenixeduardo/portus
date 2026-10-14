#requires -Version 5.1
<#
.SYNOPSIS
 Read-only preflight for an EXCLUSIVELY non-production Windows x64 test host.
.DESCRIPTION
 Does not change BCD, BIOS, certificates, drivers or registry.
#>
[CmdletBinding()]
param([string]$PackageDirectory = $PSScriptRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$blockers = New-Object System.Collections.Generic.List[string]
$root = (Resolve-Path -LiteralPath $PackageDirectory).ProviderPath
$manifestPath = Join-Path $root 'checksums.json'
$state = [ordered]@{
  Product = 'LabSerial'
  TestOnly = $true
  Host = $env:COMPUTERNAME
  WindowsX64 = [Environment]::Is64BitOperatingSystem -and ($env:PROCESSOR_ARCHITECTURE -eq 'AMD64')
  Elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  SecureBoot = 'unknown'
  BitLocker = 'unknown'
  TestSigning = 'unknown'
  PortCollision = 'unknown'
  PackageChecksums = 'not checked'
  TestCertificate = 'not checked'
}
if (-not $state.WindowsX64) { $blockers.Add('Requer Windows x64/AMD64 (nao ARM64).') }
if (-not $state.Elevated) { $blockers.Add('Execute PowerShell como Administrador.') }
try {
  $state.SecureBoot = [bool](Confirm-SecureBootUEFI -ErrorAction Stop)
  if ($state.SecureBoot) { $blockers.Add('Secure Boot ativo: assinatura de teste nao deve ser instalada neste estado.') }
} catch {
  $blockers.Add('Nao foi possivel verificar Secure Boot; falha segura.')
}
try {
  $volume = Get-BitLockerVolume -MountPoint $env:SystemDrive -ErrorAction Stop
  $state.BitLocker = [string]$volume.ProtectionStatus
  if ($state.BitLocker -ne 'Off') { $blockers.Add('BitLocker ativo: proteja a chave de recuperacao e nao prossiga.') }
} catch {
  $blockers.Add('Nao foi possivel verificar BitLocker; falha segura.')
}
try {
  $bcd = (& bcdedit.exe /enum '{current}' 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'bcdedit falhou.' }
  $state.TestSigning = if ($bcd -match '(?im)^\s*testsigning\s+(yes|sim|on|1)\s*$') { 'Enabled' } else { 'Not confirmed' }
  if ($state.TestSigning -ne 'Enabled') { $blockers.Add('TESTSIGNING nao confirmado. Os scripts NAO alteram BCD.') }
} catch {
  $blockers.Add('Falha ao inspecionar TESTSIGNING no BCD.')
}
try {
  $ports = @([System.IO.Ports.SerialPort]::GetPortNames())
  $pnp = @(Get-PnpDevice -ErrorAction Stop | Where-Object {
    $_.InstanceId -like 'ROOT\LABSERIAL_VCOM_A\*' -or $_.InstanceId -like 'ROOT\LABSERIAL_VCOM_B\*'
  })
  $state.PortCollision = if (($ports -contains 'COM210') -or ($ports -contains 'COM211') -or $pnp.Count -gt 0) {'Yes'} else {'No'}
  if ($state.PortCollision -eq 'Yes') { $blockers.Add('COM210/COM211 ou devnodes LabSerial ja existem. Nao duplicar dispositivos.') }
} catch { $blockers.Add('Falha ao inspecionar COM e PnP.') }
try {
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'checksums.json ausente.' }
  $m = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($m.product -ne 'LabSerial' -or $m.architecture -ne 'x64' -or $m.intended_for_production -ne $false) {
    throw 'Manifesto nao indica LabSerial x64 exclusivo para testes.'
  }
  $table = @{'labserial.sys'='sys';'labserial.inf'='inf';'labserial.cat'='cat'}
  foreach ($filename in $table.Keys) {
    $file = Join-Path $root $filename
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Arquivo ausente: $filename" }
    $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    $expected = [string]$m.sha256.($table[$filename])
    if ($actual -ne $expected) { throw "SHA-256 divergente: $filename" }
  }
  $infBody = Get-Content -LiteralPath (Join-Path $root 'labserial.inf') -Raw
  foreach ($id in @('ROOT\LABSERIAL_VCOM_A','ROOT\LABSERIAL_VCOM_B')) {
    if (-not $infBody.Contains($id)) { throw "INF nao declara $id" }
  }
  $state.PackageChecksums = 'Verified'
} catch { $blockers.Add("Falha na integridade do pacote: $($_.Exception.Message)") }
try {
  $certPath = Join-Path $root 'labserial-test.cer'
  if (-not (Test-Path -LiteralPath $certPath -PathType Leaf)) { throw 'Certificado publico ausente.' }
  $cert = [Security.Cryptography.X509Certificates.X509Certificate2]::new($certPath)
  $signed = (Get-AuthenticodeSignature -LiteralPath (Join-Path $root 'labserial.sys')).SignerCertificate
  if ($null -eq $signed) { throw 'SYS sem certificado de assinatura.' }
  if ($cert.Thumbprint -ne $signed.Thumbprint) { throw 'Certificado publico nao corresponde ao SYS.' }
  $state.TestCertificate = $cert.Thumbprint
  $rootTrusted = @(Get-ChildItem Cert:\LocalMachine\Root | Where-Object Thumbprint -eq $cert.Thumbprint)
  $publisherTrusted = @(Get-ChildItem Cert:\LocalMachine\TrustedPublisher | Where-Object Thumbprint -eq $cert.Thumbprint)
  if ($rootTrusted.Count -eq 0 -or $publisherTrusted.Count -eq 0) {
    $blockers.Add('Certificado de teste ainda nao confiavel nas lojas Root e TrustedPublisher. Nao e assinado para producao.')
  }
} catch { $blockers.Add("Falha no certificado: $($_.Exception.Message)") }
[pscustomobject]@{
  Inventory = [pscustomobject]$state
  ReadyForExperimentalInstall = ($blockers.Count -eq 0)
  Blockers = @($blockers)
} | ConvertTo-Json -Depth 6
if ($blockers.Count -gt 0) { exit 1 }
