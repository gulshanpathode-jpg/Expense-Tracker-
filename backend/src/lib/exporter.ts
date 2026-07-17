import ExcelJS from 'exceljs';
import { Response } from 'express';

export type ReportColumn = { header: string; key: string; width?: number };

export async function sendExport(
  res: Response,
  format: string | undefined,
  filenameBase: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
) {
  if (format === 'csv') {
    const header = columns.map((c) => csvEscape(c.header)).join(',');
    const lines = rows.map((row) => columns.map((c) => csvEscape(row[c.key])).join(','));
    const csv = [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
    return res.send(csv);
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Report');
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
