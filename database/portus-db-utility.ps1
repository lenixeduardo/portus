# PORTUS - utilitario visual PostgreSQL (Windows PowerShell 5.1).
# Apenas o botao Aplicar migrations altera o banco, mediante confirmacao.
[CmdletBinding()]
param([switch]$SmokeTest, [string]$CapturePath = '', [switch]$StrictFonts)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
. (Join-Path $PSScriptRoot "portus-ui-design-tokens.ps1")

# Erros de criacao da janela devem voltar ao terminal, nao parecer travamento.
try {
# Desktop interface based on the PORTUS database-utility mockup.
# UI stays separate from the existing PostgreSQL, migrations and network scripts.
$form = New-Object System.Windows.Forms.Form
$form.Text = "PORTUS Database Utility"
$form.StartPosition = "CenterScreen"
$workingArea = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$windowWidth = [Math]::Min(1160,[Math]::Max(640,$workingArea.Width - 52))
$windowHeight = [Math]::Min(928,[Math]::Max(540,$workingArea.Height - 75))
$form.ClientSize = New-Object System.Drawing.Size($windowWidth,$windowHeight)
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.ShowInTaskbar = $true
$form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
$form.BackColor = UiColor "background"
$form.Font = UiFont "Inter" 14

# A scrollable page keeps the entire mockup usable on 1366x768 laptops
# and Windows installations with display scaling above 100%.
$page = New-Object System.Windows.Forms.Panel
$page.Dock = [System.Windows.Forms.DockStyle]::Fill
$page.AutoScroll = $true
$page.BackColor = $form.BackColor
$form.Controls.Add($page)
$canvas = New-Object System.Windows.Forms.Panel
$canvas.Location = New-Object System.Drawing.Point(0,0)
$canvas.Size = New-Object System.Drawing.Size(1136,946)
$canvas.BackColor = UiColor "background"
$page.Controls.Add($canvas)

function Color([string]$hex) {
  return [System.Drawing.ColorTranslator]::FromHtml($hex)
}
function Add-Label([string]$value,[int]$x,[int]$y,[int]$width,[int]$height=26) {
  $item = New-Object System.Windows.Forms.Label
  $item.Text = $value
  $item.Location = New-Object System.Drawing.Point($x,$y)
  $item.Size = New-Object System.Drawing.Size($width,$height)
  $item.ForeColor = UiColor "textPrimary"
  $item.Font = UiFont "Inter" 13
  $item.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
  $canvas.Controls.Add($item)
  return $item
}
$script:UiCards = @()
function Make-Card([int]$x,[int]$y,[int]$w,[int]$h) {
  $panel = New-Object System.Windows.Forms.Panel
  $panel.Location = New-Object System.Drawing.Point($x,$y)
  $panel.Size = New-Object System.Drawing.Size($w,$h)
  $panel.BackColor = UiColor "surface"
  $panel.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
  $canvas.Controls.Add($panel)
  $script:UiCards += $panel
  return $panel
}
function Add-Field([string]$label,[int]$x,[int]$y,[int]$width,[string]$initial,[bool]$secret=$false) {
  $caption = Add-Label $label $x $y $width 24
  $caption.Font = UiFont "Inter" 13 "600"
  $caption.ForeColor = UiColor "textPrimary"
  $item = New-Object System.Windows.Forms.TextBox
  $item.Location = New-Object System.Drawing.Point($x,($y+28))
  $item.Size = New-Object System.Drawing.Size($width,40)
  $item.Font = UiFont "Inter" 14
  $item.Text = $initial
  $item.UseSystemPasswordChar = $secret
  $item.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
  $canvas.Controls.Add($item)
  return $item
}
function Make-Action([string]$caption,[int]$x,[bool]$primary=$false) {
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $caption
  $button.Location = New-Object System.Drawing.Point($x,496)
  $button.Size = New-Object System.Drawing.Size(243,56)
  $button.Font = UiFont "Inter" 14 "600"
  $button.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
  $button.FlatAppearance.BorderSize = if ($primary) { 0 } else { 1 }
  $button.FlatAppearance.BorderColor = UiColor "borderStrong"
  $button.BackColor = if ($primary) { UiColor "primary" } else { UiColor "surface" }
  $button.ForeColor = if ($primary) { UiColor "surface" } else { UiColor "navy" }
  $button.Padding = New-Object System.Windows.Forms.Padding(10,0,6,0)
  $button.TextImageRelation = [System.Windows.Forms.TextImageRelation]::ImageBeforeText
  $button.ImageAlign = [System.Drawing.ContentAlignment]::MiddleLeft
  $button.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
  $button.Tag = if ($primary) { "primary" } else { "secondary" }
  $button.Add_MouseEnter({ param($sender,$event) if ($sender.Enabled) { $sender.BackColor = if ($sender.Tag -eq "primary") { UiColor "primaryHover" } else { UiColor "primarySoft" } } })
  $button.Add_MouseLeave({ param($sender,$event) if ($sender.Enabled) { $sender.BackColor = if ($sender.Tag -eq "primary") { UiColor "primary" } else { UiColor "surface" } } })
  $button.Add_MouseDown({ param($sender,$event) if ($sender.Enabled -and $sender.Tag -eq "primary") { $sender.BackColor = UiColor "primaryPressed" } })
  $button.Cursor = [System.Windows.Forms.Cursors]::Hand
  $canvas.Controls.Add($button)
  return $button
}
function Find-PostgresBin {
  foreach ($version in @(18,17,16,15,14)) {
    $bin = Join-Path $env:ProgramFiles ("PostgreSQL\{0}\bin" -f $version)
    if (Test-Path -LiteralPath (Join-Path $bin "psql.exe")) { return $bin }
  }
  return (Join-Path $env:ProgramFiles "PostgreSQL\18\bin")
}

# Header with the original installed PORTUS icon, never an invented logo.
$logoPicture = New-Object System.Windows.Forms.PictureBox
$logoPicture.Location = New-Object System.Drawing.Point(42,28)
$logoPicture.Size = New-Object System.Drawing.Size(100,112)
$logoPicture.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
$logoCandidates = @(
  (Join-Path $PSScriptRoot "assets\\portus-blue-logo.png"),
  (Join-Path $PSScriptRoot "portus-logo.png"),
  (Join-Path (Split-Path -Parent $PSScriptRoot) "build\icon.png"),
  (Join-Path (Split-Path -Parent $PSScriptRoot) "portus-icon.png")
)
foreach ($logoPath in $logoCandidates) {
  if (-not (Test-Path -LiteralPath $logoPath)) { continue }
  try {
    $bytes = [System.IO.File]::ReadAllBytes($logoPath)
    $stream = New-Object System.IO.MemoryStream(,$bytes)
    try {
      $bitmap = [System.Drawing.Bitmap]::FromStream($stream)
      $logoPicture.Image = New-Object System.Drawing.Bitmap($bitmap)
      $bitmap.Dispose()
    } finally { $stream.Dispose() }
    break
  } catch {
    Write-Warning ("PORTUS: imagem do logotipo nao disponivel: " + $_.Exception.Message)
  }
}
$canvas.Controls.Add($logoPicture)
if ($logoPicture.Image) {
  # Ícone nativo da barra de título criado a partir do emblema aprovado.
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PortusNativeIcon { [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr handle); }
'@
  $hIcon = $logoPicture.Image.GetHicon()
  try { $form.Icon = [System.Drawing.Icon]::FromHandle($hIcon).Clone() }
  finally { [void][PortusNativeIcon]::DestroyIcon($hIcon) }
}
$title = Add-Label "PORTUS" 155 36 490 63
$title.Font = UiFont "Sora" 36 "700"
$title.ForeColor = Color "#081D3F"
$brandSubtitle = Add-Label "DATABASE UTILITY" 160 99 480 30
$brandSubtitle.Font = UiFont "Sora" 18 "600"
$brandSubtitle.ForeColor = Color "#355B87"
[void](Add-Label "PostgreSQL  |  Gerenciamento e manutencao do banco de dados" 160 130 620 30)
$headerDivider = New-Object System.Windows.Forms.Panel
$headerDivider.BackColor = Color "#CBD5E1"
$headerDivider.Location = New-Object System.Drawing.Point(786,38)
$headerDivider.Size = New-Object System.Drawing.Size(1,112)
$canvas.Controls.Add($headerDivider)
$headerHelp = Add-Label "Configuracao, validacao e manutencao do PostgreSQL central do PORTUS, com verificacao do IP do servidor." 810 45 282 110
$headerHelp.ForeColor = Color "#52647C"

# Connection card.
[void](Make-Card 24 180 1086 229)
$connTitle = Add-Label "CONFIGURACOES DE CONEXAO" 47 195 460 35
$connTitle.Font = UiFont "Sora" 18 "600"
$connTitle.ForeColor = Color "#112749"
$helpBar = New-Object System.Windows.Forms.Panel
$helpBar.Location = New-Object System.Drawing.Point(550,195)
$helpBar.Size = New-Object System.Drawing.Size(534,37)
$helpBar.BackColor = Color "#EAF4FF"
$canvas.Controls.Add($helpBar)
$helpText = Add-Label "IP validado com base no servidor da primeira instalacao." 564 198 512 31
$helpText.ForeColor = Color "#215C9B"
$helpText.BackColor = $helpBar.BackColor
$hostField = Add-Field "Servidor" 48 247 326 "127.0.0.1"
$portField = Add-Field "Porta" 398 247 326 "5432"
$dbField = Add-Field "Banco" 748 247 326 "portus"
$userField = Add-Field "Administrador PostgreSQL" 48 323 326 "postgres"
$binField = Add-Field "Pasta bin do PostgreSQL" 398 323 326 (Find-PostgresBin)
$passField = Add-Field "Senha do administrador PostgreSQL" 748 323 326 "" $true
$fields = @($hostField,$portField,$dbField,$userField,$binField,$passField)
$browseButton = New-Object System.Windows.Forms.Button
$browseButton.Text = "..."
$browseButton.Font = UiFont "Inter" 13 "600"
$browseButton.Location = New-Object System.Drawing.Point(690,351)
$browseButton.Size = New-Object System.Drawing.Size(32,36)
$browseButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$browseButton.BackColor = Color "#E8EFF8"
$browseButton.FlatAppearance.BorderSize = 0
$canvas.Controls.Add($browseButton)
$browseButton.Add_Click({
  $folderDialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $folderDialog.Description = "Selecione a pasta bin do PostgreSQL (psql.exe)"
  if (Test-Path -LiteralPath $binField.Text) { $folderDialog.SelectedPath = $binField.Text }
  if ($folderDialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
    $binField.Text = $folderDialog.SelectedPath
  }
  $folderDialog.Dispose()
})
$showPasswordButton = New-Object System.Windows.Forms.Button
$showPasswordButton.Text = "Ver"
$showPasswordButton.Location = New-Object System.Drawing.Point(1035,351)
$showPasswordButton.Size = New-Object System.Drawing.Size(36,36)
$showPasswordButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$showPasswordButton.BackColor = Color "#E8EFF8"
$showPasswordButton.FlatAppearance.BorderSize = 0
$canvas.Controls.Add($showPasswordButton)
$showPasswordButton.Add_Click({
  $passField.UseSystemPasswordChar = -not $passField.UseSystemPasswordChar
  $showPasswordButton.Text = if ($passField.UseSystemPasswordChar) { "Ver" } else { "Oc." }
})

# Action card: four actions have identical widths with the update as primary.
[void](Make-Card 24 423 1086 163)
$actionTitle = Add-Label "ACOES" 47 437 440 37
$actionTitle.Font = UiFont "Sora" 18 "600"
$actionTitle.ForeColor = Color "#112749"
$checkButton = Make-Action "Validar banco de dados" 49
$migrateButton = Make-Action "Aplicar migrations" 313 $true
$networkButton = Make-Action "Verificar IP / rede" 577
$registerButton = Make-Action "Registrar IP inicial" 841

# Ícones avulsos transparentes do design system (24 px, assets PNG).
$script:UiActionImages = @()
function Set-ActionIcon([System.Windows.Forms.Button]$button,[string]$file) {
  $iconPath = Join-Path $PSScriptRoot ("assets\\actions\\" + $file + ".png")
  if (-not (Test-Path -LiteralPath $iconPath)) {
    throw "Asset de acao PORTUS ausente: $iconPath"
  }
  $bytes = [System.IO.File]::ReadAllBytes($iconPath)
  $stream = New-Object System.IO.MemoryStream(,$bytes)
  try {
    $source = [System.Drawing.Image]::FromStream($stream)
    try { $bitmap = New-Object System.Drawing.Bitmap($source) }
    finally { $source.Dispose() }
  } finally { $stream.Dispose() }
  $button.Image = $bitmap
  $script:UiActionImages += $bitmap
}
Set-ActionIcon $checkButton "validar-banco"
Set-ActionIcon $migrateButton "aplicar-migrations"
Set-ActionIcon $networkButton "verificar-rede"
Set-ActionIcon $registerButton "registrar-ip"
$captions = @(
  @{x=49; text="Conecta e verifica a integridade do schema."},
  @{x=313; text="Executa apenas migrations pendentes."},
  @{x=577; text="Verifica endereco e conectividade TCP."},
  @{x=841; text="Registra o servidor da primeira instalacao."}
)
foreach ($caption in $captions) {
  $description = Add-Label $caption.text $caption.x 553 243 26
  $description.ForeColor = Color "#64748B"
  $description.Font = UiFont "Inter" 12
  $description.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
}

# Status card.
[void](Make-Card 24 600 1086 94)
$statusTitle = Add-Label "STATUS" 47 611 450 28
$statusTitle.Font = UiFont "Sora" 16 "600"
$statusTitle.ForeColor = Color "#112749"
$statusDot = Add-Label ([string][char]0x25CF) 51 640 36 36
$statusDot.Font = UiFont "Inter" 22 "600"
$statusDot.ForeColor = UiColor "success"
$status = Add-Label "Pronto para executar." 91 641 600 27
$status.Font = UiFont "Inter" 14 "600"
$status.ForeColor = UiColor "success"
$referenceLabel = Add-Label "Servidor inicial: nao cadastrado" 718 647 363 27
$referenceLabel.ForeColor = Color "#475569"
$referenceLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleRight
function Refresh-Reference {
  $referencePath = Join-Path (Join-Path $env:LOCALAPPDATA "PORTUS") "server-endpoint.json"
  if (Test-Path -LiteralPath $referencePath) {
    try {
      $record = Get-Content -LiteralPath $referencePath -Raw -Encoding UTF8 | ConvertFrom-Json
      $referenceLabel.Text = "Servidor cadastrado: $($record.serverIp):$($record.port)"
      return [string]$record.serverIp
    } catch { $referenceLabel.Text = "Referencia do servidor invalida. Verifique o arquivo."; return "" }
  }
  return ""
}
$initialIp = Refresh-Reference
if ($initialIp) {
  $hostField.Text = $initialIp
  try {
    $saved = Get-Content -LiteralPath (Join-Path (Join-Path $env:LOCALAPPDATA "PORTUS") "server-endpoint.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $portField.Text = [string]$saved.port
    $dbField.Text = [string]$saved.databaseName
  } catch { }
} else {
  # Migracao gradual: usar a conexao ja configurada como sugestao,
  # sem registra-la como IP confiavel ate confirmacao do usuario.
  $config = Join-Path (Join-Path $env:LOCALAPPDATA "PORTUS") "database-config.json"
  if (Test-Path -LiteralPath $config) {
    try {
      $current = Get-Content -LiteralPath $config -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($current.PORTUS_DATABASE_URL) {
        $uri = [Uri]::new([string]$current.PORTUS_DATABASE_URL)
        $hostField.Text = $uri.DnsSafeHost
        $portField.Text = [string]$(if ($uri.IsDefaultPort) { 5432 } else { $uri.Port })
        $dbField.Text = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
      }
    } catch { }
  }
}

# Log card.
[void](Make-Card 24 709 1086 216)
$logTitle = Add-Label "LOG DA OPERACAO" 47 718 430 30
$logTitle.Font = UiFont "Sora" 16 "600"
$logTitle.ForeColor = Color "#112749"
$clearLogButton = New-Object System.Windows.Forms.Button
$clearLogButton.Text = "Limpar log"
$clearLogButton.Location = New-Object System.Drawing.Point(960,719)
$clearLogButton.Size = New-Object System.Drawing.Size(125,30)
$clearLogButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$clearLogButton.BackColor = UiColor "surface"
$clearLogButton.FlatAppearance.BorderColor = UiColor "borderStrong"
$canvas.Controls.Add($clearLogButton)
$log = New-Object System.Windows.Forms.RichTextBox
$log.ReadOnly = $true
$log.ScrollBars = [System.Windows.Forms.RichTextBoxScrollBars]::Vertical
$log.Location = New-Object System.Drawing.Point(47,756)
$log.Size = New-Object System.Drawing.Size(1037,132)
$log.Font = UiFont "Inter" 12
$log.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$log.BackColor = UiColor "surfaceMuted"
$log.ForeColor = Color "#334155"
$canvas.Controls.Add($log)
$clearLogButton.Add_Click({ $log.Clear() })
$clearLogButton.Font = UiFont "Inter" 12 "500"
$foot = Add-Label "Validar e verificar IP sao operacoes de leitura. Aplicar migrations exige confirmacao." 47 896 1030 22
$foot.Font = UiFont "Inter" 12
$foot.ForeColor = UiColor "textSecondary"

# Labels/inputs pertencem ao card fisico, nao ao canvas cinza.
# Sem isso, WinForms desenha retangulos cinza atras dos textos brancos.
foreach ($control in @($canvas.Controls)) {
  if ($script:UiCards -contains $control) { continue }
  foreach ($card in $script:UiCards) {
    $bounds = $card.Bounds
    if ($control.Left -ge $bounds.Left -and $control.Top -ge $bounds.Top -and
        $control.Right -le $bounds.Right -and $control.Bottom -le $bounds.Bottom) {
      $pos = $control.Location
      $card.Controls.Add($control)
      $control.Location = New-Object System.Drawing.Point(($pos.X - $bounds.Left),($pos.Y - $bounds.Top))
      if ($control -is [System.Windows.Forms.Label] -and $control -ne $helpText) {
        $control.BackColor = [System.Drawing.Color]::Transparent
      }
      break
    }
  }
}

$script:child = $null
$script:outFile = $null
$script:errFile = $null
$script:outOffset = 0
$script:errOffset = 0
$script:action = ""

function Show-Log([string]$value) {
  foreach ($line in ($value -split "\r?\n")) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $stamp = Get-Date -Format "HH:mm:ss"
    $log.SelectionStart = $log.TextLength
    $log.SelectionColor = if ($line -match '(falhou|Falha|Erro|ERROR|FATAL|inacessivel)') {
      UiColor "error"
    } elseif ($line -match '(sucesso|OK|validado|concluid|pronto)') {
      UiColor "success"
    } else {
      UiColor "textPrimary"
    }
    $log.AppendText(("[{0}]  {1}" -f $stamp,$line) + [Environment]::NewLine)
  }
  $log.SelectionStart = $log.TextLength
  $log.ScrollToCaret()
}
function Set-Busy([bool]$busy) {
  foreach ($field in $fields) { $field.Enabled = -not $busy }
  $checkButton.Enabled = -not $busy
  $migrateButton.Enabled = -not $busy
  $networkButton.Enabled = -not $busy
  $registerButton.Enabled = -not $busy
  $browseButton.Enabled = -not $busy
  $showPasswordButton.Enabled = -not $busy
  $clearLogButton.Enabled = -not $busy
}
function Quoted([string]$value) {
  if ($value.Contains('"')) { throw "Aspas nao permitidas em parametros." }
  return '"' + $value + '"'
}
function Poll-Log {
  foreach ($name in @("out","err")) {
    $file = if ($name -eq "out") { $script:outFile } else { $script:errFile }
    if (-not $file -or -not (Test-Path -LiteralPath $file)) { continue }
    try {
      $all = [System.IO.File]::ReadAllText($file)
      $previous = if ($name -eq "out") { $script:outOffset } else { $script:errOffset }
      if ($all.Length -gt $previous) {
        $next = $all.Substring($previous).TrimEnd()
        if ($next.Length -gt 0) { Show-Log $next }
      }
      if ($name -eq "out") { $script:outOffset = $all.Length }
      else { $script:errOffset = $all.Length }
    } catch { }
  }
}
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 400
$timer.Add_Tick({
  if (-not $script:child) { return }
  Poll-Log
  $script:child.Refresh()
  if ($script:child.HasExited) {
    Poll-Log
    $code = $script:child.ExitCode
    $timer.Stop()
    $script:child.Dispose()
    $script:child = $null
    foreach ($file in @($script:outFile,$script:errFile)) {
      if ($file) { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
    }
    $script:outFile = $null
    $script:errFile = $null
    Set-Busy $false
    if ($code -eq 0) {
      $status.Text = if ($script:action -eq "validate") { "Banco validado com sucesso." }
        elseif ($script:action -eq "migrate") { "Migrations concluidas. Valide o banco." }
        elseif ($script:action -eq "register") { "IP inicial do servidor registrado. Verifique a rede." }
        else { "Verificacao de IP e rede concluida." }
      $status.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#166534")
      $statusDot.ForeColor = UiColor "success"
    } else {
      $status.Text = "Falha (codigo $code). Confira o log."
      $status.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#B91C1C")
      $statusDot.ForeColor = UiColor "error"
    }
    Show-Log $status.Text
    [void](Refresh-Reference)
  }
})

function Start-Action([string]$operation) {
  if ($script:child) { return }
  $hostName = $hostField.Text.Trim()
  $database = $dbField.Text.Trim()
  $username = $userField.Text.Trim()
  $bin = $binField.Text.Trim()
  $port = 0
  if ([string]::IsNullOrWhiteSpace($hostName) -or $hostName.Contains('"') -or
      $database -notmatch '^[A-Za-z][A-Za-z0-9_]{0,62}$' -or
      $username -notmatch '^[A-Za-z][A-Za-z0-9_]{0,62}$' -or
      $bin.Contains('"') -or
      -not [int]::TryParse($portField.Text.Trim(),[ref]$port) -or
      $port -lt 1 -or $port -gt 65535) {
    [void][System.Windows.Forms.MessageBox]::Show("Verifique os dados de conexao.","PORTUS")
    return
  }
  if ($operation -in @("validate","migrate") -and [string]::IsNullOrWhiteSpace($passField.Text)) {
    [void][System.Windows.Forms.MessageBox]::Show("Informe a senha administrativa do PostgreSQL.","PORTUS")
    return
  }
  if ($operation -in @("validate","migrate") -and -not (Test-Path -LiteralPath (Join-Path $bin "psql.exe"))) {
    [void][System.Windows.Forms.MessageBox]::Show("psql.exe nao encontrado na pasta bin.","PORTUS")
    return
  }

  $filename = if ($operation -eq "validate") { "validate-portus-schema.ps1" }
    elseif ($operation -eq "migrate") { "install-portus-database.ps1" }
    else { "check-portus-server-network.ps1" }
  $scriptPath = Join-Path $PSScriptRoot $filename
  if (-not (Test-Path -LiteralPath $scriptPath)) {
    [void][System.Windows.Forms.MessageBox]::Show("Script ausente: $filename. Atualize a pasta database.","PORTUS")
    return
  }
  if ($operation -eq "migrate") {
    $answer = [System.Windows.Forms.MessageBox]::Show(
      "Aplicar migrations em $($hostName):$port/$database? Confira o alvo e o backup antes de prosseguir.",
      "Confirmar alteracoes no schema",
      [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Warning
    )
    if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) { return }
  }
  if ($operation -eq "register") {
    $answer = [System.Windows.Forms.MessageBox]::Show(
      "Registrar $($hostName):$port/$database como IP de referencia desta estacao? O cadastro so funciona se estiver ausente e o PostgreSQL estiver acessivel.",
      "Registrar servidor da primeira instalacao",
      [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Question
    )
    if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) { return }
  }
  $arguments = @("-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", (Quoted $scriptPath))
  if ($operation -in @("network","register")) {
    $arguments += @("-ServerIp", (Quoted $hostName), "-Port", "$port", "-DatabaseName", (Quoted $database))
    if ($operation -eq "register") { $arguments += "-RegisterFirstInstallation" }
  } else {
    $arguments += @(
      "-PostgresBin", (Quoted $bin),
      "-DatabaseHost", (Quoted $hostName),
      "-Port", "$port",
      "-AdminUser", (Quoted $username),
      "-DatabaseName", (Quoted $database)
    )
    if ($operation -eq "migrate") { $arguments += @("-MigrationsOnly","-SkipAppConfiguration") }
  }

  $script:outFile = Join-Path $env:TEMP ("portus-" + [guid]::NewGuid().ToString("N") + ".out")
  $script:errFile = Join-Path $env:TEMP ("portus-" + [guid]::NewGuid().ToString("N") + ".err")
  $script:outOffset = 0
  $script:errOffset = 0
  $script:action = $operation
  $previous = [Environment]::GetEnvironmentVariable("PORTUS_SETUP_ADMIN_PASSWORD","Process")
  try {
    if ($operation -in @("validate","migrate")) { [Environment]::SetEnvironmentVariable("PORTUS_SETUP_ADMIN_PASSWORD",$passField.Text,"Process") }
    $options = @{
      FilePath = (Join-Path $PSHOME "powershell.exe")
      ArgumentList = ($arguments -join " ")
      PassThru = $true
      WindowStyle = "Hidden"
      RedirectStandardOutput = $script:outFile
      RedirectStandardError = $script:errFile
    }
    $script:child = Start-Process @options
  } catch {
    Show-Log ("Erro ao executar: " + $_.Exception.Message)
    return
  } finally {
    [Environment]::SetEnvironmentVariable("PORTUS_SETUP_ADMIN_PASSWORD",$previous,"Process")
    if ($operation -in @("validate","migrate")) { $passField.Clear() }
  }
  Show-Log ("Operacao iniciada: $operation, destino $($hostName):$port/$database")
  $status.Text = "Executando operacao..."
  $status.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#B45309")
  $statusDot.ForeColor = UiColor "warning"
  Set-Busy $true
  $timer.Start()
}

$checkButton.Add_Click({ Start-Action "validate" })
$migrateButton.Add_Click({ Start-Action "migrate" })
$networkButton.Add_Click({ Start-Action "network" })
$registerButton.Add_Click({ Start-Action "register" })
$form.Add_FormClosing({
  param($sender,$args)
  if ($script:child -and -not $script:child.HasExited) {
    [void][System.Windows.Forms.MessageBox]::Show("Ha uma operacao em andamento. Aguarde sua conclusao.","PORTUS")
    $args.Cancel = $true
  }
})
Show-Log "Informe a senha administrativa e selecione uma das acoes."
if ($script:UiMissingFonts.Count -gt 0) {
  $message = "Fontes ausentes: " + ($script:UiMissingFonts -join ", ") + ". Execute database\\install-portus-ui-fonts.ps1 e reinicie."
  Show-Log $message
  $status.Text = "Tipografia incompleta: instale Sora e Inter."
  $status.ForeColor = UiColor "warning"
  $statusDot.ForeColor = UiColor "warning"
}
if ($StrictFonts -and $script:UiMissingFonts.Count -gt 0) {
  throw ("Fontes obrigatorias nao instaladas: " + ($script:UiMissingFonts -join ", "))
}
$form.Add_FormClosed({
  foreach ($image in $script:UiActionImages) { if ($image) { $image.Dispose() } }
  if ($script:UiFontCollection) { $script:UiFontCollection.Dispose() }
})

# Janela topmost apenas durante a inicializacao. Ela deve aparecer mesmo se o
# .bat foi chamado de um terminal que permaneceu em primeiro plano.
$focusTimer = New-Object System.Windows.Forms.Timer
$focusTimer.Interval = 1100
$focusTimer.Add_Tick({
  $focusTimer.Stop()
  $form.TopMost = $false
  $focusTimer.Dispose()
})
$form.Add_Shown({
  $form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
  $form.TopMost = $true
  $form.BringToFront()
  $form.Activate()
  $focusTimer.Start()
})

if ($SmokeTest -or $CapturePath) {
  # Abre a janela real sem conectar ou alterar o PostgreSQL.
  $smokeTimer = New-Object System.Windows.Forms.Timer
  $smokeTimer.Interval = 600
  $smokeTimer.Add_Tick({
    $smokeTimer.Stop()
    if (-not $form.Visible -or -not $form.IsHandleCreated -or
        -not $checkButton.Visible -or -not $migrateButton.Visible -or
        -not $networkButton.Visible -or -not $registerButton.Visible -or
        -not $title.Visible -or -not $log.Visible -or
        -not $canvas.Visible -or
        -not $checkButton.Image -or -not $migrateButton.Image -or
        -not $networkButton.Image -or -not $registerButton.Image) {
      $script:smokeFailed = $true
    }
    # O teste usa o asset real do projeto e nao aceita uma marca ausente.
    $officialLogo = Join-Path (Split-Path -Parent $PSScriptRoot) "build\icon.png"
    if ((Test-Path -LiteralPath $officialLogo) -and $null -eq $logoPicture.Image) {
      $script:smokeFailed = $true
    }
    if ($CapturePath -and -not $script:smokeFailed) {
      # Captura os pixels realmente renderizados pela interface WinForms no runner Windows.
      # Em vez de fotografar uma tela remota, desenha os controles reais em bitmap.
      $bitmap = New-Object System.Drawing.Bitmap($canvas.Width,$canvas.Height)
      try {
        $rectangle = New-Object System.Drawing.Rectangle(0,0,$canvas.Width,$canvas.Height)
        $canvas.DrawToBitmap($bitmap,$rectangle)
        $folder = Split-Path -Parent $CapturePath
        if ($folder -and -not (Test-Path -LiteralPath $folder)) {
          New-Item -ItemType Directory -Path $folder -Force | Out-Null
        }
        $bitmap.Save($CapturePath,[System.Drawing.Imaging.ImageFormat]::Png)
        Write-Host ("PORTUS_REAL_UI_CAPTURE_SAVED: " + $CapturePath)
      } catch {
        $script:smokeFailed = $true
        [Console]::Error.WriteLine("Falha ao capturar WinForms: " + $_.Exception.Message)
      } finally {
        $bitmap.Dispose()
      }
    }
    $form.Close()
  })
  $form.Add_Shown({ $smokeTimer.Start() })
}

Write-Host "PORTUS: iniciando interface. Se necessario, use Alt+Tab."
[void]$form.ShowDialog()
if ($SmokeTest -or $CapturePath) {
  if ($script:smokeFailed) { throw "Smoke test: janela, controles ou logotipo PORTUS nao carregaram." }
  if ($CapturePath -and -not (Test-Path -LiteralPath $CapturePath)) {
    throw "O arquivo da captura nao foi gerado."
  }
  Write-Host "PORTUS_DB_UTILITY_SMOKE_OK"
}
} catch {
  $message = "Nao foi possivel abrir o utilitario PORTUS: " + $_.Exception.Message
  [Console]::Error.WriteLine($message)
  try {
    if (-not $SmokeTest -and -not $CapturePath) {
    [void][System.Windows.Forms.MessageBox]::Show($message,"Falha ao iniciar PORTUS",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error)
    }
  } catch { }
  exit 1
}
