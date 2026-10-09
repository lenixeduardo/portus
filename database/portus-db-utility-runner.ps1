# UTF-8 subprocess runner for PORTUS WinForms Database Utility.
# The runner writes a machine-readable result only after the script completes.
[CmdletBinding()]
param(
  [ValidateSet("validate","migrate","network","register","seed-admin","selftest")][string]$Operation,
  [Parameter(Mandatory=$true)][string]$ResultPath,
  [string]$DatabaseHost = "127.0.0.1",
  [ValidateRange(1,65535)][int]$Port = 5432,
  [string]$DatabaseName = "portus",
  [string]$AdminUser = "postgres",
  [string]$PostgresBin = "",
  [ValidateSet(0,17)][int]$SelfTestExitCode = 0,
  [switch]$ResetAdminPassword
)
$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$env:PGCLIENTENCODING = "UTF8"

$code = 1
$detail = ""
try {
  if ($Operation -eq "selftest") {
    Write-Host "PORTUS: validação de saída UTF-8 — operação concluída."
    if ($SelfTestExitCode -ne 0) {
      [Console]::Error.WriteLine("PORTUS: erro de teste UTF-8 — código 17.")
      $code = $SelfTestExitCode
    } else {
      $code = 0
    }
  } else {
    switch ($Operation) {
      "validate" {
        $invokeParams = @{ PostgresBin=$PostgresBin; DatabaseHost=$DatabaseHost; Port=$Port; AdminUser=$AdminUser; DatabaseName=$DatabaseName }
        & (Join-Path $PSScriptRoot "validate-portus-schema.ps1") @invokeParams
      }
      "migrate" {
        $invokeParams = @{ MigrationsOnly=$true; SkipAppConfiguration=$true; PostgresBin=$PostgresBin; DatabaseHost=$DatabaseHost; Port=$Port; AdminUser=$AdminUser; DatabaseName=$DatabaseName }
        & (Join-Path $PSScriptRoot "install-portus-database.ps1") @invokeParams
      }
      "seed-admin" {
        if ($DatabaseHost -notin @("127.0.0.1","localhost","::1","[::1]")) {
          throw "Inserir admin/admin e permitido somente no PostgreSQL local de desenvolvimento."
        }
        if (-not (Test-Path -LiteralPath (Join-Path $PostgresBin "psql.exe"))) {
          throw "psql.exe nao encontrado. Informe a pasta bin do PostgreSQL."
        }
        Write-Host "Solicitada configuracao do admin Master local com senha admin (redefinicao somente mediante solicitacao explicita)."
        $invokeParams = @{
          MigrationsOnly=$true; SkipAppConfiguration=$true
          SeedDevAdmin=$true; ResetDevAdminPassword=[bool]$ResetAdminPassword; PostgresBin=$PostgresBin
          DatabaseHost=$DatabaseHost; Port=$Port
          AdminUser=$AdminUser; DatabaseName=$DatabaseName
        }
        & (Join-Path $PSScriptRoot "install-portus-database.ps1") @invokeParams
      }
      "network" {
        $invokeParams = @{ ServerIp=$DatabaseHost; Port=$Port; DatabaseName=$DatabaseName }
        & (Join-Path $PSScriptRoot "check-portus-server-network.ps1") @invokeParams
      }
      "register" {
        $invokeParams = @{ ServerIp=$DatabaseHost; Port=$Port; DatabaseName=$DatabaseName; RegisterFirstInstallation=$true }
        & (Join-Path $PSScriptRoot "check-portus-server-network.ps1") @invokeParams
      }
    }
    if (-not $?) { throw "O script $Operation retornou falha sem excecao detalhada." }
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
      throw "Comando nativo retornou exit code $LASTEXITCODE."
    }
    $code = 0
  }
} catch {
  $code = 1
  $detail = $_.Exception.Message
  [Console]::Error.WriteLine("PORTUS [$Operation]: " + $detail)
} finally {
  $result = @{
    schemaVersion = 1
    operation = $Operation
    exitCode = [int]$code
    completedAt = [DateTime]::UtcNow.ToString("o")
    error = $detail
  } | ConvertTo-Json -Compress
  try {
    [IO.File]::WriteAllText($ResultPath,$result,$utf8)
  } catch {
    [Console]::Error.WriteLine("PORTUS: nao foi possivel salvar resultado: " + $_.Exception.Message)
    $code = 1
  }
}
exit $code
