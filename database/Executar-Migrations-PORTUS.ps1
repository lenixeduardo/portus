[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][string]$PostgresBin,
  [Parameter(Mandatory = $true)][string]$DatabaseHost,
  [Parameter(Mandatory = $true)][int]$Port,
  [Parameter(Mandatory = $true)][string]$DatabaseName,
  [Parameter(Mandatory = $true)][string]$AdminUser
)

$ErrorActionPreference = 'Stop'
$exitCode = 1
$securePassword = $null

try {
  if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) {
    throw 'Instalador de banco nao encontrado.'
  }
  $psql = Join-Path $PostgresBin 'psql.exe'
  if (-not (Test-Path -LiteralPath $psql -PathType Leaf)) {
    throw 'psql.exe nao encontrado no diretorio informado.'
  }

  # Ler a senha antes da confirmacao, sem exibir nem salvar em arquivo.
  $securePassword = Read-Host "Senha do administrador PostgreSQL ($AdminUser)" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
  if ([string]::IsNullOrWhiteSpace($plainPassword)) {
    throw 'A senha do administrador nao pode ser vazia.'
  }
  $env:PGPASSWORD = $plainPassword
  $plainPassword = $null

  # Validar a senha antes de autorizar alteracoes no banco.
  & $psql -w -h $DatabaseHost -p $Port -U $AdminUser -d $DatabaseName -v 'ON_ERROR_STOP=1' -tA -c 'SELECT 1;' | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'Falha ao autenticar no PostgreSQL. Confira a senha, o endereco e o banco.'
  }
  Write-Host 'Credenciais PostgreSQL verificadas.' -ForegroundColor Green

  $answer = Read-Host 'Aplicar migrations pendentes no banco indicado? (S/N)'
  if ($answer -notmatch '^[Ss]$') {
    Write-Host 'Operacao cancelada. Nenhuma migration foi iniciada.' -ForegroundColor Yellow
    $exitCode = 2
  } else {
    $env:PORTUS_SETUP_ADMIN_PASSWORD = $env:PGPASSWORD
    & $Installer -MigrationsOnly -PostgresBin $PostgresBin -DatabaseHost $DatabaseHost -Port $Port -DatabaseName $DatabaseName -AdminUser $AdminUser
    # O instalador limpa a senha no ambiente. Usar a SecureString ainda em memoria
    # apenas para verificar se a funcao de exclusao existe no destino.
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
      $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }

    $functionExists = & $psql -w -h $DatabaseHost -p $Port -U $AdminUser -d $DatabaseName -v 'ON_ERROR_STOP=1' -tA -c "SELECT to_regprocedure('public.portus_delete_user(bigint,bigint,text)') IS NOT NULL;"
    if ($LASTEXITCODE -ne 0 -or ($functionExists | Out-String).Trim() -ne 't') {
      throw 'A funcao portus_delete_user nao foi encontrada. Verifique o banco correto.'
    }
    Write-Host 'Migration 022 validada: portus_delete_user existe.' -ForegroundColor Green
    $exitCode = 0
  }
} catch {
  Write-Host ('[ERRO] ' + $_.Exception.Message) -ForegroundColor Red
  $exitCode = 1
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PORTUS_SETUP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  $securePassword = $null
}
exit $exitCode
