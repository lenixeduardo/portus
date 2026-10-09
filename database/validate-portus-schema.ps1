[CmdletBinding()]
param(
  [string]$PostgresBin = "$env:ProgramFiles\PostgreSQL\18\bin",
  [string]$DatabaseHost = "127.0.0.1",
  [ValidateRange(1,65535)][int]$Port = 5432,
  [string]$AdminUser = "postgres",
  [string]$DatabaseName = "portus"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "portus-psql-preflight.ps1")
$psql = Join-Path $PostgresBin "psql.exe"
$psqlProblem = Get-PortusPsqlValidationError -BinPath $PostgresBin -CheckVersion
if ($psqlProblem) { throw $psqlProblem }
if ([string]::IsNullOrWhiteSpace($env:PORTUS_SETUP_ADMIN_PASSWORD)) {
  throw "Senha administrativa obrigatoria. Informe-a na interface do utilitario."
}
if ($AdminUser -notmatch '^[A-Za-z][A-Za-z0-9_]{0,62}$' -or
    $DatabaseName -notmatch '^[A-Za-z][A-Za-z0-9_]{0,62}$') {
  throw "Usuario e nome do banco devem conter somente letras, numeros e _."
}

$env:PGPASSWORD = $env:PORTUS_SETUP_ADMIN_PASSWORD
try {
  $arguments = @(
    "-X", "-tA", "-v", "ON_ERROR_STOP=1",
    "-h", $DatabaseHost, "-p", "$Port",
    "-U", $AdminUser, "-d", $DatabaseName
  )
  Write-Host "Validando $($DatabaseHost):$Port/$DatabaseName com $AdminUser..."

  # Nao escreve no banco: compara o registro de migrations com os arquivos reais.
  $applied = @(& $psql @arguments -c "SELECT name FROM public.portus_schema_migrations ORDER BY name;")
  if ($LASTEXITCODE -ne 0) { throw "Falha ao consultar portus_schema_migrations." }
  $files = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot "migrations") -Filter "*.sql" | Sort-Object Name)
  if ($files.Count -eq 0) { throw "Nenhuma migration SQL encontrada na pasta database/migrations." }
  $pending = @($files | Where-Object { $applied -notcontains $_.Name })
  Write-Host ("Migrations aplicadas: {0}/{1}" -f ($files.Count - $pending.Count), $files.Count)
  if ($pending.Count -gt 0) {
    $names = ($pending | ForEach-Object Name) -join ", "
    throw "Migrations pendentes: $names. Clique em 'Aplicar migrations'."
  }

  $schemaSql = @'
BEGIN TRANSACTION READ ONLY;
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.batches') IS NULL
     OR to_regclass('public.products') IS NULL
     OR to_regclass('public.capture_sessions') IS NULL
     OR to_regclass('public.readings') IS NULL
     OR to_regclass('public.portus_station_settings') IS NULL
     OR to_regclass('public.portus_station_equipment_profiles') IS NULL
     OR to_regclass('public.portus_audit_log') IS NULL
     OR to_regclass('public.portus_auto_exports') IS NULL
     OR to_regclass('public.portus_legacy_import_ledger') IS NULL THEN
    RAISE EXCEPTION 'PORTUS: tabelas das migrations 001-014 ausentes.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'sector_code'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'barcode_value'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'laboratory_profile'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'batches' AND column_name = 'completed'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'active'
  ) THEN
    RAISE EXCEPTION 'PORTUS: colunas obrigatorias ausentes (migrations 012 ou 013).';
  END IF;
  IF to_regprocedure('public.portus_save_product(bigint,text,text,text)') IS NULL
     OR to_regprocedure('public.supervisor_finalize_batch(bigint,bigint,bigint,bigint)') IS NULL
     OR to_regprocedure('public.ensure_station(text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'PORTUS: funcoes obrigatorias ausentes (migrations 012 ou 013).';
  END IF;
END;
$$;
SELECT 'SCHEMA_VALIDADO', current_database(), current_user;
ROLLBACK;
'@
  $result = @(& $psql @arguments -c $schemaSql)
  if ($LASTEXITCODE -ne 0) { throw "Schema inconsistente ou indisponivel. Verifique as mensagens acima." }
  if ($result -notcontains "SCHEMA_VALIDADO|$DatabaseName|$AdminUser") {
    throw "Nao foi possivel confirmar o banco e o usuario do PostgreSQL."
  }
  Write-Host "Banco de dados validado com sucesso. Nenhuma alteracao foi realizada."
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PORTUS_SETUP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
