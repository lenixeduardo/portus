[CmdletBinding()]
param(
  [string]$PostgresBin = "$env:ProgramFiles\PostgreSQL\18\bin",
  [Alias("Host")]
  [string]$DatabaseHost = "127.0.0.1",
  [int]$Port = 5432,
  [string]$DatabaseName = "portus",
  [string]$AppUser = "portus_admin",
  [switch]$SkipAppConfiguration
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
  $validationSql = @'
SELECT current_database() AS database, current_user AS runtime_user;
SELECT name, applied_at FROM portus_schema_migrations ORDER BY name;
DO $$
DECLARE
  missing_tables text[];
  missing_functions text[];
BEGIN
  SELECT array_agg(required_name)
    INTO missing_tables
    FROM unnest(ARRAY['batches','capture_sessions','readings','batch_history','applications','sectors']) required_name
   WHERE to_regclass('public.' || required_name) IS NULL;

  SELECT array_agg(required_name)
    INTO missing_functions
    FROM unnest(ARRAY['open_batch','register_reading','move_batch_to_stage','confirm_production_close','confirm_laboratory_close']) required_name
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = required_name
   );

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Tabelas ausentes: %', array_to_string(missing_tables, ', ');
  END IF;
  IF missing_functions IS NOT NULL THEN
    RAISE EXCEPTION 'Funções ausentes: %', array_to_string(missing_functions, ', ');
  END IF;
  IF has_table_privilege(current_user, 'batches', 'INSERT')
     OR has_table_privilege(current_user, 'batches', 'UPDATE')
     OR has_table_privilege(current_user, 'batches', 'DELETE') THEN
    RAISE EXCEPTION 'A credencial de runtime possui escrita direta indevida em batches';
  END IF;
END
$$;
'@
  & $psql -X -v ON_ERROR_STOP=1 -h $DatabaseHost -p $Port -U $AppUser -d $DatabaseName -c $validationSql
  if ($LASTEXITCODE -ne 0) { throw "Validação falhou (código $LASTEXITCODE)." }
  if (-not $SkipAppConfiguration) {
    $encodedUser = [Uri]::EscapeDataString($AppUser)
    $encodedPassword = [Uri]::EscapeDataString($password)
    $uriHost = if ($DatabaseHost.Contains(":")) { "[$DatabaseHost]" } else { $DatabaseHost }
    $connectionString = "postgresql://${encodedUser}:${encodedPassword}@${uriHost}:${Port}/${DatabaseName}"
    [Environment]::SetEnvironmentVariable("PORTUS_DATABASE_URL", $connectionString, "User")
    [Environment]::SetEnvironmentVariable("PORTUS_DATABASE_MODE", "central", "User")
    $configDirectory = Join-Path $env:LOCALAPPDATA "PORTUS"
    $configPath = Join-Path $configDirectory "database-config.json"
    New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
    $configJson = @{
      PORTUS_DATABASE_URL = $connectionString
      PORTUS_DATABASE_MODE = "central"
    } | ConvertTo-Json
    [IO.File]::WriteAllText($configPath, $configJson, [Text.UTF8Encoding]::new($false))
    Write-Host "Conexão do aplicativo salva em $configPath." -ForegroundColor Green
  }
  Write-Host "Banco PORTUS disponível." -ForegroundColor Green
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
