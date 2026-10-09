# Diagnostico somente leitura da instalacao PostgreSQL no Windows (PowerShell 5.1).
# Um psql.exe presente nao comprova que o servidor local esteja instalado.
. (Join-Path $PSScriptRoot "portus-psql-preflight.ps1")

function Get-PortusPostgresDiscovery {
  [CmdletBinding()]
  param(
    [string[]]$Roots = @(),
    [object[]]$Services = $null,
    [switch]$SkipWindowsServices
  )
  $candidates = New-Object 'System.Collections.Generic.List[string]'
  $invalid = New-Object 'System.Collections.Generic.List[string]'
  if ($Roots.Count -eq 0) {
    foreach ($root in @($env:ProgramFiles, [Environment]::GetEnvironmentVariable("ProgramFiles(x86)"))) {
      if ($root) { [void]$candidates.Add((Join-Path $root "PostgreSQL")) }
    }
    foreach ($registryPath in @("HKLM:\SOFTWARE\PostgreSQL\Installations",
                               "HKLM:\SOFTWARE\WOW6432Node\PostgreSQL\Installations")) {
      if (-not (Test-Path -LiteralPath $registryPath)) { continue }
      foreach ($entry in @(Get-ChildItem -LiteralPath $registryPath -ErrorAction SilentlyContinue)) {
        try {
          $installation = (Get-ItemProperty -LiteralPath $entry.PSPath -ErrorAction Stop).'Base Directory'
          if ($installation) { [void]$candidates.Add([string]$installation) }
        } catch { }
      }
    }
  } else {
    foreach ($root in $Roots) { if ($root) { [void]$candidates.Add($root) } }
  }

  if ($null -eq $Services -and -not $SkipWindowsServices) {
    try { $Services = @(Get-CimInstance Win32_Service -Filter "Name LIKE 'postgresql%'" -ErrorAction Stop) }
    catch {
      try { $Services = @(Get-Service -Name "postgresql*" -ErrorAction Stop) }
      catch { $Services = @() }
    }
  }
  if ($null -eq $Services) { $Services = @() }

  foreach ($service in @($Services)) {
    $binary = [regex]::Match([string]$service.PathName, '(?i)([A-Z]:\\[^\"]*?\\bin\\(?:pg_ctl|postgres)\.exe)')
    if ($binary.Success) {
      [void]$candidates.Add((Split-Path -Parent (Split-Path -Parent $binary.Groups[1].Value)))
    }
  }
  $bins = New-Object 'System.Collections.Generic.List[string]'
  foreach ($candidate in @($candidates | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Container)) { continue }
    $rootsToCheck = @($candidate)
    foreach ($directory in @(Get-ChildItem -LiteralPath $candidate -Directory -ErrorAction SilentlyContinue)) {
      $rootsToCheck += $directory.FullName
    }
    foreach ($root in $rootsToCheck) {
      $bin = if ((Split-Path -Leaf $root) -eq "bin") { $root } else { Join-Path $root "bin" }
      if (-not (Test-Path -LiteralPath (Join-Path $bin "psql.exe") -PathType Leaf)) { continue }
      $problem = Get-PortusPsqlValidationError -BinPath $bin
      if ($problem) { [void]$invalid.Add($problem) }
      elseif (-not $bins.Contains($bin)) { [void]$bins.Add($bin) }
    }
  }
  $running = @($Services | Where-Object { [string]$_.State -eq "Running" -or [string]$_.Status -eq "Running" })
  $stopped = @($Services | Where-Object { [string]$_.State -ne "Running" -and [string]$_.Status -ne "Running" })
  $selected = @($bins | Sort-Object -Descending | Select-Object -First 1)
  $binPath = if ($selected.Count -gt 0) { [string]$selected[0] } else { "" }
  $serviceName = if ($running.Count -gt 0) { [string]$running[0].Name }
    elseif ($stopped.Count -gt 0) { [string]$stopped[0].Name } else { "" }
  $state = "not-detected"
  $title = "PostgreSQL nao localizado neste computador."
  $guidance = "Estacao cliente (Producao/Laboratorio): nao instale PostgreSQL; conecte pelo IP do servidor no assistente PORTUS. Servidor central: instale PostgreSQL em postgresql.org/download/windows/, inicie o servico e configure o banco."
  if ($running.Count -gt 0) {
    $state = "server-running"
    $title = "Servico PostgreSQL em execucao neste computador."
    $guidance = "Valide o banco portus e as credenciais. Se ainda nao existe, execute install-portus-database.ps1 no servidor. O servico ativo nao comprova que o banco portus esteja pronto."
  } elseif ($stopped.Count -gt 0) {
    $state = "server-stopped"
    $title = "PostgreSQL instalado, mas o servico esta parado."
    $guidance = "Abra services.msc como administrador, localize $serviceName e inicie o servico. Nao reinstale nem apague a pasta data existente."
  } elseif ($binPath) {
    $state = "client-tools-only"
    $title = "Ferramentas PostgreSQL encontradas; servico servidor nao identificado."
    $guidance = "psql.exe sozinho nao confirma o servidor. Em uma estacao cliente, informe o IP do servidor. Para hospedar o banco, verifique o servico PostgreSQL."
  } elseif ($invalid.Count -gt 0) {
    $state = "client-invalid"
    $title = "Ferramentas PostgreSQL incompletas ou danificadas."
    $guidance = "Repare o cliente PostgreSQL oficial e as DLLs. Nao substitua executaveis manualmente ou altere a pasta data. Estacoes clientes do PORTUS nao precisam de psql.exe."
  }
  return [pscustomobject]@{
    State = $state; Title = $title; BinPath = $binPath
    ServiceName = $serviceName
    ServiceStatus = if ($running.Count -gt 0) { "Running" } elseif ($stopped.Count -gt 0) { "Stopped" } else { "NotFound" }
    Guidance = $guidance
    InvalidTools = @($invalid)
  }
}
