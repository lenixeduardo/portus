# Inventario read-only: nenhuma alteracao no sistema.
[CmdletBinding()]
param([string]$DriverArtifact = '')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Executar no Windows.' }
Write-Host 'PORTUS Virtual Serial - diagnostico'
Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,OSArchitecture | Format-List
Write-Host 'Portas COM:'
[System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object
Write-Host 'Dispositivos PnP classe Ports:'
Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue |
  Select-Object Status,FriendlyName,InstanceId | Format-Table -AutoSize
$kit = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10'
if (Test-Path -LiteralPath $kit) {
  Get-ChildItem -LiteralPath $kit -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -in @('InfVerif.exe','Inf2Cat.exe','signtool.exe') } |
    Select-Object -First 15 -ExpandProperty FullName
} else { Write-Host 'Windows Kits nao detectado.' }
if ($DriverArtifact -ne '') {
  $file = (Resolve-Path -LiteralPath $DriverArtifact).Path
  Get-FileHash -LiteralPath $file -Algorithm SHA256 | Format-List
  Get-AuthenticodeSignature -LiteralPath $file |
    Select-Object Status,StatusMessage,SignerCertificate | Format-List
}
Write-Host 'Nenhuma instalacao ou alteracao foi realizada.'
