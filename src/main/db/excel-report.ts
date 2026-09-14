import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const COLUMN_WIDTHS = [16, 18, 14, 20, 10, 18, 18, 18, 14, 16, 16, 12, 16, 16, 22] as const;

export function buildExcelAutomationScript(): string {
  return String.raw`
$ErrorActionPreference = "Stop"
$source = $env:PORTUS_XLSX_SOURCE
$destination = $env:PORTUS_XLSX_DESTINATION
if (-not $source -or -not $destination) { throw "Caminhos de exportação não informados." }

function Rgb([int]$r, [int]$g, [int]$b) { return $r + (256 * $g) + (65536 * $b) }

$data = Import-Csv -Path $source -Delimiter ';' -Encoding UTF8
$headers = @("Lote","Produto","Operador","Abertura do Lote","Sessão","Início Sessão","Fim Sessão","Status Sessão","Setor","Responsável","Equipamento","Slot","Valor Bruto","Valor Numérico","Capturado em")
$widths = @(${COLUMN_WIDTHS.join(",")})

$excel = $null
$workbook = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Add()
  $sheet = $workbook.Worksheets.Item(1)
  $sheet.Name = "Relatório"

  for ($column = 1; $column -le $headers.Count; $column++) {
    $sheet.Cells.Item(1, $column) = $headers[$column - 1]
    $sheet.Columns.Item($column).ColumnWidth = $widths[$column - 1]
  }

  $row = 2
  foreach ($item in $data) {
    for ($column = 1; $column -le $headers.Count; $column++) {
      $sheet.Cells.Item($row, $column) = [string]$item.($headers[$column - 1])
    }
    $row++
  }

  $lastRow = [Math]::Max(1, $row - 1)
  $header = $sheet.Range("A1:O1")
  $header.Font.Bold = $true
  $header.Font.Color = Rgb 255 255 255
  $header.Interior.Color = Rgb 17 18 21
  $header.HorizontalAlignment = -4108
  $header.VerticalAlignment = -4108
  $sheet.Rows.Item(1).RowHeight = 22

  $used = $sheet.Range("A1:O$lastRow")
  $used.VerticalAlignment = -4108
  $used.AutoFilter()

  $sheet.Activate()
  $excel.ActiveWindow.SplitRow = 1
  $excel.ActiveWindow.FreezePanes = $true

  $workbook.SaveAs($destination, 51)
} finally {
  if ($workbook) { $workbook.Close($false) }
  if ($excel) { $excel.Quit() }
  if ($sheet) { [Runtime.InteropServices.Marshal]::ReleaseComObject($sheet) | Out-Null }
  if ($workbook) { [Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) | Out-Null }
  if ($excel) { [Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;
}

export function writeFormattedXlsx(filePath: string, csvContent: string): void {
  if (process.platform !== "win32") {
    throw new Error("A exportação XLSX formatada está disponível somente no Windows.");
  }

  const directory = mkdtempSync(join(tmpdir(), "portus-xlsx-"));
  const source = join(directory, "report.csv");
  writeFileSync(source, "﻿" + csvContent, "utf8");

  try {
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", buildExcelAutomationScript()],
      {
        windowsHide: true,
        stdio: "pipe",
        env: {
          ...process.env,
          PORTUS_XLSX_SOURCE: source,
          PORTUS_XLSX_DESTINATION: filePath
        }
      }
    );
  } catch (error) {
    throw new Error(`Não foi possível gerar o XLSX formatado. Verifique se o Microsoft Excel está instalado. ${String(error)}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
