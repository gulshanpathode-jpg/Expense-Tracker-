import ExcelJS from 'exceljs';
import { Response } from 'express';

export type ColumnType = 'text' | 'number' | 'money' | 'percent' | 'date';

export type ReportColumn = {
  header: string;
  key: string;
  width?: number;
  type?: ColumnType;
};

export interface ReportMeta {
  title: string;
  subtitle?: string;
  generatedAt?: Date;
  // Values for a bold totals row, keyed by column key. The first text column
  // gets a "TOTAL" label automatically if not provided.
  totals?: Record<string, unknown>;
}

// Indian-grouped currency (lakh/crore) and percent formats.
const MONEY_FMT = '"₹"#,##,##0.00';
const NUMBER_FMT = '#,##0';
const PERCENT_FMT = '0.0"%"';

function excelFormat(type: ColumnType | undefined): string | undefined {
  if (type === 'money') return MONEY_FMT;
  if (type === 'number') return NUMBER_FMT;
  if (type === 'percent') return PERCENT_FMT;
  return undefined;
}

export async function sendExport(
  res: Response,
  format: string | undefined,
  filenameBase: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  meta?: ReportMeta,
) {
  if (format === 'csv') {
    return sendCsv(res, filenameBase, columns, rows, meta);
  }
  return sendXlsx(res, filenameBase, columns, rows, meta);
}

function sendCsv(
  res: Response,
  filenameBase: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  meta?: ReportMeta,
) {
  const lines: string[] = [];
  if (meta?.title) lines.push(csvEscape(meta.title));
  if (meta?.subtitle) lines.push(csvEscape(meta.subtitle));
  lines.push(csvEscape(`Generated: ${(meta?.generatedAt ?? new Date()).toISOString().slice(0, 19).replace('T', ' ')}`));
  if (meta?.title || meta?.subtitle) lines.push('');

  lines.push(columns.map((c) => csvEscape(c.header)).join(','));
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(formatCsvValue(row[c.key], c.type))).join(','));
  }

  if (meta?.totals) {
    const totals = buildTotalsRow(columns, meta.totals);
    lines.push(columns.map((c) => csvEscape(formatCsvValue(totals[c.key], c.type))).join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
  res.send(lines.join('\n'));
}

async function sendXlsx(
  res: Response,
  filenameBase: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  meta?: ReportMeta,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Engage360 Expense Management';
  workbook.created = meta?.generatedAt ?? new Date();
  const sheet = workbook.addWorksheet('Report', {
    views: [{ state: 'frozen', ySplit: meta?.title ? 4 : 1 }],
  });

  const lastCol = columns.length;
  const colLetter = (n: number) => sheet.getColumn(n).letter;

  let headerRowIdx = 1;
  if (meta?.title) {
    // Title band.
    sheet.mergeCells(1, 1, 1, lastCol);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = meta.title;
    titleCell.font = { bold: true, size: 15, color: { argb: 'FF1E293B' } };

    sheet.mergeCells(2, 1, 2, lastCol);
    const subCell = sheet.getCell(2, 1);
    const gen = (meta.generatedAt ?? new Date()).toLocaleString('en-IN');
    subCell.value = [meta.subtitle, `Generated ${gen}`].filter(Boolean).join('   •   ');
    subCell.font = { size: 10, color: { argb: 'FF64748B' } };

    sheet.getRow(3).height = 4;
    headerRowIdx = 4;
  }

  // Column definitions (width) — keys drive row mapping.
  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width ?? 18 }));

  // Header row.
  const headerRow = sheet.getRow(headerRowIdx);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    cell.alignment = { vertical: 'middle', horizontal: alignFor(c.type) };
  });
  headerRow.height = 18;

  // Data rows.
  rows.forEach((row) => {
    const added = sheet.addRow(row);
    columns.forEach((c, i) => {
      const cell = added.getCell(i + 1);
      const fmt = excelFormat(c.type);
      if (fmt) cell.numFmt = fmt;
      cell.alignment = { horizontal: alignFor(c.type) };
    });
  });

  // Totals row.
  if (meta?.totals) {
    const totals = buildTotalsRow(columns, meta.totals);
    const totalRow = sheet.addRow(totals);
    columns.forEach((c, i) => {
      const cell = totalRow.getCell(i + 1);
      const fmt = excelFormat(c.type);
      if (fmt) cell.numFmt = fmt;
      cell.font = { bold: true };
      cell.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } };
      cell.alignment = { horizontal: alignFor(c.type) };
    });
  }

  // Auto-filter over the data table.
  const lastRow = headerRowIdx + rows.length;
  sheet.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: lastRow, column: lastCol },
  };
  void colLetter;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

function alignFor(type: ColumnType | undefined): 'left' | 'right' {
  return type === 'money' || type === 'number' || type === 'percent' ? 'right' : 'left';
}

// Fills a totals row: uses provided totals, and labels the first text column
// "TOTAL" when that column has no explicit total.
function buildTotalsRow(columns: ReportColumn[], totals: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...totals };
  const firstText = columns.find((c) => !c.type || c.type === 'text' || c.type === 'date');
  if (firstText && out[firstText.key] == null) out[firstText.key] = 'TOTAL';
  return out;
}

// Rounds numeric CSV cells by column type so exports don't carry float noise.
function formatCsvValue(value: unknown, type: ColumnType | undefined): unknown {
  if (typeof value !== 'number') return value;
  if (type === 'money') return value.toFixed(2);
  if (type === 'number') return Math.round(value);
  if (type === 'percent') return Number(value.toFixed(1));
  return value;
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
