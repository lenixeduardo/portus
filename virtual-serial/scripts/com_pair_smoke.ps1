# Read-only by default; send bytes only inside disposable VM with explicit opt-ins.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^COM[0-9]+$')][string]$PortA,
  [Parameter(Mandatory=$true)][ValidatePattern('^COM[0-9]+$')][string]$PortB,
  [ValidateRange(1,4000000)][int]$BaudRate = 9600,
  [switch]$RunTraffic,
  [switch]$IConfirmDisposableVmAndVirtualPorts
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PortA -eq $PortB) { throw 'As duas portas devem ser diferentes.' }
$ports = @([System.IO.Ports.SerialPort]::GetPortNames())
Write-Host ('Portas disponiveis: ' + ($ports -join ', '))
if ($ports -notcontains $PortA -or $ports -notcontains $PortB) {
  throw 'Portas nao existem. Nenhum byte enviado.'
}
if (-not $RunTraffic -or -not $IConfirmDisposableVmAndVirtualPorts) {
  Write-Host 'SOMENTE DIAGNOSTICO. Para teste em VM, informe os dois switches de consentimento.'
  exit 0
}
Write-Host 'Verifique manualmente a identidade das portas PORTUS no Gerenciador de Dispositivos.'
$a = [System.IO.Ports.SerialPort]::new($PortA,$BaudRate,[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One)
$b = [System.IO.Ports.SerialPort]::new($PortB,$BaudRate,[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One)
$a.ReadTimeout = 2000; $b.ReadTimeout = 2000
$a.WriteTimeout = 2000; $b.WriteTimeout = 2000
function Invoke-OneWay([System.IO.Ports.SerialPort]$sender,[System.IO.Ports.SerialPort]$receiver,[string]$text) {
  $payload = [System.Text.Encoding]::ASCII.GetBytes($text)
  $receiver.DiscardInBuffer()
  $sender.Write($payload,0,$payload.Length)
  $received = [byte[]]::new($payload.Length)
  $total = 0
  while ($total -lt $payload.Length) {
    $count = $receiver.Read($received,$total,$payload.Length-$total)
    if ($count -le 0) { throw 'Leitura interrompida.' }
    $total += $count
  }
  for ($i=0; $i -lt $payload.Length; $i++) {
    if ($received[$i] -ne $payload[$i]) { throw "Byte incorreto na posicao $i" }
  }
  Write-Host "OK: $($sender.PortName) -> $($receiver.PortName) ($total bytes)"
}
try {
  $a.Open(); $b.Open()
  $nonce = [Guid]::NewGuid().ToString('N')
  Invoke-OneWay $a $b "PORTUS-A-$nonce"
  Invoke-OneWay $b $a "PORTUS-B-$nonce"
  Write-Host 'PASS: comunicacao bidirecional.'
} finally {
  if ($a.IsOpen) { $a.Close() }
  if ($b.IsOpen) { $b.Close() }
  $a.Dispose(); $b.Dispose()
}
