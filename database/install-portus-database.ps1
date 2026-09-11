[CmdletBinding()]
param(
  [string]$PostgresBin = "$env:ProgramFiles\PostgreSQL\18\bin",
  [Alias("Host")]
  [string]$DatabaseHost = "127.0.0.1",
  [int]$Port = 5432,
  [string]$AdminUser = "postgres",
  [string]$DatabaseName = "portus",
  [string]$AppUser = "portus_admin",
  [switch]$MigrationsOnly,
  [switch]$SkipTests,
  [switch]$SkipAppConfiguration
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$psql = Join-Path $PostgresBin "psql.exe"

function Assert-Identifier([string]$Value, [string]$Label) {
  if ($Value -notmatch '^[A-Za-z][A-Za-z0-9_]{0,62}$') {
    throw "$Label deve começar com letra e conter somente letras, números ou _."
  }
}

function Read-PlainPassword([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Invoke-Psql([string]$User, [string]$Password, [string]$Database, [string[]]$Arguments) {
  $env:PGPASSWORD = $Password
  & $psql -h $DatabaseHost -p $Port -U $User -d $Database -v ON_ERROR_STOP=1 @Arguments
  if ($LASTEXITCODE -ne 0) { throw "psql falhou (código $LASTEXITCODE)." }
}

try {
  if (-not (Test-Path $psql)) { throw "psql.exe não encontrado em '$psql'. Informe -PostgresBin com a pasta bin correta." }
  Assert-Identifier $DatabaseName "Nome do banco"
  Assert-Identifier $AppUser "Usuário da aplicação"

  Write-Host "Instalação do banco central PORTUS" -ForegroundColor Cyan
  $adminPassword = Read-PlainPassword "Senha do administrador PostgreSQL ($AdminUser)"
  $appPassword = $null
  if (-not $MigrationsOnly) {
    $appPassword = Read-PlainPassword "Senha para o usuário $AppUser"
    if ([string]::IsNullOrWhiteSpace($appPassword)) { throw "A senha do usuário da aplicação não pode ser vazia." }
    $confirm = Read-PlainPassword "Confirme a senha para $AppUser"
    if ($appPassword -cne $confirm) { throw "As senhas do usuário da aplicação não coincidem." }
  }

  # Cria role e banco somente se ausentes. O comando é seguro contra SQL injection
  # porque os identificadores são validados e os valores são enviados pelo psql.
  if (-not $MigrationsOnly) {
  $bootstrapSql = @'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
ALTER ROLE :"app_user" LOGIN PASSWORD :'app_password';
SELECT format('CREATE DATABASE %I', :'db_name')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name') \gexec
'@
  $bootstrapFile = Join-Path ([IO.Path]::GetTempPath()) ("portus-bootstrap-" + [guid]::NewGuid() + ".sql")
  Set-Content -Path $bootstrapFile -Value $bootstrapSql -Encoding utf8NoBOM
  try {
    Invoke-Psql $AdminUser $adminPassword "postgres" @("-v", "app_user=$AppUser", "-v", "app_password=$appPassword", "-v", "db_name=$DatabaseName", "-f", $bootstrapFile)
  } finally { Remove-Item $bootstrapFile -Force -ErrorAction SilentlyContinue }
  }

  # As migrations precisam do administrador: a migration de segurança revoga os
  # privilégios implícitos e a credencial operacional jamais é usada para instalar.
  $migrationState = "CREATE TABLE IF NOT EXISTS portus_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());"
  Invoke-Psql $AdminUser $adminPassword $DatabaseName @("-c", $migrationState)
  Get-ChildItem (Join-Path $PSScriptRoot "migrations") -Filter "*.sql" | Sort-Object Name | ForEach-Object {
    $name = $_.Name
    $exists = & $psql -h $DatabaseHost -p $Port -U $AdminUser -d $DatabaseName -tA -v ON_ERROR_STOP=1 -c "SELECT EXISTS (SELECT 1 FROM portus_schema_migrations WHERE name = '$name');"
    if ($LASTEXITCODE -ne 0) { throw "Não foi possível consultar o estado da migration $name." }
    if ($exists.Trim() -eq "t") { Write-Host "Migration já aplicada: $name"; return }
    Invoke-Psql $AdminUser $adminPassword $DatabaseName @("-f", $_.FullName)
    Invoke-Psql $AdminUser $adminPassword $DatabaseName @("-c", "INSERT INTO portus_schema_migrations (name) VALUES ('$name');")
    Write-Host "Migration aplicada: $name" -ForegroundColor Green
  }
  if (-not $MigrationsOnly) {
    Invoke-Psql $AdminUser $adminPassword $DatabaseName @("-f", (Join-Path $PSScriptRoot "seed\reference.sql"))
  }

  # Credencial de runtime: leitura e captura técnica estritamente necessárias;
  # alterações de lote passam somente pelas funções de domínio.
  if (-not $MigrationsOnly) {
  $grantSql = @'
GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT INSERT, UPDATE ON TABLE capture_sessions TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO :"app_user";
'@
  $grantFile = Join-Path ([IO.Path]::GetTempPath()) ("portus-grants-" + [guid]::NewGuid() + ".sql")
  Set-Content -Path $grantFile -Value $grantSql -Encoding utf8NoBOM
  try { Invoke-Psql $AdminUser $adminPassword $DatabaseName @("-v", "app_user=$AppUser", "-f", $grantFile) }
  finally { Remove-Item $grantFile -Force -ErrorAction SilentlyContinue }
  }

  if (-not $MigrationsOnly) {
    Invoke-Psql $AppUser $appPassword $DatabaseName @("-c", "SELECT current_database() AS database, current_user AS user;")
  }
  if (-not $SkipTests -and -not $MigrationsOnly) {
    Get-ChildItem (Join-Path $PSScriptRoot "tests") -Filter "00[12]_*.sql" | Sort-Object Name | ForEach-Object {
      Invoke-Psql $AdminUser $adminPassword $DatabaseName @("-f", $_.FullName)
    }
  }
  if ($MigrationsOnly) {
    Write-Host "Migrations do PORTUS atualizadas com sucesso." -ForegroundColor Green
  } else {
    if (-not $SkipAppConfiguration) {
      $encodedUser = [Uri]::EscapeDataString($AppUser)
      $encodedPassword = [Uri]::EscapeDataString($appPassword)
      $uriHost = if ($DatabaseHost.Contains(":")) { "[$DatabaseHost]" } else { $DatabaseHost }
      $connectionString = "postgresql://${encodedUser}:${encodedPassword}@${uriHost}:${Port}/${DatabaseName}"
      [Environment]::SetEnvironmentVariable("PORTUS_DATABASE_URL", $connectionString, "User")
      [Environment]::SetEnvironmentVariable("PORTUS_DATABASE_MODE", "central", "User")
      $env:PORTUS_DATABASE_URL = $connectionString
      $env:PORTUS_DATABASE_MODE = "central"
      $configDirectory = Join-Path $env:LOCALAPPDATA "PORTUS"
      $configPath = Join-Path $configDirectory "database-config.json"
      New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
      $configJson = @{
        PORTUS_DATABASE_URL = $connectionString
        PORTUS_DATABASE_MODE = "central"
      } | ConvertTo-Json
      [IO.File]::WriteAllText($configPath, $configJson, [Text.UTF8Encoding]::new($false))
      Write-Host "Configuração do PORTUS salva para o usuário atual do Windows." -ForegroundColor Green
      Write-Host "Arquivo de conexão salvo em $configPath." -ForegroundColor Green
      Write-Host "Feche e reabra o PORTUS caso ele já estivesse em execução." -ForegroundColor Yellow
    }
    Write-Host "Banco PORTUS pronto para uso em $DatabaseHost`:$Port/$DatabaseName." -ForegroundColor Green
  }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
