function Show-PortusTestCleanupDialog($Owner, $Preview, [string]$Target) {
  $rows = @($Preview.batches)
  if ($rows.Count -eq 0) {
    [void][System.Windows.Forms.MessageBox]::Show('Nenhum lote encontrado. Nenhum dado foi alterado.','PORTUS')
    return $null
  }
  $dialog = New-Object System.Windows.Forms.Form
  $dialog.Text = 'PORTUS - Limpar dados de teste'
  $dialog.Size = New-Object System.Drawing.Size(820,520)
  $dialog.StartPosition = 'CenterParent'
  $dialog.Font = $Owner.Font
  $dialog.MinimizeBox = $false
  $dialog.MaximizeBox = $false
  $dialog.FormBorderStyle = 'FixedDialog'
  $header = New-Object System.Windows.Forms.Label
  $header.Text = "Banco: $Target | Usuario PostgreSQL: $($Preview.databaseUser)" + [Environment]::NewLine +
    'Marque somente lotes de teste. Sera criado um backup antes da remocao.'
  $header.Location = New-Object System.Drawing.Point(20,18)
  $header.Size = New-Object System.Drawing.Size(770,65)
  $dialog.Controls.Add($header)
  $list = New-Object System.Windows.Forms.CheckedListBox
  $list.Location = New-Object System.Drawing.Point(20,90)
  $list.Size = New-Object System.Drawing.Size(770,290)
  $list.CheckOnClick = $true
  $list.HorizontalScrollbar = $true
  foreach ($row in $rows) {
    [void]$list.Items.Add("ID $($row.id) | $($row.code) | $($row.status) | $($row.readings) leituras | $($row.sessions) sessoes | $($row.active_sessions) ativas", $false)
  }
  $dialog.Controls.Add($list)
  $note = New-Object System.Windows.Forms.Label
  $note.Text = 'Usuarios, produtos, equipamentos e configuracoes serao preservados. Lotes com captura ativa nao podem ser removidos.'
  $note.Location = New-Object System.Drawing.Point(20,385)
  $note.Size = New-Object System.Drawing.Size(770,42)
  $dialog.Controls.Add($note)
  $cancel = New-Object System.Windows.Forms.Button
  $cancel.Text = 'Cancelar'
  $cancel.Location = New-Object System.Drawing.Point(480,435)
  $cancel.Size = New-Object System.Drawing.Size(100,32)
  $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
  $dialog.Controls.Add($cancel)
  $confirm = New-Object System.Windows.Forms.Button
  $confirm.Text = 'Limpar lotes selecionados'
  $confirm.Location = New-Object System.Drawing.Point(590,435)
  $confirm.Size = New-Object System.Drawing.Size(200,32)
  $dialog.Controls.Add($confirm)
  $confirm.Add_Click({
    if ($list.CheckedIndices.Count -eq 0) { return }
    $selected = @($list.CheckedIndices | ForEach-Object { $rows[$_] })
    if (@($selected | Where-Object { [long]$_.active_sessions -gt 0 }).Count -gt 0) {
      [void][System.Windows.Forms.MessageBox]::Show('A selecao inclui captura ativa. Encerre-a ou desmarque o lote.','PORTUS')
      return
    }
    $names = ($selected | ForEach-Object { "ID $($_.id): $($_.code)" }) -join [Environment]::NewLine
    $answer = [System.Windows.Forms.MessageBox]::Show(
      "Remover permanentemente estes lotes e seus dados relacionados de $Target?" + [Environment]::NewLine + $names,
      'Confirmar limpeza de dados de teste', [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Warning)
    if ($answer -eq [System.Windows.Forms.DialogResult]::Yes) {
      $dialog.DialogResult = [System.Windows.Forms.DialogResult]::OK
      $dialog.Close()
    }
  })
  $dialog.CancelButton = $cancel
  try {
    if ($dialog.ShowDialog($Owner) -ne [System.Windows.Forms.DialogResult]::OK) { return $null }
    return (@($list.CheckedIndices | ForEach-Object { [string]$rows[$_].id }) -join ',')
  } finally { $dialog.Dispose() }
}
