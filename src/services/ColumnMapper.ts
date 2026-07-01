import type { ColumnMap } from '../domain/Product';

const columnAliases: Record<keyof ColumnMap, string[]> = {
  name: ['nombre', 'name', 'producto', 'titulo', 'title'],
  description: ['descripcion', 'description', 'body html', 'html', 'detalle'],
  sku: ['sku', 'codigo', 'barcode', 'mpn'],
  brand: ['marca', 'brand', 'vendor', 'fabricante'],
  category: ['categoria', 'category', 'categories', 'rubro'],
  tags: ['tags', 'etiquetas', 'keywords', 'palabras clave'],
  price: ['precio', 'price', 'precio normal', 'variant price'],
  seoTitle: [
    'titulo seo',
    'titulo para seo',
    'titulo de seo',
    'seo titulo',
    'seo title',
    'title seo',
    'meta title',
    'meta titulo',
    'meta titulo seo',
    'titulo para buscadores',
    'titulo en buscadores',
    'titulo de buscadores'
  ],
  seoDescription: [
    'descripcion seo',
    'descripcion para seo',
    'descripcion de seo',
    'seo descripcion',
    'seo description',
    'description seo',
    'meta description',
    'meta descripcion',
    'meta descripcion seo',
    'descripcion para buscadores',
    'descripcion en buscadores',
    'descripcion de buscadores'
  ]
};

interface NormalizedHeader {
  original: string;
  normalized: string;
  tokens: string[];
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_:/().,-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectColumnMap(headers: string[]): ColumnMap {
  const normalized = headers.map((header) => {
    const normalizedHeader = normalizeHeader(header);

    return {
      original: header,
      normalized: normalizedHeader,
      tokens: normalizedHeader.split(' ').filter(Boolean)
    };
  });

  return {
    name: detectGenericColumn(normalized, 'name'),
    description: detectGenericColumn(normalized, 'description'),
    sku: detectGenericColumn(normalized, 'sku'),
    brand: detectGenericColumn(normalized, 'brand'),
    category: detectGenericColumn(normalized, 'category'),
    tags: detectGenericColumn(normalized, 'tags'),
    price: detectGenericColumn(normalized, 'price'),
    seoTitle: detectSeoTitleColumn(normalized),
    seoDescription: detectSeoDescriptionColumn(normalized)
  };
}

export function readMappedValue(row: Record<string, string>, column?: string): string {
  if (!column) {
    return '';
  }

  return row[column]?.trim() ?? '';
}

function detectGenericColumn(headers: NormalizedHeader[], key: keyof ColumnMap): string | undefined {
  const aliases = columnAliases[key].map(normalizeHeader);
  const candidates = headers.filter((header) => isAllowedCandidate(key, header));
  const exactMatch = candidates.find((header) => aliases.includes(header.normalized));
  const partialMatch = candidates.find((header) => aliases.some((alias) => header.normalized.includes(alias)));

  return exactMatch?.original ?? partialMatch?.original;
}

function detectSeoTitleColumn(headers: NormalizedHeader[]): string | undefined {
  return detectGenericColumn(headers, 'seoTitle') ?? headers.find((header) => {
    const hasSeoSignal = hasAnyToken(header, ['seo', 'meta', 'buscadores', 'buscador']);
    const hasTitleSignal = hasAnyToken(header, ['titulo', 'title']);
    const hasDescriptionSignal = hasAnyToken(header, ['descripcion', 'description', 'desc']);

    return hasSeoSignal && hasTitleSignal && !hasDescriptionSignal;
  })?.original;
}

function detectSeoDescriptionColumn(headers: NormalizedHeader[]): string | undefined {
  return detectGenericColumn(headers, 'seoDescription') ?? headers.find((header) => {
    const hasSeoSignal = hasAnyToken(header, ['seo', 'meta', 'buscadores', 'buscador']);
    const hasDescriptionSignal = hasAnyToken(header, ['descripcion', 'description', 'desc']);

    return hasSeoSignal && hasDescriptionSignal;
  })?.original;
}

function isAllowedCandidate(key: keyof ColumnMap, header: NormalizedHeader): boolean {
  if (key === 'description') {
    return !hasAnyToken(header, ['seo', 'meta', 'buscadores', 'buscador']);
  }

  if (key === 'name') {
    return !hasAnyToken(header, ['seo', 'meta', 'buscadores', 'buscador']);
  }

  return true;
}

function hasAnyToken(header: NormalizedHeader, tokens: string[]): boolean {
  return tokens.some((token) => header.tokens.includes(token));
}
