export type ProductRow = Record<string, string>;

export type CardMatchStatus = 'pending' | 'searching' | 'found' | 'ambiguous' | 'not_found' | 'error';

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

export interface ParsedCardIdentity {
  rawName: string;
  normalizedName: string;
  localId: string;
  localNumber: string;
  localPrefix: string;
  expansionHints: string[];
  setTotal?: number;
}

export interface CardMatch {
  status: CardMatchStatus;
  tcgdexId: string;
  cardName: string;
  setName: string;
  localId: string;
  confidence: number;
  reason: string;
  error?: string;
}

export interface ProductSuggestion {
  suggestedSeoTitle: string;
  suggestedSeoDescription: string;
  improvedDescriptionHtml: string;
  suggestedCategories: string[];
  focusKeyword: string;
  match: CardMatch;
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
