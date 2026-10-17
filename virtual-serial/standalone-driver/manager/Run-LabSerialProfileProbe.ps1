#requires -Version 5.1
# A custom one-rate diagnostic. Parent GUI enforces a 35-second process watchdog;
# kernel-level hangs/BSODs are not prevented by a user-mode watchdog.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidateSet(9600,115200)][int]$BaudRate,
 [switch]$ConfirmDedicatedNonProductionPC,
 [switch]$ConfirmPortsAreLabSerial
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$started=Get-Date
$results=@()
$outDir=Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'LabSerial-Evidencias'
$fileBase=Join-Path $outDir ('Perfil-'+$started.ToString('yyyyMMdd-HHmmss-fff'))
$state='FAIL'
$errorMessage=$null
function ByteHex([byte[]] $bytes) { [BitConverter]::ToString($bytes).Replace('-','') }
function ReadExact([System.IO.Ports.SerialPort] $port,[int] $length) {
 $b=New-Object byte[] $length
 $done=0
 while($done -lt $length) {
  $n=$port.Read($b,$done,$length-$done)
  if($n -le 0){throw 'Zero bytes na leitura.'}
  $done+=$n
 }
 return ,$b
}
function Case([System.IO.Ports.SerialPort]$tx,[System.IO.Ports.SerialPort]$rx,[byte[]]$payload,[string]$name){
 $rx.DiscardInBuffer()
 $tx.Write($payload,0,$payload.Length)
 [byte[]]$got=ReadExact $rx $payload.Length
 if((ByteHex $got) -cne (ByteHex $payload)){throw "Conteudo divergente: $name"}
 Write-Host "PASS $name - $($tx.PortName) -> $($rx.PortName), $($payload.Length) bytes"
 return [ordered]@{ Name=$name;Sender=$tx.PortName;Receiver=$rx.PortName;Bytes=$payload.Length;TxHex=(ByteHex $payload);RxHex=(ByteHex $got);Status='PASS' }
}
try {
 if(-not($ConfirmDedicatedNonProductionPC -and $ConfirmPortsAreLabSerial)){
  throw 'Exige PC de laboratorio dedicado, backup, console fisico e portas LabSerial.'
 }
 if($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem){throw 'Requer Windows x64.'}
 $admin=([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
 if(-not $admin){throw 'Execute LabSerial Setup como Administrador apenas para testar.'}
 $verify=@(
  @{Id='ROOT\LABSERIAL_VCOM_A';Port='COM210';Kernel='\Device\LabSerialA'},
  @{Id='ROOT\LABSERIAL_VCOM_B';Port='COM211';Kernel='\Device\LabSerialB'}
 )
 $native=Join-Path $PSScriptRoot 'LabSerialNativeProbe.cs'
 if(-not (Test-Path -LiteralPath $native -PathType Leaf)){throw 'LabSerialNativeProbe.cs ausente.'}
 if(-not ('LabSerialNativeProbe' -as [type])) {Add-Type -Path $native -ErrorAction Stop}
 $map=Get-ItemProperty -LiteralPath 'HKLM:\HARDWARE\DEVICEMAP\SERIALCOMM'
 foreach($expected in $verify){
  $matched=@(Get-PnpDevice -PresentOnly -Class Ports | Where-Object {
   $ids=Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds' -ErrorAction SilentlyContinue
   $null -ne $ids -and @($ids.Data) -contains $expected.Id
  })
  if($matched.Count -ne 1 -or $matched[0].Status -ne 'OK'){throw "PnP invalido: $($expected.Id)"}
  $svc=Get-PnpDeviceProperty -InstanceId $matched[0].InstanceId -KeyName 'DEVPKEY_Device_Service' -ErrorAction SilentlyContinue
  $prm='HKLM:\SYSTEM\CurrentControlSet\Enum\'+$matched[0].InstanceId+'\Device Parameters'
  $portName=(Get-ItemProperty -LiteralPath $prm -Name PortName -ErrorAction Stop).PortName
  if($svc.Data -ne 'LabSerial' -or $portName -ne $expected.Port){throw 'Identidade/PortName divergentes.'}
  if($map.PSObject.Properties[$expected.Kernel].Value -ne $expected.Port){throw 'SERIALCOMM divergente.'}
  if([LabSerialNativeProbe]::ResolveLink($expected.Port) -ine $expected.Kernel){throw 'QueryDosDevice divergente.'}
 }
 $a=[System.IO.Ports.SerialPort]::new('COM210',$BaudRate,[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One)
 $b=[System.IO.Ports.SerialPort]::new('COM211',$BaudRate,[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One)
 try {
  foreach($p in @($a,$b)) { $p.Handshake=[System.IO.Ports.Handshake]::None;$p.ReadTimeout=2500;$p.WriteTimeout=2500 }
  $a.Open();$b.Open()
  [byte[]]$ascii=[Text.Encoding]::ASCII.GetBytes('LABSERIAL-'+$BaudRate+'-'+[Guid]::NewGuid().ToString('N'))
  [byte[]]$binary=@(0,1,2,3,10,13,17,19,127,128,254,255,0,255,85,170)
  $results += (Case $a $b $ascii 'ASCII A-B')
  $results += (Case $b $a $binary 'BINARY B-A')
  $state='PASS'
 } finally {
  foreach($p in @($a,$b)) {$p.Dispose()}
 }
} catch {
 $errorMessage=$_.Exception.ToString()
 Write-Host "FAIL PERFIL: $($_.Exception.Message)"
} finally {
 New-Item -ItemType Directory -Path $outDir -Force | Out-Null
 [ordered]@{Product='LabSerial';Suite='Profile';BaudRate=$BaudRate;Status=$state;Tests=$results;Error=$errorMessage;Utc=(Get-Date).ToUniversalTime().ToString('o')} |
  ConvertTo-Json -Depth 8 | Set-Content -LiteralPath ($fileBase+'.json') -Encoding UTF8
 Write-Host "EVIDENCIA JSON: $fileBase.json"
}
if($state -ne 'PASS' -or $results.Count -ne 2){exit 1}
Write-Host "PASS FINAL: perfil $BaudRate baud, 8N1, Handshake.None, dois quadros TX/RX."
exit 0
