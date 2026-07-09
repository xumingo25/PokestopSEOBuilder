import type { ImportResult, ProductRow } from '../domain/Product';
import { detectColumnMap } from './ColumnMapper';

const supportedEncodings = ['utf-8', 'windows-1252', 'iso-8859-1'] as const;

interface DecodedText {
  text: string;
  encoding: string;
}

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
  const cleanHeaders = headers.map((header) => header.trim().replace(/^\uFEFF/, ''));

  return dataRows.map((items) => {
    return cleanHeaders.reduce<ProductRow>((acc, header, index) => {
      acc[header] = items[index]?.trim() ?? '';
      return acc;
    }, {});
  });
}

export async function importCsvFile(file: File): Promise<ImportResult> {
  const decoded = await readFileText(file);
  const delimiter = detectDelimiter(decoded.text);
  const rows = parseDelimited(decoded.text, delimiter);
  const headers = rows[0] ? Object.keys(rows[0]) : [];

  return {
    fileName: file.name,
    delimiter,
    encoding: decoded.encoding,
    headers,
    rows,
    columnMap: detectColumnMap(headers)
  };
}

async function readFileText(file: File): Promise<DecodedText> {
  const buffer = await file.arrayBuffer();
  const candidates = supportedEncodings.map((encoding) => decodeBuffer(buffer, encoding));

  return candidates.sort((a, b) => scoreDecodedText(a.text) - scoreDecodedText(b.text))[0];
}

function decodeBuffer(buffer: ArrayBuffer, encoding: string): DecodedText {
  try {
    const decoder = new TextDecoder(encoding, { fatal: encoding === 'utf-8' });
    return { text: decoder.decode(buffer), encoding };
  } catch {
    const decoder = new TextDecoder(encoding);
    return { text: decoder.decode(buffer), encoding: encoding + ' fallback' };
  }
}

function scoreDecodedText(text: string): number {
  const replacementCharacters = (text.match(/\uFFFD/g) ?? []).length;
  const mojibakeSignals = (text.match(/\u00C3|\u00C2|\u00E2\u20AC|\u00E2\u0080/g) ?? []).length;
  const likelySpanishChars = (text.match(/[\u00E1\u00E9\u00ED\u00F3\u00FA\u00C1\u00C9\u00CD\u00D3\u00DA\u00F1\u00D1\u00FC\u00DC]/g) ?? []).length;

  return replacementCharacters * 100 + mojibakeSignals * 25 - likelySpanishChars;
}

function escapeCell(value: string, delimiter: ',' | ';' | '\t'): string {
  const normalized = value.replace(/\r?\n/g, ' ').trim();

  if (shouldQuoteCell(normalized, delimiter)) {
    return '"' + normalized.replace(/"/g, '""') + '"';
  }

  return normalized;
}

function shouldQuoteCell(value: string, delimiter: ',' | ';' | '\t'): boolean {
  return value.includes('"')
    || value.includes('\n')
    || value.includes('\r')
    || value.includes(delimiter);
}

export function toCsv(rows: ProductRow[], delimiter: ',' | ';' | '\t' = ','): string {
  const headers = Array.from(rows.reduce<Set<string>>((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));

  const lines = [headers.map((header) => escapeCell(header, delimiter)).join(delimiter)];

  rows.forEach((row) => {
    lines.push(headers.map((header) => escapeCell(row[header] ?? '', delimiter)).join(delimiter));
  });

  return lines.join('\n');
}
