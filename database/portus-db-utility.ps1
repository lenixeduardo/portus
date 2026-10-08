# PORTUS - utilitario visual PostgreSQL (Windows PowerShell 5.1).
# Apenas o botao Aplicar migrations altera o banco, mediante confirmacao.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = "PORTUS | Utilitario PostgreSQL"
$form.StartPosition = "CenterScreen"
$form.ClientSize = New-Object System.Drawing.Size(720,726)
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#F8FAFC")
$form.Font = New-Object System.Drawing.Font("Segoe UI",10)

function Add-Label([string]$value,[int]$x,[int]$y,[int]$width) {
  $item = New-Object System.Windows.Forms.Label
  $item.Text = $value
  $item.Location = New-Object System.Drawing.Point($x,$y)
  $item.Size = New-Object System.Drawing.Size($width,25)
  $item.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#334155")
  $form.Controls.Add($item)
  return $item
}
function Add-Field([string]$label,[int]$x,[int]$y,[int]$width,[string]$initial,[bool]$secret = $false) {
  [void](Add-Label $label $x $y $width)
  $item = New-Object System.Windows.Forms.TextBox
  $item.Location = New-Object System.Drawing.Point($x,($y+25))
  $item.Size = New-Object System.Drawing.Size($width,27)
  $item.Text = $initial
  $item.UseSystemPasswordChar = $secret
  $form.Controls.Add($item)
  return $item
}
function Find-PostgresBin {
  foreach ($v in @(18,17,16,15,14)) {
    $bin = Join-Path $env:ProgramFiles ("PostgreSQL\{0}\bin" -f $v)
    if (Test-Path -LiteralPath (Join-Path $bin "psql.exe")) { return $bin }
  }
  return (Join-Path $env:ProgramFiles "PostgreSQL\18\bin")
}
$title = Add-Label "PORTUS  /  BANCO DE DADOS" 24 17 660
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold",18)
$title.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#0F172A")
[void](Add-Label "Migrations e verificacao do PostgreSQL central" 25 59 660)

$hostField = Add-Field "Servidor" 24 110 225 "127.0.0.1"
$portField = Add-Field "Porta" 264 110 115 "5432"
$dbField = Add-Field "Banco" 393 110 302 "portus"
$userField = Add-Field "Administrador PostgreSQL" 24 185 230 "postgres"
$binField = Add-Field "Pasta bin do PostgreSQL" 269 185 426 (Find-PostgresBin)
$passField = Add-Field "Senha do administrador PostgreSQL" 24 260 671 "" $true
$fields = @($hostField,$portField,$dbField,$userField,$binField,$passField)

$checkButton = New-Object System.Windows.Forms.Button
$checkButton.Text = "Validar banco de dados"
$checkButton.Location = New-Object System.Drawing.Point(24,346)
$checkButton.Size = New-Object System.Drawing.Size(214,45)
$checkButton.FlatStyle = "Flat"
$checkButton.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($checkButton)

$migrateButton = New-Object System.Windows.Forms.Button
$migrateButton.Text = "Aplicar migrations"
$migrateButton.Location = New-Object System.Drawing.Point(249,346)
$migrateButton.Size = New-Object System.Drawing.Size(214,45)
$migrateButton.FlatStyle = "Flat"
$migrateButton.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#B91C1C")
$migrateButton.ForeColor = [System.Drawing.Color]::White
$migrateButton.FlatAppearance.BorderSize = 0
$form.Controls.Add($migrateButton)

$networkButton = New-Object System.Windows.Forms.Button
$networkButton.Text = "Verificar IP / rede"
$networkButton.Location = New-Object System.Drawing.Point(478,346)
$networkButton.Size = New-Object System.Drawing.Size(217,45)
$networkButton.FlatStyle = "Flat"
$networkButton.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#0F172A")
$networkButton.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($networkButton)

$registerButton = New-Object System.Windows.Forms.Button
$registerButton.Text = "Registrar IP inicial"
$registerButton.Location = New-Object System.Drawing.Point(24,402)
$registerButton.Size = New-Object System.Drawing.Size(180,30)
$registerButton.FlatStyle = "Flat"
$form.Controls.Add($registerButton)

$referenceLabel = Add-Label "IP do servidor cadastrado: nao encontrado" 214 405 480
$referenceLabel.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#475569")
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

$status = Add-Label "Pronto para conectar." 24 450 670
$status.Font = New-Object System.Drawing.Font("Segoe UI Semibold",10)
$log = New-Object System.Windows.Forms.TextBox
$log.Multiline = $true
$log.ReadOnly = $true
$log.ScrollBars = "Vertical"
$log.Location = New-Object System.Drawing.Point(24,484)
$log.Size = New-Object System.Drawing.Size(671,179)
$log.Font = New-Object System.Drawing.Font("Consolas",9)
$form.Controls.Add($log)
$foot = Add-Label "Validacao IP/rede nao altera configuracoes. O registro inicial pede confirmacao." 24 682 670
$foot.Font = New-Object System.Drawing.Font("Segoe UI",8)

$script:child = $null
$script:outFile = $null
$script:errFile = $null
$script:outOffset = 0
$script:errOffset = 0
$script:action = ""

function Show-Log([string]$value) {
  $log.AppendText($value + [Environment]::NewLine)
  $log.SelectionStart = $log.TextLength
  $log.ScrollToCaret()
}
function Set-Busy([bool]$busy) {
  foreach ($field in $fields) { $field.Enabled = -not $busy }
  $checkButton.Enabled = -not $busy
  $migrateButton.Enabled = -not $busy
  $networkButton.Enabled = -not $busy
  $registerButton.Enabled = -not $busy
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
    } else {
      $status.Text = "Falha (codigo $code). Confira o log."
      $status.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#B91C1C")
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
[void]$form.ShowDialog()
