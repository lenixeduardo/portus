#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Provisions a dedicated, isolated Hyper-V Windows 11 laboratory VM.
.DESCRIPTION
  Creates a Generation 2 VM with an isolated private switch, vTPM, Secure Boot,
  an empty dynamic VHDX and the supplied, licensed Microsoft Windows ISO.
  Does NOT install Windows, any driver or change host boot settings.
.EXAMPLE
  .\New-LabSerialVM.ps1 -WindowsIso "C:\ISOs\Windows11_Enterprise_Eval.iso" -StartAfterCreation
#>
[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
param(
    [Parameter(Mandatory=$true)]
    [ValidateScript({(Test-Path -LiteralPath $_ -PathType Leaf) -and ([IO.Path]::GetExtension($_) -ieq '.iso')})]
    [string]$WindowsIso,
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$')]
    [string]$VmName = 'LabSerial-TestVM',
    [string]$VmRoot = "$env:PUBLIC\Documents\LabSerial-VMs",
    [ValidateRange(4,64)][int]$MemoryGB = 8,
    [ValidateRange(2,32)][int]$CpuCount = 4,
    [ValidateRange(64,500)][int]$DiskGB = 90,
    [string]$PrivateSwitchName = 'LabSerial-Isolated',
    [switch]$StartAfterCreation
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') { throw 'Execute em um HOST Windows com Hyper-V (Pro/Enterprise).'; }
if (-not (Get-Command Get-VM -ErrorAction SilentlyContinue)) {
    throw 'Hyper-V ausente. Em Windows Pro/Enterprise, habilite o recurso Microsoft-Hyper-V e reinicie o host antes de tentar novamente.'
}
if ($VmRoot -notmatch '^[a-zA-Z]:\\') {
    throw 'VmRoot precisa ser um caminho absoluto em disco local, por exemplo C:\\LabSerialVMs.'
}
if (Get-VM -Name $VmName -ErrorAction SilentlyContinue) {
    throw "Ja existe uma VM chamada '$VmName'. Nenhuma alteracao foi feita."
}
$cs = Get-CimInstance -ClassName Win32_ComputerSystem
if ([uint64]$cs.TotalPhysicalMemory -lt ([uint64]($MemoryGB + 4) * 1GB)) {
    throw "Host tem RAM insuficiente. Requer ao menos $($MemoryGB + 4) GB para este perfil."
}
$drive = Get-PSDrive -Name $VmRoot.Substring(0,1) -ErrorAction Stop
if ($drive.Free -lt (25GB)) {
    throw 'Reserve pelo menos 25 GB reais livres para instalacao/updates da VM; o disco VHDX pode crescer ate DiskGB.'
}
$switch = Get-VMSwitch -Name $PrivateSwitchName -ErrorAction SilentlyContinue
if ($switch -and $switch.SwitchType.ToString() -ne 'Private') {
    throw "O switch existente '$PrivateSwitchName' nao e do tipo Private; recusando conectar."
}
$vmFolder = Join-Path $VmRoot $VmName
$vhdPath = Join-Path $vmFolder 'LabSerial-OS.vhdx'
if (Test-Path -LiteralPath $vmFolder) {
    throw "Diretorio ja existe: $vmFolder. Nao vou reutilizar nem sobrescrever dados."
}
$iso = (Resolve-Path -LiteralPath $WindowsIso).ProviderPath
if (-not $PSCmdlet.ShouldProcess($vmFolder, "Criar VM isolada $VmName e switch privado $PrivateSwitchName")) { return }

if (-not $switch) {
    New-VMSwitch -Name $PrivateSwitchName -SwitchType Private -Notes 'Sem acesso ao host/rede externa: laboratorio de drivers LabSerial' | Out-Null
}
New-Item -ItemType Directory -Path $vmFolder -Force | Out-Null
New-VM -Name $VmName -Generation 2 -MemoryStartupBytes ([uint64]$MemoryGB * 1GB) `
    -NewVHDPath $vhdPath -NewVHDSizeBytes ([uint64]$DiskGB * 1GB) `
    -Path $vmFolder -SwitchName $PrivateSwitchName | Out-Null
Set-VMProcessor -VMName $VmName -Count $CpuCount
Set-VMMemory -VMName $VmName -DynamicMemoryEnabled $false
Set-VM -Name $VmName -AutomaticStartAction Nothing -AutomaticStopAction ShutDown `
    -AutomaticCheckpointsEnabled $false -CheckpointType Production
Set-VMFirmware -VMName $VmName -EnableSecureBoot On
Set-VMKeyProtector -VMName $VmName -NewLocalKeyProtector
Enable-VMTPM -VMName $VmName
Add-VMDvdDrive -VMName $VmName -Path $iso
$dvd = Get-VMDvdDrive -VMName $VmName
Set-VMFirmware -VMName $VmName -FirstBootDevice $dvd

if ($StartAfterCreation) { Start-VM -Name $VmName | Out-Null }
[pscustomobject]@{
    Name = $VmName
    Status = (Get-VM -Name $VmName).State.ToString()
    Generation = 2
    MemoryGB = $MemoryGB
    CpuCount = $CpuCount
    MaxDiskGB = $DiskGB
    Network = "Private: $PrivateSwitchName (sem Internet)"
    SecureBoot = 'On, durante instalacao'
    VirtualTPM = 'Enabled'
    Iso = $iso
    Vhdx = $vhdPath
} | Format-List

Write-Host 'VM criada. Abra o console com: vmconnect.exe localhost "'$VmName'"'
Write-Host 'Instale o Windows pela ISO. ANTES de testes de driver: crie o checkpoint do SO limpo.'
Write-Warning 'Nao habilite TESTSIGNING no host. Esta VM ainda nao tem driver LabSerial instalado.'
