[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ServerIp,
  [ValidateRange(1,65535)][int]$Port = 5432,
  [string]$DatabaseName = "portus",
  [switch]$RegisterFirstInstallation,
  [string]$ConfigurationRoot = ""
)
$ErrorActionPreference = "Stop"

function Assert-Ipv4([string]$value) {
  $address = $null
  if (-not [System.Net.IPAddress]::TryParse($value,[ref]$address) -or
      $address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
    throw "Informe o IP IPv4 do servidor, como 192.168.0.10. Nomes DNS nao podem ser usados como referencia de IP."
  }
  return $address.ToString()
}
function Read-Reference([string]$file) {
  if (-not (Test-Path -LiteralPath $file)) { return $null }
  try {
    $record = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $record.serverIp -or -not $record.port -or -not $record.databaseName) {
      throw "Campos ausentes."
    }
    return $record
  } catch { throw "Referencia do servidor invalida: $file. Nao altere o arquivo manualmente." }
}
function Read-ConfiguredConnection([string]$root) {
  # A mesma ordem de precedencia do runtime Electron: variavel de ambiente,
  # arquivo LocalAppData e por ultimo Registro do Windows.
  $url = $env:PORTUS_DATABASE_URL
  if (-not [string]::IsNullOrWhiteSpace($url)) { return $url.Trim() }
  $configPath = Join-Path $root "database-config.json"
  if (Test-Path -LiteralPath $configPath) {
    try {
      $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($config.PORTUS_DATABASE_URL) { return [string]$config.PORTUS_DATABASE_URL }
    } catch { throw "O arquivo database-config.json esta invalido." }
  }
  if ([string]::IsNullOrWhiteSpace($ConfigurationRoot)) {
    try {
      $registry = (Get-ItemProperty -Path "HKCU:\Environment" -Name "PORTUS_DATABASE_URL" -ErrorAction Stop).PORTUS_DATABASE_URL
      if ($registry) { return [string]$registry }
    } catch { }
  }
  return $null
}
function Test-Tcp([string]$ip,[int]$port,[int]$timeoutMs=3000) {
  $tcp = New-Object System.Net.Sockets.TcpClient
  try {
    $task = $tcp.BeginConnect($ip,$port,$null,$null)
    try {
      if (-not $task.AsyncWaitHandle.WaitOne($timeoutMs)) { return $false }
      $tcp.EndConnect($task)
      return $tcp.Connected
    } catch { return $false }
    finally { $task.AsyncWaitHandle.Close() }
  } finally { $tcp.Close(); $tcp.Dispose() }
}

$server = Assert-Ipv4 $ServerIp
$root = if ($ConfigurationRoot) { $ConfigurationRoot } else { Join-Path $env:LOCALAPPDATA "PORTUS" }
$referenceFile = Join-Path $root "server-endpoint.json"
$reference = Read-Reference $referenceFile
$configuredUrl = Read-ConfiguredConnection $root

Write-Host "Servidor informado: $($server):$Port/$DatabaseName"
if ([string]::IsNullOrWhiteSpace($configuredUrl)) {
  throw "PORTUS_DATABASE_URL ausente. Configure o servidor na primeira instalacao do PORTUS antes de validar a rede."
}
try { $uri = [Uri]::new($configuredUrl.Trim()) }
catch { throw "A URL do banco configurada no PORTUS e invalida." }
if ($uri.Scheme -notin @("postgresql","postgres")) {
  throw "A URL configurada nao utiliza o protocolo PostgreSQL."
}
$configuredHost = $uri.DnsSafeHost
$configuredPort = if ($uri.IsDefaultPort) { 5432 } else { $uri.Port }
$configuredDatabase = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
Write-Host "Endereco no PORTUS: $($configuredHost):$configuredPort/$configuredDatabase (senha ocultada)"

if ($configuredHost -ne $server -or $configuredPort -ne $Port -or $configuredDatabase -cne $DatabaseName) {
  throw "IP, porta ou banco divergente na configuracao do PORTUS. Corrija a primeira instalacao/PORTUS_DATABASE_URL; nenhuma alteracao automatica foi feita."
}

if ($reference) {
  $expectedIp = Assert-Ipv4 ([string]$reference.serverIp)
  Write-Host "IP cadastrado na primeira instalacao: $expectedIp"
  if ($expectedIp -ne $server -or [int]$reference.port -ne $Port -or
      [string]$reference.databaseName -cne $DatabaseName) {
    throw "IP do servidor DIFERENTE do cadastrado na primeira instalacao ($($expectedIp):$($reference.port)/$($reference.databaseName)). Nao altere o cadastro sem autorizacao."
  }
} elseif (-not $RegisterFirstInstallation) {
  Write-Warning "Sem IP de referencia. Use Registrar IP apos validar a conexao na primeira instalacao."
}

# Consultas de somente leitura ao Windows para descrever o IPv4 da estacao.
$adapters = @()
if (Get-Command Get-NetIPConfiguration -ErrorAction SilentlyContinue) {
  $adapters = @(Get-NetIPConfiguration -ErrorAction SilentlyContinue |
    Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq "Up" })
}
foreach ($adapter in $adapters) {
  $addresses = @($adapter.IPv4Address | ForEach-Object { $_.IPAddress }) -join ", "
  $gateway = if ($adapter.IPv4DefaultGateway) { $adapter.IPv4DefaultGateway.NextHop } else { "(sem gateway padrao)" }
  Write-Host "Estacao: $addresses - interface $($adapter.InterfaceAlias) - gateway $gateway"
}
if ($adapters.Count -eq 0) {
  Write-Warning "Nao foi possivel determinar o IP da estacao. Confira adaptadores e rede Windows."
}

if ($server -notlike "127.*") {
  $localIps = @($adapters | ForEach-Object { $_.IPv4Address } | ForEach-Object { $_.IPAddress })
  if ($localIps -contains $server) {
    throw "Conflito: o IP do servidor tambem esta configurado nesta estacao. Verifique se ela e mesmo o computador servidor."
  }
}
if (-not (Test-Tcp $server $Port)) {
  throw "Servidor $($server):$Port inacessivel via TCP. Verifique IPv4 da estacao, rota/gateway, Wi-Fi/cabo, firewall e servico PostgreSQL. Ping nao e criterio obrigatorio."
}
Write-Host "Conexao TCP ao PostgreSQL: OK ($($server):$Port)"

if ($RegisterFirstInstallation) {
  if ($reference) { throw "O IP de referencia ja esta cadastrado. Cadastro inicial nao pode sobrescrever o existente." }
  if (-not (Test-Path -LiteralPath $root)) { New-Item -ItemType Directory -Path $root -Force | Out-Null }
  $identity = @{
    serverIp = $server
    port = $Port
    databaseName = $DatabaseName
    registeredAt = (Get-Date).ToUniversalTime().ToString("o")
    source = "portus-database-utility"
  }
  $json = $identity | ConvertTo-Json
  $file = [System.IO.File]::Open($referenceFile,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
  try {
    $writer = New-Object System.IO.StreamWriter($file,(New-Object System.Text.UTF8Encoding($false)))
    try { $writer.WriteLine($json); $writer.Flush() }
    finally { $writer.Dispose() }
  } finally { $file.Dispose() }
  Write-Host "IP do servidor registrado para verificacoes futuras."
}
if ($reference -or $RegisterFirstInstallation) {
  Write-Host "VALIDACAO DE IP E REDE: OK"
} else {
  Write-Warning "Conectividade OK; falta registrar o IP de referencia desta estacao."
}
