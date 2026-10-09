# PORTUS - utilitario visual PostgreSQL (Windows PowerShell 5.1).
# Apenas o botao Aplicar migrations altera o banco, mediante confirmacao.
[CmdletBinding()]
param([switch]$SmokeTest, [string]$CapturePath = '', [switch]$StrictFonts,
      [int]$ViewportWidth = 0, [int]$ViewportHeight = 0)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
. (Join-Path $PSScriptRoot "portus-ui-design-tokens.ps1")
. (Join-Path $PSScriptRoot "portus-db-utility-glyphs.ps1")

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
if ($ViewportWidth -gt 0 -and $ViewportHeight -gt 0) {
  if (-not $SmokeTest -and -not $CapturePath) { throw "Viewport customizado disponivel apenas em testes de interface." }
  $form.ClientSize = New-Object System.Drawing.Size($ViewportWidth,$ViewportHeight)
}
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
$canvas.Size = New-Object System.Drawing.Size(1136,915)
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
function Rounded-Path([int]$w,[int]$h,[int]$radius=6) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $path.AddArc(0,0,$diameter,$diameter,180,90)
  $path.AddArc(($w-$diameter-1),0,$diameter,$diameter,270,90)
  $path.AddArc(($w-$diameter-1),($h-$diameter-1),$diameter,$diameter,0,90)
  $path.AddArc(0,($h-$diameter-1),$diameter,$diameter,90,90)
  $path.CloseFigure()
  return $path
}
$script:UiCards = @()
function Make-Card([int]$x,[int]$y,[int]$w,[int]$h) {
  # Nunca coloque um Panel de sombra por cima dos controles filhos: no
  # Windows PowerShell 5.1 isso pode ocultar todos os labels, inputs e botoes.
  # Use apenas o card (Surface) como container real de seus controles.
  $panel = New-Object System.Windows.Forms.Panel
  $panel.Location = New-Object System.Drawing.Point($x,$y)
  $panel.Size = New-Object System.Drawing.Size($w,$h)
  $panel.BackColor = UiColor "surface"
  $panel.BorderStyle = [System.Windows.Forms.BorderStyle]::None
  $rounded = Rounded-Path $w $h 6
  $panel.Region = New-Object System.Drawing.Region($rounded)
  $rounded.Dispose()
  $panel.Add_Paint({
    param($sender,$paint)
    $outline = Rounded-Path $sender.Width $sender.Height 6
    $pen = New-Object System.Drawing.Pen((UiColor "border"),1)
    try {
      $paint.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $paint.Graphics.DrawPath($pen,$outline)
    } finally { $pen.Dispose(); $outline.Dispose() }
  })
  $canvas.Controls.Add($panel)
  $panel.BringToFront()
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
  $button.Location = New-Object System.Drawing.Point($x,488)
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
$logoPicture.Location = New-Object System.Drawing.Point(38,19)
$logoPicture.Size = New-Object System.Drawing.Size(115,127)
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
$title = Add-Label "PORTUS" 166 24 545 83
$title.Font = UiFont "Sora" 52 "700"
$title.ForeColor = UiColor "navy"
$brandSubtitle = Add-Label "DATABASE UTILITY" 171 105 490 30
$brandSubtitle.Font = UiFont "Sora" 18 "600"
$brandSubtitle.ForeColor = UiColor "brandMuted"
[void](Add-Label "PostgreSQL  |  Gerenciamento e manutencao do banco de dados" 171 133 585 30)
$headerDivider = New-Object System.Windows.Forms.Panel
$headerDivider.BackColor = UiColor "divider"
$headerDivider.Location = New-Object System.Drawing.Point(786,38)
$headerDivider.Size = New-Object System.Drawing.Size(1,112)
$canvas.Controls.Add($headerDivider)
$headerHelp = Add-Label "Configuracao, validacao e manutencao do PostgreSQL central do PORTUS, com verificacao do IP do servidor." 810 45 282 110
$headerHelp.ForeColor = UiColor "intro"

# Connection card.
[void](Make-Card 24 180 1086 229)
$connTitle = Add-Label "Configurações de Conexão" 87 195 440 35
[void](Add-PortusGlyph "database" 49 201 27 "primary")
$connTitle.Font = UiFont "Sora" 18 "600"
$connTitle.ForeColor = UiColor "heading"
$helpBar = New-Object System.Windows.Forms.Panel
$helpBar.Location = New-Object System.Drawing.Point(550,195)
$helpBar.Size = New-Object System.Drawing.Size(534,37)
$helpBar.BackColor = UiColor "primarySoft"
$canvas.Controls.Add($helpBar)
$helpText = Add-Label "Verifique se o IP corresponde ao servidor da primeira instalação." 586 198 488 31
[void](Add-PortusGlyph "network" 559 203 19 "primary")
$helpText.ForeColor = UiColor "infoText"
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
$browseButton.BackColor = UiColor "iconButtonSurface"
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
$showPasswordButton.BackColor = UiColor "iconButtonSurface"
$showPasswordButton.FlatAppearance.BorderSize = 0
$canvas.Controls.Add($showPasswordButton)
$showPasswordButton.Add_Click({
  $passField.UseSystemPasswordChar = -not $passField.UseSystemPasswordChar
  $showPasswordButton.Text = if ($passField.UseSystemPasswordChar) { "Ver" } else { "Oc." }
})

# Action card: four actions have identical widths with the update as primary.
[void](Make-Card 24 423 1086 132)
$actionTitle = Add-Label "Ações" 87 437 440 37
[void](Add-PortusGlyph "settings" 49 443 27 "primary")
$actionTitle.Font = UiFont "Sora" 18 "600"
$actionTitle.ForeColor = UiColor "heading"
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
# Descricoes aparecem somente ao passar o mouse: nenhuma legenda fica
# abaixo das quatro acoes. Preserva mensagens e logica dos botoes.
$actionToolTip = New-Object System.Windows.Forms.ToolTip
$actionToolTip.IsBalloon = $false
$actionToolTip.ShowAlways = $true
$actionToolTip.InitialDelay = 400
$actionToolTip.ReshowDelay = 150
$actionToolTip.AutoPopDelay = 9000
$actionToolTip.SetToolTip($checkButton, "Conecta e verifica a integridade do schema.")
$actionToolTip.SetToolTip($migrateButton, "Executa apenas migrations pendentes.")
$actionToolTip.SetToolTip($networkButton, "Verifica endereço e conectividade TCP.")
$actionToolTip.SetToolTip($registerButton, "Registra o servidor da primeira instalação.")

# Status card.
[void](Make-Card 24 569 1086 94)
$statusTitle = Add-Label "Status" 87 580 450 28
[void](Add-PortusGlyph "document" 49 581 26 "primary")
$statusTitle.Font = UiFont "Sora" 16 "600"
$statusTitle.ForeColor = UiColor "heading"
$statusDot = Add-Label ([string][char]0x25CF) 51 609 36 36
$statusDot.Visible = $false
$statusGlyph = Add-PortusGlyph "check" 52 612 30 "success"
$statusDot.Font = UiFont "Inter" 22 "600"
$statusDot.ForeColor = UiColor "success"
$status = Add-Label "Pronto para executar." 93 608 599 27
$statusDescription = Add-Label "Configure os parâmetros e selecione uma ação." 93 633 597 22
$statusDescription.ForeColor = UiColor "textSecondary"
$statusDescription.Font = UiFont "Inter" 12
$status.Font = UiFont "Inter" 14 "600"
$status.ForeColor = UiColor "success"
$referenceLabel = Add-Label "Servidor inicial: nao cadastrado" 718 616 363 27
$referenceLabel.ForeColor = UiColor "reference"
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
[void](Make-Card 24 678 1086 216)
$logTitle = Add-Label "Log" 87 687 430 30
[void](Add-PortusGlyph "document" 50 690 25 "primary")
$logTitle.Font = UiFont "Sora" 16 "600"
$logTitle.ForeColor = UiColor "heading"
$clearLogButton = New-Object System.Windows.Forms.Button
$clearLogButton.Text = "Limpar log"
$clearLogButton.Location = New-Object System.Drawing.Point(960,688)
$clearLogButton.Size = New-Object System.Drawing.Size(125,30)
$clearLogButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$clearLogButton.BackColor = UiColor "surface"
$clearLogButton.FlatAppearance.BorderColor = UiColor "borderStrong"
$canvas.Controls.Add($clearLogButton)
$log = New-Object System.Windows.Forms.RichTextBox
$log.ReadOnly = $true
$log.ScrollBars = [System.Windows.Forms.RichTextBoxScrollBars]::Vertical
$log.Location = New-Object System.Drawing.Point(47,725)
$log.Size = New-Object System.Drawing.Size(1037,132)
$log.Font = UiFont "Inter" 12
$log.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$log.BackColor = UiColor "surfaceMuted"
$log.ForeColor = UiColor "textPrimary"
$canvas.Controls.Add($log)
$clearLogButton.Add_Click({ $log.Clear(); $logPlaceholder.Visible = $true })
$clearLogButton.Font = UiFont "Inter" 12 "500"
$foot = Add-Label "Validar e verificar IP sao operacoes de leitura. Aplicar migrations exige confirmacao." 47 865 1030 22
$foot.Font = UiFont "Inter" 12
$foot.ForeColor = UiColor "textSecondary"

# Mensagem neutra de estado vazio: nao simula conexoes ou migrations.
$logPlaceholder = Add-Label "Nenhuma operação executada. As mensagens reais aparecerão aqui." 66 759 930 28
$logPlaceholder.Font = UiFont "Inter" 13
$logPlaceholder.ForeColor = UiColor "textSecondary"
$logPlaceholder.BackColor = UiColor "surfaceMuted"

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

# Garantir que o card esta acima do canvas, nao atras de outros paineis.
# Conteudo sempre pertence ao proprio card, evitando overlays nativos.
foreach ($card in $script:UiCards) {
  $card.BringToFront()
}
# Cada um dos 4 cards precisa ter filhos renderizaveis e handlers visiveis.
$script:UiPanelControls = @(
  @{card=$script:UiCards[0]; controls=@($connTitle,$hostField,$portField,$dbField,$userField,$binField,$passField)},
  @{card=$script:UiCards[1]; controls=@($actionTitle,$checkButton,$migrateButton,$networkButton,$registerButton)},
  @{card=$script:UiCards[2]; controls=@($statusTitle,$status,$statusDescription,$statusGlyph)},
  @{card=$script:UiCards[3]; controls=@($logTitle,$log,$clearLogButton)}
)
foreach ($group in $script:UiPanelControls) {
  foreach ($control in $group.controls) {
    if ($control.Parent -ne $group.card) {
      throw ("Layout PORTUS: controle fora do card: " + $control.GetType().Name + " " + $control.Text)
    }
    $control.BringToFront()
  }
}

# O empty state fica acima do RichTextBox sem adicionar resultados ficticios.
$logPlaceholder.BringToFront()

# Molduras de 40px com foco azul; TextBox monolinha nao respeita altura
# maior que a fonte no WinForms sem um container proprio.
$script:UiInputFrames = @()
foreach ($field in $fields) {
  $outer = New-Object System.Windows.Forms.Panel
  $outer.Location = $field.Location
  $outer.Size = New-Object System.Drawing.Size($field.Width,40)
  $outer.BackColor = UiColor "borderStrong"
  $field.Parent.Controls.Add($outer)
  $inner = New-Object System.Windows.Forms.Panel
  $inner.Location = New-Object System.Drawing.Point(1,1)
  $inner.Size = New-Object System.Drawing.Size(($outer.Width-2),38)
  $inner.BackColor = UiColor "surface"
  $outer.Controls.Add($inner)
  $field.Parent = $inner
  $field.BorderStyle = [System.Windows.Forms.BorderStyle]::None
  $field.Location = New-Object System.Drawing.Point(9,8)
  $field.Width = $inner.Width - 18
  $field.BackColor = UiColor "surface"
  $field.Tag = @{ Border=$outer; Surface=$inner }
  $field.Add_Enter({ param($sender,$event) $sender.Tag.Border.BackColor = UiColor "primary" })
  $field.Add_Leave({ param($sender,$event) $sender.Tag.Border.BackColor = UiColor "borderStrong" })
  $script:UiInputFrames += $outer
}
# Ferramentas ao lado dos campos: nao devem ficar escondidas pelas molduras.
# Botões auxiliares são siblings dos cards no canvas: o renderer
# WinForms/DrawToBitmap não perde estes botões na composição aninhada.
$browseButton.Parent = $binField.Tag.Surface
$browseButton.Location = New-Object System.Drawing.Point(($binField.Tag.Surface.Width-34),0)
$browseButton.Size = New-Object System.Drawing.Size(33,38)
$binField.Width = $binField.Width - 35
$showPasswordButton.Parent = $passField.Tag.Surface
$showPasswordButton.Location = New-Object System.Drawing.Point(($passField.Tag.Surface.Width-39),0)
$showPasswordButton.Size = New-Object System.Drawing.Size(38,38)
$passField.Width = $passField.Width - 40
$browseButton.BringToFront()
$showPasswordButton.BringToFront()

# Iconografia semanticamente associada aos campos (sem alterar o valor real).
foreach ($item in @(
  @{ field=$hostField; icon="server" },
  @{ field=$portField; icon="network" },
  @{ field=$dbField; icon="database" },
  @{ field=$userField; icon="user" },
  @{ field=$binField; icon="folder" },
  @{ field=$passField; icon="lock" }
)) {
  $field = $item.field
  $prefix = New-Object System.Windows.Forms.PictureBox
  $prefix.Location = New-Object System.Drawing.Point(9,10)
  $prefix.Size = New-Object System.Drawing.Size(18,18)
  $prefix.BackColor = UiColor "surface"
  $prefix.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
  $prefix.Image = New-PortusGlyph $item.icon 18 "brandMuted"
  $field.Tag.Surface.Controls.Add($prefix)
  $field.Location = New-Object System.Drawing.Point(35,8)
  $field.Width = $field.Width - 26
}


$script:child = $null
$script:outFile = $null
$script:errFile = $null
$script:outOffset = 0
$script:errOffset = 0
$script:action = ""

function Show-Log([string]$value, [ValidateSet("ui","stdout","stderr","diagnostic")][string]$source="ui") {
  $logPlaceholder.Visible = $false
  foreach ($line in ($value -split "\r?\n")) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $stamp = Get-Date -Format "HH:mm:ss"
    $isError = $source -in @("stderr","diagnostic") -or
      $line -match '(falhou|Falha|Erro|ERROR|FATAL|inacessivel)'
    $log.SelectionStart = $log.TextLength
    $log.SelectionColor = if ($isError) {
      UiColor "error"
    } elseif ($line -match '(sucesso|OK|validado|concluid|pronto)') {
      UiColor "success"
    } else {
      UiColor "textPrimary"
    }
    $log.AppendText(("[{0}]  {1}" -f $stamp,$line) + [Environment]::NewLine)
    # O mesmo log tambem aparece no terminal que iniciou o .bat. O segredo do
    # PostgreSQL nao faz parte dos argumentos CLI, nem e escrito aqui.
    $terminalLine = "[PORTUS][$stamp][$source] $line"
    if ($isError) { Write-Host $terminalLine -ForegroundColor Red }
    else { Write-Host $terminalLine }
  }
  $log.SelectionStart = $log.TextLength
  $log.ScrollToCaret()
}
function Set-Busy([bool]$busy) {
  if ($busy) {
    $statusDescription.Text = "Operação em andamento. Aguarde a confirmação."
    $statusGlyph.Image = New-PortusGlyph "pending" 30 "warning"
  }
  foreach ($field in $fields) {
    $field.Enabled = -not $busy
    $field.BackColor = if ($busy) { UiColor "disabledBackground" } else { UiColor "surface" }
    if ($field -ne $form.ActiveControl) {
      $field.Tag.Border.BackColor = if ($busy) { UiColor "disabled" } else { UiColor "borderStrong" }
    }
    $field.Tag.Surface.BackColor = if ($busy) { UiColor "disabledBackground" } else { UiColor "surface" }
  }
  foreach ($button in @($checkButton,$migrateButton,$networkButton,$registerButton)) {
    if (-not $button.AccessibleDescription) { $button.AccessibleDescription = $button.Text }
    $button.Text = if ($busy -and $script:action -eq $(if($button -eq $checkButton){"validate"}elseif($button -eq $migrateButton){"migrate"}elseif($button -eq $networkButton){"network"}else{"register"})) { "Executando..." } else { $button.AccessibleDescription }
  }
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
        if ($next.Length -gt 0) {
          $stream = if ($name -eq "err") { "stderr" } else { "stdout" }
          Show-Log $next $stream
        }
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
    $timer.Stop()
    $code = $null
    try {
      # WinPS 5.1 pode expor ExitCode como null em Process (-PassThru)
      # se o handle ainda nao foi sincronizado. WaitForExit() garante
      # que Windows informou o encerramento antes de ler ExitCode.
      $script:child.WaitForExit()
      Poll-Log
      $actualExitCode = $script:child.ExitCode
      if ($null -eq $actualExitCode) {
        throw "Windows devolveu ExitCode nulo apos WaitForExit()."
      }
      $code = [int]$actualExitCode
      Show-Log ("Processo filho finalizado. ExitCode={0}" -f $code) "ui"
    } catch {
      $code = 1
      Show-Log ("Falha ao obter resultado do processo: " + $_.Exception.ToString()) "diagnostic"
      Poll-Log
    }
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
      $status.Text = "Operacao falhou (codigo de saida: $code). Detalhes no terminal."
      $status.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#B91C1C")
      $statusDot.ForeColor = UiColor "error"
    }
    $statusGlyph.Image = if ($code -eq 0) {
      New-PortusGlyph "check" 30 "success"
    } else {
      New-PortusGlyph "error" 30 "error"
    }
    Show-Log $status.Text
    $statusDescription.Text = if ($code -eq 0) { "Confira o log para os detalhes da operação." } else { "Revise o erro apresentado no log antes de tentar novamente." }
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
    Show-Log ("Erro ao executar: " + $_.Exception.ToString()) "diagnostic"
    return
  } finally {
    [Environment]::SetEnvironmentVariable("PORTUS_SETUP_ADMIN_PASSWORD",$previous,"Process")
    if ($operation -in @("validate","migrate")) { $passField.Clear() }
  }
  Show-Log ("Operacao iniciada: $operation, destino $($hostName):$port/$database")
  Show-Log ("Script: " + $filename + " | PID: " + $script:child.Id)
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
  $actionToolTip.Dispose()
  foreach ($image in $script:UiActionImages) { if ($image) { $image.Dispose() } }
  if ($script:UiFontCollection) { $script:UiFontCollection.Dispose() }
  foreach ($icon in $script:UiDecorativeIcons) { if ($icon) { $icon.Dispose() } }
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
    foreach ($group in $script:UiPanelControls) {
      if (-not $group.card.Visible -or
          $canvas.Controls.GetChildIndex($group.card) -ge $canvas.Controls.Count) {
        $script:smokeFailed = $true
      }
      foreach ($child in $group.controls) {
        # O controle precisa pertencer ao card e estar em arvore de UI visivel;
        # a propriedade Visible sozinha nao revela um painel sobreposto.
        $parent = $child.Parent
        while ($parent -and $parent -ne $group.card) { $parent = $parent.Parent }
        if ($parent -ne $group.card -or -not $child.Visible) {
          $script:smokeFailed = $true
        }
      }
    }
    foreach ($pair in @(
      @{button=$checkButton; tip="Conecta e verifica a integridade do schema."},
      @{button=$migrateButton; tip="Executa apenas migrations pendentes."},
      @{button=$networkButton; tip="Verifica endereço e conectividade TCP."},
      @{button=$registerButton; tip="Registra o servidor da primeira instalação."}
    )) {
      if ($actionToolTip.GetToolTip($pair.button) -cne $pair.tip) {
        $script:smokeFailed = $true
      }
    }
    if ($ViewportWidth -gt 0 -and $ViewportHeight -gt 0 -and
        ($ViewportWidth -lt $canvas.Width -or $ViewportHeight -lt $canvas.Height) -and
        -not ($page.HorizontalScroll.Visible -or $page.VerticalScroll.Visible)) {
      $script:smokeFailed = $true
    }
    if ($StrictFonts) {
      foreach ($h in @($title,$brandSubtitle,$connTitle,$actionTitle,$statusTitle,$logTitle)) {
        if ($h.Font.FontFamily.Name -ne "Sora") { $script:smokeFailed = $true }
      }
      foreach ($component in @($hostField,$portField,$dbField,$userField,$binField,$passField,
                               $checkButton,$migrateButton,$networkButton,$registerButton,$log)) {
        if ($component.Font.FontFamily.Name -ne "Inter") { $script:smokeFailed = $true }
      }
    }

    # O teste usa o asset real do projeto e nao aceita uma marca ausente.
    $officialLogo = Join-Path (Split-Path -Parent $PSScriptRoot) "build\icon.png"
    if ((Test-Path -LiteralPath $officialLogo) -and $null -eq $logoPicture.Image) {
      $script:smokeFailed = $true
    }
    # Validacao de pixels renderizados: um smoke test so de .Visible podia
    # aprovar a janela apesar de os cards inteiros aparecerem vazios no Windows.
    if (-not $script:smokeFailed) {
      $visualCheck = New-Object System.Drawing.Bitmap($canvas.Width,$canvas.Height)
      try {
        $rect = New-Object System.Drawing.Rectangle(0,0,$canvas.Width,$canvas.Height)
        $canvas.DrawToBitmap($visualCheck,$rect)
        $buttonColor = $visualCheck.GetPixel(531,500)
        $cardColor = $visualCheck.GetPixel(40,210)
        $expectedButton = UiColor "primary"
        $expectedCard = UiColor "surface"
        if ($buttonColor.ToArgb() -ne $expectedButton.ToArgb() -or
            $cardColor.ToArgb() -ne $expectedCard.ToArgb()) {
          $script:smokeFailed = $true
          [Console]::Error.WriteLine(
            "PORTUS: cards cobertos no render. CTA=" + $buttonColor.ToArgb() +
            ", esperado=" + $expectedButton.ToArgb() +
            "; card=" + $cardColor.ToArgb() +
            ", esperado=" + $expectedCard.ToArgb()
          )
        }
      } finally { $visualCheck.Dispose() }
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
