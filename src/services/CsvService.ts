import type { ImportResult, ProductRow } from '../domain/Product';
import { detectColumnMap } from './ColumnMapper';

export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
  const options: Array<',' | ';' | '\t'> = [',', ';', '\t'];

  return options
    .map((delimiter) => ({ delimiter, score: sample.split(delimiter).length }))
    .sort((a, b) => b.score - a.score)[0].delimiter;
}

export function parseDelimited(text: string, delimiter = detectDelimiter(text)): ProductRow[] {
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && next === '"' && inQuotes) {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [headers = [], ...dataRows] = rows.filter((items) => items.some((value) => value.trim().length > 0));
  const cleanHeaders = headers.map((header) => header.trim());

  return dataRows.map((items) => {
    return cleanHeaders.reduce<ProductRow>((acc, header, index) => {
      acc[header] = items[index]?.trim() ?? '';
      return acc;
    }, {});
  });
}

export async function importCsvFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  const delimiter = detectDelimiter(text);
  const rows = parseDelimited(text, delimiter);
  const headers = rows[0] ? Object.keys(rows[0]) : [];

  return {
    fileName: file.name,
    delimiter,
    headers,
    rows,
    columnMap: detectColumnMap(headers)
  };
}

function escapeCell(value: string): string {
  const normalized = value.replace(/\r?\n/g, ' ').trim();

  if (/[",;\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

export function toCsv(rows: ProductRow[]): string {
  const headers = Array.from(rows.reduce<Set<string>>((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));

  const lines = [headers.map(escapeCell).join(',')];

  rows.forEach((row) => {
    lines.push(headers.map((header) => escapeCell(row[header] ?? '')).join(','));
  });

  return lines.join('\n');
}
