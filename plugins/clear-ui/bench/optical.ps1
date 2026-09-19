# Rasterises rows of cells with a real font and reports where the ink is. Driven by optical.mjs.
# Input : JSON { fonts: [name], sizes: [px], rows: [{ name, cells: [{ ch, bg }] }] }
# Output: JSON [{ font, px, cellW, cellH, xHeight: {top,bottom}, rows: [{ name, cells: [{ left,right,top,bottom } | null] }] }]
# Block and box-drawing characters are left out: a terminal draws those itself, cell-exact, so
# they have no font ink to measure. Everything else is drawn by the font, as a terminal does.
param([string]$In, [string]$Out)
Add-Type -AssemblyName System.Drawing
$spec = Get-Content -Raw -Encoding UTF8 $In | ConvertFrom-Json
$fmt = [System.Drawing.StringFormat]::GenericTypographic
$result = @()

foreach ($name in $spec.fonts) {
  $family = $null
  try { $family = New-Object System.Drawing.FontFamily($name) } catch { continue }
  foreach ($px in $spec.sizes) {
    $font = New-Object System.Drawing.Font($family, $px, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $probe = New-Object System.Drawing.Bitmap 8, 8
    $pg = [System.Drawing.Graphics]::FromImage($probe)
    $pg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $cellW = [int][Math]::Round($pg.MeasureString(('M' * 40), $font, 9999, $fmt).Width / 40)
    $cellH = [int][Math]::Ceiling($font.GetHeight($pg)) + 2
    $pg.Dispose(); $probe.Dispose()

    function InkOf([string]$text, [int]$cells) {
      $bmp = New-Object System.Drawing.Bitmap ($cells * $cellW + 8), ($cellH + 8)
      $g = [System.Drawing.Graphics]::FromImage($bmp); $g.Clear([System.Drawing.Color]::Black)
      $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
      for ($i = 0; $i -lt $text.Length; $i++) {
        $code = [int]$text[$i]
        if (($code -ge 0x2500 -and $code -le 0x259F) -or $code -eq 0xA0) { continue }
        $g.DrawString([string]$text[$i], $font, [System.Drawing.Brushes]::White, 4 + $i * $cellW, 4, $fmt)
      }
      $found = @()
      for ($i = 0; $i -lt $text.Length; $i++) {
        $l = $null; $r = $null; $t = $null; $b = $null
        for ($x = 4 + $i * $cellW; $x -lt 4 + ($i + 1) * $cellW; $x++) {
          for ($y = 0; $y -lt $bmp.Height; $y++) {
            if ($bmp.GetPixel($x, $y).R -gt 96) {
              if ($null -eq $l -or $x -lt $l) { $l = $x }; if ($null -eq $r -or $x -gt $r) { $r = $x }
              if ($null -eq $t -or $y -lt $t) { $t = $y }; if ($null -eq $b -or $y -gt $b) { $b = $y }
            }
          }
        }
        if ($null -eq $l) { $found += $null } else { $found += [pscustomobject]@{ left = $l - 4 - $i * $cellW; right = $r - 4 - $i * $cellW; top = $t - 4; bottom = $b - 4 } }
      }
      $g.Dispose(); $bmp.Dispose()
      return , $found
    }

    $xh = InkOf 'xzvn' 4
    $entry = [pscustomobject]@{
      font = $name; px = $px; cellW = $cellW; cellH = $cellH
      xHeight = [pscustomobject]@{ top = ($xh | ForEach-Object { $_.top } | Measure-Object -Minimum).Minimum; bottom = ($xh | ForEach-Object { $_.bottom } | Measure-Object -Maximum).Maximum }
      rows = @()
    }
    foreach ($row in $spec.rows) {
      $text = -join ($row.cells | ForEach-Object { $_.ch })
      $entry.rows += [pscustomobject]@{ name = $row.name; cells = (InkOf $text $row.cells.Count) }
    }
    $result += $entry
  }
}
$result | ConvertTo-Json -Depth 8 -Compress | Out-File -Encoding utf8 $Out
