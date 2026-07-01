export type ProductRow = Record<string, string>;

export interface ColumnMap {
  name?: string;
  description?: string;
  sku?: string;
  brand?: string;
  category?: string;
  tags?: string;
  price?: string;
}

export interface ProductInput {
  row: ProductRow;
  sourceIndex: number;
  name: string;
  descriptionHtml: string;
  sku: string;
  brand: string;
  category: string;
  tags: string;
  price: string;
}

export interface SeoOutput {
  seoTitle: string;
  metaDescription: string;
  slug: string;
  cleanDescription: string;
  shortDescription: string;
  focusKeyword: string;
}

export interface EnrichedProduct extends ProductInput {
  seo: SeoOutput;
}

export interface ImportResult {
  fileName: string;
  delimiter: ',' | ';' | '\t';
  encoding: string;
  headers: string[];
  rows: ProductRow[];
  columnMap: ColumnMap;
}
