[CmdletBinding()]
param(
  [string]$PostgresBin,
  [string]$DatabaseHost = '127.0.0.1',
  [ValidateRange(1,65535)][int]$Port = 5432,
  [string]$DatabaseName = 'portus',
  [string]$AdminUser = 'postgres',
  [string]$PreviewPath = '',
  [string]$BatchIds = '',
  [string]$ProductIds = '',
  [string]$UserIds = '',
  [switch]$ClearHistory,
  [switch]$ConfirmCleanup
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'portus-psql-preflight.ps1')
$problem = Get-PortusPsqlValidationError -BinPath $PostgresBin -CheckVersion
if ($problem) { throw $problem }
if ([string]::IsNullOrWhiteSpace($env:PORTUS_SETUP_ADMIN_PASSWORD)) { throw 'Informe a senha administrativa do PostgreSQL.' }
if ($DatabaseName -notmatch '^[A-Za-z][A-Za-z0-9_]{0,62}$' -or $AdminUser -notmatch '^[A-Za-z][A-Za-z0-9_]{0,62}$') { throw 'Banco ou usuario invalido.' }
$psql = Join-Path $PostgresBin 'psql.exe'
$previousPassword = $env:PGPASSWORD
$previousTimeout = $env:PGCONNECT_TIMEOUT
try {
  $env:PGPASSWORD = $env:PORTUS_SETUP_ADMIN_PASSWORD
  $env:PGCONNECT_TIMEOUT = '10'
  $arguments = @('-X','-q','-tA','-v','ON_ERROR_STOP=1','-h',$DatabaseHost,'-p',"$Port",'-U',$AdminUser,'-d',$DatabaseName)
  if (-not $ConfirmCleanup) {
    if ([string]::IsNullOrWhiteSpace($PreviewPath)) { throw 'Caminho da previa ausente.' }
    $output = @(& $psql @arguments -f (Join-Path $PSScriptRoot 'maintenance\preview-test-batches.sql'))
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel consultar a previa. Nenhum dado alterado.' }
    $json = $output -join [Environment]::NewLine
    $preview = $json | ConvertFrom-Json
    if ($preview.database -cne $DatabaseName -or $preview.databaseUser -cne $AdminUser) { throw 'Banco ou usuario da previa divergente.' }
    [IO.File]::WriteAllText($PreviewPath,$json,[Text.UTF8Encoding]::new($false))
    Write-Host "Previa: $(@($preview.batches).Count) lotes, $(@($preview.products).Count) produtos e $(@($preview.users).Count) usuarios. Nenhum dado alterado."
    return
  }
  # Selecao explicita. Listas vazias sao permitidas, mas nunca inferidas.
  foreach ($value in @($BatchIds,$ProductIds,$UserIds)) {
    if ($value -ne '' -and $value -notmatch '^[1-9][0-9]*(,[1-9][0-9]*)*$') {
      throw 'Selecao invalida. Use somente IDs numericos positivos.'
    }
    if ($value -and $value.Split(',').Count -gt 10000) { throw 'Selecao excede 10000 registros por categoria.' }
  }
  if (-not $BatchIds -and -not $ProductIds -and -not $UserIds -and -not $ClearHistory) {
    throw 'Nenhum registro selecionado.'
  }
  $pgDump = Join-Path $PostgresBin 'pg_dump.exe'
  if (-not (Test-Path -LiteralPath $pgDump -PathType Leaf)) { throw 'pg_dump.exe ausente. Backup obrigatorio; limpeza cancelada.' }
  $backupRoot = Join-Path $env:LOCALAPPDATA 'PORTUS\backups'
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  $backup = Join-Path $backupRoot ('before-test-cleanup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N') + '.dump')
  Write-Host "Criando backup de $($DatabaseHost):$Port/$DatabaseName..."
  & $pgDump -h $DatabaseHost -p "$Port" -U $AdminUser -d $DatabaseName -Fc -f $backup
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backup) -or (Get-Item -LiteralPath $backup).Length -eq 0) { throw 'Backup falhou. Nenhum dado removido.' }
  Write-Host "Backup preservado: $backup"
  & $psql @arguments -v "batch_ids=$BatchIds" -v "product_ids=$ProductIds" -v "user_ids=$UserIds" -v "clear_history=$($ClearHistory.IsPresent.ToString().ToLowerInvariant())" -v "backup_path=$backup" -f (Join-Path $PSScriptRoot 'maintenance\cleanup-test-batches.sql')
  if ($LASTEXITCODE -ne 0) { throw 'Limpeza cancelada; transacao nao confirmada. Backup preservado.' }
  Write-Host "Limpeza concluida. Lotes: $BatchIds | Produtos: $ProductIds | Usuarios: $UserIds | Historicos avulsos: $ClearHistory"
} finally {
  $env:PGPASSWORD = $previousPassword
  $env:PGCONNECT_TIMEOUT = $previousTimeout
}
