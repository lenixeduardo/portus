# Selecao explicita da base SQLite antiga e da identidade da estacao.
# Nenhuma leitura, copia ou escrita no PostgreSQL e feita nesta janela.
function Show-PortusLegacyImportDialog([System.Windows.Forms.IWin32Window]$Owner) {
  $dialog = New-Object System.Windows.Forms.Form
  $dialog.Text = "PORTUS — Migrar dados SQLite"
  $dialog.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
  $dialog.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterParent
  $dialog.MaximizeBox = $false
  $dialog.MinimizeBox = $false
  $dialog.ShowInTaskbar = $false
  $dialog.ClientSize = New-Object System.Drawing.Size(575,287)
  $dialog.BackColor = UiColor "surface"
  $dialog.Font = UiFont "Inter" 13
  $addLabel = {
    param($value,$x,$y,$w)
    $l = New-Object System.Windows.Forms.Label
    $l.Text=$value
    $l.Location=New-Object System.Drawing.Point($x,$y)
    $l.Size=New-Object System.Drawing.Size($w,23)
    $l.ForeColor=UiColor "textPrimary"
    $dialog.Controls.Add($l)
  }
  & $addLabel "Arquivo SQLite de origem (somente leitura)" 20 12 530
  $sqlite = New-Object System.Windows.Forms.TextBox
  $sqlite.Location = New-Object System.Drawing.Point(20,39)
  $sqlite.Size = New-Object System.Drawing.Size(463,29)
  $sqlite.ReadOnly = $true
  $dialog.Controls.Add($sqlite)
  $browse = New-Object System.Windows.Forms.Button
  $browse.Text = "..."
  $browse.Location = New-Object System.Drawing.Point(493,37)
  $browse.Size = New-Object System.Drawing.Size(60,31)
  $dialog.Controls.Add($browse)
  $browse.Add_Click({
    $picker=New-Object System.Windows.Forms.OpenFileDialog
    $picker.Title="Selecione o banco SQLite antigo do PORTUS"
    $picker.Filter="SQLite (*.sqlite;*.sqlite3;*.db)|*.sqlite;*.sqlite3;*.db|Todos os arquivos (*.*)|*.*"
    $picker.CheckFileExists=$true
    try {
      if ($picker.ShowDialog($dialog) -eq [System.Windows.Forms.DialogResult]::OK) {
        $sqlite.Text=$picker.FileName
      }
    } finally { $picker.Dispose() }
  })
  & $addLabel "Código da estação (ex.: PRODUCAO-01)" 20 83 300
  $station=New-Object System.Windows.Forms.TextBox
  $station.Location=New-Object System.Drawing.Point(20,111)
  $station.Size=New-Object System.Drawing.Size(300,29)
  $dialog.Controls.Add($station)
  $identity=Join-Path (Join-Path $env:LOCALAPPDATA "PORTUS") "station-identity.json"
  if (Test-Path -LiteralPath $identity) {
    try {
      $existing=Get-Content -LiteralPath $identity -Raw -Encoding UTF8 | ConvertFrom-Json
      $station.Text=[string]$existing.code
    } catch { }
  }
  & $addLabel "Setor da estação" 338 83 211
  $sector=New-Object System.Windows.Forms.ComboBox
  $sector.Location=New-Object System.Drawing.Point(338,111)
  $sector.Size=New-Object System.Drawing.Size(215,29)
  $sector.DropDownStyle=[System.Windows.Forms.ComboBoxStyle]::DropDownList
  [void]$sector.Items.Add("Produção")
  [void]$sector.Items.Add("Laboratório")
  $sector.SelectedIndex=0
  $dialog.Controls.Add($sector)
  $notice=New-Object System.Windows.Forms.Label
  $notice.Text="Backups do SQLite e PostgreSQL serão criados antes da importação. Identidade e quantidades serão conferidas."
  $notice.ForeColor=UiColor "textSecondary"
  $notice.Location=New-Object System.Drawing.Point(20,151)
  $notice.Size=New-Object System.Drawing.Size(533,49)
  $dialog.Controls.Add($notice)
  $cancel=New-Object System.Windows.Forms.Button
  $cancel.Text="Cancelar"
  $cancel.Location=New-Object System.Drawing.Point(334,225)
  $cancel.Size=New-Object System.Drawing.Size(101,38)
  $dialog.Controls.Add($cancel)
  $cancel.Add_Click({ $dialog.DialogResult=[System.Windows.Forms.DialogResult]::Cancel; $dialog.Close() })
  $confirm=New-Object System.Windows.Forms.Button
  $confirm.Text="Continuar"
  $confirm.Location=New-Object System.Drawing.Point(445,225)
  $confirm.Size=New-Object System.Drawing.Size(108,38)
  $confirm.BackColor=UiColor "primary"
  $confirm.ForeColor=UiColor "surface"
  $confirm.FlatStyle=[System.Windows.Forms.FlatStyle]::Flat
  $confirm.FlatAppearance.BorderSize=0
  $dialog.Controls.Add($confirm)
  $dialog.AcceptButton=$confirm
  $dialog.CancelButton=$cancel
  $confirm.Add_Click({
    $code=$station.Text.Trim().ToUpperInvariant()
    if (-not (Test-Path -LiteralPath $sqlite.Text -PathType Leaf) -or
        $sqlite.Text.Contains('"') -or
        $code -notmatch '^[A-Z0-9._-]{2,64}$') {
      [void][System.Windows.Forms.MessageBox]::Show(
        "Selecione um SQLite existente e um código de estação válido (2–64 caracteres: A-Z, 0-9, ponto, hífen ou _).",
        "PORTUS — Dados inválidos")
      return
    }
    $dialog.Tag=@{
      Sqlite=[string]$sqlite.Text
      Station=[string]$code
      Sector=$(if($sector.SelectedIndex -eq 1){"LABORATORY"}else{"PRODUCTION"})
    }
    $dialog.DialogResult=[System.Windows.Forms.DialogResult]::OK
    $dialog.Close()
  })
  try {
    if ($dialog.ShowDialog($Owner) -eq [System.Windows.Forms.DialogResult]::OK) {
      return $dialog.Tag
    }
    return $null
  } finally { $dialog.Dispose() }
}
