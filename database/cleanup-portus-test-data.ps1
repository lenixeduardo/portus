[CmdletBinding()]
param(
  [string]$PostgresBin,
  [string]$DatabaseHost = '127.0.0.1',
  [ValidateRange(1,65535)][int]$Port = 5432,
  [string]$DatabaseName = 'portus',
  [string]$AdminUser = 'postgres',
  [string]$PreviewPath = '',
  [string]$BatchIds = '',
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
    Write-Host "Previa: $(@($preview.batches).Count) lotes disponiveis. Marque explicitamente os lotes de teste. Nenhum dado alterado."
    return
  }
  # IDs numericos explicitos; nunca inferimos dados de teste pelo nome.
  if ($BatchIds -notmatch '^[1-9][0-9]*(,[1-9][0-9]*)*$') { throw 'Selecione os IDs dos lotes de teste antes de limpar.' }
  $ids = @($BatchIds.Split(',') | ForEach-Object {
    $id = 0L
    if (-not [long]::TryParse($_,[ref]$id) -or $id -le 0) { throw 'ID de lote invalido.' }
    $id
  } | Sort-Object -Unique)
  if ($ids.Count -gt 500) { throw 'Selecione no maximo 500 lotes por operacao.' }
  $pgDump = Join-Path $PostgresBin 'pg_dump.exe'
  if (-not (Test-Path -LiteralPath $pgDump -PathType Leaf)) { throw 'pg_dump.exe ausente. Backup obrigatorio; limpeza cancelada.' }
  $backupRoot = Join-Path $env:LOCALAPPDATA 'PORTUS\backups'
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  $backup = Join-Path $backupRoot ('before-test-cleanup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N') + '.dump')
  Write-Host "Criando backup de $($DatabaseHost):$Port/$DatabaseName..."
  & $pgDump -h $DatabaseHost -p "$Port" -U $AdminUser -d $DatabaseName -Fc -f $backup
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backup) -or (Get-Item -LiteralPath $backup).Length -eq 0) { throw 'Backup falhou. Nenhum dado removido.' }
  Write-Host "Backup preservado: $backup"
  $batchList = $ids -join ','
  & $psql @arguments -v "batch_ids=$batchList" -v "backup_path=$backup" -f (Join-Path $PSScriptRoot 'maintenance\cleanup-test-batches.sql')
  if ($LASTEXITCODE -ne 0) { throw 'Limpeza cancelada; transacao nao confirmada. Backup preservado.' }
  Write-Host "Lotes de teste removidos do banco central: $batchList. Leituras, sessoes e historicos relacionados removidos."
} finally {
  $env:PGPASSWORD = $previousPassword
  $env:PGCONNECT_TIMEOUT = $previousTimeout
}
