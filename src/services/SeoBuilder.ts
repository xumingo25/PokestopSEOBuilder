import type { ColumnMap, EnrichedProduct, ProductInput, ProductRow, SeoOutput } from '../domain/Product';
import { readMappedValue } from './ColumnMapper';
import { parseHtmlDescription, truncateAtWord } from './DescriptionParser';

export function createProductInput(row: ProductRow, sourceIndex: number, columnMap: ColumnMap): ProductInput {
  return {
    row,
    sourceIndex,
    name: readMappedValue(row, columnMap.name),
    descriptionHtml: readMappedValue(row, columnMap.description),
    sku: readMappedValue(row, columnMap.sku),
    brand: readMappedValue(row, columnMap.brand),
    category: readMappedValue(row, columnMap.category),
    tags: readMappedValue(row, columnMap.tags),
    price: readMappedValue(row, columnMap.price)
  };
}

export function buildSeo(product: ProductInput): SeoOutput {
  const parsed = parseHtmlDescription(product.descriptionHtml);
  const focusKeyword = buildFocusKeyword(product);
  const seoTitle = truncateAtWord([product.name, product.brand].filter(Boolean).join(' | '), 60);
  const metaSource = parsed.summary || [product.name, product.category, product.brand].filter(Boolean).join(' ');

  return {
    seoTitle: seoTitle || product.name || 'Producto Pokestop',
    metaDescription: truncateAtWord(metaSource, 155),
    slug: slugify([product.name, product.sku].filter(Boolean).join(' ')),
    cleanDescription: parsed.cleanText,
    shortDescription: parsed.summary,
    focusKeyword
  };
}

export function enrichProducts(rows: ProductRow[], columnMap: ColumnMap): EnrichedProduct[] {
  return rows.map((row, index) => {
    const product = createProductInput(row, index, columnMap);

    return {
      ...product,
      seo: buildSeo(product)
    };
  });
}

export function toExportRows(products: EnrichedProduct[]): ProductRow[] {
  return products.map((product) => ({
    ...product.row,
    seo_title: product.seo.seoTitle,
    seo_meta_description: product.seo.metaDescription,
    seo_slug: product.seo.slug,
    seo_focus_keyword: product.seo.focusKeyword,
    descripcion_limpia: product.seo.cleanDescription,
    descripcion_corta: product.seo.shortDescription
  }));
}

function buildFocusKeyword(product: ProductInput): string {
  return [product.name, product.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
