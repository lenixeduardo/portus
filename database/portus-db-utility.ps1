# PORTUS - utilitario visual PostgreSQL (Windows PowerShell 5.1).
# Apenas o botao Aplicar migrations altera o banco, mediante confirmacao.
[CmdletBinding()]
param([switch]$SmokeTest)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

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
$form.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#F3F6FA")
$form.Font = New-Object System.Drawing.Font("Segoe UI",10)

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
$canvas.BackColor = $form.BackColor
$page.Controls.Add($canvas)

function Color([string]$hex) {
  return [System.Drawing.ColorTranslator]::FromHtml($hex)
}
function Add-Label([string]$value,[int]$x,[int]$y,[int]$width,[int]$height=26) {
  $item = New-Object System.Windows.Forms.Label
  $item.Text = $value
  $item.Location = New-Object System.Drawing.Point($x,$y)
  $item.Size = New-Object System.Drawing.Size($width,$height)
  $item.ForeColor = Color "#334155"
  $item.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
  $canvas.Controls.Add($item)
  return $item
}
function Make-Card([int]$x,[int]$y,[int]$w,[int]$h) {
  $panel = New-Object System.Windows.Forms.Panel
  $panel.Location = New-Object System.Drawing.Point($x,$y)
  $panel.Size = New-Object System.Drawing.Size($w,$h)
  $panel.BackColor = [System.Drawing.Color]::White
  $panel.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
  $canvas.Controls.Add($panel)
  return $panel
}
function Add-Field([string]$label,[int]$x,[int]$y,[int]$width,[string]$initial,[bool]$secret=$false) {
  $caption = Add-Label $label $x $y $width 24
  $caption.Font = New-Object System.Drawing.Font("Segoe UI Semibold",9.5)
  $caption.ForeColor = Color "#20314C"
  $item = New-Object System.Windows.Forms.TextBox
  $item.Location = New-Object System.Drawing.Point($x,($y+28))
  $item.Size = New-Object System.Drawing.Size($width,36)
  $item.Font = New-Object System.Drawing.Font("Segoe UI",11)
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
  $button.Size = New-Object System.Drawing.Size(243,54)
  $button.Font = New-Object System.Drawing.Font("Segoe UI Semibold",10)
  $button.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
  $button.FlatAppearance.BorderSize = if ($primary) { 0 } else { 1 }
  $button.FlatAppearance.BorderColor = Color "#C8D5E5"
  $button.BackColor = if ($primary) { Color "#1479E5" } else { [System.Drawing.Color]::White }
  $button.ForeColor = if ($primary) { [System.Drawing.Color]::White } else { Color "#16365F" }
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
$title = Add-Label "PORTUS" 155 36 490 63
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold",33)
$title.ForeColor = Color "#081D3F"
$brandSubtitle = Add-Label "DATABASE UTILITY" 160 99 480 30
$brandSubtitle.Font = New-Object System.Drawing.Font("Segoe UI Semibold",13)
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
$connTitle.Font = New-Object System.Drawing.Font("Segoe UI Semibold",14)
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
$browseButton.Font = New-Object System.Drawing.Font("Segoe UI Semibold",9)
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
$actionTitle.Font = New-Object System.Drawing.Font("Segoe UI Semibold",14)
$actionTitle.ForeColor = Color "#112749"
$checkButton = Make-Action "Validar banco de dados" 49
$migrateButton = Make-Action "Aplicar migrations" 313 $true
$networkButton = Make-Action "Verificar IP / rede" 577
$registerButton = Make-Action "Registrar IP inicial" 841
$captions = @(
  @{x=49; text="Conecta e verifica a integridade do schema."},
  @{x=313; text="Executa apenas migrations pendentes."},
  @{x=577; text="Verifica endereco e conectividade TCP."},
  @{x=841; text="Registra o servidor da primeira instalacao."}
)
foreach ($caption in $captions) {
  $description = Add-Label $caption.text $caption.x 553 243 26
  $description.ForeColor = Color "#64748B"
  $description.Font = New-Object System.Drawing.Font("Segoe UI",8.5)
  $description.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
}

# Status card.
[void](Make-Card 24 600 1086 94)
$statusTitle = Add-Label "STATUS" 47 611 450 28
$statusTitle.Font = New-Object System.Drawing.Font("Segoe UI Semibold",11)
$statusTitle.ForeColor = Color "#112749"
$statusDot = Add-Label ([string][char]0x25CF) 51 640 36 36
$statusDot.Font = New-Object System.Drawing.Font("Segoe UI",18)
$statusDot.ForeColor = Color "#16A34A"
$status = Add-Label "Pronto para executar." 91 641 600 27
$status.Font = New-Object System.Drawing.Font("Segoe UI Semibold",10)
$status.ForeColor = Color "#166534"
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
$logTitle.Font = New-Object System.Drawing.Font("Segoe UI Semibold",11)
$logTitle.ForeColor = Color "#112749"
$clearLogButton = New-Object System.Windows.Forms.Button
$clearLogButton.Text = "Limpar log"
$clearLogButton.Location = New-Object System.Drawing.Point(960,719)
$clearLogButton.Size = New-Object System.Drawing.Size(125,30)
$clearLogButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$clearLogButton.BackColor = [System.Drawing.Color]::White
$clearLogButton.FlatAppearance.BorderColor = Color "#C8D5E5"
$canvas.Controls.Add($clearLogButton)
$log = New-Object System.Windows.Forms.RichTextBox
$log.ReadOnly = $true
$log.ScrollBars = [System.Windows.Forms.RichTextBoxScrollBars]::Vertical
$log.Location = New-Object System.Drawing.Point(47,756)
$log.Size = New-Object System.Drawing.Size(1037,132)
$log.Font = New-Object System.Drawing.Font("Consolas",9)
$log.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$log.BackColor = Color "#FAFCFF"
$log.ForeColor = Color "#334155"
$canvas.Controls.Add($log)
$clearLogButton.Add_Click({ $log.Clear() })
$foot = Add-Label "Validar e verificar IP sao operacoes de leitura. Aplicar migrations exige confirmacao." 47 896 1030 22
$foot.Font = New-Object System.Drawing.Font("Segoe UI",8.5)
$foot.ForeColor = Color "#64748B"

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
      Color "#B42318"
    } elseif ($line -match '(sucesso|OK|validado|concluid|pronto)') {
      Color "#16803B"
    } else {
      Color "#334155"
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
      $statusDot.ForeColor = Color "#16A34A"
    } else {
      $status.Text = "Falha (codigo $code). Confira o log."
      $status.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#B91C1C")
      $statusDot.ForeColor = Color "#B91C1C"
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
  $statusDot.ForeColor = Color "#CA8A04"
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

if ($SmokeTest) {
  # Testa a abertura REAL do formulario sem conectar ou alterar o PostgreSQL.
  $smokeTimer = New-Object System.Windows.Forms.Timer
  $smokeTimer.Interval = 600
  $smokeTimer.Add_Tick({
    $smokeTimer.Stop()
    if (-not $form.Visible -or -not $form.IsHandleCreated -or
        -not $checkButton.Visible -or -not $migrateButton.Visible -or
        -not $networkButton.Visible -or -not $registerButton.Visible) {
      $script:smokeFailed = $true
    }
    $form.Close()
  })
  $form.Add_Shown({ $smokeTimer.Start() })
}

Write-Host "PORTUS: iniciando interface. Se necessario, use Alt+Tab."
[void]$form.ShowDialog()
if ($SmokeTest) {
  if ($script:smokeFailed) { throw "Smoke test: janela ou botoes nao ficaram visiveis." }
  Write-Host "PORTUS_DB_UTILITY_SMOKE_OK"
}
} catch {
  $message = "Nao foi possivel abrir o utilitario PORTUS: " + $_.Exception.Message
  [Console]::Error.WriteLine($message)
  try {
    if (-not $SmokeTest) {
    [void][System.Windows.Forms.MessageBox]::Show($message,"Falha ao iniciar PORTUS",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error)
    }
  } catch { }
  exit 1
}
