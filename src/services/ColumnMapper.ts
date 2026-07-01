import type { ColumnMap } from '../domain/Product';

const columnAliases: Record<keyof ColumnMap, string[]> = {
  name: ['nombre', 'name', 'producto', 'titulo', 'title'],
  description: ['descripcion', 'description', 'body html', 'html', 'detalle'],
  sku: ['sku', 'codigo', 'barcode', 'mpn'],
  brand: ['marca', 'brand', 'vendor', 'fabricante'],
  category: ['categoria', 'category', 'categories', 'rubro'],
  tags: ['tags', 'etiquetas', 'keywords', 'palabras clave'],
  price: ['precio', 'price', 'precio normal', 'variant price']
};

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function detectColumnMap(headers: string[]): ColumnMap {
  const normalized = headers.map((header) => ({ original: header, normalized: normalizeHeader(header) }));
  const map: ColumnMap = {};

  for (const key of Object.keys(columnAliases) as Array<keyof ColumnMap>) {
    const aliases = columnAliases[key].map(normalizeHeader);
    const exactMatch = normalized.find((header) => aliases.includes(header.normalized));
    const partialMatch = normalized.find((header) => aliases.some((alias) => header.normalized.includes(alias)));
    map[key] = exactMatch?.original ?? partialMatch?.original;
  }

  return map;
}

export function readMappedValue(row: Record<string, string>, column?: string): string {
  if (!column) {
    return '';
  }

  return row[column]?.trim() ?? '';
}
