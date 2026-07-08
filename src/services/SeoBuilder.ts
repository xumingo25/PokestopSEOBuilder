import type { ColumnMap, EnrichedProduct, ProductInput, ProductRow, ProductSuggestion } from '../domain/Product';
import { readMappedValue } from './ColumnMapper';
import { buildEmptySuggestion } from './SuggestionBuilder';

const fallbackSeoTitleColumn = 'Titulo SEO';
const fallbackSeoDescriptionColumn = 'Descripcion SEO';
const fallbackDescriptionColumn = 'Descripcion';

export function createProductInput(row: ProductRow, sourceIndex: number, columnMap: ColumnMap): ProductInput {
  const currentDescription = readMappedValue(row, columnMap.description);

  return {
    row,
    sourceIndex,
    name: readMappedValue(row, columnMap.name),
    descriptionHtml: currentDescription,
    sku: readMappedValue(row, columnMap.sku),
    brand: readMappedValue(row, columnMap.brand),
    category: readMappedValue(row, columnMap.category),
    tags: readMappedValue(row, columnMap.tags),
    price: readMappedValue(row, columnMap.price),
    currentSeoTitle: readMappedValue(row, columnMap.seoTitle),
    currentSeoDescription: readMappedValue(row, columnMap.seoDescription),
    currentDescription
  };
}

export function enrichProducts(rows: ProductRow[], columnMap: ColumnMap): EnrichedProduct[] {
  return rows.map((row, index) => {
    const product = createProductInput(row, index, columnMap);

    return {
      ...product,
      suggestion: buildEmptySuggestion(product)
    };
  });
}

export function withSuggestion(product: EnrichedProduct, suggestion: ProductSuggestion): EnrichedProduct {
  return {
    ...product,
    suggestion
  };
}

export function toExportRows(
  products: EnrichedProduct[],
  updatedSeoIndexes: number[],
  updatedDescriptionIndexes: number[],
  columnMap: ColumnMap
): ProductRow[] {
  const updatedSeoSet = new Set(updatedSeoIndexes);
  const updatedDescriptionSet = new Set(updatedDescriptionIndexes);
  const seoTitleColumn = columnMap.seoTitle ?? fallbackSeoTitleColumn;
  const seoDescriptionColumn = columnMap.seoDescription ?? fallbackSeoDescriptionColumn;
  const descriptionColumn = columnMap.description ?? fallbackDescriptionColumn;

  return products.map((product) => {
    const hasSeoSuggestion = hasSeoSuggestionValues(product);
    const hasDescriptionSuggestion = hasDescriptionSuggestionValue(product);
    const isSeoContentReady = isCurrentSeoReady(product);
    const isDescriptionContentReady = isCurrentDescriptionReady(product);
    const isSeoMarkedUpdated = updatedSeoSet.has(product.sourceIndex) || isSeoContentReady;
    const isDescriptionMarkedUpdated = updatedDescriptionSet.has(product.sourceIndex) || isDescriptionContentReady;
    const isSeoUpdated = isSeoMarkedUpdated && hasSeoSuggestion;
    const isDescriptionUpdated = isDescriptionMarkedUpdated && hasDescriptionSuggestion;
    const row: ProductRow = { ...product.row };

    if (isSeoUpdated) {
      row[seoTitleColumn] = product.suggestion.suggestedSeoTitle;
      row[seoDescriptionColumn] = product.suggestion.suggestedSeoDescription;
    }

    if (isDescriptionUpdated) {
      row[descriptionColumn] = product.suggestion.improvedDescriptionHtml;
    }

    return row;
  });
}

function isCurrentSeoReady(product: EnrichedProduct): boolean {
  if (!hasSeoSuggestionValues(product)) {
    return false;
  }

  return normalizeComparableValue(product.currentSeoTitle) === normalizeComparableValue(product.suggestion.suggestedSeoTitle)
    && normalizeComparableValue(product.currentSeoDescription) === normalizeComparableValue(product.suggestion.suggestedSeoDescription);
}

function isCurrentDescriptionReady(product: EnrichedProduct): boolean {
  if (!hasDescriptionSuggestionValue(product)) {
    return false;
  }

  return normalizeComparableValue(product.currentDescription) === normalizeComparableValue(product.suggestion.improvedDescriptionHtml);
}

function normalizeComparableValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function hasSeoSuggestionValues(product: EnrichedProduct): boolean {
  return Boolean(product.suggestion.suggestedSeoTitle || product.suggestion.suggestedSeoDescription);
}

export function hasDescriptionSuggestionValue(product: EnrichedProduct): boolean {
  return Boolean(product.suggestion.improvedDescriptionHtml);
}

