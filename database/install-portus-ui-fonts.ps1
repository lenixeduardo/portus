# Opcional: baixa Sora e Inter dos repositorios oficiais Google Fonts (OFL).
# Executar uma vez por usuario Windows. Nenhuma fonte e incluida no ZIP.
[CmdletBinding()]
param([string]$Destination = (Join-Path $env:LOCALAPPDATA "PORTUS\ui-fonts"))
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
if (-not (Test-Path -LiteralPath $Destination)) {
  [void](New-Item -ItemType Directory -Path $Destination -Force)
}
$fonts = @(
  @{Name="Sora"; Url="https://raw.githubusercontent.com/google/fonts/main/ofl/sora/Sora%5Bwght%5D.ttf"; File="Sora.ttf"},
  @{Name="Inter";Url="https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf";File="Inter.ttf"}
)
foreach ($font in $fonts) {
  $filePath = Join-Path $Destination $font.File
  if ((Test-Path -LiteralPath $filePath) -and (Get-Item $filePath).Length -gt 30000) {
    Write-Host "$($font.Name) existente em $filePath"
    continue
  }
  $tempFile = $filePath + ".download"
  try {
    Write-Host ("Baixando " + $font.Name + " de Google Fonts (OFL)...")
    Invoke-WebRequest -UseBasicParsing -Uri $font.Url -OutFile $tempFile -TimeoutSec 30
    $bytes = [IO.File]::ReadAllBytes($tempFile)
    if ($bytes.Length -lt 30000) { throw ("Arquivo de fonte incompleto: " + $font.Name) }
    $fontHeader = [BitConverter]::ToString($bytes,0,4)
    if ($fontHeader -notin @("00-01-00-00","4F-54-54-4F")) { throw ("Formato de fonte inesperado: " + $font.Name) }
    Move-Item -LiteralPath $tempFile -Destination $filePath -Force
  } finally {
    Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
  }
}
Write-Host "Fontes Sora e Inter prontas. Reinicie o PORTUS Database Utility."
