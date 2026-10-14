[CmdletBinding()]
param([string]$VmName = 'LabSerial-TestVM')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not (Get-Command Get-VM -ErrorAction SilentlyContinue)) {
    throw 'Modulo Hyper-V indisponivel neste Windows.'
}
$vm = Get-VM -Name $VmName -ErrorAction Stop
$firmware = Get-VMFirmware -VMName $VmName
$network = Get-VMNetworkAdapter -VMName $VmName
$checkpoints = @(Get-VMSnapshot -VMName $VmName -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty Name)
[pscustomobject]@{
    VM = $vm.Name
    State = $vm.State.ToString()
    Generation = $vm.Generation
    MemoryStartupGB = [math]::Round($vm.MemoryStartup / 1GB, 1)
    CPU = (Get-VMProcessor -VMName $VmName).Count
    SecureBoot = $firmware.SecureBoot.ToString()
    VirtualTPM = (Get-VMSecurity -VMName $VmName).TpmEnabled
    Switch = ($network.SwitchName -join ', ')
    Checkpoints = ($checkpoints -join ', ')
} | Format-List
