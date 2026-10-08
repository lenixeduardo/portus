# PORTUS Database Utility - camada visual WinForms (identidade PORTUS).
# Este arquivo deve ser carregado apos a criacao dos controles funcionais.
function Theme-Color([string]$value) { return [System.Drawing.ColorTranslator]::FromHtml($value) }
function Theme-Font([float]$size,[bool]$bold=$false,[string]$family="Segoe UI") {
  $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  return (New-Object System.Drawing.Font($family,$size,$style))
}
function Theme-Card([int]$y,[int]$height) {
  $panel = New-Object System.Windows.Forms.Panel
  $panel.Location = New-Object System.Drawing.Point(18,$y)
  $panel.Size = New-Object System.Drawing.Size(1090,$height)
  $panel.BackColor = [System.Drawing.Color]::White
  $panel.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
  $canvas.Controls.Add($panel)
  return $panel
}
function Theme-Text([System.Windows.Forms.Control]$parent,[string]$value,[int]$x,[int]$y,[int]$w,[int]$h,
                    [float]$size,[bool]$bold=$false,[string]$color="#34445A") {
  $label = New-Object System.Windows.Forms.Label
  $label.Text = $value
  $label.Location = New-Object System.Drawing.Point($x,$y)
  $label.Size = New-Object System.Drawing.Size($w,$h)
  $label.Font = Theme-Font $size $bold
  $label.ForeColor = Theme-Color $color
  $parent.Controls.Add($label)
  return $label
}
function Theme-Move([System.Windows.Forms.Control]$control,[System.Windows.Forms.Control]$parent,
                    [int]$x,[int]$y,[int]$w,[int]$h) {
  $parent.Controls.Add($control)
  $control.Location = New-Object System.Drawing.Point($x,$y)
  $control.Size = New-Object System.Drawing.Size($w,$h)
}
function Theme-Action([System.Windows.Forms.Button]$button,[System.Windows.Forms.Panel]$parent,
                     [int]$x,[bool]$primary) {
  Theme-Move $button $parent $x 47 245 56
  $button.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
  $button.BackColor = if ($primary) { Theme-Color "#1476D4" } else { [System.Drawing.Color]::White }
  $button.ForeColor = if ($primary) { [System.Drawing.Color]::White } else { Theme-Color "#142E51" }
  $button.FlatAppearance.BorderColor = Theme-Color "#CBD9E9"
  $button.FlatAppearance.BorderSize = if ($primary) { 0 } else { 1 }
  $button.Font = Theme-Font 10 $true
  $button.Cursor = [System.Windows.Forms.Cursors]::Hand
}

$form.Text = "PORTUS | Database Utility"
$form.ClientSize = New-Object System.Drawing.Size(1140,820)
$form.MinimumSize = New-Object System.Drawing.Size(900,630)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::Sizable
$form.MaximizeBox = $true
$form.BackColor = Theme-Color "#F4F7FB"
$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi

# Container com rolagem apenas quando a janela for menor que o layout.
$scrollHost = New-Object System.Windows.Forms.Panel
$scrollHost.Dock = [System.Windows.Forms.DockStyle]::Fill
$scrollHost.AutoScroll = $true
$scrollHost.BackColor = Theme-Color "#F4F7FB"
$form.Controls.Add($scrollHost)
$canvas = New-Object System.Windows.Forms.Panel
$canvas.Location = New-Object System.Drawing.Point(0,0)
$canvas.Size = New-Object System.Drawing.Size(1126,884)
$canvas.BackColor = Theme-Color "#F4F7FB"
$scrollHost.Controls.Add($canvas)

$header = Theme-Card 12 145
$brandIcon = New-Object System.Windows.Forms.PictureBox
$brandIcon.Location = New-Object System.Drawing.Point(24,16)
$brandIcon.Size = New-Object System.Drawing.Size(110,110)
$brandIcon.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
$header.Controls.Add($brandIcon)
$script:portusLogo = $null
foreach ($candidate in @(
  (Join-Path $PSScriptRoot "portus-utility-logo.png"),
  (Join-Path $PSScriptRoot "..\build\icon.png"),
  (Join-Path $PSScriptRoot "..\portus-icon.png")
)) {
  if (-not (Test-Path -LiteralPath $candidate)) { continue }
  try {
    $script:portusLogo = [System.Drawing.Image]::FromFile($candidate)
    $brandIcon.Image = $script:portusLogo
    break
  } catch { Write-Warning ("Falha ao carregar logo PORTUS: " + $_.Exception.Message) }
}
if (-not $script:portusLogo) {
  $fallback = Theme-Text $header "P" 53 26 60 72 40 $true "#1476D4"
}
Theme-Move $title $header 151 17 530 63
$title.Text = "PORTUS"
$title.Font = Theme-Font 34 $true
$title.ForeColor = Theme-Color "#081B37"
$subtitle = @($form.Controls | Where-Object {
  $_ -is [System.Windows.Forms.Label] -and $_.Text -like "Migrations e verificacao*"
}) | Select-Object -First 1
if ($subtitle) {
  Theme-Move $subtitle $header 155 110 570 23
  $subtitle.Text = "PostgreSQL  |  Gerenciamento e manutencao do banco"
  $subtitle.Font = Theme-Font 9
  $subtitle.ForeColor = Theme-Color "#677C99"
}
$descriptor = Theme-Text $header "D A T A B A S E   U T I L I T Y" 155 83 480 25 10 $true "#315D8B"
$divider = New-Object System.Windows.Forms.Panel
$divider.Location = New-Object System.Drawing.Point(754,24)
$divider.Size = New-Object System.Drawing.Size(1,96)
$divider.BackColor = Theme-Color "#D9E3EE"
$header.Controls.Add($divider)
$explain = Theme-Text $header "Configuracao, validacao e manutencao do PostgreSQL PORTUS. Confere o IP do servidor cadastrado na instalacao." 777 27 280 96 10 $false "#536781"

$connectionCard = Theme-Card 170 224
$configTitle = Theme-Text $connectionCard "Configuracoes de Conexao" 23 14 430 32 14 $true "#0C2240"
$info = Theme-Text $connectionCard "IP de servidor verificado contra a primeira instalacao." 588 20 483 25 9 $false "#2170B8"
$names = @("Servidor","Porta","Banco","Administrador PostgreSQL","Pasta bin do PostgreSQL","Senha do administrador PostgreSQL")
$inputs = @($hostField,$portField,$dbField,$userField,$binField,$passField)
$xs = @(22,365,708,22,365,708)
$ys = @(61,61,61,140,140,140)
$ws = @(320,320,358,320,320,358)
for ($i=0;$i -lt $inputs.Count;$i++) {
  $caption = @($form.Controls | Where-Object {
    $_ -is [System.Windows.Forms.Label] -and $_.Text -ceq $names[$i]
  }) | Select-Object -First 1
  if (-not $caption) { throw "Campo de conexao nao encontrado: $($names[$i])" }
  Theme-Move $caption $connectionCard $xs[$i] $ys[$i] $ws[$i] 23
  $caption.Font = Theme-Font 9.5 $true
  $caption.ForeColor = Theme-Color "#283E5D"
  Theme-Move $inputs[$i] $connectionCard $xs[$i] ($ys[$i]+27) $ws[$i] 29
  $inputs[$i].Font = Theme-Font 10
  $inputs[$i].ForeColor = Theme-Color "#172B48"
  $inputs[$i].BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
}
$browseButton = New-Object System.Windows.Forms.Button
$browseButton.Text = "..."
Theme-Move $browseButton $connectionCard 644 167 40 28
$browseButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$browseButton.FlatAppearance.BorderColor = Theme-Color "#CFDCEC"
$browseButton.BackColor = [System.Drawing.Color]::White
$binField.Width = 277
$browseButton.Add_Click({
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Selecione a pasta bin que contem psql.exe"
  $dialog.SelectedPath = $binField.Text
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $binField.Text = $dialog.SelectedPath }
  $dialog.Dispose()
})
$eyeButton = New-Object System.Windows.Forms.Button
$eyeButton.Text = "Ver"
Theme-Move $eyeButton $connectionCard 1016 167 50 28
$eyeButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$eyeButton.FlatAppearance.BorderColor = Theme-Color "#CFDCEC"
$eyeButton.BackColor = [System.Drawing.Color]::White
$passField.Width = 302
$eyeButton.Add_Click({ $passField.UseSystemPasswordChar = -not $passField.UseSystemPasswordChar })

$actionsCard = Theme-Card 407 158
$actionTitle = Theme-Text $actionsCard "Acoes" 23 12 240 32 14 $true "#0C2240"
Theme-Action $checkButton $actionsCard 22 $false
Theme-Action $migrateButton $actionsCard 288 $true
Theme-Action $networkButton $actionsCard 554 $false
Theme-Action $registerButton $actionsCard 820 $false
[void](Theme-Text $actionsCard "Valida conexao, schema e integridade." 27 108 238 34 8.5 $false "#71839C")
[void](Theme-Text $actionsCard "Executa as migrations pendentes." 293 108 238 34 8.5 $false "#71839C")
[void](Theme-Text $actionsCard "Valida o servidor e conectividade TCP." 559 108 238 34 8.5 $false "#71839C")
[void](Theme-Text $actionsCard "Registra a referencia da primeira vez." 825 108 238 34 8.5 $false "#71839C")

$statusCard = Theme-Card 579 82
$statusTitle = Theme-Text $statusCard "Status" 23 9 170 31 12 $true "#0C2240"
$statusDot = Theme-Text $statusCard ([char]0x2714) 23 39 28 27 14 $true "#178C52"
Theme-Move $status $statusCard 58 40 474 29
$status.Font = Theme-Font 10 $true
$status.ForeColor = Theme-Color "#16834B"
Theme-Move $referenceLabel $statusCard 540 40 525 27
$referenceLabel.Font = Theme-Font 9
$referenceLabel.ForeColor = Theme-Color "#60728B"

$logCard = Theme-Card 674 186
$logTitle = Theme-Text $logCard "Log de operacoes" 23 12 420 30 12 $true "#0C2240"
Theme-Move $log $logCard 22 51 1043 120
$log.Font = Theme-Font 9 $false "Consolas"
$log.BackColor = Theme-Color "#FBFDFF"
$log.ForeColor = Theme-Color "#223956"
$log.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$clearButton = New-Object System.Windows.Forms.Button
$clearButton.Text = "Limpar log"
Theme-Move $clearButton $logCard 937 12 128 30
$clearButton.Font = Theme-Font 9
$clearButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$clearButton.FlatAppearance.BorderColor = Theme-Color "#CFDCEC"
$clearButton.BackColor = [System.Drawing.Color]::White
$clearButton.Add_Click({ $log.Clear() })
$foot.Visible = $false

$form.Add_FormClosed({
  if ($script:portusLogo) {
    $brandIcon.Image = $null
    $script:portusLogo.Dispose()
  }
})
