function Show-PortusTestCleanupDialog($Owner, $Preview, [string]$Target) {
  $items = New-Object System.Collections.ArrayList
  foreach ($row in @($Preview.batches)) { [void]$items.Add([pscustomobject]@{Kind='batch';Id=[string]$row.id;Text="LOTE | $($row.code) | $($row.status) | $($row.readings) leituras | $($row.active_sessions) ativas";Active=([long]$row.active_sessions -gt 0)}) }
  foreach ($row in @($Preview.products)) { [void]$items.Add([pscustomobject]@{Kind='product';Id=[string]$row.id;Text="PRODUTO | $($row.name)";Active=$false}) }
  foreach ($row in @($Preview.users)) {
    if ($row.role -eq 'master') { continue }
    [void]$items.Add([pscustomobject]@{Kind='user';Id=[string]$row.id;Text="USUARIO | $($row.username) | $($row.role)";Active=$false})
  }
  if ($items.Count -eq 0) {
    [void][System.Windows.Forms.MessageBox]::Show('Nenhum registro elegivel para limpeza.','PORTUS')
    return $null
  }
  $dialog = New-Object System.Windows.Forms.Form
  $dialog.Text = 'PORTUS - Limpar dados cadastrados'
  $dialog.Size = New-Object System.Drawing.Size(880,590)
  $dialog.StartPosition = 'CenterParent'
  $dialog.Font = $Owner.Font
  $dialog.MinimizeBox = $false
  $dialog.MaximizeBox = $false
  $dialog.FormBorderStyle = 'FixedDialog'
  $header = New-Object System.Windows.Forms.Label
  $header.Text = "Banco: $Target" + [Environment]::NewLine + "Todos os registros elegiveis iniciam selecionados. Usuarios Master sao preservados. Backup obrigatorio."
  $header.Location = New-Object System.Drawing.Point(18,12)
  $header.Size = New-Object System.Drawing.Size(825,65)
  $dialog.Controls.Add($header)
  $list = New-Object System.Windows.Forms.CheckedListBox
  $list.Location = New-Object System.Drawing.Point(18,85)
  $list.Size = New-Object System.Drawing.Size(825,335)
  $list.CheckOnClick = $true
  $list.HorizontalScrollbar = $true
  foreach ($item in $items) { [void]$list.Items.Add($item.Text, $true) }
  $dialog.Controls.Add($list)
  $history = New-Object System.Windows.Forms.CheckBox
  $history.Text = "Limpar tambem historicos, erros e auditorias nao vinculados aos lotes selecionados"
  $history.Checked = $true
  $history.Location = New-Object System.Drawing.Point(18,425)
  $history.Size = New-Object System.Drawing.Size(825,35)
  $dialog.Controls.Add($history)
  $cancel = New-Object System.Windows.Forms.Button
  $cancel.Text = 'Cancelar'
  $cancel.Location = New-Object System.Drawing.Point(510,477)
  $cancel.Size = New-Object System.Drawing.Size(125,36)
  $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
  $dialog.Controls.Add($cancel)
  $confirm = New-Object System.Windows.Forms.Button
  $confirm.Text = 'Revisar exclusao'
  $confirm.Location = New-Object System.Drawing.Point(648,477)
  $confirm.Size = New-Object System.Drawing.Size(195,36)
  $dialog.Controls.Add($confirm)
  $confirm.Add_Click({
    $selected = @($list.CheckedIndices | ForEach-Object { $items[[int]$_] })
    if ($selected.Count -eq 0 -and -not $history.Checked) { return }
    if (@($selected | Where-Object { $_.Active }).Count -gt 0) {
      [void][System.Windows.Forms.MessageBox]::Show('Existe lote com captura ativa. Encerre a captura ou desmarque o lote.','PORTUS')
      return
    }
    $b = @($selected | Where-Object Kind -eq 'batch').Count
    $p = @($selected | Where-Object Kind -eq 'product').Count
    $u = @($selected | Where-Object Kind -eq 'user').Count
    $warning = "EXCLUSAO PERMANENTE em $Target" + [Environment]::NewLine +
      "Lotes: $b | Produtos: $p | Usuarios: $u" + [Environment]::NewLine +
      "Historicos avulsos: $($history.Checked)" + [Environment]::NewLine +
      "Um backup sera criado antes de excluir. Deseja continuar?"
    $answer = [System.Windows.Forms.MessageBox]::Show($warning,'Confirmar exclusao de dados',
      [System.Windows.Forms.MessageBoxButtons]::YesNo,[System.Windows.Forms.MessageBoxIcon]::Warning)
    if ($answer -eq [System.Windows.Forms.DialogResult]::Yes) {
      $dialog.Tag = [pscustomobject]@{
        Batches=(@($selected | Where-Object Kind -eq 'batch' | ForEach-Object Id) -join ',')
        Products=(@($selected | Where-Object Kind -eq 'product' | ForEach-Object Id) -join ',')
        Users=(@($selected | Where-Object Kind -eq 'user' | ForEach-Object Id) -join ',')
        ClearHistory=[bool]$history.Checked
      }
      $dialog.DialogResult = [System.Windows.Forms.DialogResult]::OK
      $dialog.Close()
    }
  })
  $dialog.CancelButton = $cancel
  try {
    if ($dialog.ShowDialog($Owner) -ne [System.Windows.Forms.DialogResult]::OK) { return $null }
    return $dialog.Tag
  } finally { $dialog.Dispose() }
}
