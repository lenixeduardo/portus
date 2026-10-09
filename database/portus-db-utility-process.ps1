# Conclusao confiavel de subprocesso no Windows PowerShell 5.1.
# O processo deve ter terminado antes da chamada; WaitForExit sincroniza o
# handle nativo e libera a propriedade ExitCode do System.Diagnostics.Process.
function Get-PortusChildExitCode {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)]
    [System.Diagnostics.Process]$Process
  )
  $Process.WaitForExit()
  $value = $Process.ExitCode
  if ($null -eq $value) {
    throw "ExitCode indisponivel para PID $($Process.Id) apos WaitForExit()."
  }
  return [int]$value
}


# The runner writes a result JSON after completion. Never infer success from
# log content or from a nullable Start-Process ExitCode.
function Get-PortusOperationResult {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)]
    [ValidateSet("validate","migrate","network","register","seed-admin","import-legacy","selftest")]
    [string]$Operation
  )
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Resultado ausente para $Operation. O processo nao confirmou a conclusao. Consulte stderr no log."
  }
  try {
    $json = [IO.File]::ReadAllText($Path,[Text.Encoding]::UTF8)
    $result = $json | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "Resultado do processo $Operation ilegivel: $($_.Exception.Message)"
  }
  $code = 0
  if ($result.schemaVersion -ne 1 -or $result.operation -cne $Operation -or
      $null -eq $result.exitCode -or
      -not [int]::TryParse([string]$result.exitCode,[ref]$code) -or
      $code -lt 0) {
    throw "Resultado do processo $Operation incompleto ou inesperado."
  }
  $result.exitCode = $code
  return $result
}

# Returns the exact legacy import script from either a repository checkout
# or a fully packaged, standalone Windows installer.
function Find-PortusLegacyImporter([string]$DatabaseDirectory) {
  $candidates=@(
    (Join-Path $DatabaseDirectory "migration-runtime\import-legacy-to-postgres.mjs"),
    (Join-Path (Split-Path -Parent $DatabaseDirectory) "scripts\import-legacy-to-postgres.mjs")
  )
  foreach($file in $candidates){
    if(Test-Path -LiteralPath $file -PathType Leaf){return $file}
  }
  throw "Importador SQLite ausente. Atualize o pacote PORTUS com migration-runtime."
}
function Find-PortusNode([string]$DatabaseDirectory) {
  $local=Join-Path $DatabaseDirectory "migration-runtime\node.exe"
  if(Test-Path -LiteralPath $local -PathType Leaf){return $local}
  $installed=Get-Command node.exe -ErrorAction SilentlyContinue
  if($installed){return [string]$installed.Source}
  throw "Runtime Node.js ausente. Reinstale o pacote PORTUS ou disponibilize Node.js."
}
