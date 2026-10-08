# Design System PORTUS Database Utility v1.0
# Sora -> títulos; Inter -> todos os demais componentes. Medidas em pixels @96 DPI.
$script:UiColors = @{
  primary="#1479E5"; primaryHover="#0967CF"; primaryPressed="#0753A6"; primarySoft="#EAF4FF"
  navy="#081D3F"; heading="#112749"; textPrimary="#20314C"; textSecondary="#64748B"
  background="#F3F6FA"; surface="#FFFFFF"; surfaceMuted="#FAFCFF"; border="#D8E2EE"
  borderStrong="#C8D5E5"; success="#16803B"; warning="#D97706"; error="#B42318"
  disabled="#94A3B8"; disabledBackground="#F1F5F9"
}
$script:UiTypeSizes = @{
  brand=36; subtitle=18; section=18; cardTitle=16; action=14; label=13
  input=14; description=13; status=14; log=12; helper=12
}
$script:UiFontCollection = New-Object System.Drawing.Text.PrivateFontCollection
$script:UiFamilies = @{}
$script:UiMissingFonts = @()

$customFontDir = Join-Path $env:LOCALAPPDATA "PORTUS\ui-fonts"
foreach ($item in @(
  @{ name="Sora"; file="Sora.ttf" },
  @{ name="Inter"; file="Inter.ttf" }
)) {
  $match = @((New-Object System.Drawing.Text.InstalledFontCollection).Families |
    Where-Object { $_.Name -eq $item.name } | Select-Object -First 1)
  if ($match.Count -gt 0) {
    $script:UiFamilies[$item.name] = $match[0]
    continue
  }
  $filepath = Join-Path $customFontDir $item.file
  if (Test-Path -LiteralPath $filepath) {
    try {
      $script:UiFontCollection.AddFontFile($filepath)
      $loaded = @($script:UiFontCollection.Families | Where-Object { $_.Name -eq $item.name } | Select-Object -First 1)
      if ($loaded.Count -gt 0) {
        $script:UiFamilies[$item.name] = $loaded[0]
        continue
      }
    } catch { Write-Warning ("PORTUS: arquivo de fonte invalido " + $filepath + ": " + $_.Exception.Message) }
  }
  # Degradação é explícita: UI e console informam que a fonte precisa ser instalada.
  $script:UiMissingFonts += $item.name
  Write-Warning ("PORTUS: fonte " + $item.name + " nao encontrada. Execute database\install-portus-ui-fonts.ps1.")
}

function UiColor([string]$token) {
  if (-not $script:UiColors.ContainsKey($token)) { throw "Token de cor desconhecido: $token" }
  return [System.Drawing.ColorTranslator]::FromHtml($script:UiColors[$token])
}
function UiFont([string]$family,[float]$px,[string]$weight="Regular") {
  if ($family -notin @("Sora","Inter")) { throw "Familia tipografica desconhecida: $family" }
  $fontFamily = if ($script:UiFamilies.ContainsKey($family)) {
    $script:UiFamilies[$family]
  } else { [System.Drawing.FontFamily]::GenericSansSerif }
  $style = if ($weight -in @("600","700","SemiBold","Bold")) {
    [System.Drawing.FontStyle]::Bold
  } else { [System.Drawing.FontStyle]::Regular }
  if (-not $fontFamily.IsStyleAvailable($style)) { $style = [System.Drawing.FontStyle]::Regular }
  return (New-Object System.Drawing.Font($fontFamily,$px,$style,[System.Drawing.GraphicsUnit]::Pixel))
}
