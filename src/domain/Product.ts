export type ProductRow = Record<string, string>;

export interface ColumnMap {
  name?: string;
  description?: string;
  sku?: string;
  brand?: string;
  category?: string;
  tags?: string;
  price?: string;
  seoTitle?: string;
  seoDescription?: string;
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
  currentSeoTitle: string;
  currentSeoDescription: string;
  currentDescription: string;
}

export interface ProductSuggestion {
  suggestedSeoTitle: string;
  suggestedSeoDescription: string;
  improvedDescriptionHtml: string;
  focusKeyword: string;
}

export interface EnrichedProduct extends ProductInput {
  suggestion: ProductSuggestion;
}

export interface ImportResult {
  fileName: string;
  delimiter: ',' | ';' | '\t';
  encoding: string;
  headers: string[];
  rows: ProductRow[];
  columnMap: ColumnMap;
}
