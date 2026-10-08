# Icones de interface desenhados em GDI+ para preservar nitidez em WinForms/DPI.
# Nao substituem os quatro assets PNG/SVG avulsos dos botoes de acao.
$script:UiDecorativeIcons = @()
function New-PortusGlyph([string]$kind,[int]$size=24,[string]$tone="primary") {
  $bitmap = New-Object System.Drawing.Bitmap($size,$size)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $color = UiColor $tone
  $pen = New-Object System.Drawing.Pen($color,[Math]::Max(1.5,($size/12)))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $brush = New-Object System.Drawing.SolidBrush($color)
  $scale = $size/24.0
  function pt([double]$x) { return [int][Math]::Round($x*$scale) }
  try {
    switch ($kind) {
      "database" {
        $g.DrawEllipse($pen,(pt 4),(pt 3),(pt 16),(pt 7))
        $g.DrawLine($pen,(pt 4),(pt 6),(pt 4),(pt 19))
        $g.DrawLine($pen,(pt 20),(pt 6),(pt 20),(pt 19))
        $g.DrawArc($pen,(pt 4),(pt 9),(pt 16),(pt 8),0,180)
        $g.DrawArc($pen,(pt 4),(pt 15),(pt 16),(pt 7),0,180)
      }
      "server" {
        $g.DrawRectangle($pen,(pt 4),(pt 3),(pt 16),(pt 7))
        $g.DrawRectangle($pen,(pt 4),(pt 14),(pt 16),(pt 7))
        $g.FillEllipse($brush,(pt 7),(pt 5),(pt 2),(pt 2))
        $g.FillEllipse($brush,(pt 7),(pt 16),(pt 2),(pt 2))
        $g.DrawLine($pen,(pt 12),(pt 6),(pt 17),(pt 6))
        $g.DrawLine($pen,(pt 12),(pt 17),(pt 17),(pt 17))
      }
      "network" {
        $g.DrawRectangle($pen,(pt 9),(pt 2),(pt 6),(pt 5))
        $g.DrawRectangle($pen,(pt 2),(pt 17),(pt 6),(pt 5))
        $g.DrawRectangle($pen,(pt 16),(pt 17),(pt 6),(pt 5))
        $g.DrawLine($pen,(pt 12),(pt 7),(pt 12),(pt 13))
        $g.DrawLine($pen,(pt 5),(pt 13),(pt 19),(pt 13))
        $g.DrawLine($pen,(pt 5),(pt 13),(pt 5),(pt 17))
        $g.DrawLine($pen,(pt 19),(pt 13),(pt 19),(pt 17))
      }
      "user" {
        $g.DrawEllipse($pen,(pt 8),(pt 3),(pt 8),(pt 8))
        $g.DrawArc($pen,(pt 4),(pt 12),(pt 16),(pt 13),180,180)
      }
      "folder" {
        $g.DrawLines($pen,[System.Drawing.Point[]]@(
          (New-Object System.Drawing.Point((pt 3),(pt 19))),
          (New-Object System.Drawing.Point((pt 3),(pt 7))),
          (New-Object System.Drawing.Point((pt 9),(pt 7))),
          (New-Object System.Drawing.Point((pt 11),(pt 10))),
          (New-Object System.Drawing.Point((pt 21),(pt 10))),
          (New-Object System.Drawing.Point((pt 21),(pt 19))),
          (New-Object System.Drawing.Point((pt 3),(pt 19)))
        ))
      }
      "lock" {
        $g.DrawArc($pen,(pt 7),(pt 2),(pt 10),(pt 13),180,180)
        $g.DrawRectangle($pen,(pt 5),(pt 11),(pt 14),(pt 10))
        $g.FillEllipse($brush,(pt 11),(pt 15),(pt 2),(pt 3))
      }
      "settings" {
        $g.DrawEllipse($pen,(pt 4),(pt 4),(pt 16),(pt 16))
        $g.DrawEllipse($pen,(pt 9),(pt 9),(pt 6),(pt 6))
        foreach ($angle in @(0,45,90,135,180,225,270,315)) {
          $r1=10*$scale;$r2=12*$scale;$angleRad=$angle*[Math]::PI/180
          $cx=$size/2;$cy=$size/2
          $g.DrawLine($pen,[int]($cx+$r1*[Math]::Cos($angleRad)),[int]($cy+$r1*[Math]::Sin($angleRad)),
                         [int]($cx+$r2*[Math]::Cos($angleRad)),[int]($cy+$r2*[Math]::Sin($angleRad)))
        }
      }
      "document" {
        $g.DrawRectangle($pen,(pt 5),(pt 3),(pt 14),(pt 18))
        $g.DrawLine($pen,(pt 8),(pt 9),(pt 16),(pt 9))
        $g.DrawLine($pen,(pt 8),(pt 13),(pt 16),(pt 13))
        $g.DrawLine($pen,(pt 8),(pt 17),(pt 14),(pt 17))
      }
      "check" {
        $g.FillEllipse($brush,(pt 1),(pt 1),(pt 22),(pt 22))
        $whitePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White,(3*$scale))
        try {
          $g.DrawLines($whitePen,[System.Drawing.Point[]]@(
            (New-Object System.Drawing.Point((pt 6),(pt 12))),
            (New-Object System.Drawing.Point((pt 10),(pt 16))),
            (New-Object System.Drawing.Point((pt 18),(pt 8)))
          ))
        } finally { $whitePen.Dispose() }
      }
      default { throw "Icone de interface nao reconhecido: $kind" }
    }
    $script:UiDecorativeIcons += $bitmap
    return $bitmap
  } finally { $brush.Dispose(); $pen.Dispose(); $g.Dispose() }
}
function Add-PortusGlyph([string]$kind,[int]$x,[int]$y,[int]$size=24,[string]$tone="primary") {
  $item = New-Object System.Windows.Forms.PictureBox
  $item.Location = New-Object System.Drawing.Point($x,$y)
  $item.Size = New-Object System.Drawing.Size($size,$size)
  $item.BackColor = [System.Drawing.Color]::Transparent
  $item.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
  $item.Image = New-PortusGlyph $kind $size $tone
  $canvas.Controls.Add($item)
  return $item
}
