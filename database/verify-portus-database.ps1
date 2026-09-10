[CmdletBinding()]
param(
  [string]$PostgresBin = "$env:ProgramFiles\PostgreSQL\18\bin",
  [string]$Host = "127.0.0.1",
  [int]$Port = 5432,
  [string]$DatabaseName = "portus",
  [string]$AppUser = "portus_admin"
)

$ErrorActionPreference = "Stop"
$psql = Join-Path $PostgresBin "psql.exe"

function Read-PlainPassword([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

try {
  if (-not (Test-Path $psql)) { throw "psql.exe não encontrado em '$psql'." }
  $password = Read-PlainPassword "Senha do usuário $AppUser"
  $env:PGPASSWORD = $password
  & $psql -X -v ON_ERROR_STOP=1 -h $Host -p $Port -U $AppUser -d $DatabaseName -c "SELECT current_database(), current_user; SELECT name, applied_at FROM portus_schema_migrations ORDER BY name;"
  if ($LASTEXITCODE -ne 0) { throw "Validação falhou (código $LASTEXITCODE)." }
  Write-Host "Banco PORTUS disponível." -ForegroundColor Green
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
