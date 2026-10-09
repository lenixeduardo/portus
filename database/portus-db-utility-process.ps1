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
