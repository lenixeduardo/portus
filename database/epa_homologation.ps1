#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$PostgresBin,
  [string]$DatabaseHost = '127.0.0.1',
  [ValidateRange(1, 65535)][int]$Port = 5432,
  [ValidatePattern('^[A-Za-z][A-Za-z0-9_]{0,62}$')][string]$AdminUser = 'postgres',
  [ValidatePattern('^[A-Za-z][A-Za-z0-9_]{0,62}$')][string]$DatabaseName = 'portus',
  [string]$BackupPath,
  [string]$ReportPath = ("epa-homologation-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff')),
  [switch]$ApplyMigrations,
  [switch]$RunTests,
  [switch]$ConfirmHomologation
)

# libpq reads pgpass.conf or an existing PGPASSWORD. No credentials are accepted
# on the command line or included in the report.
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$report = [ordered]@{
  startedUtc = [DateTime]::UtcNow.ToString('o')
  status = 'failed'
  stage = 'initialization'
  installation = $null
  postgresVersion = $null
  schemaDiagnostics = @()
  appliedBefore = @()
  appliedAfter = @()
  pendingEpa = @()
  backup = 'not-provided'
  tests = @()
  failure = $null
}

function Invoke-EpaPsql([string[]]$Arguments, [string]$FailureMessage) {
  $output = @(& $psql @connection -X -q -A -t -v 'ON_ERROR_STOP=1' @Arguments 2>$null)
  if ($LASTEXITCODE -ne 0) {
    throw ("{0} (psql exit {1})." -f $FailureMessage, $LASTEXITCODE)
  }
  return $output
}

function Read-EpaLedger {
  $ledgerPresent = Invoke-EpaPsql @('-c', "SELECT to_regclass('public.portus_schema_migrations') IS NOT NULL;") 'Consulta ao ledger falhou'
  if ($ledgerPresent -ne 't') { return }
  Invoke-EpaPsql @('-c', 'SELECT name FROM public.portus_schema_migrations ORDER BY name;') 'Leitura do ledger falhou'
}

function Test-EpaBackup([string]$Path) {
  if (-not (Test-Path -LiteralPath $restore -PathType Leaf)) { return $false }
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  if ((Get-Item -LiteralPath $Path).Length -le 0) { return $false }
  # Read archive entries only. The database is not contacted by this command.
  & $restore --list -- $Path 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}

$originalOptions = $env:PGOPTIONS
$originalEncoding = $env:PGCLIENTENCODING
$originalTimeout = $env:PGCONNECT_TIMEOUT
$partialBackup = $null
$reportFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ReportPath)
if (Test-Path -LiteralPath $reportFile) { throw 'O arquivo de relatorio ja existe.' }
if (-not (Test-Path -LiteralPath (Split-Path -Parent $reportFile) -PathType Container)) {
  throw 'A pasta do relatorio deve existir.'
}
$exitCode = 1
try {
  if (($ApplyMigrations -or $RunTests) -and -not $ConfirmHomologation) {
    throw 'Use -ConfirmHomologation somente para uma copia isolada do banco.'
  }
  $report.stage = 'installation'
  . (Join-Path $PSScriptRoot 'portus-postgres-discovery.ps1')
  $installation = Get-PortusPostgresDiscovery
  $report.installation = $installation.State
  if (-not $PostgresBin) {
    $PostgresBin = $installation.BinPath
    if (-not $PostgresBin) {
      $client = Get-Command psql.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($client) { $PostgresBin = Split-Path -Parent $client.Source }
    }
  }
  if (-not $PostgresBin) { throw 'psql.exe nao encontrado. Informe -PostgresBin.' }
  if (Get-PortusPsqlValidationError -BinPath $PostgresBin -CheckVersion) {
    throw 'psql.exe invalido. Verifique a instalacao indicada em -PostgresBin.'
  }
  $psql = Join-Path $PostgresBin 'psql.exe'
  $dump = Join-Path $PostgresBin 'pg_dump.exe'
  $restore = Join-Path $PostgresBin 'pg_restore.exe'
  $connection = @('-w', '-h', $DatabaseHost, '-p', "$Port", '-U', $AdminUser, '-d', $DatabaseName)

  $report.stage = 'diagnostics'
  $env:PGCLIENTENCODING = 'UTF8'
  $env:PGCONNECT_TIMEOUT = '10'
  $env:PGOPTIONS = "$originalOptions -c default_transaction_read_only=on".Trim()
  $report.postgresVersion = Invoke-EpaPsql @('-c', 'SHOW server_version;') 'Conexao PostgreSQL falhou'
  $report.appliedBefore = @(Read-EpaLedger)
  $report.appliedAfter = $report.appliedBefore
  $testDirectory = Join-Path $PSScriptRoot 'tests'
  # O primeiro registro identifica banco e papel. O relatorio conserva o catalogo.
  $preflight = @(Invoke-EpaPsql @('-f', (Join-Path $testDirectory 'epa_preflight.sql')) 'Preflight EPA falhou')
  $report.schemaDiagnostics = @($preflight | Select-Object -Skip 1)

  $migrationDirectory = Join-Path $PSScriptRoot 'migrations'
  $files = @(Get-ChildItem -LiteralPath $migrationDirectory -Filter '*.sql' -File | Sort-Object Name)
  $baseline = @($files | Where-Object { $_.Name -match '^(00[1-9]|01[0-9]|02[0-6])_[a-z0-9_]+\.sql$' })
  $epa = @($files | Where-Object { $_.Name -match '^(02[7-9]|03[0-2])_[a-z0-9_]+\.sql$' })
  $missingBaseline = @($baseline | Where-Object { $report.appliedBefore -cnotcontains $_.Name })
  $report.missingBaseline = @($missingBaseline | ForEach-Object Name)
  $report.epaFilesPresent = @($epa | ForEach-Object Name)
  $pending = @($epa | Where-Object { $report.appliedBefore -cnotcontains $_.Name })
  $report.pendingEpa = @($pending | ForEach-Object Name)
  $report.backupToolsAvailable = (Test-Path -LiteralPath $dump -PathType Leaf) -and
    (Test-Path -LiteralPath $restore -PathType Leaf)
  if ($BackupPath) {
    $BackupPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($BackupPath)
    if ($BackupPath -ieq $reportFile) { throw 'Backup e relatorio devem usar caminhos diferentes.' }
    $report.backup = if (Test-EpaBackup $BackupPath) { 'archive-readable' } else { 'missing-or-invalid' }
  }

  if ($ApplyMigrations -or $RunTests) {
    $expectedNumbers = 1..32 | ForEach-Object { '{0:000}' -f $_ }
    $availableNumbers = @($baseline + $epa | ForEach-Object { $_.Name.Substring(0, 3) })
    if (($availableNumbers -join ',') -cne ($expectedNumbers -join ',')) {
      throw 'O checkout deve conter exatamente uma migration por versao de 001 a 032.'
    }
    if ($missingBaseline.Count -gt 0) { throw 'O ledger nao confirma a aplicacao das migrations 001 a 026.' }
    $expectedPrefix = @($epa | Select-Object -First ($epa.Count - $pending.Count) | ForEach-Object Name)
    $appliedEpa = @($epa | Where-Object { $report.appliedBefore -ccontains $_.Name } | ForEach-Object Name)
    if (($appliedEpa -join ',') -cne ($expectedPrefix -join ',')) { throw 'O ledger EPA contem lacunas.' }
  }

  $requiredTestNames = @(
    'epa_integrity.test.sql', 'epa_permissions.test.sql', 'epa_calculations.test.sql',
    'epa_conformity.test.sql', 'epa_release_integration.test.sql'
  )
  if ($RunTests) {
    foreach ($name in $requiredTestNames) {
      if (-not (Test-Path -LiteralPath (Join-Path $testDirectory $name) -PathType Leaf)) {
        throw "Teste obrigatorio ausente: $name"
      }
    }
  }

  if ($ApplyMigrations -and $pending.Count -gt 0) {
    $report.stage = 'backup'
    if (-not $BackupPath -or -not $report.backupToolsAvailable) {
      throw 'Informe um novo -BackupPath e disponibilize pg_dump.exe e pg_restore.exe.'
    }
    if ((Test-Path -LiteralPath $BackupPath) -or
        -not (Test-Path -LiteralPath (Split-Path -Parent $BackupPath) -PathType Container)) {
      throw 'A pasta do backup deve existir e o arquivo de destino deve ser novo.'
    }
    $partialBackup = "$BackupPath.$([guid]::NewGuid().ToString('N')).partial"
    & $dump @connection '--format=custom' "--file=$partialBackup" 2>$null
    if ($LASTEXITCODE -ne 0 -or -not (Test-EpaBackup $partialBackup)) {
      throw 'Falha na criacao ou leitura do arquivo de backup do banco indicado.'
    }
    [IO.File]::Move($partialBackup, $BackupPath)
    $partialBackup = $null
    $report.backup = 'created-and-archive-readable'

    $report.stage = 'migrations'
    $env:PGOPTIONS = $originalOptions
    $pendingLiterals = ($pending | ForEach-Object { "'$($_.Name)'" }) -join ', '
    $guard = @'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.portus_schema_migrations WHERE name IN (PENDING_MIGRATIONS)) THEN
    RAISE EXCEPTION 'Ledger changed since preflight';
  END IF;
END;
$$;
'@
    $guard = $guard.Replace('PENDING_MIGRATIONS', $pendingLiterals)
    $arguments = @(
      '--single-transaction',
      '-c', 'LOCK TABLE public.portus_schema_migrations IN SHARE ROW EXCLUSIVE MODE;',
      '-c', $guard
    )
    foreach ($file in $pending) {
      $arguments += @(
        '-f', $file.FullName,
        '-c', "INSERT INTO public.portus_schema_migrations (name) VALUES ('$($file.Name)');"
      )
    }
    Invoke-EpaPsql $arguments 'Aplicacao atomica das migrations EPA falhou' | Out-Null

    $env:PGOPTIONS = "$originalOptions -c default_transaction_read_only=on".Trim()
    $report.appliedAfter = @(Read-EpaLedger)
    $report.pendingEpa = @($epa | Where-Object { $report.appliedAfter -cnotcontains $_.Name } | ForEach-Object Name)
    if ($report.pendingEpa.Count -gt 0) { throw 'O ledger ainda indica migrations EPA pendentes.' }
  }

  if ($RunTests) {
    $report.stage = 'tests'
    if ($report.pendingEpa.Count -gt 0) { throw 'Os testes exigem migrations EPA aplicadas.' }
    $env:PGOPTIONS = $originalOptions
    foreach ($name in $requiredTestNames) {
      try {
        Invoke-EpaPsql @('-f', (Join-Path $testDirectory $name)) "Teste $name falhou" | Out-Null
        $report.tests += [ordered]@{ name = $name; status = 'passed' }
      } catch {
        $report.tests += [ordered]@{ name = $name; status = 'failed' }
      }
    }
    if (@($report.tests | Where-Object { $_.status -eq 'failed' }).Count -gt 0) {
      throw 'Um ou mais testes EPA falharam. Consulte os nomes no relatorio.'
    }
  }

  $report.status = 'completed'
  $report.stage = 'completed'
  $exitCode = 0
} catch {
  $report.failure = $_.Exception.Message
  Write-Warning $report.failure
} finally {
  $env:PGOPTIONS = $originalOptions
  $env:PGCLIENTENCODING = $originalEncoding
  $env:PGCONNECT_TIMEOUT = $originalTimeout
  if ($partialBackup) { Remove-Item -LiteralPath $partialBackup -ErrorAction SilentlyContinue }
  $report.finishedUtc = [DateTime]::UtcNow.ToString('o')
  $reportStream = [IO.File]::Open($reportFile, [IO.FileMode]::CreateNew)
  try {
    $bytes = $utf8.GetBytes(($report | ConvertTo-Json -Depth 6))
    $reportStream.Write($bytes, 0, $bytes.Length)
  } finally { $reportStream.Dispose() }
  Write-Host "Relatorio EPA: $reportFile"
}
exit $exitCode
