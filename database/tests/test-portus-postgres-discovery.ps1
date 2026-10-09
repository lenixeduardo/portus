# Testes locais sem PostgreSQL real, sem elevacao e sem alterar servicos.
$ErrorActionPreference = "Stop"
. (Join-Path (Split-Path -Parent $PSScriptRoot) "portus-postgres-discovery.ps1")
function Assert-State([string]$Expected, [object]$Result) {
  if ($Result.State -ne $Expected) {
    throw "Esperado '$Expected'; detectado '$($Result.State)'."
  }
}
$root = Join-Path $env:TEMP ("portus-postgres-discovery-" + [guid]::NewGuid().ToString("N"))
try {
  New-Item -ItemType Directory -Path (Join-Path $root "bin") -Force | Out-Null
  $bytes = New-Object byte[] 2048
  $bytes[0] = 77; $bytes[1] = 90
  [IO.File]::WriteAllBytes((Join-Path $root "bin\psql.exe"), $bytes)
  Assert-State "client-tools-only" (Get-PortusPostgresDiscovery -Roots @($root) -Services @() -SkipWindowsServices)
  Assert-State "not-detected" (Get-PortusPostgresDiscovery -Roots @((Join-Path $root "missing")) -Services @() -SkipWindowsServices)
  $running = [pscustomobject]@{ Name="postgresql-x64-18"; State="Running"; Status="Running"; PathName="" }
  $stopped = [pscustomobject]@{ Name="postgresql-x64-18"; State="Stopped"; Status="Stopped"; PathName="" }
  Assert-State "server-running" (Get-PortusPostgresDiscovery -Roots @($root) -Services @($running))
  Assert-State "server-stopped" (Get-PortusPostgresDiscovery -Roots @($root) -Services @($stopped))
  Write-Host "PORTUS: quatro cenarios de deteccao PostgreSQL validados."
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
