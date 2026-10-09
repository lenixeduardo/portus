# Shared preflight for the native PostgreSQL client. Windows PowerShell 5.1.
# This file never downloads, replaces or deletes psql.exe or database files.
function Get-PortusPsqlValidationError {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)][string]$BinPath,
    [switch]$CheckVersion
  )
  if ([string]::IsNullOrWhiteSpace($BinPath)) {
    return "Informe a pasta bin da instalacao oficial do PostgreSQL."
  }
  $psql = Join-Path $BinPath "psql.exe"
  if (-not (Test-Path -LiteralPath $psql -PathType Leaf)) {
    return "psql.exe nao encontrado em '$psql'. Selecione a pasta bin correta do PostgreSQL."
  }
  try {
    $file = Get-Item -LiteralPath $psql -ErrorAction Stop
    if ($file.Length -lt 1024) {
      return "psql.exe invalido ($($file.Length) bytes) em '$psql'. O arquivo esta vazio ou incompleto. Repare/instale o cliente PostgreSQL oficial; nao altere a pasta data do banco."
    }
    $stream = [IO.File]::OpenRead($psql)
    try {
      if ($stream.ReadByte() -ne 77 -or $stream.ReadByte() -ne 90) {
        return "psql.exe invalido em '$psql': cabecalho de executavel Windows ausente. Repare/instale o cliente PostgreSQL."
      }
    } finally { $stream.Dispose() }
    if ($CheckVersion) {
      try {
        $version = & $psql --version 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0 -or $version -notmatch '(?i)psql\s*\(PostgreSQL\)') {
          return "psql.exe nao inicia corretamente em '$psql' (codigo $LASTEXITCODE). Saida: $version. Repare o cliente PostgreSQL e suas DLLs."
        }
      } catch {
        return "psql.exe nao pode ser executado em '$psql': $($_.Exception.Message). Repare o cliente PostgreSQL."
      }
    }
  } catch {
    return "Nao foi possivel validar psql.exe em '$psql': $($_.Exception.Message)"
  }
  return $null
}
